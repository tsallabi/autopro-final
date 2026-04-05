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

/* ── Ensure Service Workers are Unregistered in Dev ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (let registration of registrations) {
      registration.unregister();
      console.log('[SW] Unregistered:', registration.scope);
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
