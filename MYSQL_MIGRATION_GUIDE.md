# 🗄️ دليل الانتقال من SQLite إلى MySQL

> **دليل شامل للمبرمج لترقية AutoPro من SQLite إلى MySQL**
>
> تاريخ: 19 أبريل 2026
> المالك: طارق السلابي
> المقدّر: 2-3 أيام عمل (احتياط لأسبوع للسلامة)

---

## ⚠️ اقرأ أولاً قبل البدء

### ✅ مميزات الانتقال:
- 🚀 أداء أفضل للكتابة المتزامنة
- 🔁 Replication + Master-Slave
- 📊 إمكانية التوسع لملايين السجلات
- 👥 عشرات الآلاف من المستخدمين المتزامنين
- 🛡️ أدوات backup/restore متقدمة
- 🔄 Failover تلقائي ممكن

### ⚠️ سلبيات:
- ❌ إعداد أعقد (MySQL server + user + passwords)
- ❌ صيانة دورية مطلوبة
- ❌ أوامر SQL مختلفة قليلاً
- ❌ Migration يحتاج اختبار شامل
- ❌ إذا كسرت شيء، استعادة البيانات أصعب

### 📊 متى يكون MySQL ضرورياً؟
- عدد المستخدمين > 10,000
- حجم قاعدة البيانات > 5 GB
- عدة سيرفرات (load balancing)
- 100+ admin متزامن

**AutoPro حالياً لا يحتاج MySQL — لكن إذا قررتم الانتقال، هذا الدليل كامل.**

---

## 📋 خطة العمل (3 أيام)

### اليوم 1: التحضير (4 ساعات)
- ✅ تثبيت MySQL server
- ✅ إنشاء database + user
- ✅ توليد schema من SQLite
- ✅ نسخة احتياطية كاملة من SQLite

### اليوم 2: الكود (8 ساعات)
- ✅ استبدال better-sqlite3 بـ mysql2
- ✅ تحويل كل الـ queries
- ✅ إصلاح الفروقات (datetime, booleans)
- ✅ اختبار محلي

### اليوم 3: الترحيل + الاختبار (6 ساعات)
- ✅ نقل البيانات من SQLite إلى MySQL
- ✅ اختبار شامل لكل ميزة
- ✅ النشر على السيرفر
- ✅ مراقبة

---

## 🛠️ الخطوة 1: تثبيت MySQL

### على Ubuntu/Debian (سيرفر الإنتاج):

```bash
sudo apt update
sudo apt install mysql-server -y
sudo systemctl start mysql
sudo systemctl enable mysql

# Secure setup
sudo mysql_secure_installation
# اجب بـ Y على كل شيء
# ضع كلمة root قوية (احفظها!)
```

### إنشاء Database + User:

```bash
sudo mysql -u root -p

# داخل mysql shell:
CREATE DATABASE autopro_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'autopro_user'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON autopro_db.* TO 'autopro_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 📦 الخطوة 2: ترحيل البيانات

### السكريبت التلقائي (`migrate-sqlite-to-mysql.js`):

```javascript
// ضع هذا في: scripts/migrate-to-mysql.js
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const SQLITE_PATH = process.env.SQLITE_PATH || './auction.db';
const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'autopro_user',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'autopro_db',
  charset: 'utf8mb4'
};

