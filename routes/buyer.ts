import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function safeJsonParse(raw: any, fallback: any) {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export function registerBuyerRoutes(ctx: AppContext) {
  const { app, io, db, sendNotification, sendInternalMessage, createWinInvoices } = ctx;

  // ======= INSPECTIONS =======

  app.get("/api/inspections/:userId", requireAuth, (req, res) => {
    try {
      const { userId } = req.params;
      const inspections = db.prepare("SELECT * FROM inspections WHERE userId = ? ORDER BY requestedAt DESC").all(userId);
      res.json(inspections);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/inspections", requireAuth, (req, res) => {
    try {
      const { userId, carMake, carModel, carYear, vin, notes } = req.body;
      if (!userId || !carMake || !carModel) return res.status(400).json({ error: "Missing required fields" });
      const id = `insp-${Date.now()}`;
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO inspections (id, userId, carMake, carModel, carYear, vin, notes, status, requestedAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).run(id, userId, carMake, carModel, carYear, vin, notes, now, now);

      sendNotification('admin-1', '🛡️ طلب فحص جديد', `طلب فحص لسيارة ${carMake} ${carModel} (${carYear}) من المستخدم ${userId}`, 'info');
      res.json({ success: true, inspectionId: id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ======= USER SETTINGS =======

  app.get("/api/user/settings/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== id && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بالوصول لإعدادات مستخدم آخر" });
    }
    try {
      let settings: any = db.prepare("SELECT * FROM user_settings WHERE userId = ?").get(id);
      if (!settings) {
        db.prepare("INSERT INTO user_settings (userId, emailNotifications, whatsappNotifications) VALUES (?, 1, 1)").run(id);
        settings = { userId: id, emailNotifications: 1, whatsappNotifications: 1, smsNotifications: 0 };
      }
      res.json(settings);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب إعدادات المستخدم" });
    }
  });

  app.post("/api/user/settings/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== id && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بتعديل إعدادات مستخدم آخر" });
    }
    const { emailNotifications, whatsappNotifications } = req.body;
    try {
      db.prepare(`
        INSERT INTO user_settings (userId, emailNotifications, whatsappNotifications)
        VALUES (?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET
        emailNotifications = excluded.emailNotifications,
        whatsappNotifications = excluded.whatsappNotifications
      `).run(id, emailNotifications ? 1 : 0, whatsappNotifications ? 1 : 0);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث إعدادات الإشعارات" });
    }
  });

  // ======= USER BIDS HISTORY =======

  app.get("/api/bids/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const bids: any[] = db.prepare(`
        SELECT b.*, c.make, c.model, c.year, c.status as carStatus, c.currentBid, c.winnerId, c.images, c.lotNumber
        FROM bids b
        JOIN cars c ON b.carId = c.id
        WHERE b.userId = ?
        ORDER BY b.timestamp DESC
      `).all(userId);
      res.json(bids.map((b: any) => ({ ...b, images: JSON.parse(b.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب سجل المزايدات" });
    }
  });

  // GET /api/bids/:carId — bids for a car
  app.get("/api/bids/:carId", requireAuth, (req, res) => {
    try {
      const bids: any[] = db.prepare(`
        SELECT b.*, u.firstName, u.lastName, u.avatar
        FROM bids b JOIN users u ON b.userId = u.id
        WHERE b.carId = ? ORDER BY b.amount DESC`).all(req.params.carId);
      res.json(bids);
    } catch (e) { res.status(500).json({ error: "فشل جلب المزايدات" }); }
  });

  // ======= OFFERS =======

  app.get("/api/offers/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const offers = db.prepare("SELECT * FROM cars WHERE winnerId = ? AND status = 'offer_market'").all(userId);
      res.json(offers);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/cars/:id/offer — submit offer
  app.post("/api/cars/:id/offer", requireAuth, (req, res) => {
    const { id } = req.params;
    const { userId, amount } = req.body;
    const timestamp = new Date().toISOString();

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      const user: any = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);

      if (!car || car.status !== 'offer_market') {
        return res.status(400).json({ error: "السيارة غير متاحة في سوق العروض" });
      }

      if (amount < car.reservePrice * 0.9) {
        return res.status(400).json({ error: "العرض يجب أن يكون ضمن 10% من السعر الاحتياطي" });
      }

      if (!user || user.buyingPower < amount) {
        return res.status(400).json({ error: "القوة الشرائية غير كافية لتقديم هذا العرض" });
      }

      // Record the offer as a bid
      const bidId = `offer - ${Date.now()} `;
      db.prepare("INSERT INTO bids (id, carId, userId, amount, timestamp, type) VALUES (?, ?, ?, ?, ?, 'offer')").run(bidId, id, userId, amount, timestamp);
      db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(amount, userId, id);

      // If offer meets reserve, sell immediately
      if (amount >= car.reservePrice) {
        db.prepare("UPDATE cars SET status = 'closed' WHERE id = ?").run(id);
        createWinInvoices(userId, id, amount);
        io.emit("car_updated", { id, status: 'closed', winnerId: userId });
        return res.json({ success: true, status: 'sold', message: "تم قبول العرض والبيع فوراً!" });
      }

      // Notify seller about the new offer
      if (car.sellerId) {
        sendNotification(car.sellerId, `عرض جديد بقيمة $${amount} على سيارتك ${car.make} ${car.model}`, 'offer', `/dashboard/seller?view=inventory`);
      }

      io.emit("car_updated", { id, currentBid: amount, winnerId: userId });
      res.json({ success: true, status: 'pending', message: "تم تقديم العرض بنجاح، بانتظار موافقة البائع" });
    } catch (err) {
      res.status(500).json({ error: "فشل تقديم العرض" });
    }
  });

  // POST /api/offers/:carId/accept
  app.post("/api/offers/:carId/accept", requireAuth, (req, res) => {
    const { carId } = req.params;
    const jwtUser = (req as any).user;
    const actionUserId = jwtUser.id;

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "Car not found" });

      if (jwtUser.role !== 'admin' && car.sellerId !== jwtUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية للموافقة على هذا العرض" });
      }

      const lastBid: any = db.prepare("SELECT * FROM bids WHERE carId = ? AND type = 'offer' ORDER BY amount DESC LIMIT 1").get(carId);
      if (!lastBid) return res.status(400).json({ error: "لا توجد عروض لهذه السيارة" });

      const saleDate = new Date().toISOString();

      db.transaction(() => {
        db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ?, auctionEndDate = ?, acceptedBy = ?, sellerCounterPrice = NULL WHERE id = ?").run(lastBid.userId, lastBid.amount, saleDate, actionUserId, carId);
        createWinInvoices(lastBid.userId, carId, lastBid.amount);
      })();

      io.emit("car_updated", { id: carId, status: 'closed', winnerId: lastBid.userId, currentBid: lastBid.amount });
      res.json({ success: true, message: "تم قبول العرض وإصدار الفاتورة" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to accept offer" });
    }
  });

  // POST /api/offers/:carId/reject
  app.post("/api/offers/:carId/reject", requireAuth, (req, res) => {
    const { carId } = req.params;
    const jwtUser = (req as any).user;

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (jwtUser.role !== 'admin' && car.sellerId !== jwtUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية لرفض هذا العرض" });
      }

      db.prepare("UPDATE cars SET status = 'upcoming', offerMarketEndTime = NULL, sellerCounterPrice = NULL WHERE id = ?").run(carId);
      db.prepare("DELETE FROM bids WHERE carId = ? AND type = 'offer'").run(carId);

      const prevBid: any = db.prepare("SELECT amount, userId FROM bids WHERE carId = ? ORDER BY amount DESC LIMIT 1").get(carId);
      if(prevBid) {
         db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(prevBid.amount, prevBid.userId, carId);
      }

      io.emit("car_updated", { id: carId, status: 'upcoming', currentBid: prevBid?.amount || 0 });
      res.json({ success: true, message: "تم رفض العرض وإعادة السيارة للجدولة" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to reject offer" });
    }
  });

  // POST /api/offers/:carId/counter
  app.post("/api/offers/:carId/counter", requireAuth, (req, res) => {
    const { carId } = req.params;
    const jwtUser = (req as any).user;
    const { counterAmount } = req.body || {};

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (jwtUser.role !== 'admin' && car.sellerId !== jwtUser.id) {
        return res.status(403).json({ error: "ليس لديك صلاحية لتقديم عرض مضاد" });
      }

      if (!counterAmount || isNaN(counterAmount)) {
        return res.status(400).json({ error: "مبلغ العرض غير صحيح" });
      }

      const lastBid: any = db.prepare("SELECT * FROM bids WHERE carId = ? AND type = 'offer' ORDER BY amount DESC LIMIT 1").get(carId);

      db.prepare("UPDATE cars SET sellerCounterPrice = ? WHERE id = ?").run(counterAmount, carId);

      if (lastBid) {
        sendNotification(lastBid.userId, 'تم تقديم عرض مضاد 🔄', `تم تقديم عرض مضاد لسيارتك بقيمة $${Number(counterAmount).toLocaleString()}`, 'info');
        sendInternalMessage('admin-1', lastBid.userId, '🔄 التفاوض: الإدارة قدمت لك عرضاً مضاداً',
          `أهلاً، لقد قام البائع بتقديم عرض مضاد لسيارة ${car.make} ${car.model}.\nالسعر المضاد هو: $${Number(counterAmount).toLocaleString()}\nيرجى مراجعة صفحة السيارة للإستجابة.`
        );
      }

      io.emit("car_updated", { id: carId, sellerCounterPrice: counterAmount });
      res.json({ success: true, message: "تم تسجيل العرض المضاد وإرسال تنبيه للمشتري" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "فشل تقديم العرض المضاد" });
    }
  });

  // POST /api/offers/:carId/respond
  app.post("/api/offers/:carId/respond", requireAuth, (req, res) => {
    const { carId } = req.params;
    const { userId, action } = req.body || {};

    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: "السيارة غير موجودة" });

      if (action === 'accept') {
        if (!car.sellerCounterPrice) return res.status(400).json({ error: "لا يوجد عرض مضاد" });
        db.transaction(() => {
          db.prepare("UPDATE cars SET status = 'closed', winnerId = ?, currentBid = ?, sellerCounterPrice = NULL WHERE id = ?").run(userId, car.sellerCounterPrice, carId);
          createWinInvoices(userId, carId, car.sellerCounterPrice);
        })();
        io.emit("car_updated", { id: carId, status: 'closed', winnerId: userId, currentBid: car.sellerCounterPrice });
        res.json({ success: true, message: "تم قبول العرض المضاد وإتمام البيع" });
      } else if (action === 'reject') {
        db.prepare("UPDATE cars SET status = 'upcoming', offerMarketEndTime = NULL, sellerCounterPrice = NULL WHERE id = ?").run(carId);
        db.prepare("DELETE FROM bids WHERE carId = ? AND type = 'offer'").run(carId);

        const prevBid: any = db.prepare("SELECT amount, userId FROM bids WHERE carId = ? ORDER BY amount DESC LIMIT 1").get(carId);
        if (prevBid) {
           db.prepare("UPDATE cars SET currentBid = ?, winnerId = ? WHERE id = ?").run(prevBid.amount, prevBid.userId, carId);
        }

        io.emit("car_updated", { id: carId, status: 'upcoming', currentBid: prevBid?.amount || 0 });
        res.json({ success: true, message: "تم رفض العرض المضاد" });
      } else {
        res.status(400).json({ error: "إجراء غير معروف" });
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "فشل معالجة الرد" });
    }
  });

  // ======= INVOICES =======

  app.get("/api/invoices/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    const invoices: any[] = db.prepare(`
      SELECT i.*, c.make, c.model, c.year, c.lotNumber, c.sellerId
      FROM invoices i
      LEFT JOIN cars c ON i.carId = c.id
      WHERE i.userId = ?
  `).all(userId);
    res.json(invoices);
  });

  // POST /api/invoices/:id/pay — invoice payment (wallet or manual methods)
  app.post("/api/invoices/:id/pay", requireAuth, (req, res) => {
    const { id } = req.params;
    const { method, referenceNo, receiptUrl } = req.body;
    const userId = (req as any).user.id; // Use authenticated user, not body param

    if (!method) return res.status(400).json({ error: "يرجى اختيار طريقة الدفع أولاً" });

    try {
      const invoice: any = db.prepare("SELECT i.*, c.sellerId, c.make, c.model, c.year FROM invoices i LEFT JOIN cars c ON i.carId = c.id WHERE i.id = ?").get(id) as any;
      if (!invoice) return res.status(404).json({ error: "الفاتورة غير موجودة" });
      if (invoice.userId !== userId) return res.status(403).json({ error: "هذه الفاتورة لا تخصك" });
      if (invoice.status === 'paid') return res.status(400).json({ error: "الفاتورة مدفوعة بالفعل" });
      if (invoice.status === 'pending_confirmation') return res.status(400).json({ error: "هذه الفاتورة بانتظار تأكيد الإدارة" });

      const timestamp = new Date().toISOString();

      // 💳 METHOD 1: WALLET PAYMENT (INSTANT)
      if (method === 'wallet') {
        const { walletDebit, settleSaleToSellerWallet } = ctx;
        const wallet: any = db.prepare("SELECT balance FROM buyer_wallets WHERE userId = ?").get(userId) as any;
        if (!wallet || wallet.balance < invoice.amount) {
          return res.status(400).json({ error: `رصيد المحفظة غير كافٍ. الرصيد الحالي: $${(wallet?.balance || 0).toLocaleString()}` });
        }

        db.transaction(() => {
          walletDebit(userId, invoice.amount, `دفع فاتورة ${invoice.type}: ${invoice.id}`, invoice.id);
          const pickupCode = `AUTH-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
          db.prepare("UPDATE invoices SET status = 'paid', pickupAuthCode = ?, paidAt = ?, paidVia = 'wallet' WHERE id = ?").run(pickupCode, timestamp, id);

          // If purchase invoice paid, activate transport invoice AND settle with seller
          if (invoice.type === 'purchase') {
            db.prepare("UPDATE invoices SET status = 'unpaid' WHERE carId = ? AND userId = ? AND type = 'transport' AND status = 'pending'")
              .run(invoice.carId, userId);
            db.prepare("UPDATE shipments SET status = 'paid', updatedAt = ? WHERE carId = ? AND userId = ?")
              .run(timestamp, invoice.carId, userId);

            if (invoice.sellerId) {
              const seller: any = db.prepare("SELECT commission FROM users WHERE id = ?").get(invoice.sellerId) as any;
              settleSaleToSellerWallet(invoice.sellerId, invoice.carId, invoice.amount, seller?.commission || 5, `بيع سيارة: ${invoice.year} ${invoice.make} ${invoice.model}`);
              sendNotification(invoice.sellerId, '💰 تم استلام دفعة سيارة', `المشتري قام بدفع ثمن سيارتك ${invoice.make} عبر المحفظة.`, 'success');
            }
          } else if (invoice.type === 'transport') {
            db.prepare("UPDATE shipments SET status = 'in_transit', updatedAt = ? WHERE carId = ? AND userId = ?")
              .run(timestamp, invoice.carId, userId);
          } else if (invoice.type === 'shipping') {
            db.prepare("UPDATE shipments SET status = 'in_shipping', updatedAt = ? WHERE carId = ? AND userId = ?")
              .run(timestamp, invoice.carId, userId);
          }
        })();

        return res.json({ success: true, status: 'paid', message: "تم الدفع بنجاح عبر المحفظة" });
      }

      // 🏦 METHOD 2: MANUAL METHODS (Requires Admin Confirmation)
      if (['bank_transfer', 'cash', 'card'].includes(method)) {
        const requestId = `pr-inv-${Date.now()}`;
        db.transaction(() => {
          // Create payment request
          db.prepare(`
            INSERT INTO payment_requests (id, userId, type, amount, method, referenceNo, receiptUrl, invoiceId, status, requestedAt)
            VALUES (?, ?, 'invoice_payment', ?, ?, ?, ?, ?, 'pending', ?)
          `).run(requestId, userId, invoice.amount, method, referenceNo || null, receiptUrl || null, id, timestamp);

          // Update invoice status
          db.prepare("UPDATE invoices SET status = 'pending_confirmation', paidVia = ? WHERE id = ?").run(method, id);
        })();

        // Notify Admin
        sendNotification('admin-1', '🧾 طلب تأكيد دفع فاتورة', `قام المستخدم بدفع فاتورة ${invoice.type} بمبلغ $${invoice.amount.toLocaleString()} عبر ${method}. يرجى التأكيد.`, 'info');
        // Notify the user that their invoice payment request was submitted
        sendNotification(userId, '📋 تم إرسال طلب دفع الفاتورة', `تم إرسال طلب دفع الفاتورة ${id} للمراجعة. سنُعلمك فور الموافقة.`, 'info', 'general_notification', {}, '/dashboard/user?view=invoices');

        return res.json({ success: true, status: 'pending_confirmation', message: "تم إرسال طلب الدفع للإدارة للمراجعة" });
      }

      res.status(400).json({ error: "طريقة دفع غير مدعومة" });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: "فشل عملية الدفع: " + e.message });
    }
  });

  // POST /api/invoices/:id/cancel-transport — cancel transport invoice (buyer self-pickup)
  app.post("/api/invoices/:id/cancel-transport", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const invoice: any = db.prepare("SELECT * FROM invoices WHERE id = ? AND type = 'transport'").get(id);
      if (!invoice) return res.status(404).json({ error: "فاتورة النقل غير موجودة" });

      db.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ?").run(id);

      // Update associated shipment if exists
      try {
        db.prepare("UPDATE shipments SET status = 'self_pickup' WHERE carId = ? AND userId = ?").run(invoice.carId, invoice.userId);
      } catch (_) {}

      res.json({ success: true, message: "تم إلغاء فاتورة النقل — استلام ذاتي" });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "فشل إلغاء فاتورة النقل" });
    }
  });

  // PUT /api/invoices/:id/view — mark invoice as viewed
  app.put("/api/invoices/:id/view", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE invoices SET viewedAt = ? WHERE id = ?").run(new Date().toISOString(), id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: "فشل تحديث حالة المشاهدة" });
    }
  });

  // GET /api/invoices/car/:carId — invoices for a specific car
  app.get("/api/invoices/car/:carId", requireAuth, (req, res) => {
    const { carId } = req.params;
    try {
      const invoices: any[] = db.prepare("SELECT * FROM invoices WHERE carId = ? ORDER BY timestamp DESC").all(carId);
      res.json(invoices);
    } catch (e: any) {
      res.status(500).json({ error: "فشل جلب فواتير السيارة" });
    }
  });

  // ======= WATCHLIST =======

  app.get("/api/watchlist/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    const watchlist: any[] = db.prepare(`
      SELECT w.*, c.make, c.model, c.year, c.currentBid, c.images, c.status
      FROM watchlist w
      JOIN cars c ON w.carId = c.id
      WHERE w.userId = ?
  `).all(userId);
    res.json(watchlist.map((item: any) => ({
      ...item,
      images: JSON.parse(item.images || '[]')
    })));
  });

  app.post("/api/watchlist", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const { carId } = req.body;
    const id = Date.now().toString();
    try {
      db.prepare("INSERT INTO watchlist (id, userId, carId, timestamp) VALUES (?, ?, ?, ?)").run(
        id, userId, carId, new Date().toISOString()
      );
      res.json({ id, userId, carId });
    } catch (e) {
      res.status(400).json({ error: "Failed to add to watchlist" });
    }
  });

  app.delete("/api/watchlist/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM watchlist WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // ======= KYC UPLOAD =======

  const uploadsDir = path.join(path.dirname(__dirname), 'uploads');
  const kycDir = path.join(uploadsDir, 'kyc');
  if (!fs.existsSync(kycDir)) fs.mkdirSync(kycDir, { recursive: true });

  const kycStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, kycDir),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf';
      cb(null, `kyc_${unique}${ext}`);
    }
  });
  const uploadKyc = multer({
    storage: kycStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only images and PDFs allowed'));
    }
  });

  app.post('/api/kyc/upload', requireAuth, (uploadKyc.single('document') as any), ((req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
      const { userId, docType } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId مطلوب' });

      const docId = `kyc-${Date.now()}`;
      const url = `/uploads/kyc/${req.file.filename}`;

      db.prepare(`INSERT INTO kyc_documents (id, userId, docType, filename, url, status, uploadedAt)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)`).run(docId, userId, docType || 'identity', req.file.originalname, url, new Date().toISOString());

      res.json({ success: true, id: docId, url });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'فشل رفع مستند KYC' });
    }
  }) as any);

  // ======= NOTIFICATIONS =======

  app.get("/api/notifications/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const notifications: any[] = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC").all(userId);
      res.json(notifications);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    try {
      db.prepare("UPDATE notifications SET isRead = 1 WHERE userId = ?").run(userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark all as read" });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      db.prepare("UPDATE notifications SET isRead = 1 WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // ======= SAVED SEARCHES (Marketing Email Alerts) =======

  // List the current user's saved searches
  app.get("/api/saved-searches", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    try {
      const rows: any[] = db.prepare(
        "SELECT * FROM saved_searches WHERE userId = ? ORDER BY createdAt DESC"
      ).all(userId);
      res.json(rows.map((r: any) => ({
        ...r,
        emailAlerts: !!r.emailAlerts,
        filters: safeJsonParse(r.filters, {})
      })));
    } catch (e: any) {
      res.status(500).json({ error: e.message || "فشل جلب عمليات البحث المحفوظة" });
    }
  });

  // Create a saved search
  app.post("/api/saved-searches", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const { name, filters, emailAlerts, alertFrequency } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: "الاسم مطلوب" });
    }
    const filtersObj = (filters && typeof filters === 'object') ? filters : {};
    const freq = ['instant', 'daily', 'weekly'].includes(alertFrequency) ? alertFrequency : 'instant';
    const id = `search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO saved_searches
        (id, userId, name, filters, emailAlerts, alertFrequency, lastResultCount, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)`).run(
          id,
          userId,
          name.trim().slice(0, 200),
          JSON.stringify(filtersObj),
          emailAlerts === false ? 0 : 1,
          freq,
          createdAt
      );
      res.json({
        id, userId, name: name.trim().slice(0, 200),
        filters: filtersObj,
        emailAlerts: emailAlerts === false ? false : true,
        alertFrequency: freq,
        lastResultCount: 0,
        createdAt
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "فشل حفظ البحث" });
    }
  });

  // Update a saved search (owner only)
  app.put("/api/saved-searches/:id", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
      const row: any = db.prepare("SELECT * FROM saved_searches WHERE id = ?").get(id);
      if (!row) return res.status(404).json({ error: "البحث غير موجود" });
      if (row.userId !== userId) return res.status(403).json({ error: "غير مصرح" });

      const { name, filters, emailAlerts, alertFrequency } = req.body || {};
      const newName = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 200) : row.name;
      const newFilters = (filters && typeof filters === 'object') ? JSON.stringify(filters) : row.filters;
      const newEmail = (emailAlerts === undefined) ? row.emailAlerts : (emailAlerts ? 1 : 0);
      const newFreq = ['instant', 'daily', 'weekly'].includes(alertFrequency) ? alertFrequency : row.alertFrequency;

      db.prepare(`UPDATE saved_searches
        SET name = ?, filters = ?, emailAlerts = ?, alertFrequency = ?
        WHERE id = ?`).run(newName, newFilters, newEmail, newFreq, id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "فشل تحديث البحث" });
    }
  });

  // Delete a saved search (owner only)
  app.delete("/api/saved-searches/:id", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
      const row: any = db.prepare("SELECT userId FROM saved_searches WHERE id = ?").get(id);
      if (!row) return res.status(404).json({ error: "البحث غير موجود" });
      if (row.userId !== userId) return res.status(403).json({ error: "غير مصرح" });
      db.prepare("DELETE FROM saved_searches WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "فشل حذف البحث" });
    }
  });

  // Admin-only: trigger a test alert for a single saved search
  app.post("/api/saved-searches/:id/test-alert", requireAuth, async (req, res) => {
    const jwtUser = (req as any).user;
    if (jwtUser.role !== 'admin') return res.status(403).json({ error: "صلاحيات المدير مطلوبة" });
    const { id } = req.params;
    try {
      const row: any = db.prepare(
        "SELECT s.*, u.email, u.firstName FROM saved_searches s JOIN users u ON s.userId = u.id WHERE s.id = ?"
      ).get(id);
      if (!row) return res.status(404).json({ error: "البحث غير موجود" });

      const buildSearchAlertEmail = (app as any).locals.buildSearchAlertEmail;
      if (!buildSearchAlertEmail) return res.status(500).json({ error: "قالب البريد غير جاهز" });

      const sampleCars: any[] = db.prepare(
        "SELECT * FROM cars WHERE status IN ('upcoming','live') ORDER BY COALESCE(createdAt, '') DESC LIMIT 3"
      ).all();

      await ctx.sendEmail({
        to: row.email,
        subject: `🧪 (اختبار) سيارات تطابق بحثك "${row.name}"`,
        html: buildSearchAlertEmail(row, sampleCars, row.firstName)
      });
      res.json({ success: true, to: row.email, count: sampleCars.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message || "فشل إرسال البريد التجريبي" });
    }
  });

  // Unsubscribe link (clickable from email — no auth, token == search id for now)
  app.get("/api/saved-searches/unsubscribe/:id", (req, res) => {
    const { id } = req.params;
    const { token } = req.query as any;
    try {
      if (!token || token !== id) {
        return res.status(400).send("<h3 dir=\"rtl\">رابط غير صالح</h3>");
      }
      const row: any = db.prepare("SELECT id FROM saved_searches WHERE id = ?").get(id);
      if (!row) return res.status(404).send("<h3 dir=\"rtl\">البحث غير موجود</h3>");
      db.prepare("UPDATE saved_searches SET emailAlerts = 0 WHERE id = ?").run(id);
      res.send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تم إلغاء الاشتراك</title></head>
        <body style="font-family:Cairo,sans-serif;background:#f8fafc;padding:48px;text-align:center;">
          <h2 style="color:#0f172a;">تم إلغاء اشتراك التنبيهات لهذا البحث ✅</h2>
          <p style="color:#475569;">لن تستلم بعد الآن رسائل بريد لهذا البحث المحفوظ.</p>
        </body></html>`);
    } catch (e: any) {
      res.status(500).send("<h3 dir=\"rtl\">حدث خطأ</h3>");
    }
  });

  // ======= UNREAD COUNTS =======

  app.get("/api/unread-counts/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    try {
      const messages: any = db.prepare("SELECT COUNT(*) as count FROM messages WHERE receiverId = ? AND isRead = 0").get(userId) as any;
      const notifications: any = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0").get(userId) as any;
      res.json({ messages: messages.count, notifications: notifications.count });
    } catch (e) {
      res.json({ messages: 0, notifications: 0 });
    }
  });
}
