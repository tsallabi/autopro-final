import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export function registerShippingRoutes(ctx: AppContext) {
  const { app, db, io, sendNotification, sendInternalMessage } = ctx;

  // GET /api/shipments/user/:userId — shipments for a specific user
  app.get("/api/shipments/user/:userId", requireAuth, (req, res) => {
    const { userId } = req.params;
    const requestingUser = (req as any).user;
    if (requestingUser.id !== userId && requestingUser.role !== 'admin') {
      return res.status(403).json({ error: "غير مصرح — لا يمكنك الوصول لبيانات مستخدم آخر" });
    }
    try {
      const shipments: any[] = db.prepare(`
        SELECT s.*, c.make, c.model, c.year, c.images, c.lotNumber
        FROM shipments s
        JOIN cars c ON s.carId = c.id
        WHERE s.userId = ?
        ORDER BY s.createdAt DESC
      `).all(userId);
      res.json(shipments.map((s: any) => ({ ...s, images: JSON.parse(s.images || '[]') })));
    } catch (e) {
      res.status(500).json({ error: "فشل جلب بيانات الشحن" });
    }
  });

  // POST /api/shipments/:carId/request — request shipping for a car
  app.post("/api/shipments/:carId/request", requireAuth, (req, res) => {
    const { carId } = req.params;
    const userId = (req as any).user.id; // Use authenticated user
    try {
      const now = new Date().toISOString();
      // Ensure shipment record exists (UPSERT)
      const existing: any = db.prepare("SELECT id FROM shipments WHERE carId = ? AND userId = ?").get(carId, userId);
      if (existing) {
        db.prepare(`UPDATE shipments SET status = 'shipping_requested', updatedAt = ? WHERE carId = ? AND userId = ?`)
          .run(now, carId, userId);
      } else {
        const shipId = `ship-${Date.now()}`;
        db.prepare(`INSERT INTO shipments(id, carId, userId, status, createdAt, updatedAt) VALUES(?, ?, ?, 'shipping_requested', ?, ?)`)
          .run(shipId, carId, userId, now, now);
      }

      const car: any = db.prepare("SELECT make, model, year, sellerId, lotNumber FROM cars WHERE id = ?").get(carId);

      // Notify all admins
      const admins: any[] = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      admins.forEach((admin: any) => {
        sendInternalMessage(userId, admin.id,
          `🚚 طلب شحن جديد: ${car.year} ${car.make} ${car.model}`,
          `قام العميل بطلب شحن السيارة للعنوان بعد إتمام الدفع.\n\nالسيارة: ${car.year} ${car.make} ${car.model}\n carId: ${carId}\n\nيرجى مراجعة الطلب في قسم اللوجستيات وتحديث حالة الشحن.`
        );
      });

      // Notify Seller
      if (car.sellerId) {
        sendNotification(car.sellerId, '🚚 طلب شحن سيارة مباعة', `المشتري طلب شحن سيارتك رقم اللوت: ${car.lotNumber}`, 'info');
        sendInternalMessage('admin-1', car.sellerId, '🚚 تحديث اللوجستيات: طلب شحن',
          `قام المشتري بطلب شحن سيارتك المباعة (${car.make} ${car.model}).\n\nيرجى متابعة حالة السيارة واستكمال إجراءات التسليم في لوحة التاجر.`
        );
      }

      res.json({ success: true, message: "تم إرسال طلب الشحن بنجاح" });
    } catch (e) {
      res.status(500).json({ error: "فشل إرسال طلب الشحن" });
    }
  });

  // GET /api/shipping-rates — static shipping rate list
  app.get("/api/shipping-rates", (req, res) => {
    const rates = [
      { destination: 'طرابلس (ميناء)', port: 'TIP', usd: 1800, estimatedDays: 21 },
      { destination: 'بنغازي (ميناء)', port: 'BEN', usd: 1950, estimatedDays: 25 },
      { destination: 'مصراتة (ميناء)', port: 'MIS', usd: 1750, estimatedDays: 20 },
      { destination: 'درنة (ميناء)', port: 'DRN', usd: 2100, estimatedDays: 28 },
      { destination: 'الزاوية (ميناء)', port: 'ZAW', usd: 1820, estimatedDays: 22 },
    ];
    res.json(rates);
  });

  // POST /api/calculator/estimate — full landed cost calculator
  app.post("/api/calculator/estimate", (req, res) => {
    try {
      const { carPrice, year, destination, exchangeRate } = req.body;
      const rate = exchangeRate || 4.85;
      const destinationRates: Record<string, number> = {
        TIP: 1800, BEN: 1950, MIS: 1750, DRN: 2100, ZAW: 1820
      };
      const shippingUSD = destinationRates[destination] || 1800;
      const auctionFee = carPrice * 0.04;
      const portFee = 350;
      const insuranceFee = carPrice * 0.012;
      const customsDuty = (carPrice + shippingUSD) * 0.05; // 5% customs
      const totalUSD = carPrice + shippingUSD + auctionFee + portFee + insuranceFee;
      const totalWithCustomsUSD = totalUSD + customsDuty;
      const totalLYD = totalWithCustomsUSD * rate;

      res.json({
        carPrice, shippingUSD, auctionFee, portFee, insuranceFee,
        customsDuty, totalUSD, totalWithCustomsUSD, totalLYD,
        exchangeRate: rate,
        breakdown: [
          { label: 'سعر السيارة', usd: carPrice },
          { label: 'تكلفة الشحن', usd: shippingUSD },
          { label: 'رسوم المزاد (4%)', usd: auctionFee },
          { label: 'رسوم الميناء', usd: portFee },
          { label: 'تأمين (1.2%)', usd: insuranceFee },
          { label: 'جمارك (5%)', usd: customsDuty },
        ]
      });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
}
