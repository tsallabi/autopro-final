import React, { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet, FileText, BookOpen,
  BarChart3, Hash, Plus, RefreshCw, Calculator
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { authFetch, useStore } from '../../../context/StoreContext';

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<any>;
  accent: string;
  loading?: boolean;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon: Icon, accent, loading }) => (
  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between hover:border-orange-500/40 transition-colors">
    <div>
      <div className="text-xs text-slate-400 mb-1 font-semibold">{label}</div>
      <div className={`text-2xl font-black ${accent}`}>{loading ? '...' : value}</div>
    </div>
    <div className={`w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center ${accent}`}>
      <Icon className="w-6 h-6" />
    </div>
  </div>
);

interface Props {
  onNavigate?: (view: string) => void;
}

export const AccountingDashboard: React.FC<Props> = ({ onNavigate }) => {
  const { showAlert } = useStore();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ revenue: 0, expenses: 0, netProfit: 0, cashBalance: 0 });
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [monthlyPL, setMonthlyPL] = useState<any[]>([]);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

  const load = async () => {
    setLoading(true);
    try {
      const [incomeRes, cashRes, entriesRes, monthlyRes] = await Promise.all([
        authFetch('/api/accounting/reports/income-statement').catch(() => null),
        authFetch('/api/accounting/reports/cash-balance').catch(() => null),
        authFetch('/api/accounting/journal-entries?limit=10').catch(() => null),
        authFetch('/api/accounting/reports/monthly-pl?months=6').catch(() => null),
      ]);

      // Helper: safely parse JSON only if the response is actually JSON
      const safeJson = async (res: Response | null) => {
        if (!res?.ok) return null;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return null;
        try { return await res.json(); } catch { return null; }
      };

      const incomeData = await safeJson(incomeRes);
      if (incomeData) {
        setKpis(prev => ({
          ...prev,
          revenue: incomeData.revenue || incomeData.totalRevenue || 0,
          expenses: incomeData.expenses || incomeData.totalExpenses || 0,
          netProfit: incomeData.netProfit ?? ((incomeData.revenue || 0) - (incomeData.expenses || 0)),
        }));
      }
      const cashData = await safeJson(cashRes);
      if (cashData) {
        setKpis(prev => ({ ...prev, cashBalance: cashData.balance || cashData.cashBalance || 0 }));
      }
      const entriesData = await safeJson(entriesRes);
      if (entriesData) {
        setRecentEntries(Array.isArray(entriesData) ? entriesData.slice(0, 10) : (entriesData.entries || []).slice(0, 10));
      }
      const monthlyData = await safeJson(monthlyRes);
      if (monthlyData) {
        setMonthlyPL(Array.isArray(monthlyData) ? monthlyData : (monthlyData.months || []));
      }
    } catch (e: any) {
      showAlert(e?.message || 'فشل تحميل البيانات المحاسبية', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const quickActions = [
    { label: 'إنشاء فاتورة', icon: FileText, view: 'accounting_invoices', color: 'text-orange-400' },
    { label: 'تسجيل قيد', icon: BookOpen, view: 'accounting_journal', color: 'text-blue-400' },
    { label: 'التقارير المالية', icon: TrendingUp, view: 'accounting_reports', color: 'text-emerald-400' },
    { label: 'دليل الحسابات', icon: Hash, view: 'accounting_accounts', color: 'text-purple-400' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 text-right" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calculator className="w-8 h-8 text-orange-500" />
          <div>
            <h2 className="text-2xl font-black text-white">لوحة المحاسبة</h2>
            <p className="text-sm text-slate-400">نظرة عامة على الأداء المالي</p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-200 border border-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="إيرادات الشهر" value={fmt(kpis.revenue)} icon={TrendingUp} accent="text-emerald-400" loading={loading} />
        <KpiCard label="مصاريف الشهر" value={fmt(kpis.expenses)} icon={TrendingDown} accent="text-red-400" loading={loading} />
        <KpiCard label="صافي الربح" value={fmt(kpis.netProfit)} icon={DollarSign} accent={kpis.netProfit >= 0 ? 'text-orange-400' : 'text-red-400'} loading={loading} />
        <KpiCard label="الرصيد النقدي" value={fmt(kpis.cashBalance)} icon={Wallet} accent="text-blue-400" loading={loading} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickActions.map(a => (
          <button
            key={a.view}
            onClick={() => onNavigate?.(a.view)}
            className="flex flex-col items-center gap-2 p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-orange-500/40 rounded-xl transition-all"
          >
            <a.icon className={`w-6 h-6 ${a.color}`} />
            <span className="text-sm font-bold text-slate-200">{a.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-orange-500" />
            الأرباح الشهرية — آخر 6 أشهر
          </h3>
          <div className="h-64">
            {monthlyPL.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyPL}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#10b981" name="إيرادات" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#ef4444" name="مصاريف" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="profit" fill="#f97316" name="ربح" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                {loading ? 'جارٍ التحميل...' : 'لا توجد بيانات'}
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-orange-500" />
            آخر القيود اليومية
          </h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {recentEntries.length === 0 && (
              <div className="text-sm text-slate-500 text-center py-8">
                {loading ? 'جارٍ التحميل...' : 'لا توجد قيود'}
              </div>
            )}
            {recentEntries.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-800">
                <div className="flex-1">
                  <div className="text-sm font-bold text-slate-200">{e.description || e.memo || '—'}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {e.date ? new Date(e.date).toLocaleDateString('ar-LY') : ''} · {e.reference || e.referenceType || ''}
                  </div>
                </div>
                <div className="text-sm font-black text-orange-400">{fmt(e.amount || e.total || 0)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountingDashboard;
