#!/usr/bin/env node
/**
 * Off-site backup — uploads the latest backup file to a private GitHub repo.
 *
 * This is the second line of defense: even if the entire Render service +
 * persistent disk are destroyed, the DB is recoverable from GitHub.
 *
 * Setup (one time):
 *   1) Create a NEW PRIVATE repo on GitHub, e.g. tsallabi/autopro-db-backups.
 *      (DO NOT reuse autopro-final — keep code and data separate.)
 *   2) Create a fine-grained Personal Access Token with "Contents: Read/Write"
 *      scoped to the backup repo only.
 *   3) On Render → Environment, add:
 *        BACKUP_GITHUB_REPO=tsallabi/autopro-db-backups
 *        BACKUP_GITHUB_TOKEN=<the PAT>
 *        BACKUP_GITHUB_BRANCH=main          (optional, default: main)
 *        BACKUP_ENCRYPTION_KEY=<32+ chars>  (optional, AES-256-GCM applied if set)
 *   4) Schedule with a Render Cron Job (separate service):
 *        Schedule: 0 4 * * *   (every day at 04:00)
 *        Command:  node scripts/backup-to-github.mjs
 *
 * Without the env vars set, this script exits 0 with a notice — safe to leave
 * scheduled before configuration is complete.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR =
  process.env.DATA_DIR ||
  (fs.existsSync('/data') ? '/data' : process.cwd());
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');

const REPO = process.env.BACKUP_GITHUB_REPO;
const TOKEN = process.env.BACKUP_GITHUB_TOKEN;
const BRANCH = process.env.BACKUP_GITHUB_BRANCH || 'main';
const ENC_KEY = process.env.BACKUP_ENCRYPTION_KEY;

if (!REPO || !TOKEN) {
  console.log('[GH-BACKUP] BACKUP_GITHUB_REPO/BACKUP_GITHUB_TOKEN not set — skipping.');
  process.exit(0);
}

if (!fs.existsSync(BACKUP_DIR)) {
  console.error(`[GH-BACKUP] No local backup dir at ${BACKUP_DIR}. Nothing to upload.`);
  process.exit(0);
}

const candidates = fs
  .readdirSync(BACKUP_DIR)
  .filter(f => f.startsWith('auction_') && f.endsWith('.db'))
  .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
  .sort((a, b) => b.t.getTime() - a.t.getTime());

if (!candidates.length) {
  console.error('[GH-BACKUP] No backup files found.');
  process.exit(0);
}

const latest = candidates[0].f;
const localPath = path.join(BACKUP_DIR, latest);
let blob = fs.readFileSync(localPath);

let remoteName = latest;
if (ENC_KEY) {
  const key = crypto.createHash('sha256').update(ENC_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(blob), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Container: [12 byte IV][16 byte tag][ciphertext]
  blob = Buffer.concat([iv, tag, ct]);
  remoteName = latest + '.enc';
  console.log(`[GH-BACKUP] Encrypted (AES-256-GCM): ${blob.length} bytes`);
}

const today = new Date().toISOString().slice(0, 10);
const remotePath = `daily/${today}/${remoteName}`;
const url = `https://api.github.com/repos/${REPO}/contents/${remotePath}`;

const body = {
  message: `backup: ${remoteName}`,
  branch: BRANCH,
  content: blob.toString('base64'),
};

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
  'User-Agent': 'autopro-backup',
};

console.log(`[GH-BACKUP] Uploading ${remoteName} (${(blob.length / 1024 / 1024).toFixed(2)} MB) to ${REPO}:${remotePath}`);

const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
if (!res.ok) {
  const text = await res.text();
  console.error(`[GH-BACKUP][FAIL] ${res.status} ${res.statusText}: ${text}`);
  process.exit(1);
}
const data = await res.json();
console.log(`[GH-BACKUP] ✅ Uploaded — sha=${data.content?.sha?.slice(0, 8)} url=${data.content?.html_url}`);
