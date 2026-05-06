
import React, { useState, useEffect } from 'react';
import {
    Calculator as CalcIcon,
    DollarSign,
    Car,
    Gavel,
    Truck,
    ShieldCheck,
    Info,
    ChevronRight,
    ArrowLeft,
    FileText,
    Settings
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';

// Default settings — used when the admin hasn't customized anything yet
// or when /api/settings is unreachable.
const DEFAULTS = {
    auctionFee: 500,
    commission: 5, // %
    transport: 300,
    other: 100,
};

// Pick the first defined value across multiple possible keys.
// Admin UIs in the past used different naming conventions; this future-proofs
// against any of them by trying camelCase, snake_case, and the calculator_*
// prefix in priority order.
function pickNum(obj: any, keys: string[], fallback: number): number {
    if (!obj) return fallback;
    for (const k of keys) {
        const v = obj[k];
        if (v === null || v === undefined || v === '') continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return fallback;
}

export const CostCalculator = () => {
    const navigate = useNavigate();
    const { exchangeRate } = useStore();
    const [price, setPrice] = useState<number>(5000);
    const [settings, setSettings] = useState(DEFAULTS);
    const [loaded, setLoaded] = useState(false);

    // Fetch admin-configured settings on mount.
    // /api/settings is a flat key→value store. The admin form writes the
    // same keys via POST /api/settings so the calculator stays in sync.
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await fetch('/api/settings');
                if (!res.ok) return;
                const data = await res.json();
                if (!alive || !data || typeof data !== 'object') return;

                const next = {
                    auctionFee: pickNum(
                        data,
                        ['calculator_auction_fee', 'calc_auction_fee', 'auctionFee', 'auction_fee'],
                        DEFAULTS.auctionFee
                    ),
                    commission: pickNum(
                        data,
                        ['calculator_commission', 'commission_rate', 'commission', 'platform_commission'],
                        DEFAULTS.commission
                    ),
                    transport: pickNum(
                        data,
                        ['calculator_transport', 'transport_cost', 'transport', 'shipping_local'],
                        DEFAULTS.transport
                    ),
                    other: pickNum(
                        data,
                        ['calculator_other', 'other_fees', 'other', 'misc_fees'],
                        DEFAULTS.other
                    ),
                };
                setSettings(next);
            } catch (e) {
                // Network error — keep defaults silently.
                console.error('[CostCalculator] failed to load settings:', e);
            } finally {
                if (alive) setLoaded(true);
            }
        })();
        return () => { alive = false; };
    }, []);

    const total = price + settings.auctionFee + (price * (settings.commission / 100)) + settings.transport + settings.other;

    const glassCard = "bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-8 shadow-2xl";

    const handlePrintQuote = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const breakdown = [
            { label: 'سعر شراء السيارة', value: price },
            { label: 'رسوم المزاد الثابتة', value: settings.auctionFee },
            { label: 'عمولة الخدمة', value: (price * (settings.commission / 100)) },
            { label: 'الشحن والنقل المحلي', value: settings.transport },
            { label: 'رسوم المعاملات والأدوات', value: settings.other },
        ];

        const rows = breakdown.map(item =>
            `<tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-weight:600">${item.label}</td><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;font-family:monospace;text-align:left;font-weight:700">$${item.value.toLocaleString('en-US')}</td></tr>`
        ).join('');

        printWindow.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>عرض سعر - AutoPro</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:40px;color:#1e293b;direction:rtl}
