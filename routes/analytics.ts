import crypto from 'crypto';
import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export function registerAnalyticsRoutes(ctx: AppContext) {
  const { app, db } = ctx;

  // Ensure visitor_log table exists (idempotent)
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS visitor_log (
      id TEXT PRIMARY KEY,
      sessionId TEXT,
      userId TEXT,
      path TEXT,
      referrer TEXT,
      userAgent TEXT,
      ipHash TEXT,
      device TEXT,
      browser TEXT,
      os TEXT,
      timestamp TEXT,
      duration INTEGER DEFAULT 0
    )`);
  } catch {}

  // Public: track a page view
  app.post('/api/analytics/track', (req: any, res: any) => {
    try {
      const { sessionId, path, referrer, userAgent, duration } = req.body || {};
      if (!sessionId || !path) return res.json({ success: true }); // fail silently

      const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '';
      const ipHash = crypto.createHash('sha256').update(ip + 'autopro-salt').digest('hex').slice(0, 16);

      // Detect device from user agent
      const ua = (userAgent || '').toLowerCase();
      let device = 'desktop';
      if (/mobile|android|iphone/.test(ua)) device = 'mobile';
      else if (/tablet|ipad/.test(ua)) device = 'tablet';

      let browser = 'other';
      if (ua.includes('chrome')) browser = 'chrome';
      else if (ua.includes('firefox')) browser = 'firefox';
      else if (ua.includes('safari')) browser = 'safari';
      else if (ua.includes('edge')) browser = 'edge';

      let os = 'other';
      if (ua.includes('windows')) os = 'windows';
      else if (ua.includes('mac')) os = 'macos';
      else if (ua.includes('linux')) os = 'linux';
      else if (ua.includes('android')) os = 'android';
      else if (ua.includes('iphone') || ua.includes('ipad')) os = 'ios';

      const userId = (req as any).user?.id || null;
      const id = `vlog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      db.prepare(`INSERT INTO visitor_log (id, sessionId, userId, path, referrer, userAgent, ipHash, device, browser, os, timestamp, duration) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, sessionId, userId, path, referrer || '', userAgent || '', ipHash, device, browser, os, new Date().toISOString(), duration || 0);

      res.json({ success: true });
    } catch (e: any) {
      console.error('[ANALYTICS]', e.message);
      // Fail silently — analytics should never break the UX
      res.json({ success: false });
    }
  });

  // Admin: get analytics dashboard overview
  app.get('/api/admin/analytics/overview', requireAuth, async (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const range = (req.query.range as string) || 'week';
    const now = new Date();
    let dateFrom: string;
    if (range === 'today') dateFrom = now.toISOString().slice(0, 10);
    else if (range === 'week') dateFrom = new Date(now.getTime() - 7 * 86400000).toISOString();
    else if (range === 'month') dateFrom = new Date(now.getTime() - 30 * 86400000).toISOString();
    else if (range === 'year') dateFrom = new Date(now.getTime() - 365 * 86400000).toISOString();
    else dateFrom = new Date(now.getTime() - 7 * 86400000).toISOString();

    try {
      const totalVisits = (db.prepare("SELECT COUNT(*) as c FROM visitor_log WHERE timestamp > ?").get(dateFrom) as any).c;
      const uniqueVisitors = (db.prepare("SELECT COUNT(DISTINCT sessionId) as c FROM visitor_log WHERE timestamp > ?").get(dateFrom) as any).c;
      const loggedInVisitors = (db.prepare("SELECT COUNT(DISTINCT userId) as c FROM visitor_log WHERE timestamp > ? AND userId IS NOT NULL").get(dateFrom) as any).c;

      const topPages = db.prepare("SELECT path, COUNT(*) as views FROM visitor_log WHERE timestamp > ? GROUP BY path ORDER BY views DESC LIMIT 10").all(dateFrom);
      const topReferrers = db.prepare("SELECT referrer, COUNT(*) as visits FROM visitor_log WHERE timestamp > ? AND referrer != '' GROUP BY referrer ORDER BY visits DESC LIMIT 10").all(dateFrom);
      const deviceBreakdown = db.prepare("SELECT device, COUNT(*) as count FROM visitor_log WHERE timestamp > ? GROUP BY device").all(dateFrom);
      const browserBreakdown = db.prepare("SELECT browser, COUNT(*) as count FROM visitor_log WHERE timestamp > ? GROUP BY browser").all(dateFrom);

      // Daily timeline for chart
      const dailyTimeline = db.prepare(`
        SELECT date(timestamp) as date, COUNT(*) as visits, COUNT(DISTINCT sessionId) as uniqueVisitors
        FROM visitor_log WHERE timestamp > ? GROUP BY date(timestamp) ORDER BY date ASC
      `).all(dateFrom);

      // Hourly traffic (current day)
      const hourlyTraffic = db.prepare(`
        SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as visits
        FROM visitor_log WHERE date(timestamp) = date('now') GROUP BY hour ORDER BY hour
      `).all();

      // Avg session duration
      const avgRow: any = db.prepare("SELECT AVG(duration) as avgDur FROM visitor_log WHERE timestamp > ? AND duration > 0").get(dateFrom);
      const avgSessionDuration = Math.round(avgRow?.avgDur || 0);

      res.json({
        range,
        kpis: { totalVisits, uniqueVisitors, loggedInVisitors, avgSessionDuration },
        topPages, topReferrers, deviceBreakdown, browserBreakdown,
        dailyTimeline, hourlyTraffic
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Admin: get realtime visitors (last 5 min)
  app.get('/api/admin/analytics/realtime', requireAuth, (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const activeNow = (db.prepare("SELECT COUNT(DISTINCT sessionId) as c FROM visitor_log WHERE timestamp > ?").get(fiveMinAgo) as any).c;
    const recentPages = db.prepare("SELECT path, COUNT(*) as count FROM visitor_log WHERE timestamp > ? GROUP BY path ORDER BY count DESC LIMIT 5").all(fiveMinAgo);
    res.json({ activeNow, recentPages });
  });
}
