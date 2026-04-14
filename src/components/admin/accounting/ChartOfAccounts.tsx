import React, { useState, useEffect, useMemo } from 'react';
import { Hash, RefreshCw, ChevronDown, ChevronLeft, X } from 'lucide-react';
import { authFetch, useStore } from '../../../context/StoreContext';

interface Account {
  id?: string;
  code: string;
  name?: string;
  nameAr?: string;
  type: string;
  balance?: number;
}

const TYPE_META: Record<string, { labelAr: string; color: string }> = {
  asset: { labelAr: 'الأصول', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  liability: { labelAr: 'الخصوم', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  equity: { labelAr: 'حقوق الملكية', color: 'text-blue-400 border-blue-500/30 bg-blue-500/10' },
  revenue: { labelAr: 'الإيرادات', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  expense: { labelAr: 'المصروفات', color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
};

const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export const ChartOfAccounts: React.FC = () => {
  const { showAlert } = useStore();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ asset: true, liability: true, equity: true, revenue: true, expense: true });
  const [selected, setSelected] = useState<Account | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/accounting/accounts');
      if (res.ok) {
        const d = await res.json();
        setAccounts(Array.isArray(d) ? d : (d.accounts || []));
      }
    } catch { showAlert('فشل تحميل دليل الحسابات', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const grouped = useMemo(() => {
    const g: Record<string, Account[]> = {};
    for (const a of accounts) {
      const t = (a.type || 'asset').toLowerCase();
      if (!g[t]) g[t] = [];
      g[t].push(a);
    }
    for (const k in g) g[k].sort((x, y) => (x.code || '').localeCompare(y.code || ''));
    return g;
  }, [accounts]);

  const openAccount = async (a: Account) => {
    setSelected(a);
    setTxLoading(true);
    setTransactions([]);
    try {
      const res = await authFetch(`/api/accounting/accounts/${a.code || a.id}/transactions`);
      if (res.ok) {
        const d = await res.json();
        setTransactions(Array.isArray(d) ? d : (d.transactions || []));
      }
    } catch { /* silent */ }
    finally { setTxLoading(false); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Hash className="w-8 h-8 text-orange-500" />
          <h2 className="text-2xl font-black text-white">دليل الحسابات</h2>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-200 border border-slate-700">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
        </button>
      </div>

      {loading && <div className="text-center text-slate-500 py-8">جارٍ التحميل...</div>}

      <div className="space-y-3">
        {TYPE_ORDER.map(type => {
          const list = grouped[type] || [];
          if (list.length === 0) return null;
          const meta = TYPE_META[type] || TYPE_META.asset;
          const isOpen = openGroups[type];
          const groupTotal = list.reduce((s, a) => s + (a.balance || 0), 0);
          return (
            <div key={type} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <button onClick={() => setOpenGroups(g => ({ ...g, [type]: !g[type] }))} className="w-full flex items-center justify-between p-4 hover:bg-slate-800/30">
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronLeft className="w-4 h-4 text-slate-400" />}
                  <span className={`px-3 py-1 rounded-lg text-xs font-black border ${meta.color}`}>{meta.labelAr}</span>
                  <span className="text-sm text-slate-400">{list.length} حساب</span>
                </div>
                <span className="text-sm font-bold text-slate-200">{fmt(groupTotal)}</span>
              </button>
              {isOpen && (
                <div className="divide-y divide-slate-800">
                  {list.map(a => (
                    <button key={a.code || a.id} onClick={() => openAccount(a)} className="w-full flex items-center justify-between p-3 pr-8 hover:bg-slate-800/50 text-right">
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-orange-400 font-bold">{a.code}</span>
                        <span className="text-sm text-slate-200">{a.nameAr || a.name || '—'}</span>
                      </div>
                      <span className={`text-sm font-bold ${(a.balance || 0) >= 0 ? 'text-slate-200' : 'text-red-400'}`}>{fmt(a.balance || 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800 sticky top-0 bg-slate-900">
              <div>
                <h3 className="text-lg font-black text-white">{selected.nameAr || selected.name}</h3>
                <div className="text-xs text-slate-400 mt-1">
                  <span className="font-mono text-orange-400">{selected.code}</span> · {TYPE_META[selected.type]?.labelAr || selected.type} · الرصيد: <span className="font-bold text-slate-200">{fmt(selected.balance || 0)}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4">
              <h4 className="font-bold text-slate-300 mb-2 text-sm">الحركات</h4>
              {txLoading && <div className="text-center text-slate-500 py-4">جارٍ التحميل...</div>}
              {!txLoading && transactions.length === 0 && <div className="text-center text-slate-500 py-4">لا توجد حركات</div>}
              {transactions.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/60 text-xs text-slate-300">
                    <tr>
                      <th className="p-2 text-right">التاريخ</th>
                      <th className="p-2 text-right">الوصف</th>
                      <th className="p-2 text-right">مدين</th>
                      <th className="p-2 text-right">دائن</th>
                      <th className="p-2 text-right">الرصيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t, i) => (
                      <tr key={i} className="border-t border-slate-800">
                        <td className="p-2 text-slate-300">{t.date ? new Date(t.date).toLocaleDateString('ar-LY') : '—'}</td>
                        <td className="p-2 text-slate-200">{t.description || t.memo || '—'}</td>
                        <td className="p-2 text-emerald-400">{t.debit ? fmt(t.debit) : '—'}</td>
                        <td className="p-2 text-red-400">{t.credit ? fmt(t.credit) : '—'}</td>
                        <td className="p-2 font-bold text-slate-100">{t.runningBalance != null ? fmt(t.runningBalance) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccounts;
