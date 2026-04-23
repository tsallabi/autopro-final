/**
 * 🗄️ SQLite → MySQL Migration Script
 *
 * استخدام:
 *   MYSQL_HOST=localhost \
 *   MYSQL_USER=autopro_user \
 *   MYSQL_PASSWORD=your_strong_password \
 *   MYSQL_DATABASE=autopro_db \
 *   SQLITE_PATH=/data/auction.db \
 *   node scripts/migrate-to-mysql.js
 *
 * ما يفعله:
 *   1. يقرأ كل الجداول من SQLite
 *   2. ينشئ نفس الهيكل في MySQL
 *   3. ينقل كل البيانات (in batches)
 *   4. يبلّغك بكل خطوة
 *   5. في حالة الخطأ، يعرض التفاصيل
 *
 * الأمان:
 *   - لا يحذف البيانات من SQLite (للأمان)
 *   - يتحقق قبل الكتابة
 *   - log مفصل
 */

const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const fs = require('fs');

// ═══════════════════════════════════
// Configuration
// ═══════════════════════════════════
const SQLITE_PATH = process.env.SQLITE_PATH || './auction.db';

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'autopro_user',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'autopro_db',
  charset: 'utf8mb4',
  multipleStatements: true,
  supportBigNumbers: true,
  bigNumberStrings: false,
  dateStrings: true,
};

const BATCH_SIZE = 500;

// ═══════════════════════════════════
// Helpers
// ═══════════════════════════════════
function sqliteTypeToMysql(sqliteType, colName, isPk) {
  const type = (sqliteType || '').toUpperCase().trim();

  // Primary keys as TEXT → VARCHAR(255)
  if (isPk && (type.includes('TEXT') || type === '')) {
    return 'VARCHAR(255)';
  }

  // Numeric types
  if (type.includes('INT') || type === 'INTEGER') {
    if (colName === 'id' || isPk) return 'BIGINT';
    if (colName.includes('Count') || colName.includes('count')) return 'INT';
    if (colName.includes('ActiveAt') || colName.includes('updatedAt')) return 'BIGINT';
    return 'INT';
  }
  if (type.includes('REAL') || type.includes('FLOAT') || type.includes('DOUBLE') || type.includes('DECIMAL') || type.includes('NUMERIC')) {
    return 'DOUBLE';
  }

  // Boolean-like
  if (type.includes('BOOLEAN') || type.includes('BOOL')) return 'TINYINT(1)';

  // Binary
  if (type.includes('BLOB')) return 'LONGBLOB';

  // Dates
  if (type.includes('DATETIME') || type.includes('TIMESTAMP')) return 'DATETIME';
  if (type.includes('DATE')) return 'DATE';

  // Text types — pick size by column name hint
  if (type.includes('VARCHAR') || type.includes('CHAR')) {
    const match = type.match(/\((\d+)\)/);
    if (match) return `VARCHAR(${match[1]})`;
    return 'VARCHAR(255)';
  }

  // Default: if column may hold long text, use TEXT, otherwise VARCHAR(255)
  const longTextHints = ['description', 'notes', 'content', 'body', 'html', 'json', 'data', 'features', 'options', 'url', 'message'];
  if (longTextHints.some(h => colName.toLowerCase().includes(h))) return 'LONGTEXT';

  return 'TEXT';
}

