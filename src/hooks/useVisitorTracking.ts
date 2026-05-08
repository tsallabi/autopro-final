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
    // [analytics] Send the auth token so the backend can attach userId
    // to the visitor_log row. Without this, every visit is anonymous —
    // which is why the "Registered Visitors" KPI was stuck at 0.
    const token = localStorage.getItem('authToken');
    fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        sessionId,
        path: location.pathname,
        referrer: document.referrer || '',
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {}); // silent fail — analytics must never break the UX
  }, [location.pathname]);
}
