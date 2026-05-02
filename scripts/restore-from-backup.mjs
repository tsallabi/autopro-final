#!/usr/bin/env node
/**
 * Disaster recovery — restore the live DB from a backup file.
 *
 * Usage on Render shell (or any host with /data mounted):
 *   node scripts/restore-from-backup.mjs                 # interactive: shows list, asks
 *   node scripts/restore-from-backup.mjs --list          # list available backups only
 *   node scripts/restore-from-backup.mjs --latest        # restore the most recent backup
 *   node scripts/restore-from-backup.mjs --file <name>   # restore a specific backup file
 *
 * Safety:
 *   - The current live DB is itself backed up to <backup>_pre-restore_<ts>.db
 *     before being overwritten — if the restore is wrong, run again with the
 *     pre-restore file.
 *   - Refuses to run if the chosen backup is smaller than 1 MB (corruption guard).
 *     Override with --force.
 *   - Stops the WAL and SHM sidecar files so SQLite reopens cleanly.
 *
 * After running this, RESTART the Render service so the app reopens the new DB.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const DATA_DIR =
  process.env.DATA_DIR ||
  (fs.existsSync('/data') ? '/data' : process.cwd());
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'auction.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');

const args = process.argv.slice(2);
const flags = {
  list: args.includes('--list'),
  latest: args.includes('--latest'),
  force: args.includes('--force'),
  file: (() => {
    const i = args.indexOf('--file');
    return i >= 0 ? args[i + 1] : null;
  })(),
};

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('auction_') && f.endsWith('.db'))
    .map(f => {
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);
      return { name: f, full, sizeMB: +(stat.size / 1024 / 1024).toFixed(2), mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

function printList(backups) {
  if (!backups.length) {
    console.log('No backups found in', BACKUP_DIR);
    return;
  }
  console.log(`\nAvailable backups in ${BACKUP_DIR}:`);
  backups.slice(0, 30).forEach((b, i) => {
    console.log(`  [${String(i).padStart(2)}] ${b.mtime.toISOString()}  ${b.sizeMB.toFixed(2).padStart(8)} MB  ${b.name}`);
  });
}

async function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, ans => { rl.close(); resolve(ans); }));
}

async function main() {
  console.log(`[RESTORE] DATA_DIR=${DATA_DIR}`);
  console.log(`[RESTORE] DB_PATH=${DB_PATH}`);
  console.log(`[RESTORE] BACKUP_DIR=${BACKUP_DIR}`);

  const backups = listBackups();

  if (flags.list || backups.length === 0) {
    printList(backups);
    return;
  }

  let chosen = null;
  if (flags.file) {
    chosen = backups.find(b => b.name === flags.file);
    if (!chosen) {
      console.error(`[RESTORE][FATAL] Backup not found: ${flags.file}`);
      printList(backups);
      process.exit(1);
    }
  } else if (flags.latest) {
    chosen = backups[0];
  } else {
    printList(backups);
    const ans = await ask('\nEnter index to restore (or "q" to quit): ');
    if (!/^\d+$/.test(ans)) {
      console.log('Aborted.');
      return;
    }
    chosen = backups[Number(ans)];
    if (!chosen) {
      console.error('Invalid index.');
      process.exit(1);
    }
  }

  if (chosen.sizeMB < 1 && !flags.force) {
    console.error(`[RESTORE][FATAL] Chosen backup is suspiciously small (${chosen.sizeMB} MB). Use --force to override.`);
    process.exit(1);
  }

  // Snapshot current live DB before overwrite
  if (fs.existsSync(DB_PATH)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const safety = path.join(BACKUP_DIR, `auction_pre-restore_${stamp}.db`);
    fs.copyFileSync(DB_PATH, safety);
    console.log(`[RESTORE] Saved current DB to: ${safety}`);
  }

  // Remove WAL/SHM so SQLite reopens cleanly from the restored file
  for (const ext of ['-wal', '-shm', '-journal']) {
    const sidecar = DB_PATH + ext;
    if (fs.existsSync(sidecar)) {
      try { fs.unlinkSync(sidecar); console.log(`[RESTORE] Removed ${sidecar}`); } catch {}
    }
  }

  fs.copyFileSync(chosen.full, DB_PATH);
  console.log(`[RESTORE] ✅ Restored ${chosen.name} → ${DB_PATH}`);
  console.log('[RESTORE] ⚠️  IMPORTANT: restart the service now so the app reopens the new DB.');
}

main().catch(err => { console.error(err); process.exit(1); });