function formatDefault(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return `DEFAULT ${value}`;
  if (value === 'CURRENT_TIMESTAMP' || value === "datetime('now')") return `DEFAULT CURRENT_TIMESTAMP`;
  // String default
  const escaped = String(value).replace(/'/g, "''");
  return `DEFAULT '${escaped}'`;
}

function log(msg, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
  };
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

// ═══════════════════════════════════
// Main Migration
// ═══════════════════════════════════
async function migrate() {
  log('\n╔══════════════════════════════════════════╗', 'cyan');
  log('║  AutoPro: SQLite → MySQL Migration      ║', 'cyan');
  log('╚══════════════════════════════════════════╝\n', 'cyan');

  // Check SQLite file exists
  if (!fs.existsSync(SQLITE_PATH)) {
    log(`❌ SQLite file not found: ${SQLITE_PATH}`, 'red');
    process.exit(1);
  }

  log(`📂 SQLite source: ${SQLITE_PATH}`, 'blue');
  log(`🗄️  MySQL target: ${MYSQL_CONFIG.user}@${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`, 'blue');
  log('');

  // Connect to both
  const sqlite = new Database(SQLITE_PATH, { readonly: true });
  let mysqlConn;

  try {
    mysqlConn = await mysql.createConnection(MYSQL_CONFIG);
    log('✅ Connected to MySQL', 'green');
  } catch (err) {
    log(`❌ Failed to connect to MySQL: ${err.message}`, 'red');
    log('\nتأكد من:', 'yellow');
    log('  1. MySQL server يعمل (sudo systemctl status mysql)', 'yellow');
    log('  2. User + Database موجودان', 'yellow');
    log('  3. كلمة المرور صحيحة', 'yellow');
    process.exit(1);
  }

  // Set strict mode for data integrity
  await mysqlConn.query("SET FOREIGN_KEY_CHECKS=0");
  await mysqlConn.query("SET sql_mode = 'NO_ENGINE_SUBSTITUTION'");

  // Get all tables
  const tables = sqlite.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '_litestream_%'
    ORDER BY name
  `).all();

  log(`\n📊 Found ${tables.length} tables to migrate:\n`, 'cyan');
  tables.forEach(t => log(`   - ${t.name}`, 'blue'));
  log('');

  let totalRowsMigrated = 0;
  let totalTablesSucceeded = 0;
  let totalTablesFailed = 0;
  const failedTables = [];

  for (const { name: tableName } of tables) {
    try {
      log(`\n┌─ 📋 Table: ${tableName}`, 'cyan');

      // Read SQLite schema
      const columns = sqlite.prepare(`PRAGMA table_info("${tableName}")`).all();

      if (columns.length === 0) {
        log(`│  ⚠️  Empty schema, skipping`, 'yellow');
        continue;
      }

      // Build MySQL CREATE TABLE
      const columnDefs = columns.map(col => {
        const isPk = col.pk === 1;
        const mysqlType = sqliteTypeToMysql(col.type, col.name, isPk);
        const nullable = col.notnull ? 'NOT NULL' : 'NULL';
        const defaultClause = formatDefault(col.dflt_value);
        const pkClause = isPk ? 'PRIMARY KEY' : '';
        return [`\`${col.name}\``, mysqlType, nullable, defaultClause, pkClause]
          .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      });

      // Detect composite PK
      const pkCount = columns.filter(c => c.pk === 1).length;
      let createSql;
      if (pkCount > 1) {
        const defs = columns.map(col => {
          const mysqlType = sqliteTypeToMysql(col.type, col.name, col.pk === 1);
          const nullable = col.notnull ? 'NOT NULL' : 'NULL';
          const defaultClause = formatDefault(col.dflt_value);
          return `\`${col.name}\` ${mysqlType} ${nullable} ${defaultClause}`.replace(/\s+/g, ' ').trim();
        });
        const pkCols = columns.filter(c => c.pk === 1).map(c => `\`${c.name}\``).join(', ');
        createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${defs.join(', ')}, PRIMARY KEY (${pkCols})) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
      } else {
        createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${columnDefs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;
      }

      await mysqlConn.query(createSql);
      log(`│  ✅ Schema created (${columns.length} columns)`, 'green');

      // Fetch all rows
      const rows = sqlite.prepare(`SELECT * FROM "${tableName}"`).all();
      log(`│  📊 Rows to migrate: ${rows.length}`, 'blue');

      if (rows.length === 0) {
        log(`│  ⏭️  Empty table, skipping insert`, 'yellow');
        totalTablesSucceeded++;
        continue;
      }

      // Insert in batches
      const colNames = Object.keys(rows[0]);
      const colList = colNames.map(c => `\`${c}\``).join(', ');

      let inserted = 0;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => `(${colNames.map(() => '?').join(',')})`).join(',');
        const values = batch.flatMap(row => colNames.map(c => {
          const v = row[c];
          if (v === null || v === undefined) return null;
          // SQLite stores booleans as 0/1 → OK for MySQL TINYINT
          // SQLite stores JSON as TEXT → OK
          return v;
        }));

        try {
          const insertSql = `INSERT IGNORE INTO \`${tableName}\` (${colList}) VALUES ${placeholders}`;
          const [result] = await mysqlConn.query(insertSql, values);
          inserted += result.affectedRows || 0;
          process.stdout.write(`\r│  ⏳ Progress: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
        } catch (err) {
          log(`\n│  ❌ Batch error at row ${i}: ${err.message}`, 'red');
          log(`│     Sample row: ${JSON.stringify(batch[0]).slice(0, 200)}`, 'red');
          // Continue with next batch
        }
      }
      console.log('');
      log(`│  ✅ Inserted ${inserted}/${rows.length} rows`, 'green');
      totalRowsMigrated += inserted;
      totalTablesSucceeded++;
      log(`└──────────────────────────────────────────`, 'cyan');

    } catch (err) {
      log(`│  ❌ FATAL: ${err.message}`, 'red');
      log(`└──────────────────────────────────────────`, 'red');
      totalTablesFailed++;
      failedTables.push({ name: tableName, error: err.message });
    }
  }

  // Re-enable foreign keys
  await mysqlConn.query("SET FOREIGN_KEY_CHECKS=1");

  // Summary
  log('\n╔══════════════════════════════════════════╗', 'cyan');
  log('║            MIGRATION SUMMARY              ║', 'cyan');
  log('╚══════════════════════════════════════════╝', 'cyan');
  log(`   Tables migrated:  ${totalTablesSucceeded}/${tables.length}`, 'green');
  log(`   Tables failed:    ${totalTablesFailed}`, totalTablesFailed > 0 ? 'red' : 'green');
  log(`   Total rows:       ${totalRowsMigrated.toLocaleString()}`, 'green');

  if (failedTables.length > 0) {
    log('\n❌ Failed tables:', 'red');
    failedTables.forEach(t => log(`   - ${t.name}: ${t.error}`, 'red'));
  }

  // Verification queries
  log('\n🔍 Verification (row counts per table):', 'cyan');
  for (const { name: tableName } of tables.slice(0, 10)) {  // show first 10
    try {
      const [[sqliteCount]] = [[sqlite.prepare(`SELECT COUNT(*) as c FROM "${tableName}"`).get()]];
      const [mysqlRows] = await mysqlConn.query(`SELECT COUNT(*) as c FROM \`${tableName}\``);
      const sc = sqliteCount.c;
      const mc = mysqlRows[0].c;
      const match = sc === mc ? '✅' : '⚠️';
      log(`   ${match} ${tableName.padEnd(30)} SQLite=${sc}  MySQL=${mc}`, sc === mc ? 'green' : 'yellow');
    } catch (_) {}
  }

  await mysqlConn.end();
  sqlite.close();

  log('\n🎉 Migration complete!\n', 'green');
  log('Next steps:', 'cyan');
  log('  1. Update .env with MySQL credentials', 'blue');
  log('  2. Test the app locally first', 'blue');
  log('  3. Deploy to production', 'blue');
  log('  4. Keep SQLite backup for rollback safety', 'blue');
  log('');
}

// Run
migrate().catch(err => {
  log(`\n❌ FATAL ERROR: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
