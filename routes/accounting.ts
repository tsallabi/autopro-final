import crypto from 'crypto';
import { requireAuth, requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

// ═══════════════════════════════════════════════════════════════════
//  Exported helpers (usable by other modules / tests)
// ═══════════════════════════════════════════════════════════════════

function _tblExists(db: any, name: string): boolean {
  try {
    const r: any = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
    return !!r;
  } catch { return false; }
}

/** Current balance for an account code, optionally as-of a given date. */
export function getAccountBalance(db: any, accountCode: string, asOfDate?: string): number {
  if (!_tblExists(db, 'accounting_accounts') || !_tblExists(db, 'journal_entry_lines') || !_tblExists(db, 'journal_entries')) return 0;
  try {
    const acc: any = db.prepare('SELECT id, normalBalance FROM accounting_accounts WHERE code = ?').get(accountCode);
    if (!acc) return 0;
    const dateClause = asOfDate ? 'AND je.entryDate <= ?' : '';
    const params: any[] = [acc.id];
    if (asOfDate) params.push(asOfDate);
    const row: any = db.prepare(
      `SELECT COALESCE(SUM(jel.debit),0) AS debit, COALESCE(SUM(jel.credit),0) AS credit
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.entryId
        WHERE jel.accountId = ? AND je.status='posted' ${dateClause}`,
    ).get(...params);
    const d = Number(row?.debit || 0); const c = Number(row?.credit || 0);
    return acc.normalBalance === 'credit' ? c - d : d - c;
  } catch { return 0; }
}

/** All posted journal lines for an account across a date range, with running balance. */
export function getAccountTransactions(db: any, accountCode: string, dateFrom: string, dateTo: string): any[] {
  if (!_tblExists(db, 'accounting_accounts') || !_tblExists(db, 'journal_entry_lines') || !_tblExists(db, 'journal_entries')) return [];
  try {
    const acc: any = db.prepare('SELECT id, normalBalance FROM accounting_accounts WHERE code = ?').get(accountCode);
    if (!acc) return [];
    const rows: any[] = db.prepare(
      `SELECT je.entryDate AS date, je.referenceType AS type, je.referenceId AS reference,
              je.description AS description, jel.debit AS debit, jel.credit AS credit
         FROM journal_entry_lines jel
         JOIN journal_entries je ON je.id = jel.entryId
        WHERE jel.accountId = ? AND je.status='posted'
          AND je.entryDate BETWEEN ? AND ?
        ORDER BY je.entryDate ASC`,
    ).all(acc.id, dateFrom, dateTo);
    let running = 0;
    return rows.map((r: any) => {
      const d = Number(r.debit || 0); const c = Number(r.credit || 0);
      running += acc.normalBalance === 'credit' ? c - d : d - c;
      return { date: r.date, type: r.type, reference: r.reference, description: r.description, debit: d, credit: c, balance: running };
    });
  } catch { return []; }
}

/** Period debit/credit activity grouped per account for a given accountType (revenue|expense|asset|liability|equity). */
export function calculatePeriodActivity(db: any, accountType: string, dateFrom: string, dateTo: string): any[] {
  if (!_tblExists(db, 'accounting_accounts') || !_tblExists(db, 'journal_entry_lines') || !_tblExists(db, 'journal_entries')) return [];
  try {
    return db.prepare(
      `SELECT a.code, a.nameAr, a.nameEn, a.type, a.normalBalance,
              COALESCE(SUM(jel.debit),0) AS debit,
              COALESCE(SUM(jel.credit),0) AS credit
         FROM accounting_accounts a
         LEFT JOIN journal_entry_lines jel ON jel.accountId = a.id
         LEFT JOIN journal_entries je ON je.id = jel.entryId AND je.status='posted'
                                      AND je.entryDate BETWEEN ? AND ?
        WHERE a.type = ? AND a.isActive = 1
        GROUP BY a.id ORDER BY a.code ASC`,
    ).all(dateFrom, dateTo, accountType) as any[];
  } catch { return []; }
}

/**
 * Accounting module — double-entry bookkeeping (inspired by Django Hordak / Ledger).
 *
 * Endpoints:
 *   GET    /api/accounting/invoices          — list invoices with filters
 *   GET    /api/accounting/invoices/:id      — full detail + items + journal entry
 *   POST   /api/accounting/invoices          — create multi-item invoice (draft)
 *   POST   /api/accounting/invoices/:id/confirm — confirm draft -> post JE -> 'unpaid'
 *   POST   /api/accounting/invoices/:id/void    — reverse with counter JE
 *   GET    /api/accounting/activity          — activity log (filterable)
 */
export function registerAccountingRoutes(ctx: AppContext) {
  const { app, db } = ctx;

  // ─────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────
  const uid = (prefix: string) =>
    `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  const nowIso = () => new Date().toISOString();

  /**
   * Write an entry to the accounting activity log.
   * Safe to call from any endpoint.
   */
  function logAccountingActivity(
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    oldValue: any,
    newValue: any,
    ipAddress: string | null = null,
  ) {
    try {
      db.prepare(
        `INSERT INTO accounting_activity
         (id, userId, action, entityType, entityId, oldValue, newValue, ipAddress, timestamp)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(
        uid('act'),
        userId,
        action,
        entityType,
        entityId,
        oldValue == null ? null : typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue),
        newValue == null ? null : typeof newValue === 'string' ? newValue : JSON.stringify(newValue),
        ipAddress,
        nowIso(),
      );
    } catch (err: any) {
      console.error('[accounting] logAccountingActivity failed:', err?.message || err);
    }
  }
  // Expose on ctx so other modules can call it
  (ctx as any).logAccountingActivity = logAccountingActivity;

  /**
   * Generate the next JE-YYYY-NNN entry number.
   */
  function nextEntryNumber(): string {
    const year = new Date().getFullYear();
    const prefix = `JE-${year}-`;
    const row = db
      .prepare(
        `SELECT entryNumber FROM journal_entries
         WHERE entryNumber LIKE ? ORDER BY entryNumber DESC LIMIT 1`,
      )
      .get(`${prefix}%`) as any;
    let n = 1;
    if (row?.entryNumber) {
      const m = String(row.entryNumber).match(/(\d+)$/);
      if (m) n = parseInt(m[1], 10) + 1;
    }
    return `${prefix}${String(n).padStart(3, '0')}`;
  }

  /**
   * Post a balanced journal entry.
   *   lines: [{ accountId, debit, credit, description? }, ...]
   * Returns the created entry id.
   * Throws if unbalanced or empty.
   */
  function postJournalEntry(opts: {
    entryDate?: string;
    description?: string;
    referenceType?: string | null;
    referenceId?: string | null;
    lines: Array<{ accountId: string; debit?: number; credit?: number; description?: string }>;
    createdBy?: string | null;
    status?: 'draft' | 'posted' | 'reversed';
  }): { id: string; entryNumber: string } {
    const lines = (opts.lines || []).filter(
      (l) => l && l.accountId && ((l.debit || 0) > 0 || (l.credit || 0) > 0),
    );
    if (lines.length < 2) throw new Error('يجب توفير سطرين على الأقل في قيد اليومية');

    const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      throw new Error(
        `قيد غير متوازن: المدين=${totalDebit.toFixed(2)} الدائن=${totalCredit.toFixed(2)}`,
      );
    }

    const id = uid('je');
    const entryNumber = nextEntryNumber();
    const status = opts.status || 'posted';
    const createdAt = nowIso();
    const entryDate = opts.entryDate || createdAt;

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO journal_entries
         (id, entryNumber, entryDate, description, referenceType, referenceId,
          totalDebit, totalCredit, status, createdBy, createdAt)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        entryNumber,
        entryDate,
        opts.description || null,
        opts.referenceType || null,
        opts.referenceId || null,
        totalDebit,
        totalCredit,
        status,
        opts.createdBy || null,
        createdAt,
      );

      const insLine = db.prepare(
        `INSERT INTO journal_entry_lines
         (id, entryId, accountId, debit, credit, description)
         VALUES (?,?,?,?,?,?)`,
      );
      const updAccount = db.prepare(
        `UPDATE accounting_accounts
         SET balance = balance + ?
         WHERE id = ?`,
      );

      for (const l of lines) {
        const lineId = uid('jel');
        const debit = Number(l.debit || 0);
        const credit = Number(l.credit || 0);
        insLine.run(lineId, id, l.accountId, debit, credit, l.description || null);

        if (status === 'posted') {
          // Update running balance according to normal side.
          const acc = db
            .prepare('SELECT normalBalance FROM accounting_accounts WHERE id = ?')
            .get(l.accountId) as any;
          if (acc) {
            const delta =
              acc.normalBalance === 'debit' ? debit - credit : credit - debit;
            updAccount.run(delta, l.accountId);
          }
        }
      }
    });
    tx();

    return { id, entryNumber };
  }
  (ctx as any).postJournalEntry = postJournalEntry;

  // ══════════════════════════════════════════════════════════════
  //  INVOICES
  // ══════════════════════════════════════════════════════════════

  // GET /api/accounting/invoices — list with filters
  app.get('/api/accounting/invoices', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح — صلاحيات محاسب/مدير مطلوبة' });
      }
      const { status, dateFrom, dateTo, userId, carId } = req.query as Record<string, string>;
      const where: string[] = [];
      const params: any[] = [];
      if (status) { where.push('status = ?'); params.push(status); }
      if (userId) { where.push('userId = ?'); params.push(userId); }
      if (carId)  { where.push('carId = ?');  params.push(carId); }
      if (dateFrom) { where.push('timestamp >= ?'); params.push(dateFrom); }
      if (dateTo)   { where.push('timestamp <= ?'); params.push(dateTo); }
      const sql =
        'SELECT * FROM invoices' +
        (where.length ? ' WHERE ' + where.join(' AND ') : '') +
        ' ORDER BY timestamp DESC LIMIT 500';
      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/accounting/invoices/:id — full detail
  app.get('/api/accounting/invoices/:id', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const { id } = req.params;
      const invoice: any = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
      if (user.role !== 'admin' && invoice.userId !== user.id) {
        return res.status(403).json({ error: 'غير مصرح' });
      }
      const items = db
        .prepare('SELECT * FROM invoice_items WHERE invoiceId = ?')
        .all(id);
      let journalEntry: any = null;
      let journalLines: any[] = [];
      if (invoice.journalEntryId) {
        journalEntry = db
          .prepare('SELECT * FROM journal_entries WHERE id = ?')
          .get(invoice.journalEntryId);
        if (journalEntry) {
          journalLines = db
            .prepare('SELECT * FROM journal_entry_lines WHERE entryId = ?')
            .all(invoice.journalEntryId);
        }
      }
      res.json({ ...invoice, items, journalEntry, journalLines });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/accounting/invoices — create multi-item invoice (draft)
  app.post('/api/accounting/invoices', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح — صلاحيات محاسب/مدير مطلوبة' });
      }
      const {
        userId,
        carId,
        type,
        dueDate,
        items,
      } = req.body as {
        userId?: string;
        carId?: string;
        type?: string;
        dueDate?: string;
        items?: Array<{
          description: string;
          quantity?: number;
          unitPrice?: number;
          taxRate?: number;
          accountId?: string;
        }>;
      };

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'يجب إضافة بند واحد على الأقل' });
      }

      let subtotal = 0;
      let taxAmount = 0;
      const computed = items.map((it) => {
        const qty = Number(it.quantity ?? 1);
        const price = Number(it.unitPrice ?? 0);
        const rate = Number(it.taxRate ?? 0);
        const sub = qty * price;
        const tax = sub * (rate / 100);
        const total = sub + tax;
        subtotal += sub;
        taxAmount += tax;
        return {
          description: it.description,
          quantity: qty,
          unitPrice: price,
          taxRate: rate,
          subtotal: sub,
          taxAmount: tax,
          total,
          accountId: it.accountId || null,
        };
      });
      const total = subtotal + taxAmount;

      const invoiceId = uid('inv');
      const timestamp = nowIso();

      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO invoices
           (id, userId, carId, amount, status, type, timestamp, dueDate,
            subtotal, taxAmount, total)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          invoiceId,
          userId || null,
          carId || null,
          total,
          'draft',
          type || null,
          timestamp,
          dueDate || null,
          subtotal,
          taxAmount,
          total,
        );

        const insItem = db.prepare(
          `INSERT INTO invoice_items
           (id, invoiceId, description, quantity, unitPrice, taxRate,
            subtotal, taxAmount, total, accountId)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        );
        for (const c of computed) {
          insItem.run(
            uid('ii'),
            invoiceId,
            c.description,
            c.quantity,
            c.unitPrice,
            c.taxRate,
            c.subtotal,
            c.taxAmount,
            c.total,
            c.accountId,
          );
        }
      });
      tx();

      logAccountingActivity(
        user.id,
        'invoice.create',
        'invoice',
        invoiceId,
        null,
        { userId, carId, type, total, itemCount: computed.length },
        (req as any).ip,
      );

      res.json({ success: true, id: invoiceId, subtotal, taxAmount, total });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/accounting/invoices/:id/confirm — confirm draft -> post JE -> unpaid
  app.post('/api/accounting/invoices/:id/confirm', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح — صلاحيات محاسب/مدير مطلوبة' });
      }
      const { id } = req.params;
      const invoice: any = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
      if (invoice.status !== 'draft') {
        return res.status(400).json({ error: `لا يمكن تأكيد فاتورة بحالة: ${invoice.status}` });
      }

      const items: any[] = db
        .prepare('SELECT * FROM invoice_items WHERE invoiceId = ?')
        .all(id);
      if (items.length === 0) {
        return res.status(400).json({ error: 'لا توجد بنود في الفاتورة' });
      }

      // Look up standard accounts by code for double-entry booking.
      //   1200 — Accounts Receivable (asset, debit)
      //   2200 — Tax Payable (liability, credit)
      //   4010 — Sales Revenue (revenue, credit) — fallback
      const arAccount = db
        .prepare("SELECT id FROM accounting_accounts WHERE code = '1200'")
        .get() as any;
      const taxAccount = db
        .prepare("SELECT id FROM accounting_accounts WHERE code = '2200'")
        .get() as any;
      const defaultRevenue = db
        .prepare("SELECT id FROM accounting_accounts WHERE code = '4010'")
        .get() as any;

      if (!arAccount) {
        return res.status(500).json({
          error:
            'دليل الحسابات غير مُعدّ — حساب الذمم المدينة (1200) غير موجود. يرجى تهيئة الحسابات أولاً.',
        });
      }

      const lines: Array<{ accountId: string; debit?: number; credit?: number; description?: string }> = [];
      const totalAmount = Number(invoice.total || invoice.amount || 0);
      const totalTax = Number(invoice.taxAmount || 0);

      // Debit: Accounts Receivable for full total
      lines.push({
        accountId: arAccount.id,
        debit: totalAmount,
        description: `فاتورة ${id}`,
      });
      // Credit: Revenue for each item (by accountId or default)
      for (const it of items) {
        const revId = it.accountId || defaultRevenue?.id;
        if (!revId) {
          return res.status(500).json({
            error:
              'حساب إيراد افتراضي غير موجود (4010) ولم يُحدَّد حساب للبند. يرجى تهيئة الحسابات.',
          });
        }
        lines.push({
          accountId: revId,
          credit: Number(it.subtotal || 0),
          description: it.description,
        });
      }
      // Credit: Tax Payable (if any)
      if (totalTax > 0) {
        if (!taxAccount) {
          return res.status(500).json({
            error: 'حساب الضريبة المستحقة (2200) غير موجود في دليل الحسابات.',
          });
        }
        lines.push({
          accountId: taxAccount.id,
          credit: totalTax,
          description: `ضريبة على الفاتورة ${id}`,
        });
      }

      const je = postJournalEntry({
        description: `تأكيد الفاتورة ${id}`,
        referenceType: 'invoice',
        referenceId: id,
        createdBy: user.id,
        lines,
      });

      const confirmedAt = nowIso();
      db.prepare(
        `UPDATE invoices
         SET status = 'unpaid', journalEntryId = ?, confirmedAt = ?, confirmedBy = ?
         WHERE id = ?`,
      ).run(je.id, confirmedAt, user.id, id);

      logAccountingActivity(
        user.id,
        'invoice.confirm',
        'invoice',
        id,
        { status: 'draft' },
        { status: 'unpaid', journalEntryId: je.id, entryNumber: je.entryNumber },
        (req as any).ip,
      );

      res.json({
        success: true,
        id,
        status: 'unpaid',
        journalEntryId: je.id,
        entryNumber: je.entryNumber,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/accounting/invoices/:id/void — reverse with counter JE
  app.post('/api/accounting/invoices/:id/void', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح — صلاحيات محاسب/مدير مطلوبة' });
      }
      const { id } = req.params;
      const { reason } = (req.body || {}) as { reason?: string };
      const invoice: any = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
      if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });
      if (invoice.status === 'void') {
        return res.status(400).json({ error: 'الفاتورة ملغاة مسبقاً' });
      }
      if (invoice.status === 'paid') {
        return res
          .status(400)
          .json({ error: 'لا يمكن إلغاء فاتورة مدفوعة — يجب إصدار قيد عكسي يدوي أو استرداد' });
      }

      let counterEntryId: string | null = null;
      let counterEntryNumber: string | null = null;

      if (invoice.journalEntryId) {
        // Build a reversing JE: swap debits/credits from the original.
        const origLines: any[] = db
          .prepare('SELECT * FROM journal_entry_lines WHERE entryId = ?')
          .all(invoice.journalEntryId);
        if (origLines.length > 0) {
          const reverseLines = origLines.map((l: any) => ({
            accountId: l.accountId,
            debit: Number(l.credit || 0),
            credit: Number(l.debit || 0),
            description: `عكس: ${l.description || ''}`.trim(),
          }));
          const je = postJournalEntry({
            description: `إلغاء الفاتورة ${id}${reason ? ' — ' + reason : ''}`,
            referenceType: 'invoice_void',
            referenceId: id,
            createdBy: user.id,
            lines: reverseLines,
          });
          counterEntryId = je.id;
          counterEntryNumber = je.entryNumber;

          // Mark original entry as reversed
          db.prepare("UPDATE journal_entries SET status = 'reversed' WHERE id = ?")
            .run(invoice.journalEntryId);
        }
      }

      db.prepare("UPDATE invoices SET status = 'void' WHERE id = ?").run(id);

      logAccountingActivity(
        user.id,
        'invoice.void',
        'invoice',
        id,
        { status: invoice.status, journalEntryId: invoice.journalEntryId },
        { status: 'void', counterEntryId, counterEntryNumber, reason: reason || null },
        (req as any).ip,
      );

      res.json({
        success: true,
        id,
        status: 'void',
        counterEntryId,
        counterEntryNumber,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ACTIVITY LOG
  // ══════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────
  //  REPORT HELPERS (exported below via module scope)
  // ──────────────────────────────────────────────────────────────
  function tableExists(name: string): boolean {
    try {
      const row: any = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
      return !!row;
    } catch { return false; }
  }
  function safeAll(sql: string, params: any[] = []): any[] {
    try { return db.prepare(sql).all(...params) as any[]; }
    catch (err: any) { console.warn('[accounting-report]', err?.message || err); return []; }
  }
  function safeGet(sql: string, params: any[] = []): any {
    try { return db.prepare(sql).get(...params); }
    catch (err: any) { console.warn('[accounting-report]', err?.message || err); return null; }
  }
  function defaultDates(dateFrom?: string, dateTo?: string): { from: string; to: string } {
    const now = new Date();
    const to = dateTo || now.toISOString().slice(0, 10);
    const from = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { from, to };
  }
  function periodActivity(accountType: string, from: string, to: string): any[] {
    if (!tableExists('accounting_accounts') || !tableExists('journal_entry_lines') || !tableExists('journal_entries')) return [];
    return safeAll(
      `SELECT a.code, a.nameAr, a.nameEn, a.type, a.normalBalance,
              COALESCE(SUM(jel.debit),0) AS debit,
              COALESCE(SUM(jel.credit),0) AS credit
         FROM accounting_accounts a
         LEFT JOIN journal_entry_lines jel ON jel.accountId = a.id
         LEFT JOIN journal_entries je ON je.id = jel.entryId AND je.status='posted'
                                      AND je.entryDate BETWEEN ? AND ?
        WHERE a.type = ? AND a.isActive = 1
        GROUP BY a.id
        ORDER BY a.code ASC`,
      [from, to, accountType],
    );
  }

  // Report access: admin (or accountant role later)
  const requireAccountant = (req: any, res: any, next: any) => {
    return requireAuth(req, res, () => {
      const role = req.user?.role;
      if (role !== 'admin' && role !== 'accountant') {
        return res.status(403).json({ error: 'غير مصرح — صلاحيات محاسب/مدير مطلوبة' });
      }
      next();
    });
  };

  // ──────────────────────────────────────────────────────────────
  //  1) Customer Statement — كشف حساب عميل
  // ──────────────────────────────────────────────────────────────
  app.get('/api/accounting/reports/customer-statement', requireAccountant, (req: any, res: any) => {
    try {
      const userId = String(req.query.userId || '');
      if (!userId) return res.status(400).json({ error: 'userId مطلوب' });
      const { from, to } = defaultDates(req.query.dateFrom, req.query.dateTo);

      let customer: any = tableExists('users')
        ? safeGet('SELECT id, name, email, phone FROM users WHERE id = ?', [userId])
        : null;
      if (!customer) customer = { id: userId, name: null, email: null, phone: null };

      const arAccount: any = tableExists('accounting_accounts')
        ? safeGet('SELECT id, normalBalance FROM accounting_accounts WHERE code = ?', ['1110'])
        : null;

      let openingBalance = 0;
      let transactions: any[] = [];

      if (arAccount && tableExists('journal_entry_lines') && tableExists('journal_entries') && tableExists('invoices')) {
        const invoiceIds = safeAll('SELECT id FROM invoices WHERE userId = ?', [userId]).map((r: any) => r.id);
        if (invoiceIds.length > 0) {
          const placeholders = invoiceIds.map(() => '?').join(',');
          const openingRow: any = safeGet(
            `SELECT COALESCE(SUM(jel.debit),0) AS debit, COALESCE(SUM(jel.credit),0) AS credit
               FROM journal_entry_lines jel
               JOIN journal_entries je ON je.id = jel.entryId
              WHERE jel.accountId = ? AND je.status = 'posted'
                AND je.entryDate < ?
                AND je.referenceType = 'invoice'
                AND je.referenceId IN (${placeholders})`,
            [arAccount.id, from, ...invoiceIds],
          );
          const od = Number(openingRow?.debit || 0);
          const oc = Number(openingRow?.credit || 0);
          openingBalance = arAccount.normalBalance === 'credit' ? oc - od : od - oc;

          const rows = safeAll(
            `SELECT je.entryDate AS date, je.referenceType AS type, je.referenceId AS reference,
                    je.description AS description, jel.debit AS debit, jel.credit AS credit
               FROM journal_entry_lines jel
               JOIN journal_entries je ON je.id = jel.entryId
              WHERE jel.accountId = ? AND je.status = 'posted'
                AND je.entryDate BETWEEN ? AND ?
                AND je.referenceType = 'invoice'
                AND je.referenceId IN (${placeholders})
              ORDER BY je.entryDate ASC`,
            [arAccount.id, from, to, ...invoiceIds],
          );
          let running = openingBalance;
          transactions = rows.map((r: any) => {
            const d = Number(r.debit || 0); const c = Number(r.credit || 0);
            running += arAccount.normalBalance === 'credit' ? c - d : d - c;
            return { date: r.date, type: r.type, reference: r.reference, description: r.description, debit: d, credit: c, balance: running };
          });
        }
      }

      const totalDebit = transactions.reduce((s, t) => s + (t.debit || 0), 0);
      const totalCredit = transactions.reduce((s, t) => s + (t.credit || 0), 0);
      const closingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : openingBalance;

      res.json({ customer, period: { from, to }, openingBalance, transactions, closingBalance, totalDebit, totalCredit });
    } catch (err: any) { res.status(500).json({ error: err?.message || 'خطأ في كشف الحساب' }); }
  });

  // ──────────────────────────────────────────────────────────────
  //  2) Trial Balance — ميزان المراجعة
  // ──────────────────────────────────────────────────────────────
  app.get('/api/accounting/reports/trial-balance', requireAccountant, (req: any, res: any) => {
    try {
      const { from, to } = defaultDates(req.query.dateFrom, req.query.dateTo);
      if (!tableExists('accounting_accounts')) {
        return res.json({ asOfDate: to, period: { from, to }, accounts: [], totalDebit: 0, totalCredit: 0, isBalanced: true });
      }
      const rows = safeAll(
        `SELECT a.code, a.nameAr, a.nameEn, a.type, a.normalBalance,
                COALESCE(SUM(jel.debit),0) AS debit,
                COALESCE(SUM(jel.credit),0) AS credit
           FROM accounting_accounts a
           LEFT JOIN journal_entry_lines jel ON jel.accountId = a.id
           LEFT JOIN journal_entries je ON je.id = jel.entryId AND je.status='posted'
                                        AND je.entryDate BETWEEN ? AND ?
          WHERE a.isActive = 1
          GROUP BY a.id
          ORDER BY a.code ASC`,
        [from, to],
      );
      const accounts = rows.map((r: any) => {
        const debit = Number(r.debit || 0); const credit = Number(r.credit || 0);
        const balance = r.normalBalance === 'credit' ? credit - debit : debit - credit;
        return { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn, type: r.type, debit, credit, balance };
      });
      const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
      const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);
      res.json({
        asOfDate: to, period: { from, to }, accounts,
        totalDebit, totalCredit,
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      });
    } catch (err: any) { res.status(500).json({ error: err?.message || 'خطأ في ميزان المراجعة' }); }
  });

  // ──────────────────────────────────────────────────────────────
  //  3) Income Statement — قائمة الدخل
  // ──────────────────────────────────────────────────────────────
  app.get('/api/accounting/reports/income-statement', requireAccountant, (req: any, res: any) => {
    try {
      const { from, to } = defaultDates(req.query.dateFrom, req.query.dateTo);
      const revenueRows = periodActivity('revenue', from, to);
      const expenseRows = periodActivity('expense', from, to);
      const revenueAccounts = revenueRows.map((r: any) => ({
        code: r.code, nameAr: r.nameAr, nameEn: r.nameEn,
        amount: Number(r.credit || 0) - Number(r.debit || 0),
      }));
      const expenseAccounts = expenseRows.map((r: any) => ({
        code: r.code, nameAr: r.nameAr, nameEn: r.nameEn,
        amount: Number(r.debit || 0) - Number(r.credit || 0),
      }));
      const totalRevenue = revenueAccounts.reduce((s, a) => s + a.amount, 0);
      const totalExpenses = expenseAccounts.reduce((s, a) => s + a.amount, 0);
      const grossProfit = totalRevenue - totalExpenses;
      const netProfit = grossProfit;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
      res.json({
        period: { from, to },
        revenue: { accounts: revenueAccounts, total: totalRevenue },
        expenses: { accounts: expenseAccounts, total: totalExpenses },
        grossProfit, netProfit,
        profitMargin: Math.round(profitMargin * 100) / 100,
      });
    } catch (err: any) { res.status(500).json({ error: err?.message || 'خطأ في قائمة الدخل' }); }
  });

  // ──────────────────────────────────────────────────────────────
  //  4) Balance Sheet — الميزانية العمومية
  // ──────────────────────────────────────────────────────────────
  app.get('/api/accounting/reports/balance-sheet', requireAccountant, (req: any, res: any) => {
    try {
      const asOfDate = String(req.query.asOfDate || new Date().toISOString().slice(0, 10));
      const empty = {
        asOfDate,
        assets: { currentAssets: [], fixedAssets: [], total: 0 },
        liabilities: { currentLiabilities: [], longTermLiabilities: [], total: 0 },
        equity: { capital: 0, retainedEarnings: 0, accounts: [], total: 0 },
        totalLiabilitiesAndEquity: 0, isBalanced: true,
      };
      if (!tableExists('accounting_accounts')) return res.json(empty);

      const allAccounts = safeAll(
        `SELECT id, code, nameAr, nameEn, type, subType, normalBalance
           FROM accounting_accounts WHERE isActive = 1 ORDER BY code ASC`,
      );

      const balanceAt = (acc: any): number => {
        const row: any = safeGet(
          `SELECT COALESCE(SUM(jel.debit),0) AS debit, COALESCE(SUM(jel.credit),0) AS credit
             FROM journal_entry_lines jel
             JOIN journal_entries je ON je.id = jel.entryId
            WHERE jel.accountId = ? AND je.status = 'posted' AND je.entryDate <= ?`,
          [acc.id, asOfDate],
        );
        const d = Number(row?.debit || 0); const c = Number(row?.credit || 0);
        return acc.normalBalance === 'credit' ? c - d : d - c;
      };

      const currentAssets: any[] = [];
      const fixedAssets: any[] = [];
      const currentLiabilities: any[] = [];
      const longTermLiabilities: any[] = [];
      const equityAccounts: any[] = [];
      let capital = 0;
      let retainedEarnings = 0;

      for (const a of allAccounts) {
        const amount = balanceAt(a);
        const item = { code: a.code, nameAr: a.nameAr, nameEn: a.nameEn, amount };
        if (a.type === 'asset') {
          if (a.subType === 'fixed_asset' || a.subType === 'non_current_asset') fixedAssets.push(item);
          else currentAssets.push(item);
        } else if (a.type === 'liability') {
          if (a.subType === 'long_term_liability' || a.subType === 'non_current_liability') longTermLiabilities.push(item);
          else currentLiabilities.push(item);
        } else if (a.type === 'equity') {
          equityAccounts.push(item);
          if ((a.code || '').startsWith('31') || /capital/i.test(a.nameEn || '')) capital += amount;
          else if ((a.code || '').startsWith('32') || /retained/i.test(a.nameEn || '')) retainedEarnings += amount;
        }
      }

      if (retainedEarnings === 0) {
        const revRow: any = safeGet(
          `SELECT COALESCE(SUM(jel.credit) - SUM(jel.debit),0) AS amt
             FROM accounting_accounts a
             JOIN journal_entry_lines jel ON jel.accountId = a.id
             JOIN journal_entries je ON je.id = jel.entryId
            WHERE a.type='revenue' AND je.status='posted' AND je.entryDate <= ?`,
          [asOfDate],
        );
        const expRow: any = safeGet(
          `SELECT COALESCE(SUM(jel.debit) - SUM(jel.credit),0) AS amt
             FROM accounting_accounts a
             JOIN journal_entry_lines jel ON jel.accountId = a.id
             JOIN journal_entries je ON je.id = jel.entryId
            WHERE a.type='expense' AND je.status='posted' AND je.entryDate <= ?`,
          [asOfDate],
        );
        retainedEarnings = Number(revRow?.amt || 0) - Number(expRow?.amt || 0);
      }

      const assetsTotal = currentAssets.reduce((s, a) => s + a.amount, 0) + fixedAssets.reduce((s, a) => s + a.amount, 0);
      const liabilitiesTotal = currentLiabilities.reduce((s, a) => s + a.amount, 0) + longTermLiabilities.reduce((s, a) => s + a.amount, 0);
      const equityTotal = capital + retainedEarnings;
      const totalLE = liabilitiesTotal + equityTotal;

      res.json({
        asOfDate,
        assets: { currentAssets, fixedAssets, total: assetsTotal },
        liabilities: { currentLiabilities, longTermLiabilities, total: liabilitiesTotal },
        equity: { capital, retainedEarnings, accounts: equityAccounts, total: equityTotal },
        totalLiabilitiesAndEquity: totalLE,
        isBalanced: Math.abs(assetsTotal - totalLE) < 0.01,
      });
    } catch (err: any) { res.status(500).json({ error: err?.message || 'خطأ في الميزانية العمومية' }); }
  });

  // ──────────────────────────────────────────────────────────────
  //  5) Operations Report — التقرير التشغيلي
  // ──────────────────────────────────────────────────────────────
  app.get('/api/accounting/reports/operations', requireAccountant, (req: any, res: any) => {
    try {
      const { from, to } = defaultDates(req.query.dateFrom, req.query.dateTo);

      let totalCars = 0, totalRevenue = 0, avgSalePrice = 0;
      let topSellingMake: string | null = null;
      if (tableExists('cars')) {
        const soldRow: any = safeGet(
          `SELECT COUNT(*) AS cnt, COALESCE(SUM(salePrice),0) AS rev, COALESCE(AVG(salePrice),0) AS avgp
             FROM cars
            WHERE status IN ('sold','delivered','completed')
              AND (soldAt BETWEEN ? AND ? OR updatedAt BETWEEN ? AND ?)`,
          [from, to, from, to],
        );
        totalCars = Number(soldRow?.cnt || 0);
        totalRevenue = Number(soldRow?.rev || 0);
        avgSalePrice = Number(soldRow?.avgp || 0);
        const makeRow: any = safeGet(
          `SELECT make, COUNT(*) AS cnt FROM cars
            WHERE status IN ('sold','delivered','completed')
              AND (soldAt BETWEEN ? AND ? OR updatedAt BETWEEN ? AND ?)
            GROUP BY make ORDER BY cnt DESC LIMIT 1`,
          [from, to, from, to],
        );
        topSellingMake = makeRow?.make || null;
      }

      let totalCommissionsEarned = 0, avgCommissionRate = 0;
      if (tableExists('invoices')) {
        const commRow: any = safeGet(
          `SELECT COALESCE(SUM(commissionAmount),0) AS total, COALESCE(AVG(commissionRate),0) AS rate
             FROM invoices WHERE status='paid' AND timestamp BETWEEN ? AND ?`,
          [from, to],
        );
        totalCommissionsEarned = Number(commRow?.total || 0);
        avgCommissionRate = Number(commRow?.rate || 0);
      }

      const dealerSubs: any = { activeSubscribers: 0, monthlyRevenue: 0, byPackage: {} };
      if (tableExists('dealer_subscriptions')) {
        const activeRow: any = safeGet(
          `SELECT COUNT(*) AS cnt, COALESCE(SUM(monthlyFee),0) AS rev FROM dealer_subscriptions WHERE status='active'`,
        );
        dealerSubs.activeSubscribers = Number(activeRow?.cnt || 0);
        dealerSubs.monthlyRevenue = Number(activeRow?.rev || 0);
        const pkgRows = safeAll(
          `SELECT packageType, COUNT(*) AS cnt FROM dealer_subscriptions WHERE status='active' GROUP BY packageType`,
        );
        for (const r of pkgRows) dealerSubs.byPackage[r.packageType || 'unknown'] = Number(r.cnt || 0);
      }

      let shippingOrders = 0, shippingRevenue = 0;
      if (tableExists('shipping_orders')) {
        const shipRow: any = safeGet(
          `SELECT COUNT(*) AS cnt, COALESCE(SUM(totalCost),0) AS rev FROM shipping_orders
            WHERE status IN ('completed','delivered') AND createdAt BETWEEN ? AND ?`,
          [from, to],
        );
        shippingOrders = Number(shipRow?.cnt || 0);
        shippingRevenue = Number(shipRow?.rev || 0);
      }

      let conversionRate = 0, avgResolutionDays = 0, customerSatisfaction = 0;
      if (tableExists('cars')) {
        const totalRow: any = safeGet(`SELECT COUNT(*) AS cnt FROM cars WHERE createdAt BETWEEN ? AND ?`, [from, to]);
        const total = Number(totalRow?.cnt || 0);
        conversionRate = total > 0 ? Math.round((totalCars / total) * 10000) / 100 : 0;
      }
      if (tableExists('shipping_orders')) {
        const resRow: any = safeGet(
          `SELECT AVG(CAST((julianday(deliveredAt) - julianday(createdAt)) AS REAL)) AS d
             FROM shipping_orders WHERE deliveredAt IS NOT NULL AND createdAt BETWEEN ? AND ?`,
          [from, to],
        );
        avgResolutionDays = Math.round(Number(resRow?.d || 0) * 10) / 10;
      }
      if (tableExists('reviews')) {
        const satRow: any = safeGet(`SELECT AVG(rating) AS r FROM reviews WHERE createdAt BETWEEN ? AND ?`, [from, to]);
        customerSatisfaction = Math.round(Number(satRow?.r || 0) * 10) / 10;
      }

      res.json({
        period: { from, to },
        sales: {
          totalCars, totalRevenue,
          avgSalePrice: Math.round(avgSalePrice * 100) / 100,
          topSellingMake,
        },
        commissions: {
          totalEarned: totalCommissionsEarned,
          avgCommissionRate: Math.round(avgCommissionRate * 100) / 100,
        },
        dealerSubscriptions: dealerSubs,
        shippingServices: { ordersCompleted: shippingOrders, revenue: shippingRevenue },
        kpis: { conversionRate, avgResolutionDays, customerSatisfaction },
      });
    } catch (err: any) { res.status(500).json({ error: err?.message || 'خطأ في التقرير التشغيلي' }); }
  });

  // GET /api/accounting/activity — filterable
  app.get('/api/accounting/activity', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح — صلاحيات محاسب/مدير مطلوبة' });
      }
      const { userId, action, entityType, entityId, dateFrom, dateTo } = req.query as Record<
        string,
        string
      >;
      const where: string[] = [];
      const params: any[] = [];
      if (userId)     { where.push('userId = ?');     params.push(userId); }
      if (action)     { where.push('action = ?');     params.push(action); }
      if (entityType) { where.push('entityType = ?'); params.push(entityType); }
      if (entityId)   { where.push('entityId = ?');   params.push(entityId); }
      if (dateFrom)   { where.push('timestamp >= ?'); params.push(dateFrom); }
      if (dateTo)     { where.push('timestamp <= ?'); params.push(dateTo); }
      const sql =
        'SELECT * FROM accounting_activity' +
        (where.length ? ' WHERE ' + where.join(' AND ') : '') +
        ' ORDER BY timestamp DESC LIMIT 500';
      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ───────── Dashboard helper endpoints ─────────

  // GET /api/accounting/reports/cash-balance
  app.get('/api/accounting/reports/cash-balance', requireAccountant, (_req: any, res: any) => {
    try {
      // Sum of Cash/Bank account balances (assets)
      const row: any = db.prepare(`
        SELECT COALESCE(SUM(
          CASE WHEN a.normalBalance = 'debit'
               THEN (a.openingBalance + IFNULL((SELECT SUM(debit - credit) FROM journal_lines jl JOIN journal_entries je ON jl.entryId = je.id WHERE jl.accountCode = a.code AND je.status = 'posted'), 0))
               ELSE (a.openingBalance + IFNULL((SELECT SUM(credit - debit) FROM journal_lines jl JOIN journal_entries je ON jl.entryId = je.id WHERE jl.accountCode = a.code AND je.status = 'posted'), 0))
          END
        ), 0) as balance
        FROM coa_accounts a
        WHERE a.type = 'asset' AND (a.code LIKE '101%' OR a.code LIKE '102%' OR a.name LIKE '%Cash%' OR a.name LIKE '%Bank%' OR a.nameAr LIKE '%نقد%' OR a.nameAr LIKE '%بنك%')
      `).get();
      res.json({ balance: row?.balance || 0, cashBalance: row?.balance || 0 });
    } catch (err: any) {
      // Gracefully return zero instead of 500 if schema differs
      res.json({ balance: 0, cashBalance: 0, error: err.message });
    }
  });

  // GET /api/accounting/journal-entries?limit=10
  app.get('/api/accounting/journal-entries', requireAccountant, (req: any, res: any) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 500);
      let rows: any[] = [];
      try {
        rows = db.prepare(`SELECT * FROM journal_entries ORDER BY date DESC, id DESC LIMIT ?`).all(limit) as any[];
      } catch {
        rows = [];
      }
      res.json(rows);
    } catch (err: any) {
      res.json([]);
    }
  });

  // GET /api/accounting/reports/monthly-pl?months=6
  app.get('/api/accounting/reports/monthly-pl', requireAccountant, (req: any, res: any) => {
    try {
      const months = Math.min(Number(req.query.months) || 6, 24);
      const result: Array<{ month: string; revenue: number; expenses: number; netProfit: number }> = [];
      const now = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);

        let revenue = 0, expenses = 0;
        try {
          const revRow: any = db.prepare(`
            SELECT COALESCE(SUM(jl.credit - jl.debit), 0) as total
            FROM journal_lines jl
            JOIN journal_entries je ON jl.entryId = je.id
            JOIN coa_accounts a ON jl.accountCode = a.code
            WHERE a.type = 'revenue' AND je.status = 'posted'
              AND je.date >= ? AND je.date < ?
          `).get(d.toISOString(), nextMonth.toISOString());
          revenue = revRow?.total || 0;

          const expRow: any = db.prepare(`
            SELECT COALESCE(SUM(jl.debit - jl.credit), 0) as total
            FROM journal_lines jl
            JOIN journal_entries je ON jl.entryId = je.id
            JOIN coa_accounts a ON jl.accountCode = a.code
            WHERE a.type = 'expense' AND je.status = 'posted'
              AND je.date >= ? AND je.date < ?
          `).get(d.toISOString(), nextMonth.toISOString());
          expenses = expRow?.total || 0;
        } catch {}

        result.push({ month: monthKey, revenue, expenses, netProfit: revenue - expenses });
      }
      res.json(result);
    } catch (err: any) {
      res.json([]);
    }
  });
}
