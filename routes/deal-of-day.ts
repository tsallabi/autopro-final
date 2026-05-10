/**
 * Deal of the Day — public endpoint that exposes the car the admin pinned
 * via the WhatsApp Poster ("Pin as Deal of the Day" button).
 *
 *   GET /api/deal-of-day  →  { car, setAt }  or  { car: null }
 *
 * The pin itself is stored in site_settings (key='deal_of_day_car_id') by
 * the WhatsApp poster module — this route just reads it and joins to the
 * cars table so the homepage can render a hero card.
 *
 * Public, cached for 60 seconds. Returns 200 even when nothing is pinned.
 *
 * Schema note: real cars columns are auctionEndDate + auctionStartTime
 * + currentBid + reservePrice (NOT endTime/auctionEnd/startingPrice).
 */
import type { AppContext } from '../lib/types.ts';

let cache: { value: any; expiresAt: number } | null = null;
const TTL_MS = 60_000;

export function registerDealOfDayRoutes(ctx: AppContext) {
  const { app, db } = ctx as any;

  // Ensure the site_settings table exists. The whatsapp-poster module
  // writes to it (key='deal_of_day_car_id'), and we read from it here.
  // Idempotent — safe to run on every boot.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  } catch (e: any) {
    console.error('[deal-of-day] failed to ensure site_settings table:', e?.message);
  }

  app.get('/api/deal-of-day', (_req: any, res: any) => {
    if (cache && cache.expiresAt > Date.now()) {
      return res.json(cache.value);
    }
    try {
      const row: any = db.prepare(
        "SELECT value FROM site_settings WHERE key = 'deal_of_day_car_id'"
      ).get();
      const setAtRow: any = db.prepare(
        "SELECT value FROM site_settings WHERE key = 'deal_of_day_set_at'"
      ).get();
      const carId = row?.value || null;
      if (!carId) {
        const empty = { car: null, setAt: null };
        cache = { value: empty, expiresAt: Date.now() + TTL_MS };
        return res.json(empty);
      }

      const car: any = db.prepare(
        'SELECT id, lotNumber, vin, make, model, year, mileage, currentBid, reservePrice, auctionEndDate, auctionStartTime, images, imageUrl, description, status FROM cars WHERE id = ? OR lotNumber = ?'
      ).get(carId, carId);

      if (!car || ['deleted', 'archived', 'hidden', 'closed'].includes(String(car.status || '').toLowerCase())) {
        const empty = { car: null, setAt: null };
        cache = { value: empty, expiresAt: Date.now() + TTL_MS };
        return res.json(empty);
      }

      const result = { car, setAt: setAtRow?.value || null };
      cache = { value: result, expiresAt: Date.now() + TTL_MS };
      res.json(result);
    } catch (e: any) {
      console.error('[deal-of-day] failed:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  console.log('[deal-of-day] /api/deal-of-day ready');
}
