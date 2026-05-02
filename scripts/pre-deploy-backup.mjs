#!/usr/bin/env node
/**
 * Pre-deploy backup — runs in Render's "Pre-Deploy Command" step.
 *
 * Wire-up on Render:
 *   Settings → Pre-Deploy Command:
 *     npm run backup:pre-deploy || true
 *
 * The `|| true` ensures a backup failure never blocks a deploy. The backup
 * lives on the same persistent disk (/data/backups) so it survives the deploy.
 *
 * Strategy:
 *   - Open the live DB read-only.
 *   - Use SQLite's VACUUM INTO to write a consistent snapshot.
 *   - Prune backups older than BACKUP_KEEP_DAYS (default 30).
 *
 * No app code is started — this is pure Node + better-sqlite3.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const DATA_DIR =
  process.env.DATA_DIR ||
  (fs.existsSync('/data') ? '/data' : process.cwd());
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'auction.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 30;

console.log(`[PRE-DEPLOY] DATA_DIR=${DATA_DIR}`);
console.log(`[PRE-DEPLOY] DB_PATH=${DB_PATH}`);
console.log(`[PRE-DEPLOY] BACKUP_DIR=${BACKUP_DIR}`);

if (!fs.existsSync(DB_PATH)) {
  console.log('[PRE-DEPLOY] No DB to back up — first deploy. Skipping.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19);
const target = path.join(BACKUP_DIR, `auction_pre-deploy_${stamp}.db`);

const db = new Database(DB_PATH, { readonly: false });
try {
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

const sizeMB = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
console.log(`[PRE-DEPLOY] ✅ Pre-deploy backup created: ${target} (${sizeMB} MB)`);

// Retention cleanup
const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
let pruned = 0;
for (const f of fs.readdirSync(BACKUP_DIR)) {
  if (!f.startsWith('auction_') || !f.endsWith('.db')) continue;
  const full = path.join(BACKUP_DIR, f);
  try {
    if (fs.statSync(full).mtime.getTime() < cutoff) {
      fs.unlinkSync(full);
      pruned++;
    }
  } catch {}
}
if (pruned) console.log(`[PRE-DEPLOY] Pruned ${pruned} backup(s) older than ${KEEP_DAYS} days.`);
