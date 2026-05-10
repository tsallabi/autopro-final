/**
 * SupportChatWidget — floating chat button visible to every visitor
 * (logged in or not). Lets them send an inquiry to one of five
 * AutoPro departments. The reply path is decided server-side:
 *
 *   - Logged-in users: reply lands in their on-site message center.
 *   - Guests: reply goes to the email they typed in.
 *
 * Mounted globally in App.tsx so it appears on every public route.
 * Hidden on /dashboard/* views to avoid getting in the way of the
 * admin's own UI (the admin already has the messages center).
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '../context/StoreContext';

const DEPARTMENTS: { id: string; label: string; icon: string }[] = [
  { id: 'registration', label: 'إدارة التسجيل',   icon: '📝' },
  { id: 'customers',    label: 'إدارة العملاء',    icon: '👥' },
  { id: 'accounting',   label: 'إدارة المحاسبة',   icon: '💰' },
  { id: 'complaints',   label: 'إدارة الشكاوى',    icon: '⚠️' },
  { id: 'shipping',     label: 'إدارة الشحن',      icon: '🚚' },
];

export default function SupportChatWidget() {
  const { currentUser } = useStore();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'pick' | 'form' | 'sent'>('pick');
  const [department, setDepartment] = useState<string>('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Hide on dashboard / admin views — the admin has the messages center.
  const onDashboard = location.pathname.startsWith('/dashboard');

  // Prefill name for logged-in users.
  useEffect(() => {
    if (currentUser) {
      const full = `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim();
      if (full) setName(full);
      if (currentUser.email) setEmail(currentUser.email);
    }
  }, [currentUser]);

  function reset() {
    setStep('pick');
    setDepartment('');
    setSubject('');
    setMessage('');
    setError(null);
    setSuccessMsg(null);
    if (!currentUser) {
      setName('');
      setEmail('');
    }
  }

  function close() {
    setOpen(false);
    setTimeout(reset, 300);
  }

  async function submit() {
    setError(null);
    if (!message.trim()) {
      setError('نص الرسالة مطلوب');
      return;
    }
    if (!currentUser) {
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setError('البريد الإلكتروني مطلوب لاستلام الرد');
        return;
      }
    }
    setSending(true);
    try {
      const token = localStorage.getItem('authToken') || '';
      const res = await fetch('/api/support/inquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          department,
          subject: subject.trim() || undefined,
          message: message.trim(),
          name: name.trim() || undefined,
          email: email.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSuccessMsg(data.message || 'تم الإرسال بنجاح');
        setStep('sent');
      } else {
        setError(data.error || 'فشل الإرسال — حاول مجدداً');
      }
    } catch {
      setError('خطأ في الاتصال بالخادم');
    } finally {
      setSending(false);
    }
  }

  if (onDashboard) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="تواصل معنا"
        aria-label="تواصل مع الدعم"
        style={{
          position: 'fixed',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
          right: 24,
          zIndex: 9990,
          background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 60,
          height: 60,
          fontSize: 28,
          cursor: 'pointer',
          boxShadow: '0 8px 20px rgba(234,88,12,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >
        💬
      </button>
    );
  }

  const selectedDept = DEPARTMENTS.find(d => d.id === department);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        right: 24,
        zIndex: 9991,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        maxHeight: 'calc(100vh - 80px)',
        background: '#fff',
        borderRadius: 20,
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", "Cairo", sans-serif',
      }}
      dir="rtl"
    >
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
        color: '#fff',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>💬 مركز الدعم — AutoPro</div>
          <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>نرد عادة خلال ساعات قليلة</div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="إغلاق"
          style={{
            background: 'rgba(255,255,255,0.2)', border: 'none',
            width: 32, height: 32, borderRadius: 16,
            color: '#fff', fontSize: 18, cursor: 'pointer',
            lineHeight: 1,
          }}
        >×</button>
      </div>

      {/* Body */}
      <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
        {step === 'pick' && (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#475569', fontWeight: 600 }}>
              اختر القسم المناسب لاستفسارك:
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {DEPARTMENTS.map(d => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => { setDepartment(d.id); setStep('form'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    border: '1px solid #e2e8f0', background: '#f8fafc',
                    cursor: 'pointer', fontSize: 14, fontWeight: 700,
                    color: '#0f172a', textAlign: 'right',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fff7ed'; e.currentTarget.style.borderColor = '#fb923c'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                >
                  <span style={{ fontSize: 22 }}>{d.icon}</span>
                  <span>{d.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'form' && (
          <>
            <button
              type="button"
              onClick={() => setStep('pick')}
              style={{
                background: 'transparent', border: 'none',
                color: '#ea580c', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', marginBottom: 8, padding: 0,
              }}
            >→ تغيير القسم</button>
            <div style={{
              background: '#fff7ed', border: '1px solid #fed7aa',
              padding: 10, borderRadius: 10, marginBottom: 12,
              fontSize: 13, fontWeight: 700, color: '#9a3412',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 18 }}>{selectedDept?.icon}</span>
              {selectedDept?.label}
            </div>

            {!currentUser && (
              <>
                <Field label="الاسم">
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="اسمك (اختياري)" style={inp} />
                </Field>
                <Field label="البريد الإلكتروني *">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="email@example.com" style={inp} required />
                </Field>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 12px' }}>
                  💡 سنرسل الرد إلى بريدك الإلكتروني لأنك غير مسجَّل.
                </p>
              </>
            )}

            {currentUser && (
              <p style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, margin: '0 0 12px',
                background: '#f0fdf4', padding: 8, borderRadius: 8, border: '1px solid #bbf7d0' }}>
                ✅ مسجَّل دخول كـ {currentUser.firstName}. سيصلك الرد في مركز الرسائل بحسابك.
              </p>
            )}

            <Field label="الموضوع (اختياري)">
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="عنوان مختصر" style={inp} />
            </Field>
            <Field label="الرسالة *">
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                rows={4} placeholder="اكتب استفسارك بالتفصيل..."
                style={{ ...inp, resize: 'vertical', minHeight: 80 }} />
            </Field>

            {error && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca',
                color: '#991b1b', padding: 8, borderRadius: 8,
                fontSize: 12, fontWeight: 700, marginBottom: 10,
              }}>{error}</div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={sending}
              style={{
                width: '100%', padding: '12px 16px', borderRadius: 12,
                background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 800,
                opacity: sending ? 0.6 : 1,
                boxShadow: '0 4px 12px rgba(234,88,12,0.3)',
              }}
            >
              {sending ? '...جاري الإرسال' : '📤 إرسال الاستفسار'}
            </button>
          </>
        )}

        {step === 'sent' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
              تم الإرسال بنجاح!
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
              {successMsg}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 10,
                  background: '#f1f5f9', color: '#475569', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700,
                }}
              >
                استفسار آخر
              </button>
              <button
                type="button"
                onClick={close}
                style={{
                  flex: 1, padding: '10px 16px', borderRadius: 10,
                  background: '#ea580c', color: '#fff', border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 700,
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1.5px solid #e2e8f0',
  borderRadius: 10,
  fontFamily: 'inherit',
  outline: 'none',
  marginBottom: 10,
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 4 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
