/**
 * Office Info — public office contact details + bank accounts shown to
 * users who pick "bank transfer" or "cash" as their wallet-topup method.
 *
 * Public:
 *   GET /api/office-info
 *     Returns { branches: [...], bankAccounts: [...] }
 *     Used by the deposit page to show users HOW to pay offline.
 *
 * Admin:
 *   GET    /api/admin/office-info
 *   POST   /api/admin/office-branches              (create)
 *   PUT    /api/admin/office-branches/:id          (update)
 *   DELETE /api/admin/office-branches/:id          (soft delete — sets isActive=0)
 *   POST   /api/admin/office-bank-accounts         (create)
 *   PUT    /api/admin/office-bank-accounts/:id     (update)
 *   DELETE /api/admin/office-bank-accounts/:id     (soft delete)
 *
 * Schema (idempotent ALTER on existing `offices` + new bank_accounts table):
 *   offices.address, phone, whatsapp, email, hours, city, country, sortOrder, isActive
 *   office_bank_accounts: id, bankName, accountName, accountNumber, iban,
 *                         currency, qrCodeUrl, notes, sortOrder, isActive
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export function registerOfficeInfoRoutes(ctx: AppContext) {
  const { app, db } = ctx as any;

  // ── Schema migrations (idempotent) ────────────────────────────────────
  // Extend existing `offices` table — adds rich contact columns.
  ['address TEXT', 'phone TEXT', 'whatsapp TEXT', 'email TEXT',
   'hours TEXT', 'city TEXT', 'country TEXT DEFAULT \'LY\'',
   'sortOrder INTEGER DEFAULT 0', 'isActive INTEGER DEFAULT 1',
   'mapUrl TEXT'].forEach((col) => {
    try { db.exec(`ALTER TABLE offices ADD COLUMN ${col}`); } catch {}
  });

  // New table for bank accounts.
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS office_bank_accounts (
      id TEXT PRIMARY KEY,
      bankName TEXT NOT NULL,
      accountName TEXT,
      accountNumber TEXT NOT NULL,
      iban TEXT,
      currency TEXT DEFAULT 'LYD',
      qrCodeUrl TEXT,
      notes TEXT,
      sortOrder INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT,
      updatedAt TEXT
    )`);
  } catch {}

  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_offices_active ON offices(isActive, sortOrder)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON office_bank_accounts(isActive, sortOrder)`); } catch {}

  // ── GET /api/office-info ──────────────────────────────────────────────
  // Public endpoint — no auth needed. Cached for 60s in-memory.
  let cache: { value: any; expiresAt: number } | null = null;
  const TTL_MS = 60_000;

  app.get('/api/office-info', (_req: any, res: any) => {
    if (cache && cache.expiresAt > Date.now()) {
      return res.json(cache.value);
    }
    try {
      const branches = db.prepare(`
        SELECT id, name, address, phone, whatsapp, email, hours, city, country, mapUrl, sortOrder
          FROM offices
         WHERE COALESCE(isActive, 1) = 1
         ORDER BY COALESCE(sortOrder, 0) ASC, name ASC
      `).all();

      const bankAccounts = db.prepare(`
        SELECT id, bankName, accountName, accountNumber, iban, currency, qrCodeUrl, notes, sortOrder
          FROM office_bank_accounts
         WHERE COALESCE(isActive, 1) = 1
         ORDER BY COALESCE(sortOrder, 0) ASC, bankName ASC
      `).all();

      // Read contact details from system_settings (admin-editable).
      const getSetting = (k: string): string => {
        try {
          const row: any = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(k);
          return row?.value || '';
        } catch { return ''; }
      };

      const result = {
        branches,
        bankAccounts,
        contact: {
          generalEmail: getSetting('office_general_email') || 'info@autopro.ac',
          generalPhone: getSetting('office_general_phone') || '',
          generalWhatsapp: getSetting('office_general_whatsapp') || '',
          paymentInstructions: getSetting('payment_instructions_ar')
            || 'بعد إتمام التحويل البنكي أو الدفع نقداً في أحد فروعنا، سنتحقق من العملية يدوياً ونُفعّل العربون خلال 24 ساعة. للاستفسار راسلنا على واتساب أو الإيميل.',
        },
      };

      cache = { value: result, expiresAt: Date.now() + TTL_MS };
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── GET /api/admin/office-info ───────────────────────────────────────
  // Admin sees inactive too.
  app.get('/api/admin/office-info', requireAdmin, (_req: any, res: any) => {
    try {
      const branches = db.prepare(`
        SELECT id, name, address, phone, whatsapp, email, hours, city, country, mapUrl, sortOrder, isActive, manager, branchId
          FROM offices ORDER BY COALESCE(sortOrder, 0) ASC, name ASC
      `).all();

      const bankAccounts = db.prepare(`
        SELECT id, bankName, accountName, accountNumber, iban, currency, qrCodeUrl, notes, sortOrder, isActive, createdAt, updatedAt
          FROM office_bank_accounts ORDER BY COALESCE(sortOrder, 0) ASC, bankName ASC
      `).all();

      res.json({ branches, bankAccounts });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/office-branches ───────────────────────────────────
  app.post('/api/admin/office-branches', requireAdmin, (req: any, res: any) => {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ error: 'الاسم مطلوب' });
    try {
      const id = b.id || `branch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`
        INSERT INTO offices (id, name, address, phone, whatsapp, email, hours, city, country, mapUrl, sortOrder, isActive, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')
      `).run(id, b.name, b.address || null, b.phone || null, b.whatsapp || null,
             b.email || null, b.hours || null, b.city || null, b.country || 'LY',
             b.mapUrl || null, Number(b.sortOrder) || 0);
      cache = null; // invalidate
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── PUT /api/admin/office-branches/:id ────────────────────────────────
  app.put('/api/admin/office-branches/:id', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    const b = req.body || {};
    try {
      const exists: any = db.prepare('SELECT id FROM offices WHERE id = ?').get(id);
      if (!exists) return res.status(404).json({ error: 'الفرع غير موجود' });
      db.prepare(`
        UPDATE offices
           SET name = COALESCE(?, name),
               address = COALESCE(?, address),
               phone = COALESCE(?, phone),
               whatsapp = COALESCE(?, whatsapp),
               email = COALESCE(?, email),
               hours = COALESCE(?, hours),
               city = COALESCE(?, city),
               country = COALESCE(?, country),
               mapUrl = COALESCE(?, mapUrl),
               sortOrder = COALESCE(?, sortOrder),
               isActive = COALESCE(?, isActive)
         WHERE id = ?
      `).run(b.name ?? null, b.address ?? null, b.phone ?? null, b.whatsapp ?? null,
             b.email ?? null, b.hours ?? null, b.city ?? null, b.country ?? null,
             b.mapUrl ?? null, b.sortOrder !== undefined ? Number(b.sortOrder) : null,
             b.isActive !== undefined ? (b.isActive ? 1 : 0) : null, id);
      cache = null;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── DELETE /api/admin/office-branches/:id (soft delete) ───────────────
  app.delete('/api/admin/office-branches/:id', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    try {
      db.prepare('UPDATE offices SET isActive = 0 WHERE id = ?').run(id);
      cache = null;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/office-bank-accounts ──────────────────────────────
  app.post('/api/admin/office-bank-accounts', requireAdmin, (req: any, res: any) => {
    const b = req.body || {};
    if (!b.bankName || !b.accountNumber) {
      return res.status(400).json({ error: 'اسم البنك ورقم الحساب مطلوبان' });
    }
    try {
      const id = `bank-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO office_bank_accounts
          (id, bankName, accountName, accountNumber, iban, currency, qrCodeUrl, notes, sortOrder, isActive, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(id, b.bankName, b.accountName || null, b.accountNumber, b.iban || null,
             b.currency || 'LYD', b.qrCodeUrl || null, b.notes || null,
             Number(b.sortOrder) || 0, now, now);
      cache = null;
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── PUT /api/admin/office-bank-accounts/:id ──────────────────────────
  app.put('/api/admin/office-bank-accounts/:id', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    const b = req.body || {};
    try {
      const exists: any = db.prepare('SELECT id FROM office_bank_accounts WHERE id = ?').get(id);
      if (!exists) return res.status(404).json({ error: 'الحساب غير موجود' });
      db.prepare(`
        UPDATE office_bank_accounts
           SET bankName = COALESCE(?, bankName),
               accountName = COALESCE(?, accountName),
               accountNumber = COALESCE(?, accountNumber),
               iban = COALESCE(?, iban),
               currency = COALESCE(?, currency),
               qrCodeUrl = COALESCE(?, qrCodeUrl),
               notes = COALESCE(?, notes),
               sortOrder = COALESCE(?, sortOrder),
               isActive = COALESCE(?, isActive),
               updatedAt = ?
         WHERE id = ?
      `).run(b.bankName ?? null, b.accountName ?? null, b.accountNumber ?? null,
             b.iban ?? null, b.currency ?? null, b.qrCodeUrl ?? null, b.notes ?? null,
             b.sortOrder !== undefined ? Number(b.sortOrder) : null,
             b.isActive !== undefined ? (b.isActive ? 1 : 0) : null,
             new Date().toISOString(), id);
      cache = null;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── DELETE /api/admin/office-bank-accounts/:id (soft delete) ──────────
  app.delete('/api/admin/office-bank-accounts/:id', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    try {
      db.prepare('UPDATE office_bank_accounts SET isActive = 0 WHERE id = ?').run(id);
      cache = null;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  console.log('[office-info] /api/office-info ready (offices + bank accounts)');
}
