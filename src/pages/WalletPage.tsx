import React, { useState, useEffect } from 'react';
import {
    Wallet, Plus, ArrowDownLeft, ArrowUpRight, CreditCard,
    CheckCircle2, Clock, XCircle, FileText, Copy, Info,
    DollarSign, TrendingUp, Shield, ChevronDown, ChevronUp,
    AlertCircle, Send, Banknote, RefreshCw, ReceiptText
} from 'lucide-react';
import { useStore, authFetch } from '../context/StoreContext';
import { Link } from 'react-router-dom';

/* ─── types ─── */
interface WalletData {
    balance: number; reservedAmount: number;
    totalDeposited: number; totalSpent: number;
    iban?: string; bankName?: string;
    unpaidInvoices: any[]; pendingRequests: any[];
}
interface Tx { id: string; type: string; amount: number; balanceAfter: number; description: string; timestamp: string; }

const TYPE_LABELS: Record<string, string> = {
    topup: 'شحن محفظة', withdrawal: 'سحب رصيد', invoice_payment: 'دفع فاتورة'
};
const INV_TYPE: Record<string, string> = { purchase: 'شراء', transport: 'نقل داخلي', shipping: 'شحن دولي' };
const METHOD_LABELS: Record<string, string> = { bank_transfer: 'تحويل بنكي', cash: 'نقداً', card: 'بطاقة' };

const BANK_INFO = {
    bankName: 'مصرف الجمهورية — ليبيا',
    iban: 'LY83 0020 0000 0000 0000 0000',
    accountName: 'شركة ليبيا أوتو برو للمزادات',
    swift: 'JMHBLYLT',
};

