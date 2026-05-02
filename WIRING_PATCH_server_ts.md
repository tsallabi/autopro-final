# 🔧 Wiring Patch for `server.ts`

> هذه التعديلات الأربعة الصغيرة على `server.ts` تُكمل تفعيل وحدة الحماية.
> الوحدة `lib/dataSafety.ts` والسكريبتات والـ runbook مرفوعة بالفعل.
>
> **المدة:** 5 دقائق. **المخاطرة:** منخفضة (إضافات فقط، لا حذف للمنطق الموجود).

---

## التغييرات الأربعة

### 1️⃣ أضف import للوحدة الجديدة

**الموقع:** بعد السطر 17 الذي يستورد `registerSocketHandlers`.

**ابحث عن:**
```typescript
import { initWebPush } from './lib/webpush.ts';
import { registerSocketHandlers } from './sockets/index.ts';
```

**استبدل بـ:**
```typescript
import { initWebPush } from './lib/webpush.ts';
import { registerSocketHandlers } from './sockets/index.ts';
import {
  buildConfig,
  assertDataSafe,
  scheduleDailyBackup,
  runVacuumBackup,
  cleanOldBackups,
  getBackupStatus,
  checkDbIntegrity,
} from './lib/dataSafety.ts';
```

---

### 2️⃣ استبدل قسم تهيئة DATA_DIR (السطور 117-142 تقريباً)

**ابحث عن** (الكتلة كاملة من السطر 117 تقريباً إلى ما قبل `const db = new Database`):

```typescript
const DATA_DIR = process.env.DATA_DIR
  || (fs.existsSync('/data') ? '/data' : __dirname);
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'auction.db');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads');

// Copy seed DB to persistent disk on first run (if DB doesn't exist there yet)
console.log(`[BOOT] DATA_DIR=${DATA_DIR}, DB_PATH=${DB_PATH}, exists=${fs.existsSync(DB_PATH)}`);
if (DATA_DIR !== __dirname && !fs.existsSync(DB_PATH)) {
  const localDb = path.join(__dirname, 'auction.db');
  console.log(`[BOOT] Local DB at ${localDb}, exists=${fs.existsSync(localDb)}`);
  if (fs.existsSync(localDb)) {
    // Ensure destination directory exists
    try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
    fs.copyFileSync(localDb, DB_PATH);
    console.log(`[BOOT] Copied seed DB to persistent disk: ${DB_PATH}`);
  } else {
    console.log(`[BOOT] No local DB found — will create fresh DB at ${DB_PATH}`);
  }
}

console.log(`[BOOT] Data dir: ${DATA_DIR}`);
console.log(`[BOOT] DB path: ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
```

**استبدل بـ:**

```typescript
// Resolve data paths and refuse to boot if the configuration would lose data on deploy.
const SAFETY_CFG = buildConfig(process.env, __dirname);
assertDataSafe(SAFETY_CFG, __dirname);
const DATA_DIR = SAFETY_CFG.dataDir;
const DB_PATH = SAFETY_CFG.dbPath;
const UPLOADS_DIR = SAFETY_CFG.uploadsDir;
const BACKUP_DIR = SAFETY_CFG.backupDir;

