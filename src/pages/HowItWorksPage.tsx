import React from 'react';
import { Gavel, Truck, Ship, MapPin, Calculator, FileCheck, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

export const HowItWorksPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const steps = [
        {
            icon: Calculator,
            title: "حساب التكلفة",
            desc: "استخدم حاسبة التكلفة الذكية لدينا لمعرفة السعر الواصل ليدك في ليبيا بضغطة زر. النظام يحتسب سعر السيارة المتوقع بالإضافة إلى كافة رسوم المزاد والنقل الداخلي والشحن البحري."
        },
        {
            icon: Gavel,
            title: "المزايدة الحية",
            desc: "ادخل إلى قاعات المزادات في أمريكا وكندا وكوريا مباشرة من شاشتك. قم بتقديم عروضك وتنافس لحظة بلحظة مع العالم بدون تأخير."
        },
        {
            icon: FileCheck,
            title: "تأكيد الدفع والتخليص",
            desc: "بعد الفوز بالمزاد، ستحصل فوراً على الفاتورة مفصلة. قم بتسديدها، وسيتولى فريقنا تخليص أوراق السيارة وملكيتها."
        },
        {
            icon: Truck,
            title: "النقل الداخلي (Inland)",
            desc: "نقوم بإرسال شاحناتنا لنقل سيارتك من ساحة المزاد إلى الميناء المخصص للشحن في أسرع وقت ممكن لضمان عدم احتساب رسوم أرضية."
        },
        {
            icon: Ship,
            title: "الشحن البحري الدولي",
            desc: "تُشحن السيارة في حاويات آمنة أو عبر خدمة الـ RORO، مع توفير تتبع لحظي للسفينة عبر منصة AutoPro حتى تصل للميناء المقصود."
        },
        {
            icon: MapPin,
            title: "الاستلام في ليبيا",
            desc: "بمجرد وصول السيارة، ستحصل على إشعار من النظام. يمكنك استلام سيارتك من الميناء أو تكليفنا بإيصالها إلى باب معرضك."
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50 pt-24 pb-16">
            <div className="max-w-4xl mx-auto px-6">

                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 leading-tight">
                        كيف يعمل <span className="text-orange-500">النظام</span>
                    </h1>
                    <p className="text-xl text-slate-600 font-medium">
                        6 خطوات بسيطة تفصلك عن سيارتك القادمة. نظام متكامل وشفاف يضع التحكم بين يديك.
                    </p>
                </div>

                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-1 before:bg-gradient-to-b before:from-orange-500 before:to-orange-200">

                    {steps.map((step, idx) => (
                        <div key={idx} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active`}>

                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-50 bg-orange-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 transition-transform group-hover:scale-110">
                                <span className="text-white font-bold text-sm">{idx + 1}</span>
                            </div>

                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-8 rounded-3xl shadow-sm border border-slate-200 group-hover:border-orange-500/50 group-hover:shadow-md transition-all">
                                <div className="flex items-center gap-4 mb-4">
                                    <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
                                        <step.icon className="w-6 h-6 text-orange-500" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-900">{step.title}</h3>
                                </div>
                                <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                                    {step.desc}
                                </p>
                            </div>

                        </div>
                    ))}

                </div>

                {/* Bottom CTA */}
                <div className="mt-20 text-center bg-white p-10 rounded-3xl border border-slate-200 shadow-sm">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-6" />
                    <h2 className="text-2xl font-black text-slate-900 mb-4">أنت الآن جاهز للبدء!</h2>
                    <p className="text-slate-600 mb-8 max-w-xl mx-auto">سجل حسابك مجاناً الآن وابدأ في تصفح آلاف السيارات المتاحة في المزادات المباشرة، وحقق أرباحك بشفافية تامة.</p>
                    <button
                        onClick={() => navigate('/auth?mode=register')}
                        className="bg-orange-500 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/30 text-lg"
                    >
                        إنشاء حساب مجاني
                    </button>
                </div>

            </div>
        </div>
    );
};
