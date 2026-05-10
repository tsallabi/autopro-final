/**
 * BiddingActivationModal — system-styled popup that appears when an
 * unverified user tries to bid / offer / participate in a live auction.
 *
 * The backend rejects with HTTP 403 + { requiresActivation: true,
 * eligibilityReason: 'not-active' | 'no-deposit' | 'banned' | ... }.
 * Pages that submit bids should call `wrapBidResponse(res)` (below) to
 * intercept that response and dispatch a 'bidding:activation-required'
 * CustomEvent — this modal listens globally and renders accordingly.
 *
 * Why a global modal (not per-page): bids/offers can be submitted from
 * many pages (CarDetails, LiveAuctionRoom, OfferMarket, BuyNow, etc.).
 * Wiring a modal into each is duplicative; one global listener catches
 * all of them and shows a consistent activation flow.
 */
import React, { useEffect, useState } from 'react';
import { useStore } from '../context/StoreContext';

interface ActivationDetail {
  reason: string;
  message: string;
}

const REASON_LABELS: Record<string, { title: string; body: string; cta: string }> = {
  'not-bidding-enabled': {
    title: '⚡ صلاحية المزايدة غير مُفعَّلة',
    body: 'حسابك مُسجَّل ويمكنك تصفّح كل السيارات بحرية. لكن للمشاركة في المزادات الحية أو تقديم العروض، يجب أن تُفعَّل صلاحية المزايدة في حسابك يدوياً من الإدارة.\n\nخطوات التفعيل:\n1. ادفع العربون (داخل ليبيا 1,000 د.ل / خارج ليبيا $500)\n2. أكمِل التحقّق من الهوية (KYC)\n3. راسل الإدارة عبر واتساب لتفعيل المزايدة',
    cta: 'تواصل مع الإدارة لتفعيل المزايدة',
  },
  // Backward compat — older deployments may still emit these reasons.
  'not-active': {
    title: '⏳ حسابك بانتظار المراجعة',
    body: 'حسابك قيد المراجعة من فريق الإدارة. يمكنك تصفّح السيارات حتى يتم التفعيل.',
    cta: 'تواصل مع الإدارة',
  },
  'no-deposit': {
    title: '💰 لم يتم دفع العربون',
    body: 'المزايدة تتطلّب دفع عربون مسبق:\n• داخل ليبيا: 1,000 د.ل\n• خارج ليبيا: $500\n\nبعد الدفع، تواصل مع الإدارة لتفعيل عضويتك.',
    cta: 'كيف أدفع العربون؟',
  },
  'banned': {
    title: '🚫 حسابك معلَّق',
    body: 'تم تعليق حسابك من قِبَل الإدارة. لا يمكن المشاركة في المزادات قبل حل الإشكال. للاستفسار راسل info@autopro.ac.',
    cta: 'تواصل مع الإدارة',
  },
  'not-found': {
    title: '❌ الحساب غير موجود',
    body: 'لم نتمكن من العثور على حسابك في النظام. يرجى تسجيل الخروج ثم الدخول مجدداً.',
    cta: 'حسناً',
  },
  'unknown': {
    title: '🔒 المزايدة غير متاحة حالياً',
    body: 'لا يمكن المشاركة في المزاد في الوقت الحالي. يرجى التواصل مع الإدارة لمعرفة السبب.',
    cta: 'تواصل مع الإدارة',
  },
};

const SUPPORT_WHATSAPP = '+218913524466';
const SUPPORT_EMAIL = 'info@autopro.ac';

