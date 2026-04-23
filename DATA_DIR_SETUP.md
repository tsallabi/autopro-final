# 🗂️ دليل إعداد مجلد `/data/` للسيرفر الحي

> **الحل النهائي لمشكلة "مسح البيانات عند التحديث"**
>
> تاريخ: 19 أبريل 2026
> المدة: 5 دقائق فقط
> المخاطرة: ⭐ (منخفضة جداً)

---

## 🎯 الفكرة:

بدل أن تكون قاعدة البيانات داخل مجلد المشروع (حيث تُمسح مع `git pull` أو إعادة النشر)، نضعها في **مجلد ثابت خارج المشروع** اسمه `/data/`.

**النتيجة:**
- ✅ قاعدة البيانات آمنة 100%
- ✅ الملفات المرفوعة (uploads) آمنة
- ✅ أي تحديث للكود **لا يمس البيانات**
- ✅ الكود بالفعل جاهز لهذا — يكفي إنشاء المجلد!

---

## 🔍 ما يفعله الكود تلقائياً:

في `server.ts` (سطر 114):

```js
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
```

يعني:
- ✅ **إذا وُجد مجلد `/data`** → يستخدمه (للإنتاج)
- ⚠️ **إذا لم يوجد** → يستخدم مجلد المشروع (للتطوير المحلي)

---

## 📋 الخطوات للمبرمج (أحمد)

### 1️⃣ اتصل بالسيرفر:

```bash
ssh user@77.237.245.41
```

---

### 2️⃣ أنشئ المجلدات الدائمة:

```bash
# أنشئ المجلد الرئيسي
sudo mkdir -p /data
sudo mkdir -p /data/uploads
sudo mkdir -p /data/uploads/images
sudo mkdir -p /data/uploads/documents
sudo mkdir -p /data/uploads/media
sudo mkdir -p /data/uploads/kyc
sudo mkdir -p /data/backups

# أعطِ صلاحيات للمستخدم (غيّر `your_user` لاسم المستخدم الحقيقي)
sudo chown -R $USER:$USER /data

# تحقق
ls -la /data/
```

**النتيجة المتوقعة:**
```
drwxr-xr-x  your_user  your_user  backups
drwxr-xr-x  your_user  your_user  uploads
```

---

### 3️⃣ **مهم جداً — انقل البيانات الحالية:**

> ⚠️ **قبل هذه الخطوة، اعمل نسخة احتياطية!**

```bash
# نسخة احتياطية للأمان
cp -r /path/to/autopro-final/auction.db /tmp/auction.db.backup
cp -r /path/to/autopro-final/uploads /tmp/uploads.backup

# انقل قاعدة البيانات
cp /path/to/autopro-final/auction.db /data/auction.db

# انقل الملفات المرفوعة
cp -rn /path/to/autopro-final/uploads/* /data/uploads/

# تحقق
ls -lh /data/auction.db
du -sh /data/uploads/
```

**غيّر `/path/to/autopro-final` للمسار الحقيقي على السيرفر!**

مثال:
```bash
# إذا كان المشروع في /var/www/autopro/
cp /var/www/autopro/auction.db /data/auction.db
cp -rn /var/www/autopro/uploads/* /data/uploads/
```

---

### 4️⃣ أعد تشغيل السيرفر:

```bash
# إذا تستخدم PM2:
pm2 restart all

# إذا تستخدم systemd:
sudo systemctl restart autopro
# أو اسم الـ service الفعلي
```

---

### 5️⃣ تأكد من نجاح الإعداد:

```bash
# شاهد اللوجز
pm2 logs autopro --lines 50

# يجب أن ترى:
# [BOOT] DATA_DIR=/data, DB_PATH=/data/auction.db, exists=true
# [BOOT] Data dir: /data
# [BOOT] DB path: /data/auction.db
```

✅ **إذا رأيت `DATA_DIR=/data` — تم النجاح!**

---

## 🛡️ بعد الإعداد — ستصبح التحديثات آمنة:

```bash
# أي تحديث مستقبلي:
cd /path/to/autopro-final
git pull origin main
npm install
rm -rf dist node_modules/.vite
npm run build
pm2 restart all

# ✅ قاعدة البيانات في /data/ — لا تُمس أبداً!
# ✅ الملفات المرفوعة في /data/uploads/ — محمية!
```

---

## 💾 نسخة احتياطية تلقائية (موصى بها)

### أنشئ cron job لنسخ احتياطية يومية:

```bash
crontab -e
```

أضف هذا السطر في نهاية الملف:

```bash
# نسخة احتياطية يومياً الساعة 3 صباحاً
0 3 * * * cp /data/auction.db /data/backups/auction_$(date +\%Y\%m\%d).db && find /data/backups -name "auction_*.db" -mtime +30 -delete

# أيضاً نسخة احتياطية للـ uploads أسبوعياً
0 4 * * 0 tar -czf /data/backups/uploads_$(date +\%Y\%m\%d).tar.gz /data/uploads && find /data/backups -name "uploads_*.tar.gz" -mtime +60 -delete
```

