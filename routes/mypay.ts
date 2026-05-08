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
    const txId = body.reference || body.order_id || body.orderId;
    const status = (body.status || body.state || '').toLowerCase();
    const gatewayRef = body.id || body.transaction_id;

    if (!txId) return res.status(400).json({ error: 'Missing reference' });

    try {
      const tx: any = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txId);
      if (!tx) {
        console.warn(`[mypay] webhook for unknown tx ${txId}`);
        return res.status(404).json({ error: 'Unknown transaction' });
      }
      if (tx.status === 'completed') {
        return res.json({ ok: true, alreadyProcessed: true });
      }
      if (status !== 'success' && status !== 'paid' && status !== 'completed') {
        db.prepare("UPDATE transactions SET status = 'failed' WHERE id = ?").run(txId);
        return res.json({ ok: true, status });
      }

      const amountLYD = Number(tx.amount);
      const usdEquivalent = amountLYD * LYD_TO_USD;

      db.transaction(() => {
        db.prepare(`
          UPDATE transactions
             SET status = 'completed',
                 referenceNo = COALESCE(referenceNo, ?)
           WHERE id = ?
        `).run(gatewayRef || null, txId);

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
        ).get(tx.userId, txId) as any)?.c || 0;
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
        dedupe_key: `payment-${txId}`,
      });

      try {
        sendNotification(
          tx.userId,
          '✅ تم استلام دفعة العربون',
          `تم تأكيد دفعة قدرها ${amountLYD.toLocaleString('en-US')} د.ل`,
          'success'
        );
      } catch {}

      res.json({ ok: true });
    } catch (e: any) {
      console.error('[mypay] webhook processing failed:', e?.message);
      res.status(500).json({ error: 'Internal error' });
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
