/**
 * Share module — crawler-proof link previews for social sharing.
 *
 * Why: the SPA pages (/car-details/:id, /transit-car/:id) get their OG tags
 * injected by carDetailsOgMiddleware — but ONLY when the page request
 * actually reaches Node. On the VPS, Apache fronts the app and may serve
 * the static SPA shell itself, so WhatsApp/Facebook crawlers saw the
 * generic homepage card (no car photo, no price).
 *
 * /api/* is always proxied to Node (the whole site depends on it), so this
 * endpoint is guaranteed to work behind any proxy config:
 *
 *   GET /api/share/car/:id
 *     → standalone HTML: full OG/Twitter tags for THIS car (photo, price,
 *       damage/condition, ETA for transit cars) + instant redirect that
 *       sends human visitors to the real SPA page.
 *
 * Share buttons link here; crawlers read the tags, humans never notice.
 */
import type { AppContext } from '../lib/types.ts';

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

function firstImage(images: any): string | undefined {
  try {
    const arr = typeof images === 'string' ? JSON.parse(images || '[]') : images;
    if (Array.isArray(arr) && arr.length && typeof arr[0] === 'string') return arr[0];
  } catch { /* ignore */ }
  return undefined;
}

function absUrl(u: string | undefined, base: string): string {
  const b = base.replace(/\/+$/, '');
  if (!u) return `${b}/icons/icon-512.png`;
  if (/^https?:\/\//i.test(u)) return u;
  return u.startsWith('/') ? `${b}${u}` : `${b}/${u}`;
}

export function registerShareRoutes(ctx: AppContext) {
  const { app, db, SITE_URL } = ctx as any;
  const base = String(SITE_URL || 'https://www.autopro.ac').replace(/\/+$/, '');

  app.get('/api/share/car/:id', (req: any, res: any) => {
    let car: any;
    try {
      car = db.prepare(
        `SELECT id, make, model, year, trim, images, currency, currentBid,
                startingBid, buyItNow, odometer, primaryDamage, runsDrives,
                titleType, status, winnerId, transitEta, transitDestination
           FROM cars WHERE id = ?`
      ).get(String(req.params.id || ''));
    } catch { /* fall through */ }
    if (!car) return res.redirect(302, `${base}/marketplace`);

    const isTransit = car.status === 'in_transit';
    const landing = isTransit ? `${base}/transit-car/${car.id}` : `${base}/car-details/${car.id}`;
    const selfUrl = `${base}/api/share/car/${car.id}`;

    const title = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim() || 'سيارة في AutoPro';
    const fullTitle = `${title} — AutoPro Libya | أوتو برو`;
    const currency = car.currency === 'LYD' ? 'د.ل' : '$';
    const price = Number(isTransit ? (car.buyItNow || 0) : (car.currentBid || car.startingBid || car.buyItNow || 0));
    const priceText = price > 0 ? ` — السعر ${currency} ${price.toLocaleString('en-US')}` : '';
    const damage = car.primaryDamage ? ` · الضرر: ${car.primaryDamage}` : '';
    const runs = car.runsDrives ? ` · الحالة: ${car.runsDrives}` : '';
    let desc: string;
    if (isTransit) {
      const eta = car.transitEta
        ? ` تصل ${new Date(car.transitEta).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' })}.`
        : '';
      desc = car.winnerId
        ? `⚓ ${title} — بيعت وهي في البحر!${eta} تصفّح بقية السيارات القادمة على AutoPro Libya.`
        : `⚓ ${title} قادمة في الطريق إلى ${car.transitDestination || 'ليبيا'}${priceText}${damage}${runs}.${eta} اشترِها الآن وهي في البحر!`;
    } else {
      desc = `🚗 ${title}${priceText}${damage}${runs} — تصفّح التفاصيل وقدّم عرضك على AutoPro Libya.`;
    }
    const image = absUrl(firstImage(car.images), base);

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="أوتو برو | AutoPro" />
  <meta property="og:title" content="${esc(fullTitle)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:secure_url" content="${esc(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(title)}" />
  <meta property="og:url" content="${esc(selfUrl)}" />
  <meta property="product:price:amount" content="${price}" />
  <meta property="product:price:currency" content="${car.currency === 'LYD' ? 'LYD' : 'USD'}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(fullTitle)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta http-equiv="refresh" content="0;url=${esc(landing)}" />
  <script>window.location.replace(${JSON.stringify(landing)});</script>
</head>
<body style="font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;text-align:center;padding:60px 20px;">
  <p style="font-weight:bold;">جارٍ فتح صفحة السيارة...</p>
  <a href="${esc(landing)}" style="color:#f97316;font-weight:bold;">اضغط هنا إن لم تُفتح تلقائياً</a>
</body>
</html>`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  });
}
