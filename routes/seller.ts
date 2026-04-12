import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export function registerSellerRoutes(ctx: AppContext) {
  const { app, db, io, sendNotification, sendInternalMessage, ensureSellerWallet, settleSaleToSellerWallet } = ctx;

  // =====================================================================
  // SELLER WALLET & TRANSACTIONS
  // =====================================================================

  // GET /api/seller/wallet/:sellerId - Full wallet summary
  app.get("/api/seller/wallet/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    const reqUser = (req as any).user;
    if (reqUser.id !== sellerId && reqUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بالوصول لمحفظة بائع آخر" });
    }
    try {
      ensureSellerWallet(sellerId);
      const wallet: any = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(sellerId) as any;
      const seller: any = db.prepare("SELECT id, firstName, lastName, email, phone FROM users WHERE id = ?").get(sellerId) as any;

      // Count stats
      const soldCars: any = db.prepare("SELECT COUNT(*) as count FROM seller_transactions WHERE sellerId = ? AND type = 'sale'").get(sellerId) as any;
      const pendingWithdrawals: any = db.prepare("SELECT SUM(amount) as total FROM withdrawal_requests WHERE sellerId = ? AND status = 'pending'").get(sellerId) as any;

      res.json({
        ...wallet,
        sellerName: seller ? `${seller.firstName} ${seller.lastName}` : '',
        iban: seller?.iban || wallet?.iban || '',
        commissionRate: seller?.commission || 2,
        totalSoldCars: soldCars?.count || 0,
        pendingWithdrawalAmount: pendingWithdrawals?.total || 0
      });
    } catch (e) {
      res.status(500).json({ error: "فشل جلب بيانات المحفظة" });
    }
  });

  // GET /api/seller/transactions/:sellerId - Seller transaction ledger
  app.get("/api/seller/transactions/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    const reqUser = (req as any).user;
    if (reqUser.id !== sellerId && reqUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح بالوصول لمعاملات بائع آخر" });
    }
    try {
      const txs: any[] = db.prepare(`
        SELECT st.*, c.make, c.model, c.year, c.lotNumber
        FROM seller_transactions st
        LEFT JOIN cars c ON st.carId = c.id
        WHERE st.sellerId = ?
        ORDER BY st.timestamp DESC
      `).all(sellerId);
      res.json(txs);
    } catch (e) {
      res.status(500).json({ error: "فشل جلب سجل المعاملات" });
    }
  });

  // POST /api/seller/withdraw - Request withdrawal
  app.post("/api/seller/withdraw", requireAuth, (req, res) => {
    const reqUser = (req as any).user;
    const sellerId = reqUser.id; // Use authenticated user, not body param
    const { amount, iban, bankName } = req.body;
    try {
      ensureSellerWallet(sellerId);
      const wallet: any = db.prepare("SELECT availableBalance FROM seller_wallets WHERE sellerId = ?").get(sellerId) as any;

      if (!wallet || wallet.availableBalance < amount) {
        return res.status(400).json({ error: `الرصيد المتاح ($${(wallet?.availableBalance || 0).toLocaleString()}) أقل من المبلغ المطلوب` });
      }
      if (amount < 100) {
        return res.status(400).json({ error: "الحد الأدنى للسحب هو $100" });
      }

      const reqId = `wr-${Date.now()}`;
      db.prepare(`
        INSERT INTO withdrawal_requests (id, sellerId, amount, iban, bankName, status, requestedAt)
        VALUES (?, ?, ?, ?, ?, 'pending', ?)
      `).run(reqId, sellerId, amount, iban, bankName, new Date().toISOString());

      // Reserve the amount (deduct from available, tracked in withdrawal_requests)
      db.prepare("UPDATE seller_wallets SET availableBalance = availableBalance - ?, lastUpdated = ? WHERE sellerId = ?")
        .run(amount, new Date().toISOString(), sellerId);

      sendNotification(sellerId, '✅ طلب السحب قيد المراجعة', `تم استقبال طلب سحب $${amount.toLocaleString()} بنجاح. ستتم المعالجة خلال 1-3 أيام عمل.`, 'info');
      sendNotification('admin-1', '💰 طلب سحب جديد', `البائع ${sellerId} طلب سحب $${amount.toLocaleString()}`, 'alert');

      res.json({ success: true, requestId: reqId, message: "تم إرسال طلب السحب للمراجعة" });
    } catch (e) {
      res.status(500).json({ error: "فشل طلب السحب" });
    }
  });

  // PUT /api/seller/wallet/:id/iban - Update seller IBAN & bank info
  app.put("/api/seller/wallet/:id/iban", requireAuth, (req, res) => {
    const { id } = req.params;
    const { iban, bankName } = req.body;
    if (!iban?.trim()) return res.status(400).json({ error: "IBAN مطلوب" });
    try {
      // Ensure wallet exists
      const exists: any = db.prepare("SELECT sellerId FROM seller_wallets WHERE sellerId = ?").get(id);
      if (!exists) {
        db.prepare("INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated, iban, bankName) VALUES (?, 0, 0, 0, 0, ?, ?, ?)")
          .run(id, new Date().toISOString(), iban.trim(), bankName?.trim() || '');
      } else {
        db.prepare("UPDATE seller_wallets SET iban = ?, bankName = ?, lastUpdated = ? WHERE sellerId = ?")
          .run(iban.trim(), bankName?.trim() || '', new Date().toISOString(), id);
      }
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: "فشل تحديث IBAN" });
    }
  });

  // Alias: /api/seller-wallet/:id → /api/seller/wallet/:id
  app.get("/api/seller-wallet/:id", requireAuth, (req, res) => {
    try {
      let wallet: any = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(req.params.id);
      if (!wallet) {
        db.prepare(`INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated)
          VALUES (?,0,0,0,0,?)`).run(req.params.id, new Date().toISOString());
        wallet = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(req.params.id);
      }
      const txs: any[] = db.prepare("SELECT * FROM seller_transactions WHERE sellerId = ? ORDER BY createdAt DESC LIMIT 20").all(req.params.id);
      res.json({ ...wallet, transactions: txs });
    } catch (e) { res.status(500).json({ error: "فشل جلب محفظة البائع" }); }
  });

  // =====================================================================
  // SELLER JOURNEY ROUTES
  // =====================================================================

  // POST /api/seller/register — seller KYC application
  app.post("/api/seller/register", requireAuth, (req, res) => {
    try {
      const { companyName, tradeLicense, address, city, bankName, iban, phone } = req.body;
      const userId = (req as any).user.id; // Use authenticated user
      db.prepare(`UPDATE users SET role='seller', kycStatus='pending', companyName=?, address1=?, phone=?
        WHERE id=?`).run(companyName||null, address||null, phone||null, userId);
      // Store IBAN for seller wallet
      db.prepare(`INSERT INTO seller_wallets (sellerId, availableBalance, pendingBalance, totalEarned, totalWithdrawn, lastUpdated, iban, bankName)
        VALUES (?,0,0,0,0,?,?,?) ON CONFLICT(sellerId) DO UPDATE SET iban=excluded.iban, bankName=excluded.bankName`
      ).run(userId, new Date().toISOString(), iban||null, bankName||null);
      sendNotification('admin-1', '🆕 طلب تسجيل بائع جديد',
        `${companyName || userId} يطلب التسجيل كبائع. يرجى مراجعة طلب KYC.`, 'info');
      sendNotification(userId, '✅ تم استلام طلب التسجيل كبائع',
        'جاري مراجعة طلبك. سنُعلمك خلال 24-48 ساعة.', 'info');
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/cars/seller — seller uploads a new car for auction
  app.post("/api/cars/seller", requireAuth, (req, res) => {
    try {
      const { sellerId, make, model, year, vin, mileage, condition, description,
              startingBid, reservePrice, auctionStart, auctionEnd, images, city } = req.body;
      if (!sellerId || !make || !model) return res.status(400).json({ error: "بيانات السيارة غير مكتملة" });

      const seller: any = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'seller'").get(sellerId);
      if (!seller) return res.status(403).json({ error: "غير مصرح — يجب أن تكون بائعاً معتمداً" });
      if (seller.kycStatus !== 'approved') return res.status(403).json({ error: "يجب إكمال التحقق من الهوية أولاً" });

      const lotNumber = `LY-${Date.now().toString(36).toUpperCase()}`;
      const carId = `car-${Date.now()}`;
      const imagesJson = JSON.stringify(images || []);

      db.prepare(`INSERT INTO cars (id, sellerId, lotNumber, make, model, year, vin, mileage, condition,
        description, startingBid, reservePrice, currentBid, auctionStart, auctionEnd, status, images, city, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_approval',?,?,?)`
      ).run(carId, sellerId, lotNumber, make, model, year, vin||null, mileage||0, condition||'used',
        description||null, startingBid||0, reservePrice||0, startingBid||0,
        auctionStart||null, auctionEnd||null, imagesJson, city||null, new Date().toISOString());

      // Notify seller when car is approved (handled in approve-car endpoint)

      sendNotification('admin-1', '🚗 سيارة جديدة بانتظار الموافقة',
        `${seller.firstName} أضاف ${make} ${model} ${year} للمزاد. لوت: ${lotNumber}`, 'info');
      sendNotification(sellerId, '✅ تم رفع السيارة بنجاح',
        `${make} ${model} ${year} (${lotNumber}) تحت المراجعة. سنُعلمك عند الموافقة.`, 'success');

      res.json({ success: true, carId, lotNumber });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/cars/seller/:sellerId — seller's own cars
  app.get("/api/cars/seller/:sellerId", requireAuth, (req, res) => {
    try {
      const cars: any[] = db.prepare(`
        SELECT c.*,
          (SELECT COUNT(*) FROM bids WHERE carId = c.id) as bidCount,
          (SELECT MAX(amount) FROM bids WHERE carId = c.id) as highestBid
        FROM cars c WHERE c.sellerId = ? ORDER BY c.id DESC`).all(req.params.sellerId);
      cars.forEach(c => { try { c.images = JSON.parse(c.images || '[]'); } catch { c.images = []; } });
      res.json(cars);
    } catch (e) { res.status(500).json({ error: "فشل جلب سيارات البائع" }); }
  });

  // POST /api/seller/payout-request — seller requests withdrawal
  app.post("/api/seller/payout-request", requireAuth, (req, res) => {
    try {
      const { sellerId, amount } = req.body;
      if (!sellerId || !amount || amount <= 0) return res.status(400).json({ error: "بيانات غير مكتملة" });
      const wallet: any = db.prepare("SELECT * FROM seller_wallets WHERE sellerId = ?").get(sellerId);
      if (!wallet) return res.status(404).json({ error: "محفظة البائع غير موجودة" });
      if (wallet.availableBalance < amount) return res.status(400).json({ error: `الرصيد المتاح $${wallet.availableBalance} غير كافٍ` });

      const reqId = `pr-seller-${Date.now()}`;
      db.prepare(`INSERT INTO payment_requests (id, userId, type, amount, method, status, requestedAt)
        VALUES (?,?,?,?,'bank_transfer','pending',?)`).run(reqId, sellerId, 'withdrawal', amount, new Date().toISOString());
      db.prepare("UPDATE seller_wallets SET availableBalance = availableBalance - ?, pendingBalance = pendingBalance + ? WHERE sellerId = ?")
        .run(amount, amount, sellerId);

      sendNotification('admin-1', '💰 طلب سحب رصيد بائع',
        `البائع ${sellerId} يطلب سحب $${Number(amount).toLocaleString()}`, 'info');
      sendNotification(sellerId, '✅ تم إرسال طلب السحب',
        `طلب سحب $${Number(amount).toLocaleString()} قيد المراجعة. سيُحوَّل خلال 3-5 أيام عمل.`, 'info');

      res.json({ success: true, requestId: reqId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // =====================================================================
  // SELLER INVOICES & OFFER MARKET
  // =====================================================================

  // GET /api/seller/invoices/:sellerId — invoices for cars sold by this seller
  app.get("/api/seller/invoices/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    try {
      const invoices: any[] = db.prepare(`
        SELECT i.*, c.make, c.model, c.year, c.lotNumber, c.images,
          u.firstName as buyerFirstName, u.lastName as buyerLastName
        FROM invoices i
        INNER JOIN cars c ON i.carId = c.id
        LEFT JOIN users u ON i.userId = u.id
        WHERE c.sellerId = ?
        ORDER BY i.timestamp DESC
      `).all(sellerId);
      invoices.forEach(inv => { try { inv.images = JSON.parse(inv.images || '[]'); } catch { inv.images = []; } });
      res.json(invoices);
    } catch (e: any) {
      res.status(500).json({ error: "فشل جلب فواتير البائع" });
    }
  });

  // GET /api/seller/offer-market-cars/:sellerId — seller's offer market cars
  app.get("/api/seller/offer-market-cars/:sellerId", requireAuth, (req, res) => {
    const { sellerId } = req.params;
    try {
      const cars: any[] = db.prepare("SELECT * FROM cars WHERE status = 'offer_market' AND sellerId = ?").all(sellerId);
      res.json(cars.map((car: any) => ({ ...car, images: JSON.parse(car.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب سيارات سوق العروض" });
    }
  });

  // =====================================================================
  // SELLER SHIPMENTS
  // =====================================================================

  // GET /api/shipments/seller/:id — shipments for cars belonging to this seller
  app.get("/api/shipments/seller/:id", requireAuth, (req, res) => {
    const { id } = req.params;
    try {
      const shipments: any[] = db.prepare(`
        SELECT s.*, c.make, c.model, c.year, c.images, c.lotNumber,
               u.firstName, u.lastName, u.email, u.phone
        FROM shipments s
        JOIN cars c ON s.carId = c.id
        JOIN users u ON s.userId = u.id
        WHERE c.sellerId = ?
        GROUP BY s.carId
        ORDER BY s.createdAt DESC
      `).all(id);
      res.json(shipments.map((s: any) => ({ ...s, images: JSON.parse(s.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب الشحنات للتاجر" });
    }
  });
}
