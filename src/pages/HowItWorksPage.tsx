import React, { useState } from 'react';
import { Timer, Gavel, Trophy, Clock, ShoppingBag, RotateCcw, Truck, Ship, MapPin, Calculator, FileCheck, CheckCircle2, Shield, Zap, Eye, ArrowRight, ChevronDown, Star, TrendingUp, Users, Lock, DollarSign, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const HowItWorksPage = () => {
    const navigate = useNavigate();
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white" dir="rtl">

            {/* ━━ HERO ━━ */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
                <div className="max-w-5xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-5 py-2 mb-8">
                        <Sparkles className="w-4 h-4 text-orange-400" />
                        <span className="text-orange-300 text-sm font-bold">منصة المزادات الأذكى في ليبيا والخليج</span>
                    </div>
                    <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
                        كيف تشتري سيارتك من
                        <span className="text-transparent bg-clip-text bg-gradient-to-l from-orange-400 to-orange-600"> AutoPro</span>
                    </h1>
                    <p className="text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed mb-10">
                        نظام مزادات ذكي وشفاف يضع التحكم الكامل بين يديك. من لحظة اختيار السيارة حتى استلامها في ليبيا — كل خطوة واضحة ومحسوبة.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <button onClick={() => navigate('/auth?mode=register')} className="bg-gradient-to-l from-orange-500 to-orange-600 text-white px-8 py-4 rounded-2xl font-black text-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-xl shadow-orange-500/20 flex items-center gap-2">
                            ابدأ الآن مجاناً <ArrowRight className="w-5 h-5" />
                        </button>
                        <button onClick={() => navigate('/marketplace')} className="bg-white/5 border border-white/10 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-white/10 transition-all flex items-center gap-2">
                            <Eye className="w-5 h-5" /> تصفح السيارات
                        </button>
                    </div>
                </div>
            </section>

            {/* ━━ STATS BAR ━━ */}
            <section className="border-y border-white/5 bg-white/[0.02]">
                <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-white/5 rtl:divide-x-reverse">
                    {[
                        { icon: Users, value: '40,000+', label: 'سيارة أسبوعياً' },
                        { icon: Shield, value: '100%', label: 'شفافية مضمونة' },
                        { icon: TrendingUp, value: '30-50%', label: 'توفير مقارنة بالسوق' },
                        { icon: Star, value: '4.9/5', label: 'تقييم العملاء' },
                    ].map((stat, i) => (
                        <div key={i} className="text-center py-8 px-4">
                            <stat.icon className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                            <div className="text-2xl md:text-3xl font-black text-white">{stat.value}</div>
                            <div className="text-sm text-slate-500 font-medium">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ━━ AUCTION LIFECYCLE ━━ */}
            <section className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-black mb-4">
                            رحلة سيارتك في <span className="text-orange-400">5 مراحل</span>
                        </h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            دورة مزاد ذكية مصممة لتحقيق أفضل سعر لك. كل مرحلة محسوبة بدقة.
                        </p>
                    </div>

                    {/* Phase Cards */}
                    <div className="space-y-6">

                        {/* Phase 1: Upcoming */}
                        <div className="group relative bg-gradient-to-l from-blue-500/5 to-transparent border border-blue-500/20 rounded-3xl p-8 md:p-10 hover:border-blue-400/40 transition-all">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <Timer className="w-10 h-10 text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="bg-blue-500 text-white text-xs font-black px-3 py-1 rounded-full">المرحلة 1</span>
                                        <h3 className="text-2xl font-black text-white">قريباً — استعد للمنافسة</h3>
                                    </div>
                                    <p className="text-slate-400 leading-relaxed mb-6 text-lg">
                                        السيارة تظهر مع عداد تنازلي يوضح بالضبط متى سيبدأ المزاد الحي. لكن لا تنتظر! يمكنك
                                        <strong className="text-blue-300"> وضع مزايدتك مبكراً</strong> أو تفعيل
                                        <strong className="text-blue-300"> المزايدة الآلية (Proxy Bid)</strong> ليزايد النظام نيابة عنك تلقائياً حتى الحد الأقصى الذي تحدده.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="bg-white/5 rounded-xl p-4 flex items-start gap-3">
                                            <DollarSign className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="font-bold text-white text-sm">مزايدة مبكرة</div>
                                                <div className="text-slate-500 text-xs">ضع سعرك قبل بدء المزاد الحي</div>
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-4 flex items-start gap-3">
                                            <Zap className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="font-bold text-white text-sm">مزايدة آلية</div>
                                                <div className="text-slate-500 text-xs">النظام يزايد نيابة عنك تلقائياً</div>
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-4 flex items-start gap-3">
                                            <TrendingUp className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                                            <div>
                                                <div className="font-bold text-white text-sm">السعر يتراكم</div>
                                                <div className="text-slate-500 text-xs">المزاد الحي يبدأ بأعلى سعر</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Connector Arrow */}
                        <div className="flex justify-center"><ArrowRight className="w-8 h-8 text-slate-700 rotate-90" /></div>

                        {/* Phase 2: Live */}
                        <div className="group relative bg-gradient-to-l from-red-500/5 to-transparent border border-red-500/20 rounded-3xl p-8 md:p-10 hover:border-red-400/40 transition-all">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="w-20 h-20 bg-red-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform relative">
                                    <Gavel className="w-10 h-10 text-red-400" />
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full animate-ping" />
                                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="bg-red-500 text-white text-xs font-black px-3 py-1 rounded-full animate-pulse">المرحلة 2 — مباشر</span>
                                        <h3 className="text-2xl font-black text-white">المزاد الحي — لحظات الحسم</h3>
                                    </div>
                                    <p className="text-slate-400 leading-relaxed mb-4 text-lg">
                                        المزاد يبدأ بأعلى سعر وصلت إليه المزايدات المبكرة. تنافس في الوقت الحقيقي مع مزايدين من حول العالم.
                                        كل مزايدة تظهر فوراً على شاشتك.
                                        <strong className="text-red-300"> نظام مضاد للقنص (Anti-Snipe)</strong> يمدد الوقت 15 ثانية إذا دخلت مزايدة في اللحظات الأخيرة — لا أحد يسرق سيارتك!
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-center"><ArrowRight className="w-8 h-8 text-slate-700 rotate-90" /></div>

                        {/* Phase 3: Results - 3 outcomes */}
                        <div className="group relative bg-gradient-to-l from-emerald-500/5 to-transparent border border-emerald-500/20 rounded-3xl p-8 md:p-10 hover:border-emerald-400/40 transition-all">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="w-20 h-20 bg-emerald-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <Trophy className="w-10 h-10 text-emerald-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="bg-emerald-500 text-white text-xs font-black px-3 py-1 rounded-full">المرحلة 3</span>
                                        <h3 className="text-2xl font-black text-white">نتيجة المزاد — ثلاثة سيناريوهات</h3>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                        {/* Won */}
                                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                                <span className="font-black text-emerald-300 text-sm">فزت بالمزاد!</span>
                                            </div>
                                            <p className="text-slate-400 text-sm leading-relaxed">
                                                مزايدتك وصلت أو تجاوزت السعر المطلوب.
                                                <strong className="text-white"> تُنشأ فاتورتك فوراً</strong>، وتصلك رسالة تبريك + إشعار + رسالة واتساب.
                                            </p>
                                        </div>
                                        {/* Pending Seller */}
                                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Clock className="w-5 h-5 text-amber-400" />
                                                <span className="font-black text-amber-300 text-sm">قريب من السعر (90%+)</span>
                                            </div>
                                            <p className="text-slate-400 text-sm leading-relaxed">
                                                مزايدتك قريبة جداً من السعر المطلوب.
                                                <strong className="text-white"> البائع لديه ساعة واحدة</strong> ليوافق على البيع بهذا السعر. إذا وافق — فزت! إذا لم يرد — تنتقل لسوق العروض.
                                            </p>
                                        </div>
                                        {/* Offer Market */}
                                        <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-5">
                                            <div className="flex items-center gap-2 mb-3">
                                                <ShoppingBag className="w-5 h-5 text-purple-400" />
                                                <span className="font-black text-purple-300 text-sm">سوق العروض</span>
                                            </div>
                                            <p className="text-slate-400 text-sm leading-relaxed">
                                                السعر لم يصل للمطلوب.
                                                <strong className="text-white"> 24 ساعة من التفاوض المفتوح</strong>. قدم عرضك مباشرة للبائع — يمكنه القبول أو التفاوض أو الرفض.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-center"><ArrowRight className="w-8 h-8 text-slate-700 rotate-90" /></div>

                        {/* Phase 4: After Winning */}
                        <div className="group relative bg-gradient-to-l from-orange-500/5 to-transparent border border-orange-500/20 rounded-3xl p-8 md:p-10 hover:border-orange-400/40 transition-all">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="w-20 h-20 bg-orange-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <FileCheck className="w-10 h-10 text-orange-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-full">المرحلة 4</span>
                                        <h3 className="text-2xl font-black text-white">الدفع والتخليص</h3>
                                    </div>
                                    <p className="text-slate-400 leading-relaxed text-lg mb-4">
                                        بعد الفوز، يُنشئ النظام تلقائياً <strong className="text-orange-300">3 فواتير شفافة</strong>: فاتورة الشراء (مستحقة فوراً)، فاتورة النقل الداخلي (تُفعّل بعد الشراء)، وفاتورة الشحن الدولي. ادفع بأمان عبر المحفظة أو التحويل البنكي أو Sadad.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-center"><ArrowRight className="w-8 h-8 text-slate-700 rotate-90" /></div>

                        {/* Phase 5: Shipping */}
                        <div className="group relative bg-gradient-to-l from-cyan-500/5 to-transparent border border-cyan-500/20 rounded-3xl p-8 md:p-10 hover:border-cyan-400/40 transition-all">
                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="w-20 h-20 bg-cyan-500/10 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                                    <Ship className="w-10 h-10 text-cyan-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="bg-cyan-500 text-white text-xs font-black px-3 py-1 rounded-full">المرحلة 5</span>
                                        <h3 className="text-2xl font-black text-white">الشحن والاستلام</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                                        <div className="bg-white/5 rounded-xl p-4 text-center">
                                            <Truck className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                                            <div className="font-bold text-white text-sm">النقل الداخلي</div>
                                            <div className="text-slate-500 text-xs mt-1">من ساحة المزاد للميناء</div>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-4 text-center">
                                            <Ship className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                                            <div className="font-bold text-white text-sm">الشحن البحري</div>
                                            <div className="text-slate-500 text-xs mt-1">تتبع لحظي للسفينة</div>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-4 text-center">
                                            <MapPin className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                                            <div className="font-bold text-white text-sm">الاستلام في ليبيا</div>
                                            <div className="text-slate-500 text-xs mt-1">من الميناء أو توصيل لبابك</div>
                                        </div>
                                    </div>
                                    <div className="mt-5 flex justify-center">
                                        <a href="/nearest-shipping-center" className="inline-flex items-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-black rounded-xl px-5 py-2.5 text-sm transition-colors">
                                            <MapPin className="w-4 h-4" />
                                            <span>📍 ابحث عن أقرب مركز شحن إليك</span>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Cycle Repeat Note */}
                        <div className="flex justify-center">
                            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-6 py-3">
                                <RotateCcw className="w-5 h-5 text-orange-400" />
                                <span className="text-slate-400 text-sm font-medium">
                                    لم تُبع السيارة؟ تعود تلقائياً للجدولة وتدخل دورة مزاد جديدة — فرصة أخرى لك!
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ━━ WHY AUTOPRO ━━ */}
            <section className="py-20 px-6 bg-white/[0.02] border-y border-white/5">
                <div className="max-w-6xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-black text-center mb-14">
                        لماذا <span className="text-orange-400">AutoPro</span>؟
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                            { icon: Shield, title: 'شفافية 100%', desc: 'كل رسم واضح قبل المزايدة. لا مفاجآت. حاسبة تكلفة ذكية تحسب لك كل شيء مقدماً.', color: 'text-emerald-400 bg-emerald-500/10' },
                            { icon: Zap, title: 'مزاد حي حقيقي', desc: 'ليس مجرد موقع إعلانات. مزاد مباشر بالثانية مع نظام مضاد للقنص وحماية كاملة للمزايدين.', color: 'text-red-400 bg-red-500/10' },
                            { icon: Lock, title: 'أموالك محمية', desc: 'محفظة إلكترونية مؤمنة. لا يُخصم شيء حتى تفوز. نظام إيداع وسحب شفاف مع إيصالات فورية.', color: 'text-blue-400 bg-blue-500/10' },
                            { icon: Calculator, title: 'حاسبة التكلفة الذكية', desc: 'اعرف سعر السيارة الواصل لباب معرضك في ليبيا قبل ما تزايد — بما فيه الشحن والجمارك والنقل.', color: 'text-orange-400 bg-orange-500/10' },
                            { icon: TrendingUp, title: 'وفّر 30-50% من سعر السوق', desc: 'أسعار المزادات الأمريكية أقل بكثير من أسعار السوق المحلي. استورد سيارتك بنصف الثمن.', color: 'text-purple-400 bg-purple-500/10' },
                            { icon: Users, title: 'دعم عربي متكامل', desc: 'فريق دعم يتحدث العربية. واجهة عربية كاملة. إشعارات واتساب. مصمم خصيصاً للسوق الليبي.', color: 'text-cyan-400 bg-cyan-500/10' },
                        ].map((item, i) => (
                            <div key={i} className="bg-white/5 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all group">
                                <div className={`w-12 h-12 ${item.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                    <item.icon className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-black text-white mb-2">{item.title}</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ━━ FAQ ━━ */}
            <section className="py-20 px-6">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-3xl md:text-4xl font-black text-center mb-12">أسئلة شائعة</h2>
                    {[
                        { q: 'كم الحد الأدنى للعربون/الإيداع؟', a: 'الحد الأدنى خارج ليبيا $50 دولار فقط، وداخل ليبيا 200 دينار ليبي. القوة الشرائية = العربون × 10. مثال: إيداع 200 د.ل = قوة شرائية 2,000 د.ل.' },
                        { q: 'ماذا يحدث إذا لم أفز بالمزاد؟', a: 'لا يُخصم منك أي مبلغ. رصيدك يبقى كما هو في محفظتك ويمكنك المزايدة على سيارات أخرى فوراً.' },
                        { q: 'كم يستغرق الشحن إلى ليبيا؟', a: 'عادة 21-35 يوماً بحرياً حسب الميناء. نوفر تتبع لحظي للشحنة من لحظة خروجها من أمريكا حتى وصولها للميناء.' },
                        { q: 'هل يمكنني المعاينة قبل المزايدة؟', a: 'نعم، كل سيارة مرفق معها صور تفصيلية، تقرير فحص (PDF)، فيديو، وصوت المحرك. بالإضافة لتقرير حالة الهيكل ونوع الضرر إن وجد.' },
                        { q: 'ما هو نظام المزايدة الآلية (Proxy Bid)؟', a: 'تحدد الحد الأقصى الذي ترغب بدفعه، والنظام يزايد تلقائياً نيابة عنك بأقل مبلغ ممكن. إذا زايد شخص آخر، النظام يرفع مزايدتك تلقائياً حتى تصل لحدك الأقصى.' },
                        { q: 'هل يمكن للبائع رفض المزايدة الفائزة؟', a: 'فقط إذا كانت أقل من السعر الاحتياطي بأكثر من 10%. إذا وصلت مزايدتك لـ 90% من السعر المطلوب، البائع لديه ساعة للموافقة أو ينتقل الأمر لسوق العروض.' },
                    ].map((item, i) => (
                        <div key={i} className="border-b border-white/5">
                            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between py-5 text-right group">
                                <span className="font-bold text-white group-hover:text-orange-400 transition-colors text-lg">{item.q}</span>
                                <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform shrink-0 mr-4 ${openFaq === i ? 'rotate-180 text-orange-400' : ''}`} />
                            </button>
                            {openFaq === i && (
                                <div className="pb-5 text-slate-400 leading-relaxed animate-in fade-in slide-in-from-top-2">{item.a}</div>
                            )}
                        </div>
                    ))}
                </div>
            </section>

            {/* ━━ BOTTOM CTA ━━ */}
            <section className="py-20 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/20 rounded-3xl p-12">
                        <Trophy className="w-16 h-16 text-orange-400 mx-auto mb-6" />
                        <h2 className="text-3xl md:text-4xl font-black mb-4">جاهز تبدأ؟</h2>
                        <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
                            سجل حسابك مجاناً وابدأ في تصفح آلاف السيارات. اختر سيارتك، حدد ميزانيتك، وانطلق في المزاد!
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <button onClick={() => navigate('/auth?mode=register')} className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-orange-500/20 flex items-center gap-2">
                                إنشاء حساب مجاني <ArrowRight className="w-5 h-5" />
                            </button>
                            <button onClick={() => navigate('/calculator')} className="bg-white/5 border border-white/10 text-white px-8 py-4 rounded-2xl font-bold hover:bg-white/10 transition-all flex items-center gap-2">
                                <Calculator className="w-5 h-5" /> حاسبة التكلفة
                            </button>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
};
