/**
 * ReferralCard — invite-a-friend panel inside the user dashboard.
 * Shows the user's referral code, share link, stats, and a list of people
 * they invited. Pulls /api/user/:id/referral-info.
 */
import { useEffect, useState } from 'react';
import { Users, Gift, Copy, Check, Share2, MessageCircle } from 'lucide-react';
import { useStore, authFetch } from '../context/StoreContext';

type Referral = {
  id: string;
  userName: string;
  email?: string;
  status: 'pending' | 'activated';
  bonusLYD: number;
  createdAt?: string;
  activatedAt?: string;
};

type Info = {
  code: string;
  shareUrl: string;
  bonusEarnedLYD: number;
  bonusPerReferralLYD: number;
  activatedCount: number;
  pendingCount: number;
  referrals: Referral[];
};

export default function ReferralCard() {
  const { currentUser } = useStore();
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<'code' | 'url' | ''>('');

  useEffect(() => {
    if (!currentUser?.id) return;
    authFetch(`/api/user/${currentUser.id}/referral-info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, [currentUser?.id]);

  const copy = (text: string, what: 'code' | 'url') => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const shareWhatsApp = () => {
    if (!info) return;
    const msg = `🚗 جرّب أوتو برو — منصّة مزادات السيارات الأولى في ليبيا.\n\nسجّل عبر رابطي وكلانا نربح 100 د.ل عند أوّل إيداع:\n${info.shareUrl}`;
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const shareNative = () => {
    if (!info) return;
    const data = {
      title: 'أوتو برو — مزادات السيارات',
      text: 'سجّل عبر رابطي في أوتو برو ونربح 100 د.ل عند أوّل إيداع لك',
      url: info.shareUrl,
    };
    if ((navigator as any).share) {
      (navigator as any).share(data).catch(() => {});
    } else {
      copy(info.shareUrl, 'url');
    }
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>...جارٍ التحميل</div>;
  }
  if (!info) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>تعذّر تحميل بيانات الإحالة.</div>;
  }

  return (
    <div dir="rtl" style={{ padding: '0 4px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        color: '#fff', borderRadius: 20, padding: 24,
        boxShadow: '0 12px 28px rgba(249,115,22,0.25)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Gift size={26} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>ادعُ صديقاً واكسبا معاً</div>
            <div style={{ fontSize: 13, opacity: 0.95, marginTop: 2 }}>
              {info.bonusPerReferralLYD} د.ل لك و {info.bonusPerReferralLYD} د.ل له عند أوّل إيداع
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
          {[
            { label: 'كسبتَ', value: `${info.bonusEarnedLYD.toLocaleString()} د.ل` },
            { label: 'فُعِّلوا', value: info.activatedCount },
            { label: 'بانتظار', value: info.pendingCount },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.15)', borderRadius: 12,
              padding: '10px 6px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{s.value}</div>
              <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2, fontWeight: 700 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>كودك</div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f1f5f9', borderRadius: 12, padding: '12px 14px',
        }}>
          <span style={{ fontSize: 22, fontWeight: 900, fontFamily: 'monospace', color: '#f97316', letterSpacing: 2 }}>
            {info.code}
          </span>
          <button onClick={() => copy(info.code, 'code')}
                  style={{
                    background: copied === 'code' ? '#10b981' : '#0f172a',
                    color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 10,
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
            {copied === 'code' ? <Check size={14} /> : <Copy size={14} />}
            {copied === 'code' ? 'تم النسخ' : 'نسخ'}
          </button>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', margin: '14px 0 6px' }}>رابط الدعوة</div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f1f5f9', borderRadius: 12, padding: '10px 14px', gap: 8,
        }}>
          <span style={{
            fontSize: 12, color: '#475569', fontWeight: 600, wordBreak: 'break-all',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {info.shareUrl}
          </span>
          <button onClick={() => copy(info.shareUrl, 'url')}
                  style={{
                    background: copied === 'url' ? '#10b981' : '#0f172a',
                    color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8,
                    fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                  }}>
            {copied === 'url' ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={shareWhatsApp}
                  style={{
                    flex: 1, background: '#25D366', color: '#fff', border: 'none',
                    padding: '12px', borderRadius: 12, fontWeight: 800, fontSize: 13,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
            <MessageCircle size={16} /> شارك عبر واتساب
          </button>
          <button onClick={shareNative}
                  style={{
                    background: '#0f172a', color: '#fff', border: 'none',
                    padding: '12px 18px', borderRadius: 12, fontWeight: 800, fontSize: 13,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {info.referrals.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Users size={16} style={{ color: '#f97316' }} />
            <span style={{ fontWeight: 900, color: '#0f172a' }}>
              مدعوّوك ({info.referrals.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {info.referrals.map((r) => (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 12px', background: '#f8fafc', borderRadius: 10,
              }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 13 }}>{r.userName}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{r.email || ''}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999,
                  background: r.status === 'activated' ? '#dcfce7' : '#fef3c7',
                  color: r.status === 'activated' ? '#15803d' : '#a16207',
                }}>
                  {r.status === 'activated' ? `✓ +${r.bonusLYD} د.ل` : '⏳ بانتظار الإيداع'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
