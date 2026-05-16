/**
 * Payment Verification Workflow — safe replacement for the old "approve"
 * button that credited users without manual verification of the bank
 * transfer / cash payment.
 *
 * The old endpoint POST /api/admin/payment-requests/:id/approve still
 * exists in routes/payments.ts + routes/admin.ts (duplicated) and
 * remains dangerous. This module adds a SAFER parallel flow:
 *
 *   GET    /api/admin/payment-verifications/queue
 *     List all topup requests with status='pending'. The new admin
 *     panel uses this instead of the old /api/admin/payment-requests
 *     so the queue only shows what actually needs verification.
 *
 *   POST   /api/admin/payment-verifications/:id/verify-and-credit
 *     Body: { receivedAmount, bankReceiptUrl?, verificationNote?,
 *             referenceFromBank? }
 *     This is the ONLY endpoint that should credit a user's wallet
 *     for a bank-transfer / cash topup. It records proof + the actual
 *     amount received, marks verification_status='verified', then
 *     credits the wallet exactly like the old /approve did — but only
 *     after the admin has manually confirmed the transfer.
 *
 *   POST   /api/admin/payment-verifications/:id/reject
 *     Body: { reason }
 *     Marks the request rejected, notifies the user.
 *
 *   POST   /api/admin/payment-verifications/:id/contact-user
 *     Body: { template? | message }
 *     Sends an internal message + notification without changing status.
 *     Templates: 'request-receipt', 'received-confirm', 'call-us'.
 *
 * Schema (idempotent ALTER):
 *   payment_requests.verification_status  TEXT DEFAULT 'pending'
 *   payment_requests.verifiedBy           TEXT
 *   payment_requests.verifiedAt           TEXT
 *   payment_requests.verificationNote     TEXT
 *   payment_requests.receivedAmount       REAL
 *   payment_requests.bankReceiptUrl       TEXT
 *   payment_requests.referenceFromBank    TEXT
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

const TEMPLATES: Record<string, { subject: string; body: string }> = {
  'request-receipt': {
    subject: '📎 الرجاء إرسال صورة وصل التحويل',
    body: 'لإكمال إجراءات تفعيل عربون محفظتك، يرجى إرسال صورة وصل التحويل البنكي أو إيصال الإيداع. يمكنك إرسالها عبر الواتساب أو الإيميل.',
  },
  'received-confirm': {
    subject: '✅ تم استلام مبلغ التحويل',
    body: 'تم تأكيد استلام مبلغ التحويل بنجاح. سيتم تفعيل العربون في محفظتك خلال دقائق. شكراً لاختيارك أوتوبرو.',
  },
  'call-us': {
    subject: '📞 الرجاء التواصل مع المكتب',
    body: 'لإكمال إجراءات شحن المحفظة يرجى التواصل مع مكتبنا الرئيسي على الرقم المذكور في صفحة المحفظة.',
  },
  'amount-mismatch': {
    subject: '⚠️ المبلغ المستلم لا يطابق طلبك',
    body: 'لاحظنا اختلافاً بين المبلغ في طلبك والمبلغ المستلم في الحساب البنكي. يرجى التواصل مع الإدارة لتوضيح الموقف.',
  },
  'transfer-not-found': {
    subject: '❌ لم نجد التحويل في حسابنا البنكي',
    body: 'لم نتمكن من العثور على التحويل المذكور في حسابنا. يرجى مراجعة رقم المرجع وإعادة إرسال صورة وصل التحويل.',
  },
};

export function registerPaymentVerificationRoutes(ctx: AppContext) {
  const { app, db, sendNotification, sendInternalMessage, sendEmail } = ctx as any;

  // ── Schema migrations (idempotent) ─────────────────────────────────────
  ['verification_status TEXT DEFAULT \'pending\'',
   'verifiedBy TEXT',
   'verifiedAt TEXT',
   'verificationNote TEXT',
   'receivedAmount REAL',
   'bankReceiptUrl TEXT',
   'referenceFromBank TEXT'].forEach((col) => {
    try { db.exec(`ALTER TABLE payment_requests ADD COLUMN ${col}`); } catch {}
  });

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pr_verification ON payment_requests(verification_status, status, requestedAt)`);
  } catch {}

  // ── Helper: shared wallet-credit logic ─────────────────────────────────
  // Mirrors what the old /approve handler does, but only callable from
  // /verify-and-credit (which records proof first).
  function creditWallet(userId: string, amount: number, prId: string, note: string) {
    const now = new Date().toISOString();
    // Ensure wallet exists.
    db.prepare(`
      INSERT OR IGNORE INTO buyer_wallets (userId, balance, reservedAmount, totalDeposited, totalSpent, updatedAt)
      VALUES (?, 0, 0, 0, 0, ?)
    `).run(userId, now);

    db.transaction(() => {
      db.prepare(`
        UPDATE buyer_wallets
           SET balance = balance + ?,
               totalDeposited = totalDeposited + ?,
               updatedAt = ?
         WHERE userId = ?
      `).run(amount, amount, now, userId);

      // Mirror to users.deposit + buyingPower (legacy schema).
      db.prepare(`
        UPDATE users
           SET deposit = COALESCE(deposit, 0) + ?,
               buyingPower = COALESCE(buyingPower, 0) + ?
         WHERE id = ?
      `).run(amount, amount * 10, userId);

      // Wallet ledger entry.
      try {
        const txId = `wt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        db.prepare(`
          INSERT INTO wallet_transactions (id, userId, type, amount, balanceAfter, description, timestamp)
          VALUES (?, ?, 'credit', ?, (SELECT balance FROM buyer_wallets WHERE userId = ?), ?, ?)
        `).run(txId, userId, amount, userId, note, now);
      } catch {}
    })();
  }

  // ── GET /api/admin/payment-verifications/queue ─────────────────────────
  // Defensive: production DBs sometimes have rows missing the new
  // verification_status column even after the ALTER TABLE migration ran,
  // so we fall back to a base query and filter in JS if the strict query
  // returns empty. Errors are now logged so operators can spot them.
  app.get('/api/admin/payment-verifications/queue', requireAdmin, (_req: any, res: any) => {
    try {
      let rows: any[] = [];
      try {
        rows = db.prepare(`
          SELECT pr.*,
                 u.firstName, u.lastName, u.email, u.phone, u.country,
                 u.kycStatus, u.deposit as currentDeposit
            FROM payment_requests pr
            LEFT JOIN users u ON pr.userId = u.id
           WHERE pr.type = 'topup'
             AND COALESCE(pr.verification_status, 'pending') = 'pending'
             AND COALESCE(pr.status, 'pending') = 'pending'
           ORDER BY pr.requestedAt ASC
        `).all();
      } catch (e: any) {
        console.error('[payment-verify queue] strict query failed:', e?.message);
      }
      // Fallback: use the simpler shape that powers /api/admin/payment-requests.
      if (rows.length === 0) {
        try {
          const all: any[] = db.prepare(`
            SELECT pr.*,
                   u.firstName, u.lastName, u.email, u.phone, u.country,
                   u.kycStatus, u.deposit as currentDeposit
              FROM payment_requests pr
              LEFT JOIN users u ON pr.userId = u.id
             ORDER BY pr.requestedAt DESC
          `).all();
          rows = all.filter((r: any) => {
            const status = String(r.status || 'pending').toLowerCase();
            const vs = String(r.verification_status || 'pending').toLowerCase();
            const type = String(r.type || '').toLowerCase();
            return type === 'topup' && status === 'pending' && vs === 'pending';
          });
        } catch (e: any) {
          console.error('[payment-verify queue] fallback failed:', e?.message);
        }
      }
      res.json({ count: rows.length, requests: rows });
    } catch (e: any) {
      console.error('[payment-verify queue] handler crashed:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/payment-verifications/:id/verify-and-credit ────────
  // This is the ONLY safe path to credit a user's wallet for offline
  // payments. Records the actual received amount + proof, then credits.
  app.post('/api/admin/payment-verifications/:id/verify-and-credit', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    const { receivedAmount, bankReceiptUrl, verificationNote, referenceFromBank } = req.body || {};

    try {
      const pr: any = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
      if (!pr) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (pr.type !== 'topup') return res.status(400).json({ error: 'هذا الطلب ليس طلب شحن محفظة' });
      if (pr.status === 'approved') return res.status(400).json({ error: 'الطلب مُعتمد بالفعل' });
      if (pr.status === 'rejected') return res.status(400).json({ error: 'الطلب مرفوض' });

      const amount = Number(receivedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'المبلغ المستلم غير صحيح' });
      }

      const now = new Date().toISOString();
      const adminId = req.user?.id || 'unknown';

      // Update request: mark verified + approved + record proof.
      db.prepare(`
        UPDATE payment_requests
           SET verification_status = 'verified',
               status = 'approved',
               receivedAmount = ?,
               bankReceiptUrl = ?,
               verificationNote = ?,
               referenceFromBank = ?,
               verifiedBy = ?,
               verifiedAt = ?,
               processedAt = ?
         WHERE id = ?
      `).run(amount, bankReceiptUrl || null, verificationNote || null,
             referenceFromBank || null, adminId, now, now, id);

      // Credit the wallet using the verified amount.
      const note = `شحن محفظة (تحقق إداري) — ${pr.method || 'تحويل'} — مرجع: ${referenceFromBank || pr.referenceNo || id}`;
      creditWallet(pr.userId, amount, id, note);

      // Notify user.
      try {
        sendNotification(
          pr.userId,
          '✅ تم تأكيد شحن محفظتك',
          `تم استلام مبلغ ${amount.toLocaleString('en-US')} وإضافته لمحفظتك. شكراً لاختيارك أوتوبرو.`,
          'success'
        );
        sendInternalMessage('admin-1', pr.userId,
          '✅ تم تأكيد شحن المحفظة',
          `تم استلام مبلغ ${amount.toLocaleString('en-US')} والمحفظة جاهزة الآن للمزايدة.`
        );
      } catch {}

      res.json({ success: true, creditedAmount: amount });
    } catch (e: any) {
      console.error('[payment-verify] verify-and-credit failed:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/payment-verifications/:id/reject ───────────────────
  app.post('/api/admin/payment-verifications/:id/reject', requireAdmin, (req: any, res: any) => {
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: 'سبب الرفض مطلوب' });
    }

    try {
      const pr: any = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
      if (!pr) return res.status(404).json({ error: 'الطلب غير موجود' });
      if (pr.status === 'approved') return res.status(400).json({ error: 'الطلب مُعتمد بالفعل، لا يمكن رفضه' });

      const now = new Date().toISOString();
      const adminId = req.user?.id || 'unknown';

      db.prepare(`
        UPDATE payment_requests
           SET verification_status = 'rejected',
               status = 'rejected',
               verificationNote = ?,
               verifiedBy = ?,
               verifiedAt = ?,
               processedAt = ?
         WHERE id = ?
      `).run(String(reason).trim(), adminId, now, now, id);

      try {
        sendNotification(
          pr.userId,
          '❌ تم رفض طلب شحن المحفظة',
          `السبب: ${reason}. للاستفسار راسل الإدارة.`,
          'error'
        );
        sendInternalMessage('admin-1', pr.userId,
          '❌ تم رفض طلب الشحن',
          `تم رفض طلب شحن محفظتك بقيمة ${Number(pr.amount).toLocaleString('en-US')}.\n\nالسبب: ${reason}\n\nللاعتراض راسلنا.`
        );
      } catch {}

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/payment-verifications/:id/contact-user ─────────────
  //
  // Sends the message on every available channel so the user actually
  // sees it instead of relying on the in-app notification alone:
  //   • In-app notification + internal message (always)
  //   • Email (whenever the user has one — uses sendEmail which prefers
  //     Resend then falls back to SMTP)
  //   • Returns the user's phone so the admin UI can build a wa.me link
  //     and continue the conversation on WhatsApp.
  //
  // The response includes per-channel delivery flags so the admin can
  // see exactly what was sent.
  app.post('/api/admin/payment-verifications/:id/contact-user', requireAdmin, async (req: any, res: any) => {
    const { id } = req.params;
    const { template, message, customSubject } = req.body || {};

    try {
      const pr: any = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
      if (!pr) return res.status(404).json({ error: 'الطلب غير موجود' });

      let subject = customSubject;
      let body = message;

      if (template && TEMPLATES[template]) {
        subject = subject || TEMPLATES[template].subject;
        body = body || TEMPLATES[template].body;
      }

      if (!subject || !body) {
        return res.status(400).json({ error: 'يجب إرسال template أو message' });
      }

      // Pull the user once so we have email + phone for both email send
      // and the wa.me link the admin UI builds.
      const user: any = db.prepare(
        'SELECT id, firstName, lastName, email, phone FROM users WHERE id = ?'
      ).get(pr.userId);

      const delivery: { inApp: boolean; email: boolean; emailError?: string; emailTo?: string; phone?: string } = {
        inApp: false,
        email: false,
      };

      // (1) In-app channels (notification + internal message)
      try {
        sendNotification(pr.userId, subject, String(body).slice(0, 200), 'info');
        sendInternalMessage('admin-1', pr.userId, subject, body);
        delivery.inApp = true;
      } catch (e: any) {
        console.error('[contact-user] in-app send failed:', e?.message);
      }

      // (2) Email channel — wrap the plain text body in a simple branded HTML.
      if (user?.email && typeof sendEmail === 'function') {
        const greeting = user.firstName ? `مرحباً ${user.firstName}،` : 'مرحباً،';
        const html = `
          <div dir="rtl" style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;color:#0f172a;line-height:1.7;">
            <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
              <div style="background:#f97316;padding:24px;text-align:center;">
                <h2 style="color:#fff;margin:0;font-size:20px;">AutoPro Libya · أوتوبرو ليبيا</h2>
              </div>
              <div style="padding:24px;">
                <p style="margin:0 0 14px;font-weight:700;">${greeting}</p>
                <h3 style="margin:0 0 12px;color:#0f172a;">${subject}</h3>
                <p style="margin:0 0 16px;white-space:pre-wrap;">${String(body).replace(/</g, '&lt;')}</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
                <p style="margin:0;font-size:12px;color:#64748b;">
                  هذا البريد مرسل من فريق AutoPro Libya بخصوص طلب شحن المحفظة.
                  للرد المباشر، يمكنك الرد على هذا البريد أو التواصل عبر واتساب.
                </p>
              </div>
            </div>
          </div>
        `;
        try {
          await sendEmail({ to: user.email, subject, html });
          delivery.email = true;
          delivery.emailTo = user.email;
        } catch (e: any) {
          delivery.emailError = e?.message || String(e);
          console.error(`[contact-user] email to ${user.email} failed:`, e?.message);
        }
      }

      if (user?.phone) {
        delivery.phone = String(user.phone);
      }

      res.json({ success: true, delivery, plainMessage: body, subject });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── GET /api/admin/payment-verifications/templates ─────────────────────
  app.get('/api/admin/payment-verifications/templates', requireAdmin, (_req: any, res: any) => {
    res.json({ templates: TEMPLATES });
  });

  // ── GET /api/admin/payment-verifications/stats ─────────────────────────
  app.get('/api/admin/payment-verifications/stats', requireAdmin, (_req: any, res: any) => {
    try {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const pending = (db.prepare(`
        SELECT COUNT(*) as c, COALESCE(SUM(amount), 0) as total
          FROM payment_requests
         WHERE type = 'topup' AND COALESCE(verification_status, 'pending') = 'pending'
           AND COALESCE(status, 'pending') = 'pending'
      `).get() as any);

      const overdue24h = (db.prepare(`
        SELECT COUNT(*) as c
          FROM payment_requests
         WHERE type = 'topup' AND COALESCE(verification_status, 'pending') = 'pending'
           AND COALESCE(status, 'pending') = 'pending'
           AND requestedAt < ?
      `).get(dayAgo) as any).c;

      const verifiedThisWeek = (db.prepare(`
        SELECT COUNT(*) as c, COALESCE(SUM(receivedAmount), 0) as total
          FROM payment_requests
         WHERE verification_status = 'verified' AND verifiedAt > ?
      `).get(weekAgo) as any);

      const rejectedThisWeek = (db.prepare(`
        SELECT COUNT(*) as c
          FROM payment_requests
         WHERE verification_status = 'rejected' AND verifiedAt > ?
      `).get(weekAgo) as any).c;

      res.json({
        pending: { count: pending.c, totalAmount: pending.total },
        overdue24h,
        verifiedThisWeek: { count: verifiedThisWeek.c, totalAmount: verifiedThisWeek.total },
        rejectedThisWeek,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  console.log('[payment-verify] verification queue + verify-and-credit + reject + contact-user ready');
}
