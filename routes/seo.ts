/**
 * SEO / Open Graph route — emit per-car meta tags so links shared on
 * WhatsApp, Facebook, Twitter, Telegram show the car's photo and details
 * in the link preview.
 *
 * The frontend is a SPA (single index.html for every route), so we
 * intercept GET /car-details/:id BEFORE the static-file middleware,
 * read the car from the DB, and serve a copy of index.html with the
 * <head> rewritten to include car-specific og:* and twitter:* tags.
 *
 * Real users still get the full SPA — the body and script tags are
 * untouched, so React boots and renders normally.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AppContext } from '../lib/types.ts';

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeImages(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function absoluteUrl(siteUrl: string, raw: string | undefined | null): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('/')) return siteUrl.replace(/\/$/, '') + s;
  return siteUrl.replace(/\/$/, '') + '/' + s;
}

function findIndexHtml(): string | null {
  const candidates: string[] = [];
  if (process.env.DIST_DIR) candidates.push(path.join(process.env.DIST_DIR, 'index.html'));
  candidates.push(path.join(process.cwd(), 'dist', 'index.html'));
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.join(here, '..', 'dist', 'index.html'));
    candidates.push(path.join(here, '..', 'index.html'));
  } catch {}
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

export function registerSeoRoutes(ctx: AppContext) {
  const { app, db, SITE_URL } = ctx as any;
  const indexPath = findIndexHtml();
  if (!indexPath) {
    console.warn('[seo] index.html not found — Open Graph route disabled.');
    return;
  }
  console.log(`[seo] Open Graph route active (index: ${indexPath})`);

  app.get('/car-details/:id', (req: any, res: any, next: any) => {
    try {
      const car: any = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
      if (!car) return next();

      const images = safeImages(car.images);
      const heroImg = absoluteUrl(SITE_URL, images[0] || '/og-default.jpg');
      const title = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim() || 'سيارة في المزاد';
      const price = Number(car.currentBid || car.reservePrice || 0);
      const priceLabel = price > 0 ? ` — $${price.toLocaleString('en-US')}` : '';
      const fullTitle = `${title}${priceLabel} | AutoPro Auctions`;
      const description = (() => {
        const parts: string[] = [];
        parts.push(title);
        if (car.location) parts.push(`📍 ${car.location}`);
        if (price > 0) parts.push(`💰 $${price.toLocaleString('en-US')}`);
        if (car.lotNumber) parts.push(`🔖 Lot ${car.lotNumber}`);
        parts.push('انضم لمزاد AutoPro Libya وزايد الآن!');
        return parts.join(' • ');
      })();
      const url = `${SITE_URL.replace(/\/$/, '')}/car-details/${car.id}`;

      let html = fs.readFileSync(indexPath, 'utf8');

      const ogBlock = `
    <!-- Open Graph (auto-generated per car) -->
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(fullTitle)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${escapeHtml(heroImg)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${escapeHtml(url)}">
    <meta property="og:site_name" content="AutoPro Auctions">
    <meta property="og:locale" content="ar_LY">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(fullTitle)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(heroImg)}">
    <title>${escapeHtml(fullTitle)}</title>
  `;

      html = html
        .replace(/<meta[^>]+property=["']og:[^>]*>\s*/gi, '')
        .replace(/<meta[^>]+name=["']twitter:[^>]*>\s*/gi, '')
        .replace(/<title>[^<]*<\/title>/i, '')
        .replace('</head>', `${ogBlock}\n</head>`);

      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300');
      return res.send(html);
    } catch (e: any) {
      console.error('[seo] /car-details handler failed:', e?.message);
      return next();
    }
  });
}
