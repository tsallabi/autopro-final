/**
 * Web Push helper for AutoPro
 * - Persists VAPID keys in app_settings so they survive restarts
 * - Exposes sendPushNotification() and sendPushToUser()
 * - Handles expired subscriptions (410 Gone) by removing them from DB
 */
import webpush from 'web-push';
import type Database from 'better-sqlite3';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
  data?: Record<string, any>;
}

export interface WebPushHelpers {
  getVapidKeys: () => { publicKey: string; privateKey: string; subject: string };
  sendPushNotification: (subscription: any, payload: PushPayload) => Promise<boolean>;
  sendPushToUser: (userId: string, payload: PushPayload) => Promise<{ sent: number; removed: number }>;
}

function getSetting(db: Database.Database, key: string): string | null {
  try {
    const row: any = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value || null;
  } catch {
    return null;
  }
}

function setSetting(db: Database.Database, key: string, value: string) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updatedAt) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
  ).run(key, value, new Date().toISOString());
}

export function initWebPush(db: Database.Database): WebPushHelpers {
  // Ensure required tables exist (idempotent)
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      userAgent TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      lastUsed TEXT
    );
    CREATE TABLE IF NOT EXISTS push_notification_log (
      id TEXT PRIMARY KEY,
      userId TEXT,
      title TEXT,
      body TEXT,
      icon TEXT,
      url TEXT,
      success INTEGER DEFAULT 0,
      error TEXT,
      sentAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(userId);
  `);

  // Resolve VAPID keys (env > DB > generate + persist)
  let publicKey = process.env.VAPID_PUBLIC_KEY || getSetting(db, 'vapid_public_key') || '';
  let privateKey = process.env.VAPID_PRIVATE_KEY || getSetting(db, 'vapid_private_key') || '';
  const subject = process.env.VAPID_SUBJECT || 'mailto:info@autopro.ac';

  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setSetting(db, 'vapid_public_key', publicKey);
    setSetting(db, 'vapid_private_key', privateKey);
    console.log('[WEBPUSH] Generated and persisted new VAPID keys.');
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (err: any) {
    console.error('[WEBPUSH] setVapidDetails failed:', err?.message);
  }

  console.log('[WEBPUSH] Ready. Public key:', publicKey.slice(0, 20) + '...');

  const getVapidKeys = () => ({ publicKey, privateKey, subject });

  const sendPushNotification = async (subscription: any, payload: PushPayload): Promise<boolean> => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return true;
    } catch (err: any) {
      // Re-throw for the caller to inspect status code
      throw err;
    }
  };

  const logId = () => `plog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const sendPushToUser = async (
    userId: string,
    payload: PushPayload
  ): Promise<{ sent: number; removed: number }> => {
    let sent = 0;
    let removed = 0;

    if (!userId) return { sent, removed };

    let subs: any[] = [];
    try {
      subs = db
        .prepare('SELECT * FROM push_subscriptions WHERE userId = ?')
        .all(userId) as any[];
    } catch (err: any) {
      console.error('[WEBPUSH] query subscriptions failed:', err?.message);
      return { sent, removed };
    }

    if (!subs.length) return { sent, removed };

    const now = new Date().toISOString();

    for (const row of subs) {
      const subscription = {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      try {
        await sendPushNotification(subscription, payload);
        sent++;
        try {
          db.prepare('UPDATE push_subscriptions SET lastUsed = ? WHERE id = ?')
            .run(now, row.id);
          db.prepare(
            `INSERT INTO push_notification_log (id, userId, title, body, icon, url, success, error, sentAt)
             VALUES (?, ?, ?, ?, ?, ?, 1, NULL, ?)`
          ).run(logId(), userId, payload.title, payload.body, payload.icon || null, payload.url || null, now);
        } catch {}
      } catch (err: any) {
        const statusCode = err?.statusCode;
        const errMsg = err?.body || err?.message || String(err);
        // 404/410 = subscription expired/invalid — remove
        if (statusCode === 404 || statusCode === 410) {
          try {
            db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(row.id);
            removed++;
          } catch {}
        }
        try {
          db.prepare(
            `INSERT INTO push_notification_log (id, userId, title, body, icon, url, success, error, sentAt)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
          ).run(logId(), userId, payload.title, payload.body, payload.icon || null, payload.url || null, String(errMsg).slice(0, 500), now);
        } catch {}
        console.warn(`[WEBPUSH] send failed (user=${userId}, status=${statusCode}):`, String(errMsg).slice(0, 200));
      }
    }

    return { sent, removed };
  };

  return { getVapidKeys, sendPushNotification, sendPushToUser };
}
