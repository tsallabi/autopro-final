/**
 * Data Safety Module — AutoPro
 *
 * Defense-in-depth protection for the SQLite DB and uploads directory:
 *  - Startup assertion: refuses to boot if DATA_DIR is unsafe in production.
 *  - VACUUM INTO backups: safe even with concurrent writes.
 *  - Daily scheduled backup with retention.
 *  - Backup status reporting for admin endpoints.
 *  - DB integrity check (PRAGMA integrity_check + table sanity).
 *  - Optional off-site upload to a private GitHub repo (AES-256-GCM encrypted).
 *
 * Off-site backup is enabled when these env vars are set:
 *   BACKUP_GITHUB_REPO   = owner/repo (e.g. tsallabi/autopro-db-backups)
 *   BACKUP_GITHUB_TOKEN  = fine-grained PAT with Contents: Read/Write on that repo
 *   BACKUP_GITHUB_BRANCH = branch (default: main)
 *   BACKUP_ENCRYPTION_KEY = 32+ char passphrase (recommended)
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type Database from 'better-sqlite3';

export interface DataSafetyConfig {
  dataDir: string;
  dbPath: string;
  uploadsDir: string;
  backupDir: string;
  isProduction: boolean;
}

export function buildConfig(env: NodeJS.ProcessEnv, projectDir: string): DataSafetyConfig {
  const isProduction = env.NODE_ENV === 'production';
  const dataDir = env.DATA_DIR
    || (fs.existsSync('/data') ? '/data' : projectDir);
  return {
    dataDir,
    dbPath: env.DB_PATH || path.join(dataDir, 'auction.db'),
    uploadsDir: env.UPLOADS_DIR || path.join(dataDir, 'uploads'),
    backupDir: env.BACKUP_DIR || path.join(dataDir, 'backups'),
    isProduction,
  };
}

export function assertDataSafe(cfg: DataSafetyConfig, projectDir: string): void {
  console.log('[SAFETY] ────────────────────────────────────────');
  console.log('[SAFETY] Verifying data directory configuration:');
  console.log(`[SAFETY]   NODE_ENV   = ${cfg.isProduction ? 'production' : 'development'}`);
  console.log(`[SAFETY]   DATA_DIR   = ${cfg.dataDir}`);
  console.log(`[SAFETY]   DB_PATH    = ${cfg.dbPath}`);
  console.log(`[SAFETY]   UPLOADS    = ${cfg.uploadsDir}`);
  console.log(`[SAFETY]   BACKUP_DIR = ${cfg.backupDir}`);

  const resolvedData = path.resolve(cfg.dataDir);
  const resolvedProject = path.resolve(projectDir);
  const dataIsInsideProject =
    resolvedData === resolvedProject ||
    resolvedData.startsWith(resolvedProject + path.sep);

  if (cfg.isProduction) {
    if (dataIsInsideProject) {
      console.error('[SAFETY][FATAL] DATA_DIR is inside the project directory in PRODUCTION.');
      console.error('[SAFETY][FATAL] This means EVERY deploy will WIPE the database and uploads.');
      console.error('[SAFETY][FATAL] Set DATA_DIR to a persistent disk path (e.g. /data on Render).');
      process.exit(1);
    }
    try {
      fs.mkdirSync(cfg.dataDir, { recursive: true });
      const probe = path.join(cfg.dataDir, '.write_probe');
      fs.writeFileSync(probe, 'ok');
      fs.unlinkSync(probe);
    } catch (err: any) {
      console.error(`[SAFETY][FATAL] DATA_DIR (${cfg.dataDir}) is not writable: ${err?.message}`);
      process.exit(1);
    }
  } else if (dataIsInsideProject) {
    console.log('[SAFETY] ⚠️  DATA_DIR is inside the project — OK for local dev, fatal in prod.');
  }

  for (const dir of [cfg.uploadsDir, cfg.backupDir]) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }

  if (fs.existsSync(cfg.dbPath)) {
    const stats = fs.statSync(cfg.dbPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`[SAFETY] ✅ DB found: ${sizeMB} MB, mtime=${stats.mtime.toISOString()}`);
  } else {
    console.log(`[SAFETY] ⚠️  No DB at ${cfg.dbPath} — will be created fresh on first connection.`);
  }

  if (process.env.BACKUP_GITHUB_REPO && process.env.BACKUP_GITHUB_TOKEN) {
    const enc = process.env.BACKUP_ENCRYPTION_KEY ? '(AES-256-GCM encrypted)' : '(UNENCRYPTED — set BACKUP_ENCRYPTION_KEY)';
    console.log(`[SAFETY] ✅ Off-site backup enabled: ${process.env.BACKUP_GITHUB_REPO} ${enc}`);
  } else {
    console.log('[SAFETY] ℹ️  Off-site backup disabled (BACKUP_GITHUB_REPO/TOKEN not set).');
  }
  console.log('[SAFETY] ────────────────────────────────────────');
}

export function runVacuumBackup(
  db: Database.Database,
  backupDir: string,
  label: string = 'auto',
): string {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  const target = path.join(backupDir, `auction_${label}_${stamp}.db`);
  const escaped = target.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  const sizeMB = (fs.statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`[BACKUP] ✅ ${label} backup created: ${target} (${sizeMB} MB)`);
  return target;
}

export function cleanOldBackups(backupDir: string, keepDays: number = 30): number {
  if (!fs.existsSync(backupDir)) return 0;
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const file of fs.readdirSync(backupDir)) {
    if (!file.startsWith('auction_') || !file.endsWith('.db')) continue;
    const fullPath = path.join(backupDir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.mtime.getTime() < cutoff) {
        fs.unlinkSync(fullPath);
        deleted++;
      }
    } catch {}
  }
  if (deleted > 0) {
    console.log(`[BACKUP] Cleaned ${deleted} backup(s) older than ${keepDays} days.`);
  }
  return deleted;
}

/**
 * Encrypts (optional) and uploads a backup file to a private GitHub repo.
 * Container format when encrypted: [12-byte IV][16-byte GCM tag][ciphertext].
 *
 * Reads config from process.env. Returns the GitHub blob URL on success,
 * or null when the env vars are not configured (silent skip).
 */
