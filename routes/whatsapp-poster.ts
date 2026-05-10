/**
 * WhatsApp Channel Poster — admin tool for AutoPro Libya.
 *
 * Lets the admin pick an active car and instantly get a ready-to-paste
 * post for WhatsApp Channels (channel + status). The output includes:
 *   - A formatted Arabic message body (with emojis + car details).
 *   - The hero image URL (admin downloads + reattaches in WhatsApp).
 *   - A direct deep-link to the car page.
 *   - A "wa.me" share URL that opens WhatsApp with the message pre-filled.
 *
 * It also supports a "Deal of the Day" picker: a single, highlighted car
 * we want to promote across the day.
 *
 *   GET  /api/admin/whatsapp/cars            — list active cars to choose
 *   POST /api/admin/whatsapp/generate        — body: { carId, style? } → post
 *   GET  /api/admin/whatsapp/deal-of-day     — current deal car (public-safe)
 *   POST /api/admin/whatsapp/deal-of-day     — admin sets carId for the day
 *   POST /api/admin/whatsapp/log             — body: { carId, channel } log
 *
 * Schema (idempotent):
 *   site_settings rows: 'deal_of_day_car_id', 'deal_of_day_set_at'
 *   whatsapp_post_log table for analytics
 *
 * Real cars columns used: auctionEndDate, auctionStartTime, currentBid,
 * reservePrice, status (one of: upcoming, live, ultimo, pending_seller,
 * offer_market, closed). Do NOT use endTime / startingPrice — those
 * columns don't exist.
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

const STYLES = ['default', 'deal', 'urgent', 'new'] as const;
type Style = (typeof STYLES)[number];

const ARABIC_HEADERS: Record<Style, string> = {
  default: '🚗 *مزاد جديد على أوتوبرو*',
  deal:    '🔥 *عرض اليوم — لا يفوّت!*',
  urgent:  '⏰ *آخر فرصة — المزاد ينتهي قريبًا!*',
  new:     '✨ *سيارة جديدة وصلت للمزاد*',
};

const HASHTAGS = '#أوتوبرو #سيارات_ليبيا #مزاد_السيارات #AutoPro';

function ensureWhatsAppSchema(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_post_log (
      id TEXT PRIMARY KEY,
      carId TEXT,
      channel TEXT,
      style TEXT,
      postedBy TEXT,
      postedAt TEXT
    )
  `);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_wa_log_postedAt ON whatsapp_post_log(postedAt)`); } catch {}
  // site_settings is shared with deal-of-day. Both modules ensure it
  // exists at registration so neither one breaks if the other isn't
  // registered first.
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key   TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  } catch (e: any) {
    console.error('[whatsapp-poster] failed to ensure site_settings table:', e?.message);
  }
}

function getSetting(db: any, key: string): string | null {
  try {
    const row: any = db.prepare("SELECT value FROM site_settings WHERE key = ?").get(key);
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function setSetting(db: any, key: string, value: string): void {
  try {
    db.prepare(`
      INSERT INTO site_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  } catch (e: any) {
    console.error('[wa-poster] setSetting failed:', e?.message);
  }
}

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return '$' + v.toLocaleString('en-US');
}

function fmtDeadline(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function buildPostText(car: any, style: Style, siteUrl: string): string {
  const header = ARABIC_HEADERS[style] || ARABIC_HEADERS.default;
  const title = [car.year, car.make, car.model].filter(Boolean).join(' ') || 'سيارة';
  const lot = car.lotNumber || car.id || '—';
  const currentBid = fmtMoney(car.currentBid || car.reservePrice);
  const deadline = fmtDeadline(car.auctionEndDate);
  const link = `${siteUrl.replace(/\/$/, '')}/car/${encodeURIComponent(lot)}`;

  const lines: string[] = [];
  lines.push(header);
  lines.push('━━━━━━━━━━━━━━━━━━');
  lines.push('');
  lines.push(`📋 *${title}*`);
  lines.push(`🏷️ رقم اللوت: ${lot}`);
  if (car.vin) lines.push(`🔖 VIN: ${car.vin}`);
  if (car.mileage) lines.push(`🛣️ المسافة: ${Number(car.mileage).toLocaleString('en-US')} ميل`);
  lines.push(`💰 السعر الحالي: ${currentBid}`);
  if (deadline !== '—') lines.push(`⏰ ينتهي المزاد: ${deadline}`);
  lines.push('');
  lines.push(`🔗 سجّل وقدّم عرضك:`);
  lines.push(link);
  lines.push('');
  lines.push(HASHTAGS);
  return lines.join('\n');
}

function pickHeroImage(car: any): string | null {
  // images may be stored as JSON array, comma-separated, or a single field.
  const candidates: string[] = [];
  if (typeof car.images === 'string' && car.images.trim()) {
    try {
      const arr = JSON.parse(car.images);
      if (Array.isArray(arr)) candidates.push(...arr.filter((x: any) => typeof x === 'string'));
    } catch {
      candidates.push(...car.images.split(',').map((s: string) => s.trim()).filter(Boolean));
    }
  }
  if (Array.isArray(car.images)) candidates.push(...car.images);
  if (car.imageUrl) candidates.push(car.imageUrl);
  if (car.image) candidates.push(car.image);
  if (car.photo) candidates.push(car.photo);
  return candidates[0] || null;
}

export function registerWhatsAppPosterRoutes(ctx: AppContext) {
  const { app, db, SITE_URL } = ctx as any;

  ensureWhatsAppSchema(db);
  const siteUrl: string = SITE_URL || 'https://autopro.ac';

  // ── GET /api/admin/whatsapp/cars ──────────────────────────────────────
  app.get('/api/admin/whatsapp/cars', requireAdmin, (_req: any, res: any) => {
    try {
      const rows: any[] = db.prepare(`
        SELECT id, lotNumber, vin, make, model, year, mileage,
               currentBid, reservePrice, auctionEndDate, auctionStartTime,
               images, imageUrl, status
          FROM cars
         WHERE COALESCE(status, 'upcoming') IN ('upcoming', 'live', 'ultimo', 'pending_seller', 'offer_market')
         ORDER BY COALESCE(auctionStartTime, auctionEndDate) ASC
         LIMIT 100
      `).all();
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: 'فشل جلب قائمة السيارات: ' + (e?.message || e) });
    }
  });

  // ── POST /api/admin/whatsapp/generate ─────────────────────────────────
  // Body: { carId, style?: 'default'|'deal'|'urgent'|'new' }
  app.post('/api/admin/whatsapp/generate', requireAdmin, (req: any, res: any) => {
    const { carId } = req.body || {};
    const style: Style = (STYLES as readonly string[]).includes(req.body?.style)
      ? (req.body.style as Style)
      : 'default';
    if (!carId) return res.status(400).json({ error: 'carId مطلوب' });

    try {
      // Try id, lotNumber, vin
      const car: any =
        db.prepare('SELECT * FROM cars WHERE id = ?').get(carId) ||
        db.prepare('SELECT * FROM cars WHERE lotNumber = ?').get(carId) ||
        db.prepare('SELECT * FROM cars WHERE vin = ?').get(carId);
      if (!car) return res.status(404).json({ error: 'السيارة غير موجودة' });

      const text = buildPostText(car, style, siteUrl);
      const imageUrl = pickHeroImage(car);
      const lot = car.lotNumber || car.id;
      const carUrl = `${siteUrl.replace(/\/$/, '')}/car/${encodeURIComponent(lot)}`;
      const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

      res.json({
        text,
        imageUrl,
        carUrl,
        waUrl,
        style,
        car: {
          id: car.id,
          lotNumber: car.lotNumber,
          title: [car.year, car.make, car.model].filter(Boolean).join(' '),
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: 'فشل توليد المنشور: ' + (e?.message || e) });
    }
  });

  // ── GET /api/admin/whatsapp/deal-of-day ───────────────────────────────
  app.get('/api/admin/whatsapp/deal-of-day', requireAdmin, (_req: any, res: any) => {
    try {
      const carId = getSetting(db, 'deal_of_day_car_id');
      const setAt = getSetting(db, 'deal_of_day_set_at');
      if (!carId) return res.json({ carId: null, setAt: null, car: null });
      const car: any = db.prepare('SELECT * FROM cars WHERE id = ? OR lotNumber = ?').get(carId, carId);
      res.json({ carId, setAt, car: car || null });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/whatsapp/deal-of-day ──────────────────────────────
  app.post('/api/admin/whatsapp/deal-of-day', requireAdmin, (req: any, res: any) => {
    const { carId } = req.body || {};
    if (!carId) return res.status(400).json({ error: 'carId مطلوب' });
    try {
      const car: any = db.prepare('SELECT id, lotNumber FROM cars WHERE id = ? OR lotNumber = ?').get(carId, carId);
      if (!car) return res.status(404).json({ error: 'السيارة غير موجودة' });
      setSetting(db, 'deal_of_day_car_id', car.id);
      setSetting(db, 'deal_of_day_set_at', new Date().toISOString());
      res.json({ success: true, carId: car.id });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // ── POST /api/admin/whatsapp/log ──────────────────────────────────────
  // Frontend calls this after the admin clicks "I posted it" so we can
  // measure how often each car was promoted.
  app.post('/api/admin/whatsapp/log', requireAdmin, (req: any, res: any) => {
    const { carId, channel, style } = req.body || {};
    try {
      const id = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      db.prepare(`
        INSERT INTO whatsapp_post_log (id, carId, channel, style, postedBy, postedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, carId || null, channel || 'channel', style || 'default', req.user?.id || null, new Date().toISOString());
      res.json({ success: true, id });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
}
