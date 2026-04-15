import { requireAuth, requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

// Haversine distance between two (lat,lng) pairs, in kilometers
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function mapCenterRow(c: any) {
  return {
    id: c.id,
    name: c.name,
    nameEn: c.nameEn,
    country: c.country,
    countryCode: c.countryCode,
    city: c.city,
    address: c.address,
    phone: c.phone,
    whatsapp: c.whatsapp,
    email: c.email,
    lat: c.latitude,
    lng: c.longitude,
    latitude: c.latitude,
    longitude: c.longitude,
    workingHours: c.workingHours,
    services: c.services ? String(c.services).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    isActive: !!c.isActive,
    sortOrder: c.sortOrder || 0,
  };
}

export function registerShippingRoutes(ctx: AppContext) {
  const { app, db, io, sendNotification, sendInternalMessage } = ctx;

  // ── Shipping Centers (public) ──────────────────────────────
  app.get('/api/shipping-centers', (req, res) => {
    try {
      const rows: any[] = db.prepare(`SELECT * FROM shipping_centers WHERE isActive = 1 ORDER BY sortOrder ASC, country ASC, city ASC`).all();
      res.json(rows.map(mapCenterRow));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/shipping-centers/nearest', (req, res) => {
    try {
      const lat = parseFloat(String(req.query.lat));
      const lng = parseFloat(String(req.query.lng));
      const limit = Math.max(1, Math.min(20, parseInt(String(req.query.limit || '3'), 10)));
      if (!isFinite(lat) || !isFinite(lng)) {
        return res.status(400).json({ error: 'lat/lng مطلوبان' });
      }
      const rows: any[] = db.prepare(`SELECT * FROM shipping_centers WHERE isActive = 1`).all();
      const withDist = rows
        .map(r => ({ ...mapCenterRow(r), distance: haversineDistance(lat, lng, r.latitude, r.longitude) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map(c => ({ ...c, distance: Math.round(c.distance * 10) / 10 }));
      res.json({ userLocation: { lat, lng }, centers: withDist });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // ── Shipping Centers (admin) ───────────────────────────────
  app.post('/api/admin/shipping-centers', requireAdmin, (req, res) => {
    try {
      const b = req.body || {};
      if (!b.name || !b.country || !b.city || b.latitude == null || b.longitude == null) {
        return res.status(400).json({ error: 'الحقول المطلوبة: name, country, city, latitude, longitude' });
      }
      const id = b.id || `sc-${Date.now()}`;
      const services = Array.isArray(b.services) ? b.services.join(',') : (b.services || '');
      db.prepare(`INSERT INTO shipping_centers (id, name, nameEn, country, countryCode, city, address, phone, whatsapp, email, latitude, longitude, workingHours, services, isActive, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, b.name, b.nameEn || null, b.country, b.countryCode || null, b.city, b.address || null, b.phone || null, b.whatsapp || null, b.email || null, Number(b.latitude), Number(b.longitude), b.workingHours || null, services, b.isActive === false ? 0 : 1, Number(b.sortOrder) || 0);
      const row: any = db.prepare(`SELECT * FROM shipping_centers WHERE id = ?`).get(id);
      res.json(mapCenterRow(row));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/admin/shipping-centers/:id', requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const existing: any = db.prepare(`SELECT * FROM shipping_centers WHERE id = ?`).get(id);
      if (!existing) return res.status(404).json({ error: 'المركز غير موجود' });
      const b = req.body || {};
      const services = Array.isArray(b.services) ? b.services.join(',') : (b.services ?? existing.services);
      db.prepare(`UPDATE shipping_centers SET name = ?, nameEn = ?, country = ?, countryCode = ?, city = ?, address = ?, phone = ?, whatsapp = ?, email = ?, latitude = ?, longitude = ?, workingHours = ?, services = ?, isActive = ?, sortOrder = ? WHERE id = ?`).run(
        b.name ?? existing.name,
        b.nameEn ?? existing.nameEn,
        b.country ?? existing.country,
        b.countryCode ?? existing.countryCode,
        b.city ?? existing.city,
        b.address ?? existing.address,
        b.phone ?? existing.phone,
        b.whatsapp ?? existing.whatsapp,
        b.email ?? existing.email,
        b.latitude != null ? Number(b.latitude) : existing.latitude,
        b.longitude != null ? Number(b.longitude) : existing.longitude,
        b.workingHours ?? existing.workingHours,
        services,
        b.isActive == null ? existing.isActive : (b.isActive ? 1 : 0),
        b.sortOrder != null ? Number(b.sortOrder) : existing.sortOrder,
        id,
      );
      const row: any = db.prepare(`SELECT * FROM shipping_centers WHERE id = ?`).get(id);
      res.json(mapCenterRow(row));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete('/api/admin/shipping-centers/:id', requireAdmin, (req, res) => {
    try {
      const { id } = req.params;
      const existing: any = db.prepare(`SELECT id FROM shipping_centers WHERE id = ?`).get(id);
      if (!existing) return res.status(404).json({ error: 'المركز غير موجود' });
      db.prepare(`UPDATE shipping_centers SET isActive = 0 WHERE id = ?`).run(id);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

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
