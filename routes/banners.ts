/**
 * Ad Banners API routes
 * Public + Admin CRUD for managing ad banners
 */
import { requireAdmin } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

function genId() {
  return `ban-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

export function registerBannerRoutes(ctx: AppContext) {
  const { app, db } = ctx;

  // ── Public: get active banners (optionally filtered by position) ──
  app.get('/api/banners', (_req, res) => {
    try {
      const position = _req.query.position as string | undefined;
      const now = new Date().toISOString();
      let query = `SELECT * FROM ad_banners WHERE isActive = 1
        AND (startDate IS NULL OR startDate <= ?)
        AND (endDate IS NULL OR endDate >= ?)`;
      const params: any[] = [now, now];

      if (position) {
        query += ` AND position = ?`;
        params.push(position);
      }
      query += ` ORDER BY sortOrder ASC, createdAt DESC`;

      const banners = db.prepare(query).all(...params);
      res.json(banners);
    } catch (e: any) {
      console.error('[banners] list error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public: get banners by position shorthand ──
  app.get('/api/banners/:position', (req, res) => {
    try {
      const { position } = req.params;
      // Prevent collision with click tracking — skip if position looks like a UUID
      if (position.length > 30) {
        return res.status(404).json({ error: 'not found' });
      }
      const now = new Date().toISOString();
      const banners = db.prepare(
        `SELECT * FROM ad_banners WHERE isActive = 1 AND position = ?
         AND (startDate IS NULL OR startDate <= ?)
         AND (endDate IS NULL OR endDate >= ?)
         ORDER BY sortOrder ASC, createdAt DESC`
      ).all(position, now, now);
      res.json(banners);
    } catch (e: any) {
      console.error('[banners] by-position error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public: track click ──
  app.post('/api/banners/:id/click', (req, res) => {
    try {
      db.prepare(`UPDATE ad_banners SET clickCount = clickCount + 1 WHERE id = ?`).run(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Public: track view (batch) ──
  app.post('/api/banners/track-view', (req, res) => {
    try {
      const { ids } = req.body;
      if (Array.isArray(ids)) {
        const stmt = db.prepare(`UPDATE ad_banners SET viewCount = viewCount + 1 WHERE id = ?`);
        db.transaction(() => { ids.forEach(id => stmt.run(id)); })();
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: list ALL banners (including inactive) ──
  app.get('/api/admin/banners', requireAdmin, (_req, res) => {
    try {
      const banners = db.prepare(`SELECT * FROM ad_banners ORDER BY sortOrder ASC, createdAt DESC`).all();
      res.json(banners);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Admin: create banner ──
  app.post('/api/admin/banners', requireAdmin, (req, res) => {
    try {
      const id = genId();
      const {
        title, subtitle, imageUrl, linkUrl, linkText,
        position, gradient, isActive, sortOrder, startDate, endDate,
      } = req.body;

      db.prepare(`INSERT INTO ad_banners (id, title, subtitle, imageUrl, linkUrl, linkText, position, gradient, isActive, sortOrder, startDate, endDate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id,
        title || '',
        subtitle || null,
        imageUrl || null,
        linkUrl || null,
        linkText || 'التفاصيل',
        position || 'sidebar',
        gradient || 'from-cyan-500 to-blue-600',
        isActive !== undefined ? (isActive ? 1 : 0) : 1,
        sortOrder ?? 0,
        startDate || null,
        endDate || null,
      );
      const banner = db.prepare(`SELECT * FROM ad_banners WHERE id = ?`).get(id);
      res.json(banner);
    } catch (e: any) {
      console.error('[banners] create error:', e);
      res.status(400).json({ error: e.message });
    }
  });

  // ── Admin: update banner ──
  app.put('/api/admin/banners/:id', requireAdmin, (req, res) => {
    try {
      const existing: any = db.prepare(`SELECT * FROM ad_banners WHERE id = ?`).get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'البانر غير موجود' });

      const {
        title, subtitle, imageUrl, linkUrl, linkText,
        position, gradient, isActive, sortOrder, startDate, endDate,
      } = req.body;

      db.prepare(`UPDATE ad_banners SET
        title = ?, subtitle = ?, imageUrl = ?, linkUrl = ?, linkText = ?,
        position = ?, gradient = ?, isActive = ?, sortOrder = ?, startDate = ?, endDate = ?
        WHERE id = ?`).run(
        title ?? existing.title,
        subtitle !== undefined ? subtitle : existing.subtitle,
        imageUrl !== undefined ? imageUrl : existing.imageUrl,
        linkUrl !== undefined ? linkUrl : existing.linkUrl,
        linkText ?? existing.linkText,
        position ?? existing.position,
        gradient ?? existing.gradient,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.isActive,
        sortOrder ?? existing.sortOrder,
        startDate !== undefined ? startDate : existing.startDate,
        endDate !== undefined ? endDate : existing.endDate,
        req.params.id,
      );
      const banner = db.prepare(`SELECT * FROM ad_banners WHERE id = ?`).get(req.params.id);
      res.json(banner);
    } catch (e: any) {
      console.error('[banners] update error:', e);
      res.status(400).json({ error: e.message });
    }
  });

  // ── Admin: soft delete (isActive=0) ──
  app.delete('/api/admin/banners/:id', requireAdmin, (req, res) => {
    try {
      db.prepare(`UPDATE ad_banners SET isActive = 0 WHERE id = ?`).run(req.params.id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  console.log('[BOOT] ✓ banner routes');
}
