/**
 * Payment Phase 3 — closes the verification loop with three additions
 * built on top of routes/payment-verification.ts (PR #25):
 *
 *   1. User-side receipt attachment
 *      The user can attach a receipt URL to their own pending topup
 *      request. They typically already sent it on WhatsApp; this just
 *      gives the admin one-click access from the verification panel
 *      instead of digging through chat history.
 *
 *      POST /api/wallet/payment-requests/:id/upload-receipt
 *        (requireAuth — user can only attach to their own request)
 *        Body: { bankReceiptUrl, referenceFromBank? }
 *
 *   2. Aggregated reports for finance review
 *      GET /api/admin/payment-verifications/report?period=daily|weekly|monthly
 *        Returns: total verified amount, count, average wait time,
 *        breakdown by payment method, top 5 funded users.
 *
 *   3. Overdue alerts (24h+ pending requests)
 *      GET /api/admin/payment-verifications/overdue
 *        Returns the list (not just the count) so the panel can show
 *        a banner with the actual stalled requests.
 *
 *      POST /api/admin/payment-verifications/notify-overdue
 *        Sends a follow-up reminder to every user with a stalled
 *        request — useful when admin returns from a few days off.
 *
 * No schema changes — all columns already exist from PR #25.
 */
import { requireAdmin, requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

function startOfPeriod(period: string): string {
  const now = new Date();
  if (period === 'daily') {
    now.setHours(0, 0, 0, 0);
  } else if (period === 'weekly') {
    const day = now.getDay(); // 0 = Sunday
    now.setDate(now.getDate() - day);
    now.setHours(0, 0, 0, 0);
  } else { // monthly (default)
    now.setDate(1);
    now.setHours(0, 0, 0, 0);
  }
  return now.toISOString();
}

export function registerPaymentPhase3Routes(ctx: AppContext) {
  const { app, db, sendNotification, sendInternalMessage } = ctx as any;

  // ── POST /api/wallet/payment-requests/:id/upload-receipt ───────────────
  // The user attaches a receipt URL to their own pending topup. Admin
  // can still overwrite it from the verification panel.
  app.post('/api/wallet/payment-requests/:id/upload-receipt', requireAuth, (req: any, res: any) => {
    const { id } = req.params;
    const { bankReceiptUrl, referenceFromBank } = req.body || {};

    if (!bankReceiptUrl || !String(bankReceiptUrl).trim()) {
      return res.status(400).json({ error: 'رابط الإيصال مطلوب' });
    }

    try {
      const pr: any = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
      if (!pr) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (pr.userId !== req.user?.id) {
        return res.status(403).json({ error: 'لا يمكنك تعديل طلب مستخدم آخر' });
      }
      if (pr.status === 'approved' || pr.status === 'rejected') {
        return res.status(400).json({ error: 'الطلب مُغلق — لا يمكن تعديل الإيصال' });
      }

      db.prepare(`
        UPDATE payment_requests
           SET bankReceiptUrl = ?,
               referenceFromBank = COALESCE(?, referenceFromBank)
         WHERE id = ?
      `).run(String(bankReceiptUrl).trim(),
             referenceFromBank ? String(referenceFromBank).trim() : null,
             id);

      // Tell the admin a receipt just landed.
      try {
        sendNotification(
          'admin-1',
          '📎 إيصال جديد من مستخدم',
          `طلب ${id} (${Number(pr.amount).toLocaleString('en-US')}) أرفق إيصالاً.`,
          'info'
        );
      } catch {}

      res.json({ success: true });
    } catch (e: any) {
      console.error('[payment-phase3] upload-receipt failed:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── GET /api/admin/payment-verifications/report?period=... ─────────────
  app.get('/api/admin/payment-verifications/report', requireAdmin, (req: any, res: any) => {
    const period = String(req.query?.period || 'monthly');
    const since = startOfPeriod(period);

    try {
      const verified = (db.prepare(`
        SELECT COUNT(*)                       AS count,
               COALESCE(SUM(receivedAmount), 0) AS totalReceived,
               COALESCE(SUM(amount), 0)         AS totalRequested
          FROM payment_requests
         WHERE verification_status = 'verified'
           AND verifiedAt >= ?
      `).get(since) as any);

      const rejected = (db.prepare(`
        SELECT COUNT(*) AS count
          FROM payment_requests
         WHERE verification_status = 'rejected' AND verifiedAt >= ?
      `).get(since) as any).count;

      // Average wait time (hours) between requestedAt and verifiedAt.
      // SQLite julianday() handles ISO timestamps well enough.
      const avgRow: any = db.prepare(`
        SELECT AVG((julianday(verifiedAt) - julianday(requestedAt)) * 24) AS hours
          FROM payment_requests
         WHERE verification_status = 'verified'
           AND verifiedAt >= ?
           AND requestedAt IS NOT NULL
      `).get(since);
      const avgWaitHours = Number(avgRow?.hours || 0);

      const byMethod = db.prepare(`
        SELECT COALESCE(method, 'unknown')      AS method,
               COUNT(*)                          AS count,
               COALESCE(SUM(receivedAmount), 0)  AS total
          FROM payment_requests
         WHERE verification_status = 'verified'
           AND verifiedAt >= ?
         GROUP BY method
         ORDER BY total DESC
      `).all(since);

      const topUsers = db.prepare(`
        SELECT pr.userId,
               u.firstName, u.lastName, u.email,
               COUNT(*)                         AS deposits,
               COALESCE(SUM(pr.receivedAmount), 0) AS total
          FROM payment_requests pr
          LEFT JOIN users u ON pr.userId = u.id
         WHERE pr.verification_status = 'verified'
           AND pr.verifiedAt >= ?
         GROUP BY pr.userId
         ORDER BY total DESC
         LIMIT 5
      `).all(since);

      res.json({
        period,
        since,
        verified: {
          count: verified.count,
          totalReceived: verified.totalReceived,
          totalRequested: verified.totalRequested,
          delta: verified.totalReceived - verified.totalRequested,
        },
        rejected: { count: rejected },
        avgWaitHours: Math.round(avgWaitHours * 10) / 10,
        byMethod,
        topUsers,
      });
    } catch (e: any) {
      console.error('[payment-phase3] report failed:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── GET /api/admin/payment-verifications/overdue ───────────────────────
  app.get('/api/admin/payment-verifications/overdue', requireAdmin, (_req: any, res: any) => {
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    try {
      const rows = db.prepare(`
        SELECT pr.id, pr.userId, pr.amount, pr.method, pr.requestedAt,
               pr.bankReceiptUrl, pr.referenceFromBank, pr.referenceNo,
               u.firstName, u.lastName, u.email, u.phone,
               (julianday('now') - julianday(pr.requestedAt)) * 24 AS hoursStalled
          FROM payment_requests pr
          LEFT JOIN users u ON pr.userId = u.id
         WHERE pr.type = 'topup'
           AND COALESCE(pr.verification_status, 'pending') = 'pending'
           AND COALESCE(pr.status, 'pending') = 'pending'
           AND pr.requestedAt < ?
         ORDER BY pr.requestedAt ASC
      `).all(dayAgo);

      res.json({ count: rows.length, requests: rows });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/payment-verifications/notify-overdue ───────────────
  // Send a "we're still waiting on your receipt" reminder to every user
  // whose request has been pending for more than 24h.
  app.post('/api/admin/payment-verifications/notify-overdue', requireAdmin, (_req: any, res: any) => {
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    try {
      const rows: any[] = db.prepare(`
        SELECT id, userId, amount, requestedAt
          FROM payment_requests
         WHERE type = 'topup'
           AND COALESCE(verification_status, 'pending') = 'pending'
           AND COALESCE(status, 'pending') = 'pending'
           AND requestedAt < ?
      `).all(dayAgo);

      let sent = 0;
      for (const r of rows) {
        try {
          const subject = '⏰ تذكير: طلب شحن محفظتك بانتظار الإيصال';
          const body =
            `لاحظنا أنّ طلب شحن محفظتك بقيمة ${Number(r.amount).toLocaleString('en-US')} ` +
            `لم يكتمل بعد. لإكمال الإجراء، يرجى إرسال صورة وصل التحويل البنكي ` +
            `عبر الواتساب أو من خلال صفحة المحفظة. شكراً لاختيارك أوتوبرو.`;
          sendNotification(r.userId, subject, body.slice(0, 200), 'warning');
          sendInternalMessage('admin-1', r.userId, subject, body);
          sent++;
        } catch {}
      }

      res.json({ success: true, total: rows.length, sent });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  console.log('[payment-phase3] receipt upload + reports + overdue alerts ready');
}
