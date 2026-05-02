/**
 * Data Safety Module — AutoPro
 *
 * Defense-in-depth protection for the SQLite DB and uploads directory:
 *  - Startup assertion: refuses to boot if DATA_DIR is unsafe in production.
 *  - VACUUM INTO backups: safe even with concurrent writes.
 *  - Daily scheduled backup with retention.
 *  - Backup status reporting for admin endpoints.
 *  - DB integrity check (PRAGMA integrity_check + table sanity).
 *
 * No external services required. Backups live on the same persistent disk
 * (/data/backups). For off-site backups see scripts/backup-to-github.mjs.
 */
import fs from 'fs';
import path from 'path';
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

/**
 * Refuses to boot if the configuration would cause data loss on deploy.
 * In development the assertion is informational only.
 */
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
  console.log('[SAFETY] ────────────────────────────────────────');
}

/**
 * Snapshot the live DB using SQLite's VACUUM INTO.
 * VACUUM INTO is safe with concurrent writers — unlike `cp` of a WAL DB.
 * Returns the absolute path of the new backup file.
 */
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

/**
 * Delete backups older than `keepDays`. Keeps recent files regardless of label.
 * Returns the number of files deleted.
 */
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
 * Schedule a recurring backup. Also runs an immediate boot backup
 * if no backup has been taken in the last 12 hours.
 */
export function scheduleDailyBackup(
  db: Database.Database,
  backupDir: string,
  intervalHours: number = 24,
  keepDays: number = 30,
): void {
  const runOnce = (label: string) => {
    try {
      runVacuumBackup(db, backupDir, label);
      cleanOldBackups(backupDir, keepDays);
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

export interface BackupStatus {
  backupDir: string;
  count: number;
  totalSizeMB: number;
  lastBackup: { name: string; sizeMB: number; mtime: string } | null;
  oldestBackup: { name: string; mtime: string } | null;
  files: Array<{ name: string; sizeMB: number; mtime: string }>;
}

export function getBackupStatus(backupDir: string): BackupStatus {
  if (!fs.existsSync(backupDir)) {
    return {
      backupDir,
      count: 0,
      totalSizeMB: 0,
      lastBackup: null,
      oldestBackup: null,
      files: [],
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

/**
 * Quick DB sanity check used by /api/health and /api/admin/db-status.
 * Returns ok=true only if PRAGMA integrity_check returns 'ok'.
 */
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