async function migrate() {
  console.log('🚀 Starting migration from SQLite to MySQL...\n');

  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);

  console.log('✅ Connected to both databases\n');

  // Get all tables
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all();

  console.log(`Found ${tables.length} tables to migrate:`);
  tables.forEach(t => console.log(`  - ${t.name}`));
  console.log();

  for (const { name: tableName } of tables) {
    console.log(`\n📋 Migrating table: ${tableName}`);

    // Get columns from SQLite
    const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all();

    // Build CREATE TABLE for MySQL
    const columnDefs = columns.map(col => {
      let mysqlType = 'VARCHAR(255)';
      const type = (col.type || '').toUpperCase();

      if (type.includes('INT')) mysqlType = 'INT';
      else if (type.includes('REAL') || type.includes('FLOAT') || type.includes('DOUBLE')) mysqlType = 'DOUBLE';
      else if (type.includes('TEXT') || type.includes('VARCHAR')) mysqlType = 'TEXT';
      else if (type.includes('BLOB')) mysqlType = 'BLOB';
      else if (type.includes('DATETIME') || type.includes('TIMESTAMP')) mysqlType = 'DATETIME';
      else if (type.includes('BOOLEAN')) mysqlType = 'TINYINT(1)';

      const notNull = col.notnull ? 'NOT NULL' : 'NULL';
      const defaultValue = col.dflt_value !== null 
        ? `DEFAULT ${typeof col.dflt_value === 'string' && isNaN(col.dflt_value) ? `'${col.dflt_value}'` : col.dflt_value}` 
        : '';
      const pk = col.pk ? 'PRIMARY KEY' : '';

      return `\`${col.name}\` ${mysqlType} ${notNull} ${defaultValue} ${pk}`.trim().replace(/\s+/g, ' ');
    });

    const createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${columnDefs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
    await mysqlConn.query(createSql);
    console.log(`  ✅ Created table structure`);

    // Get all rows
    const rows = sqlite.prepare(`SELECT * FROM \`${tableName}\``).all();
    console.log(`  📊 Found ${rows.length} rows`);

    if (rows.length === 0) continue;

    // Insert in batches of 500
    const batchSize = 500;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const cols = Object.keys(batch[0]);
      const placeholders = batch.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
      const values = batch.flatMap(row => cols.map(c => row[c]));

      const insertSql = `INSERT INTO \`${tableName}\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES ${placeholders}`;
      try {
        await mysqlConn.query(insertSql, values);
        console.log(`  ⏳ Inserted ${Math.min(i + batchSize, rows.length)}/${rows.length}`);
      } catch (err) {
        console.error(`  ❌ Error on batch: ${err.message}`);
      }
    }
  }

  await mysqlConn.end();
  sqlite.close();
  console.log('\n🎉 Migration complete!');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
```

### تشغيل السكريبت:

```bash
cd /path/to/autopro-final

# ثبت mysql2
npm install mysql2

# شغّل السكريبت
MYSQL_HOST=localhost \
MYSQL_USER=autopro_user \
MYSQL_PASSWORD=your_password \
MYSQL_DATABASE=autopro_db \
SQLITE_PATH=/data/auction.db \
node scripts/migrate-to-mysql.js
```

**المدة المتوقعة:** 10-30 دقيقة حسب حجم البيانات.

---

## 🔧 الخطوة 3: تعديل الكود (الأصعب)

### استبدال المكتبة:

```bash
npm uninstall better-sqlite3
npm install mysql2
```

### `server.ts` — التعديلات المطلوبة:

```ts
// ❌ قديم (SQLite):
import Database from 'better-sqlite3';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ✅ جديد (MySQL):
import mysql from 'mysql2/promise';
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 20,
  charset: 'utf8mb4'
});
```

### تحويل الـ queries (نمط التغيير):

#### 1. SELECT:
```ts
// ❌ SQLite:
const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

// ✅ MySQL:
const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
const user = rows[0];
```

#### 2. INSERT:
```ts
// ❌ SQLite:
db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, email);

// ✅ MySQL:
await pool.query("INSERT INTO users (id, email) VALUES (?, ?)", [id, email]);
```

#### 3. UPDATE:
```ts
// ❌ SQLite:
db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, id);

// ✅ MySQL:
await pool.query("UPDATE users SET email = ? WHERE id = ?", [email, id]);
```

#### 4. Transactions:
```ts
// ❌ SQLite:
const result = db.transaction(() => {
  db.prepare(...).run(...);
  return ...;
})();

