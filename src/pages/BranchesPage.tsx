import React from 'react';
import { MapPin, Phone, Mail, Clock, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const BranchesPage = () => {
    const { t } = useTranslation();

    const branches = [
        {
            city: "طرابلس (المقر الرئيسي)",
            address: "حي الأندلس، بجوار جزيرة باب البحر",
            phone: "+218 91 123 4567",
            email: "tripoli@autopro.ly",
            hours: "السبت - الخميس: 9:00 ص - 6:00 م"
        },
        {
            city: "بنغازي",
            address: "شارع دبي، بالقرب من مفترق الماجوري",
            phone: "+218 92 123 4567",
            email: "benghazi@autopro.ly",
            hours: "السبت - الخميس: 9:00 ص - 5:00 م"
        },
        {
            city: "مصراتة",
            address: "شارع طرابلس، مقابل مجمع العيادات",
            phone: "+218 93 123 4567",
            email: "misrata@autopro.ly",
            hours: "السبت - الخميس: 9:00 ص - 5:00 م"
        },
        {
            city: "أمريكا (اللوجستيات)",
            address: "123 Port St, Savannah, GA 31401",
            phone: "+1 912 555 0198",
            email: "us.logistics@autopro.ly",
            hours: "Monday - Friday: 9:00 AM - 5:00 PM EST"
        }
    ];

    return (
        <div className="min-h-screen bg-slate-50 pt-24 pb-16">
            <div className="max-w-6xl mx-auto px-6">

                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 leading-tight">
                        فروعنا حول <span className="text-orange-500">العالم</span>
                    </h1>
                    <p className="text-xl text-slate-600 font-medium max-w-2xl mx-auto">
                        نحن متواجدون بالقرب منك لنضمن لك أفضل خدمة استيراد سيارات. فريق عملنا يسعد بزيارتك والإجابة على استفساراتك.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
                    {branches.map((branch, idx) => (
                        <div key={idx} className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200 hover:border-orange-500/30 hover:shadow-md transition-all group relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/5 rounded-bl-[100px] z-0 transition-transform group-hover:scale-110"></div>

                            <div className="relative z-10">
                                <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                                    <MapPin className="w-7 h-7 text-orange-500" />
                                    {branch.city}
                                </h2>

                                <div className="space-y-4">
                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                            <MapPin className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm text-slate-500 mb-1">العنوان</div>
                                            <div className="font-medium text-slate-900">{branch.address}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                            <Phone className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm text-slate-500 mb-1">رقم الهاتف</div>
                                            <a href={`tel:${branch.phone.replace(/\s/g, '')}`} className="font-bold text-slate-900 dir-ltr hover:text-orange-500 transition-colors">{branch.phone}</a>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                            <Mail className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm text-slate-500 mb-1">البريد الإلكتروني</div>
                                            <a href={`mailto:${branch.email}`} className="font-medium text-slate-900 hover:text-orange-500 transition-colors">{branch.email}</a>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                            <Clock className="w-5 h-5 text-slate-400" />
                                        </div>
                                        <div>
                                            <div className="text-sm text-slate-500 mb-1">ساعات العمل</div>
                                            <div className="font-medium text-slate-900">{branch.hours}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-16 bg-slate-900 rounded-3xl p-10 text-center text-white flex flex-col items-center">
                    <ShieldCheck className="w-16 h-16 text-orange-500 mb-6" />
                    <h2 className="text-2xl font-black mb-4">هل تحتاج لمساعدة فورية ؟</h2>
                    <p className="text-slate-400 mb-8 max-w-lg">فريق الدعم الفني متاح عبر الواتساب للرد على جميع استفساراتكم بخصوص المزايدة والشحن والجمارك.</p>
                    <a
                        href="https://wa.me/218911234567"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-orange-500 text-white px-8 py-3.5 rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
                    >
                        تواصل عبر واتساب الآن
                    </a>
                </div>

            </div>
        </div>
    );
};
