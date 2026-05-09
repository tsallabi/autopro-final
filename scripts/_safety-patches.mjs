/**
 * Shared patch definitions used by build-with-safety.mjs and dev-with-safety.mjs.
 *
 * Each patch is { label, find, replace }. `find` must match exactly once in
 * server.ts. If it doesn't match, the build fails so the operator notices
 * that server.ts has drifted from the expected shape.
 */
export const PATCHES = [
  {
    label: '1/11 import safety module',
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
    label: '2/11 replace boot section + add scheduler',
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
    label: '3/11 expand /api/health + add admin endpoints',
    find: `// Health check must respond BEFORE full initialization
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});`,
    replace: `// [SAFETY] Health check returns DB integrity + backup info for external monitors.
app.get("/api/health", (_req, res) => {
  try {
    const integrity = __safetyCheckDb(db);
    const backups = __safetyGetStatus(BACKUP_DIR);
    res.status(integrity.ok ? 200 : 503).json({
      status: integrity.ok ? "ok" : "degraded",
      time: new Date().toISOString(),
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
    res.status(500).json({ status: "error", error: err?.message || String(err) });
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
  {
    label: '4/11 import admin-extras + referrals + mypay + whatsapp + seo + deal-of-day + office-info modules',
    find: `import { registerBannerRoutes } from './routes/banners.ts';`,
    replace: `import { registerBannerRoutes } from './routes/banners.ts';
import { registerAdminExtrasRoutes } from './routes/admin-extras.ts';
import { registerReferralRoutes } from './routes/referrals.ts';
import { registerMyPayRoutes } from './routes/mypay.ts';
import { registerWhatsAppPosterRoutes } from './routes/whatsapp-poster.ts';
import { registerSeoRoutes } from './routes/seo.ts';
import { registerDealOfDayRoutes } from './routes/deal-of-day.ts';
import { registerOfficeInfoRoutes } from './routes/office-info.ts';`,
  },
  {
    label: '5/11 register admin-extras + referrals + mypay + whatsapp + seo + deal-of-day + office-info routes',
    find: `try { registerBannerRoutes(ctx as any); } catch (e: any) { console.error('[BOOT] banner routes failed:', e?.message); }
  registerSocketHandlers(ctx as any);`,
    replace: `try { registerBannerRoutes(ctx as any); } catch (e: any) { console.error('[BOOT] banner routes failed:', e?.message); }
  try { registerAdminExtrasRoutes(ctx as any); console.log('[BOOT] ✓ admin-extras routes'); } catch (e: any) { console.error('[BOOT] admin-extras routes failed:', e?.message); }
  try { registerReferralRoutes(ctx as any); console.log('[BOOT] ✓ referrals routes'); } catch (e: any) { console.error('[BOOT] referrals routes failed:', e?.message); }
  try { registerMyPayRoutes(ctx as any); console.log('[BOOT] ✓ mypay routes'); } catch (e: any) { console.error('[BOOT] mypay routes failed:', e?.message); }
  try { registerWhatsAppPosterRoutes(ctx as any); console.log('[BOOT] ✓ whatsapp poster routes'); } catch (e: any) { console.error('[BOOT] whatsapp poster routes failed:', e?.message); }
  try { registerSeoRoutes(ctx as any); console.log('[BOOT] ✓ seo routes'); } catch (e: any) { console.error('[BOOT] seo routes failed:', e?.message); }
  try { registerDealOfDayRoutes(ctx as any); console.log('[BOOT] ✓ deal-of-day routes'); } catch (e: any) { console.error('[BOOT] deal-of-day routes failed:', e?.message); }
  try { registerOfficeInfoRoutes(ctx as any); console.log('[BOOT] ✓ office-info routes'); } catch (e: any) { console.error('[BOOT] office-info routes failed:', e?.message); }
  registerSocketHandlers(ctx as any);`,
  },
  {
    label: '6/11 fix checkUpcomingAuctions to honor auctionStartTime + auctionEndDate',
    find: `  function checkUpcomingAuctions() {
    if (isTransitioning) return;
    const liveRow: any = db.prepare("SELECT COUNT(*) as count FROM cars WHERE status = 'live'").get();
    if (liveRow && liveRow.count === 0) {
      const next: any = db.prepare("SELECT * FROM cars WHERE status = 'upcoming' ORDER BY auctionEndDate ASC, id ASC LIMIT 1").get();
      if (next) {
        // Auction duration: 5 minutes
        const newEndDate = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        db.prepare("UPDATE cars SET status = 'live', auctionEndDate = ? WHERE id = ?").run(newEndDate, next.id);
        io.emit("car_updated", { id: next.id, status: 'live', auctionEndDate: newEndDate });
        io.emit("auction_started", { carId: next.id });
        console.log(\`[AUCTION QUEUE] Car \${next.id} is now LIVE. Ends at \${newEndDate}\`);
      }
    }
  }`,
    replace: `  // [SCHED] Honor admin-set auctionStartTime: only activate cars whose start time has arrived (or is unset).
  // Honor admin-set auctionEndDate when it's in the future; fall back to start+duration, then now+duration.
  function checkUpcomingAuctions() {
    if (isTransitioning) return;
    const liveRow: any = db.prepare("SELECT COUNT(*) as count FROM cars WHERE status = 'live'").get();
    if (!liveRow || liveRow.count > 0) return;
    const nowIso = new Date().toISOString();
    const defaultDurationMin = Number(process.env.AUCTION_DURATION_MIN) || 5;
    const next: any = db.prepare(\`
      SELECT * FROM cars
       WHERE status = 'upcoming'
         AND (auctionStartTime IS NULL OR auctionStartTime = '' OR auctionStartTime <= ?)
       ORDER BY
         CASE WHEN auctionStartTime IS NULL OR auctionStartTime = '' THEN 1 ELSE 0 END,
         auctionStartTime ASC,
         id ASC
       LIMIT 1
    \`).get(nowIso);
    if (!next) return;
    let newEndDate: string;
    if (next.auctionEndDate && next.auctionEndDate > nowIso) {
      newEndDate = next.auctionEndDate;
    } else if (next.auctionStartTime) {
      newEndDate = new Date(new Date(next.auctionStartTime).getTime() + defaultDurationMin * 60 * 1000).toISOString();
    } else {
      newEndDate = new Date(Date.now() + defaultDurationMin * 60 * 1000).toISOString();
    }
    db.prepare("UPDATE cars SET status = 'live', auctionEndDate = ? WHERE id = ?").run(newEndDate, next.id);
    io.emit("car_updated", { id: next.id, status: 'live', auctionEndDate: newEndDate });
    io.emit("auction_started", { carId: next.id });
    console.log(\`[AUCTION QUEUE] Car \${next.id} is now LIVE (start=\${next.auctionStartTime || 'n/a'}, end=\${newEndDate})\`);
  }`,
  },
  {
    label: '7/11 fix tickAuctions auto-repair to use AUCTION_DURATION_MIN',
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
  {
    label: '8/11 accept startingBid in POST /api/cars',
    find: `      buyItNow, startPrice, currentBid, reservePrice, sellerId, currency,`,
    replace: `      buyItNow, startPrice, startingBid, currentBid, reservePrice, sellerId, currency,`,
  },
  {
    label: '9/11 seed currentBid from startingBid on POST /api/cars INSERT',
    find: `        currentBid || 0, reservePrice || 0, buyItNow || 0, currency || 'USD', JSON.stringify(images || []),`,
    replace: `        currentBid || startingBid || startPrice || 0, reservePrice || 0, buyItNow || 0, currency || 'USD', JSON.stringify(images || []),`,
  },
  {
    label: '10/11 fix Permissions-Policy to allow camera/mic/geolocation on same-origin',
    find: `res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');`,
    replace: `res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self)');`,
  },
];
