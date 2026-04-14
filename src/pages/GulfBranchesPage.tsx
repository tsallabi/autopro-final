import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Phone, Mail, ExternalLink, ArrowRight, Globe } from 'lucide-react';

const BRANCHES = [
  {
    country: 'الإمارات العربية المتحدة',
    countryEn: 'UAE',
    flag: '🇦🇪',
    city: 'دبي',
    address: 'منطقة المستودعات - الراس الأخضر',
    phone: '+971 50 123 4567',
    email: 'uae@autopro.ac',
    website: 'https://uae.autopro.ac',
    cars: 45,
    color: 'from-emerald-500/20 to-emerald-900/20 border-emerald-500/30',
  },
  {
    country: 'المملكة العربية السعودية',
    countryEn: 'Saudi Arabia',
    flag: '🇸🇦',
    city: 'الرياض',
    address: 'طريق الملك فهد - العليا',
    phone: '+966 50 123 4567',
    email: 'ksa@autopro.ac',
    website: 'https://ksa.autopro.ac',
    cars: 78,
    color: 'from-green-600/20 to-green-900/20 border-green-500/30',
  },
  {
    country: 'قطر',
    countryEn: 'Qatar',
    flag: '🇶🇦',
    city: 'الدوحة',
    address: 'المنطقة الصناعية',
    phone: '+974 50 123 4567',
    email: 'qatar@autopro.ac',
    website: 'https://qa.autopro.ac',
    cars: 22,
    color: 'from-purple-500/20 to-purple-900/20 border-purple-500/30',
  },
  {
    country: 'الكويت',
    countryEn: 'Kuwait',
    flag: '🇰🇼',
    city: 'مدينة الكويت',
    address: 'منطقة الشويخ الصناعية',
    phone: '+965 50 123 4567',
    email: 'kw@autopro.ac',
    website: 'https://kw.autopro.ac',
    cars: 31,
    color: 'from-teal-500/20 to-teal-900/20 border-teal-500/30',
  },
  {
    country: 'البحرين',
    countryEn: 'Bahrain',
    flag: '🇧🇭',
    city: 'المنامة',
    address: 'منطقة سترة الصناعية',
    phone: '+973 50 123 4567',
    email: 'bh@autopro.ac',
    website: 'https://bh.autopro.ac',
    cars: 14,
    color: 'from-red-500/20 to-red-900/20 border-red-500/30',
  },
  {
    country: 'سلطنة عُمان',
    countryEn: 'Oman',
    flag: '🇴🇲',
    city: 'مسقط',
    address: 'منطقة وادي الكبير',
    phone: '+968 50 123 4567',
    email: 'om@autopro.ac',
    website: 'https://om.autopro.ac',
    cars: 19,
    color: 'from-amber-500/20 to-amber-900/20 border-amber-500/30',
  },
];

export const GulfBranchesPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white" dir="rtl">
      {/* Hero */}
      <section className="relative pt-32 pb-16 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-5 py-2 mb-6">
            <Globe className="w-4 h-4 text-orange-400" />
            <span className="text-orange-300 text-sm font-bold">أوتو برو في كل الخليج</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            فروع <span className="text-transparent bg-clip-text bg-gradient-to-l from-orange-400 to-orange-600">أوتو برو</span> في الخليج
          </h1>
          <p className="text-xl text-slate-400 max-w-3xl mx-auto mb-10">
            تصفّح السيارات المتوفرة في كل فرع من فروعنا في دول الخليج العربي. استورد مباشرة من أقرب فرع لك.
          </p>
        </div>
      </section>

      {/* Branches Grid */}
      <section className="py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {BRANCHES.map((b, i) => (
              <div key={i} className={`bg-gradient-to-br ${b.color} border-2 rounded-3xl p-6 hover:scale-[1.02] transition-all group`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="text-5xl">{b.flag}</div>
                  <div className="bg-white/10 backdrop-blur px-3 py-1 rounded-full text-xs font-black text-white border border-white/20">
                    {b.cars} سيارة
                  </div>
                </div>

                <h3 className="text-2xl font-black text-white mb-1">{b.country}</h3>
                <p className="text-slate-400 text-sm mb-4">{b.countryEn}</p>

                <div className="space-y-2 text-sm text-slate-300 mb-6">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                    <span>{b.city} — {b.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-orange-400 shrink-0" />
                    <span dir="ltr">{b.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-orange-400 shrink-0" />
                    <span dir="ltr">{b.email}</span>
                  </div>
                </div>

                <a
                  href={b.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black py-3 rounded-xl transition-all group-hover:bg-orange-500 group-hover:border-orange-500"
                >
                  تصفّح سيارات {b.city}
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto text-center bg-gradient-to-b from-orange-500/10 to-transparent border border-orange-500/20 rounded-3xl p-12">
          <h2 className="text-3xl font-black mb-4">هل تريد فتح فرع في دولتك؟</h2>
          <p className="text-slate-400 text-lg mb-8">
            ننتشر سريعاً! انضم إلينا كوكيل حصري في دولتك واحصل على عمولات مجزية
          </p>
          <button
            onClick={() => navigate('/#agency-recruitment')}
            className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-4 rounded-2xl font-black text-lg transition-all shadow-xl shadow-orange-500/20 inline-flex items-center gap-2"
          >
            تقدّم بطلب الوكالة <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>
    </div>
  );
};
