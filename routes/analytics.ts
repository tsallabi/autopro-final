/**
 * Analytics + Marketing pipeline.
 *
 * Public:
 *   POST /api/analytics/track
 *     Frontend hook (useVisitorTracking) calls this on every route change.
 *     If the request carries `Authorization: Bearer <jwt>`, we decode it
 *     and attach the userId to the visitor_log row — that's what makes
 *     the "registered visitors" KPI non-zero.
 *
 * Admin:
 *   GET  /api/admin/analytics/overview                — KPIs + top pages + geo + device
 *   GET  /api/admin/analytics/realtime                — visitors in last 5 min
 *   GET  /api/admin/analytics/geo-breakdown           — country / city / region table
 *   GET  /api/admin/analytics/registered-users-stats  — every user + their device + location
 *   GET  /api/admin/analytics/marketing-segments      — CRM-ready segments
 *
 * Schema additions (idempotent ALTER):
 *   visitor_log.country / city / region / lat / lon
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import geoip from 'geoip-lite';
import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';

export function registerAnalyticsRoutes(ctx: AppContext) {
  const { app, db, JWT_SECRET } = ctx as any;

  // Base table — older deploys may already have it.
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

  // [analytics] Add geo columns to existing rows. Idempotent — re-running is a no-op.
  ['country TEXT', 'city TEXT', 'region TEXT', 'lat REAL', 'lon REAL'].forEach((colDef) => {
    try { db.exec(`ALTER TABLE visitor_log ADD COLUMN ${colDef}`); } catch {}
  });

  // Indexes for the queries below — safe to run repeatedly.
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_visitor_userId ON visitor_log(userId)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_visitor_country ON visitor_log(country)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_visitor_timestamp ON visitor_log(timestamp)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_visitor_session ON visitor_log(sessionId)`); } catch {}

  // ── POST /api/analytics/track ───────────────────────────────────────
  app.post('/api/analytics/track', (req: any, res: any) => {
    try {
      const { sessionId, path, referrer, userAgent, duration } = req.body || {};
      if (!sessionId || !path) return res.json({ success: true }); // fail silently

      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
      const ipHash = crypto.createHash('sha256').update(ip + 'autopro-salt').digest('hex').slice(0, 16);

      // [analytics] Decode JWT from Authorization header if present.
      // We don't gate the endpoint on auth — we just enrich when we can.
      let userId: string | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const decoded: any = jwt.verify(authHeader.slice(7), JWT_SECRET);
          userId = decoded?.id || null;
        } catch {
          // invalid / expired token — record as anonymous
        }
      }

      // [analytics] Geolocate the IP using geoip-lite (offline, no rate limits).
      let country: string | null = null;
      let city: string | null = null;
      let region: string | null = null;
      let lat: number | null = null;
      let lon: number | null = null;
      try {
        // Strip IPv4-mapped IPv6 prefix that some proxies add.
        const cleanIp = ip.replace(/^::ffff:/, '');
        const geo = geoip.lookup(cleanIp);
        if (geo) {
          country = geo.country || null;
          city = geo.city || null;
          region = geo.region || null;
          lat = geo.ll?.[0] ?? null;
          lon = geo.ll?.[1] ?? null;
        }
      } catch {
        // ignore — geoip lookup is best-effort
      }

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

      const id = `vlog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      db.prepare(`
        INSERT INTO visitor_log (
          id, sessionId, userId, path, referrer, userAgent, ipHash,
          device, browser, os, country, city, region, lat, lon,
          timestamp, duration
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id, sessionId, userId, path, referrer || '', userAgent || '', ipHash,
        device, browser, os, country, city, region, lat, lon,
        new Date().toISOString(), duration || 0
      );

      res.json({ success: true });
    } catch (e: any) {
      console.error('[ANALYTICS]', e.message);
      // Fail silently — analytics should never break the UX
      res.json({ success: false });
    }
  });

  // ── GET /api/admin/analytics/overview ───────────────────────────────
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
      const loggedInVisitors = (db.prepare("SELECT COUNT(DISTINCT userId) as c FROM visitor_log WHERE timestamp > ? AND userId IS NOT NULL AND userId != ''").get(dateFrom) as any).c;
      // [analytics] All-time registered users (so the dashboard can show "112" even if none have visited in the range).
      const totalRegisteredUsers = (db.prepare("SELECT COUNT(*) as c FROM users").get() as any).c;

      const topPages = db.prepare("SELECT path, COUNT(*) as views FROM visitor_log WHERE timestamp > ? GROUP BY path ORDER BY views DESC LIMIT 10").all(dateFrom);
      const topReferrers = db.prepare("SELECT referrer, COUNT(*) as visits FROM visitor_log WHERE timestamp > ? AND referrer != '' GROUP BY referrer ORDER BY visits DESC LIMIT 10").all(dateFrom);
      const deviceBreakdown = db.prepare("SELECT device, COUNT(*) as count FROM visitor_log WHERE timestamp > ? GROUP BY device").all(dateFrom);
      const browserBreakdown = db.prepare("SELECT browser, COUNT(*) as count FROM visitor_log WHERE timestamp > ? GROUP BY browser").all(dateFrom);

      // [analytics] Geo breakdowns
      const countryBreakdown = db.prepare(`
        SELECT country, COUNT(*) as visits, COUNT(DISTINCT sessionId) as visitors
          FROM visitor_log WHERE timestamp > ? AND country IS NOT NULL
         GROUP BY country ORDER BY visits DESC LIMIT 20
      `).all(dateFrom);
      const cityBreakdown = db.prepare(`
        SELECT city, country, COUNT(*) as visits
          FROM visitor_log WHERE timestamp > ? AND city IS NOT NULL
         GROUP BY city, country ORDER BY visits DESC LIMIT 20
      `).all(dateFrom);

      const dailyTimeline = db.prepare(`
        SELECT date(timestamp) as date, COUNT(*) as visits, COUNT(DISTINCT sessionId) as uniqueVisitors
        FROM visitor_log WHERE timestamp > ? GROUP BY date(timestamp) ORDER BY date ASC
      `).all(dateFrom);

      const hourlyTraffic = db.prepare(`
        SELECT CAST(strftime('%H', timestamp) AS INTEGER) as hour, COUNT(*) as visits
        FROM visitor_log WHERE date(timestamp) = date('now') GROUP BY hour ORDER BY hour
      `).all();

      const avgRow: any = db.prepare("SELECT AVG(duration) as avgDur FROM visitor_log WHERE timestamp > ? AND duration > 0").get(dateFrom);
      const avgSessionDuration = Math.round(avgRow?.avgDur || 0);

      res.json({
        range,
        kpis: { totalVisits, uniqueVisitors, loggedInVisitors, avgSessionDuration, totalRegisteredUsers },
        topPages, topReferrers, deviceBreakdown, browserBreakdown,
        countryBreakdown, cityBreakdown,
        dailyTimeline, hourlyTraffic,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/admin/analytics/realtime ───────────────────────────────
  app.get('/api/admin/analytics/realtime', requireAuth, (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const activeNow = (db.prepare("SELECT COUNT(DISTINCT sessionId) as c FROM visitor_log WHERE timestamp > ?").get(fiveMinAgo) as any).c;
    const recentPages = db.prepare("SELECT path, COUNT(*) as count FROM visitor_log WHERE timestamp > ? GROUP BY path ORDER BY count DESC LIMIT 5").all(fiveMinAgo);
    res.json({ activeNow, recentPages });
  });

  // ── GET /api/admin/analytics/geo-breakdown ──────────────────────────
  // Visits + visitors per country / city / region for marketing planning.
  app.get('/api/admin/analytics/geo-breakdown', requireAuth, (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const range = (req.query.range as string) || 'month';
    const days = range === 'today' ? 1 : range === 'week' ? 7 : range === 'month' ? 30 : range === 'year' ? 365 : 30;
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString();

    try {
      const byCountry = db.prepare(`
        SELECT country, COUNT(*) as visits, COUNT(DISTINCT sessionId) as visitors,
               COUNT(DISTINCT CASE WHEN userId IS NOT NULL AND userId != '' THEN userId END) as registeredVisitors
          FROM visitor_log WHERE timestamp > ? AND country IS NOT NULL
         GROUP BY country ORDER BY visits DESC
      `).all(dateFrom);

      const byCity = db.prepare(`
        SELECT city, country, COUNT(*) as visits, COUNT(DISTINCT sessionId) as visitors
          FROM visitor_log WHERE timestamp > ? AND city IS NOT NULL
         GROUP BY city, country ORDER BY visits DESC LIMIT 50
      `).all(dateFrom);

      const byRegion = db.prepare(`
        SELECT region, country, COUNT(*) as visits, COUNT(DISTINCT sessionId) as visitors
          FROM visitor_log WHERE timestamp > ? AND region IS NOT NULL
         GROUP BY region, country ORDER BY visits DESC LIMIT 30
      `).all(dateFrom);

      res.json({ range, byCountry, byCity, byRegion });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/admin/analytics/registered-users-stats ─────────────────
  // Every registered user + their primary device, primary city/country,
  // total visits, last visit. Powers a "Users" table the marketing team
  // can sort/filter/export.
  app.get('/api/admin/analytics/registered-users-stats', requireAuth, (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      const users = db.prepare(`
        SELECT
          u.id, u.firstName, u.lastName, u.email, u.phone, u.role,
          u.country as profileCountry, u.deposit, u.buyingPower,
          u.joinDate, u.lastLogin, u.kycStatus, u.status,
          (SELECT MAX(timestamp) FROM visitor_log WHERE userId = u.id) as lastVisit,
          (SELECT COUNT(*) FROM visitor_log WHERE userId = u.id) as totalVisits,
          (SELECT COUNT(DISTINCT sessionId) FROM visitor_log WHERE userId = u.id) as totalSessions,
          (SELECT device FROM visitor_log WHERE userId = u.id GROUP BY device ORDER BY COUNT(*) DESC LIMIT 1) as primaryDevice,
          (SELECT browser FROM visitor_log WHERE userId = u.id GROUP BY browser ORDER BY COUNT(*) DESC LIMIT 1) as primaryBrowser,
          (SELECT country FROM visitor_log WHERE userId = u.id AND country IS NOT NULL GROUP BY country ORDER BY COUNT(*) DESC LIMIT 1) as primaryCountry,
          (SELECT city FROM visitor_log WHERE userId = u.id AND city IS NOT NULL GROUP BY city ORDER BY COUNT(*) DESC LIMIT 1) as primaryCity,
          (SELECT region FROM visitor_log WHERE userId = u.id AND region IS NOT NULL GROUP BY region ORDER BY COUNT(*) DESC LIMIT 1) as primaryRegion
        FROM users u
        ORDER BY u.joinDate DESC
      `).all();

      res.json({ count: users.length, users });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET /api/admin/analytics/marketing-segments ─────────────────────
  // Pre-computed audience segments ready to push to a CRM.
  // Each segment lists user IDs + contact info — feed it into your
  // email / SMS / WhatsApp campaign tool.
  app.get('/api/admin/analytics/marketing-segments', requireAuth, (req: any, res: any) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      const dayAgo = new Date(Date.now() - 1 * 86400000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString();

      // Active in the last 24h
      const activeToday = db.prepare(`
        SELECT u.id, u.email, u.firstName, u.lastName, u.phone, u.role
          FROM users u
         WHERE EXISTS (SELECT 1 FROM visitor_log v WHERE v.userId = u.id AND v.timestamp > ?)
      `).all(dayAgo);

      // Active this week but not today
      const activeThisWeek = db.prepare(`
        SELECT u.id, u.email, u.firstName, u.lastName, u.phone, u.role
          FROM users u
         WHERE EXISTS (SELECT 1 FROM visitor_log v WHERE v.userId = u.id AND v.timestamp > ?)
           AND NOT EXISTS (SELECT 1 FROM visitor_log v WHERE v.userId = u.id AND v.timestamp > ?)
      `).all(weekAgo, dayAgo);

      // Dormant 30+ days — re-engagement campaign target
      const dormant30Days = db.prepare(`
        SELECT u.id, u.email, u.firstName, u.lastName, u.phone, u.role, u.lastLogin
          FROM users u
         WHERE NOT EXISTS (SELECT 1 FROM visitor_log v WHERE v.userId = u.id AND v.timestamp > ?)
      `).all(monthAgo);

      // Signed up but never browsed — onboarding campaign target
      const neverVisited = db.prepare(`
        SELECT u.id, u.email, u.firstName, u.lastName, u.phone, u.role, u.joinDate
          FROM users u
         WHERE NOT EXISTS (SELECT 1 FROM visitor_log v WHERE v.userId = u.id)
      `).all();

      // High-value: users with deposits — VIP segment
      const withDeposits = db.prepare(`
        SELECT id, firstName, lastName, email, phone, deposit, buyingPower, country
          FROM users WHERE deposit > 0 ORDER BY deposit DESC
      `).all();

      // Pending KYC approval — admin reminder + user nudge
      const pendingKyc = db.prepare(`
        SELECT id, firstName, lastName, email, phone, kycStatus, joinDate
          FROM users WHERE kycStatus = 'pending'
      `).all();

      // Geographic distribution of registered users
      const byCountry = db.prepare(`
        SELECT country, COUNT(DISTINCT userId) as users
          FROM visitor_log
         WHERE userId IS NOT NULL AND userId != '' AND country IS NOT NULL
         GROUP BY country ORDER BY users DESC
      `).all();

      // Device split of registered users — guides ad targeting
      const byDevice = db.prepare(`
        SELECT device, COUNT(DISTINCT userId) as users
          FROM visitor_log
         WHERE userId IS NOT NULL AND userId != ''
         GROUP BY device ORDER BY users DESC
      `).all();

      res.json({
        segments: {
          activeToday:    { count: activeToday.length,    users: activeToday },
          activeThisWeek: { count: activeThisWeek.length, users: activeThisWeek },
          dormant30Days:  { count: dormant30Days.length,  users: dormant30Days },
          neverVisited:   { count: neverVisited.length,   users: neverVisited },
          withDeposits:   { count: withDeposits.length,   users: withDeposits },
          pendingKyc:     { count: pendingKyc.length,     users: pendingKyc },
        },
        breakdowns: { byCountry, byDevice },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
