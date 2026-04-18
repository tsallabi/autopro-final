import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { GoogleOAuthProvider } from '@react-oauth/google';

/* ── Force orange theme-color on all pages (Android Chrome) ── */
const themeColorMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
if (themeColorMeta) {
  themeColorMeta.content = '#f97316';
} else {
  const m = document.createElement('meta');
  m.name = 'theme-color';
  m.content = '#f97316';
  document.head.appendChild(m);
}

/* ── Service Worker: register in production only ── */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // Register service worker for PWA functionality
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[SW] Registered:', registration.scope);

        // Check for updates once per hour (not on every load)
        setInterval(() => registration.update(), 60 * 60 * 1000);

        // When a new SW is installed, tell it to take over — but DON'T reload automatically
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] New version available — will activate on next visit');
                // Optional: show user a notification to reload manually
              }
            });
          }
        });
      })
      .catch((err) => console.error('[SW] Registration failed:', err));
  });
} else if ('serviceWorker' in navigator) {
  // In development, unregister any stale service workers
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister();
      console.log('[SW] Unregistered (dev):', registration.scope);
    }
  });
}

// We'll use an environment variable or a fallback for the Google Client ID
const GOOGLE_CLIENT_ID = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '1047123985392-xxxxxxxxx.apps.googleusercontent.com';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
);
