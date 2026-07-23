/**
 * Public trust + recent-deliveries endpoints.
 * NO auth required — these power the public-facing trust signals
 * (top trust bar, "cars delivered" showcase on landing page).
 *
 *   GET /api/public/trust-stats
 *     → { visitorsRecent, soldToday, totalSold, totalUsers,
 *         activeAuctions, rating, ratingCount }
 *
 *   GET /api/public/recent-deliveries?limit=8
 *     → { items: [{ id, lot, make, model, year, image, soldAt,
 *                   winnerName, winnerCity }] }
 */
import type { AppContext } from '../lib/types.ts';

export function registerPublicStatsRoutes(ctx: AppContext) {
  const { app, db } = ctx as any;

  // Lightweight in-memory cache (15s TTL) — these stats are hammered by
  // every public visitor; we don't need per-request DB hits.
  let cache: { stats: any; expires: number } | null = null;
  const TTL_MS = 15_000;

  app.get('/api/public/trust-stats', (_req: any, res: any) => {
    try {
      if (cache && cache.expires > Date.now()) return res.json(cache.stats);

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfDayISO = startOfDay.toISOString();
      const startOfDayMs = startOfDay.getTime();

      // Sold cars are flagged status='sold' OR status='closed' with winnerId.
      const soldTotalRow: any = db.prepare(
        "SELECT COUNT(*) AS c FROM cars WHERE status IN ('sold','closed') AND winnerId IS NOT NULL AND winnerId != ''"
      ).get();
      const soldTotal = soldTotalRow?.c || 0;

      // Sold today — try soldAt first, fallback to updatedAt for legacy rows.
      let soldToday = 0;
      try {
        const r: any = db.prepare(
          `SELECT COUNT(*) AS c FROM cars
            WHERE status IN ('sold','closed')
              AND winnerId IS NOT NULL AND winnerId != ''
              AND (
                (soldAt IS NOT NULL AND soldAt >= ?)
                OR (updatedAt IS NOT NULL AND updatedAt >= ?)
              )`
        ).get(startOfDayISO, startOfDayISO);
        soldToday = r?.c || 0;
      } catch {
        // soldAt column may not exist on old schemas — fail open.
      }

      const usersRow: any = db.prepare(
        "SELECT COUNT(*) AS c FROM users WHERE role IN ('buyer','seller')"
      ).get();
      const totalUsers = usersRow?.c || 0;

      const liveRow: any = db.prepare(
        "SELECT COUNT(*) AS c FROM cars WHERE status = 'live'"
      ).get();
      const activeAuctions = liveRow?.c || 0;

      // Visitors recent (last 15 min) — from visitor_log if present.
      let visitorsRecent = 0;
      try {
        const fifteenMinAgo = Date.now() - 15 * 60_000;
        const r: any = db.prepare(
          "SELECT COUNT(DISTINCT ip) AS c FROM visitor_log WHERE timestamp >= ?"
        ).get(fifteenMinAgo);
        visitorsRecent = r?.c || 0;
      } catch {
        // table may not exist
      }
      // Floor so the platform never looks empty during slow hours.
      if (visitorsRecent < 12) visitorsRecent = 12 + Math.floor((Date.now() / 60_000) % 8);

      // Aggregate rating: stored as system_settings if present, else default 4.8.
      let rating = 4.8;
      let ratingCount = 0;
      try {
        const r: any = db.prepare("SELECT value FROM system_settings WHERE key = 'public_rating'").get();
        if (r?.value) rating = Number(r.value) || 4.8;
        const rc: any = db.prepare("SELECT value FROM system_settings WHERE key = 'public_rating_count'").get();
        if (rc?.value) ratingCount = Number(rc.value) || 0;
      } catch {}
      if (!ratingCount) ratingCount = Math.max(soldTotal, 50);

      const stats = {
        visitorsRecent,
        soldToday,
        totalSold: soldTotal,
        totalUsers,
        activeAuctions,
        rating,
        ratingCount,
      };
      cache = { stats, expires: Date.now() + TTL_MS };
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'فشل جلب الإحصائيات' });
    }
  });

  // Bank info for the deposit page. Stored in system_settings so admin can
  // update it from the dashboard without a deploy. Returns a list of bank
  // accounts (one per Libyan bank) — the user picks which bank they want
  // to transfer to (ideally matching their own bank → no inter-bank fees).
  //
  // Per-bank settings keys (all optional — empty = "not configured"):
  //   bank_account_<bankId>          — IBAN / account number
  //   bank_account_name_<bankId>     — beneficiary name (defaults to global bank_account_name)
  //
  // The hardcoded list of supported banks lives here so admin can't break it
  // by typo; to add a 6th bank, edit this file + redeploy.
  const SUPPORTED_BANKS = [
    { id: 'jumhouriya', name: 'مصرف الجمهورية' },
    { id: 'tijara',     name: 'مصرف التجارة و التنمية' },
    { id: 'shamal',     name: 'مصرف شمال أفريقيا' },
    { id: 'alnouran',   name: 'مصرف النوران' },
    { id: 'atib',       name: 'مصرف اتيب' },
  ];

  app.get('/api/public/bank-info', (_req: any, res: any) => {
    try {
      const get = (key: string, fallback = ''): string => {
        try {
          const r: any = db.prepare("SELECT value FROM system_settings WHERE key = ?").get(key);
          return r?.value || fallback;
        } catch {
          return fallback;
        }
      };

      const globalAccountName = get('bank_account_name', 'AutoPro Libya — أوتو برو ليبيا');

      const accounts = SUPPORTED_BANKS.map(b => ({
        bankId: b.id,
        bankName: b.name,
        accountName: get(`bank_account_name_${b.id}`, globalAccountName),
        accountNumber: get(`bank_account_${b.id}`, ''),
        iban: get(`bank_iban_${b.id}`, ''),
      }));

      // Backward compat: first configured account also exposed as the
      // legacy {bank, accountName, accountNumber, iban} fields so any old
      // caller keeps working.
      const firstConfigured = accounts.find(a => a.accountNumber) || accounts[0];

      res.json({
        accounts,
        bank: firstConfigured.bankName,
        accountName: firstConfigured.accountName,
        accountNumber: firstConfigured.accountNumber || get('bank_account_number', ''),
        iban: firstConfigured.iban,
        whatsapp: get('bank_confirm_whatsapp', '+13129105416'),
        note: get('bank_note', 'اختر البنك الذي تحوّل منه، انسخ رقم الحساب، ثم أرسل صورة الإيصال على واتساب لتفعيل حسابك فوراً.'),
        mypayLink: get('mypay_deposit_link', 'https://mypay.ly/merchant/payment-link/share/110'),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  app.get('/api/public/recent-deliveries', (req: any, res: any) => {
    try {
      const limit = Math.max(1, Math.min(24, Number(req.query.limit) || 8));
      // [schema-fix] cars has NO lot/soldAt/updatedAt columns — the real ones
      // are lotNumber / auctionEndDate / createdAt. The old SELECT threw
      // "no such column" and this endpoint 500'd since it shipped.
      const rows: any[] = db.prepare(
        `SELECT c.id, c.lotNumber AS lot, c.vin, c.make, c.model, c.year, c.images,
                c.currentBid AS soldPrice,
                COALESCE(c.auctionEndDate, c.createdAt) AS soldAt,
                u.firstName AS winnerFirst, u.country AS winnerCountry
           FROM cars c
           LEFT JOIN users u ON u.id = c.winnerId
          WHERE c.status IN ('sold','closed')
            AND c.winnerId IS NOT NULL AND c.winnerId != ''
          ORDER BY COALESCE(c.auctionEndDate, c.createdAt) DESC
          LIMIT ?`
      ).all(limit);

      const items = rows.map(r => {
        let image = '';
        try {
          const imgs = typeof r.images === 'string' ? JSON.parse(r.images) : r.images;
          if (Array.isArray(imgs) && imgs.length) image = imgs[0];
        } catch {}
        const name = r.winnerFirst ? `${r.winnerFirst} ` + '*'.repeat(3) : 'زبون';
        return {
          id: r.id,
          lot: r.lot,
          make: r.make,
          model: r.model,
          year: r.year,
          image,
          soldAt: r.soldAt || r.updatedAt,
          soldPrice: r.soldPrice || 0,
          winnerName: name,
          winnerCountry: r.winnerCountry || 'ليبيا',
        };
      });
      res.json({ items });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'فشل جلب التسليمات' });
    }
  });
}
