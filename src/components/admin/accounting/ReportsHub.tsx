import React, { useState } from 'react';
import { TrendingUp, FileText, Users, Scale, DollarSign, BarChart3, Printer, Download, X, RefreshCw } from 'lucide-react';
import { authFetch, useStore } from '../../../context/StoreContext';

type ReportKey = 'customer_statement' | 'trial_balance' | 'income_statement' | 'balance_sheet' | 'operations';

interface ReportCard {
  key: ReportKey;
  title: string;
  desc: string;
  icon: React.ComponentType<any>;
  color: string;
  fields: Array<'date' | 'dateRange' | 'customer' | 'asOfDate'>;
}

const REPORTS: ReportCard[] = [
  { key: 'customer_statement', title: 'كشف حساب عميل', desc: 'تفصيل حركات عميل معين خلال فترة', icon: Users, color: 'text-blue-400', fields: ['customer', 'dateRange'] },
  { key: 'trial_balance', title: 'ميزان المراجعة', desc: 'أرصدة جميع الحسابات حتى تاريخ', icon: Scale, color: 'text-purple-400', fields: ['date'] },
  { key: 'income_statement', title: 'قائمة الدخل', desc: 'الإيرادات والمصروفات وصافي الربح', icon: DollarSign, color: 'text-emerald-400', fields: ['dateRange'] },
  { key: 'balance_sheet', title: 'الميزانية العمومية', desc: 'الأصول والخصوم وحقوق الملكية', icon: FileText, color: 'text-orange-400', fields: ['asOfDate'] },
  { key: 'operations', title: 'التقرير التشغيلي', desc: 'مؤشرات الأداء التشغيلي', icon: BarChart3, color: 'text-amber-400', fields: ['dateRange'] },
];

const ENDPOINT: Record<ReportKey, string> = {
  customer_statement: '/api/accounting/reports/customer-statement',
  trial_balance: '/api/accounting/reports/trial-balance',
  income_statement: '/api/accounting/reports/income-statement',
  balance_sheet: '/api/accounting/reports/balance-sheet',
  operations: '/api/accounting/reports/operations',
};

