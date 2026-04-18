/* ============================================================
   AutoPro Libya — Service Worker (PWA)
   Strategy: Network-first for API, Cache-first for static assets
   ============================================================ */
const CACHE_VERSION = 'v5-stable';
const STATIC_CACHE = `autopro-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `autopro-runtime-${CACHE_VERSION}`;
const OFFLINE_PAGE = '/offline.html';

// Critical assets to pre-cache
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ─────── INSTALL ───────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

// ─────── ACTIVATE ───────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─────── FETCH HANDLER ───────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests entirely (prevents POST crashes)
  if (request.method !== 'GET') return;

  // Skip cross-origin requests (e.g., Google Fonts, YouTube)
  if (url.origin !== self.location.origin) return;

  // Skip API calls — always go to network (real-time data)
  if (url.pathname.startsWith('/api/')) return;

  // Skip uploads (user files)
  if (url.pathname.startsWith('/uploads/')) return;

  // Skip socket.io
  if (url.pathname.startsWith('/socket.io')) return;

  // Navigation requests → network first, fallback to cached / offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a copy of successful HTML navigations
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/'))
            .then(r => r || caches.match(OFFLINE_PAGE))
        )
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts) → Cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Update cache in background
        fetch(request).then((res) => {
          if (res.ok) caches.open(RUNTIME_CACHE).then(c => c.put(request, res));
        }).catch(() => {});
        return cached;
      }
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(OFFLINE_PAGE));
    })
  );
});

// ─────── MESSAGE HANDLER (for manual updates) ───────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─────── PUSH NOTIFICATIONS ───────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); }
  catch { data = { title: 'AutoPro', body: event.data.text() || 'لديك إشعار جديد' }; }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-96.png',
    image: data.image,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/', ...(data.data || {}) },
    requireInteraction: data.requireInteraction || false,
    tag: data.tag,
    actions: data.actions || [
      { action: 'open', title: 'فتح' },
      { action: 'close', title: 'إغلاق' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AutoPro', options)
  );
});

// ─────── NOTIFICATION CLICK ───────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        try {
          if (client.url.includes(url) && 'focus' in client) return client.focus();
        } catch {}
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ─────── SUBSCRIPTION CHANGE (browser re-issues endpoint) ───────
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true })
      .then((newSub) => {
        return fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newSub.toJSON())
        });
      }).catch(() => {})
  );
});
