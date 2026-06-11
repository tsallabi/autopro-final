/**
 * DepositInfoModal — "كيف يعمل العربون؟" risk-free explanation modal.
 * Triggered by the green info button on the deposit page. Designed to
 * remove the psychological friction of handing money to a new platform.
 */
import { X, Shield, Wallet, RefreshCcw, TrendingUp } from 'lucide-react';

const POINTS = [
  {
    icon: Wallet,
    color: '#10b981',
    title: 'مالك ١٠٠٪ — قابل للسحب أي وقت',
    body: 'العربون ليس رسوماً. هو رصيدك في محفظتك. لو ما زايدت، تسحبه كاملاً متى شئت.',
  },
  {
    icon: Shield,
    color: '#3b82f6',
    title: 'محفظتك مأمّنة في حساب منفصل',
    body: 'أموال الزبائن محفوظة في حساب بنكي منفصل عن أموال الشركة — لا تُمسّ إلا بإذنك.',
  },
  {
    icon: RefreshCcw,
    color: '#f59e0b',
    title: 'ضمان استرداد كامل خلال 7 أيام',
    body: 'لم تجد ما يعجبك؟ اطلب الاسترداد خلال أوّل 7 أيام بدون أي أسئلة.',
  },
  {
    icon: TrendingUp,
    color: '#f97316',
    title: 'قوة شرائية × 10',
    body: 'العربون 200 د.ل = قوة شرائية 2,000 د.ل. مالك يعمل لك — تستطيع المزايدة على سيارات بقيمة أكبر بكثير.',
  },
];

export default function DepositInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        style={{
          background: '#fff', borderRadius: 20, maxWidth: 540, width: '100%',
          maxHeight: '90vh', overflowY: 'auto', position: 'relative',
        }}
      >
        <div style={{
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: '#fff', padding: '20px 24px', position: 'relative',
        }}>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            style={{
              position: 'absolute', top: 16, left: 16, background: 'rgba(255,255,255,0.2)',
              border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 999,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>💰 كيف يعمل العربون؟</h2>
          <p style={{ fontSize: 13, opacity: 0.95, marginTop: 6, marginBottom: 0 }}>
            بدون مخاطرة — أموالك تبقى أموالك
          </p>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {POINTS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={i} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                padding: 14, background: '#f8fafc', borderRadius: 14,
                border: '1px solid #e2e8f0',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${p.color}1f`, color: p.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={22} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, color: '#0f172a', fontSize: 14, marginBottom: 4 }}>
                    {p.title}
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
                    {p.body}
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={onClose}
            style={{
              background: '#f97316', color: '#fff', border: 'none',
              padding: '14px 24px', borderRadius: 12, fontWeight: 900, fontSize: 14,
              cursor: 'pointer', marginTop: 6,
            }}
          >
            ✓ فهمت — أكمل
          </button>
        </div>
      </div>
    </div>
  );
}
