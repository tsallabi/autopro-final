/**
 * Transit-cars module — "قادمة في الطريق" (cars purchased from auctions in
 * the US that are still on the boat to Libya).
 *
 * Design contract: cars with status='in_transit' are FULLY EXCLUDED from
 * every automatic auction loop (ticker, scheduler, watchdog, session
 * attachment, freeOrphanCars). They only enter the auction cycle when an
 * admin explicitly clicks "Move to auction" — at which point they flip to
 * 'pending' or 'upcoming' and rejoin the normal flow.
 *
 * Schema additions (all idempotent):
 *   cars.transitEta           — ISO date (when it should arrive)
 *   cars.transitOrigin        — "Newark, NJ"
 *   cars.transitDestination   — "ميناء طرابلس"
 *   cars.transitVessel        — ship name
 *   cars.transitContainer     — container number
 *   cars.transitTrackingUrl   — public tracking link
 *
 *   transit_interests         — one row per (carId, userId) when a buyer
 *                               clicks "احجز مقعدك". Notified=1 once the
 *                               car arrives so we don't spam them twice.
 *
 * Endpoints:
 *   GET    /api/cars/transit                — public, list all in-transit
 *   GET    /api/cars/transit/:id            — public, detail
 *   POST   /api/cars/:id/express-interest   — auth, add to my watchlist
 *   DELETE /api/cars/:id/express-interest   — auth, remove
 *   GET    /api/user/:id/transit-interests  — owner-or-admin
 *   POST   /api/admin/cars/transit          — admin, create a new in_transit car
 *   POST   /api/admin/cars/:id/move-to-auction — admin, flip in_transit → upcoming
 */
