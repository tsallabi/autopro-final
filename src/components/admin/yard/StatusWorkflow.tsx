import React, { useEffect, useState } from 'react';
import { authFetch } from '../../../context/StoreContext';
import { ArrowLeft, CheckCircle2, X } from 'lucide-react';

interface StatusDef {
  id: string;
  code: string;
  nameAr: string;
  color: string;
}

interface AllowedResp {
  current: string;
  allowed: StatusDef[];
  all: StatusDef[];
}

const FLOW_ORDER = [
  'in_transit', 'arrived_port', 'entered_yard',
  'listed_for_sale', 'reserved', 'sold_pending_delivery', 'delivered_to_buyer',
];
const SIDE_FLOW = ['withdrawn_by_dealer', 'delivered_to_dealer'];
const SPECIAL = ['damaged', 'pending_decision', 'archived'];

export function StatusWorkflow({ vehicleId, onChanged }: { vehicleId: string; onChanged?: () => void }) {
  const [info, setInfo] = useState<AllowedResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<string>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`/api/yard/vehicles/${vehicleId}/allowed-statuses`);
      if (r.ok) setInfo(await r.json());
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [vehicleId]);

  const submit = async () => {
    setErr(null);
    if (!selected) { setErr('اختر الحالة المستهدفة'); return; }
    if (!reason.trim() || reason.trim().length < 3) { setErr('السبب مطلوب'); return; }
    setSubmitting(true);
    try {
      // `selected` is a status CODE; resolve to id from info.all
      const target = info?.all.find(s => s.code === selected);
      if (!target) { setErr('حالة غير معروفة'); setSubmitting(false); return; }
      const r = await authFetch(`/api/yard/vehicles/${vehicleId}/change-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatusId: target.id, reason: reason.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'فشل التحديث'); return; }
      setModalOpen(false); setSelected(''); setReason('');
      await load();
      onChanged?.();
    } catch (e: any) {
      setErr(e.message || 'خطأ');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="text-slate-400 p-4">جاري التحميل...</div>;
  if (!info) return <div className="text-red-400 p-4">تعذر تحميل حالة السيارة</div>;

  const byCode: Record<string, StatusDef> = {};
  info.all.forEach(s => { byCode[s.code] = s; });
  const currentCode = info.current;

  const renderNode = (code: string) => {
    const s = byCode[code];
    if (!s) return null;
    const isCurrent = code === currentCode;
    return (
      <div
        key={code}
        className={`px-3 py-2 rounded-lg text-xs font-bold text-white whitespace-nowrap ${
          isCurrent ? 'ring-2 ring-orange-400 scale-105 shadow-lg' : 'opacity-80'
        }`}
        style={{ background: s.color }}
      >
        {isCurrent && '● '}
        {s.nameAr}
      </div>
    );
  };

  return (
    <div className="bg-slate-800/50 rounded-xl p-5 text-right" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black text-white">مسار الحالة</h3>
        <button
          onClick={() => setModalOpen(true)}
          disabled={info.allowed.length === 0}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-bold"
        >
          تغيير الحالة
        </button>
      </div>

      {/* Main flow */}
      <div className="flex flex-wrap items-center gap-2 mb-3 flex-row-reverse">
        {FLOW_ORDER.map((c, i) => (
          <React.Fragment key={c}>
            {renderNode(c)}
            {i < FLOW_ORDER.length - 1 && <ArrowLeft className="w-4 h-4 text-slate-500" />}
          </React.Fragment>
        ))}
      </div>

      {/* Side flow (dealer withdrawal) */}
      <div className="flex flex-wrap items-center gap-2 mb-3 flex-row-reverse">
        <span className="text-xs text-slate-400 ml-2">طلب مسبق:</span>
        {SIDE_FLOW.map((c, i) => (
          <React.Fragment key={c}>
            {renderNode(c)}
            {i < SIDE_FLOW.length - 1 && <ArrowLeft className="w-4 h-4 text-slate-500" />}
          </React.Fragment>
        ))}
      </div>

      {/* Special statuses */}
      <div className="flex flex-wrap items-center gap-2 flex-row-reverse">
        <span className="text-xs text-slate-400 ml-2">حالات خاصة:</span>
        {SPECIAL.map(c => renderNode(c))}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black text-white">تغيير حالة السيارة</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white" aria-label="إغلاق">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block text-sm font-bold text-slate-300 mb-2">الحالة المستهدفة</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-3 mb-4 font-bold"
            >
              <option value="">— اختر الحالة —</option>
              {info.allowed.map(s => (
                <option key={s.code} value={s.code}>{s.nameAr}</option>
              ))}
            </select>

            {info.allowed.length === 0 && (
              <div className="text-xs text-yellow-400 mb-3">لا توجد تحولات متاحة من الحالة الحالية</div>
            )}

            <label className="block text-sm font-bold text-slate-300 mb-2">السبب (مطلوب)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="مثلاً: تم تسليم الوثائق للمشتري"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg p-3 mb-3 text-sm"
            />

            {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm mb-3">{err}</div>}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 text-white rounded-lg font-black flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {submitting ? 'جاري الحفظ...' : 'تأكيد التغيير'}
              </button>
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StatusWorkflow;
