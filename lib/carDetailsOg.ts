/**
 * Server-side renders <meta property="og:..."> tags into the SPA shell
 * when a social-media crawler (or anyone) requests /car-details/:id.
 *
 * Why: the SPA is client-rendered, so Facebook / WhatsApp / Twitter
 * crawlers — which don't run JS — would otherwise see the generic
 * homepage og:image and og:title, and link previews looked the same
 * for every car. Now each car gets its own image + headline + price.
 *
 *   /car-details/:id            → custom OG (HTML response)
 *   /car-details/:id (no car)   → falls through to the SPA catch-all
 *   any other path              → not handled here
 */
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';

interface MinimalCar {
  id: string;
  make?: string;
  model?: string;
  year?: number | string;
  images?: any;
  currency?: string;
  currentBid?: number;
  startingBid?: number;
  buyItNow?: number;
  odometer?: number;
  primaryDamage?: string;
  runsDrives?: string;
  status?: string;
  transitEta?: string;
  winnerId?: string;
}

function clean(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

function absoluteImageUrl(img: string | undefined, siteUrl: string): string {
  if (!img) return `${siteUrl.replace(/\/$/, '')}/icons/icon-512.png`;
  if (img.startsWith('http://') || img.startsWith('https://')) return img;
  if (img.startsWith('/')) return `${siteUrl.replace(/\/$/, '')}${img}`;
  return `${siteUrl.replace(/\/$/, '')}/${img}`;
}

function pickFirstImage(images: any): string | undefined {
  try {
    const arr = typeof images === 'string' ? JSON.parse(images || '[]') : images;
    if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string') return arr[0];
  } catch { /* ignore */ }
  return undefined;
}

function buildCarOgHtml(car: MinimalCar, html: string, siteUrl: string, pathPrefix: string = 'car-details'): string {
  const title = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim() || 'سيارة في AutoPro';
  const isTransit = car.status === 'in_transit';
  const price = Number(isTransit ? (car.buyItNow || 0) : (car.currentBid || car.startingBid || car.buyItNow || 0));
  const currency = car.currency === 'LYD' ? 'د.ل' : '$';
  const priceText = price > 0 ? ` — السعر ${currency} ${price.toLocaleString('en-US')}` : '';
  const damage = car.primaryDamage && car.primaryDamage !== 'بدون ضرر' ? ` · ${car.primaryDamage}` : '';
  const odo = car.odometer ? ` · ${Number(car.odometer).toLocaleString('en-US')} ميل` : '';
  // In-transit cars get a promo-flavored description: at-sea purchase + ETA.
  let desc: string;
  if (isTransit) {
    const eta = car.transitEta
      ? ` تصل ${new Date(car.transitEta).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' })}.`
      : '';
    const cond = [
      car.runsDrives ? `الحالة: ${car.runsDrives}` : '',
      car.primaryDamage ? `الضرر: ${car.primaryDamage}` : '',
    ].filter(Boolean).join(' · ');
    desc = car.winnerId
      ? `⚓ ${title} — بيعت وهي في البحر!${eta} تصفّح بقية السيارات القادمة على AutoPro Libya.`
      : `⚓ ${title} قادمة في الطريق إلى ليبيا${priceText}${cond ? ' · ' + cond : ''}.${eta} اشترِها الآن وهي في البحر على AutoPro Libya!`;
  } else {
    desc = `${title}${priceText}${damage}${odo} — تصفّح التفاصيل وقدّم عرضك على AutoPro Libya.`;
  }

  const image = absoluteImageUrl(pickFirstImage(car.images), siteUrl);
  const url = `${siteUrl.replace(/\/$/, '')}/${pathPrefix}/${car.id}`;
  const fullTitle = `${title} — AutoPro Libya | أوتو برو`;

  // Strip the existing og:* and twitter:* tags + the <title>, then inject
  // car-specific ones. Plain string replace is safer than parsing here.
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${clean(fullTitle)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i,
      `<meta name="description" content="${clean(desc)}" />`)
    .replace(/<meta\s+property="og:title"[^>]*>/i,
      `<meta property="og:title" content="${clean(fullTitle)}" />`)
    .replace(/<meta\s+property="og:description"[^>]*>/i,
      `<meta property="og:description" content="${clean(desc)}" />`)
    .replace(/<meta\s+property="og:image"[^>]*>/i,
      `<meta property="og:image" content="${clean(image)}" />`)
    .replace(/<meta\s+property="og:url"[^>]*>/i,
      `<meta property="og:url" content="${clean(url)}" />`)
    .replace(/<meta\s+name="twitter:title"[^>]*>/i,
      `<meta name="twitter:title" content="${clean(fullTitle)}" />`)
    .replace(/<meta\s+name="twitter:description"[^>]*>/i,
      `<meta name="twitter:description" content="${clean(desc)}" />`)
    .replace(/<meta\s+name="twitter:image"[^>]*>/i,
      `<meta name="twitter:image" content="${clean(image)}" />`);

  // Add og:type=product + secure image variant + dimensions for richer previews.
  const extras = `
  <meta property="og:type" content="product" />
  <meta property="og:image:secure_url" content="${clean(image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${clean(title)}" />
  <meta property="product:price:amount" content="${price}" />
  <meta property="product:price:currency" content="${car.currency === 'LYD' ? 'LYD' : 'USD'}" />
`;
  out = out.replace('</head>', `${extras}</head>`);

  return out;
}

/**
 * Express middleware. Mount BEFORE express.static / catch-all.
 *   app.use(carDetailsOgMiddleware({ db, siteUrl, distPath, srcIndexPath }))
 */
export function carDetailsOgMiddleware(opts: {
  db: any;
  siteUrl: string;
  distPath?: string;
  srcIndexPath?: string;
}) {
  const { db, siteUrl } = opts;
  // Cache the shell HTML in memory; cars come from DB per-request.
  let cachedShell: string | null = null;
  function loadShell(): string {
    if (cachedShell) return cachedShell;
    const candidates = [
      opts.distPath ? path.join(opts.distPath, 'index.html') : null,
      opts.srcIndexPath || null,
    ].filter(Boolean) as string[];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          cachedShell = fs.readFileSync(p, 'utf8');
          return cachedShell;
        }
      } catch { /* ignore */ }
    }
    return ''; // SPA catch-all will handle it
  }

  // Also covers /transit-car/:id so shared "قادمة في الطريق" links show the
  // car photo + at-sea price + ETA on WhatsApp/Facebook/Telegram/Twitter.
  const re = /^\/(car-details|transit-car)\/([^/?#]+)/;

  return function handle(req: Request, res: Response, next: NextFunction) {
    if (req.method !== 'GET') return next();
    const m = req.path.match(re);
    if (!m) return next();
    const pathPrefix = m[1];
    const id = decodeURIComponent(m[2]);
    if (!id) return next();

    let car: MinimalCar | undefined;
    try {
      car = db.prepare(
        `SELECT id, make, model, year, images, currency, currentBid, startingBid,
                buyItNow, odometer, primaryDamage, runsDrives, status, transitEta, winnerId
           FROM cars WHERE id = ?`
      ).get(id) as MinimalCar | undefined;
    } catch { /* ignore — fall through */ }

    if (!car) return next();

    const shell = loadShell();
    if (!shell) return next();

    const html = buildCarOgHtml(car, shell, siteUrl, pathPrefix);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(html);
  };
}

// Expose for testing
export const _internal = { buildCarOgHtml, pickFirstImage, absoluteImageUrl, clean };
