/**
 * PaymentVerificationPanel — admin-only floating button + dialog.
 *
 * Replaces the dangerous "approve" button in the legacy AdminDashboard
 * payment_requests view. Forces the admin to:
 *   1. Review each pending request
 *   2. Confirm the actual amount received (may differ from requested)
 *   3. Optionally upload/link a receipt
 *   4. Then verify-and-credit in ONE atomic action
 *
 * Or alternatively: contact the user via templates, or reject with reason.
 *
 * Phase 3 additions:
 *   - Reports tab (daily/weekly/monthly aggregates)
 *   - Overdue banner with one-click "remind all" batch notification
 *   - Receipt link rendered inline on each request
 *
 * Mount via:
 *   import PaymentVerificationPanel from '@/components/admin/PaymentVerificationPanel';
 *   {currentUser?.role === 'admin' && <PaymentVerificationPanel />}
 */
import { useEffect, useState } from 'react';

interface Request {
  id: string;
  userId: string;
  amount: number;
  method: string;
  referenceNo?: string;
  status: string;
  verification_status: string;
  requestedAt: string;
  bankReceiptUrl?: string;
  referenceFromBank?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  country?: string;
  kycStatus?: string;
  currentDeposit?: number;
}

interface Stats {
  pending: { count: number; totalAmount: number };
  overdue24h: number;
  verifiedThisWeek: { count: number; totalAmount: number };
  rejectedThisWeek: number;
}

interface Report {
  period: string;
  since: string;
  verified: { count: number; totalReceived: number; totalRequested: number; delta: number };
  rejected: { count: number };
  avgWaitHours: number;
  byMethod: Array<{ method: string; count: number; total: number }>;
  topUsers: Array<{ userId: string; firstName?: string; lastName?: string; email?: string; deposits: number; total: number }>;
}

const TEMPLATE_LABELS: Record<string, string> = {
  'request-receipt': '📎 طلب صورة وصل التحويل',
  'received-confirm': '✅ تأكيد استلام المبلغ',
  'call-us': '📞 اتصل بنا',
  'amount-mismatch': '⚠️ المبلغ لا يطابق',
  'transfer-not-found': '❌ لم نجد التحويل',
};

const PERIOD_LABELS: Record<string, string> = {
  daily: 'اليوم',
  weekly: 'هذا الأسبوع',
  monthly: 'هذا الشهر',
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: '🏦 تحويل بنكي',
  cash: '💵 نقداً',
  unknown: 'غير محدد',
};