export async function uploadBackupToGitHub(filePath: string): Promise<string | null> {
  const repo = process.env.BACKUP_GITHUB_REPO;
  const token = process.env.BACKUP_GITHUB_TOKEN;
  const branch = process.env.BACKUP_GITHUB_BRANCH || 'main';
  const encKey = process.env.BACKUP_ENCRYPTION_KEY;

  if (!repo || !token) return null;
  if (!fs.existsSync(filePath)) {
    console.error(`[GH-BACKUP][ERROR] File not found: ${filePath}`);
    return null;
  }

  let blob = fs.readFileSync(filePath);
  let remoteName = path.basename(filePath);

  if (encKey) {
    const key = crypto.createHash('sha256').update(encKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(blob), cipher.final()]);
    const tag = cipher.getAuthTag();
    blob = Buffer.concat([iv, tag, ct]);
    remoteName = remoteName + '.enc';
  } else {
    console.warn('[GH-BACKUP] WARNING: uploading UNENCRYPTED. Set BACKUP_ENCRYPTION_KEY for security.');
  }

  const today = new Date().toISOString().slice(0, 10);
  const remotePath = `daily/${today}/${remoteName}`;
  const url = `https://api.github.com/repos/${repo}/contents/${remotePath}`;

  const body = {
    message: `backup: ${remoteName}`,
    branch,
    content: blob.toString('base64'),
  };

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'autopro-backup',
  };

  const sizeMB = (blob.length / 1024 / 1024).toFixed(2);
  console.log(`[GH-BACKUP] Uploading ${remoteName} (${sizeMB} MB) → ${repo}:${remotePath}`);

  const res = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[GH-BACKUP][FAIL] ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    throw new Error(`GitHub upload failed: ${res.status} ${res.statusText}`);
  }
  const data: any = await res.json();
  const htmlUrl = data?.content?.html_url || `https://github.com/${repo}`;
  console.log(`[GH-BACKUP] ✅ Uploaded — ${htmlUrl}`);
  return htmlUrl;
}