export const ReportsHub: React.FC = () => {
  const { showAlert } = useStore();
  const [active, setActive] = useState<ReportCard | null>(null);
  const [params, setParams] = useState<{ fromDate?: string; toDate?: string; asOfDate?: string; customerId?: string; customerName?: string }>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

  const openReport = (r: ReportCard) => {
    setActive(r);
    setResult(null);
    setParams({ fromDate: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), toDate: new Date().toISOString().slice(0, 10), asOfDate: new Date().toISOString().slice(0, 10) });
  };

  const run = async () => {
    if (!active) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (active.fields.includes('date')) qs.set('asOfDate', params.asOfDate || '');
      if (active.fields.includes('dateRange')) { qs.set('from', params.fromDate || ''); qs.set('to', params.toDate || ''); }
      if (active.fields.includes('customer')) qs.set('customerId', params.customerId || '');
      if (active.fields.includes('asOfDate')) qs.set('asOfDate', params.asOfDate || '');
      const res = await authFetch(`${ENDPOINT[active.key]}?${qs.toString()}`);
      if (!res.ok) throw new Error();
      setResult(await res.json());
    } catch { showAlert('فشل توليد التقرير', 'error'); }
    finally { setLoading(false); }
  };

  const exportCsv = () => {
    if (!result) return;
    const json = JSON.stringify(result, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active?.key || 'report'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 text-right" dir="rtl">
      <div className="flex items-center gap-3">
        <TrendingUp className="w-8 h-8 text-orange-500" />
        <div>
          <h2 className="text-2xl font-black text-white">التقارير المالية</h2>
          <p className="text-sm text-slate-400">اختر نوع التقرير لتوليده</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map(r => (
          <button
            key={r.key}
            onClick={() => openReport(r)}
            className="text-right bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-orange-500/40 transition-all hover:bg-slate-800/30"
          >
            <div className={`w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center ${r.color} mb-3`}>
              <r.icon className="w-6 h-6" />
            </div>
            <h3 className="font-black text-white text-lg mb-1">{r.title}</h3>
            <p className="text-xs text-slate-400">{r.desc}</p>
          </button>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setActive(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800 sticky top-0 bg-slate-900 print:hidden">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <active.icon className={`w-5 h-5 ${active.color}`} />
                {active.title}
              </h3>
              <div className="flex gap-2">
                {result && (
                  <>
                    <button onClick={() => window.print()} className="p-2 hover:bg-slate-800 rounded-lg text-slate-300" title="طباعة"><Printer className="w-4 h-4" /></button>
                    <button onClick={exportCsv} className="p-2 hover:bg-slate-800 rounded-lg text-slate-300" title="تصدير"><Download className="w-4 h-4" /></button>
                  </>
                )}
                <button onClick={() => setActive(null)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex flex-wrap gap-3 items-end print:hidden">
                {active.fields.includes('customer') && (
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs text-slate-400 mb-1">العميل (ID)</label>
                    <input value={params.customerId || ''} onChange={e => setParams(p => ({ ...p, customerId: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                  </div>
                )}
                {active.fields.includes('dateRange') && (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">من</label>
                      <input type="date" value={params.fromDate || ''} onChange={e => setParams(p => ({ ...p, fromDate: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">إلى</label>
                      <input type="date" value={params.toDate || ''} onChange={e => setParams(p => ({ ...p, toDate: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                    </div>
                  </>
                )}
                {(active.fields.includes('date') || active.fields.includes('asOfDate')) && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">كما في</label>
                    <input type="date" value={params.asOfDate || ''} onChange={e => setParams(p => ({ ...p, asOfDate: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                  </div>
                )}
                <button onClick={run} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-sm font-bold text-white">
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  توليد
                </button>
              </div>

              <div className="bg-slate-800/30 rounded-xl p-4 min-h-[300px]">
                {!result && !loading && <div className="text-center text-slate-500 py-12">اختر المعايير واضغط توليد</div>}
                {loading && <div className="text-center text-slate-400 py-12">جارٍ التوليد...</div>}
                {result && (
                  <ReportResultView reportKey={active.key} result={result} fmt={fmt} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReportResultView: React.FC<{ reportKey: ReportKey; result: any; fmt: (n: number) => string }> = ({ reportKey, result, fmt }) => {
  if (reportKey === 'income_statement') {
    return (
      <div className="space-y-3">
        <div className="bg-slate-800 rounded-xl p-4 flex justify-between"><span className="text-slate-300">إجمالي الإيرادات</span><span className="font-black text-emerald-400">{fmt(result.revenue || result.totalRevenue || 0)}</span></div>
        <div className="bg-slate-800 rounded-xl p-4 flex justify-between"><span className="text-slate-300">إجمالي المصاريف</span><span className="font-black text-red-400">{fmt(result.expenses || result.totalExpenses || 0)}</span></div>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 flex justify-between"><span className="font-bold text-orange-400">صافي الربح</span><span className="font-black text-orange-400 text-lg">{fmt(result.netProfit ?? ((result.revenue || 0) - (result.expenses || 0)))}</span></div>
      </div>
    );
  }
  if (reportKey === 'trial_balance' || reportKey === 'balance_sheet') {
    const rows = result.rows || result.accounts || [];
    return (
      <table className="w-full text-sm">
        <thead className="bg-slate-800 text-xs text-slate-300">
          <tr>
            <th className="p-2 text-right">الحساب</th>
            <th className="p-2 text-right">مدين</th>
            <th className="p-2 text-right">دائن</th>
            <th className="p-2 text-right">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500">لا بيانات</td></tr>}
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-slate-700">
              <td className="p-2 text-slate-200">{r.accountCode || r.code} — {r.accountName || r.name || r.nameAr}</td>
              <td className="p-2 text-emerald-400">{r.debit ? fmt(r.debit) : '—'}</td>
              <td className="p-2 text-red-400">{r.credit ? fmt(r.credit) : '—'}</td>
              <td className="p-2 font-bold text-slate-100">{fmt(r.balance || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (reportKey === 'customer_statement') {
    const tx = result.transactions || result.entries || [];
    return (
      <div>
        <div className="text-sm text-slate-300 mb-3">العميل: <span className="font-bold text-slate-100">{result.customerName || '—'}</span> · الرصيد: <span className="font-black text-orange-400">{fmt(result.balance || 0)}</span></div>
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-xs text-slate-300">
            <tr>
              <th className="p-2 text-right">التاريخ</th>
              <th className="p-2 text-right">الوصف</th>
              <th className="p-2 text-right">مدين</th>
              <th className="p-2 text-right">دائن</th>
              <th className="p-2 text-right">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {tx.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">لا حركات</td></tr>}
            {tx.map((t: any, i: number) => (
              <tr key={i} className="border-t border-slate-700">
                <td className="p-2 text-slate-300">{t.date ? new Date(t.date).toLocaleDateString('ar-LY') : '—'}</td>
                <td className="p-2 text-slate-200">{t.description || '—'}</td>
                <td className="p-2 text-emerald-400">{t.debit ? fmt(t.debit) : '—'}</td>
                <td className="p-2 text-red-400">{t.credit ? fmt(t.credit) : '—'}</td>
                <td className="p-2 font-bold text-slate-100">{t.runningBalance != null ? fmt(t.runningBalance) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  // operations or fallback
  return (
    <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
  );
};

export default ReportsHub;
