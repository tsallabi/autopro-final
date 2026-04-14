import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, Plus, RefreshCw, ChevronDown, ChevronLeft, X, Trash2 } from 'lucide-react';
import { authFetch, useStore } from '../../../context/StoreContext';

interface Line { accountCode: string; accountName?: string; debit: number; credit: number; }
interface Entry {
  id: string;
  date: string;
  description?: string;
  memo?: string;
  referenceType?: string;
  reference?: string;
  lines?: Line[];
  total?: number;
}

export const JournalEntries: React.FC = () => {
  const { showAlert } = useStore();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [refFilter, setRefFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    reference: '',
    lines: [
      { accountCode: '', debit: 0, credit: 0 },
      { accountCode: '', debit: 0, credit: 0 },
    ] as Line[],
  });

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

  const load = async () => {
    setLoading(true);
    try {
      const [entRes, accRes] = await Promise.all([
        authFetch('/api/accounting/journal-entries'),
        authFetch('/api/accounting/accounts').catch(() => null),
      ]);
      if (entRes.ok) {
        const d = await entRes.json();
        setEntries(Array.isArray(d) ? d : (d.entries || []));
      }
      if (accRes?.ok) {
        const d = await accRes.json();
        setAccounts(Array.isArray(d) ? d : (d.accounts || []));
      }
    } catch { showAlert('فشل تحميل دفتر اليومية', 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => entries.filter(e => {
    if (fromDate && e.date < fromDate) return false;
    if (toDate && e.date > toDate) return false;
    if (refFilter && !(`${e.referenceType || ''} ${e.reference || ''}`).toLowerCase().includes(refFilter.toLowerCase())) return false;
    if (accountFilter && !(e.lines || []).some(l => l.accountCode === accountFilter)) return false;
    return true;
  }), [entries, fromDate, toDate, refFilter, accountFilter]);

  const totalDebit = useMemo(() => form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [form.lines]);
  const totalCredit = useMemo(() => form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [form.lines]);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { accountCode: '', debit: 0, credit: 0 }] }));
  const removeLine = (i: number) => setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, k: keyof Line, v: any) => setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [k]: v } : l) }));

  const submit = async () => {
    if (!balanced) { showAlert('القيد غير متزن', 'error'); return; }
    if (!form.description.trim()) { showAlert('أدخل وصفاً', 'error'); return; }
    try {
      const res = await authFetch('/api/accounting/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      showAlert('تم تسجيل القيد', 'success');
      setShowNew(false);
      setForm({ date: new Date().toISOString().slice(0, 10), description: '', reference: '', lines: [{ accountCode: '', debit: 0, credit: 0 }, { accountCode: '', debit: 0, credit: 0 }] });
      load();
    } catch { showAlert('فشل حفظ القيد', 'error'); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BookOpen className="w-8 h-8 text-orange-500" />
          <h2 className="text-2xl font-black text-white">دفتر اليومية</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-200 border border-slate-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-sm font-bold text-white">
            <Plus className="w-4 h-4" /> إضافة قيد يومية
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">من تاريخ</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">إلى تاريخ</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">المرجع</label>
          <input type="text" value={refFilter} onChange={e => setRefFilter(e.target.value)} placeholder="نوع أو رقم المرجع..." className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">الحساب</label>
          <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            <option value="">الكل</option>
            {accounts.map(a => <option key={a.code || a.id} value={a.code || a.id}>{a.code} — {a.nameAr || a.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60 text-slate-300 text-xs font-black">
            <tr>
              <th className="p-3 text-right w-8"></th>
              <th className="p-3 text-right">التاريخ</th>
              <th className="p-3 text-right">الوصف</th>
              <th className="p-3 text-right">المرجع</th>
              <th className="p-3 text-right">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-8 text-center text-slate-500">جارٍ التحميل...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-slate-500">لا توجد قيود</td></tr>}
            {filtered.map(e => {
              const isOpen = expanded === e.id;
              const total = e.total ?? (e.lines || []).reduce((s, l) => s + (l.debit || 0), 0);
              return (
                <React.Fragment key={e.id}>
                  <tr className="border-t border-slate-800 hover:bg-slate-800/30 cursor-pointer" onClick={() => setExpanded(isOpen ? null : e.id)}>
                    <td className="p-3 text-slate-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</td>
                    <td className="p-3 text-slate-300">{e.date ? new Date(e.date).toLocaleDateString('ar-LY') : '—'}</td>
                    <td className="p-3 text-slate-200">{e.description || e.memo || '—'}</td>
                    <td className="p-3 text-slate-400 text-xs">{e.referenceType ? `${e.referenceType}: ${e.reference || ''}` : (e.reference || '—')}</td>
                    <td className="p-3 font-bold text-orange-400">{fmt(total)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-800/30">
                      <td colSpan={5} className="p-4">
                        <table className="w-full text-xs">
                          <thead className="text-slate-400">
                            <tr>
                              <th className="p-2 text-right">الحساب</th>
                              <th className="p-2 text-right">مدين</th>
                              <th className="p-2 text-right">دائن</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(e.lines || []).map((l, i) => (
                              <tr key={i} className="border-t border-slate-700">
                                <td className="p-2 text-slate-200">{l.accountName || l.accountCode}</td>
                                <td className="p-2 text-emerald-400">{l.debit ? fmt(l.debit) : '—'}</td>
                                <td className="p-2 text-red-400">{l.credit ? fmt(l.credit) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800 sticky top-0 bg-slate-900">
              <h3 className="text-lg font-black text-white">قيد يومية جديد</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">التاريخ</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">المرجع</label>
                  <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">الوصف</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-slate-300">السطور</h4>
                  <button onClick={addLine} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200"><Plus className="w-3 h-3" /> إضافة سطر</button>
                </div>
                <div className="space-y-2">
                  {form.lines.map((l, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-800/50 p-2 rounded-lg">
                      <select value={l.accountCode} onChange={e => updateLine(i, 'accountCode', e.target.value)} className="col-span-5 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200">
                        <option value="">— حساب —</option>
                        {accounts.map(a => <option key={a.code || a.id} value={a.code || a.id}>{a.code} — {a.nameAr || a.name}</option>)}
                      </select>
                      <input type="number" min={0} step={0.01} placeholder="مدين" value={l.debit} onChange={e => updateLine(i, 'debit', Number(e.target.value))} className="col-span-3 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-emerald-400" />
                      <input type="number" min={0} step={0.01} placeholder="دائن" value={l.credit} onChange={e => updateLine(i, 'credit', Number(e.target.value))} className="col-span-3 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-red-400" />
                      <button onClick={() => removeLine(i)} disabled={form.lines.length <= 2} className="col-span-1 p-1.5 text-red-400 hover:bg-slate-700 rounded disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`rounded-xl p-3 text-sm flex justify-between items-center ${balanced ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
                <span>مدين: {fmt(totalDebit)} · دائن: {fmt(totalCredit)}</span>
                <span className="font-black">{balanced ? 'متزن ✓' : `فرق: ${fmt(Math.abs(totalDebit - totalCredit))}`}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowNew(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm">إلغاء</button>
                <button onClick={submit} disabled={!balanced} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl text-sm font-bold">حفظ القيد</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JournalEntries;
