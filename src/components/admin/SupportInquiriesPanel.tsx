/**
 * SupportInquiriesPanel — admin view for the chat-widget inquiries.
 *
 * Mounted inside the existing /dashboard/admin?view=messages page so the
 * admin's communication hub stays in one place. Two tabs:
 *   - Inquiries (open/answered/closed) grouped by department.
 *   - Old "messages" view (unchanged) for legacy internal traffic.
 *
 * Replying:
 *   - logged-in user → sendInternalMessage (lands in their on-site inbox)
 *   - guest          → sendEmail (Resend / SMTP fallback)
 * Both paths are picked server-side; this component just sends the reply
 * text. The server returns deliveredVia: 'in-app' | 'email' | 'none'.
 */
import { useEffect, useState } from 'react';
import { authFetch } from '../../context/StoreContext';

interface Inquiry {
  id: string;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  department: string;
  subject: string | null;
  message: string;
  status: 'open' | 'answered' | 'closed';
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  userFirstName?: string;
  userLastName?: string;
  userEmail?: string;
  userPhone?: string;
}

const FILTERS: { id: string; label: string }[] = [
  { id: 'all',         label: 'الكل' },
  { id: 'open',        label: '🔴 مفتوحة' },
  { id: 'answered',    label: '✅ تم الرد' },
  { id: 'closed',      label: '⚪ مغلقة' },
];

const DEPT_FILTERS: { id: string; label: string }[] = [
  { id: 'all',          label: 'كل الأقسام' },
  { id: 'registration', label: 'إدارة التسجيل' },
  { id: 'customers',    label: 'إدارة العملاء' },
  { id: 'accounting',   label: 'إدارة المحاسبة' },
  { id: 'complaints',   label: 'إدارة الشكاوى' },
  { id: 'shipping',     label: 'إدارة الشحن' },
  { id: 'general',      label: 'استفسار عام' },
];

const DEPT_COLORS: Record<string, { bg: string; text: string }> = {
  registration: { bg: '#eff6ff', text: '#1e40af' },
  customers:    { bg: '#fef3c7', text: '#92400e' },
  accounting:   { bg: '#f0fdf4', text: '#166534' },
  complaints:   { bg: '#fef2f2', text: '#991b1b' },
  shipping:     { bg: '#faf5ff', text: '#6b21a8' },
  general:      { bg: '#f1f5f9', text: '#475569' },
};