export function scheduleDailyBackup(
  db: Database.Database,
  backupDir: string,
  intervalHours: number = 24,
  keepDays: number = 30,
): void {
  const runOnce = async (label: string) => {
    try {
      const file = runVacuumBackup(db, backupDir, label);
      cleanOldBackups(backupDir, keepDays);

      // Off-site upload (silent skip when env vars not set)
      try {
        await uploadBackupToGitHub(file);
      } catch (err: any) {
        console.error(`[GH-BACKUP][ERROR] Upload failed (local backup is intact): ${err?.message || err}`);
      }
    } catch (err: any) {
      console.error(`[BACKUP][ERROR] ${err?.message || err}`);
    }
  };

  const last = getLastBackupTime(backupDir);
  if (!last || Date.now() - last.getTime() > 12 * 60 * 60 * 1000) {
    console.log('[BACKUP] No recent backup — taking boot backup now.');
    runOnce('boot');
  } else {
    console.log(`[BACKUP] Last backup: ${last.toISOString()} (recent — skipping boot backup).`);
  }

  setInterval(() => runOnce('daily'), intervalHours * 60 * 60 * 1000).unref?.();
  console.log(
    `[BACKUP] ✅ Daily backups scheduled every ${intervalHours}h, retention ${keepDays} days.`,
  );
}

export function getLastBackupTime(backupDir: string): Date | null {
  if (!fs.existsSync(backupDir)) return null;
  const candidates = fs
    .readdirSync(backupDir)
    .filter(f => f.startsWith('auction_') && f.endsWith('.db'))
    .map(f => fs.statSync(path.join(backupDir, f)).mtime)
    .sort((a, b) => b.getTime() - a.getTime());
  return candidates[0] || null;
}

export function getLatestBackupPath(backupDir: string): string | null {
  if (!fs.existsSync(backupDir)) return null;
  const files = fs
    .readdirSync(backupDir)
    .filter(f => f.startsWith('auction_') && f.endsWith('.db'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return files[0] ? path.join(backupDir, files[0].name) : null;
}

export interface BackupStatus {
  backupDir: string;
  count: number;
  totalSizeMB: number;
  lastBackup: { name: string; sizeMB: number; mtime: string } | null;
  oldestBackup: { name: string; mtime: string } | null;
  files: Array<{ name: string; sizeMB: number; mtime: string }>;
  offSite: { configured: boolean; encrypted: boolean; repo: string | null };
}

export function getBackupStatus(backupDir: string): BackupStatus {
  const offSite = {
    configured: !!(process.env.BACKUP_GITHUB_REPO && process.env.BACKUP_GITHUB_TOKEN),
    encrypted: !!process.env.BACKUP_ENCRYPTION_KEY,
    repo: process.env.BACKUP_GITHUB_REPO || null,
  };

  if (!fs.existsSync(backupDir)) {
    return {
      backupDir,
      count: 0,
      totalSizeMB: 0,
      lastBackup: null,
      oldestBackup: null,
      files: [],
      offSite,
    };
  }
  const files = fs
    .readdirSync(backupDir)
    .filter(f => f.startsWith('auction_') && f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(backupDir, f));
      return { name: f, size: stat.size, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  return {
    backupDir,
    count: files.length,
    totalSizeMB: +(totalSize / 1024 / 1024).toFixed(2),
    lastBackup: files[0]
      ? {
          name: files[0].name,
          sizeMB: +(files[0].size / 1024 / 1024).toFixed(2),
          mtime: files[0].mtime.toISOString(),
        }
      : null,
    oldestBackup: files[files.length - 1]
      ? {
          name: files[files.length - 1].name,
          mtime: files[files.length - 1].mtime.toISOString(),
        }
      : null,
    files: files.slice(0, 50).map(f => ({
      name: f.name,
      sizeMB: +(f.size / 1024 / 1024).toFixed(2),
      mtime: f.mtime.toISOString(),
    })),
    offSite,
  };
}

export interface DbIntegrityResult {
  ok: boolean;
  result: string;
  tableCount: number;
  userCount?: number;
  carCount?: number;
  invoiceCount?: number;
  bidCount?: number;
}

export function checkDbIntegrity(db: Database.Database): DbIntegrityResult {
  const integrity =
    (db.prepare('PRAGMA integrity_check').get() as any)?.integrity_check ?? 'unknown';
  const tables = db
    .prepare("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'")
    .get() as any;
  const result: DbIntegrityResult = {
    ok: integrity === 'ok',
    result: integrity,
    tableCount: tables?.c || 0,
  };
  try {
    result.userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
  } catch {}
  try {
    result.carCount = (db.prepare('SELECT COUNT(*) as c FROM cars').get() as any).c;
  } catch {}
  try {
    result.invoiceCount = (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any).c;
  } catch {}
  try {
    result.bidCount = (db.prepare('SELECT COUNT(*) as c FROM bids').get() as any).c;
  } catch {}
  return result;
}