// Copy seed DB to persistent disk on first run (if DB doesn't exist there yet).
// Only happens when /data is empty — never overwrites an existing production DB.
if (DATA_DIR !== __dirname && !fs.existsSync(DB_PATH)) {
  const localDb = path.join(__dirname, 'auction.db');
  if (fs.existsSync(localDb)) {
    try { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); } catch {}
    fs.copyFileSync(localDb, DB_PATH);
    console.log(`[BOOT] Copied seed DB to persistent disk: ${DB_PATH}`);
  } else {
    console.log(`[BOOT] No local seed DB — fresh DB will be created at ${DB_PATH}`);
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// Schedule daily VACUUM INTO backups + retention cleanup. Runs immediately
// if the most recent backup is older than 12 hours.
const BACKUP_INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS) || 24;
const BACKUP_KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS) || 30;
scheduleDailyBackup(db, BACKUP_DIR, BACKUP_INTERVAL_HOURS, BACKUP_KEEP_DAYS);
```

---

### 3️⃣ وسّع `/api/health` وأضف endpoints الإدارة

**ابحث عن** (السطر ~1690):

```typescript
// Health check must respond BEFORE full initialization
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});
```

**استبدل بـ:**

```typescript
// Health check must respond BEFORE full initialization.
// Returns DB integrity + last backup info so external monitors (UptimeRobot) can detect data issues early.
app.get("/api/health", (_req, res) => {
  try {
    const integrity = checkDbIntegrity(db);
    const backups = getBackupStatus(BACKUP_DIR);
    const status = integrity.ok ? "ok" : "degraded";
    res.status(integrity.ok ? 200 : 503).json({
      status,
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
      },
    });
  } catch (err: any) {
    res.status(500).json({ status: "error", error: err?.message || String(err) });
  }
});

// Admin-only: detailed backup inventory (used by /admin → System Health UI).
app.get("/api/admin/backup-status", requireAdmin, (_req, res) => {
  try {
    res.json({
      config: {
        dataDir: DATA_DIR,
        dbPath: DB_PATH,
        backupDir: BACKUP_DIR,
        intervalHours: BACKUP_INTERVAL_HOURS,
        keepDays: BACKUP_KEEP_DAYS,
      },
      db: checkDbIntegrity(db),
      backups: getBackupStatus(BACKUP_DIR),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// Admin-only: trigger an immediate manual backup (returns the new file path).
app.post("/api/admin/backup-now", requireAdmin, (_req, res) => {
  try {
    const file = runVacuumBackup(db, BACKUP_DIR, 'manual');
    cleanOldBackups(BACKUP_DIR, BACKUP_KEEP_DAYS);
    res.json({ success: true, file, status: getBackupStatus(BACKUP_DIR) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});
```

---

## ✅ التحقق بعد التطبيق

### محلياً

```bash
npm run lint        # تحقق من نوع الـ TypeScript
npm run dev         # شغّل محلياً
```

عند الإقلاع يجب أن ترى:
```
[SAFETY] ────────────────────────────────────────
[SAFETY] Verifying data directory configuration:
[SAFETY]   NODE_ENV   = development
[SAFETY]   DATA_DIR   = .../autopro-final
[BACKUP] ✅ Daily backups scheduled every 24h, retention 30 days.
```

افتح: `http://localhost:3005/api/health` → يجب أن يعرض JSON مع `db.ok: true`.

### بعد النشر على Render

1. افتح اللوجز — يجب رؤية كتلة `[SAFETY]` و `[BACKUP]`
2. افتح `https://autopro.ac/api/health` — `status: "ok"` مع counts
3. جرّب من الإدارة (مع JWT admin):
   ```bash
   curl -H "Authorization: Bearer <admin-jwt>" https://autopro.ac/api/admin/backup-status
   curl -X POST -H "Authorization: Bearer <admin-jwt>" https://autopro.ac/api/admin/backup-now
   ```

### تفعيل Pre-Deploy Hook

Render Dashboard → Settings → Build & Deploy → **Pre-Deploy Command**:
```
npm run backup:pre-deploy || true
```

---

## 🚨 إن واجهت مشكلة

| المشكلة | السبب المحتمل | الحل |
|---------|---------------|------|
| `[SAFETY][FATAL] DATA_DIR is inside the project directory` على Render | لم تُضَف env var `DATA_DIR=/data` | Settings → Environment → أضف `DATA_DIR=/data` |
| `[SAFETY][FATAL] not writable` | Persistent Disk غير mounted | Settings → Disks → تحقق من Mount Path = `/data` |
| `requireAdmin is not defined` خطأ build | المسار `requireAdmin` معرَّف في server.ts السطر 86 — يجب أن يكون أعلى من نقطة استخدامه | تأكد أن endpoints الجديدة بعد تعريف `requireAdmin` (الموقع الافتراضي صحيح) |

---

**هذا الملف يمكن حذفه بعد تطبيق التعديلات.**
