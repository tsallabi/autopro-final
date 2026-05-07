/**
 * SEO module — sitemap.xml + robots.txt + structured data helpers.
 *
 * Why this matters: Google won't crawl /car/:lot pages unless we either
 * server-render their HTML (we don't — it's a SPA) or expose a sitemap
 * pointing to every active auction. Sitemap is the cheap fix.
 *
 * Endpoints:
 *   GET /sitemap.xml          — full sitemap (homepage + cars + static pages)
 *   GET /sitemap-cars.xml     — just car listings (separate so Google fetches it more often)
 *   GET /robots.txt           — points to sitemap, allows everything
 *   GET /api/seo/json-ld/:lot — JSON-LD Product + Vehicle schema for one car
 *
 * Cached in-memory for 5 minutes so a Googlebot burst doesn't hammer the DB.
 *
 * NOTE on column names — actual cars schema uses:
 *   auctionEndDate, auctionStartTime, currentBid, reservePrice, status
 * (NOT endTime / startingPrice / auctionEnd).
 */
import type { AppContext } from '../lib/types.ts';

interface CacheEntry { value: string; expiresAt: number }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 5 * 60 * 1000;

function getCached(key: string): string | null {
  const e = cache.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) { cache.delete(key); return null; }
  return e.value;
}
function putCached(key: string, value: string) {
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const STATIC_ROUTES: { path: string; priority: number; changefreq: string }[] = [
  { path: '/',                  priority: 1.0, changefreq: 'daily' },
  { path: '/cars',              priority: 0.9, changefreq: 'hourly' },
  { path: '/auctions',          priority: 0.9, changefreq: 'hourly' },
  { path: '/calculator',        priority: 0.6, changefreq: 'monthly' },
  { path: '/about',             priority: 0.5, changefreq: 'monthly' },
  { path: '/contact',           priority: 0.5, changefreq: 'monthly' },
  { path: '/faq',               priority: 0.5, changefreq: 'monthly' },
  { path: '/auth',              priority: 0.4, changefreq: 'monthly' },
  { path: '/services',          priority: 0.5, changefreq: 'monthly' },
];

function pickHeroImage(car: any): string | null {
  if (typeof car.images === 'string' && car.images.trim()) {
    try {
      const arr = JSON.parse(car.images);
      if (Array.isArray(arr) && arr.length) return String(arr[0]);
    } catch {
      const first = car.images.split(',')[0].trim();
      if (first) return first;
    }
  }
  return car.imageUrl || car.image || null;
}

function buildCarsSitemap(db: any, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  let rows: any[] = [];
  try {
    rows = db.prepare(`
      SELECT id, lotNumber, make, model, year, currentBid, reservePrice,
             images, imageUrl, status, updatedAt
        FROM cars
       WHERE COALESCE(status, 'upcoming') NOT IN ('deleted', 'archived', 'hidden', 'closed')
       ORDER BY COALESCE(updatedAt, '') DESC
       LIMIT 5000
    `).all();
  } catch (e: any) {
    console.error('[seo] sitemap-cars query failed:', e?.message);
    rows = [];
  }

  const urls = rows.map((c) => {
    const lot = c.lotNumber || c.id;
    const url = `${base}/car/${encodeURIComponent(lot)}`;
    const lastmod = (c.updatedAt && /^\d{4}-\d{2}-\d{2}/.test(c.updatedAt))
      ? new Date(c.updatedAt).toISOString()
      : new Date().toISOString();
    const img = pickHeroImage(c);
    const imgBlock = img
      ? `\n    <image:image><image:loc>${escapeXml(img)}</image:loc></image:image>`
      : '';
    return `  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>${imgBlock}
  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

function buildRootSitemap(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  const today = new Date().toISOString();
  const staticUrls = STATIC_ROUTES.map((r) => `  <url>
    <loc>${escapeXml(base + r.path)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls}
  <url>
    <loc>${escapeXml(base + '/sitemap-cars.xml')}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>
</urlset>`;
}

function buildRobotsTxt(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return `# AutoPro Libya — robots.txt
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /admin/
Disallow: /seller-dashboard
Disallow: /buyer-dashboard
Disallow: /wallet
Disallow: /account

# Major search engines: full access
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: WhatsApp
Allow: /

Sitemap: ${base}/sitemap.xml
Sitemap: ${base}/sitemap-cars.xml
`;
}

function buildJsonLd(car: any, siteUrl: string): object {
  const base = siteUrl.replace(/\/$/, '');
  const lot = car.lotNumber || car.id;
  const url = `${base}/car/${encodeURIComponent(lot)}`;
  const title = [car.year, car.make, car.model].filter(Boolean).join(' ') || 'Car';
  const img = pickHeroImage(car);
  const price = Number(car.currentBid || car.reservePrice || 0);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description: car.description || `${title} - مزاد على أوتوبرو`,
    image: img || undefined,
    sku: lot,
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      price: price > 0 ? price : undefined,
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Organization', name: 'AutoPro Libya' },
    },
    additionalProperty: [
      car.year       && { '@type': 'PropertyValue', name: 'Year',     value: String(car.year) },
      car.make       && { '@type': 'PropertyValue', name: 'Make',     value: car.make },
      car.model      && { '@type': 'PropertyValue', name: 'Model',    value: car.model },
      car.vin        && { '@type': 'PropertyValue', name: 'VIN',      value: car.vin },
      car.mileage    && { '@type': 'PropertyValue', name: 'Mileage',  value: String(car.mileage) + ' mi' },
      car.lotNumber  && { '@type': 'PropertyValue', name: 'Lot',      value: car.lotNumber },
    ].filter(Boolean),
  };
}

export function registerSeoRoutes(ctx: AppContext) {
  const { app, db, SITE_URL } = ctx as any;
  const siteUrl: string = SITE_URL || 'https://autopro.ac';

  app.get('/robots.txt', (_req: any, res: any) => {
    res.type('text/plain').send(buildRobotsTxt(siteUrl));
  });

  app.get('/sitemap.xml', (_req: any, res: any) => {
    let xml = getCached('root');
    if (!xml) { xml = buildRootSitemap(siteUrl); putCached('root', xml); }
    res.type('application/xml').send(xml);
  });

  app.get('/sitemap-cars.xml', (_req: any, res: any) => {
    let xml = getCached('cars');
    if (!xml) { xml = buildCarsSitemap(db, siteUrl); putCached('cars', xml); }
    res.type('application/xml').send(xml);
  });

  app.get('/api/seo/json-ld/:lot', (req: any, res: any) => {
    const { lot } = req.params;
    try {
      const car: any =
        db.prepare('SELECT * FROM cars WHERE id = ?').get(lot) ||
        db.prepare('SELECT * FROM cars WHERE lotNumber = ?').get(lot) ||
        db.prepare('SELECT * FROM cars WHERE vin = ?').get(lot);
      if (!car) return res.status(404).json({ error: 'not found' });
      res.json(buildJsonLd(car, siteUrl));
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  console.log('[seo] sitemap.xml, sitemap-cars.xml, robots.txt, JSON-LD endpoints ready');
}
