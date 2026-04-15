/**
 * Web Push routes
 * - GET  /api/push/vapid-public-key   — public key for browser subscription
 * - POST /api/push/subscribe          — save the browser's PushSubscription
 * - POST /api/push/unsubscribe        — remove a subscription by endpoint
 * - POST /api/admin/push/send-test    — admin sends a test push to any user
 */
import { requireAuth } from '../lib/middleware.ts';
import type { AppContext } from '../lib/types.ts';
import type { WebPushHelpers } from '../lib/webpush.ts';

export function registerPushRoutes(ctx: AppContext & { webpush: WebPushHelpers }) {
  const { app, db, webpush } = ctx;

  // Public: VAPID public key (no auth required — safe to expose)
  app.get('/api/push/vapid-public-key', (_req, res) => {
    try {
      const { publicKey } = webpush.getVapidKeys();
      res.json({ publicKey });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to load VAPID public key' });
    }
  });

  // Subscribe — user must be authenticated
  app.post('/api/push/subscribe', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { endpoint, keys } = req.body || {};
      const p256dh = keys?.p256dh;
      const auth = keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        return res.status(400).json({ error: 'Invalid subscription payload' });
      }

      const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 255);
      const id = `psub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();

      // Upsert by endpoint (unique)
      db.prepare(
        `INSERT INTO push_subscriptions (id, userId, endpoint, p256dh, auth, userAgent, createdAt, lastUsed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET
           userId = excluded.userId,
           p256dh = excluded.p256dh,
           auth = excluded.auth,
           userAgent = excluded.userAgent,
           lastUsed = excluded.lastUsed`
      ).run(id, userId, endpoint, p256dh, auth, userAgent, now, now);

      res.json({ ok: true });
    } catch (err: any) {
      console.error('[PUSH] subscribe error:', err?.message);
      res.status(500).json({ error: 'Subscription save failed' });
    }
  });

  // Unsubscribe — remove by endpoint
  app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
    try {
      const user = (req as any).user;
      const userId = user?.id;
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

      // Only allow removing your own subscriptions (unless admin)
      if (user?.role === 'admin') {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
      } else {
        db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND userId = ?').run(endpoint, userId);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error('[PUSH] unsubscribe error:', err?.message);
      res.status(500).json({ error: 'Unsubscribe failed' });
    }
  });

  // Admin test push
  app.post('/api/admin/push/send-test', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

      const { userId, title, body, url } = req.body || {};
      if (!userId) return res.status(400).json({ error: 'userId required' });

      const result = await webpush.sendPushToUser(userId, {
        title: title || 'إشعار تجريبي من AutoPro',
        body: body || 'وصلك إشعار تجريبي من لوحة التحكم.',
        url: url || '/dashboard/user',
        icon: '/icons/icon-192.png',
        tag: 'admin-test',
      });

      res.json({ ok: true, ...result });
    } catch (err: any) {
      console.error('[PUSH] admin send-test error:', err?.message);
      res.status(500).json({ error: 'Send test failed' });
    }
  });
}