export default function SupportInquiriesPanel() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [deptFilter, setDeptFilter] = useState('all');
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (deptFilter !== 'all') params.set('department', deptFilter);
      const res = await authFetch(`/api/admin/support/inquiries?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInquiries(data.inquiries || []);
        setLabels(data.departmentLabels || {});
      } else {
        showToast('فشل تحميل الاستفسارات');
      }
    } catch {
      showToast('خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, deptFilter]);

  async function sendReply(id: string) {
    if (!replyText.trim()) {
      showToast('نص الرد مطلوب');
      return;
    }
    setReplySending(true);
    try {
      const res = await authFetch(`/api/admin/support/inquiries/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const channel = data.deliveredVia === 'email' ? 'البريد الإلكتروني'
                      : data.deliveredVia === 'in-app' ? 'مركز رسائل المستخدم'
                      : 'لم يُسلَّم — تأكد من إعدادات الإيميل';
        showToast(`✅ تم إرسال الرد عبر ${channel}`);
        setReplyOpenId(null);
        setReplyText('');
        load();
      } else {
        showToast(data.error || 'فشل إرسال الرد');
      }
    } catch {
      showToast('خطأ في الاتصال');
    } finally {
      setReplySending(false);
    }
  }

  async function closeInquiry(id: string) {
    if (!confirm('إغلاق الاستفسار؟ يمكنك فتحه لاحقاً بتعديل قاعدة البيانات يدوياً.')) return;
    try {
      const res = await authFetch(`/api/admin/support/inquiries/${id}/close`, { method: 'POST' });
      if (res.ok) { showToast('تم الإغلاق'); load(); }
    } catch {}
  }

  function senderLine(i: Inquiry) {
    if (i.userId) {
      return `👤 ${i.userFirstName || ''} ${i.userLastName || ''}`.trim() || '👤 مستخدم مسجَّل';
    }
    return `🚶 ${i.guestName || 'زائر'}`;
  }

  function senderContact(i: Inquiry) {
    if (i.userId) {
      return [i.userEmail, i.userPhone].filter(Boolean).join(' · ');
    }
    return i.guestEmail || '';
  }

  return (
    <div dir="rtl" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800">📩 مركز الدعم — استفسارات الزوار</h2>
          <p className="text-slate-500 text-sm font-bold mt-1">
            استفسارات قادمة من أيقونة الدردشة في الصفحات العامة (مسجَّلون و زوار)
          </p>
        </div>
        <button onClick={load}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-black transition-colors">
          🔄 تحديث
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-2">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setStatusFilter(f.id)}
              className={`text-xs font-black px-3 py-1.5 rounded-lg transition-colors ${
                statusFilter === f.id ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-orange-300'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          aria-label="تصفية حسب القسم"
          className="text-xs font-black bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-orange-400">
          {DEPT_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="divide-y divide-slate-100">
        {loading && (
          <div className="p-12 text-center text-slate-400 font-bold">...جاري التحميل</div>
        )}
        {!loading && inquiries.length === 0 && (
          <div className="p-12 text-center text-slate-400 font-bold">
            ✨ لا توجد استفسارات في هذا التصنيف
          </div>
        )}
        {!loading && inquiries.map(i => {
          const deptColor = DEPT_COLORS[i.department] || DEPT_COLORS.general;
          const isOpen = replyOpenId === i.id;
          const ageHours = Math.round((Date.now() - new Date(i.createdAt).getTime()) / 3600000);
          return (
            <div key={i.id} className={`p-5 ${i.status === 'open' ? 'bg-orange-50/30' : ''}`}>
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1">
                    <span className="font-black text-slate-800 text-sm">{senderLine(i)}</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded"
                      style={{ background: deptColor.bg, color: deptColor.text }}>
                      {labels[i.department] || i.department}
                    </span>
                    {i.status === 'open' && <span className="text-[10px] font-black bg-rose-100 text-rose-700 px-2 py-0.5 rounded">🔴 مفتوحة</span>}
                    {i.status === 'answered' && <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">✅ تم الرد</span>}
                    {i.status === 'closed' && <span className="text-[10px] font-black bg-slate-200 text-slate-600 px-2 py-0.5 rounded">مغلقة</span>}
                    {i.userId
                      ? <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">مسجَّل</span>
                      : <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded">زائر</span>}
                  </div>
                  <div className="text-xs text-slate-500 font-bold" dir="ltr">{senderContact(i)}</div>
                </div>
                <div className="text-[10px] text-slate-400 text-left whitespace-nowrap">
                  منذ {ageHours} ساعة
                  <div className="font-mono">{new Date(i.createdAt).toLocaleString('en-US')}</div>
                </div>
              </div>

              {/* Subject + Message */}
              {i.subject && <div className="font-black text-slate-700 text-sm mb-1">{i.subject}</div>}
              <div className="bg-white border border-slate-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap">
                {i.message}
              </div>

              {/* Existing reply */}
              {i.adminReply && (
                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="text-[11px] font-black text-emerald-700 mb-1">
                    ✅ ردك ({i.repliedAt ? new Date(i.repliedAt).toLocaleString('en-US') : ''})
                  </div>
                  <div className="text-sm text-slate-700 whitespace-pre-wrap">{i.adminReply}</div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-3 flex gap-2 flex-wrap">
                {i.status !== 'closed' && (
                  <button onClick={() => { setReplyOpenId(isOpen ? null : i.id); setReplyText(''); }}
                    className="text-xs font-black bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                    {isOpen ? 'إلغاء' : (i.adminReply ? '📤 رد إضافي' : '📤 رد')}
                  </button>
                )}
                {i.status !== 'closed' && i.adminReply && (
                  <button onClick={() => closeInquiry(i.id)}
                    className="text-xs font-black bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                    إغلاق الاستفسار
                  </button>
                )}
              </div>

              {/* Reply form */}
              {isOpen && (
                <div className="mt-3 bg-orange-50/40 border border-orange-200 rounded-xl p-3 space-y-2">
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                    rows={4} placeholder="اكتب ردك هنا..."
                    className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-bold outline-none focus:border-orange-500 resize-vertical" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setReplyOpenId(null)}
                      className="text-xs font-black bg-slate-200 text-slate-700 px-4 py-2 rounded-lg">
                      إلغاء
                    </button>
                    <button onClick={() => sendReply(i.id)} disabled={replySending}
                      className="text-xs font-black bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg disabled:opacity-60">
                      {replySending ? '...جاري الإرسال' : (i.userId ? '📨 إرسال للمستخدم' : '📧 إرسال بالإيميل')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-full font-bold text-sm shadow-2xl z-[10000]">
          {toast}
        </div>
      )}
    </div>
  );
}