.header{text-align:center;margin-bottom:32px;padding-bottom:24px;border-bottom:3px solid #f97316}
.header h1{font-size:28px;margin:0 0 8px;color:#0f172a}.header p{color:#64748b;margin:0;font-size:14px}
table{width:100%;border-collapse:collapse;margin:24px 0}
.total-row td{background:#f8fafc;font-size:20px;font-weight:900;color:#f97316;padding:16px}
.footer{margin-top:40px;text-align:center;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:20px}
@media print{body{padding:20px}}</style></head><body>
<div class="header"><h1>AutoPro - عرض سعر تقديري</h1><p>تاريخ الإصدار: ${new Date().toLocaleDateString('ar-LY')}</p></div>
<table><thead><tr><th style="text-align:right;padding:12px 16px;border-bottom:2px solid #1e293b;font-size:14px">البند</th><th style="text-align:left;padding:12px 16px;border-bottom:2px solid #1e293b;font-size:14px">المبلغ</th></tr></thead>
<tbody>${rows}<tr class="total-row"><td style="padding:16px;border-top:3px solid #f97316;font-weight:900">الإجمالي</td><td style="padding:16px;border-top:3px solid #f97316;font-family:monospace;text-align:left;font-weight:900">$${total.toLocaleString('en-US')}</td></tr>
<tr><td style="padding:12px 16px;color:#64748b" colspan="2">ما يعادل تقريباً: ${Math.round(total * (exchangeRate || 7)).toLocaleString('en-US')} د.ل</td></tr></tbody></table>
<div class="footer"><p>* هذا عرض سعر تقديري وقد يختلف حسب نتائج المزاد الفعلية</p><p>AutoPro - منصة استيراد السيارات الأولى في ليبيا</p></div>
</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 300);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white pt-24 pb-12 selection:bg-orange-500/30 font-sans" dir="rtl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
                    <div>
                        <button
                            onClick={() => navigate('/')}
                            className="group flex items-center gap-2 text-slate-500 hover:text-white transition-all mb-4 font-black text-sm"
                        >
                            <ArrowLeft className="w-4 h-4 translate-x-0 group-hover:translate-x-1" />
                            العودة للرئيسية
                        </button>
                        <h1 className="text-4xl md:text-5xl font-black flex items-center gap-4 tracking-tighter">
                            <div className="p-3 bg-orange-500 rounded-[1.5rem] shadow-xl shadow-orange-500/20">
                                <CalcIcon className="w-8 h-8 text-white" />
                            </div>
                            حاسبة التكلفة المحلية 🇱🇾
                        </h1>
                        {!loaded && (
                            <p className="text-xs text-slate-500 mt-2 font-bold">جاري تحميل الإعدادات...</p>
                        )}
                    </div>
                </div>

                <div className="grid lg:grid-cols-12 gap-8">
                    {/* Input Section */}
                    <div className="lg:col-span-7 space-y-6">
                        <div className={glassCard}>
                            <h3 className="text-xl font-black mb-8 flex items-center gap-3">
                                <div className="w-1.5 h-6 bg-orange-500 rounded-full"></div>
                                بيانات المزايدة والشراء
                            </h3>

                            <div className="space-y-10">
                                <div>
                                    <label className="block text-sm font-black text-slate-400 mb-4 mr-1 uppercase tracking-widest">سعر شراء السيارة المتوقع ($)</label>
                                    <div className="relative group">
                                        <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-orange-500 transition-colors" />
                                        <input
                                            type="number"
                                            value={price}
                                            onChange={(e) => setPrice(Number(e.target.value))}
                                            className="w-full bg-slate-900/50 border-2 border-white/5 rounded-[2rem] py-8 px-14 text-5xl font-black font-mono focus:border-orange-500 focus:bg-slate-900 outline-none transition-all shadow-inner text-white"
                                            placeholder="0"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-4 font-bold flex items-center gap-2">
                                        <Info className="w-3 h-3" />
                                        أدخل السعر المتوقع لترسي به المزايدة في المزاد المحلي.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl group hover:border-orange-500/30 transition-all">
                                        <div className="text-[10px] font-black text-slate-500 uppercase mb-2">رسوم المزاد</div>
                                        <div className="text-xl font-black font-mono group-hover:text-orange-500 transition-colors">${settings.auctionFee}</div>
                                    </div>
                                    <div className="p-6 bg-white/5 border border-white/5 rounded-3xl group hover:border-orange-500/30 transition-all">
                                        <div className="text-[10px] font-black text-slate-500 uppercase mb-2">عمولة المنصة</div>
                                        <div className="text-xl font-black font-mono group-hover:text-orange-500 transition-colors">{settings.commission}%</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-orange-500/10 border border-orange-500/20 p-8 rounded-[2rem] flex items-center gap-6">
                            <div className="w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/20">
                                <Settings className="w-8 h-8 animate-spin-slow" />
                            </div>
                            <div>
                                <h4 className="text-lg font-black text-orange-200 mb-1">شفافية كاملة في الرسوم</h4>
                                <p className="text-slate-400 text-sm font-bold leading-relaxed">نحن نعتمد نظام الرسوم الثابتة والمحددة مسبقاً لضمان عدم وجود أي تكاليف مخفية عند الاستلام.</p>
                            </div>
                        </div>
                    </div>

                    {/* Result Section */}
                    <div className="lg:col-span-5">
                        <div className="sticky top-24 space-y-6">
                            <div className="bg-slate-950 rounded-[3rem] overflow-hidden border border-white/10 shadow-2xl relative">
                                <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 blur-[120px] -mr-40 -mt-40"></div>

                                <div className="p-10 bg-gradient-to-br from-slate-900 to-slate-950 relative z-10 border-b border-white/5">
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-4">صافي التكلفة النهائية ($)</div>
                                    <div className="text-7xl flex flex-col items-center">
                                        <span className="font-black font-mono text-emerald-400 tracking-tighter drop-shadow-2xl">
                                            ${total.toLocaleString('en-US')}
                                        </span>
                                        <span className="text-3xl font-black font-mono text-emerald-400/70 tracking-tighter mt-2">
                                            ≈ {Math.round(total * (exchangeRate || 7)).toLocaleString('en-US')} د.ل
                                        </span>
                                    </div>
                                    <div className="mt-6 flex items-center gap-3">
                                        <div className="flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">الحساب مباشر ولحظي</span>
                                    </div>
                                </div>

                                <div className="p-10 space-y-6 relative z-10 backdrop-blur-sm">
                                    {[
                                        { label: 'سعر شراء السيارة', value: price, icon: DollarSign, color: 'text-white' },
                                        { label: 'رسوم المزاد الثابتة', value: settings.auctionFee, icon: Gavel, color: 'text-slate-400' },
                                        { label: 'عمولة الخدمة', value: (price * (settings.commission / 100)), icon: ShieldCheck, color: 'text-slate-400' },
                                        { label: 'الشحن والنقل المحلي', value: settings.transport, icon: Truck, color: 'text-slate-400' },
                                        { label: 'رسوم المعاملات والأدوات', value: settings.other, icon: CalcIcon, color: 'text-slate-400' },
                                    ].map((item, i) => (
                                        <div key={i} className="flex justify-between items-center group">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-white/5 rounded-xl group-hover:bg-orange-500/10 transition-colors">
                                                    <item.icon className={`w-4 h-4 ${i === 0 ? 'text-orange-500' : 'text-slate-500'} group-hover:text-orange-500 transition-colors`} />
                                                </div>
                                                <span className={`text-sm font-black ${item.color}`}>{item.label}</span>
                                            </div>
                                            <span className="text-xl font-black font-mono text-white">${item.value.toLocaleString('en-US')}</span>
                                        </div>
                                    ))}

                                    <div className="pt-8 mt-4 border-t border-white/5">
                                        <button
                                            onClick={handlePrintQuote}
                                            className="w-full bg-white text-slate-950 hover:bg-orange-500 hover:text-white py-6 rounded-[2rem] font-black text-xl transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-4 group"
                                        >
                                            تحميل عرض السعر PDF
                                            <FileText className="w-6 h-6 group-hover:scale-110 transition-transform" />
                                        </button>
                                        <p className="text-[10px] text-slate-600 font-bold text-center mt-6 italic">
                                            * السعر أعلاه هو السعر التقريبي الواصل إلى يدك بناءً على المعطيات المدخلة.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Trust Badge */}
                            <div className="glass-dark border border-white/5 rounded-3xl p-6 flex gap-4 items-start">
                                <ShieldCheck className="w-6 h-6 text-emerald-500 shrink-0" />
                                <div className="text-[11px] text-slate-400 font-bold leading-relaxed">
                                    نحن نضمن أن كافة الرسوم الإدارية والعمولات تخضع لسياسة السعر الواحد، مما يعني أنك لن تفاجئ بأي إضافات عند تروس السيارة.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

