import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, UserX, Clock, MapPin, Phone, Mail, Building, FileText, Download, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { authFetch } from '../../context/StoreContext';

interface KycReviewPanelProps {
  kycUsers: any[];
  setKycUsers: (users: any[]) => void;
  showAlert: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const KycReviewPanel: React.FC<KycReviewPanelProps> = ({ kycUsers, setKycUsers, showAlert }) => {
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    // authFetch (not raw fetch) so the admin's JWT travels with the
    // request — /api/admin/kyc-pending requires admin role. Previously
    // the panel silently showed "no pending" because the unauthenticated
    // call returned 401 and the catch swallowed the error.
    authFetch('/api/admin/kyc-pending')
      .then(res => res.json())
      .then(data => {
        setKycUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => {
        console.error('[kyc-pending] load failed', e);
        setLoading(false);
      });
  }, [refresh, setKycUsers]);

  const handleKycAction = async (userId: string, action: 'approve' | 'reject') => {
    const isApprove = action === 'approve';
    const message = isApprove
      ? 'اعتماد KYC لهذا المستخدم؟\n\nملاحظة: هذا يعتمد الهوية فقط — لا يفعّل المزايدة. لتفعيل المزايدة، استخدم الزر المنفصل في صفحة "إدارة المستخدمين".'
      : 'رفض طلب التوثيق؟ سيتلقى المستخدم إشعاراً بالرفض.';
    if (!window.confirm(message)) return;

    try {
      const res = await authFetch(`/api/admin/users/${userId}/kyc`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showAlert(isApprove ? '✅ تم اعتماد KYC' : '❌ تم رفض الطلب', 'success');
        setRefresh(r => r + 1);
      } else {
        showAlert(data.error || 'فشلت العملية', 'error');
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
      <div className="flex justify-between items-center mb-10 flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-violet-500" />
            مراجعة طلبات التوثيق (KYC Center)
          </h2>
          <p className="text-slate-500 font-bold text-sm mt-1">جميع المشتركين والتجار بانتظار توثيق الهوية (يظهرون هنا حتى بدون رفع وثائق)</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-violet-50 text-violet-600 px-6 py-3 rounded-2xl font-black text-sm border border-violet-100 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            بانتظار المراجعة: {kycUsers.length}
          </div>
        </div>
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
            <div className="p-6 mt-auto bg-slate-50/50 border-t border-slate-100 flex gap-3 flex-wrap">
              <button onClick={() => handleKycAction(user.id, 'approve')} className="flex-1 min-w-[140px] bg-emerald-600 text-white font-black py-3 rounded-2xl shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2">
                <UserCheck className="w-5 h-5" />
                اعتماد KYC
              </button>
              <button onClick={() => handleKycAction(user.id, 'reject')} className="px-6 bg-white text-rose-600 font-black py-3 rounded-2xl border border-rose-200 hover:bg-rose-50 transition-all flex items-center justify-center gap-2">
                <UserX className="w-5 h-5" />
                رفض
              </button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
};