// ✅ MySQL:
const conn = await pool.getConnection();
await conn.beginTransaction();
try {
  await conn.query(...);
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```

#### 5. Boolean columns:
```ts
// SQLite: يخزن 0/1
// MySQL: تستخدم TINYINT(1) أو BOOLEAN

// ✅ تعامل بنفس الطريقة (0/1)
await pool.query("UPDATE users SET isVerified = ? WHERE id = ?", [verified ? 1 : 0, id]);
```

#### 6. DateTime:
```ts
// SQLite: يخزن ISO strings
// MySQL: يدعم DATETIME

// ✅ استخدم ISO strings أو objects Date
const now = new Date();
await pool.query("UPDATE users SET lastLogin = ? WHERE id = ?", [now, id]);
```

#### 7. ALTER TABLE IF NOT EXISTS COLUMN:
```ts
// ❌ MySQL لا يدعم IF NOT EXISTS للأعمدة
// ✅ استخدم try/catch كما في الكود الحالي

try {
  await pool.query("ALTER TABLE users ADD COLUMN profilePic TEXT");
} catch (err) {
  // Column already exists
}
```

---

## 🎯 استراتيجية التعديل:

### الطريقة الذكية: DB Abstraction Layer

بدل تعديل 7000+ سطر في server.ts، أنشئ **adapter layer**:

```ts
// lib/db.ts — طبقة موحدة
import mysql from 'mysql2/promise';

const pool = mysql.createPool({...});

export const db = {
  // محاكاة API الخاصة بـ better-sqlite3
  prepare: (sql: string) => ({
    get: async (...params: any[]) => {
      const [rows] = await pool.query(sql, params);
      return (rows as any[])[0];
    },
    all: async (...params: any[]) => {
      const [rows] = await pool.query(sql, params);
      return rows as any[];
    },
    run: async (...params: any[]) => {
      const [result] = await pool.query(sql, params);
      return result;
    }
  }),
  exec: async (sql: string) => {
    await pool.query(sql);
  },
  transaction: <T>(fn: (conn: mysql.PoolConnection) => Promise<T>) => async () => {
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
};
```

**ملاحظة مهمة:** MySQL **async** بينما SQLite **sync**. يعني كل query يحتاج `await`.

هذا يحتاج تعديل كل سطر في الكود — وهنا تقدير الوقت الحقيقي:

- **server.ts:** ~800 تعديل
- **routes/*.ts:** ~200 تعديل
- **lib/*.ts:** ~50 تعديل

**مجموع التعديلات: ~1050 موقع.**

**المدة الواقعية:** 3-5 أيام عمل مستمر + 2 يوم اختبار.

---

## 🗂️ الخطوة 4: Schema الكامل (SQL)

إذا أردت إنشاء الجداول يدوياً بدل الاعتماد على migration script:

```sql
-- تشغيل على MySQL shell:
USE autopro_db;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  firstName VARCHAR(100),
  lastName VARCHAR(100),
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(50),
  password VARCHAR(255),
  role VARCHAR(50) DEFAULT 'buyer',
  status VARCHAR(50) DEFAULT 'active',
  kycStatus VARCHAR(50) DEFAULT 'pending',
  deposit DOUBLE DEFAULT 0,
  buyingPower DOUBLE DEFAULT 0,
  commission DOUBLE DEFAULT 0,
  country VARCHAR(100),
  city VARCHAR(100),
  address1 TEXT,
  address2 TEXT,
  companyName VARCHAR(200),
  profilePic TEXT,
  googleId VARCHAR(255),
  facebookId VARCHAR(255),
  isEmailVerified TINYINT(1) DEFAULT 0,
  packageId VARCHAR(50) DEFAULT 'basic',
  walletBalance DOUBLE DEFAULT 0,
  joinDate DATETIME,
  lastLogin DATETIME,
  loginCount INT DEFAULT 0,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cars (
  id VARCHAR(100) PRIMARY KEY,
  lotNumber VARCHAR(50),
  vin VARCHAR(50) UNIQUE,
  make VARCHAR(100),
  model VARCHAR(100),
  year INT,
  odometer INT,
  engine VARCHAR(100),
  transmission VARCHAR(50),
  drive VARCHAR(50),
  fuelType VARCHAR(50),
  primaryDamage VARCHAR(100),
  titleType VARCHAR(100),
  location VARCHAR(200),
  currentBid DOUBLE DEFAULT 0,
  reservePrice DOUBLE DEFAULT 0,
  buyItNow DOUBLE,
  startingBid DOUBLE,
  status VARCHAR(50) DEFAULT 'upcoming',
  images TEXT,
  sellerId VARCHAR(100),
  winnerId VARCHAR(100),
  showroomName VARCHAR(200),
  isRecommended TINYINT(1) DEFAULT 0,
  isBuyNow TINYINT(1) DEFAULT 0,
  engineAudioUrl TEXT,
  engineVideoUrl TEXT,
  inspectionPdf TEXT,
  auctionEndDate DATETIME,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_seller (sellerId),
  INDEX idx_createdAt (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS bids (
  id VARCHAR(100) PRIMARY KEY,
  carId VARCHAR(100),
  userId VARCHAR(100),
  amount DOUBLE,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  type VARCHAR(50) DEFAULT 'manual',
  proxyMax DOUBLE,
  status VARCHAR(50),
  updatedAt DATETIME,
  INDEX idx_car (carId),
  INDEX idx_user (userId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- وهكذا لكل الجداول...
-- الكود التلقائي في migration script يفعل هذا لك
```

---

## 🧪 الخطوة 5: الاختبار الشامل

قبل النشر على الإنتاج، اختبر كل شيء محلياً:

### Checklist الاختبار:
- [ ] تسجيل دخول (admin + user + seller)
- [ ] تسجيل مستخدم جديد
- [ ] Google OAuth
- [ ] إضافة سيارة
- [ ] تعديل سيارة
- [ ] المزايدة على سيارة
- [ ] Proxy bidding
- [ ] Buy Now
- [ ] إغلاق مزاد
- [ ] إصدار فاتورة
- [ ] الدفع (Stripe test mode)
- [ ] رفع صور/ملفات
- [ ] Admin dashboard كامل
- [ ] Analytics
- [ ] Accounting
- [ ] KYC approval
- [ ] Messages
- [ ] Notifications
- [ ] Real-time Socket.IO

**إذا نجح كل شيء محلياً — انشر.**

---

## 🚀 الخطوة 6: النشر على الإنتاج

```bash
# 1. نسخة احتياطية من SQLite (احتياط)
cp /data/auction.db /data/auction.db.backup.$(date +%Y%m%d)

# 2. إعداد MySQL على السيرفر
sudo apt install mysql-server
sudo mysql_secure_installation
# ... إعداد user + database

# 3. نقل البيانات
cd /path/to/autopro-final
git pull origin main
npm install
MYSQL_HOST=localhost \
MYSQL_USER=autopro_user \
MYSQL_PASSWORD=... \
MYSQL_DATABASE=autopro_db \
node scripts/migrate-to-mysql.js

# 4. حدّث Environment Variables:
# أزل: SQLITE_PATH, DATA_DIR (للـ DB)
# أضف:
#   MYSQL_HOST=localhost
#   MYSQL_USER=autopro_user
#   MYSQL_PASSWORD=...
#   MYSQL_DATABASE=autopro_db

# 5. بناء جديد + إعادة تشغيل
npm run build
pm2 restart all

# 6. راقب اللوجز
pm2 logs autopro --lines 100
```

---

## 🛡️ خطة الطوارئ (Rollback)

إذا حدثت مشكلة بعد النشر:

```bash
# 1. أوقف السيرفر الجديد
pm2 stop autopro

# 2. ارجع للنسخة القديمة (SQLite)
git checkout <commit_before_mysql>
npm install
npm run build

# 3. استعد auction.db الأصلية
cp /data/auction.db.backup.* /data/auction.db

# 4. شغّل من جديد
pm2 restart autopro

# ✅ الموقع يعمل بـ SQLite من جديد
```

---

## 💰 التكلفة التقديرية

| البند | التكلفة |
|------|---------|
| وقت التطوير (5-7 أيام × 8 ساعات) | 40-56 ساعة |
| MySQL Server (إذا منفصل) | $15-30/شهر |
| DBA (مراقبة شهرية) | اختياري |
| **المجموع** | **~$500-800 لمرة واحدة + $20/شهر** |

**مقابل SQLite:** مجاني تماماً، صفر صيانة.

---

## 📊 مقارنة نهائية

| المعيار | SQLite (حالياً) | MySQL (المقترح) |
|---------|-----------------|------------------|
| الأداء (حتى 1000 user) | ✅ ممتاز | ✅ ممتاز |
| الأداء (10,000 user) | 🟡 جيد | ✅ ممتاز |
| الأداء (100,000 user) | ❌ بطيء | ✅ ممتاز |
| التكلفة الأولية | 🆓 مجاني | 💰 400-800$ |
| الصيانة الشهرية | 🆓 صفر | 💰 ساعة/شهر |
| البساطة | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| Scalability | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| النسخ الاحتياطي | نسخ ملف | mysqldump |
| الاسترداد | ثانية | دقائق |

---

## 🎯 توصيتي النهائية:

### ✅ ابقَ على SQLite إذا:
- أقل من 5000 مستخدم
- سيرفر واحد فقط
- أحمد غير متخصص في MySQL
- تريد بساطة وأقل صيانة

### ✅ انتقل لـ MySQL إذا:
- متوقع نمو سريع (>10K user خلال سنة)
- عدة مكاتب تعمل في نفس الوقت
- أحمد خبير MySQL
- ميزانية الصيانة متوفرة

### 💡 الحل الوسط (موصى به):
**ابقَ على SQLite الآن** + ضع قاعدة البيانات في `/data/` (آمن 100% من الـ deploy).

**خطط للانتقال** بعد 6 أشهر إذا وصلت إلى 3000+ مستخدم نشط.

---

## 📞 للدعم:

- GitHub: https://github.com/tsallabi/autopro-final
- طارق السلابي — المالك
- Claude AI — المهندس الأصلي (عبر طارق)

---

*هذا الدليل مكتوب بتاريخ 19 أبريل 2026*
*آخر تحديث: Commit pending*
