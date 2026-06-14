/**
 * mypay.ly payment endpoints.
 *   POST /api/payments/mypay/checkout       — create checkout, return URL
 *   POST /api/payments/mypay/webhook        — mypay → us settlement notification
 *   GET  /api/payments/mypay/verify/:txId   — manual verification fallback
 *   GET  /api/payments/mypay/status         — public health check
 */
import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';
import {
  isConfigured as isMyPayConfigured,
  createCheckoutLink,
  verifyPayment,
  verifyWebhookSignature,
} from '../lib/mypayBank.ts';
import { activateReferralBonus, LYD_TO_USD } from '../lib/referrals.ts';
import * as agentcollab from '../lib/agentcollab.ts';

export function registerMyPayRoutes(ctx: AppContext) {
  const { app, db, sendNotification } = ctx as any;

  app.get('/api/payments/mypay/status', (_req: any, res: any) => {
    res.json({
      configured: isMyPayConfigured(),
      hasWebhookSecret: !!process.env.MYPAY_WEBHOOK_SECRET,
    });
  });

  app.post('/api/payments/mypay/checkout', requireAuth, async (req: any, res: any) => {
    const { userId, amountLYD } = req.body || {};
    const requester = req.user;
    if (!userId || requester.id !== userId) {
      return res.status(403).json({ error: 'غير مصرح' });
    }
    const amt = Number(amountLYD);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'مبلغ غير صحيح' });
    }
    if (!isMyPayConfigured()) {
      return res.status(503).json({ error: 'بوابة الدفع غير مُفعّلة على السيرفر' });
    }

    try {
      const user: any = db.prepare('SELECT id, email, phone FROM users WHERE id = ?').get(userId);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

      const txId = `tx-mypay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO transactions (id, userId, amount, type, status, timestamp, method)
        VALUES (?, ?, ?, 'deposit', 'pending', ?, 'mypay_card')
      `).run(txId, userId, amt, now);

      const { checkoutUrl, gatewayRef } = await createCheckoutLink({
        amount: amt,
        currency: 'LYD',
        orderId: txId,
        description: `إيداع AutoPro للمستخدم ${user.email}`,
        customerEmail: user.email,
        customerPhone: user.phone,
      });

      try {
        db.prepare('UPDATE transactions SET referenceNo = ? WHERE id = ?').run(gatewayRef, txId);
      } catch {}

      res.json({ checkoutUrl, txId, gatewayRef });
    } catch (e: any) {
      console.error('[mypay] checkout failed:', e?.message);
      res.status(500).json({ error: 'فشل إنشاء عملية الدفع: ' + (e?.message || e) });
    }
  });

  app.post('/api/payments/mypay/webhook', async (req: any, res: any) => {
    const signature = req.header('x-mypay-signature') || req.header('X-MyPay-Signature');
    const rawBody = JSON.stringify(req.body || {});
    const ok = await verifyWebhookSignature(rawBody, signature);
    if (!ok) {
      console.warn('[mypay] webhook with invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const body = req.body || {};
    // [mypay-webhook-tolerant] MyPay's payload shape isn't fully documented
    // for the static-link flow (docs.mypay.ly returns 403 to crawlers), so
    // we accept every plausible field name for reference / status / amount /
    // customer-identity and fall back to identifying the user by email or
    // phone when our pre-issued reference isn't in the payload (which is
    // what happens when the user pays via the merchant share link instead
    // of /api/payments/mypay/checkout).
    const ourTxId = body.reference || body.order_id || body.orderId || body.merchant_reference || body.metadata?.reference;
    const status = String(body.status || body.state || body.payment_status || '').toLowerCase();
    const gatewayRef = body.id || body.transaction_id || body.transactionId || body.payment_id || body.reference_id;
    const paidAmountLYD = Number(
      body.amount || body.amount_lyd || body.paid_amount || body.value || 0
    );
    const customerEmail = String(
      body.customer_email || body.email || body.customer?.email || body.payer?.email || ''
    ).trim().toLowerCase();
    const customerPhone = String(
      body.customer_phone || body.phone || body.customer?.phone || body.payer?.phone || ''
    ).replace(/[^\d+]/g, '');

    const isPaid = status === 'success' || status === 'paid' || status === 'completed' || status === 'approved';

    try {
      // ── 1. Try to find an existing transaction by our reference (API flow) ──
      let tx: any = ourTxId ? db.prepare('SELECT * FROM transactions WHERE id = ?').get(ourTxId) : null;

      // ── 2. Try by gateway reference (we stored it on checkout) ──
      if (!tx && gatewayRef) {
        tx = db.prepare('SELECT * FROM transactions WHERE referenceNo = ?').get(gatewayRef);
      }

      // ── 3. Static-link fallback: no pre-existing tx — identify the
      //      user from the payload and CREATE a transaction so the
      //      payment isn't lost. Only do this for successful payments,
      //      otherwise we'd be persisting noise.
      if (!tx && isPaid) {
        let user: any = null;
        if (customerEmail) {
          user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(customerEmail);
        }
        if (!user && customerPhone) {
          user = db.prepare("SELECT * FROM users WHERE replace(replace(phone,' ',''),'-','') = ?").get(customerPhone);
        }
        if (!user) {
          console.warn(`[mypay] webhook paid but no matching user (ref=${ourTxId}, email=${customerEmail}, phone=${customerPhone})`);
          return res.status(202).json({
            ok: false, queued: true,
            reason: 'no_matching_user',
            hint: 'admin must reconcile manually via /api/admin/mypay/reconcile',
          });
        }
        const newId = ourTxId || `tx-mypay-wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO transactions (id, userId, amount, type, status, timestamp, method, referenceNo)
          VALUES (?, ?, ?, 'deposit', 'pending', ?, 'mypay_link', ?)
        `).run(newId, user.id, paidAmountLYD || 0, now, gatewayRef || null);
        tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(newId);
        console.log(`[mypay] webhook auto-created tx ${newId} for user ${user.id} (static-link payment)`);
      }

      if (!tx) {
        // Webhook for an unknown reference AND not a paid event → log + 200
        // so MyPay doesn't keep retrying.
        console.warn(`[mypay] webhook ignored (no tx, status=${status})`);
        return res.json({ ok: true, ignored: true });
      }

      if (tx.status === 'completed') {
        return res.json({ ok: true, alreadyProcessed: true });
      }
      if (!isPaid) {
        db.prepare("UPDATE transactions SET status = 'failed' WHERE id = ?").run(tx.id);
        return res.json({ ok: true, status });
      }

      // Use the gateway-reported amount if our row has no amount yet
      // (static-link path), else trust our row.
      const amountLYD = Number(tx.amount) || paidAmountLYD;
      if (!amountLYD) {
        console.warn(`[mypay] webhook paid tx ${tx.id} has zero amount`);
      }
      const usdEquivalent = amountLYD * LYD_TO_USD;

      db.transaction(() => {
        db.prepare(`
          UPDATE transactions
             SET status = 'completed',
                 amount = CASE WHEN amount > 0 THEN amount ELSE ? END,
                 referenceNo = COALESCE(referenceNo, ?)
           WHERE id = ?
        `).run(amountLYD, gatewayRef || null, tx.id);

        db.prepare(`
          UPDATE users
             SET deposit = COALESCE(deposit, 0) + ?,
                 buyingPower = COALESCE(buyingPower, 0) + ?
           WHERE id = ?
        `).run(usdEquivalent, usdEquivalent * 10, tx.userId);
      })();

      try {
        const otherDeposits = (db.prepare(
          "SELECT COUNT(*) as c FROM transactions WHERE userId = ? AND type = 'deposit' AND status = 'completed' AND id != ?"
        ).get(tx.userId, tx.id) as any)?.c || 0;
        if (otherDeposits === 0) {
          activateReferralBonus(db, tx.userId);
        }
      } catch (e: any) {
        console.error('[mypay] referral activation failed:', e?.message);
      }

      // [agentcollab] Track payment received via mypay.ly
      agentcollab.track('payment.received', {
        amount: amountLYD,
        currency: 'LYD',
        usd_equivalent: usdEquivalent,
        method: 'mypay_card',
        gateway: 'mypay.ly',
        gateway_ref: gatewayRef || null,
      }, {
        external_user_id: tx.userId,
        dedupe_key: `payment-${tx.id}`,
      });

      try {
        sendNotification(
          tx.userId,
          '✅ تم استلام دفعة العربون',
          `تم تأكيد دفعة قدرها ${amountLYD.toLocaleString('en-US')} د.ل عبر MyPay.`,
          'success'
        );
      } catch {}

      res.json({ ok: true });
    } catch (e: any) {
      console.error('[mypay] webhook processing failed:', e?.message);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // [admin-reconcile] Manually credit a MyPay payment that didn't auto-fire
  // (rare — happens when MyPay's webhook is delayed/lost and admin sees
  // proof of payment from the user). Idempotent on dedupe via referenceNo.
  app.post('/api/admin/mypay/reconcile', async (req: any, res: any) => {
    // requireAdmin is already pulled in by other admin routes; inline check
    // so this file stays standalone-importable.
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'صلاحيات مدير مطلوبة' });
    }
    const { userId, amountLYD, gatewayRef, note } = req.body || {};
    if (!userId || !amountLYD) {
      return res.status(400).json({ error: 'userId و amountLYD مطلوبان' });
    }
    const amt = Number(amountLYD);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'مبلغ غير صحيح' });
    }

    try {
      // Dedup: same gateway reference already credited?
      if (gatewayRef) {
        const dup: any = db.prepare(
          "SELECT id FROM transactions WHERE referenceNo = ? AND status = 'completed'"
        ).get(gatewayRef);
        if (dup) return res.status(409).json({ error: 'هذا الإيصال مُسجّل مسبقاً', txId: dup.id });
      }

      const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

      const txId = `tx-mypay-recon-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const now = new Date().toISOString();
      const usdEquivalent = amt * LYD_TO_USD;

      db.transaction(() => {
        db.prepare(`
          INSERT INTO transactions (id, userId, amount, type, status, timestamp, method, referenceNo, notes)
          VALUES (?, ?, ?, 'deposit', 'completed', ?, 'mypay_reconcile', ?, ?)
        `).run(txId, userId, amt, now, gatewayRef || null, note || 'إيداع يدوي MyPay من الإدارة');

        db.prepare(`
          UPDATE users
             SET deposit = COALESCE(deposit, 0) + ?,
                 buyingPower = COALESCE(buyingPower, 0) + ?
           WHERE id = ?
        `).run(usdEquivalent, usdEquivalent * 10, userId);
      })();

      try { sendNotification(userId, '✅ تم اعتماد دفعة MyPay', `الإدارة اعتمدت إيداع ${amt.toLocaleString()} د.ل في محفظتك.`, 'success'); } catch {}

      res.json({ ok: true, txId, creditedLYD: amt });
    } catch (e: any) {
      console.error('[mypay] reconcile failed:', e?.message);
      res.status(500).json({ error: 'فشل التسجيل: ' + (e?.message || e) });
    }
  });

  app.get('/api/payments/mypay/verify/:txId', requireAuth, async (req: any, res: any) => {
    const { txId } = req.params;
    try {
      const tx: any = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
      if (!tx) return res.status(404).json({ error: 'المعاملة غير موجودة' });
      if (tx.userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح' });
      }
      if (!tx.referenceNo) {
        return res.json({ status: tx.status, message: 'لا يوجد معرّف بوابة بعد' });
      }
      const verification = await verifyPayment(tx.referenceNo);
      res.json({ status: tx.status, gateway: verification });
    } catch (e: any) {
      res.status(500).json({ error: 'فشل التحقق: ' + (e?.message || e) });
    }
  });
}
