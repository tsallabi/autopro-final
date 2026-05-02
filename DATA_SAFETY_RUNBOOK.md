# 🛡️ AutoPro — Data Safety Runbook

> دليل عملي لضمان عدم فقدان قاعدة البيانات والملفات المرفوعة عند أي تطوير أو نشر.
>
> الإصدار: 1.0 — مايو 2026

---

## ✅ ملخص الحماية المطبَّقة

| الطبقة | ماذا تفعل | الحالة |
|--------|-----------|--------|
| 1. Persistent Disk على Render | البيانات في `/data` لا تُمَس عند الـ deploy | ✅ مفعّلة |
| 2. `.gitignore` يستبعد `*.db` و `uploads/` | `git pull` يحدّث الكود فقط | ✅ مفعّلة |
| 3. `assertDataSafe()` عند الإقلاع | السيرفر يرفض البدء إذا كان DATA_DIR داخل المشروع في الإنتاج | ✅ مفعّلة |
| 4. Daily VACUUM INTO backup داخل التطبيق | نسخة يومية في `/data/backups`، حفظ 30 يوم | ✅ مفعّلة |
| 5. Pre-Deploy backup على Render | نسخة قبل كل deploy تلقائياً | ⚙️ يحتاج إعداد دوبامين Render (انظر أدناه) |
| 6. Health check + admin endpoints | `/api/health` + `/api/admin/backup-status` + `/api/admin/backup-now` | ✅ مفعّلة |
| 7. Restore script | `npm run restore` لاستعادة من نسخة في 5 دقائق | ✅ مفعّلة |
| 8. Off-site backup إلى GitHub Private Repo | (اختياري) نسخة يومية مشفرة خارج Render | ⚙️ يحتاج إعداد |

---

## 🔧 الإعداد على Render (مرة واحدة)

### 1. تأكيد Persistent Disk

Render Dashboard → الخدمة → Settings → Disks:
- Name: `autopro-data` (أي اسم)
- Mount Path: `/data`
- Size: 10 GB كحد أدنى (يكبر مع النمو)

### 2. متغيرات البيئة المطلوبة

Settings → Environment → Add:

```
NODE_ENV=production
DATA_DIR=/data
BACKUP_INTERVAL_HOURS=24
BACKUP_KEEP_DAYS=30
```

(الباقي حسب `DEPLOYMENT_GUIDE.md` — JWT_SECRET, SMTP_*, إلخ.)

### 3. تفعيل Pre-Deploy Hook

Settings → Build & Deploy → **Pre-Deploy Command**:

```
npm run backup:pre-deploy || true
```

> `|| true` يضمن أن فشل النسخ الاحتياطي لا يوقف النشر — لكن النسخ الاحتياطي الداخلي اليومي سيغطي الحالة.

### 4. التحقق من نجاح الإعداد

بعد الـ deploy التالي، افتح اللوجز وابحث عن:

```
[SAFETY] ────────────────────────────────────────
[SAFETY] Verifying data directory configuration:
[SAFETY]   NODE_ENV   = production
[SAFETY]   DATA_DIR   = /data
[SAFETY]   DB_PATH    = /data/auction.db
[SAFETY]   BACKUP_DIR = /data/backups
[SAFETY] ✅ DB found: 12.34 MB, mtime=2026-05-02T...
[BACKUP] ✅ Daily backups scheduled every 24h, retention 30 days.
```

أو افتح: `https://autopro.ac/api/health` ويجب أن يعرض:

```json
{
  "status": "ok",
  "db": { "ok": true, "users": 532, "cars": 1872 },
  "backup": { "count": 4, "lastBackup": "2026-05-02T..." }
}
```

---

## 📋 الفحص اليومي (10 ثوان)

افتح في المتصفح:
```
https://autopro.ac/api/health
```

**القاعدة:**
- `status: "ok"` → كل شيء سليم.
- `status: "degraded"` → DB integrity فشل — راجع اللوجز فوراً.
- `lastBackup` يجب ألا يتجاوز 25 ساعة.

---

## 🚨 سيناريوهات الطوارئ

### 1. الموقع يعمل لكن البيانات مفقودة (DB فارغ)

