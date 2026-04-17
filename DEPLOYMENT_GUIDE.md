# 🚀 دليل رفع وتشغيل وصيانة منصة AutoPro Libya

> دليل شامل للمطور المسؤول عن النشر والدعم والصيانة
> آخر تحديث: 17 أبريل 2026

---

## 📋 فهرس المحتويات

1. [نظرة عامة على النظام](#نظرة-عامة)
2. [البنية التقنية](#البنية-التقنية)
3. [هيكل المشروع](#هيكل-المشروع)
4. [المتطلبات](#المتطلبات)
5. [متغيرات البيئة](#متغيرات-البيئة)
6. [التشغيل المحلي](#التشغيل-المحلي)
7. [النشر على Render](#النشر-على-render)
8. [قاعدة البيانات](#قاعدة-البيانات)
9. [الصيانة الدورية](#الصيانة-الدورية)
10. [حل المشاكل الشائعة](#حل-المشاكل-الشائعة)
11. [الأمان](#الأمان)
12. [نصائح مهمة](#نصائح-مهمة)

---

## 🎯 نظرة عامة

**AutoPro Libya** منصة متكاملة لمزادات السيارات تربط بين:
- 🏢 **المزادات الأمريكية** (Copart, IAAI, ACV) → 🚢 **شحن دولي** → 🇱🇾 **الموانئ الليبية**
- **المستخدمون:** مشترون، بائعون (تجار/معارض)، إداريون، محاسبون، موظفو ساحات
- **اللغة:** عربي (RTL) + إنجليزي
- **الموقع الحي:** `https://autopro-final.onrender.com`

### الميزات الرئيسية:
- ✅ مزادات حية (Socket.IO real-time)
- ✅ سوق العروض + اشتري الآن + سيارات مميزة
- ✅ حاسبة تكلفة كاملة (شحن + جمارك + تأمين)
- ✅ نظام باقات تجارية (Basic/Silver/Gold/Premium)
- ✅ Yard Management (VIN scanner, إدارة الساحات)
- ✅ PWA كامل + Push Notifications
- ✅ نظام محاسبي (Double-entry bookkeeping)
- ✅ دفع Stripe + Plutu (ليبي)
- ✅ Google OAuth
- ✅ نموذج ليبيا برو للتقنية

---

## 🛠️ البنية التقنية

| المكون | التقنية | الإصدار |
|--------|--------|---------|
| Runtime | Node.js | 20+ |
| Server | Express + TypeScript | 4.21 |
| Frontend | React + Vite + Tailwind v4 | React 19 |
| Database | SQLite (better-sqlite3) | 12.4 |
| Real-time | Socket.IO | - |
| Auth | JWT + bcryptjs + Google OAuth | - |
| Build | esbuild + Vite | - |
| Email | Nodemailer (SMTP) | - |
| Payments | Stripe + Plutu | - |
| Push | web-push (VAPID) | - |
| Hosting | Render (Starter plan with disk) | - |

---

## 📁 هيكل المشروع

```
autopro-final/
├── server.ts              # الخادم الرئيسي (~7500 سطر)
├── package.json
├── vite.config.ts
├── tsconfig.json
│
├── routes/                # API routes (مُقسّمة)
│   ├── auth.ts           # تسجيل/دخول/Google
│   ├── cars.ts           # CRUD السيارات
│   ├── admin.ts          # أدوات الإدارة
│   ├── buyer.ts          # مزايدة/عروض
│   ├── seller.ts         # بائع
│   ├── payments.ts       # Stripe + Plutu
│   ├── shipping.ts       # شحن + مراكز
│   ├── accounting.ts     # محاسبة
│   ├── analytics.ts      # إحصائيات
│   ├── yard.ts           # Yard Management
│   ├── push.ts           # Push notifications
│   ├── banners.ts        # بانرات إعلانية
│   └── libyapro.ts       # نموذج ليبيا برو
│
├── sockets/
│   └── index.ts          # Socket.IO handlers
│
├── lib/
│   ├── middleware.ts     # requireAuth, requireAdmin...
│   ├── types.ts          # AppContext interface
│   ├── accounting.ts     # نظام محاسبي
│   ├── webpush.ts        # VAPID + push
│   └── yardSchema.ts     # ساحات
│
├── src/                  # Frontend React
│   ├── App.tsx           # Routes
│   ├── pages/            # الصفحات الرئيسية
│   ├── components/       # مكونات مشتركة
│   ├── context/          # StoreContext (state)
│   ├── hooks/            # custom hooks
│   ├── services/         # API calls
│   └── locales/          # ar + en translations
│
├── public/               # Static files
│   ├── manifest.json     # PWA manifest
│   ├── sw.js            # Service Worker
│   └── icons/           # PWA icons
│
├── uploads/              # ⚠️ ملفات المستخدمين (persist على Render)
│   ├── images/          # صور السيارات
│   ├── documents/
│   ├── media/           # MP3 + PDF
│   └── kyc/             # وثائق التوثيق
│
└── auction.db            # ⚠️ قاعدة البيانات (persist على Render)
```

---

## 📦 المتطلبات

### للتطوير المحلي:
```
- Node.js 20 أو أحدث
- Git
- محرر نصوص (VS Code recommended)
- 4GB RAM على الأقل
```

### للنشر على Render:
```
- حساب Render (Starter plan أو أعلى)
- Persistent Disk (10GB كحد أدنى) — مهم جداً!
- حساب GitHub مربوط
- Domain (اختياري)
```

---

## 🔐 متغيرات البيئة

> **⚠️ مهم:** ضع هذه المتغيرات في لوحة Render (Environment Variables) وليس في الكود.

### ✅ أساسية (مطلوبة):

```env
NODE_ENV=production
PORT=3005
SITE_URL=https://autopro-final.onrender.com
FRONTEND_URL=https://autopro-final.onrender.com
JWT_SECRET=<عشوائي طويل 64+ حرف — غيّره للإنتاج!>
```

### 📧 البريد الإلكتروني (SMTP):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=noreply@autopro.ly
SMTP_PASS=<كلمة مرور التطبيق من Gmail>
SMTP_FROM="AutoPro Libya <noreply@autopro.ly>"
EMAIL_FROM=noreply@autopro.ly
```

### 🔒 OAuth (اختياري لكن مستحسن):

```env
# Google Cloud Console → OAuth 2.0 Client IDs
GOOGLE_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID>.apps.googleusercontent.com

# VITE_ prefix للفرونت إند (وقت البناء)
VITE_GOOGLE_CLIENT_ID=<نفس المفتاح>
```

### 💳 المدفوعات:

```env
# Stripe (للمدفوعات الدولية)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Plutu (للمدفوعات الليبية)
PLUTU_API_KEY=<from plutu.ly>
PLUTU_ACCESS_TOKEN=<...>
PLUTU_SECRET_KEY=<...>
```

### 📱 WhatsApp (اختياري):

```env
WASENDER_TOKEN=<from wasenderapi.com>
```

### 🔔 Push Notifications (VAPID):

> **ملاحظة:** المفاتيح تُولَّد تلقائياً في الـ DB عند أول تشغيل. إذا أردت تمريرها يدوياً:

```env
VAPID_PUBLIC_KEY=<optional - auto-generated>
VAPID_PRIVATE_KEY=<optional - auto-generated>
VAPID_SUBJECT=mailto:info@autopro.ly
```

---

## 💻 التشغيل المحلي

```bash
# 1. استنسخ المشروع
git clone https://github.com/tsallabi/autopro-final.git
cd autopro-final

# 2. ثبّت الحزم
npm install

# 3. أنشئ ملف .env (انسخ القيم من أعلاه)
touch .env

# 4. شغّل في وضع التطوير
npm run dev
# يفتح على http://localhost:3005

# 5. للبناء
npm run build
# ينتج dist/ + server.mjs

# 6. للإنتاج
npm start
```

### الحسابات الافتراضية:
```
Admin:    admin@autopro.com  / admin123
Buyer:    buyer@test.com     / buyer123
Seller:   seller@test.com    / seller123
```

---

## ☁️ النشر على Render

### أولاً: إنشاء الخدمة

1. `https://dashboard.render.com` → **New Web Service**
2. اربط GitHub repo: `tsallabi/autopro-final`
3. اختر Branch: `main`
4. Build Command:
   ```bash
   npm install && npm run build
   ```
5. Start Command:
   ```bash
   npm start
   ```
6. Plan: **Starter** ($7/شهر) — لازم للـ Persistent Disk

### ثانياً: إضافة Persistent Disk ⚠️ مهم جداً

> بدون هذه الخطوة ستفقد كل البيانات والملفات المرفوعة عند كل نشر!

1. في خدمتك → Settings → **Disks** → Add Disk
2. Name: `autopro-data`
3. Mount Path: `/data`
4. Size: **10 GB** (كافي للبداية)

> الكود يقرأ تلقائياً من `/data/auction.db` و `/data/uploads/` على Render.

### ثالثاً: متغيرات البيئة

1. Settings → **Environment**
2. أضف كل المتغيرات من قسم [متغيرات البيئة](#متغيرات-البيئة)

### رابعاً: النشر

- **تلقائي:** أي `git push origin main` يطلق نشر جديد
- **يدوي:** Dashboard → **Manual Deploy** → Deploy latest commit
- **مدة النشر:** 3-5 دقائق عادةً

### خامساً: ربط الدومين (اختياري)

1. Settings → **Custom Domains** → Add Custom Domain
2. أضف `autopro.ly` و `www.autopro.ly`
3. حدّث DNS على domain provider:
   - CNAME: `www` → `autopro-final.onrender.com`
   - A record: `@` → Render IP

---

## 💾 قاعدة البيانات

### النوع: SQLite (better-sqlite3)

- **مسار الملف:** `/data/auction.db` (Render) أو `./auction.db` (محلي)
- **النسخ الاحتياطي:** يجب عمله يدوياً أو بـ cron

### الجداول الرئيسية:
```sql
users              -- المستخدمون
cars               -- السيارات
bids               -- المزايدات
offers             -- العروض
invoices           -- الفواتير
wallet_transactions -- المحفظة
messages           -- الرسائل الداخلية
notifications      -- الإشعارات
shipments          -- الشحنات
dealer_packages    -- باقات التجار
ad_banners         -- البانرات الإعلانية
push_subscriptions -- اشتراكات الإشعارات
shipping_centers   -- مراكز الشحن
coa_accounts       -- الحسابات المحاسبية
journal_entries    -- القيود المحاسبية
yard_* (12 table)  -- نظام الساحات
```

### النسخ الاحتياطي:

**من Shell (Render):**
```bash
# افتح Shell من لوحة Render
cp /data/auction.db /data/backups/auction_$(date +%Y%m%d_%H%M).db

# أو نزّل النسخة على جهازك
# استخدم Shell في Render → sqlite3 /data/auction.db ".dump" > backup.sql
```

**من الجهاز المحلي:**
```bash
# استخدم Render CLI
render ssh autopro-final
# ثم cp /data/auction.db /tmp/
# ثم scp من جهازك
```

**توصية:** أعد هذا كـ cron job شهري.

---

## 🔧 الصيانة الدورية

### يومياً:
- ✅ فحص **Logs** في Render dashboard (Events tab)
- ✅ مراقبة **Memory usage** (لا يتعدى 500MB)
- ✅ فحص طابور **الرسائل غير المرسلة**

### أسبوعياً:
- ✅ نسخة احتياطية من DB
- ✅ مراجعة **KYC requests**
- ✅ مراجعة **withdrawals** و **invoices** المعلقة
- ✅ مسح الصور القديمة غير المستخدمة:
  ```bash
  # في Shell على Render
  find /data/uploads -type f -mtime +180 -size -10k -delete
  ```

### شهرياً:
- ✅ تحديث الحزم:
  ```bash
  npm outdated
  npm update
  ```
- ✅ مراجعة CVE (ثغرات الأمان):
  ```bash
  npm audit
  npm audit fix
  ```
- ✅ تنظيف DB:
  ```sql
  DELETE FROM push_notification_log WHERE sentAt < datetime('now', '-90 days');
  DELETE FROM user_activity WHERE timestamp < datetime('now', '-180 days');
  VACUUM;
  ```

### عند كل نشر:
- ✅ `git pull` و حل conflicts إن وُجدت
- ✅ قراءة commit messages للتغييرات
- ✅ اختبار في staging قبل main (مستحسن)
- ✅ مراقبة logs بعد النشر لمدة 5 دقائق

---

## 🐛 حل المشاكل الشائعة

### 1. السيرفر لا يقلع (EADDRINUSE)

**السبب:** port 3005 مشغول

**الحل:**
```bash
# Windows
netstat -ano | findstr :3005
taskkill /F /PID <PID>

# Linux/Mac
lsof -i :3005
kill -9 <PID>
```

### 2. "Cannot find module" بعد نشر

**السبب:** `npm install` لم يكتمل

**الحل:** Render → Manual Deploy → Clear cache & deploy

### 3. أيقونات PWA لا تظهر

**السبب:** cache المتصفح

**الحل:** 
- المستخدم: Ctrl+Shift+Del → امسح cache
- إعادة تسجيل SW: `navigator.serviceWorker.getRegistrations().then(r => r[0].unregister())`

### 4. رفع الملفات يفشل (403/413)

**أسباب محتملة:**
- حجم أكبر من 25MB → زد limit في `server.ts` multer config
- نوع ملف مرفوض → راجع fileFilter
- Disk ممتلئ → تحقق من مساحة `/data`

### 5. Socket.IO لا يتصل

**السبب:** WebSocket blocked أو Render plan قديم

**الحل:** تأكد أن الخطة **Starter أو أعلى** (free plan لا يدعم WS طويلة)

### 6. Push Notifications لا تصل

**تشخيص:**
```bash
# شوف subscriptions في DB
SELECT COUNT(*) FROM push_subscriptions;

# شوف سجل الإرسال
SELECT * FROM push_notification_log ORDER BY sentAt DESC LIMIT 10;
```

**الحل الشائع:** VAPID keys متغيرة → ولّد جديدة:
```bash
# في Shell على Render
DELETE FROM app_settings WHERE key LIKE 'vapid%';
# أعد تشغيل السيرفر → سيولّد مفاتيح جديدة
```

### 7. المدفوعات Stripe لا تعمل

**تحقق من:**
- `STRIPE_SECRET_KEY` صحيح (sk_live_ للإنتاج، sk_test_ للاختبار)
- Webhook URL في Stripe dashboard يشير لـ `/api/stripe/webhook`
- `STRIPE_WEBHOOK_SECRET` مطابق لـ webhook secret

### 8. الصور المرفوعة لا تظهر

**السبب:** static middleware قبل catch-all SPA

**الحل:** تأكد في `server.ts` أن ترتيب middleware:
```ts
app.use('/uploads', express.static(...));  // ← قبل
app.get('*', spaHandler);                   // ← بعد
```

### 9. "Cannot read properties of undefined (reading 'role')"

**السبب:** user لم يُمرَّر للـ middleware

**الحل:** راجع `lib/middleware.ts` — `requireAuth` يجب أن يستخرج user من JWT

### 10. أداء بطيء

**خطوات التحقق:**
```bash
# حجم DB
ls -lh /data/auction.db

# عدد الصفوف
sqlite3 /data/auction.db "SELECT COUNT(*) FROM cars;"

# indexes مفقودة؟
sqlite3 /data/auction.db ".schema cars" | grep INDEX
```

**تحسينات:**
- أضف indexes على الأعمدة المفلترة
- شغّل `VACUUM` شهرياً
- استخدم pagination (الكود يدعمها عبر `?limit=&offset=`)

---

## 🔒 الأمان

### 1. JWT Secret
- لا تستخدم القيمة الافتراضية في الكود
- 64+ حرف عشوائي: `openssl rand -hex 64`

### 2. Rate Limiting
- الكود يطبق rate limiting على `/api/auth/*` و `/api/push/*`
- زد الحدود إذا احتجت في `server.ts`

### 3. SQL Injection
- كل queries prepared statements — آمنة
- **لا تستخدم** string concatenation مع user input

### 4. XSS
- React escapes افتراضياً — آمن
- **لا تستخدم** `dangerouslySetInnerHTML` مع محتوى مستخدم

### 5. File Uploads
- multer يتحقق من mime type + حجم
- تأكد من hasن `fileFilter` في كل upload endpoint

### 6. CORS
- في production: حصر `FRONTEND_URL` فقط
- في development: `*` مسموح

### 7. Admin Actions
- كل endpoint حساس محمي بـ `requireAdmin`
- سجّل كل الإجراءات الحساسة في `admin_audit_log`

### 8. Secrets Rotation
- غيّر `JWT_SECRET` كل 6 أشهر (سيخرج جميع المستخدمين)
- غيّر كلمات SMTP إذا شككت في تسريب

---

## 💡 نصائح مهمة

### 🎯 للإنتاج:

1. **فعّل Logging:**
   - راقب logs Render باستمرار
   - سجّل أخطاء crucial في DB أو خدمة خارجية (Sentry مستحسن)

2. **نسخ احتياطية منتظمة:**
   - DB يومياً
   - Uploads أسبوعياً
   - خزّنها على S3 أو Google Drive

3. **Monitoring:**
   - استخدم Render's built-in metrics
   - أضف uptime monitor (UptimeRobot مجاناً)

4. **SSL:**
   - Render يوفر SSL تلقائياً
   - لو استخدمت Cloudflare، فعّل "Full (Strict)"

5. **SEO:**
   - `index.html` فيه meta tags جاهزة
   - أضف `sitemap.xml` للـ crawlers
   - حدّث `robots.txt`

### 🚨 تحذيرات:

1. **لا تعدّل DB schema مباشرة** — استخدم migration في `server.ts` startup
2. **لا تحذف migrations** — السيرفر يتوقع هيكل معين
3. **لا تشغّل `DROP TABLE`** بدون نسخة احتياطية
4. **لا تغيّر `uploads/` path** بدون نقل الملفات
5. **لا تكشف `auction.db` عبر HTTP** (الكود يخفيه افتراضياً)

### 📈 للتوسع:

لو عدد المستخدمين نما:
- **>10k users:** انقل من SQLite إلى PostgreSQL
- **>100 concurrent:** انقل من Render إلى AWS/DigitalOcean
- **Global traffic:** أضف Cloudflare CDN للـ static assets

---

## 📞 جهات اتصال للدعم

| الخدمة | الاستخدام | روابط |
|--------|----------|-------|
| Render | الاستضافة | https://render.com/docs |
| Stripe | المدفوعات | https://stripe.com/docs |
| Plutu | الدفع الليبي | https://plutu.ly |
| Google Cloud | OAuth | https://console.cloud.google.com |
| GitHub | الكود | https://github.com/tsallabi/autopro-final |

---

## 🛠️ أوامر مفيدة للمطور

```bash
# فحص حالة المشروع
git status
git log --oneline -20

# تحديث من GitHub
git pull origin main

# بناء محلي قبل الدفع
npm run build
npm run lint

# شغّل tests
npm run test:e2e

# نسخة احتياطية
cp auction.db auction_backup_$(date +%Y%m%d).db

# فحص حجم DB + uploads
du -sh auction.db uploads/

# فحص العمليات الشغالة
ps aux | grep node

# إعادة تشغيل السيرفر محلياً
pkill node; npm run dev
```

---

## 📝 سجل التغييرات (Changelog)

راجع `git log` للتغييرات الكاملة. أحدث الميزات:
- ✅ نظام البانرات الإعلانية
- ✅ سلايدر السيارات المميزة
- ✅ تبويب "اشتري الآن"
- ✅ زر صوت المحرك في Marketplace
- ✅ PWA كامل + Push Notifications
- ✅ Camera Capture + Geolocation
- ✅ نموذج ليبيا برو للتقنية
- ✅ Yard Management System

---

## 🎓 خلاصة

هذا المشروع **production-ready** ومُختبر. المهم:
1. **افهم هيكل الـ routes** قبل تعديل أي endpoint
2. **اعمل نسخة احتياطية** قبل أي تعديل على DB
3. **اختبر محلياً أولاً** ثم ادفع للإنتاج
4. **راقب logs** بعد كل نشر
5. **لا تحذف** شيء بدون فهمه

**بالتوفيق! 🚀**

---

*هذا الدليل مكتوب بتاريخ 17 أبريل 2026 — للتحديثات، راجع README.md وملفات CLAUDE.md*
