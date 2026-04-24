# 🌊 دليل إعداد AutoPro على DigitalOcean

> **الهدف: استضافة AutoPro + مشاريع أخرى على نفس السيرفر بأقل تكلفة**
>
> تاريخ: 24 أبريل 2026
> الاستضافة: DigitalOcean Droplet
> المالك: طارق السلابي

---

## 🎯 لماذا Droplet وليس App Platform؟

| الميزة | Droplet | App Platform |
|--------|---------|--------------|
| **السعر** | $6/شهر | $12/شهر |
| **عدد المشاريع** | ∞ | 1 |
| **التحكم الكامل** | ✅ SSH root | ❌ محدود |
| **استضافة WordPress/PHP** | ✅ | ❌ |
| **Custom Nginx/Apache** | ✅ | ❌ |

**الخلاصة:** بنفس السعر، Droplet يعطيك مرونة لا نهائية.

---

## 🚀 الخطة الكاملة (2-3 ساعات)

### المرحلة 1: إنشاء Droplet (20 دقيقة)

#### 1. افتح DigitalOcean Dashboard
🔗 https://cloud.digitalocean.com

#### 2. Create → Droplet

**الإعدادات الموصى بها:**

| الخيار | الاختيار |
|--------|----------|
| **Region** | Frankfurt 🇩🇪 (أقرب للشرق الأوسط) |
| **Datacenter** | Frankfurt 1 |
| **Image** | Ubuntu 24.04 LTS |
| **Size** | Basic - Regular Intel - $6/mo (1GB RAM, 1 vCPU, 25GB SSD) |
| **Authentication** | SSH Keys (أفضل من password) |
| **Hostname** | autopro-main |

#### 3. أضف SSH Key

إذا لم يكن لديك SSH key:

```bash
# على جهازك (Windows PowerShell):
ssh-keygen -t ed25519 -C "tarek@autopro.ac"

# اعرض المفتاح العام:
cat ~/.ssh/id_ed25519.pub

# انسخ النتيجة الكاملة
```

في DigitalOcean → New SSH Key → ألصق المحتوى.

#### 4. اضغط Create Droplet

انتظر 30 ثانية — ستحصل على IP address مثل `165.22.123.45`

---

### المرحلة 2: إعداد السيرفر (30 دقيقة)

#### 1. اتصل بالسيرفر:

```bash
ssh root@165.22.123.45
# (غيّر IP لعنوان Droplet عندك)
```

#### 2. حدّث النظام:

```bash
apt update && apt upgrade -y
```

#### 3. ثبّت Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version  # يجب أن يُظهر v20.x
```

#### 4. ثبّت الأدوات المطلوبة:

```bash
apt install -y git nginx sqlite3 certbot python3-certbot-nginx ufw
npm install -g pm2
```

#### 5. إعداد جدار الحماية:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
# اضغط Y للتأكيد
```

#### 6. أنشئ مستخدم غير root (للأمان):

```bash
adduser autopro
usermod -aG sudo autopro

# انسخ SSH key:
rsync --archive --chown=autopro:autopro ~/.ssh /home/autopro

# الآن تواصل بـ autopro@ip بدل root@ip:
# exit
# ssh autopro@165.22.123.45
```

---

### المرحلة 3: نشر AutoPro (45 دقيقة)

#### 1. استنسخ المشروع:

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www
git clone https://github.com/tsallabi/autopro-final.git autopro
cd autopro
```

#### 2. أنشئ مجلد /data/:

```bash
sudo mkdir -p /data/uploads/{images,documents,media,kyc}
sudo chown -R $USER:$USER /data
```

#### 3. ثبّت الحزم:

```bash
npm install
```

#### 4. أنشئ `.env`:

```bash
nano .env
```

ألصق:
```env
NODE_ENV=production
PORT=3005
DATA_DIR=/data

SITE_URL=https://autopro.ac
FRONTEND_URL=https://autopro.ac

JWT_SECRET=<قيمة عشوائية طويلة - نفذ: openssl rand -hex 64>

GOOGLE_CLIENT_ID=<من Google Cloud Console>
VITE_GOOGLE_CLIENT_ID=<نفس القيمة>
GOOGLE_CLIENT_SECRET=<من Google Cloud Console>

