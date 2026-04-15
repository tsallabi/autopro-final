import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function getOrCreateSessionId(): string {
  let id = localStorage.getItem('autopro_session_id');
  if (!id) {
    id = `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('autopro_session_id', id);
  }
  return id;
}

export function useVisitorTracking() {
  const location = useLocation();

  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        path: location.pathname,
        referrer: document.referrer || '',
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {}); // silent fail
  }, [location.pathname]);
}