export default function BiddingActivationModal() {
  const { currentUser } = useStore();
  const [detail, setDetail] = useState<ActivationDetail | null>(null);

  useEffect(() => {
    function onActivation(e: any) {
      const d = e?.detail;
      if (!d) return;
      setDetail({ reason: d.reason || 'unknown', message: d.message || '' });
    }
    window.addEventListener('bidding:activation-required', onActivation as EventListener);
    return () => window.removeEventListener('bidding:activation-required', onActivation as EventListener);
  }, []);

  if (!detail) return null;
  const labels = REASON_LABELS[detail.reason] || REASON_LABELS.unknown;
  const userName = currentUser ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() : null;

  function close() { setDetail(null); }
  function openWhatsApp() {
    const text = encodeURIComponent(
      `السلام عليكم،\nأرغب في تفعيل حسابي للمزايدة على AutoPro.\n` +
      (userName ? `الاسم: ${userName}\n` : '') +
      (currentUser?.email ? `الإيميل: ${currentUser.email}\n` : '') +
      `السبب: ${labels.title}`
    );
    window.open(`https://wa.me/${SUPPORT_WHATSAPP.replace(/\D/g, '')}?text=${text}`, '_blank');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          background: 'linear-gradient(135deg, #fff 0%, #f8fafc 100%)',
          borderRadius: 24,
          maxWidth: 480,
          width: '100%',
          padding: 32,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", "Cairo", sans-serif',
          position: 'relative',
        }}
      >
        <button
          onClick={close}
          aria-label="إغلاق"
          style={{
            position: 'absolute', top: 16, left: 16,
            background: '#f1f5f9', border: 'none',
            width: 36, height: 36, borderRadius: 18,
            fontSize: 18, cursor: 'pointer', color: '#64748b',
          }}
        >×</button>

        <div style={{ fontSize: 56, textAlign: 'center', marginBottom: 12 }}>{labels.title.match(/^\S+/)?.[0]}</div>

        <h2 style={{ margin: '0 0 14px', fontSize: 22, fontWeight: 800, color: '#0f172a', textAlign: 'center' }}>
          {labels.title.replace(/^\S+\s*/, '')}
        </h2>

        <p style={{
          margin: '0 0 20px',
          fontSize: 14,
          color: '#475569',
          lineHeight: 1.7,
          textAlign: 'center',
          whiteSpace: 'pre-line',
        }}>
          {labels.body}
        </p>

        {detail.message && (
          <div style={{
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 12,
            padding: 12,
            fontSize: 13,
            color: '#92400e',
            marginBottom: 20,
            textAlign: 'center',
            fontWeight: 600,
          }}>
            {detail.message}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={openWhatsApp}
            style={{
              background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
              color: '#fff', border: 'none',
              padding: '14px 20px', borderRadius: 14,
              fontSize: 15, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)',
            }}
          >
            💬 {labels.cta} عبر الواتساب
          </button>
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('طلب تفعيل عضوية للمزايدة')}`}
            style={{
              display: 'block',
              background: '#fff',
              border: '2px solid #e2e8f0',
              color: '#475569',
              padding: '12px 20px', borderRadius: 14,
              fontSize: 14, fontWeight: 700,
              textDecoration: 'none', textAlign: 'center',
            }}
          >
            ✉️ {SUPPORT_EMAIL}
          </a>
          <button
            onClick={close}
            style={{
              background: 'transparent', border: 'none',
              color: '#94a3b8', padding: '10px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            إغلاق
          </button>
        </div>

        <div style={{
          marginTop: 20, paddingTop: 16,
          borderTop: '1px solid #e2e8f0',
          fontSize: 11, color: '#94a3b8',
          textAlign: 'center', lineHeight: 1.6,
        }}>
          🔒 يمكنك التصفح ومشاهدة السيارات بحرية. التفعيل مطلوب فقط للمزايدة وتقديم العروض.
        </div>
      </div>
    </div>
  );
}

/**
 * Helper for fetch responses — call after any bid/offer POST. If the
 * server rejected with requiresActivation, fires the global event so
 * the modal pops up. Returns whether the response was an activation
 * rejection (so the caller can stop further processing).
 */
export function handleBidResponse(data: any): boolean {
  if (data && data.requiresActivation) {
    window.dispatchEvent(new CustomEvent('bidding:activation-required', {
      detail: {
        reason: data.eligibilityReason || 'unknown',
        message: data.error || '',
      },
    }));
    return true;
  }
  return false;
}