**ماذا يفعل:**
- ✅ نسخة احتياطية من DB يومياً
- ✅ يحذف النسخ الأقدم من 30 يوم
- ✅ نسخة احتياطية من uploads أسبوعياً
- ✅ يحذف نسخ uploads الأقدم من 60 يوم

---

## 🔧 حل المشاكل الشائعة

### ❌ المشكلة: "Permission denied" عند إنشاء الملفات

**الحل:**
```bash
sudo chown -R $USER:$USER /data
sudo chmod -R 755 /data
```

### ❌ المشكلة: السيرفر يقول `DATA_DIR=/home/user/...` وليس `/data`

**السبب:** المجلد `/data` غير موجود أو غير متاح للقراءة

**الحل:**
```bash
ls -la /data/
# يجب أن يُظهر مجلدات

# إذا كان فارغاً:
sudo mkdir -p /data
sudo chown -R $USER:$USER /data
```

### ❌ المشكلة: الصور الموجودة سابقاً لا تظهر

**السبب:** مسارات الصور في DB تشير لمسار قديم

**الحل:** Symlink للتوافق:
```bash
# اربط المجلد القديم بالجديد
ln -s /data/uploads /path/to/autopro-final/uploads
```

أو (أفضل) — تحديث المسارات في DB:
```bash
sqlite3 /data/auction.db

-- إذا كانت المسارات المحفوظة بصيغة نسبية (uploads/...)
-- لن تحتاج تعديل — الكود يخدمها من /data/uploads/
```

---

## 📊 التحقق النهائي

بعد الإعداد، تأكد من هذه النقاط:

- [ ] `ls /data/auction.db` يُظهر الملف
- [ ] `ls /data/uploads/` يُظهر مجلدات الصور
- [ ] لوجز السيرفر تقول `DATA_DIR=/data`
- [ ] الموقع يعمل وتستطيع تسجيل الدخول
- [ ] تستطيع رفع صورة جديدة (تُحفظ في `/data/uploads/`)
- [ ] بعد `pm2 restart`، البيانات باقية

---

## 🎯 ماذا يحدث بعد هذا الإعداد؟

### أي تحديث مستقبلي من Claude / من أي مبرمج:

```bash
git pull origin main
npm install
npm run build
pm2 restart all
```

### لا يتأثر:
- ✅ قاعدة البيانات (`/data/auction.db`)
- ✅ صور السيارات (`/data/uploads/images/`)
- ✅ ملفات الصوت والـ PDF (`/data/uploads/media/`)
- ✅ وثائق KYC (`/data/uploads/kyc/`)
- ✅ النسخ الاحتياطية (`/data/backups/`)

### يتحدث:
- كود التطبيق فقط
- ملفات البناء (`dist/`)
- الـ dependencies (`node_modules/`)

---

## 📧 رسالة مختصرة لأحمد

```
أستاذ أحمد،

الحل النهائي لمشكلة "مسح البيانات عند التحديث":
نقل قاعدة البيانات والصور خارج مجلد المشروع.

5 دقائق عمل — خطوات واضحة:

1) اتصل بالسيرفر (SSH)

2) أنشئ المجلدات:
sudo mkdir -p /data/uploads /data/backups
sudo chown -R $USER:$USER /data

3) انقل البيانات الحالية (غيّر المسار حسب مكان المشروع):
cp /path/to/autopro-final/auction.db /data/
cp -rn /path/to/autopro-final/uploads/* /data/uploads/

4) أعد تشغيل السيرفر:
pm2 restart all

5) تحقق من اللوجز:
pm2 logs autopro
# يجب أن ترى: DATA_DIR=/data

بعد هذا، أي git pull + build + restart لن يمس البيانات.

الكود بالفعل جاهز لهذا:
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;

المزيد من التفاصيل في DATA_DIR_SETUP.md في المشروع.

شكراً
طارق
```

---

## 🔗 روابط ذات صلة

- [MYSQL_MIGRATION_GUIDE.md](./MYSQL_MIGRATION_GUIDE.md) — للمستقبل عند النمو الكبير
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) — دليل النشر الكامل
- [EXCHANGE_RATE_PATCH.md](./EXCHANGE_RATE_PATCH.md) — تعديل سعر الصرف

---

## 🎉 النتيجة النهائية

**قبل:**
```
❌ git pull → قد يمسح auction.db
❌ rm -rf dist → قد يمسح uploads
❌ المستخدمون يفقدون حساباتهم
```

**بعد:**
```
✅ git pull → يُحدّث الكود فقط
✅ DB في مكان آمن في /data/
✅ Uploads في مكان آمن
✅ نسخ احتياطية تلقائية يومية
✅ حياة أبدية للبيانات 🎯
```

---

*ملف جاهز للإرسال لأحمد — المدة الفعلية: 5-10 دقائق.*
