import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import express from 'express';
import { requireAuth, requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export function registerPaymentRoutes(ctx: AppContext) {
  const {
    app, db, sendNotification, sendInternalMessage, sendEmail,
    walletCredit, walletDebit, completeInvoicePayment,
    stripeClient, SITE_URL, JWT_SECRET,
    PLUTU_API_KEY, PLUTU_ACCESS_TOKEN, PLUTU_SECRET_KEY, PLUTU_BASE_URL, PLUTU_ENABLED,
  } = ctx;

  // ══════════════════════════════════════════════════════════════
  //  BUYER WALLET ROUTES
  // ══════════════════════════════════════════════════════════════

  // GET /api/wallet/:userId — full wallet summary
  app.get("/api/wallet/:userId", requireAuth, (req, res) => {
    try {
      const { userId } = req.params;
      const requestingUser = (req as any).user;
      if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
        return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
      }
      let wallet: any = db.prepare("SELECT * FROM buyer_wallets WHERE userId = ?").get(userId) as any;
      if (!wallet) {
        // Auto-create empty wallet
        db.prepare(`INSERT OR IGNORE INTO buyer_wallets (userId, balance, reservedAmount, totalDeposited, totalSpent, updatedAt)
          VALUES (?,0,0,0,0,?)`).run(userId, new Date().toISOString());
        wallet = db.prepare("SELECT * FROM buyer_wallets WHERE userId = ?").get(userId);
      }
      const unpaidInvoices: any[] = db.prepare("SELECT * FROM invoices WHERE userId = ? AND status IN ('unpaid','overdue') ORDER BY timestamp DESC").all(userId);
      const pendingRequests: any[] = db.prepare("SELECT * FROM payment_requests WHERE userId = ? AND status = 'pending'").all(userId);
      res.json({ ...wallet, unpaidInvoices, pendingRequests });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/wallet/:userId/transactions — transaction history
  app.get("/api/wallet/:userId/transactions", requireAuth, (req, res) => {
    try {
      const { userId } = req.params;
      const requestingUser = (req as any).user;
      if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
        return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
      }
      const txs: any[] = db.prepare("SELECT * FROM wallet_transactions WHERE userId = ? ORDER BY timestamp DESC LIMIT 100").all(userId);
      res.json(txs);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/topup — user requests a top-up (pending admin approval)
  app.post("/api/wallet/topup", requireAuth, (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { amount, method, referenceNo } = req.body;
      if (!userId || !amount || amount <= 0) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const id = `pr-topup-${Date.now()}`;
      db.prepare(`INSERT INTO payment_requests (id, userId, type, amount, method, referenceNo, status, requestedAt)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, 'topup', amount, method || 'bank_transfer', referenceNo || null, 'pending', new Date().toISOString());
      sendNotification('admin-1', '💰 طلب شحن محفظة جديد', `المستخدم ${userId} يطلب شحن محفظته بمبلغ $${Number(amount).toLocaleString()}`, 'info');
      // Notify the user that their top-up request was submitted
      sendNotification(userId, '📩 تم استلام طلب شحن المحفظة', `تم إرسال طلب شحن محفظتك بمبلغ $${Number(amount).toLocaleString()} للمراجعة. سيتم إعلامك فور الموافقة.`, 'info', 'general_notification', {}, '/dashboard/user?view=wallet');
      res.json({ success: true, requestId: id, message: "تم إرسال طلب الشحن — سيُراجَع خلال 24 ساعة" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/pay-invoice — pay an invoice from wallet balance
  app.post("/api/wallet/pay-invoice", requireAuth, (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { invoiceId } = req.body;
      const invoice: any = db.prepare("SELECT * FROM invoices WHERE id = ? AND userId = ?").get(invoiceId, userId) as any;
      if (!invoice) return res.status(404).json({ error: "الفاتورة غير موجودة" });
      if (invoice.status === 'paid') return res.status(400).json({ error: "الفاتورة مدفوعة بالفعل" });

      const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(userId) as any;
      if (!wallet || wallet.balance < invoice.amount) {
        return res.status(400).json({ error: `رصيد المحفظة غير كافٍ. الرصيد الحالي: $${(wallet?.balance || 0).toLocaleString()} — المطلوب: $${invoice.amount.toLocaleString()}` });
      }

      const newBal = walletDebit(userId, invoice.amount, `دفع فاتورة: ${invoice.type}`, invoiceId);
      db.prepare("UPDATE invoices SET status='paid', paidAt=?, paidVia='wallet' WHERE id=?").run(new Date().toISOString(), invoiceId);

      // If purchase invoice paid → activate transport invoice
      if (invoice.type === 'purchase') {
        db.prepare("UPDATE invoices SET status='unpaid' WHERE userId=? AND carId=? AND type='transport'").run(userId, invoice.carId);
        db.prepare("UPDATE shipments SET status='paid' WHERE carId=? AND userId=?").run(invoice.carId, userId);
        sendNotification(userId, '✅ تم الدفع بنجاح', `تم دفع فاتورة الشراء. فاتورة النقل الداخلي أصبحت متاحة الآن.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
      } else if (invoice.type === 'transport') {
        db.prepare("UPDATE invoices SET status='unpaid' WHERE userId=? AND carId=? AND type='shipping'").run(userId, invoice.carId);
        db.prepare("UPDATE shipments SET status='in_transit' WHERE carId=? AND userId=?").run(invoice.carId, userId);
        sendNotification(userId, '🚛 النقل الداخلي مؤكد', `تم دفع فاتورة النقل — السيارة في طريقها للميناء.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
      } else if (invoice.type === 'shipping') {
        db.prepare("UPDATE shipments SET status='at_port' WHERE carId=? AND userId=?").run(invoice.carId, userId);
        sendNotification(userId, '⚓ الشحن البحري مؤكد', `تم دفع فاتورة الشحن — السيارة قيد الشحن البحري.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
      }

      const invoiceTypeLabels: Record<string, string> = { purchase: 'شراء', transport: 'نقل', shipping: 'شحن' };
      sendInternalMessage('admin-1', userId, `✅ تم دفع فاتورة ${invoiceTypeLabels[invoice.type] || invoice.type}`,
        `تم خصم مبلغ $${invoice.amount.toLocaleString()} من محفظتك. الرصيد المتبقي: $${newBal.toLocaleString()}`);
      res.json({ success: true, newBalance: newBal });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // GET /api/admin/payment-requests — admin: list all payment requests
  app.get("/api/admin/payment-requests", requireAdmin, (_req, res) => {
    try {
      const requests: any[] = db.prepare(`
        SELECT pr.*, u.firstName, u.lastName, u.email
        FROM payment_requests pr
        JOIN users u ON pr.userId = u.id
        ORDER BY pr.requestedAt DESC
      `).all();
      const pending = (requests as any[]).filter((r: any) => r.status === 'pending').length;
      res.json({ requests, pendingCount: pending });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/admin/payment-requests/:id/approve — admin approves top-up / withdrawal
  app.post("/api/admin/payment-requests/:id/approve", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id) as any;
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });
      if (pr.status !== 'pending') return res.status(400).json({ error: "الطلب تمت معالجته مسبقاً" });

      const timestamp = new Date().toISOString();

      db.transaction(() => {
        if (pr.type === 'topup') {
          walletCredit(pr.userId, pr.amount, `شحن محفظة — مراجعة Admin`, id);
          sendNotification(pr.userId, '✅ تم شحن محفظتك', `تمت الموافقة على طلبك ✔ — تم إضافة $${Number(pr.amount).toLocaleString()} لمحفظتك. يمكنك الآن المزايدة!`, 'success', 'general_notification', {}, `/dashboard/wallet`);
        } else if (pr.type === 'withdrawal') {
          walletDebit(pr.userId, pr.amount, `سحب رصيد — مراجعة Admin`, id);
          sendNotification(pr.userId, '💸 تمت الموافقة على السحب', `تمت الموافقة على سحب $${Number(pr.amount).toLocaleString()} — سيُحوَّل خلال 2-3 أيام عمل.`, 'success', 'general_notification', {}, `/dashboard/wallet`);
        } else if (pr.type === 'invoice_payment') {
          completeInvoicePayment(pr.invoiceId, timestamp, pr.method);
          sendNotification(pr.userId, '✅ تم تأكيد الدفع', `تمت الموافقة على تأكيد دفع الفاتورة #${pr.invoiceId} بنجاح.`, 'success', 'general_notification', {}, `/dashboard/invoices`);
        }

        db.prepare("UPDATE payment_requests SET status='approved', adminNote=?, processedAt=? WHERE id=?")
          .run(adminNote || null, timestamp, id);
      })();

      // Send receipt internal message after transaction commits
      const walletAfter: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(pr.userId);
      const newBalance = walletAfter ? Number(walletAfter.balance).toLocaleString() : '—';
      if (pr.type === 'topup') {
        sendInternalMessage('admin-1', pr.userId,
          '✅ إيصال شحن محفظة — تم قبول طلبك',
          `إيصال شحن محفظة\n\nالمبلغ: $${Number(pr.amount).toLocaleString()}\nالطريقة: ${pr.method || 'تحويل بنكي'}\nالمرجع: ${pr.referenceNo || id}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\nرصيد المحفظة الجديد: $${newBalance}\n\nشكراً لثقتك في أوتو برو! 🧡`,
          'accounting'
        );
      } else if (pr.type === 'invoice_payment') {
        sendInternalMessage('admin-1', pr.userId,
          '✅ إيصال دفع فاتورة — تم تأكيد الدفع',
          `إيصال دفع فاتورة\n\nرقم الفاتورة: ${pr.invoiceId}\nالمبلغ: $${Number(pr.amount).toLocaleString()}\nالطريقة: ${pr.method || 'تحويل بنكي'}\nالمرجع: ${pr.referenceNo || id}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\n\nشكراً لثقتك في أوتو برو! 🧡`,
          'accounting'
        );
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/admin/payment-requests/:id/reject
  app.post("/api/admin/payment-requests/:id/reject", requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const { adminNote } = req.body;
      const pr: any = db.prepare("SELECT * FROM payment_requests WHERE id = ?").get(id) as any;
      if (!pr) return res.status(404).json({ error: "الطلب غير موجود" });
      if (pr.status !== 'pending') return res.status(400).json({ error: "الطلب تمت معالجته مسبقاً" });

      const timestamp = new Date().toISOString();

      db.transaction(() => {
        db.prepare("UPDATE payment_requests SET status='rejected', adminNote=?, processedAt=? WHERE id=?")
          .run(adminNote || 'تم الرفض', timestamp, id);

        if (pr.type === 'invoice_payment') {
          db.prepare("UPDATE invoices SET status='unpaid', paidVia=NULL WHERE id=?").run(pr.invoiceId);
          sendNotification(pr.userId, '❌ تم رفض تأكيد الدفع', `تم رفض إثبات الدفع للفاتورة #${pr.invoiceId}. السبب: ${adminNote || 'مراجعة البيانات'}. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.`, 'error');
        } else {
          sendNotification(pr.userId, '❌ تم رفض طلبك', `للأسف، تم رفض طلب ${pr.type === 'topup' ? 'شحن المحفظة' : 'السحب'} بمبلغ $${Number(pr.amount).toLocaleString()}. السبب: ${adminNote || 'مراجعة البيانات'}.`, 'error');
        }
      })();

      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/admin/wallet-stats — admin: financial overview
  app.get("/api/admin/wallet-stats", requireAdmin, (_req, res) => {
    try {
      const totalDeposited = (db.prepare("SELECT SUM(totalDeposited) as v FROM buyer_wallets").get() as any)?.v || 0;
      const totalBalance = (db.prepare("SELECT SUM(balance) as v FROM buyer_wallets").get() as any)?.v || 0;
      const totalSpent = (db.prepare("SELECT SUM(totalSpent) as v FROM buyer_wallets").get() as any)?.v || 0;
      const pendingTopups = (db.prepare("SELECT COUNT(*) as c FROM payment_requests WHERE status='pending' AND type='topup'").get() as any)?.c || 0;
      const pendingInvoices = (db.prepare("SELECT SUM(amount) as v FROM invoices WHERE status='unpaid'").get() as any)?.v || 0;
      res.json({ totalDeposited, totalBalance, totalSpent, pendingTopups, pendingInvoices });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // POST /api/wallet/withdrawal — user requests withdrawal
  app.post("/api/wallet/withdrawal", requireAuth, (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { amount, iban, bankName } = req.body;
      if (!userId || !amount || amount <= 0) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId=?").get(userId) as any;
      if (!wallet || wallet.balance < amount) return res.status(400).json({ error: "رصيد غير كافٍ" });
      const id = `pr-wd-${Date.now()}`;
      db.prepare(`INSERT INTO payment_requests (id, userId, type, amount, method, referenceNo, status, requestedAt)
        VALUES (?,?,?,?,?,?,?,?)`).run(id, userId, 'withdrawal', amount, 'bank_transfer', (iban || '') + '|' + (bankName || ''), 'pending', new Date().toISOString());
      sendNotification('admin-1', '💸 طلب سحب رصيد', `المستخدم ${userId} يطلب سحب $${Number(amount).toLocaleString()} — IBAN: ${iban || 'غير محدد'}`, 'warning');
      res.json({ success: true, message: "تم إرسال طلب السحب — سيُحوَّل خلال 2-3 أيام عمل بعد المراجعة" });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════
  //  STRIPE PAYMENT ROUTES
  // ══════════════════════════════════════════════════════════════

  // GET /api/payments/stripe-status — check if Stripe card payments are enabled
  app.get("/api/payments/stripe-status", async (_req, res) => {
    try {
      if (!stripeClient) return res.json({ available: false, reason: 'no_key' });
      const account = await stripeClient.accounts.retrieve();
      const available = account.charges_enabled === true;
      res.json({ available, chargesEnabled: account.charges_enabled, detailsSubmitted: account.details_submitted });
    } catch (err: any) {
      res.json({ available: false, reason: err.message });
    }
  });

  // POST /api/payments/create-intent — create Stripe PaymentIntent for deposit
  app.post("/api/payments/create-intent", requireAuth, async (req, res) => {
    try {
      const { amount, currency, type } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ error: "مبلغ غير صالح" });
      if (currency === 'USD' && amount < 500) return res.status(400).json({ error: "الحد الأدنى للعربون خارج ليبيا هو $500" });
      if (currency === 'LYD' && amount < 1000) return res.status(400).json({ error: "الحد الأدنى للعربون داخل ليبيا هو 1,000 دينار ليبي" });

      if (!stripeClient) {
        return res.json({ clientSecret: 'demo_secret_' + Date.now(), demo: true });
      }
      const amountInCents = currency === 'USD'
        ? Math.round(amount * 100)
        : Math.round((amount / 7.0) * 100);
      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: amountInCents,
        currency: 'usd',
        metadata: { originalAmount: String(amount), originalCurrency: currency, type: type || 'deposit' },
        description: `AutoPro Libya — عربون — ${amount} ${currency}`,
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (err: any) {
      console.error('[STRIPE CREATE INTENT]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/payments/confirm-deposit — credit user wallet after Stripe payment
  app.post("/api/payments/confirm-deposit", async (req, res) => {
    try {
      const { paymentIntentId, amount, currency, demo } = req.body;
      if (!paymentIntentId || !amount) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const authHeader = req.headers['authorization'];
      const token = authHeader?.split(' ')[1];
      if (!token) return res.status(401).json({ error: "غير مخوَّل" });
      let userId: string;
      try {
        const decoded: any = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
      } catch {
        return res.status(401).json({ error: "جلسة منتهية" });
      }
      // SECURITY: Block demo bypass in production
      if (demo && process.env.NODE_ENV === 'production') {
        return res.status(400).json({ error: 'Demo not allowed in production' });
      }
      if (!demo && stripeClient) {
        const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== 'succeeded') return res.status(400).json({ error: "لم يكتمل الدفع بعد" });
      }
      const user: any = db.prepare("SELECT deposit, buyingPower FROM users WHERE id = ?").get(userId);
      if (!user) return res.status(404).json({ error: "المستخدم غير موجود" });
      const newDeposit = (user.deposit || 0) + Number(amount);
      const newBuyingPower = newDeposit * 10;
      db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newDeposit, newBuyingPower, userId);
      // Update buyer_wallets
      try {
        db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
          .run(Number(amount), Number(amount), new Date().toISOString(), userId);
      } catch (_) {}
      try {
        const txId = `tx-stripe-${Date.now()}`;
        db.prepare(`INSERT INTO transactions (id, userId, amount, type, status, createdAt) VALUES (?,?,?,?,?,?)`)
          .run(txId, userId, amount, 'deposit', 'completed', new Date().toISOString());
      } catch (_) {}
      setImmediate(() => {
        sendNotification(userId, '✅ تم إيداع العربون بنجاح',
          `تم إضافة ${amount} ${currency === 'LYD' ? 'د.ل' : '$'} إلى محفظتك. قوتك الشرائية: ${newBuyingPower.toLocaleString()} ${currency === 'LYD' ? 'د.ل' : '$'}.`,
          'success', '/dashboard/user');
        const userRow: any = db.prepare("SELECT email, firstName FROM users WHERE id = ?").get(userId);
        if (userRow?.email) {
          sendEmail({
            to: userRow.email,
            subject: '✅ تأكيد إيداع العربون — AutoPro Libya',
            html: `<div dir="rtl" style="font-family:Cairo,Arial,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#e2e8f0;border-radius:16px;overflow:hidden;">
              <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:32px;text-align:center;">
                <h1 style="color:white;margin:0;font-size:24px;">✅ تم إيداع العربون بنجاح</h1>
              </div>
              <div style="padding:32px;">
                <p>مرحباً <strong style="color:#fff">${userRow.firstName}</strong>،</p>
                <p>تم إيداع عربونك بنجاح وتفعيل حسابك في مزادات AutoPro Libya.</p>
                <div style="background:#0f172a;border-radius:12px;padding:20px;margin:20px 0;">
                  <p><span style="color:#94a3b8;">المبلغ المودَع: </span><strong style="color:#f97316;font-size:20px;">${amount} ${currency === 'LYD' ? 'دينار ليبي' : 'دولار'}</strong></p>
                  <p><span style="color:#94a3b8;">القوة الشرائية: </span><strong style="color:#22c55e;">${newBuyingPower.toLocaleString()} ${currency === 'LYD' ? 'د.ل' : '$'}</strong></p>
                  <p><span style="color:#94a3b8;">رقم المعاملة: </span><code style="color:#94a3b8;font-size:12px;">${paymentIntentId}</code></p>
                </div>
                <p>يمكنك الآن المزايدة على أي سيارة في المنصة!</p>
                <div style="text-align:center;margin-top:24px;">
                  <a href="${SITE_URL}/marketplace" style="background:linear-gradient(135deg,#f97316,#ea580c);color:white;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;">🏎️ تصفح المزادات</a>
                </div>
              </div>
            </div>`,
          });
        }
      });
      res.json({ success: true, newDeposit, newBuyingPower });
    } catch (err: any) {
      console.error('[STRIPE CONFIRM DEPOSIT]', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/payments/stripe-webhook — handle Stripe events
  app.post("/api/payments/stripe-webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeClient || !webhookSecret) {
      return res.status(400).json({ error: 'Stripe not configured' });
    }

    let event: any;
    try {
      event = (stripeClient as any).webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Stripe webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const userId = pi.metadata?.userId;
      const amount = Math.round(pi.amount_received / 100); // Stripe uses cents

      if (userId) {
        try {
          const txId = `stripe-${pi.id}`;
          const existing = db.prepare("SELECT id FROM transactions WHERE id = ?").get(txId);
          if (!existing) {
            db.transaction(() => {
              db.prepare(`INSERT INTO transactions(id, userId, amount, type, status, method, referenceNo, timestamp)
                VALUES(?,?,?,'deposit','completed','stripe',?,?)`
              ).run(txId, userId, amount, pi.id, new Date().toISOString());

              db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = (deposit + ?) * 10 WHERE id = ?")
                .run(amount, amount, userId);

              // Update buyer_wallets
              try {
                db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
                  .run(Number(amount), Number(amount), new Date().toISOString(), userId);
              } catch (_) {}
            })();

            sendNotification(userId, '✅ تم استلام العربون عبر Stripe',
              `تم إضافة $${amount.toLocaleString()} كعربون مزايدة. القوة الشرائية محدّثة!`, 'success', '/deposit');
            sendInternalMessage('admin-1', userId, '✅ إيداع Stripe مؤكد',
              `تم استلام دفعة Stripe بمبلغ $${amount.toLocaleString()} للمستخدم ${userId}. تمت إضافة القوة الشرائية تلقائياً.`);
          }
        } catch (err) {
          console.error('Failed to process Stripe webhook payment:', err);
        }
      }
    }

    res.json({ received: true });
  });

  // ══════════════════════════════════════════════════════════════
  //  BANK TRANSFER DEPOSIT
  // ══════════════════════════════════════════════════════════════

  app.post("/api/deposit", requireAuth, (req, res) => {
    const { amount, method = 'bank_transfer', referenceNo, currency = 'USD', notes } = req.body;
    const userId = (req as any).user.id; // Use authenticated user
    const now = new Date().toISOString();
    const txId = `tx-dep-${Date.now()}`;

    try {
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ error: "بيانات غير مكتملة" });
      }

      // Get user info for notification
      const userRow: any = db.prepare("SELECT firstName, lastName, email from users WHERE id = ?").get(userId);
      const userName = userRow ? `${userRow.firstName} ${userRow.lastName}` : `ID: ${userId}`;

      // Record transaction as PENDING (no balance update until admin approves)
      db.prepare(`
        INSERT INTO transactions(id, userId, amount, type, status, timestamp, method, referenceNo, currency, notes)
        VALUES(?,?,?,'deposit','pending',?,?,?,?,?)
      `).run(txId, userId, Number(amount), now, method, referenceNo || null, currency, notes || null);

      // Notify admin about new deposit request
      const methodLabel = method === 'wise' ? 'Wise (تحويل دولي)' :
                          method === 'bank_lyd' ? 'تحويل بنكي ليبي (دينار)' :
                          method === 'sadad' ? 'سداد (مدار)' :
                          method === 'tadawul' ? 'تداول (نوماك)' : 'تحويل بنكي';
      sendNotification('admin-1',
        '🆕 طلب عربون جديد',
        `${userName} يطلب إيداع ${currency === 'LYD' ? amount.toLocaleString() + ' د.ل' : '$' + Number(amount).toLocaleString()} عبر ${methodLabel}${referenceNo ? '. المرجع: ' + referenceNo : ''}`,
        'info'
      );
      sendInternalMessage(userId, 'admin-1',
        '🆕 طلب إيداع عربون جديد',
        `قام العميل ${userName} (${userRow?.email || userId}) بطلب إيداع مبلغ ${currency === 'LYD' ? amount.toLocaleString() + ' د.ل' : '$' + Number(amount).toLocaleString()} عبر ${methodLabel}.\n${referenceNo ? 'رقم المرجع: ' + referenceNo + '\n' : ''}يرجى مراجعة التحويل وتأكيده في لوحة تحكم الإدارة.`
      );

      // Notify the user that their deposit request was received
      sendNotification(userId, '📩 تم استلام طلب إيداعك', `تم استلام طلب إيداعك بمبلغ ${currency === 'LYD' ? amount.toLocaleString() + ' د.ل' : '$' + Number(amount).toLocaleString()}. سيتم مراجعته خلال 24 ساعة.`, 'info', 'general_notification', {}, '/dashboard/user?view=wallet');

      res.json({ success: true, message: "تم إرسال طلب الإيداع بنجاح. سيتم تحديث رصيدك بعد مراجعة الإدارة.", txId });
    } catch (err) {
      console.error('[DEPOSIT]', err);
      res.status(500).json({ error: "فشل إرسال طلب الإيداع" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  ADMIN: DEPOSIT APPROVAL / REJECTION
  // ══════════════════════════════════════════════════════════════

  app.post("/api/admin/approve-deposit/:txId", requireAdmin, (req, res) => {
    const { txId } = req.params;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'").get(txId);
      if (!tx) return res.status(404).json({ error: "المعاملة غير موجودة أو تم معالجتها مسبقاً" });

      const amtLabel = tx.currency === 'LYD'
        ? `${Number(tx.amount).toLocaleString()} دينار ليبي`
        : `$${Number(tx.amount).toLocaleString()}`;

      db.transaction(() => {
        // 1. Confirm transaction
        db.prepare("UPDATE transactions SET status = 'completed' WHERE id = ?").run(txId);

        // 2. Update user deposit and buying power (deposit × 10)
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = (deposit + ?) * 10 WHERE id = ?")
          .run(tx.amount, tx.amount, tx.userId);

        // 3. Update buyer_wallets
        try {
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(Number(tx.amount), Number(tx.amount), new Date().toISOString(), tx.userId);
        } catch (_) {}
      })();

      // 3. Fetch updated balances for receipt
      const updatedUser: any = db.prepare("SELECT deposit, buyingPower FROM users WHERE id = ?").get(tx.userId);
      const newDeposit = updatedUser ? Number(updatedUser.deposit).toLocaleString() : '—';
      const newBuyingPower = updatedUser ? Number(updatedUser.buyingPower).toLocaleString() : '—';
      const currSymbol = tx.currency === 'LYD' ? 'د.ل' : '$';

      // 4. Notify user (outside transaction so DB is already committed)
      sendNotification(tx.userId,
        '🎉 تمت الموافقة على إيداعك!',
        `تمت الموافقة على إيداعك بمبلغ ${amtLabel}! رصيدك الجديد: ${newDeposit} ${currSymbol}. قوتك الشرائية: ${newBuyingPower} ${currSymbol}`,
        'success', 'general_notification', {}, '/dashboard/user?view=wallet'
      );
      sendInternalMessage('admin-1', tx.userId,
        '✅ إيصال إيداع — تم قبول طلبك',
        `إيصال إيداع\n\nالمبلغ: ${amtLabel}\nالطريقة: ${tx.method || 'تحويل بنكي'}\nالمرجع: ${tx.referenceNo || txId}\nالتاريخ: ${new Date().toLocaleString('ar-LY')}\nالرصيد الجديد: ${newDeposit} ${currSymbol}\nالقوة الشرائية: ${newBuyingPower} ${currSymbol}\n\nشكراً لثقتك في أوتو برو! 🧡`,
        'accounting'
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تأكيد الإيداع" });
    }
  });

  // POST /api/admin/reject-deposit/:txId — Admin rejects a bank transfer deposit
  app.post("/api/admin/reject-deposit/:txId", requireAdmin, (req, res) => {
    const { txId } = req.params;
    const { reason } = req.body;
    try {
      const tx: any = db.prepare("SELECT * FROM transactions WHERE id = ? AND status = 'pending'").get(txId);
      if (!tx) return res.status(404).json({ error: "المعاملة غير موجودة أو تم معالجتها مسبقاً" });

      db.prepare("UPDATE transactions SET status = 'rejected', adminNote = ? WHERE id = ?")
        .run(reason || 'رُفض من قِبل الإدارة', txId);

      sendNotification(tx.userId,
        '❌ تم رفض طلب العربون',
        `للأسف تم رفض طلب إيداع العربون بمبلغ $${Number(tx.amount).toLocaleString()}. السبب: ${reason || 'يرجى التواصل مع الإدارة'}.`,
        'alert', '/deposit'
      );
      sendInternalMessage('admin-1', tx.userId,
        '❌ تم رفض طلب إيداع العربون',
        `عزيزي العميل، تم رفض طلب إيداع مبلغ $${Number(tx.amount).toLocaleString()}.\nالسبب: ${reason || 'يرجى التواصل مع الإدارة'}\nيمكنك المحاولة مرة أخرى عبر صفحة الإيداع.`
      );

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل رفض الإيداع" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  TRANSACTION ROUTES
  // ══════════════════════════════════════════════════════════════

  app.get("/api/transactions/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    const transactions: any[] = db.prepare("SELECT * FROM transactions WHERE userId = ? ORDER BY timestamp DESC").all(userId);
    res.json(transactions);
  });

  app.get("/api/transactions", requireAdmin, (req, res) => {
    const { status, type } = req.query;
    let query = "SELECT t.*, u.firstName, u.lastName FROM transactions t JOIN users u ON t.userId = u.id";
    const params: any[] = [];

    if (status || type) {
      query += " WHERE";
      if (status) {
        query += " t.status = ?";
        params.push(status);
      }
      if (type) {
        if (status) query += " AND";
        query += " t.type = ?";
        params.push(type);
      }
    }

    query += " ORDER BY t.timestamp DESC";

    try {
      const transactions: any[] = db.prepare(query).all(...params);
      res.json(transactions);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.post("/api/transactions", requireAdmin, (req, res) => {
    const { userId, amount, type, status } = req.body;
    const id = Date.now().toString();
    try {
      db.prepare("INSERT INTO transactions (id, userId, amount, type, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, userId, amount, type, status || 'completed', new Date().toISOString()
      );
      // Update user buying power if it's a deposit
      if (type === 'deposit') {
        db.prepare("UPDATE users SET deposit = deposit + ?, buyingPower = buyingPower + ? WHERE id = ?").run(amount, amount * 10, userId);
      }
      res.json({ id, userId, amount, type });
    } catch (e) {
      res.status(400).json({ error: "Transaction failed" });
    }
  });

  // ══════════════════════════════════════════════════════════════
  //  PLUTU PAYMENT GATEWAY (Libya) — https://docs.plutu.ly
  // ══════════════════════════════════════════════════════════════

  // Check Plutu status
  app.get("/api/payments/plutu-status", (_req, res) => {
    res.json({ enabled: PLUTU_ENABLED, methods: ['sadad', 'localbank', 'adfali', 'tlync'] });
  });

  // Sadad — Step 1: Send OTP verification to user's phone
  app.post("/api/payments/plutu/sadad/verify", requireAuth, async (req, res) => {
    try {
      const { mobile_number, birth_year, amount } = req.body;
      const userId = (req as any).user?.id;
      if (!mobile_number || !birth_year || !amount || amount <= 0) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة: رقم الهاتف، سنة الميلاد، المبلغ" });
      }

      const response = await fetch(`${PLUTU_BASE_URL}/transaction/sadadapi/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PLUTU_ACCESS_TOKEN}`,
          'X-API-KEY': PLUTU_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mobile_number,
          birth_year,
          amount: Number(amount)
        })
      });

      const data = await response.json();

      if (data.result?.process_id) {
        console.log(`[PLUTU SADAD] OTP sent for user ${userId}, process_id: ${data.result.process_id}`);
        res.json({ success: true, process_id: data.result.process_id });
      } else {
        console.error('[PLUTU SADAD VERIFY ERROR]', data);
        res.status(400).json({ error: data.message || 'فشل إرسال رمز التحقق', details: data.error });
      }
    } catch (e: any) {
      console.error('[PLUTU SADAD VERIFY ERROR]', e.message);
      res.status(500).json({ error: 'خطأ في الاتصال ببوابة الدفع' });
    }
  });

  // Sadad — Step 2: Confirm payment with OTP code
  app.post("/api/payments/plutu/sadad/confirm", requireAuth, async (req, res) => {
    try {
      const { process_id, code, amount, invoiceId, type } = req.body;
      const userId = (req as any).user?.id;
      if (!process_id || !code || !amount) {
        return res.status(400).json({ error: "جميع الحقول مطلوبة: process_id، رمز التحقق، المبلغ" });
      }

      const response = await fetch(`${PLUTU_BASE_URL}/transaction/sadadapi/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PLUTU_ACCESS_TOKEN}`,
          'X-API-KEY': PLUTU_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          process_id,
          code,
          amount: Number(amount)
        })
      });

      const data = await response.json();

      if (data.result?.transaction_id || data.status === 'success') {
        const txId = `plutu-sadad-${Date.now()}`;
        db.prepare("INSERT INTO transactions (id, userId, amount, type, status, method, referenceNo, currency, timestamp) VALUES (?, ?, ?, ?, 'completed', 'plutu_sadad', ?, 'LYD', ?)")
          .run(txId, userId, Number(amount), type || 'deposit', data.result?.transaction_id || process_id, new Date().toISOString());

        if (type === 'invoice_payment' && invoiceId) {
          // Invoice payment — mark paid
          db.prepare("UPDATE invoices SET status = 'paid', paidAt = ?, paidVia = 'plutu_sadad' WHERE id = ?")
            .run(new Date().toISOString(), invoiceId);
          sendNotification(userId, `تم دفع الفاتورة ${invoiceId} عبر سداد بنجاح`, 'payment', '/dashboard/user?view=invoices');
          try { completeInvoicePayment(invoiceId, new Date().toISOString(), 'plutu'); } catch (_) { }
        } else {
          // Deposit — credit wallet
          const userRow: any = db.prepare("SELECT deposit FROM users WHERE id = ?").get(userId);
          const newDeposit = (userRow?.deposit || 0) + Number(amount);
          db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newDeposit, newDeposit * 10, userId);
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(Number(amount), Number(amount), new Date().toISOString(), userId);

          sendNotification(userId, `تم إيداع ${amount} د.ل في محفظتك عبر سداد بنجاح`, 'payment', '/dashboard/user?view=wallet');
          sendInternalMessage('admin-1', userId, 'إيداع ناجح عبر سداد (Plutu)', `تم إيداع ${amount} د.ل في حسابك. مرجع: ${data.result?.transaction_id || process_id}`, 'accounting');
        }

        console.log(`[PLUTU SADAD] Payment confirmed: ${amount} LYD by ${userId} — txn: ${data.result?.transaction_id}`);
        res.json({ success: true, transaction_id: data.result?.transaction_id });
      } else {
        console.error('[PLUTU SADAD CONFIRM ERROR]', data);
        res.status(400).json({ error: data.message || 'فشل تأكيد الدفع — تحقق من رمز OTP', details: data.error });
      }
    } catch (e: any) {
      console.error('[PLUTU SADAD CONFIRM ERROR]', e.message);
      res.status(500).json({ error: 'خطأ في الاتصال ببوابة الدفع' });
    }
  });

  // Local Bank Cards — Create payment and get redirect URL
  app.post("/api/payments/plutu/localbank/create", requireAuth, async (req, res) => {
    try {
      const { amount, invoiceId, type } = req.body;
      const userId = (req as any).user?.id;
      if (!amount || amount <= 0) return res.status(400).json({ error: "المبلغ غير صحيح" });

      const invoiceNo = `APL-${userId.slice(-6)}-${Date.now().toString(36).toUpperCase()}`;
      const returnUrl = `${SITE_URL}/api/payments/plutu/callback?userId=${userId}&type=${type || 'deposit'}&invoiceId=${invoiceId || ''}&amount=${amount}`;

      const response = await fetch(`${PLUTU_BASE_URL}/transaction/localbankcards/confirm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${PLUTU_ACCESS_TOKEN}`,
          'X-API-KEY': PLUTU_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: Number(amount),
          invoice_no: invoiceNo,
          return_url: returnUrl
        })
      });

      const data = await response.json();

      if (data.result?.redirect_url) {
        // Store pending transaction
        const txId = `plutu-bank-${Date.now()}`;
        db.prepare("INSERT INTO transactions (id, userId, amount, type, status, method, referenceNo, currency, timestamp) VALUES (?, ?, ?, ?, 'pending', 'plutu_localbank', ?, 'LYD', ?)")
          .run(txId, userId, Number(amount), type || 'deposit', invoiceNo, new Date().toISOString());

        res.json({ success: true, redirect_url: data.result.redirect_url, transactionId: txId });
      } else {
        console.error('[PLUTU LOCALBANK ERROR]', data);
        res.status(400).json({ error: data.message || 'فشل إنشاء عملية الدفع', details: data.error });
      }
    } catch (e: any) {
      console.error('[PLUTU LOCALBANK ERROR]', e.message);
      res.status(500).json({ error: 'خطأ في الاتصال ببوابة الدفع' });
    }
  });

  // Plutu callback — handle return from bank card payment
  app.get("/api/payments/plutu/callback", async (req, res) => {
    try {
      const { approved, transaction_id, userId, type, invoiceId, amount, hashed } = req.query as any;

      // SECURITY: Verify HMAC signature — reject if no secret key configured
      if (!PLUTU_SECRET_KEY) {
        console.error('[PLUTU CALLBACK] HMAC verification impossible — PLUTU_SECRET_KEY not configured');
        return res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error&reason=security_config`);
      }
      {
        const dataToHash = `${transaction_id}${amount}${approved}`;
        const expectedHash = crypto.createHmac('sha256', PLUTU_SECRET_KEY).update(dataToHash).digest('hex');
        if (hashed !== expectedHash) {
          console.error(`[PLUTU CALLBACK] HMAC verification failed — expected: ${expectedHash}, got: ${hashed}`);
          return res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error&reason=invalid_signature`);
        }
      }

      // SECURITY: Verify the pending transaction exists in DB before crediting
      const pendingTxn: any = db.prepare("SELECT id FROM transactions WHERE userId = ? AND method = 'plutu_localbank' AND status = 'pending' ORDER BY timestamp DESC LIMIT 1").get(userId);
      if (!pendingTxn) {
        console.error(`[PLUTU CALLBACK] No pending transaction found for user ${userId}`);
        return res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error&reason=no_pending_transaction`);
      }

      if (approved === 'true' || approved === '1') {
        // Update pending transaction to completed
        db.prepare("UPDATE transactions SET status = 'completed', referenceNo = ? WHERE userId = ? AND method = 'plutu_localbank' AND status = 'pending' ORDER BY timestamp DESC LIMIT 1")
          .run(transaction_id || '', userId);

        if (type === 'invoice_payment' && invoiceId) {
          // Invoice payment — mark paid
          db.prepare("UPDATE invoices SET status = 'paid', paidAt = ?, paidVia = 'plutu_localbank' WHERE id = ?")
            .run(new Date().toISOString(), invoiceId);
          sendNotification(userId, `تم دفع الفاتورة ${invoiceId} عبر البطاقة المصرفية بنجاح`, 'payment', '/dashboard/user?view=invoices');
          try { completeInvoicePayment(invoiceId, new Date().toISOString(), 'plutu'); } catch (_) { }
        } else {
          // Deposit — credit wallet
          const paidAmount = Number(amount) || 0;
          const userRow: any = db.prepare("SELECT deposit FROM users WHERE id = ?").get(userId);
          const newDeposit = (userRow?.deposit || 0) + paidAmount;
          db.prepare("UPDATE users SET deposit = ?, buyingPower = ? WHERE id = ?").run(newDeposit, newDeposit * 10, userId);
          db.prepare("UPDATE buyer_wallets SET balance = balance + ?, totalDeposited = totalDeposited + ?, updatedAt = ? WHERE userId = ?")
            .run(paidAmount, paidAmount, new Date().toISOString(), userId);

          sendNotification(userId, `تم إيداع ${paidAmount} د.ل في محفظتك عبر البطاقة المصرفية بنجاح`, 'payment', '/dashboard/user?view=wallet');
          sendInternalMessage('admin-1', userId, 'إيداع ناجح عبر البطاقة المصرفية (Plutu)', `تم إيداع ${paidAmount} د.ل في حسابك. مرجع: ${transaction_id}`, 'accounting');
        }

        console.log(`[PLUTU CALLBACK] Payment approved: ${amount} LYD by ${userId} — txn: ${transaction_id}`);
        res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=success&amount=${amount}`);
      } else {
        console.log(`[PLUTU CALLBACK] Payment not approved for user ${userId}`);
        db.prepare("UPDATE transactions SET status = 'failed' WHERE userId = ? AND method = 'plutu_localbank' AND status = 'pending' ORDER BY timestamp DESC LIMIT 1")
          .run(userId);
        res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=failed`);
      }
    } catch (e: any) {
      console.error('[PLUTU CALLBACK ERROR]', e.message);
      res.redirect(`${SITE_URL}/dashboard/user?view=wallet&payment=error`);
    }
  });
}