FACEBOOK_APP_ID=<من Facebook Developers>
VITE_FACEBOOK_APP_ID=<نفس القيمة>
FACEBOOK_APP_SECRET=<من Facebook Developers>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=info@autopro.ac
SMTP_PASS=<App Password من Gmail>
SMTP_FROM="AutoPro Libya <info@autopro.ac>"
```

احفظ: `Ctrl+O` → Enter → `Ctrl+X`

#### 5. ابنِ المشروع:

```bash
npm run build
```

#### 6. شغّل مع PM2:

```bash
pm2 start server.mjs --name autopro
pm2 save
pm2 startup
# اتبع التعليمات (سيطلب منك تنفيذ أمر sudo)
```

#### 7. تحقق:

```bash
pm2 status
pm2 logs autopro --lines 20
```

يجب أن ترى:
```
✅ HTTP Server listening on http://localhost:3005
[BOOT] DATA_DIR=/data
[BOOT] DB path: /data/auction.db
```

---

### المرحلة 4: Nginx + SSL (30 دقيقة)

#### 1. أنشئ إعدادات Nginx:

```bash
sudo nano /etc/nginx/sites-available/autopro
```

ألصق:

```nginx
server {
    listen 80;
    server_name autopro.ac www.autopro.ac;

    # زيادة حجم الـ upload
    client_max_body_size 100M;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # الصور والملفات المرفوعة
    location /uploads/ {
        alias /data/uploads/;
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Socket.IO للمزادات الحية
    location /socket.io/ {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # باقي الطلبات للـ Node.js
    location / {
        proxy_pass http://localhost:3005;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 2. فعّل الموقع:

```bash
sudo ln -s /etc/nginx/sites-available/autopro /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

#### 3. اربط الـ Domain:

في لوحة تحكم domain (حيث اشتريت `autopro.ac`):

**أضف A Record:**
- Name: `@`
- Value: `165.22.123.45` (IP السيرفر)
- TTL: 3600

**أضف A Record ثاني:**
- Name: `www`
- Value: `165.22.123.45`
- TTL: 3600

**انتظر 5-30 دقيقة** لـ DNS propagation.

تحقق:
```bash
ping autopro.ac
# يجب أن ترى IP السيرفر
```

#### 4. أضف SSL مجاني:

```bash
sudo certbot --nginx -d autopro.ac -d www.autopro.ac

# أجب:
# - Email: tareksallabi@macchinaa.com
# - Terms: A (Agree)
# - Share email: N
# - Redirect HTTP to HTTPS: 2 (Yes)
```

**تم!** الموقع الآن على `https://autopro.ac` مع SSL مجاني.

---

### المرحلة 5: نقل البيانات من سيرفر أحمد (30 دقيقة)

#### من جهازك المحلي:

```bash
# انزل البيانات من سيرفر أحمد
scp user@77.237.245.41:/data/auction.db ~/Downloads/
scp -r user@77.237.245.41:/data/uploads ~/Downloads/

# ارفعها على DigitalOcean:
scp ~/Downloads/auction.db autopro@165.22.123.45:/data/
scp -r ~/Downloads/uploads/* autopro@165.22.123.45:/data/uploads/
```

#### على السيرفر الجديد:

```bash
ssh autopro@165.22.123.45
cd /var/www/autopro

# أعد التشغيل ليلتقط البيانات
pm2 restart autopro

# تحقق
pm2 logs autopro --lines 20
```

---

## 🚀 كيفية إضافة مشاريع أخرى على نفس السيرفر

### أضف مشروع جديد (مثلاً: `example.com`):

#### 1. استنسخ المشروع:

```bash
cd /var/www
git clone https://github.com/user/project2.git
cd project2
npm install
npm run build
```

#### 2. شغّل على port مختلف:

في `.env` للمشروع الجديد:
```env
PORT=3006  # مختلف عن AutoPro (3005)
```

```bash
pm2 start server.js --name project2
pm2 save
```

#### 3. أضف إعدادات Nginx:

```bash
sudo nano /etc/nginx/sites-available/project2
```

```nginx
server {
    listen 80;
    server_name example.com www.example.com;

    location / {
        proxy_pass http://localhost:3006;
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/project2 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d example.com -d www.example.com
```

**تم!** مشروع ثاني على نفس السيرفر.

---

## 💾 النسخ الاحتياطية التلقائية

### سكريبت يومي:

```bash
sudo nano /usr/local/bin/backup-autopro.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/data/backups"
mkdir -p "$BACKUP_DIR"

# Database backup
cp /data/auction.db "$BACKUP_DIR/auction_${DATE}.db"

# Uploads backup (weekly on Sundays)
if [ "$(date +%u)" = "7" ]; then
    tar -czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" -C /data uploads/
fi

# حذف النسخ الأقدم من 30 يوم
find "$BACKUP_DIR" -name "auction_*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime +60 -delete

echo "[$(date)] Backup complete"
```

```bash
sudo chmod +x /usr/local/bin/backup-autopro.sh

# Cron يومي الساعة 3 صباحاً
sudo crontab -e
# أضف:
0 3 * * * /usr/local/bin/backup-autopro.sh >> /data/backup.log 2>&1
```

### نسخ احتياطية لـ DigitalOcean Spaces (اختياري):

```bash
# ثبّت s3cmd
sudo apt install -y s3cmd

# إعداد Spaces
s3cmd --configure
# Access Key + Secret من DigitalOcean → API → Spaces Keys

# رفع backup يومي
0 4 * * * s3cmd put /data/backups/auction_*.db s3://autopro-backups/
```

**DigitalOcean Spaces:** $5/شهر لـ 250GB + 1TB bandwidth.

---

## 📊 إدارة السيرفر بدون أحمد

### الأوامر اليومية:

```bash
# شوف حالة السيرفر:
pm2 status
pm2 logs autopro --tail 50

# إعادة تشغيل سريع:
pm2 restart autopro

# تحقق من المساحة:
df -h
du -sh /data/

# تحقق من RAM/CPU:
htop  # إذا لم يكن مثبت: apt install htop
```

### تحديث AutoPro (بدل git pull يدوي):

```bash
cd /var/www/autopro
git pull origin main
npm install
npm run build
pm2 restart autopro
```

### أو أنشئ سكريبت تحديث:

```bash
nano ~/deploy-autopro.sh
```

```bash
#!/bin/bash
cd /var/www/autopro
echo "📥 Pulling latest..."
git pull origin main
echo "📦 Installing..."
npm install --silent
echo "🔨 Building..."
rm -rf dist node_modules/.vite
npm run build
echo "🔄 Restarting..."
pm2 restart autopro
echo "✅ Deploy complete!"
pm2 logs autopro --lines 20 --nostream
```

```bash
chmod +x ~/deploy-autopro.sh
```

الآن للنشر:
```bash
~/deploy-autopro.sh
```

---

## 🛡️ الأمان

### 1. فعّل automatic security updates:

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
# اختر Yes
```

### 2. غيّر port SSH الافتراضي (اختياري):

```bash
sudo nano /etc/ssh/sshd_config
# غيّر: Port 22 → Port 2222
sudo systemctl restart ssh
sudo ufw allow 2222/tcp
sudo ufw delete allow OpenSSH
```

### 3. تعطيل root SSH:

```bash
sudo nano /etc/ssh/sshd_config
# غيّر: PermitRootLogin yes → PermitRootLogin no
sudo systemctl restart ssh
```

### 4. Fail2Ban (حماية من الـ brute force):

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 📊 المراقبة المجانية

### 1. UptimeRobot:
🔗 https://uptimerobot.com
- أضف: `https://autopro.ac`
- Check every 5 minutes
- Email alerts

### 2. DigitalOcean Monitoring:
- Dashboard → Droplet → **Enable Monitoring** (مجاني)
- يعطي graphs للـ CPU, RAM, Disk, Network

### 3. Logs مباشرة:

```bash
# اتصل بالسيرفر في أي وقت:
ssh autopro@autopro.ac
pm2 monit  # واجهة تفاعلية
```

---

## 💰 المقارنة النهائية

### DigitalOcean Droplet $6/شهر يعطيك:

✅ **AutoPro** (المشروع الحالي)
✅ **مشروع ثاني** (مستقبلاً)
✅ **مشروع ثالث** (مستقبلاً)
✅ **Dev environment** للاختبار
✅ **Backups** تلقائية
✅ **Full SSH control**
✅ **Nginx reverse proxy**
✅ **SSL مجاني** لكل الـ domains

### بالمقارنة مع App Platform:
- App Platform: $12/شهر **لكل مشروع**
- 4 مشاريع = $48/شهر
- **Droplet: $6/شهر للأربعة** — توفير $504/سنة!

---

## ⏱️ الوقت الإجمالي:

- ✅ إنشاء Droplet: 20 دقيقة
- ✅ إعداد السيرفر: 30 دقيقة
- ✅ نشر AutoPro: 45 دقيقة
- ✅ Nginx + SSL: 30 دقيقة
- ✅ نقل البيانات: 30 دقيقة
- ✅ النسخ الاحتياطية: 15 دقيقة
- **المجموع: ~3 ساعات** (مرة واحدة)

بعدها: **كل تحديث في 5 دقائق** فقط!

---

## 🎯 بعد الإعداد:

### أنت مستقل تماماً:
- ✅ تنشر بنفسك (`~/deploy-autopro.sh`)
- ✅ تراقب بنفسك (UptimeRobot + pm2 monit)
- ✅ نسخ احتياطية تلقائية
- ✅ Claude يدخل عبر SSH ويساعدك

### لا تحتاج أحمد إلا في:
- 🆘 كارثة كاملة (احتمال 0.01%)
- 🏗️ تحتاج بنية معقدة جداً (microservices)

---

## 🚀 الخطوة التالية:

**قل لي:**

### "ابدأ" 
→ سأوجهك خطوة بخطوة الآن في إنشاء Droplet

### "عندي أسئلة"
→ اسأل أي شيء قبل البدء

---

*تاريخ الإنشاء: 24 أبريل 2026*
*Estimated cost savings: $500-1200/year vs Railway Pro or App Platform*