import { requireAuth, requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export const TRANSIT_STATUS = 'in_transit';

export function ensureTransitSchema(db: any): void {
  try { db.exec("ALTER TABLE cars ADD COLUMN transitEta TEXT"); } catch {}
  try { db.exec("ALTER TABLE cars ADD COLUMN transitOrigin TEXT"); } catch {}
  try { db.exec("ALTER TABLE cars ADD COLUMN transitDestination TEXT"); } catch {}
  try { db.exec("ALTER TABLE cars ADD COLUMN transitVessel TEXT"); } catch {}
  try { db.exec("ALTER TABLE cars ADD COLUMN transitContainer TEXT"); } catch {}
  try { db.exec("ALTER TABLE cars ADD COLUMN transitTrackingUrl TEXT"); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS transit_interests (
      id TEXT PRIMARY KEY,
      carId TEXT NOT NULL,
      userId TEXT NOT NULL,
      message TEXT,
      expressedAt TEXT,
      notified INTEGER DEFAULT 0,
      UNIQUE(carId, userId)
    )
  `);
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_transit_interests_carId ON transit_interests(carId)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_transit_interests_userId ON transit_interests(userId)"); } catch {}
  try { db.exec("CREATE INDEX IF NOT EXISTS idx_cars_status_transit ON cars(status)"); } catch {}
}

function rowToCar(r: any): any {
  if (!r) return r;
  let images: any[] = [];
  try {
    images = typeof r.images === 'string' ? JSON.parse(r.images) : (r.images || []);
    if (!Array.isArray(images)) images = [];
  } catch { images = []; }
  return {
    id: r.id,
    lot: r.lot,
    vin: r.vin,
    make: r.make,
    model: r.model,
    year: r.year,
    trim: r.trim,
    odometer: r.odometer,
    color: r.color,
    fuel: r.fuel,
    transmission: r.transmission,
    images,
    description: r.description,
    status: r.status,
    currentBid: r.currentBid || 0,
    buyItNow: r.buyItNow || 0,
    transitEta: r.transitEta,
    transitOrigin: r.transitOrigin,
    transitDestination: r.transitDestination,
    transitVessel: r.transitVessel,
    transitContainer: r.transitContainer,
    transitTrackingUrl: r.transitTrackingUrl,
  };
}

export function registerTransitRoutes(ctx: AppContext) {
  const { app, db, sendNotification, sendInternalMessage, sendEmail } = ctx as any;

  ensureTransitSchema(db);
  console.log('[transit] schema ready');

  // ── PUBLIC: list in-transit cars ──────────────────────────────────────
  app.get('/api/cars/transit', (_req: any, res: any) => {
    try {
      const rows: any[] = db.prepare(
        `SELECT id, lot, vin, make, model, year, trim, odometer, color, fuel,
                transmission, images, description, status, currentBid, buyItNow,
                transitEta, transitOrigin, transitDestination,
                transitVessel, transitContainer, transitTrackingUrl
           FROM cars
          WHERE status = ?
          ORDER BY COALESCE(transitEta, '9999') ASC, year DESC`
      ).all(TRANSIT_STATUS);

      // Count interests per car (so the card can show "X بانتظار وصولها")
      const counts = new Map<string, number>();
      try {
        const cs: any[] = db.prepare(
          "SELECT carId, COUNT(*) AS c FROM transit_interests GROUP BY carId"
        ).all();
        cs.forEach(c => counts.set(c.carId, c.c));
      } catch {}

      const items = rows.map(r => ({ ...rowToCar(r), interestCount: counts.get(r.id) || 0 }));
      res.json({ items, count: items.length });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  // ── PUBLIC: single transit car ────────────────────────────────────────
  app.get('/api/cars/transit/:id', (req: any, res: any) => {
    try {
      const row: any = db.prepare(
        "SELECT * FROM cars WHERE id = ? AND status = ?"
      ).get(req.params.id, TRANSIT_STATUS);
      if (!row) return res.status(404).json({ error: 'لم نعثر على سيارة في الطريق بهذا الرقم' });
      const interestCount = (db.prepare(
        "SELECT COUNT(*) AS c FROM transit_interests WHERE carId = ?"
      ).get(row.id) as any)?.c || 0;
      res.json({ ...rowToCar(row), interestCount });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  // ── AUTH: express interest in a transit car ───────────────────────────
  app.post('/api/cars/:id/express-interest', requireAuth, (req: any, res: any) => {
    const carId = req.params.id;
    const userId = req.user?.id;
    const message = (req.body?.message || '').toString().slice(0, 500);
    try {
      const car: any = db.prepare(
        "SELECT id, make, model, year FROM cars WHERE id = ? AND status = ?"
      ).get(carId, TRANSIT_STATUS);
      if (!car) return res.status(404).json({ error: 'هذه السيارة ليست في قائمة "قادمة في الطريق"' });

      const id = `tx-int-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        db.prepare(
          `INSERT INTO transit_interests (id, carId, userId, message, expressedAt, notified)
           VALUES (?, ?, ?, ?, ?, 0)`
        ).run(id, carId, userId, message, new Date().toISOString());
      } catch (e: any) {
        // UNIQUE(carId, userId) — already interested, treat as success.
        if (String(e?.message || '').includes('UNIQUE')) {
          return res.json({ ok: true, alreadyInterested: true });
        }
        throw e;
      }

      // Notify the user that we recorded it.
      try {
        sendNotification(userId, '🔔 سجّلنا اهتمامك',
          `سنُعلمك فور وصول ${car.year} ${car.make} ${car.model} — لك أولوية المزايدة قبل الجمهور.`,
          'success', `/marketplace?tab=transit`);
      } catch {}

      res.json({ ok: true, alreadyInterested: false });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'فشل تسجيل الاهتمام' });
    }
  });

  // ── AUTH: remove interest ─────────────────────────────────────────────
  app.delete('/api/cars/:id/express-interest', requireAuth, (req: any, res: any) => {
    try {
      const r = db.prepare(
        "DELETE FROM transit_interests WHERE carId = ? AND userId = ?"
      ).run(req.params.id, req.user.id);
      res.json({ ok: true, removed: r.changes });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  // ── AUTH: my transit interests (for the user dashboard) ───────────────
  app.get('/api/user/:id/transit-interests', requireAuth, (req: any, res: any) => {
    const targetId = req.params.id;
    if (req.user.id !== targetId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'غير مصرح' });
    }
    try {
      const rows: any[] = db.prepare(
        `SELECT ti.id AS interestId, ti.expressedAt, ti.notified, ti.message,
                c.id, c.lot, c.make, c.model, c.year, c.images,
                c.status, c.transitEta, c.transitVessel
           FROM transit_interests ti
           LEFT JOIN cars c ON c.id = ti.carId
          WHERE ti.userId = ?
          ORDER BY ti.expressedAt DESC`
      ).all(targetId);
      res.json({
        items: rows.map(r => ({
          ...rowToCar(r),
          interestId: r.interestId,
          expressedAt: r.expressedAt,
          notified: !!r.notified,
          message: r.message,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message });
    }
  });

  // ── ADMIN: create a new in_transit car ───────────────────────────────
  app.post('/api/admin/cars/transit', requireAdmin, (req: any, res: any) => {
    try {
      const {
        lot, vin, make, model, year, trim, odometer, color, fuel,
        transmission, images, description, buyItNow,
        transitEta, transitOrigin, transitDestination,
        transitVessel, transitContainer, transitTrackingUrl,
      } = req.body || {};

      if (!make || !model || !year) {
        return res.status(400).json({ error: 'الماركة والموديل والسنة مطلوبة' });
      }
      const id = `car-tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const imagesJson = JSON.stringify(Array.isArray(images) ? images : []);

      db.prepare(
        `INSERT INTO cars (
          id, lot, vin, make, model, year, trim, odometer, color, fuel,
          transmission, images, description, status, currentBid, buyItNow,
          transitEta, transitOrigin, transitDestination,
          transitVessel, transitContainer, transitTrackingUrl
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id, lot || '', vin || '', make, model, Number(year), trim || '',
        Number(odometer) || 0, color || '', fuel || '', transmission || '',
        imagesJson, description || '',
        TRANSIT_STATUS, Number(buyItNow) || 0,
        transitEta || null, transitOrigin || '', transitDestination || 'ميناء طرابلس',
        transitVessel || '', transitContainer || '', transitTrackingUrl || ''
      );

      const row: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(id);
      res.json({ ok: true, car: rowToCar(row) });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'فشل إنشاء السيارة' });
    }
  });

  // ── ADMIN: move an in_transit car into the auction cycle ─────────────
  app.post('/api/admin/cars/:id/move-to-auction', requireAdmin, (req: any, res: any) => {
    const carId = req.params.id;
    const { auctionStartTime, durationMinutes } = req.body || {};
    try {
      const car: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      if (!car) return res.status(404).json({ error: 'لم نعثر على السيارة' });
      if (car.status !== TRANSIT_STATUS) {
        return res.status(400).json({ error: `السيارة ليست "في الطريق" (الحالة الحالية: ${car.status})` });
      }

      let nextStatus = 'pending';
      let startISO: string | null = null;
      let endISO: string | null = null;

      if (auctionStartTime) {
        startISO = new Date(auctionStartTime).toISOString();
        nextStatus = 'upcoming';
        const dur = Math.max(1, Number(durationMinutes) || 30);
        endISO = new Date(new Date(startISO).getTime() + dur * 60_000).toISOString();
      }

      db.prepare(
        `UPDATE cars
            SET status = ?, auctionStartTime = ?, auctionEndDate = ?,
                currentBid = 0, winnerId = NULL
          WHERE id = ?`
      ).run(nextStatus, startISO, endISO, carId);

      // Notify everyone who expressed interest.
      let notifiedCount = 0;
      try {
        const interested: any[] = db.prepare(
          "SELECT userId FROM transit_interests WHERE carId = ? AND notified = 0"
        ).all(carId);
        const carName = `${car.year} ${car.make} ${car.model}`;
        const link = `/car-details/${carId}`;
        for (const i of interested) {
          try {
            sendNotification(i.userId, '🚢 وصلت السيارة التي تنتظرها!',
              `${carName} وصلت ودخلت دورة المزاد. لك أولوية المزايدة — افتح صفحة السيارة الآن.`,
              'success', link);
          } catch {}
          try {
            sendInternalMessage('admin-1', i.userId,
              '🚢 السيارة التي حجزت مقعدها وصلت — جاهزة للمزايدة',
              `مرحباً،\n\nالسيارة التي سجّلت اهتمامك بها (${carName}) وصلت إلى ${car.transitDestination || 'ليبيا'} ودخلت دورة المزاد.\n\n• الحالة الجديدة: ${nextStatus === 'upcoming' ? 'قريباً (مجدولة)' : 'بانتظار اعتماد المدير'}\n${startISO ? '• تبدأ المزايدة: ' + new Date(startISO).toLocaleString('ar-LY') : ''}\n\nرابط السيارة: ${link}\n\nأنت من ضمن المهتمين الأوائل — استفد من ذلك!\n\nفريق AutoPro Libya 🚗`,
              'auction_alert');
          } catch {}
          notifiedCount++;
        }
        if (interested.length) {
          db.prepare("UPDATE transit_interests SET notified = 1 WHERE carId = ?").run(carId);
        }
      } catch (e: any) {
        console.error('[transit] notify-on-arrival failed:', e?.message);
      }

      const updated: any = db.prepare("SELECT * FROM cars WHERE id = ?").get(carId);
      res.json({
        ok: true,
        car: rowToCar(updated),
        notifiedCount,
        message: `تم نقل السيارة إلى دورة المزاد (${nextStatus}). أُبلِغ ${notifiedCount} مهتم.`,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'فشل النقل' });
    }
  });
}
