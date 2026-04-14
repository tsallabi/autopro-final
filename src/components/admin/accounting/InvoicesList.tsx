import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Plus, Filter, Eye, Edit, CheckCircle2, XCircle, RefreshCw, X, Trash2 } from 'lucide-react';
import { authFetch, useStore } from '../../../context/StoreContext';

type InvoiceStatus = 'draft' | 'unpaid' | 'paid' | 'void';

interface Invoice {
  id: string;
  number: string;
  date: string;
  customerId?: string;
  customerName?: string;
  type?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  status: InvoiceStatus;
}

interface Item { description: string; quantity: number; unitPrice: number; }

const STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة',
  unpaid: 'غير مدفوعة',
  paid: 'مدفوعة',
  void: 'ملغاة',
};

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-200',
  unpaid: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  paid: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  void: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

interface Props { onOpenInvoice?: (id: string) => void; }

export const InvoicesList: React.FC<Props> = ({ onOpenInvoice }) => {
  const { showAlert } = useStore();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [newForm, setNewForm] = useState({
    customerName: '',
    customerId: '',
    type: 'sale',
    taxRate: 0,
    items: [{ description: '', quantity: 1, unitPrice: 0 }] as Item[],
  });

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/accounting/invoices');
      if (res.ok) {
        const data = await res.json();
        setInvoices(Array.isArray(data) ? data : (data.invoices || []));
      } else throw new Error('failed');
    } catch (e: any) {
      showAlert('فشل تحميل الفواتير', 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
      if (customerFilter && !(inv.customerName || '').toLowerCase().includes(customerFilter.toLowerCase())) return false;
      if (fromDate && inv.date < fromDate) return false;
      if (toDate && inv.date > toDate) return false;
      return true;
    });
  }, [invoices, statusFilter, customerFilter, fromDate, toDate]);

  const subtotal = useMemo(() => newForm.items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0), [newForm.items]);
  const taxAmt = subtotal * (Number(newForm.taxRate) || 0) / 100;
  const grandTotal = subtotal + taxAmt;

  const addItem = () => setNewForm(f => ({ ...f, items: [...f.items, { description: '', quantity: 1, unitPrice: 0 }] }));
  const removeItem = (i: number) => setNewForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, k: keyof Item, v: any) => setNewForm(f => ({ ...f, items: f.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));

  const submitCreate = async () => {
    if (!newForm.customerName.trim()) { showAlert('أدخل اسم العميل', 'error'); return; }
    if (newForm.items.length === 0 || newForm.items.some(it => !it.description.trim())) { showAlert('أدخل وصفاً لجميع البنود', 'error'); return; }
    try {
      const res = await authFetch('/api/accounting/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newForm, subtotal, tax: taxAmt, total: grandTotal, status: 'draft' }),
      });
      if (!res.ok) throw new Error('failed');
      showAlert('تم إنشاء الفاتورة', 'success');
      setShowCreate(false);
      setNewForm({ customerName: '', customerId: '', type: 'sale', taxRate: 0, items: [{ description: '', quantity: 1, unitPrice: 0 }] });
      load();
    } catch { showAlert('فشل إنشاء الفاتورة', 'error'); }
  };

  const doAction = async (id: string, action: 'confirm' | 'void') => {
    try {
      const res = await authFetch(`/api/accounting/invoices/${id}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      showAlert(action === 'confirm' ? 'تم تأكيد الفاتورة' : 'تم إلغاء الفاتورة', 'success');
      load();
    } catch { showAlert('فشلت العملية', 'error'); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-orange-500" />
          <h2 className="text-2xl font-black text-white">الفواتير</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-200 border border-slate-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-sm font-bold text-white">
            <Plus className="w-4 h-4" /> إنشاء فاتورة جديدة
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-400 mb-1">الحالة</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            <option value="all">الكل</option>
            <option value="draft">مسودة</option>
            <option value="unpaid">غير مدفوعة</option>
            <option value="paid">مدفوعة</option>
            <option value="void">ملغاة</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">من تاريخ</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">إلى تاريخ</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs text-slate-400 mb-1">العميل</label>
          <input type="text" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} placeholder="اسم العميل..." className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        {(statusFilter !== 'all' || fromDate || toDate || customerFilter) && (
          <button onClick={() => { setStatusFilter('all'); setFromDate(''); setToDate(''); setCustomerFilter(''); }} className="px-3 py-2 text-sm text-slate-400 hover:text-orange-400">
            مسح الفلاتر
          </button>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-slate-300 text-xs font-black">
              <tr>
                <th className="p-3 text-right">رقم</th>
                <th className="p-3 text-right">التاريخ</th>
                <th className="p-3 text-right">العميل</th>
                <th className="p-3 text-right">النوع</th>
                <th className="p-3 text-right">المبلغ</th>
                <th className="p-3 text-right">الضريبة</th>
                <th className="p-3 text-right">الإجمالي</th>
                <th className="p-3 text-right">الحالة</th>
                <th className="p-3 text-right">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-500">جارٍ التحميل...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-slate-500">لا توجد فواتير</td></tr>
              )}
              {filtered.map(inv => (
                <tr key={inv.id} className="border-t border-slate-800 hover:bg-slate-800/30">
                  <td className="p-3 font-bold text-orange-400">{inv.number}</td>
                  <td className="p-3 text-slate-300">{inv.date ? new Date(inv.date).toLocaleDateString('ar-LY') : '—'}</td>
                  <td className="p-3 text-slate-200">{inv.customerName || '—'}</td>
                  <td className="p-3 text-slate-400">{inv.type || '—'}</td>
                  <td className="p-3 text-slate-300">{fmt(inv.subtotal || 0)}</td>
                  <td className="p-3 text-slate-300">{fmt(inv.tax || 0)}</td>
                  <td className="p-3 font-bold text-white">{fmt(inv.total || 0)}</td>
                  <td className="p-3"><span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${STATUS_CLASS[inv.status] || STATUS_CLASS.draft}`}>{STATUS_LABEL[inv.status] || inv.status}</span></td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <button onClick={() => onOpenInvoice?.(inv.id)} title="عرض" className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-300"><Eye className="w-4 h-4" /></button>
                      {inv.status === 'draft' && (
                        <>
                          <button title="تعديل" className="p-1.5 hover:bg-slate-700 rounded-lg text-blue-400"><Edit className="w-4 h-4" /></button>
                          <button onClick={() => doAction(inv.id, 'confirm')} title="تأكيد" className="p-1.5 hover:bg-slate-700 rounded-lg text-emerald-400"><CheckCircle2 className="w-4 h-4" /></button>
                        </>
                      )}
                      {inv.status !== 'void' && inv.status !== 'paid' && (
                        <button onClick={() => doAction(inv.id, 'void')} title="إلغاء" className="p-1.5 hover:bg-slate-700 rounded-lg text-red-400"><XCircle className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-800 sticky top-0 bg-slate-900">
              <h3 className="text-lg font-black text-white">فاتورة جديدة</h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">اسم العميل</label>
                  <input value={newForm.customerName} onChange={e => setNewForm({ ...newForm, customerName: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">معرّف العميل (اختياري)</label>
                  <input value={newForm.customerId} onChange={e => setNewForm({ ...newForm, customerId: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">النوع</label>
                  <select value={newForm.type} onChange={e => setNewForm({ ...newForm, type: e.target.value })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
                    <option value="sale">مبيعات</option>
                    <option value="service">خدمة</option>
                    <option value="commission">عمولة</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">نسبة الضريبة %</label>
                  <input type="number" min={0} step={0.01} value={newForm.taxRate} onChange={e => setNewForm({ ...newForm, taxRate: Number(e.target.value) })} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-slate-300">البنود</h4>
                  <button onClick={addItem} className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-200"><Plus className="w-3 h-3" /> إضافة بند</button>
                </div>
                <div className="space-y-2">
                  {newForm.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center bg-slate-800/50 p-2 rounded-lg">
                      <input placeholder="الوصف" value={it.description} onChange={e => updateItem(i, 'description', e.target.value)} className="col-span-6 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                      <input type="number" min={0} placeholder="الكمية" value={it.quantity} onChange={e => updateItem(i, 'quantity', Number(e.target.value))} className="col-span-2 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                      <input type="number" min={0} step={0.01} placeholder="السعر" value={it.unitPrice} onChange={e => updateItem(i, 'unitPrice', Number(e.target.value))} className="col-span-3 bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200" />
                      <button onClick={() => removeItem(i)} disabled={newForm.items.length === 1} className="col-span-1 p-1.5 text-red-400 hover:bg-slate-700 rounded disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 space-y-1 text-sm">
                <div className="flex justify-between text-slate-300"><span>المجموع الفرعي</span><span>{fmt(subtotal)}</span></div>
                <div className="flex justify-between text-slate-300"><span>الضريبة ({newForm.taxRate}%)</span><span>{fmt(taxAmt)}</span></div>
                <div className="flex justify-between text-orange-400 font-black text-base pt-1 border-t border-slate-700 mt-1"><span>الإجمالي</span><span>{fmt(grandTotal)}</span></div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm">إلغاء</button>
                <button onClick={submitCreate} className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold">حفظ كمسودة</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvoicesList;
