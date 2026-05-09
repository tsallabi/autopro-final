import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, BellOff, X, Check, AlertCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { usePushNotifications } from '../hooks/usePushNotifications';

const STORAGE_KEY = 'autopro_push_prompt_dismissed';
const DISMISS_DAYS = 7;
const SHOW_AFTER_MS = 30_000;

// Pages that need camera/mic permission — never show the push prompt here, or
// the browser refuses to display the camera prompt on top with
// "This site can't ask for your permission".
const PERMISSION_HEAVY_PATH_PATTERNS = [
  /\/dashboard\/admin/,        // yard_gate_in/out, yard_quick_scan
  /\/dashboard\/seller/,       // UnifiedCarForm camera capture
  /\/seller-dashboard/,        // legacy alias
  /\bview=yard_/,              // any yard-* admin view
  /\bview=add_car/,            // car upload form
];

export const PushNotificationPrompt: React.FC = () => {
  const { currentUser } = useStore();
  const { isSupported, permission, subscribed, loading, subscribe } = usePushNotifications();
  const location = useLocation();

  const [showBanner, setShowBanner] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'denied' | 'error'>('idle');

  // Bail when the current route uses camera/mic — re-checks on every navigation
  // so the prompt reappears on the next non-permission-heavy page.
  const onPermissionHeavyPage = (() => {
    const fullPath = location.pathname + location.search;
    return PERMISSION_HEAVY_PATH_PATTERNS.some((re) => re.test(fullPath));
  })();

  useEffect(() => {
    if (!currentUser) return;
    if (!isSupported) return;
    if (subscribed) return;
    if (permission === 'denied') return;
    if (onPermissionHeavyPage) {
      setShowBanner(false);
      return;
    }

    // Respect prior dismissal
    try {
      const dismissedAt = localStorage.getItem(STORAGE_KEY);
      if (dismissedAt) {
        const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
        if (daysSince < DISMISS_DAYS) return;
      }
    } catch {}

    const t = setTimeout(() => setShowBanner(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [currentUser, isSupported, subscribed, permission, onPermissionHeavyPage]);

  // Hide once subscribed
  useEffect(() => {
    if (subscribed) setShowBanner(false);
  }, [subscribed]);

  const handleEnable = async () => {
    const ok = await subscribe();
    if (ok) {
      setStatus('success');
      setTimeout(() => setShowBanner(false), 2500);
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
      setStatus('denied');
    } else {
      setStatus('error');
    }
  };

  const handleDismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, Date.now().toString()); } catch {}
    setShowBanner(false);
  };

  if (!currentUser || !isSupported || subscribed || !showBanner) return null;

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 90px)',
        left: 16,
        right: 16,
        maxWidth: 440,
        margin: '0 auto',
        zIndex: 9990,
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: '#f8fafc',
        border: '1px solid rgba(251, 146, 60, 0.35)',
        borderRadius: 16,
        boxShadow: '0 24px 48px -12px rgba(0,0,0,0.55)',
        padding: 18,
        fontFamily: 'inherit',
      }}
    >
      <button
        onClick={handleDismiss}
        aria-label="إغلاق"
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          padding: 6,
        }}
      >
        <X size={18} />
      </button>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bell size={22} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
            احصل على إشعارات فورية للمزادات
          </div>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
            فعّل الإشعارات حتى لا تفوّت أي مزاد:
          </div>
          <ul
            style={{
              margin: '8px 0 0 0',
              padding: 0,
              listStyle: 'none',
              fontSize: 12.5,
              color: '#e2e8f0',
            }}
          >
            <li style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <Check size={14} color="#4ade80" /> تنبيه فوري عند تجاوز مزايدتك
            </li>
            <li style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <Check size={14} color="#4ade80" /> إعلامك عند الفوز بالسيارة
            </li>
            <li style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
              <Check size={14} color="#4ade80" /> سيارات جديدة تطابق بحثك المحفوظ
            </li>
            <li style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Check size={14} color="#4ade80" /> تذكير بالفواتير قبل استحقاقها
            </li>
          </ul>
        </div>
      </div>

      {status === 'denied' && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 10,
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#fca5a5',
            fontSize: 12.5,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <AlertCircle size={16} />
          تم رفض الإذن — يُرجى السماح بالإشعارات من إعدادات المتصفح.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          onClick={handleEnable}
          disabled={loading}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            background: loading
              ? '#64748b'
              : 'linear-gradient(135deg, #f97316, #ea580c)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 14,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Bell size={16} />
          {loading ? 'جاري التفعيل...' : 'تفعيل الإشعارات'}
        </button>
        <button
          onClick={handleDismiss}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            border: '1px solid rgba(148, 163, 184, 0.3)',
            background: 'transparent',
            color: '#cbd5e1',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <BellOff size={14} />
          لاحقاً
        </button>
      </div>
    </div>
  );
};

export default PushNotificationPrompt;
