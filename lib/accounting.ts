/**
 * AutoPro — Chart of Accounts + Automatic Journal Entries
 * Double-entry bookkeeping module.
 *
 * Every journal entry MUST balance (total debits = total credits).
 * Account balances are tracked in the `accounts` table and updated atomically
 * inside a DB transaction whenever a journal entry is posted.
 *
 * Tables (created by seedChartOfAccounts):
 *   coa_accounts          — chart of accounts + running balance
 *   coa_journal_entries   — header row (description, date, reference, createdBy)
 *   coa_journal_lines     — line items (accountCode, debit, credit)
 *
 * NOTE: These are separate from the legacy `accounting_accounts` /
 * `journal_entries` / `journal_entry_lines` tables used by routes/accounting.ts.
 * Both systems coexist; this module is the new lightweight COA used by the
 * auto-journal helpers invoked from server.ts business flows.
 */

import type Database from 'better-sqlite3';

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface AccountDef {
  code: string;
  nameAr: string;
  nameEn: string;
  type: AccountType;
  subType: string;
  normalBalance: NormalBalance;
}

export interface JournalLine {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface JournalEntryInput {
  description: string;
  referenceType?: string;   // e.g. 'invoice', 'deposit', 'withdrawal', 'commission', 'subscription'
  referenceId?: string;     // the id of the related record
  createdBy?: string;       // userId or 'system'
  lines: JournalLine[];
  date?: string;            // ISO; defaults to now
}

export interface JournalPostResult {
  entryId: string;
  entryNumber: string;
}

// ═══════════════════════════════════════════════════════════════════════
//  CHART OF ACCOUNTS (35 accounts)
// ═══════════════════════════════════════════════════════════════════════

export const DEFAULT_CHART_OF_ACCOUNTS: AccountDef[] = [
  // ASSETS (1000-1999) — الأصول
  { code: '1010', nameAr: 'النقدية في الصندوق', nameEn: 'Cash on Hand', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1020', nameAr: 'حساب بنكي — ليبيا', nameEn: 'Bank Account — Libya', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1030', nameAr: 'حساب بنكي — USD', nameEn: 'Bank Account — USD', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1040', nameAr: 'محافظ المشترين', nameEn: 'Buyer Wallets', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1050', nameAr: 'محافظ البائعين', nameEn: 'Seller Wallets', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1110', nameAr: 'ذمم العملاء (مدينون)', nameEn: 'Accounts Receivable', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1120', nameAr: 'ذمم الموردين (مقدمات)', nameEn: 'Prepaid to Suppliers', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1210', nameAr: 'مخزون السيارات', nameEn: 'Vehicle Inventory', type: 'asset', subType: 'current_asset', normalBalance: 'debit' },
  { code: '1510', nameAr: 'أصول ثابتة — معدات', nameEn: 'Fixed Assets — Equipment', type: 'asset', subType: 'fixed_asset', normalBalance: 'debit' },
  { code: '1520', nameAr: 'أصول ثابتة — مباني', nameEn: 'Fixed Assets — Buildings', type: 'asset', subType: 'fixed_asset', normalBalance: 'debit' },

  // LIABILITIES (2000-2999) — الخصوم
  { code: '2010', nameAr: 'ذمم الموردين (دائنون)', nameEn: 'Accounts Payable', type: 'liability', subType: 'current_liability', normalBalance: 'credit' },
  { code: '2020', nameAr: 'مستحقات البائعين', nameEn: 'Seller Payables', type: 'liability', subType: 'current_liability', normalBalance: 'credit' },
  { code: '2030', nameAr: 'إيداعات العملاء (عربون)', nameEn: 'Customer Deposits', type: 'liability', subType: 'current_liability', normalBalance: 'credit' },
  { code: '2040', nameAr: 'ضرائب مستحقة', nameEn: 'Taxes Payable', type: 'liability', subType: 'current_liability', normalBalance: 'credit' },
  { code: '2050', nameAr: 'أجور مستحقة', nameEn: 'Wages Payable', type: 'liability', subType: 'current_liability', normalBalance: 'credit' },
  { code: '2110', nameAr: 'قروض قصيرة الأجل', nameEn: 'Short-term Loans', type: 'liability', subType: 'current_liability', normalBalance: 'credit' },
  { code: '2210', nameAr: 'قروض طويلة الأجل', nameEn: 'Long-term Loans', type: 'liability', subType: 'long_term_liability', normalBalance: 'credit' },

  // EQUITY (3000-3999) — حقوق الملكية
  { code: '3010', nameAr: 'رأس المال', nameEn: 'Owner Capital', type: 'equity', subType: 'capital', normalBalance: 'credit' },
  { code: '3020', nameAr: 'أرباح محتجزة', nameEn: 'Retained Earnings', type: 'equity', subType: 'retained_earnings', normalBalance: 'credit' },
  { code: '3030', nameAr: 'مسحوبات شخصية', nameEn: 'Owner Drawings', type: 'equity', subType: 'drawings', normalBalance: 'debit' },

  // REVENUE (4000-4999) — الإيرادات
  { code: '4010', nameAr: 'إيرادات عمولات البيع', nameEn: 'Sales Commission Revenue', type: 'revenue', subType: 'operating_revenue', normalBalance: 'credit' },
  { code: '4020', nameAr: 'إيرادات اشتراكات التجار', nameEn: 'Dealer Subscription Revenue', type: 'revenue', subType: 'operating_revenue', normalBalance: 'credit' },
  { code: '4030', nameAr: 'إيرادات خدمات الشحن', nameEn: 'Shipping Service Revenue', type: 'revenue', subType: 'operating_revenue', normalBalance: 'credit' },
  { code: '4040', nameAr: 'إيرادات خدمات الفحص', nameEn: 'Inspection Service Revenue', type: 'revenue', subType: 'operating_revenue', normalBalance: 'credit' },
  { code: '4050', nameAr: 'إيرادات التمييز (Featured)', nameEn: 'Featured Listing Revenue', type: 'revenue', subType: 'operating_revenue', normalBalance: 'credit' },
  { code: '4110', nameAr: 'إيرادات أخرى', nameEn: 'Other Revenue', type: 'revenue', subType: 'other_revenue', normalBalance: 'credit' },

  // EXPENSES (5000-5999) — المصروفات
  { code: '5010', nameAr: 'رواتب وأجور', nameEn: 'Salaries and Wages', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5020', nameAr: 'إيجارات', nameEn: 'Rent Expense', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5030', nameAr: 'كهرباء وماء', nameEn: 'Utilities', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5040', nameAr: 'اتصالات وإنترنت', nameEn: 'Communications', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5050', nameAr: 'تسويق وإعلانات', nameEn: 'Marketing and Advertising', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5060', nameAr: 'صيانة وإصلاحات', nameEn: 'Maintenance and Repairs', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5070', nameAr: 'عمولات بنكية ودفع', nameEn: 'Banking and Payment Fees', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5080', nameAr: 'رسوم حكومية', nameEn: 'Government Fees', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
  { code: '5090', nameAr: 'مصروفات متنوعة', nameEn: 'Miscellaneous Expenses', type: 'expense', subType: 'operating_expense', normalBalance: 'debit' },
];

// ═══════════════════════════════════════════════════════════════════════
//  SCHEMA + SEED
// ═══════════════════════════════════════════════════════════════════════

/**
 * Idempotent: creates accounting tables if missing and inserts any missing
 * default accounts. Safe to call on every boot.
 */
export function seedChartOfAccounts(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS coa_accounts (
      code TEXT PRIMARY KEY,
      nameAr TEXT NOT NULL,
      nameEn TEXT NOT NULL,
      type TEXT NOT NULL,
      subType TEXT,
      normalBalance TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coa_journal_entries (
      id TEXT PRIMARY KEY,
      entryNumber TEXT UNIQUE NOT NULL,
      description TEXT,
      referenceType TEXT,
      referenceId TEXT,
      createdBy TEXT,
      date TEXT NOT NULL,
      totalDebit REAL NOT NULL,
      totalCredit REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coa_journal_lines (
      id TEXT PRIMARY KEY,
      entryId TEXT NOT NULL,
      accountCode TEXT NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      description TEXT,
      FOREIGN KEY(entryId) REFERENCES coa_journal_entries(id),
      FOREIGN KEY(accountCode) REFERENCES coa_accounts(code)
    );

    CREATE INDEX IF NOT EXISTS idx_coa_journal_lines_entry ON coa_journal_lines(entryId);
    CREATE INDEX IF NOT EXISTS idx_coa_journal_lines_account ON coa_journal_lines(accountCode);
    CREATE INDEX IF NOT EXISTS idx_coa_journal_entries_ref ON coa_journal_entries(referenceType, referenceId);
  `);

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO coa_accounts (code, nameAr, nameEn, type, subType, normalBalance, balance, isActive, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
  `);
  const seedMany = db.transaction((accounts: AccountDef[]) => {
    for (const a of accounts) {
      insert.run(a.code, a.nameAr, a.nameEn, a.type, a.subType, a.normalBalance, now);
    }
  });
  seedMany(DEFAULT_CHART_OF_ACCOUNTS);
}

// ═══════════════════════════════════════════════════════════════════════
//  CORE: postJournalEntry
// ═══════════════════════════════════════════════════════════════════════

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Post a balanced journal entry. Validates debits == credits and updates
 * account balances atomically. Throws on invalid input.
 */
export function postJournalEntry(
  db: Database.Database,
  input: JournalEntryInput
): JournalPostResult {
  if (!input || !Array.isArray(input.lines) || input.lines.length < 2) {
    throw new Error('postJournalEntry: at least 2 lines required');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of input.lines) {
    const d = Number(line.debit || 0);
    const c = Number(line.credit || 0);
    if (d < 0 || c < 0) throw new Error('postJournalEntry: negative amounts not allowed');
    if (d > 0 && c > 0) throw new Error('postJournalEntry: a line cannot have both debit and credit');
    if (d === 0 && c === 0) throw new Error('postJournalEntry: a line must have either debit or credit > 0');
    totalDebit += d;
    totalCredit += c;
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  if (Math.abs(totalDebit - totalCredit) > 0.009) {
    throw new Error(`postJournalEntry: entry does not balance (debit=${totalDebit}, credit=${totalCredit})`);
  }

  const date = input.date || new Date().toISOString();
  const createdAt = new Date().toISOString();
  const entryId = `je-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const result = db.transaction(() => {
    // Generate a human-friendly entry number (JE-YYYYMM-####)
    const ym = date.slice(0, 7).replace('-', '');
    const countRow = db.prepare(
      "SELECT COUNT(*) as c FROM coa_journal_entries WHERE substr(date,1,7) = ?"
    ).get(date.slice(0, 7)) as any;
    const seq = ((countRow?.c || 0) + 1).toString().padStart(4, '0');
    const entryNumber = `JE-${ym}-${seq}`;

    db.prepare(`
      INSERT INTO coa_journal_entries
        (id, entryNumber, description, referenceType, referenceId, createdBy, date, totalDebit, totalCredit, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      entryNumber,
      input.description || null,
      input.referenceType || null,
      input.referenceId || null,
      input.createdBy || 'system',
      date,
      totalDebit,
      totalCredit,
      createdAt
    );

    const insertLine = db.prepare(`
      INSERT INTO coa_journal_lines (id, entryId, accountCode, debit, credit, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const getAccount = db.prepare("SELECT code, normalBalance FROM coa_accounts WHERE code = ?");
    const updateBalance = db.prepare("UPDATE coa_accounts SET balance = balance + ? WHERE code = ?");

    input.lines.forEach((line, idx) => {
      const d = round2(Number(line.debit || 0));
      const c = round2(Number(line.credit || 0));
      const acct = getAccount.get(line.accountCode) as any;
      if (!acct) throw new Error(`postJournalEntry: unknown account code "${line.accountCode}"`);

      const lineId = `jl-${entryId}-${idx}`;
      insertLine.run(lineId, entryId, line.accountCode, d, c, line.description || null);

      // Debit/credit effect on running balance.
      // Debit-normal accounts: +debit, -credit.
      // Credit-normal accounts: +credit, -debit.
      const delta = acct.normalBalance === 'debit' ? (d - c) : (c - d);
      if (delta !== 0) updateBalance.run(delta, line.accountCode);
    });

    return { entryId, entryNumber };
  })();

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
//  AUTOMATIC JOURNAL ENTRIES — wrappers around postJournalEntry
//
//  Every helper is wrapped in try/catch by the caller (or internally) so
//  accounting failures NEVER break the primary business flow.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Customer invoice confirmed (not yet paid).
 *   Dr Accounts Receivable (1110)   invoice.amount
 *       Cr Sales Commission Revenue (4010) — for type=purchase (commission portion)
 *       Cr Shipping Service Revenue (4030) — for type=shipping/transport
 *       Cr Other Revenue (4110) — fallback
 */
export function recordInvoicePosted(
  db: Database.Database,
  invoice: { id: string; amount: number; type?: string; userId?: string }
): JournalPostResult | null {
  try {
    if (!invoice || !invoice.amount || Number(invoice.amount) <= 0) return null;
    const amount = round2(Number(invoice.amount));

    let revenueAccount = '4110';
    if (invoice.type === 'purchase') revenueAccount = '4010';
    else if (invoice.type === 'shipping' || invoice.type === 'transport') revenueAccount = '4030';
    else if (invoice.type === 'inspection') revenueAccount = '4040';
    else if (invoice.type === 'featured') revenueAccount = '4050';
    else if (invoice.type === 'subscription') revenueAccount = '4020';

    return postJournalEntry(db, {
      description: `إصدار فاتورة (${invoice.type || 'عامة'}) — ${invoice.id}`,
      referenceType: 'invoice',
      referenceId: invoice.id,
      lines: [
        { accountCode: '1110', debit: amount, description: 'Accounts Receivable' },
        { accountCode: revenueAccount, credit: amount, description: 'Revenue recognized' },
      ],
    });
  } catch (err: any) {
    console.error('[ACCOUNTING] recordInvoicePosted error:', err?.message);
    return null;
  }
}

/**
 * Invoice paid. Cash/wallet in, receivable cleared.
 *   Dr Buyer Wallets (1040) / Bank (1020/1030) / Cash (1010)   invoice.amount
 *       Cr Accounts Receivable (1110)                          invoice.amount
 *
 * paymentMethod: 'wallet' | 'bank_libya' | 'bank_usd' | 'cash' | 'plutu' | 'stripe'
 */
export function recordInvoicePaid(
  db: Database.Database,
  invoice: { id: string; amount: number; type?: string; userId?: string },
  paymentMethod: string = 'wallet'
): JournalPostResult | null {
  try {
    if (!invoice || !invoice.amount || Number(invoice.amount) <= 0) return null;
    const amount = round2(Number(invoice.amount));
    const debitAccount = methodToAssetAccount(paymentMethod);

    return postJournalEntry(db, {
      description: `تحصيل فاتورة — ${invoice.id} عبر ${paymentMethod}`,
      referenceType: 'invoice_payment',
      referenceId: invoice.id,
      lines: [
        { accountCode: debitAccount, debit: amount, description: `Collected via ${paymentMethod}` },
        { accountCode: '1110', credit: amount, description: 'Clear A/R' },
      ],
    });
  } catch (err: any) {
    console.error('[ACCOUNTING] recordInvoicePaid error:', err?.message);
    return null;
  }
}

/**
 * Buyer deposit approved: cash comes in, liability to buyer increases (customer deposit)
 * AND the buyer wallet asset increases (tracked internally at 1040 offset by 2030).
 *
 * We model it as:
 *   Dr Bank/Cash (method account)       amount
 *       Cr Customer Deposits (2030)     amount
 */
export function recordDeposit(
  db: Database.Database,
  userId: string,
  amount: number,
  method: string = 'bank_libya'
): JournalPostResult | null {
  try {
    const amt = round2(Number(amount));
    if (!amt || amt <= 0) return null;
    const debitAccount = methodToAssetAccount(method);

    return postJournalEntry(db, {
      description: `إيداع عميل (${userId}) عبر ${method}`,
      referenceType: 'deposit',
      referenceId: userId,
      lines: [
        { accountCode: debitAccount, debit: amt, description: `Deposit received via ${method}` },
        { accountCode: '2030', credit: amt, description: 'Customer Deposits liability' },
      ],
    });
  } catch (err: any) {
    console.error('[ACCOUNTING] recordDeposit error:', err?.message);
    return null;
  }
}

/**
 * Seller withdrawal paid: Seller Payables liability decreases, Bank decreases.
 *   Dr Seller Payables (2020)       amount
 *       Cr Bank Account — USD (1030) amount
 */
export function recordWithdrawal(
  db: Database.Database,
  userId: string,
  amount: number,
  method: string = 'bank_usd'
): JournalPostResult | null {
  try {
    const amt = round2(Number(amount));
    if (!amt || amt <= 0) return null;
    const creditAccount = methodToAssetAccount(method);

    return postJournalEntry(db, {
      description: `سحب بائع (${userId}) عبر ${method}`,
      referenceType: 'withdrawal',
      referenceId: userId,
      lines: [
        { accountCode: '2020', debit: amt, description: 'Settle seller payable' },
        { accountCode: creditAccount, credit: amt, description: `Paid via ${method}` },
      ],
    });
  } catch (err: any) {
    console.error('[ACCOUNTING] recordWithdrawal error:', err?.message);
    return null;
  }
}

/**
 * Platform commission recognized on a sold car.
 *   Dr Accounts Receivable (1110)           commission
 *       Cr Sales Commission Revenue (4010)  commission
 */
export function recordCommission(
  db: Database.Database,
  carId: string,
  amount: number
): JournalPostResult | null {
  try {
    const amt = round2(Number(amount));
    if (!amt || amt <= 0) return null;
    return postJournalEntry(db, {
      description: `عمولة بيع سيارة ${carId}`,
      referenceType: 'commission',
      referenceId: carId,
      lines: [
        { accountCode: '1110', debit: amt, description: 'A/R commission' },
        { accountCode: '4010', credit: amt, description: 'Commission revenue' },
      ],
    });
  } catch (err: any) {
    console.error('[ACCOUNTING] recordCommission error:', err?.message);
    return null;
  }
}

/**
 * Dealer subscription payment received.
 *   Dr Bank/Cash (method)                           amount
 *       Cr Dealer Subscription Revenue (4020)       amount
 */
export function recordSubscription(
  db: Database.Database,
  userId: string,
  amount: number,
  packageId: string,
  method: string = 'bank_libya'
): JournalPostResult | null {
  try {
    const amt = round2(Number(amount));
    if (!amt || amt <= 0) return null;
    const debitAccount = methodToAssetAccount(method);

    return postJournalEntry(db, {
      description: `اشتراك تاجر — ${packageId} (${userId})`,
      referenceType: 'subscription',
      referenceId: `${userId}:${packageId}`,
      lines: [
        { accountCode: debitAccount, debit: amt, description: `Subscription paid via ${method}` },
        { accountCode: '4020', credit: amt, description: 'Dealer subscription revenue' },
      ],
    });
  } catch (err: any) {
    console.error('[ACCOUNTING] recordSubscription error:', err?.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════

function methodToAssetAccount(method: string): string {
  const m = (method || '').toLowerCase();
  if (m === 'wallet' || m === 'buyer_wallet') return '1040';
  if (m === 'seller_wallet') return '1050';
  if (m === 'cash') return '1010';
  if (m === 'bank_libya' || m === 'bank' || m === 'bank_transfer' || m === 'plutu' || m === 'sadad' || m === 'mobicash') return '1020';
  if (m === 'bank_usd' || m === 'usd' || m === 'stripe' || m === 'wire' || m === 'swift') return '1030';
  // Default: Libya bank
  return '1020';
}
