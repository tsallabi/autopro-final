import React, { useState, useEffect } from 'react';
import { FileText, Printer, CheckCircle2, XCircle, ArrowRight, BookOpen } from 'lucide-react';
import { authFetch, useStore } from '../../../context/StoreContext';

interface Props {
  invoiceId: string;
  onBack?: () => void;
  onChanged?: () => void;
}

const STATUS_LABEL: Record<string, string> = { draft: 'مسودة', unpaid: 'غير مدفوعة', paid: 'مدفوعة', void: 'ملغاة' };
const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-slate-700 text-slate-200',
  unpaid: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  paid: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  void: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

export const InvoiceDetail: React.FC<Props> = ({ invoiceId, onBack, onChanged }) => {
  const { showAlert } = useStore();
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState<any>(null);
  const [journalEntry, setJournalEntry] = useState<any>(null);

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/accounting/invoices/${invoiceId}`);
      if (res.ok) {
        const data = await res.json();
        setInvoice(data.invoice || data);
        setJournalEntry(data.journalEntry || data.journal || null);
      } else throw new Error('failed');
    } catch { showAlert('فشل تحميل الفاتورة', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [invoiceId]);

  const doAction = async (action: 'confirm' | 'void') => {
    try {
      const res = await authFetch(`/api/accounting/invoices/${invoiceId}/${action}`, { method: 'POST' });
      if (!res.ok) throw new Error();
      showAlert(action === 'confirm' ? 'تم التأكيد' : 'تم الإلغاء', 'success');
      onChanged?.();
      load();
    } catch { showAlert('فشلت العملية', 'error'); }
  };

  if (loading) return <div className="p-6 text-center text-slate-400">جارٍ التحميل...</div>;
  if (!invoice) return <div className="p-6 text-center text-slate-500">الفاتورة غير موجودة</div>;

  const items: any[] = invoice.items || invoice.lineItems || [];

  return (
    <div className="p-4 md:p-6 space-y-4 text-right" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-xl text-slate-300">
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
          <FileText className="w-8 h-8 text-orange-500" />
          <div>
            <h2 className="text-2xl font-black text-white">فاتورة {invoice.number}</h2>
            <span className={`inline-block mt-1 px-2 py-1 rounded-lg text-[10px] font-bold ${STATUS_CLASS[invoice.status] || STATUS_CLASS.draft}`}>
              {STATUS_LABEL[invoice.status] || invoice.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm text-slate-200 border border-slate-700">
            <Printer className="w-4 h-4" /> طباعة
          </button>
          {invoice.status === 'draft' && (
            <button onClick={() => doAction('confirm')} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-sm font-bold text-white">
              <CheckCircle2 className="w-4 h-4" /> تأكيد
            </button>
          )}
          {invoice.status !== 'void' && invoice.status !== 'paid' && (
            <button onClick={() => doAction('void')} className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-sm font-bold border border-red-500/30">
              <XCircle className="w-4 h-4" /> إلغاء
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-slate-800">
          <div><div className="text-xs text-slate-400">رقم الفاتورة</div><div className="font-black text-orange-400 text-lg">{invoice.number}</div></div>
          <div><div className="text-xs text-slate-400">التاريخ</div><div className="font-bold text-slate-200">{invoice.date ? new Date(invoice.date).toLocaleDateString('ar-LY') : '—'}</div></div>
          <div><div className="text-xs text-slate-400">العميل</div><div className="font-bold text-slate-200">{invoice.customerName || '—'}</div></div>
        </div>

        <div>
          <h3 className="font-bold text-slate-300 mb-2">البنود</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-slate-300 text-xs">
                <tr>
                  <th className="p-2 text-right">الوصف</th>
                  <th className="p-2 text-right">الكمية</th>
                  <th className="p-2 text-right">السعر</th>
                  <th className="p-2 text-right">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-slate-500">لا بنود</td></tr>}
                {items.map((it, i) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="p-2 text-slate-200">{it.description || '—'}</td>
                    <td className="p-2 text-slate-300">{it.quantity || 0}</td>
                    <td className="p-2 text-slate-300">{fmt(it.unitPrice || 0)}</td>
                    <td className="p-2 font-bold text-slate-100">{fmt((it.quantity || 0) * (it.unitPrice || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="w-full md:w-80 bg-slate-800/50 rounded-xl p-4 space-y-1 text-sm">
            <div className="flex justify-between text-slate-300"><span>المجموع الفرعي</span><span>{fmt(invoice.subtotal || 0)}</span></div>
            <div className="flex justify-between text-slate-300"><span>الضريبة</span><span>{fmt(invoice.tax || 0)}</span></div>
            <div className="flex justify-between text-orange-400 font-black text-base pt-2 border-t border-slate-700"><span>الإجمالي</span><span>{fmt(invoice.total || 0)}</span></div>
          </div>
        </div>
      </div>

      {journalEntry && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="font-black text-white mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-orange-500" /> قيد اليومية المرتبط
          </h3>
          <div className="text-sm text-slate-300 mb-2">
            <span className="text-slate-500">رقم القيد: </span>{journalEntry.id || journalEntry.number}
            {journalEntry.date && <span className="text-slate-500 mr-3">التاريخ: {new Date(journalEntry.date).toLocaleDateString('ar-LY')}</span>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 text-xs text-slate-300">
              <tr>
                <th className="p-2 text-right">الحساب</th>
                <th className="p-2 text-right">مدين</th>
                <th className="p-2 text-right">دائن</th>
              </tr>
            </thead>
            <tbody>
              {(journalEntry.lines || []).map((ln: any, i: number) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="p-2 text-slate-200">{ln.accountName || ln.accountCode || '—'}</td>
                  <td className="p-2 text-emerald-400">{ln.debit ? fmt(ln.debit) : '—'}</td>
                  <td className="p-2 text-red-400">{ln.credit ? fmt(ln.credit) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default InvoiceDetail;
