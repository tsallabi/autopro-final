import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, UserX, Clock, Phone, Mail, Building, FileText, Download, AlertCircle, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { authFetch } from '../../context/StoreContext';

interface KycReviewPanelProps {
  kycUsers: any[];
  setKycUsers: (users: any[]) => void;
  showAlert: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type Tab = 'pending' | 'rejected' | 'all';

// [kyc-rejected-tab] Normalize Libya phone numbers for wa.me — strip
// non-digits, prepend 218 if the user typed local 09… format.
const toWaLink = (phone: string, text: string): string => {
  let digits = String(phone).replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = '218' + digits.slice(1);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
};

export const KycReviewPanel: React.FC<KycReviewPanelProps> = ({ kycUsers, setKycUsers, showAlert }) => {
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('pending');
  const [counts, setCounts] = useState<{ pending: number; rejected: number; approved: number }>({ pending: 0, rejected: 0, approved: 0 });

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/admin/kyc-pending?filter=${tab}`)
      .then(res => res.json())
      .then(data => {
        setKycUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => {
        console.error('[kyc-pending] load failed', e);
        setLoading(false);
      });
    // Counts refresh in parallel — cheap aggregate query.
    authFetch('/api/admin/kyc-counts')
      .then(res => res.json())
      .then(data => setCounts({
        pending: data?.pending || 0,
        rejected: data?.rejected || 0,
        approved: data?.approved || 0,
      }))
      .catch(() => {});
  }, [refresh, setKycUsers, tab]);

  const handleKycAction = async (userId: string, action: 'approve' | 'reject') => {
    const isApprove = action === 'approve';
    const message = isApprove
      ? 'اعتماد KYC لهذا المستخدم؟\n\nملاحظة: هذا يعتمد الهوية فقط — لا يفعّل المزايدة. لتفعيل المزايدة، استخدم الزر المنفصل في صفحة "إدارة المستخدمين".'
      : 'رفض طلب التوثيق؟ سيتلقى المستخدم إشعاراً بالرفض ويظهر في تبويب "مرفوضة" لمتابعته.';
    if (!window.confirm(message)) return;

    try {
      const res = await authFetch(`/api/admin/users/${userId}/kyc`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showAlert(isApprove ? '✅ تم اعتماد KYC' : '❌ تم رفض الطلب — نُقل إلى تبويب "مرفوضة"', 'success');
        setRefresh(r => r + 1);
      } else {
        showAlert(data.error || 'فشلت العملية', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    }
  };

  // [kyc-rejected-tab] Re-open a previously rejected KYC so the user can
  // resubmit. Doesn't touch the user record itself — just flips status
  // back to 'pending' and re-opens any rejected docs for re-review.
  const handleReopen = async (userId: string) => {
    if (!window.confirm('إعادة فتح طلب التوثيق؟\n\nسيرجع المستخدم إلى قائمة المعلقين ويمكنه إعادة رفع الوثائق.')) return;
    try {
      const res = await authFetch(`/api/admin/users/${userId}/kyc-reopen`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showAlert('🔄 تم إعادة فتح الطلب — نُقل إلى "بانتظار المراجعة"', 'success');
        setRefresh(r => r + 1);
      } else {
        showAlert(data.error || 'فشل إعادة الفتح', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    }
  };

  const getInitial = (u: any) => {
    const s = String(u?.firstName || u?.email || u?.id || '?');
    return s.charAt(0).toUpperCase();
  };

  const docTypeLabel = (t: string) => {
    const map: Record<string, string> = {
      passport: '🛂 جواز سفر',
      national_id: '🪪 هوية وطنية',
      drivers_license: '🚗 رخصة قيادة',
      trade_license: '📜 سجل تجاري',
      commercial_register: '📜 سجل تجاري',
      proof_of_address: '🏠 إثبات سكن',
      kyc: '📋 وثيقة KYC',
    };
    return map[t] || (t || '📄 وثيقة');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-violet-500" />
            مراجعة طلبات التوثيق (KYC Center)
          </h2>
          <p className="text-slate-500 font-bold text-sm mt-1">المرفوضون لا يُحذفون — يبقون في تبويب "مرفوضة" للمتابعة</p>
        </div>
      </div>

      {/* [kyc-rejected-tab] Tab bar */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        <button
          onClick={() => setTab('pending')}
          className={`px-5 py-2.5 rounded-2xl font-black text-sm border-2 transition-all flex items-center gap-2 ${
            tab === 'pending'
              ? 'bg-violet-600 text-white border-violet-600 shadow-lg shadow-violet-500/20'
              : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          بانتظار المراجعة
          <span className={`text-xs px-2 py-0.5 rounded-full ${tab === 'pending' ? 'bg-white/20' : 'bg-slate-100'}`}>
            {counts.pending}
          </span>
        </button>
        <button
          onClick={() => setTab('rejected')}
          className={`px-5 py-2.5 rounded-2xl font-black text-sm border-2 transition-all flex items-center gap-2 ${
            tab === 'rejected'
              ? 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-500/20'
              : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
          }`}
        >
          <UserX className="w-4 h-4" />
          مرفوضة (للمتابعة)
          <span className={`text-xs px-2 py-0.5 rounded-full ${tab === 'rejected' ? 'bg-white/20' : 'bg-rose-100'}`}>
            {counts.rejected}
          </span>
        </button>
        <button
          onClick={() => setTab('all')}
          className={`px-5 py-2.5 rounded-2xl font-black text-sm border-2 transition-all flex items-center gap-2 ${
            tab === 'all'
              ? 'bg-slate-800 text-white border-slate-800'
              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
          }`}
        >
          الكل (غير المعتمدين)
          <span className={`text-xs px-2 py-0.5 rounded-full ${tab === 'all' ? 'bg-white/20' : 'bg-slate-100'}`}>
            {counts.pending + counts.rejected}
          </span>
        </button>
      </div>

      {loading && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <div className="text-slate-400 font-bold">...جاري التحميل</div>
        </div>
      )}

      {!loading && kycUsers.length === 0 && (
        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] p-20 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <UserCheck className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-black text-slate-400 italic">لا توجد طلبات توثيق معلقة حالياً</h3>
          <p className="text-slate-400 text-sm mt-2">سيظهر المشترون والتجار الجدد هنا بمجرد التسجيل.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {!loading && kycUsers.map((user: any) => {
          const isExpanded = expandedUserId === user.id;
          const docs: any[] = Array.isArray(user.documents) ? user.documents : [];
          const isSeller = String(user.role || '').toLowerCase() === 'seller';
          return (
          <div key={user.id} className="bg-white rounded-[3rem] border border-slate-200 shadow-sm hover:shadow-2xl hover:border-violet-300 transition-all overflow-hidden flex flex-col group">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/50 relative">
              <div className="flex justify-between items-start flex-wrap gap-3">
                <div className="flex items-center gap-4 flex-1 min-w-[200px]">
                  <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-2xl font-black text-violet-500 shadow-inner border-2 border-slate-100 shrink-0">
                    {getInitial(user)}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-slate-800 tracking-tighter truncate">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.id}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 mt-1 uppercase tracking-widest flex-wrap">
                      {isSeller
                        ? <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">تاجر</span>
                        : <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">مشتري</span>}
                      {user.kycStatus === 'rejected' && (
                        <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded">❌ مرفوض</span>
                      )}
                      <span>{user.status || 'pending'}</span>
                    </div>
                  </div>
                </div>
                <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-[10px] font-black text-slate-500 uppercase">
                  #{String(user.id).slice(-6)}
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div className="p-6 space-y-3">
              {user.phone && (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg"><Phone className="w-4 h-4 text-slate-500" /></div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">رقم الهاتف</div>
                    <div className="text-sm font-black text-slate-700 truncate" dir="ltr">{user.phone}</div>
                  </div>
                </div>
              )}
              {user.email && (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg"><Mail className="w-4 h-4 text-slate-500" /></div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">البريد الإلكتروني</div>
                    <div className="text-sm font-black text-slate-700 truncate" dir="ltr">{user.email}</div>
                  </div>
                </div>
              )}
              {user.companyName && (
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg"><Building className="w-4 h-4 text-slate-500" /></div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">الشركة</div>
                    <div className="text-sm font-black text-slate-700 truncate">{user.companyName}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Documents */}
            <div className="px-6 pb-6">
              <div className="bg-slate-900 rounded-2xl p-5 text-white relative overflow-hidden">
                <h4 className="text-xs font-black text-slate-400 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-violet-400" />
                  المستندات المرفوعة ({docs.length})
                </h4>
                {docs.length === 0 ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-bold rounded-xl p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>
                      لم يرفع المستخدم أيّ وثائق بعد. يمكنك اعتماد KYC يدوياً إذا تحقّقت من هويته خارج النظام (مكتب / واتساب / مكالمة).
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(isExpanded ? docs : docs.slice(0, 2)).map((d: any) => (
                      <a
                        key={d.id || d.fileUrl}
                        href={d.fileUrl || d.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full bg-white/5 hover:bg-white/10 p-3 rounded-xl flex items-center justify-between transition-all border border-white/5 text-white no-underline"
                      >
                        <div className="text-xs font-bold">{docTypeLabel(d.docType || d.type)}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">{d.status || 'pending'}</span>
                          <Download className="w-4 h-4 text-slate-300" />
                        </div>
                      </a>
                    ))}
                    {docs.length > 2 && (
                      <button
                        onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                        className="w-full text-[10px] font-bold text-violet-300 hover:text-violet-200 py-2 flex items-center justify-center gap-1"
                      >
                        {isExpanded ? <>إخفاء <ChevronUp className="w-3 h-3" /></> : <>عرض {docs.length - 2} وثائق إضافية <ChevronDown className="w-3 h-3" /></>}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-6 mt-auto bg-slate-50/50 border-t border-slate-100 flex gap-2 flex-wrap">
              {user.kycStatus === 'rejected' ? (
                <>
                  {/* [kyc-rejected-tab] Rejected users keep their record but
                      get follow-up actions: re-open, approve directly after
                      out-of-band verification, or contact via WhatsApp/email. */}
                  <button
                    onClick={() => handleReopen(user.id)}
                    className="flex-1 min-w-[140px] bg-amber-500 hover:bg-amber-600 text-white font-black py-3 rounded-2xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                    title="إرجاع المستخدم إلى قائمة المعلقين ليُعيد رفع الوثائق"
                  >
                    <RotateCcw className="w-5 h-5" />
                    إعادة فتح
                  </button>
                  <button onClick={() => handleKycAction(user.id, 'approve')} className="px-5 bg-white text-emerald-600 font-black py-3 rounded-2xl border border-emerald-200 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2">
                    <UserCheck className="w-5 h-5" />
                    اعتماد
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => handleKycAction(user.id, 'approve')} className="flex-1 min-w-[140px] bg-emerald-600 text-white font-black py-3 rounded-2xl shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                    <UserCheck className="w-5 h-5" />
                    اعتماد KYC
                  </button>
                  <button onClick={() => handleKycAction(user.id, 'reject')} className="px-5 bg-white text-rose-600 font-black py-3 rounded-2xl border border-rose-200 hover:bg-rose-50 transition-all flex items-center justify-center gap-2">
                    <UserX className="w-5 h-5" />
                    رفض
                  </button>
                </>
              )}

              {/* Always-available outreach buttons */}
              {user.phone && (
                <a
                  href={toWaLink(
                    user.phone,
                    `مرحباً ${user.firstName || ''}،\n\nبخصوص توثيق حسابك على AutoPro Libya — نحتاج لإكمال بعض الإجراءات. يرجى التواصل معنا.\n\nشكراً.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 bg-white text-green-600 font-black py-3 rounded-2xl border border-green-200 hover:bg-green-50 transition-all flex items-center justify-center"
                  title={`واتساب ${user.phone}`}
                >
                  💚
                </a>
              )}
              {user.email && (
                <a
                  href={`mailto:${user.email}?subject=${encodeURIComponent('بخصوص توثيق حسابك على AutoPro Libya')}&body=${encodeURIComponent(`مرحباً ${user.firstName || ''}،\n\nبخصوص توثيق حسابك (KYC) على AutoPro Libya — نحتاج لإكمال بعض الإجراءات. يرجى التواصل معنا أو إعادة رفع الوثائق المطلوبة.\n\nشكراً،\nفريق AutoPro Libya`)}`}
                  className="px-4 bg-white text-sky-600 font-black py-3 rounded-2xl border border-sky-200 hover:bg-sky-50 transition-all flex items-center justify-center"
                  title={`إيميل ${user.email}`}
                >
                  📧
                </a>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