**خطوات الاستعادة:**

```bash
# على Render → Shell:
cd /opt/render/project/src     # أو أي مسار المشروع
node scripts/restore-from-backup.mjs --list

# اختر نسخة (الأحدث عادة):
node scripts/restore-from-backup.mjs --latest

# أعد تشغيل الخدمة من Render Dashboard → Manual Restart
```

السكريبت يحفظ DB الحالي في `/data/backups/auction_pre-restore_*.db` قبل الكتابة فوقه — لذا الخطأ قابل للتراجع.

### 2. DB تالف (`PRAGMA integrity_check` فشل)

`/api/health` سيعرض `status: "degraded"`. خطوات:

```bash
# 1) خذ نسخة من الـ DB التالف للتحليل لاحقاً
cp /data/auction.db /data/auction_corrupted_$(date +%s).db

# 2) استعد آخر نسخة سليمة
node scripts/restore-from-backup.mjs --latest

# 3) restart
```

### 3. Disk ممتلئ

```bash
df -h /data            # تحقق من المساحة
ls -lhS /data/backups | head     # أكبر النسخ

# نظّف يدوياً:
find /data/backups -name "auction_*.db" -mtime +14 -delete

# قلّل الـ retention:
# في Render → Environment: BACKUP_KEEP_DAYS=14
```

### 4. حذفت الـ service بالخطأ (Persistent Disk راح معها)

→ يحدث فقط إذا نُفِّذت **الطبقة 8 (GitHub Backup)**. خطوات:

```bash
# على آلتك المحلية:
git clone https://github.com/tsallabi/autopro-db-backups
cd autopro-db-backups
ls daily/         # اختر آخر يوم

# إذا كانت النسخة مشفرة (.enc):
node decrypt.mjs auction_xxx.db.enc <BACKUP_ENCRYPTION_KEY> > auction.db

# على Render الجديد، ارفع DB:
scp auction.db user@render-shell:/data/auction.db
```

---

## 🛠️ أوامر مفيدة (Render Shell)

```bash
# قائمة كل النسخ مع الأحجام والتواريخ
ls -lh /data/backups/ | head -30

# حجم DB الحالي
du -h /data/auction.db

# DB integrity check يدوياً
sqlite3 /data/auction.db 'PRAGMA integrity_check;'

# عدد الصفوف الرئيسية
sqlite3 /data/auction.db "SELECT 'users' t, COUNT(*) c FROM users UNION ALL SELECT 'cars', COUNT(*) FROM cars UNION ALL SELECT 'invoices', COUNT(*) FROM invoices;"

# نسخة احتياطية يدوية
node scripts/pre-deploy-backup.mjs

# استعادة تفاعلية
node scripts/restore-from-backup.mjs

# مساحة /data
df -h /data
```

---

## 🌐 الطبقة 8 (اختيارية): Off-site Backup إلى GitHub

تحمي من سيناريو نادر لكن كارثي: حذف Render service بالخطأ → فقدان Persistent Disk.

### الإعداد (15 دقيقة):

1. **أنشئ مستودع خاص جديد** على GitHub، مثلاً:
   - `tsallabi/autopro-db-backups`
   - **خاص** (Private)
   - **منفصل عن `autopro-final`** — تجنُّب خلط الكود بالبيانات

2. **أنشئ Fine-grained Personal Access Token:**
   - GitHub Settings → Developer settings → Personal access tokens → Fine-grained
   - Scope: المستودع `autopro-db-backups` فقط
   - Permissions: **Contents: Read & Write**
   - انسخ الـ token

3. **على Render → Environment، أضف:**
   ```
   BACKUP_GITHUB_REPO=tsallabi/autopro-db-backups
   BACKUP_GITHUB_TOKEN=<the PAT>
   BACKUP_GITHUB_BRANCH=main
   BACKUP_ENCRYPTION_KEY=<32+ char random string>
   ```

   لتوليد مفتاح تشفير:
   ```bash
   openssl rand -hex 32
   ```

   **احفظ هذا المفتاح في مكان آمن** (Bitwarden, 1Password) — بدونه لا يمكن فك تشفير النسخ.

