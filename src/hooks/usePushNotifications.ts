import { useCallback, useEffect, useState } from 'react';

type Permission = 'default' | 'granted' | 'denied';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof window !== 'undefined' ? window.atob(base64) : '';
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem('token') || localStorage.getItem('authToken') || null;
  } catch {
    return null;
  }
}

async function api(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(path, { ...opts, headers });
}

export function usePushNotifications() {
  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  const [permission, setPermission] = useState<Permission>(
    isSupported && typeof Notification !== 'undefined'
      ? (Notification.permission as Permission)
      : 'default'
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  // On mount: detect current subscription status
  useEffect(() => {
    if (!isSupported) return;
    let cancelled = false;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setSubscribed(!!sub);
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      // 1) Ask permission
      const perm = await Notification.requestPermission();
      setPermission(perm as Permission);
      if (perm !== 'granted') return false;

      // 2) Get VAPID public key
      const vapidRes = await fetch('/api/push/vapid-public-key');
      if (!vapidRes.ok) throw new Error('VAPID key fetch failed');
      const { publicKey } = await vapidRes.json();
      if (!publicKey) throw new Error('No VAPID public key returned');

      // 3) Register / reuse subscription
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      // 4) Send to server
      const res = await api('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(`Subscribe API failed: ${res.status}`);

      setSubscribed(true);
      return true;
    } catch (err) {
      console.error('[PUSH] subscribe failed:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const { endpoint } = sub.toJSON();
        await api('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setSubscribed(false);
      return true;
    } catch (err) {
      console.error('[PUSH] unsubscribe failed:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return { isSupported, permission, subscribed, loading, subscribe, unsubscribe };
}
