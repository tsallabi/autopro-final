/**
 * Audit Workflow — 3-step UI for physical yard inventory audits.
 * Used in AdminDashboard under the `yard_audit` view.
 */
import React, { useEffect, useState } from 'react';

type Audit = {
  id: string;
  auditorId?: string;
  zone?: string | null;
  expectedCount?: number;
  actualCount?: number;
  status?: string;
  startedAt?: string;
  completedAt?: string;
};

type Discrepancy = {
  id: string;
  discrepancyType: 'missing' | 'found' | 'wrong_location' | 'wrong_zone';
  vehicleId?: string | null;
  expectedValue?: string | null;
  actualValue?: string | null;
  resolved?: number;
  resolutionNotes?: string;
};

type AuditDetail = Audit & {
  scans: Array<{ id: string; vin: string; vehicleId?: string; scannedLocation?: string; expectedLocation?: string; isMatch: number; scannedAt: string }>;
  discrepancies: Discrepancy[];
};

function authHeader(): Record<string, string> {
  try {
    const t = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

const ZONES = ['A', 'B', 'C', 'D'];

export default function AuditWorkflow() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [zone, setZone] = useState<string>('');
  const [audit, setAudit] = useState<Audit | null>(null);
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [vinInput, setVinInput] = useState('');
  const [locInput, setLocInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Audit[]>([]);

  const loadHistory = async () => {
    try {
      const r = await fetch('/api/yard/audits', { headers: authHeader() });
      if (r.ok) setHistory(await r.json());
    } catch {}
  };
  useEffect(() => { loadHistory(); }, []);

  const loadDetail = async (id: string) => {
    const r = await fetch(`/api/yard/audits/${id}`, { headers: authHeader() });
    if (r.ok) setDetail(await r.json());
  };

  const startAudit = async () => {
    try {
      setSubmitting(true); setError(null);
      const r = await fetch('/api/yard/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ zone: zone || null }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
      const created: Audit = await r.json();
      setAudit(created);
      setStep(2);
      await loadDetail(created.id);
    } catch (e: any) { setError(e?.message || 'فشل بدء الجرد'); }
    finally { setSubmitting(false); }
  };

  const scanVin = async () => {
    if (!audit) return;
    if (!vinInput.trim()) return;
    try {
      setSubmitting(true); setError(null);
      const r = await fetch(`/api/yard/audits/${audit.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ vin: vinInput.trim().toUpperCase(), scannedLocation: locInput.trim() || null }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
      setVinInput('');
      await loadDetail(audit.id);
    } catch (e: any) { setError(e?.message || 'فشل المسح'); }
    finally { setSubmitting(false); }
  };

  const finishAudit = async () => {
    if (!audit) return;
    if (!confirm('إنهاء الجرد وحساب الفروقات؟')) return;
    try {
      setSubmitting(true); setError(null);
      const r = await fetch(`/api/yard/audits/${audit.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
      await loadDetail(audit.id);
      setStep(3);
      loadHistory();
    } catch (e: any) { setError(e?.message || 'فشل الإنهاء'); }
    finally { setSubmitting(false); }
  };

  const resolveDiscrepancy = async (dId: string) => {
    const notes = prompt('ملاحظات الحل:') || '';
    if (!audit) return;
    try {
      const r = await fetch(`/api/yard/audits/${audit.id}/resolve-discrepancy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ discrepancyId: dId, notes }),
      });
      if (!r.ok) throw new Error('فشل');
      await loadDetail(audit.id);
    } catch (e: any) { alert('فشل الحل'); }
  };

  const resetWorkflow = () => {
    setStep(1); setAudit(null); setDetail(null); setZone(''); setVinInput(''); setLocInput(''); setError(null);
  };

  return (
    <div dir="rtl" className="p-4 md:p-8 space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-slate-900">الجرد الفعلي للحضيرة</h2>
        <p className="text-slate-500 font-bold text-sm mt-1">3 خطوات: بدء، مسح، نتائج</p>
      </div>

      <div className="flex items-center gap-2 text-sm">
        {[1, 2, 3].map(n => (
          <div key={n} className={`flex-1 h-2 rounded-full ${step >= n ? 'bg-orange-500' : 'bg-slate-200'}`}></div>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-700 p-3 rounded-lg font-bold">{error}</div>}

      {step === 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h3 className="font-black text-lg">الخطوة 1 — بدء الجرد</h3>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">المنطقة (اختياري — اتركها فارغة للحضيرة كلها)</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setZone('')}
                className={`px-4 py-2 rounded-xl font-bold border ${zone === '' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-700 border-slate-200'}`}
              >الكل</button>
              {ZONES.map(z => (
                <button
                  key={z}
                  onClick={() => setZone(z)}
                  className={`px-4 py-2 rounded-xl font-bold border ${zone === z ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-700 border-slate-200'}`}
                >منطقة {z}</button>
              ))}
            </div>
          </div>
          <button
            onClick={startAudit}
            disabled={submitting}
            className="w-full sm:w-auto bg-orange-500 hover:bg-orange-600 text-white font-black px-8 py-3 rounded-xl disabled:opacity-50"
          >
            {submitting ? 'جارٍ البدء...' : 'بدء الجرد'}
          </button>

          {history.length > 0 && (
            <div className="mt-6">
              <h4 className="font-black text-sm text-slate-700 mb-2">آخر جرود</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.slice(0, 10).map(a => (
                  <button
                    key={a.id}
                    onClick={async () => { setAudit(a); await loadDetail(a.id); setStep(a.status === 'completed' ? 3 : 2); }}
                    className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 p-3 rounded-lg text-sm"
                  >
                    <span className="font-mono text-xs">{a.id.slice(-8)}</span>
                    <span className="text-slate-600">{a.zone ? `منطقة ${a.zone}` : 'الكل'}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${a.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {a.status === 'completed' ? 'مكتمل' : 'جارٍ'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && audit && detail && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-lg">الخطوة 2 — مسح السيارات</h3>
            <div className="text-sm text-slate-600 font-bold">
              {detail.scans.length} / {audit.expectedCount || 0}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={vinInput}
              onChange={(e) => setVinInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') scanVin(); }}
              placeholder="VIN (17 خانة)"
              maxLength={17}
              className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-mono"
            />
            <input
              type="text"
              value={locInput}
              onChange={(e) => setLocInput(e.target.value.toUpperCase())}
              placeholder="الموقع المسحوب (مثل A-03)"
              className="w-48 px-4 py-3 border border-slate-200 rounded-xl font-mono"
            />
            <button
              onClick={scanVin}
              disabled={submitting || !vinInput.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 rounded-xl disabled:opacity-50"
            >مسح</button>
          </div>

          <div className="bg-slate-50 rounded-xl p-3 max-h-64 overflow-y-auto">
            {detail.scans.length === 0 ? (
              <div className="text-center text-slate-400 py-4 text-sm">لم يتم مسح أي سيارة بعد</div>
            ) : (
              <ul className="space-y-1">
                {detail.scans.map(s => (
                  <li key={s.id} className="flex items-center justify-between p-2 bg-white rounded-lg text-xs">
                    <span className="font-mono">{s.vin}</span>
                    <span className="text-slate-500">{s.scannedLocation || '—'}</span>
                    <span className={`px-2 py-0.5 rounded ${s.isMatch ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} font-bold`}>
                      {s.isMatch ? '✓' : '✗'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={finishAudit}
              disabled={submitting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-black py-3 rounded-xl disabled:opacity-50"
            >إنهاء الجرد</button>
            <button
              onClick={resetWorkflow}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-6 rounded-xl"
            >إلغاء</button>
          </div>
        </div>
      )}

      {step === 3 && detail && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-lg">الخطوة 3 — النتائج</h3>
            <button onClick={resetWorkflow} className="bg-orange-500 hover:bg-orange-600 text-white font-black px-4 py-2 rounded-xl">
              جرد جديد
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="متوقع" value={detail.expectedCount || 0} color="bg-blue-50 text-blue-700" />
            <Stat label="مسحوب" value={detail.actualCount || 0} color="bg-slate-50 text-slate-700" />
            <Stat label="فروقات" value={detail.discrepancies.length} color="bg-red-50 text-red-700" />
            <Stat label="محلول" value={detail.discrepancies.filter(d => d.resolved).length} color="bg-green-50 text-green-700" />
          </div>

          <div className="space-y-2">
            <h4 className="font-black text-sm text-slate-700">الفروقات</h4>
            {detail.discrepancies.length === 0 ? (
              <div className="text-center text-green-600 font-bold p-6 bg-green-50 rounded-xl">
                لا توجد فروقات — الجرد مطابق تمامًا.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">النوع</th>
                    <th className="p-2 text-right">متوقع</th>
                    <th className="p-2 text-right">فعلي</th>
                    <th className="p-2 text-right">الحل</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.discrepancies.map(d => (
                    <tr key={d.id} className="border-b border-slate-100">
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${DISC_COLORS[d.discrepancyType]}`}>
                          {DISC_LABELS[d.discrepancyType]}
                        </span>
                      </td>
                      <td className="p-2 font-mono text-xs">{d.expectedValue || '—'}</td>
                      <td className="p-2 font-mono text-xs">{d.actualValue || '—'}</td>
                      <td className="p-2">
                        {d.resolved ? (
                          <span className="text-green-600 font-bold">✓ محلول</span>
                        ) : (
                          <button onClick={() => resolveDiscrepancy(d.id)} className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold px-3 py-1 rounded-lg">
                            حل
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const DISC_LABELS: Record<string, string> = {
  missing: 'مفقودة',
  found: 'موجودة غير مسجلة',
  wrong_location: 'موقع خاطئ',
  wrong_zone: 'منطقة خاطئة',
};

const DISC_COLORS: Record<string, string> = {
  missing: 'bg-red-100 text-red-700',
  found: 'bg-yellow-100 text-yellow-700',
  wrong_location: 'bg-orange-100 text-orange-700',
  wrong_zone: 'bg-purple-100 text-purple-700',
};

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <div className="text-3xl font-black">{value}</div>
      <div className="text-xs font-bold mt-1">{label}</div>
    </div>
  );
}