4. **أنشئ Render Cron Job** (خدمة منفصلة):
   - Type: Cron Job
   - Schedule: `0 4 * * *` (كل يوم 4 صباحاً)
   - Command: `node scripts/backup-to-github.mjs`
   - يحتاج نفس Persistent Disk mounted على `/data`

5. **اختبار**: شغّل يدوياً مرة لتأكيد النجاح:
   ```bash
   node scripts/backup-to-github.mjs
   ```

   تحقق من المستودع — يجب أن ترى ملف في `daily/YYYY-MM-DD/`.

---

## 📐 سياسة retention الموصى بها

| الموقع | الاحتفاظ | المساحة المتوقعة (DB 100 MB) |
|--------|---------|------------------------------|
| `/data/backups` (محلي) | 30 يوم | ~3 GB |
| GitHub repo (مشفّر) | للأبد | ~3 GB/شهر |

**القاعدة:** كل نسخة احتياطية = حجم DB ≈ 100 MB في البداية، يكبر مع البيانات. راقب `/data` كل شهر.

---

## ⚠️ ما يجب عدم فعله أبداً

| ❌ لا تفعل | السبب |
|------------|-------|
| تتبَّع `auction.db` في git | كل `git pull` يكتب فوقها |
| استخدام `cp` بدلاً من `VACUUM INTO` لأخذ نسخة من DB حية | قد ينسخ ملف غير متسق مع WAL |
| حذف الـ Persistent Disk | البيانات تضيع نهائياً (إلا إذا فعّلت الطبقة 8) |
| `DROP TABLE` في الإنتاج | لا توجد آلية تراجع — استخدم rename بدل delete |
| تشغيل migrations لم تُختبر محلياً أولاً | احتمال الخسارة عالٍ |
| تشغيل seed scripts على الإنتاج | تستبدل البيانات الحقيقية ببيانات وهمية |
| تشارك `JWT_SECRET` أو `BACKUP_ENCRYPTION_KEY` | اختراق فوري |

---

## 🧪 اختبار الاستعادة (يُنصح به مرة كل 3 أشهر)

في بيئة التطوير المحلي:

```bash
# 1) انسخ DB الحقيقي إلى مجلد محلي مؤقت
cp /data/auction.db /tmp/test_restore/

# 2) شغّل التطبيق محلياً مع:
DATA_DIR=/tmp/test_restore npm run dev

# 3) جرّب /api/health محلياً
curl http://localhost:3005/api/health

# 4) جرّب أمر الاستعادة
DATA_DIR=/tmp/test_restore node scripts/restore-from-backup.mjs --list
```

> **لا تختبر الاستعادة على الإنتاج إلا في حالة طوارئ فعلية.**

---

## 🔗 ملفات ذات صلة

- `lib/dataSafety.ts` — وحدة الحماية الرئيسية
- `scripts/pre-deploy-backup.mjs` — pre-deploy hook
- `scripts/backup-to-github.mjs` — off-site backup
- `scripts/restore-from-backup.mjs` — disaster recovery
- `.gitignore` — يستبعد `*.db`, `uploads/`, `backups/`
- `DEPLOYMENT_GUIDE.md` — متغيرات البيئة الكاملة
- `DATA_DIR_SETUP.md` — تفاصيل DATA_DIR لسيرفرات custom

---

## 📞 في حالة الأزمة

1. **لا تعمل أي شيء متسرع.** كل دقيقة تأخير أرخص من خطوة خاطئة.
2. افتح Render Logs و `/api/health` و `/api/admin/backup-status` لفهم الحالة.
3. خذ نسخة احتياطية إضافية يدوياً قبل أي إصلاح:
   ```bash
   node scripts/pre-deploy-backup.mjs
   ```
4. اتبع السيناريو المناسب أعلاه.
5. سجّل ما حدث وما فعلته — يساعد في تحسين الـ runbook لاحقاً.

---

**النتيجة:** بعد تطبيق هذا الـ runbook، سيناريو "الموقع يصبح فارغاً بعد deploy" مستحيل عملياً. حتى لو كل شيء فشل، آخر نسخة لا تتجاوز 24 ساعة.