async function authFetch(url: string, init?: RequestInit) {
  const token = localStorage.getItem('authToken') || '';
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

export default function PaymentVerificationPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'queue' | 'report'>('queue');
  const [requests, setRequests] = useState<Request[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // verify-and-credit form
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'verify' | 'reject' | 'contact' | null>(null);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [bankReceiptUrl, setBankReceiptUrl] = useState('');
  const [referenceFromBank, setReferenceFromBank] = useState('');
  const [verificationNote, setVerificationNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [contactTemplate, setContactTemplate] = useState('request-receipt');
  const [contactCustom, setContactCustom] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  async function load() {
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.all([
        authFetch('/api/admin/payment-verifications/queue'),
        authFetch('/api/admin/payment-verifications/stats'),
      ]);
      const qData = await qRes.json();
      const sData = await sRes.json();
      setRequests(qData?.requests || []);
      setStats(sData);
    } catch {
      showToast('فشل تحميل الطلبات');
    } finally {
      setLoading(false);
    }
  }

  async function loadReport(p: 'daily' | 'weekly' | 'monthly') {
    setReportLoading(true);
    try {
      const res = await authFetch(`/api/admin/payment-verifications/report?period=${p}`);
      const data = await res.json();
      if (res.ok) setReport(data);
      else showToast(data?.error || 'فشل تحميل التقرير');
    } catch {
      showToast('خطأ في الاتصال');
    } finally {
      setReportLoading(false);
    }
  }

  async function notifyOverdue() {
    if (!confirm('سيتم إرسال تذكير لجميع المستخدمين الذين لديهم طلبات معلقة منذ +24 ساعة. متابعة؟')) return;
    try {
      const res = await authFetch('/api/admin/payment-verifications/notify-overdue', { method: 'POST' });
      const data = await res.json();
      if (res.ok) showToast(`✓ أُرسلت ${data.sent} تذكيرات من ${data.total}`);
      else showToast(data?.error || 'فشل الإرسال');
    } catch {
      showToast('خطأ في الاتصال');
    }
  }

  useEffect(() => {
    if (open && tab === 'queue') load();
    if (open && tab === 'report') loadReport(period);
  }, [open, tab, period]);

  function startAction(req: Request, type: 'verify' | 'reject' | 'contact') {
    setActiveId(req.id);
    setActionType(type);
    setReceivedAmount(String(req.amount));
    setBankReceiptUrl(req.bankReceiptUrl || '');
    setReferenceFromBank(req.referenceFromBank || req.referenceNo || '');
    setVerificationNote('');
    setRejectReason('');
    setContactTemplate('request-receipt');
    setContactCustom('');
  }

  function cancelAction() {
    setActiveId(null);
    setActionType(null);
  }

  async function handleVerify() {
    if (!activeId) return;
    const amt = Number(receivedAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('المبلغ غير صحيح');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/payment-verifications/${activeId}/verify-and-credit`, {
        method: 'POST',
        body: JSON.stringify({
          receivedAmount: amt,
          bankReceiptUrl: bankReceiptUrl.trim() || null,
          referenceFromBank: referenceFromBank.trim() || null,
          verificationNote: verificationNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✓ تم الاعتماد وأُضيف ${amt.toLocaleString('en-US')}`);
        cancelAction();
        load();
      } else {
        showToast(data?.error || 'فشل الاعتماد');
      }
    } catch {
      showToast('خطأ في الاتصال');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!activeId) return;
    if (!rejectReason.trim()) {
      showToast('السبب مطلوب');
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/admin/payment-verifications/${activeId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('✓ تم الرفض وإبلاغ المستخدم');
        cancelAction();
        load();
      } else {
        showToast(data?.error || 'فشل الرفض');
      }
    } catch {
      showToast('خطأ في الاتصال');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleContact() {
    if (!activeId) return;
    setSubmitting(true);
    try {
      const body: any = { template: contactTemplate };
      if (contactCustom.trim()) body.message = contactCustom.trim();
      const res = await authFetch(`/api/admin/payment-verifications/${activeId}/contact-user`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('✓ تم إرسال الرسالة');
        cancelAction();
      } else {
        showToast(data?.error || 'فشل الإرسال');
      }
    } catch {
      showToast('خطأ في الاتصال');
    } finally {
      setSubmitting(false);
    }
  }

  const ageHours = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.round(ms / 3600000);
  };

  if (!open) {
    const pendingCount = stats?.pending?.count ?? requests.length;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="مراجعة طلبات شحن المحفظة"
        style={{
          position: 'fixed',
          bottom: 288,
          left: 20,
          zIndex: 9996,
          background: pendingCount > 0 ? '#dc2626' : '#16a34a',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 56,
          height: 56,
          fontSize: 22,
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(220,38,38,0.35)',
        }}
      >
        💰
        {pendingCount > 0 && (
          <span style={{
            position: 'absolute',
            top: -4, right: -4,
            background: '#fff',
            color: '#dc2626',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 800,
            minWidth: 22,
            height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 6px',
            border: '2px solid #dc2626',
          }}>{pendingCount}</span>
        )}
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={() => !activeId && setOpen(false)}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 1100,
          maxHeight: '92vh',
          overflow: 'auto',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", "Cairo", sans-serif',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 20,
          borderBottom: '1px solid #eee',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          background: '#fff',
          zIndex: 2,
        }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>💰 مراجعة طلبات شحن المحفظة</h2>
          <button onClick={() => setOpen(false)} type="button"
            style={{ background: 'transparent', border: 'none', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #eee', background: '#f8fafc' }}>
          <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')}>قائمة الانتظار</TabBtn>
          <TabBtn active={tab === 'report'} onClick={() => setTab('report')}>📊 التقارير</TabBtn>
        </div>

        {tab === 'queue' && (
          <>
            {/* Stats */}
            {stats && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: 16, background: '#f8fafc' }}>
                <Kpi label="معلّق الآن" value={stats.pending.count} sub={`$${stats.pending.totalAmount.toLocaleString('en-US')}`} color="#f59e0b" />
                <Kpi label="متأخر +24س" value={stats.overdue24h} color="#dc2626" />
                <Kpi label="مُعتمد هذا الأسبوع" value={stats.verifiedThisWeek.count} sub={`$${stats.verifiedThisWeek.totalAmount.toLocaleString('en-US')}`} color="#16a34a" />
                <Kpi label="مرفوض هذا الأسبوع" value={stats.rejectedThisWeek} color="#64748b" />
              </div>
            )}

            {/* Overdue banner */}
            {stats && stats.overdue24h > 0 && (
              <div style={{ margin: '0 16px', padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
                  ⏰ يوجد <strong>{stats.overdue24h}</strong> طلب معلّق منذ +24 ساعة. أرسل تذكيراً للجميع بنقرة واحدة.
                </div>
                <button onClick={notifyOverdue} type="button" style={btn('#dc2626')}>📨 تذكير الكل</button>
              </div>
            )}

            {/* Queue */}
            <div style={{ padding: 16 }}>
              {loading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>...جاري التحميل</div>}

              {!loading && requests.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: '#16a34a', fontSize: 16, fontWeight: 700 }}>
                  ✅ لا توجد طلبات معلّقة — كل شيء مُحدَّث
                </div>
              )}

              {!loading && requests.map((req) => {
                const age = ageHours(req.requestedAt);
                const isOverdue = age >= 24;
                const isActive = activeId === req.id;
                return (
                  <div key={req.id} style={{
                    border: `2px solid ${isActive ? '#dc2626' : isOverdue ? '#fee2e2' : '#e5e7eb'}`,
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 12,
                    background: isActive ? '#fff5f5' : isOverdue ? '#fffbfb' : '#fff',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 250 }}>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>
                          {[req.firstName, req.lastName].filter(Boolean).join(' ') || req.userId}
                          {isOverdue && <span style={{ marginRight: 8, fontSize: 11, background: '#dc2626', color: '#fff', padding: '2px 8px', borderRadius: 999 }}>متأخر {age}س</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                          {req.email && <span>{req.email}</span>}
                          {req.phone && <span> · {req.phone}</span>}
                          {req.country && <span> · {req.country}</span>}
                        </div>
                        {req.referenceNo && (
                          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                            مرجع المستخدم: <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{req.referenceNo}</code>
                          </div>
                        )}
                        {req.bankReceiptUrl && (
                          <div style={{ fontSize: 12, marginTop: 4 }}>
                            📎 <a href={req.bankReceiptUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>إيصال مرفوع من المستخدم</a>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 24, fontWeight: 900, color: '#16a34a' }}>${Number(req.amount).toLocaleString('en-US')}</div>
                        <div style={{ fontSize: 11, color: '#666' }}>
                          {METHOD_LABELS[req.method] || req.method}
                        </div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          منذ {age} ساعة
                        </div>
                      </div>
                    </div>

                    {!isActive && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                        <button onClick={() => startAction(req, 'contact')} type="button" style={btn('#3b82f6')}>💬 مراسلة</button>
                        <button onClick={() => startAction(req, 'verify')} type="button" style={btn('#16a34a')}>✅ تأكيد الاستلام</button>
                        <button onClick={() => startAction(req, 'reject')} type="button" style={btn('#dc2626')}>❌ رفض</button>
                      </div>
                    )}

                    {isActive && actionType === 'verify' && (
                      <div style={{ marginTop: 14, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #16a34a' }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#16a34a' }}>✅ تأكيد الاستلام والاعتماد</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <Field label="المبلغ المستلم فعلياً ($)">
                            <input type="number" value={receivedAmount} onChange={(e) => setReceivedAmount(e.target.value)} style={inp} />
                          </Field>
                          <Field label="رقم المرجع من البنك (اختياري)">
                            <input type="text" value={referenceFromBank} onChange={(e) => setReferenceFromBank(e.target.value)} style={inp} />
                          </Field>
                        </div>
                        <Field label="رابط صورة وصل التحويل (اختياري)">
                          <input type="url" value={bankReceiptUrl} onChange={(e) => setBankReceiptUrl(e.target.value)} placeholder="https://..." style={inp} />
                        </Field>
                        <Field label="ملاحظة (اختياري)">
                          <textarea value={verificationNote} onChange={(e) => setVerificationNote(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' as const }} />
                        </Field>
                        <div style={{ background: '#fef3c7', padding: 10, borderRadius: 6, fontSize: 12, color: '#92400e', marginBottom: 10 }}>
                          ⚠️ سيُضاف <strong>${Number(receivedAmount || 0).toLocaleString('en-US')}</strong> لمحفظة المستخدم.
                          التأكيد لا يمكن التراجع عنه.
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={cancelAction} type="button" style={btn('#666')}>إلغاء</button>
                          <button onClick={handleVerify} disabled={submitting} type="button" style={{ ...btn('#16a34a'), opacity: submitting ? 0.6 : 1 }}>
                            {submitting ? '...جاري التأكيد' : '✅ اعتمد المبلغ'}
                          </button>
                        </div>
                      </div>
                    )}

                    {isActive && actionType === 'reject' && (
                      <div style={{ marginTop: 14, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #dc2626' }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#dc2626' }}>❌ رفض الطلب</h4>
                        <Field label="سبب الرفض (إجباري — يصل للمستخدم)">
                          <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} required style={{ ...inp, resize: 'vertical' as const }} />
                        </Field>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={cancelAction} type="button" style={btn('#666')}>إلغاء</button>
                          <button onClick={handleReject} disabled={submitting} type="button" style={{ ...btn('#dc2626'), opacity: submitting ? 0.6 : 1 }}>
                            {submitting ? '...جاري الرفض' : '❌ ارفض الطلب'}
                          </button>
                        </div>
                      </div>
                    )}

                    {isActive && actionType === 'contact' && (
                      <div style={{ marginTop: 14, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #3b82f6' }}>
                        <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#3b82f6' }}>💬 مراسلة المستخدم</h4>
                        <Field label="القالب">
                          <select value={contactTemplate} onChange={(e) => setContactTemplate(e.target.value)} style={inp}>
                            {Object.entries(TEMPLATE_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="رسالة مخصصة (اختياري — تستبدل القالب)">
                          <textarea value={contactCustom} onChange={(e) => setContactCustom(e.target.value)} rows={3} placeholder="اتركه فارغاً لاستخدام القالب" style={{ ...inp, resize: 'vertical' as const }} />
                        </Field>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={cancelAction} type="button" style={btn('#666')}>إلغاء</button>
                          <button onClick={handleContact} disabled={submitting} type="button" style={{ ...btn('#3b82f6'), opacity: submitting ? 0.6 : 1 }}>
                            {submitting ? '...جاري الإرسال' : '💬 ارسل'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {tab === 'report' && (
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)}
                  style={{
                    padding: '8px 14px',
                    border: '1px solid #ccc',
                    borderRadius: 8,
                    background: period === p ? '#1f2937' : '#fff',
                    color: period === p ? '#fff' : '#333',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: 13,
                  }}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>

            {reportLoading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>...جاري التحميل</div>}

            {!reportLoading && report && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
                  <Kpi label="عدد المعتمد" value={report.verified.count} color="#16a34a" />
                  <Kpi label="إجمالي المستلم" value={report.verified.totalReceived} sub={`$${report.verified.totalReceived.toLocaleString('en-US')}`} color="#16a34a" />
                  <Kpi label="عدد المرفوض" value={report.rejected.count} color="#dc2626" />
                  <Kpi label="متوسط الانتظار (س)" value={report.avgWaitHours} color="#3b82f6" />
                </div>

                {report.verified.delta !== 0 && (
                  <div style={{ marginBottom: 16, padding: 10, background: report.verified.delta < 0 ? '#fef2f2' : '#f0fdf4', borderRadius: 8, fontSize: 13 }}>
                    {report.verified.delta < 0
                      ? <>⚠️ المبلغ المستلم أقل من المطلوب بـ <strong>${Math.abs(report.verified.delta).toLocaleString('en-US')}</strong></>
                      : <>📈 المبلغ المستلم أكثر من المطلوب بـ <strong>${report.verified.delta.toLocaleString('en-US')}</strong></>
                    }
                  </div>
                )}

                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>حسب طريقة الدفع</h3>
                <div style={{ marginBottom: 16, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
                  {report.byMethod.length === 0 ? (
                    <div style={{ padding: 12, color: '#888', textAlign: 'center' }}>لا توجد بيانات</div>
                  ) : (
                    report.byMethod.map((m) => (
                      <div key={m.method} style={{ padding: 10, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{METHOD_LABELS[m.method] || m.method}</span>
                        <span><strong>{m.count}</strong> طلب · <strong>${Number(m.total).toLocaleString('en-US')}</strong></span>
                      </div>
                    ))
                  )}
                </div>

                <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>أعلى 5 مستخدمين شحناً</h3>
                <div style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden' }}>
                  {report.topUsers.length === 0 ? (
                    <div style={{ padding: 12, color: '#888', textAlign: 'center' }}>لا توجد بيانات</div>
                  ) : (
                    report.topUsers.map((u, i) => (
                      <div key={u.userId} style={{ padding: 10, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>
                            #{i + 1} {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.userId}
                          </div>
                          {u.email && <div style={{ fontSize: 11, color: '#666' }}>{u.email}</div>}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 800, color: '#16a34a' }}>${Number(u.total).toLocaleString('en-US')}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>{u.deposits} إيداع</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {toast && (
          <div style={{
            position: 'fixed', bottom: 32, left: '50%',
            transform: 'translateX(-50%)',
            background: '#222', color: '#fff',
            padding: '10px 18px', borderRadius: 999,
            fontWeight: 700, zIndex: 10000,
          }}>{toast}</div>
        )}
      </div>
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => ({
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 700,
  background: bg,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
});

const inp: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 6,
  fontFamily: 'inherit',
};

function Kpi({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${color}30`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color }}>{Number(value).toLocaleString('en-US')}</div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#444' }}>{label}</label>
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      flex: 1,
      padding: '12px 16px',
      background: active ? '#fff' : 'transparent',
      border: 'none',
      borderBottom: active ? '3px solid #dc2626' : '3px solid transparent',
      fontWeight: 700,
      fontSize: 14,
      color: active ? '#dc2626' : '#666',
      cursor: 'pointer',
    }}>{children}</button>
  );
}