export const WalletPage = () => {
    const { currentUser, showAlert } = useStore();
    const [wallet, setWallet] = useState<WalletData | null>(null);
    const [txs, setTxs] = useState<Tx[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'topup' | 'withdraw' | 'invoices' | 'history'>('overview');

    /* top-up form */
    const [topupAmount, setTopupAmount] = useState('');
    const [topupMethod, setTopupMethod] = useState('bank_transfer');
    const [topupRef, setTopupRef] = useState('');
    const [topupLoading, setTopupLoading] = useState(false);

    /* withdraw form */
    const [wdAmount, setWdAmount] = useState('');
    const [wdIban, setWdIban] = useState('');
    const [wdBank, setWdBank] = useState('');
    const [wdLoading, setWdLoading] = useState(false);

    /* invoice payment */
    const [payingInvId, setPayingInvId] = useState<string | null>(null);

    const load = async () => {
        if (!currentUser) return;
        setLoading(true);
        try {
            const [wRes, txRes] = await Promise.all([
                authFetch(`/api/wallet/${currentUser.id}`),
                authFetch(`/api/wallet/${currentUser.id}/transactions`)
            ]);
            if (wRes.ok) setWallet(await wRes.json());
            if (txRes.ok) setTxs(await txRes.json());
        } catch { }
        setLoading(false);
    };

    useEffect(() => { load(); }, [currentUser]);

    const handleTopup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !topupAmount) return;
        setTopupLoading(true);
        const res = await authFetch('/api/wallet/topup', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, amount: Number(topupAmount), method: topupMethod, referenceNo: topupRef })
        });
        const data = await res.json();
        if (res.ok) {
            showAlert(data.message, 'success');
            setTopupAmount(''); setTopupRef('');
            setActiveTab('overview'); load();
        } else showAlert(data.error, 'error');
        setTopupLoading(false);
    };

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !wdAmount) return;
        setWdLoading(true);
        const res = await authFetch('/api/wallet/withdrawal', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, amount: Number(wdAmount), iban: wdIban, bankName: wdBank })
        });
        const data = await res.json();
        if (res.ok) { showAlert(data.message, 'success'); setWdAmount(''); setActiveTab('overview'); load(); }
        else showAlert(data.error, 'error');
        setWdLoading(false);
    };

    const handlePayInvoice = async (invoiceId: string) => {
        if (!currentUser) return;
        setPayingInvId(invoiceId);
        const res = await authFetch('/api/wallet/pay-invoice', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, invoiceId })
        });
        const data = await res.json();
        if (res.ok) { showAlert('تم الدفع بنجاح ✅', 'success'); load(); }
        else showAlert(data.error, 'error');
        setPayingInvId(null);
    };

    const copyText = (t: string) => { navigator.clipboard.writeText(t); showAlert('تم النسخ!', 'success'); };

    const inp = 'w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3.5 font-bold text-sm outline-none focus:border-orange-500 transition-all';
    const tab = (id: typeof activeTab, label: string, icon: React.ReactNode) => (
        <button onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm transition-all whitespace-nowrap ${activeTab === id ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500 hover:bg-slate-100'}`}>
            {icon}{label}
        </button>
    );

    if (!currentUser) return <div className="min-h-screen flex items-center justify-center text-slate-500 font-bold">يرجى <Link to="/auth" className="text-orange-500 underline mx-1">تسجيل الدخول</Link> أولاً</div>;
    if (loading) return <div className="min-h-screen flex items-center justify-center"><RefreshCw className="w-8 h-8 animate-spin text-orange-500" /></div>;

    const bal = wallet?.balance ?? 0;
    const rsrvd = wallet?.reservedAmount ?? 0;
    const avail = bal - rsrvd;

    return (
        <div dir="rtl" className="min-h-screen bg-slate-50 font-cairo pb-20">

            {/* ── Hero banner ── */}
            <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white pt-28 pb-16 overflow-hidden">
                <div className="absolute inset-0 opacity-5 bg-carbon-pattern" />
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-orange-500/15 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3" />
                <div className="max-w-4xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/30">
                                    <Wallet className="w-6 h-6 text-white" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest">محفظتي</p>
                                    <h1 className="text-xl font-black text-white">{currentUser.firstName} {currentUser.lastName}</h1>
                                </div>
                            </div>
                            <div className="flex items-end gap-3">
                                <span className="text-6xl font-black text-white">${avail.toLocaleString('en-US')}</span>
                                <span className="text-slate-400 text-sm font-bold mb-2">متاح للمزايدة</span>
                            </div>
                            {rsrvd > 0 && (
                                <p className="text-yellow-400 text-xs font-bold mt-1 flex items-center gap-1.5">
                                    <Shield className="w-3.5 h-3.5" /> ${rsrvd.toLocaleString('en-US')} محجوز في مزايدات نشطة
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 w-full md:w-auto">
                            {[
                                { label: 'إجمالي المودع', val: wallet?.totalDeposited || 0, icon: ArrowDownLeft, color: 'text-green-400' },
                                { label: 'إجمالي المنفق', val: wallet?.totalSpent || 0, icon: ArrowUpRight, color: 'text-red-400' },
                            ].map(s => (
                                <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center min-w-[130px]">
                                    <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
                                    <div className="text-xl font-black text-white">${s.val.toLocaleString('en-US')}</div>
                                    <div className="text-slate-400 text-xs font-bold">{s.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Unpaid invoices alert ── */}
            {(wallet?.unpaidInvoices?.length ?? 0) > 0 && (
                <div className="max-w-4xl mx-auto px-6 mt-6">
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-orange-500 shrink-0" />
                        <p className="text-orange-700 font-bold text-sm flex-1">
                            لديك <strong>{wallet!.unpaidInvoices.length}</strong> فاتورة مستحقة بإجمالي
                            <strong className="mx-1">${wallet!.unpaidInvoices.reduce((sum, inv) => sum + inv.amount, 0).toLocaleString('en-US')}</strong>
                        </p>
                        <button onClick={() => setActiveTab('invoices')} className="text-xs font-black bg-orange-500 text-white px-4 py-2 rounded-xl hover:bg-orange-600 transition-colors">
                            ادفع الآن
                        </button>
                    </div>
                </div>
            )}

            {/* ── Tabs ── */}
            <div className="max-w-4xl mx-auto px-6 mt-8">
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    {tab('overview', 'نظرة عامة', <Wallet className="w-4 h-4" />)}
                    {tab('topup', 'شحن المحفظة', <Plus className="w-4 h-4" />)}
                    {tab('invoices', 'الفواتير', <FileText className="w-4 h-4" />)}
                    {tab('withdraw', 'سحب الرصيد', <Banknote className="w-4 h-4" />)}
                    {tab('history', 'سجل العمليات', <ReceiptText className="w-4 h-4" />)}
                </div>

                <div className="mt-6">

                    {/* ── Overview ── */}
                    {activeTab === 'overview' && (
                        <div className="space-y-5">
                            {/* Quick actions */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { label: 'شحن المحفظة', icon: Plus, tab: 'topup' as const, color: 'bg-green-500' },
                                    { label: 'دفع فاتورة', icon: FileText, tab: 'invoices' as const, color: 'bg-orange-500' },
                                    { label: 'سحب الرصيد', icon: ArrowUpRight, tab: 'withdraw' as const, color: 'bg-blue-500' },
                                    { label: 'سجل الحركات', icon: ReceiptText, tab: 'history' as const, color: 'bg-slate-700' },
                                ].map(a => (
                                    <button key={a.label} onClick={() => setActiveTab(a.tab)}
                                        className={`${a.color} text-white rounded-2xl p-5 flex flex-col items-center gap-2 hover:opacity-90 transition-all hover:-translate-y-0.5 shadow-lg active:scale-95`}>
                                        <a.icon className="w-6 h-6" />
                                        <span className="font-black text-sm">{a.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Pending requests */}
                            {(wallet?.pendingRequests?.length ?? 0) > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    <div className="p-4 border-b border-slate-100">
                                        <h3 className="font-black text-slate-800 flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-orange-500" /> طلبات قيد المراجعة
                                        </h3>
                                    </div>
                                    {wallet!.pendingRequests.map((pr: any) => (
                                        <div key={pr.id} className="flex items-center gap-4 px-4 py-3 border-b border-slate-50 last:border-0">
                                            <div className="w-9 h-9 bg-yellow-50 rounded-xl flex items-center justify-center">
                                                <Clock className="w-4 h-4 text-yellow-500" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-slate-800 text-sm">{TYPE_LABELS[pr.type] || pr.type}</p>
                                                <p className="text-xs text-slate-400">{new Date(pr.requestedAt).toLocaleDateString('ar-LY')}</p>
                                            </div>
                                            <span className="font-black text-slate-900">${Number(pr.amount).toLocaleString('en-US')}</span>
                                            <span className="text-xs bg-yellow-100 text-yellow-700 font-black px-2.5 py-1 rounded-lg">جاري المراجعة</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Recent transactions */}
                            {txs.length > 0 && (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                                        <h3 className="font-black text-slate-800">آخر الحركات</h3>
                                        <button onClick={() => setActiveTab('history')} className="text-xs font-black text-orange-500 hover:underline">عرض الكل</button>
                                    </div>
                                    {txs.slice(0, 5).map(tx => (
                                        <div key={tx.id} className="flex items-center gap-4 px-4 py-3 border-b border-slate-50 last:border-0">
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tx.type === 'credit' ? 'bg-green-50' : 'bg-red-50'}`}>
                                                {tx.type === 'credit'
                                                    ? <ArrowDownLeft className="w-4 h-4 text-green-500" />
                                                    : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-800 text-sm truncate">{tx.description}</p>
                                                <p className="text-xs text-slate-400">{new Date(tx.timestamp).toLocaleDateString('ar-LY')}</p>
                                            </div>
                                            <span className={`font-black ${tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                                                {tx.type === 'credit' ? '+' : '-'}${tx.amount.toLocaleString('en-US')}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Top-up ── */}
                    {activeTab === 'topup' && (
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Bank info card */}
                            <div className="bg-slate-900 text-white rounded-3xl p-6 space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <Banknote className="w-6 h-6 text-orange-400" />
                                    <h3 className="font-black text-lg">بيانات التحويل البنكي</h3>
                                </div>
                                <p className="text-slate-400 text-sm font-bold">حوّل المبلغ لهذا الحساب ثم أدخل رقم المرجع في النموذج</p>
                                {[
                                    { label: 'اسم المستفيد', val: BANK_INFO.accountName },
                                    { label: 'اسم البنك', val: BANK_INFO.bankName },
                                    { label: 'IBAN', val: BANK_INFO.iban },
                                    { label: 'SWIFT', val: BANK_INFO.swift },
                                ].map(row => (
                                    <div key={row.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{row.label}</p>
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-black text-sm text-white">{row.val}</span>
                                            <button aria-label="زر" title="زر" onClick={() => copyText(row.val)} className="text-orange-400 hover:text-orange-300">
                                                <Copy className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Form */}
                            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                                <h3 className="font-black text-slate-800 text-lg mb-5">تأكيد طلب الشحن</h3>
                                <form onSubmit={handleTopup} className="space-y-4">
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-2">المبلغ($)</label>
                                        <div className="relative">
                                            <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5" />
                                            <input aria-label="مدخل" title="مدخل" placeholder="مدخل"  type="number" min="100" required className={`${inp} pr-12`}
                                                value={topupAmount} onChange={e => setTopupAmount(e.target.value)} />
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            {[500, 1000, 5000, 10000].map(v => (
                                                <button key={v} type="button" onClick={() => setTopupAmount(String(v))}
                                                    className="text-xs font-black border border-slate-200 text-slate-600 hover:border-orange-400 hover:text-orange-500 px-3 py-1.5 rounded-xl transition-colors">
                                                    ${v.toLocaleString('en-US')}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-2">طريقة الدفع</label>
                                        <select aria-label="تحديد" title="تحديد" className={inp} value={topupMethod} onChange={e => setTopupMethod(e.target.value)}>
                                            <option value="bank_transfer">تحويل بنكي</option>
                                            <option value="cash">نقداً في المكتب</option>
                                            <option value="card">بطاقة ائتمان</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-2">رقم مرجع التحويل</label>
                                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل"  type="text" className={inp}
                                            value={topupRef} onChange={e => setTopupRef(e.target.value)} />
                                    </div>
                                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-start gap-2">
                                        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                        <p className="text-xs font-bold text-blue-700">
                                            بعد الإرسال، سيُراجَع الطلب خلال 24 ساعة. عند الموافقة، يُضاف الرصيد تلقائياً وتصلك إشعار.
                                        </p>
                                    </div>
                                    <button type="submit" disabled={topupLoading}
                                        className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-green-600/20 transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                                        <Send className="w-5 h-5" />
                                        {topupLoading ? 'جاري الإرسال...' : 'إرسال طلب الشحن'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ── Invoices ── */}
                    {activeTab === 'invoices' && (
                        <div className="space-y-4">
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-slate-100">
                                    <h3 className="font-black text-slate-800">الفواتير المستحقة</h3>
                                    <p className="text-slate-400 text-xs font-bold mt-0.5">ادفع مباشرة من رصيد محفظتك</p>
                                </div>
                                {(wallet?.unpaidInvoices?.length ?? 0) === 0 ? (
                                    <div className="p-10 text-center text-slate-400 font-bold">
                                        <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                                        لا توجد فواتير مستحقة — الحساب نظيف ✅
                                    </div>
                                ) : (
                                    wallet!.unpaidInvoices.map(inv => (
                                        <div key={inv.id} className="flex items-center gap-4 px-5 py-4 border-b border-slate-50 last:border-0">
                                            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                                                <FileText className="w-5 h-5 text-orange-500" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-black text-slate-800">{INV_TYPE[inv.type] || inv.type}</p>
                                                <p className="text-xs text-slate-400 font-bold">{inv.id} • يُستحق {new Date(inv.dueDate).toLocaleDateString('ar-LY')}</p>
                                            </div>
                                            <span className="text-lg font-black text-slate-900">${inv.amount.toLocaleString('en-US')}</span>
                                            <button
                                                disabled={payingInvId === inv.id || avail < inv.amount}
                                                onClick={() => handlePayInvoice(inv.id)}
                                                className={`px-5 py-2.5 rounded-xl font-black text-sm transition-all ${avail < inv.amount ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-500/20 active:scale-95'}`}>
                                                {payingInvId === inv.id ? '...' : avail < inv.amount ? 'رصيد غير كافٍ' : 'ادفع الآن'}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                            {avail < (wallet?.unpaidInvoices?.[0]?.amount || 0) && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex items-center gap-3">
                                    <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                                    <p className="text-yellow-700 font-bold text-sm flex-1">رصيدك غير كافٍ لدفع هذه الفاتورة.</p>
                                    <button onClick={() => setActiveTab('topup')} className="text-xs font-black bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 transition-colors">
                                        اشحن الآن
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Withdraw ── */}
                    {activeTab === 'withdraw' && (
                        <div className="max-w-lg">
                            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                                <h3 className="font-black text-slate-800 text-lg mb-1">سحب الرصيد</h3>
                                <p className="text-slate-400 text-sm font-bold mb-6">الرصيد المتاح: <strong className="text-slate-900">${avail.toLocaleString('en-US')}</strong></p>
                                <form onSubmit={handleWithdraw} className="space-y-4">
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-2">المبلغ ($)</label>
                                        <div className="relative">
                                            <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5" />
                                            <input aria-label="مدخل" title="مدخل" placeholder="مدخل"  type="number" min="100" max={avail} required className={`${inp} pr-12`}
                                                value={wdAmount} onChange={e => setWdAmount(e.target.value)} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-2">IBAN</label>
                                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل"  type="text" required className={inp}
                                            value={wdIban} onChange={e => setWdIban(e.target.value)} />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-2">اسم البنك</label>
                                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل"  type="text" required className={inp}
                                            value={wdBank} onChange={e => setWdBank(e.target.value)} />
                                    </div>
                                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-xs font-bold text-slate-500">
                                        ⏱️ تتم معالجة طلبات السحب خلال 2-3 أيام عمل بعد مراجعة الإدارة.
                                    </div>
                                    <button type="submit" disabled={wdLoading || Number(wdAmount) > avail}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-600/20 transition-all active:scale-95 disabled:opacity-60">
                                        {wdLoading ? 'جاري الإرسال...' : 'طلب السحب'}
                                    </button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ── History ── */}
                    {activeTab === 'history' && (
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-5 border-b border-slate-100">
                                <h3 className="font-black text-slate-800">سجل كامل لحركات المحفظة</h3>
                            </div>
                            {txs.length === 0 ? (
                                <p className="text-center text-slate-400 font-bold py-10">لا توجد حركات بعد</p>
                            ) : txs.map(tx => (
                                <div key={tx.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tx.type === 'credit' ? 'bg-green-50' : 'bg-red-50'}`}>
                                        {tx.type === 'credit' ? <ArrowDownLeft className="w-4 h-4 text-green-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 text-sm truncate">{tx.description}</p>
                                        <p className="text-xs text-slate-400">{new Date(tx.timestamp).toLocaleString('en-US')}</p>
                                    </div>
                                    <div className="text-left">
                                        <span className={`font-black ${tx.type === 'credit' ? 'text-green-600' : 'text-red-500'}`}>
                                            {tx.type === 'credit' ? '+' : '-'}${tx.amount.toLocaleString('en-US')}
                                        </span>
                                        <p className="text-xs text-slate-400 font-bold">${tx.balanceAfter.toLocaleString('en-US')} رصيد</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
