/**
 * Shared patch definitions used by build-with-safety.mjs and dev-with-safety.mjs.
 *
 * Each patch is { label, find, replace }. `find` must match exactly once in
 * server.ts. If it doesn't match, the build fails so the operator notices
 * that server.ts has drifted from the expected shape.
 */
export const PATCHES = [
  {
    label: '1/12 import safety module',
    find: `import { initWebPush } from './lib/webpush.ts';
import { registerSocketHandlers } from './sockets/index.ts';`,
    replace: `import { initWebPush } from './lib/webpush.ts';
import { registerSocketHandlers } from './sockets/index.ts';
import {
  buildConfig as __safetyBuildConfig,
  assertDataSafe as __safetyAssert,
  scheduleDailyBackup as __safetyScheduleBackup,
  runVacuumBackup as __safetyRunBackup,
  cleanOldBackups as __safetyCleanBackups,
  getBackupStatus as __safetyGetStatus,
  checkDbIntegrity as __safetyCheckDb,
  uploadBackupToGitHub as __safetyUploadGh,
  getLatestBackupPath as __safetyLatestBackup,
} from './lib/dataSafety.ts';`,
  },
  {
    label: '2/12 replace boot section + add scheduler',
    find: `const DATA_DIR = process.env.DATA_DIR
  || (fs.existsSync('/data') ? '/data' : __dirname);
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'auction.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');

// Copy seed DB to persistent disk on first run (if DB doesn't exist there yet)
console.log(\`[BOOT] DATA_DIR=\${DATA_DIR}, DB_PATH=\${DB_PATH}, exists=\${fs.existsSync(DB_PATH)}\`);
if (DATA_DIR !== __dirname && !fs.existsSync(DB_PATH)) {
  const localDb = path.join(__dirname, 'auction.db');
  console.log(\`[BOOT] Local DB at \${localDb}, exists=\${fs.existsSync(localDb)}\`);
  if (fs.existsSync(localDb)) {
    // Ensure destination directory exists
    try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
    fs.copyFileSync(localDb, DB_PATH);
    console.log(\`[BOOT] Copied seed DB to persistent disk: \${DB_PATH}\`);
  } else {
    console.log(\`[BOOT] No local DB found — will create fresh DB at \${DB_PATH}\`);
  }
}

console.log(\`[BOOT] Data dir: \${DATA_DIR}\`);
console.log(\`[BOOT] DB path: \${DB_PATH}\`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');`,
    replace: `// [SAFETY] Resolve data paths and refuse to boot if config would lose data on deploy.
const __SAFETY_CFG = __safetyBuildConfig(process.env, __dirname);
__safetyAssert(__SAFETY_CFG, __dirname);
const DATA_DIR = __SAFETY_CFG.dataDir;
const DB_PATH = __SAFETY_CFG.dbPath;
const UPLOADS_DIR = __SAFETY_CFG.uploadsDir;
const BACKUP_DIR = __SAFETY_CFG.backupDir;

// Copy seed DB to persistent disk on first run (only when /data is empty).
if (DATA_DIR !== __dirname && !fs.existsSync(DB_PATH)) {
  const localDb = path.join(__dirname, 'auction.db');
  if (fs.existsSync(localDb)) {
    try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
    fs.copyFileSync(localDb, DB_PATH);
    console.log(\`[BOOT] Copied seed DB to persistent disk: \${DB_PATH}\`);
  } else {
    console.log(\`[BOOT] No local seed DB — fresh DB will be created at \${DB_PATH}\`);
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// [SAFETY] Daily VACUUM INTO backup + retention. Boot backup if last > 12h.
const BACKUP_INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS) || 24;
const BACKUP_KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 30;
__safetyScheduleBackup(db, BACKUP_DIR, BACKUP_INTERVAL_HOURS, BACKUP_KEEP_DAYS);`,
  },
  {
    label: '3/12 expand /api/health + add admin endpoints',
    // NOTE: this `find` must track server.ts exactly. It was updated on
    // 2026-07-16 after PR #87 rewrote the health handler (providers report) —
    // the old pattern no longer matched, so `npm run build` failed loudly and
    // production kept running the previous server.mjs even after redeploys.
    find: `// Health check must respond BEFORE full initialization
app.get("/api/health", (_req, res) => {
  // [health-providers] Report WHICH integrations are configured — booleans
  // only, never the secret values. Lets the owner verify remotely with a
  // single \`curl https://autopro.ac/api/health\` (e.g. confirm RESEND_API_KEY
  // is present now that outbound SMTP is being blocked on the host).
  const has = (v: string | undefined) => !!(v && String(v).trim());
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    providers: {
      // Email — Resend is the primary (HTTPS, survives SMTP blocks); SMTP is fallback.
      resend: has(process.env.RESEND_API_KEY),
      smtp: has(process.env.SMTP_USER) && has(process.env.SMTP_PASS),
      emailReady: has(process.env.RESEND_API_KEY) || (has(process.env.SMTP_USER) && has(process.env.SMTP_PASS)),
      // Payments
      mypay: has(process.env.MYPAY_CLIENT_ID) && has(process.env.MYPAY_CLIENT_SECRET),
      stripe: has(process.env.STRIPE_SECRET_KEY),
      // Messaging / AI / auth
      whatsapp: has(process.env.WASENDER_TOKEN),
      anthropic: has(process.env.ANTHROPIC_API_KEY),
      google: has(process.env.GOOGLE_CLIENT_ID),
    },
  });
});`,
    replace: `// [SAFETY] Health check merges the providers report (which integrations are
// configured — booleans only, never secrets) with DB integrity + backup info
// for external monitors.
app.get("/api/health", (_req, res) => {
  const has = (v: string | undefined) => !!(v && String(v).trim());
  const providers = {
    // Email — Resend is the primary (HTTPS, survives SMTP blocks); SMTP is fallback.
    resend: has(process.env.RESEND_API_KEY),
    smtp: has(process.env.SMTP_USER) && has(process.env.SMTP_PASS),
    emailReady: has(process.env.RESEND_API_KEY) || (has(process.env.SMTP_USER) && has(process.env.SMTP_PASS)),
    // Payments
    mypay: has(process.env.MYPAY_CLIENT_ID) && has(process.env.MYPAY_CLIENT_SECRET),
    stripe: has(process.env.STRIPE_SECRET_KEY),
    // Messaging / AI / auth
    whatsapp: has(process.env.WASENDER_TOKEN),
    anthropic: has(process.env.ANTHROPIC_API_KEY),
    google: has(process.env.GOOGLE_CLIENT_ID),
  };
  try {
    const integrity = __safetyCheckDb(db);
    const backups = __safetyGetStatus(BACKUP_DIR);
    res.status(integrity.ok ? 200 : 503).json({
      status: integrity.ok ? "ok" : "degraded",
      time: new Date().toISOString(),
      providers,
      db: {
        ok: integrity.ok,
        integrity: integrity.result,
        tables: integrity.tableCount,
        users: integrity.userCount,
        cars: integrity.carCount,
        invoices: integrity.invoiceCount,
        bids: integrity.bidCount,
      },
      backup: {
        count: backups.count,
        lastBackup: backups.lastBackup?.mtime || null,
        totalSizeMB: backups.totalSizeMB,
        offSite: backups.offSite,
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", error: err?.message || String(err), providers });
  }
});

// [SAFETY] Admin: detailed backup inventory.
app.get("/api/admin/backup-status", requireAdmin, (_req, res) => {
  try {
    res.json({
      config: { dataDir: DATA_DIR, dbPath: DB_PATH, backupDir: BACKUP_DIR, intervalHours: BACKUP_INTERVAL_HOURS, keepDays: BACKUP_KEEP_DAYS },
      db: __safetyCheckDb(db),
      backups: __safetyGetStatus(BACKUP_DIR),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// [SAFETY] Admin: trigger an immediate manual backup (local).
app.post("/api/admin/backup-now", requireAdmin, (_req, res) => {
  try {
    const file = __safetyRunBackup(db, BACKUP_DIR, 'manual');
    __safetyCleanBackups(BACKUP_DIR, BACKUP_KEEP_DAYS);
    res.json({ success: true, file, status: __safetyGetStatus(BACKUP_DIR) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// [SAFETY] Admin: upload latest backup to GitHub off-site repo (requires env vars).
app.post("/api/admin/backup-to-github", requireAdmin, async (_req, res) => {
  try {
    if (!process.env.BACKUP_GITHUB_REPO || !process.env.BACKUP_GITHUB_TOKEN) {
      return res.status(400).json({ error: "Off-site backup not configured. Set BACKUP_GITHUB_REPO + BACKUP_GITHUB_TOKEN env vars." });
    }
    let file = __safetyLatestBackup(BACKUP_DIR);
    if (!file) {
      file = __safetyRunBackup(db, BACKUP_DIR, 'manual');
    }
    const url = await __safetyUploadGh(file);
    res.json({ success: true, file, githubUrl: url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});`,
  },
  // Patches 4/12 + 5/12 (custom-route imports + registrations) and 10/12
  // (Permissions-Policy header) were promoted directly into server.ts on
  // 2026-05-09 because deployments often run `tsx server.ts` directly,
  // which bypasses this patcher. Keeping them only here meant the routes
  // and the camera fix were missing in production.
  // Old patch 6/12 (checkUpcomingAuctions auctionStartTime fix) was promoted
  // directly into server.ts on 2026-05-12 alongside the auction-sessions
  // sessionId filter — keeping it as a patch caused boot to fail because
  // the `find` no longer matched the edited function.
  {
    label: '7/12 fix tickAuctions auto-repair to use AUCTION_DURATION_MIN',
    find: `    // AUTO REPAIR: Any live car missing an end date gets exactly 5 minutes from NOW.
    const nullEndDateCars: any[] = db.prepare("SELECT id FROM cars WHERE status = 'live' AND (auctionEndDate IS NULL OR auctionEndDate = '')").all();
    if (nullEndDateCars.length > 0) {
      const newEndDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      nullEndDateCars.forEach((car: any) => {
        db.prepare("UPDATE cars SET auctionEndDate = ? WHERE id = ?").run(newEndDate, car.id);
        io.emit("car_updated", { id: car.id, auctionEndDate: newEndDate });
        console.log(\`[AUTO-REPAIR] Fixed null end date for live car \${car.id}. Ends at \${newEndDate}\`);
      });
    }`,
    replace: `    // [SCHED] AUTO REPAIR: live cars without an end date get AUCTION_DURATION_MIN (default 5).
    const nullEndDateCars: any[] = db.prepare("SELECT id FROM cars WHERE status = 'live' AND (auctionEndDate IS NULL OR auctionEndDate = '')").all();
    if (nullEndDateCars.length > 0) {
      const repairDurationMin = Number(process.env.AUCTION_DURATION_MIN) || 5;
      const newEndDate = new Date(Date.now() + repairDurationMin * 60 * 1000).toISOString();
      nullEndDateCars.forEach((car: any) => {
        db.prepare("UPDATE cars SET auctionEndDate = ? WHERE id = ?").run(newEndDate, car.id);
        io.emit("car_updated", { id: car.id, auctionEndDate: newEndDate });
        console.log(\`[AUTO-REPAIR] Fixed null end date for live car \${car.id}. Ends at \${newEndDate}\`);
      });
    }`,
  },
  // Old patches 8/12 + 9/12 (startingBid acceptance + currentBid seeding)
  // promoted directly into server.ts on 2026-05-09. They had to move because
  // the same destructuring pattern exists in both POST /api/cars and PUT
  // /api/cars/:id, so the patcher's "must match exactly once" check failed
  // and broke the Render build.
  // Old patch 10/12 (Permissions-Policy fix) was promoted directly into
  // server.ts so it works under `tsx server.ts` too — see comment above.
];
