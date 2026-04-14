import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Star, Shield, Zap, Check, ArrowRight, Sparkles,
  Car, BarChart3, HeadphonesIcon, Clock, Award, TrendingUp,
  MessageCircle, Users, ChevronDown
} from 'lucide-react';

interface Package {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  currency: string;
  maxCars: number;
  maxAuctionRetries: number;
  offerMarketDays: number;
  badge: string | null;
  features: string[];
  sortOrder: number;
}

const PACKAGE_STYLES: Record<string, {
  border: string;
  bg: string;
  glow: string;
  icon: React.ReactNode;
  iconBg: string;
  badge: string;
  cta: string;
  ctaText: string;
  popular?: boolean;
}> = {
  basic: {
    border: 'border-slate-700/50',
    bg: 'bg-slate-900/50',
    glow: '',
    icon: <Shield className="w-8 h-8 text-slate-400" />,
    iconBg: 'bg-slate-800',
    badge: 'bg-slate-700 text-slate-300',
    cta: 'bg-slate-700 hover:bg-slate-600 text-white',
    ctaText: 'ابدأ مجاناً',
  },
  silver: {
    border: 'border-slate-400/30',
    bg: 'bg-gradient-to-b from-slate-800/80 to-slate-900/80',
    glow: 'shadow-lg shadow-slate-400/5',
    icon: <Star className="w-8 h-8 text-slate-300" />,
    iconBg: 'bg-gradient-to-br from-slate-600 to-slate-700',
    badge: 'bg-gradient-to-r from-slate-500 to-slate-400 text-white',
    cta: 'bg-gradient-to-r from-slate-500 to-slate-400 hover:from-slate-400 hover:to-slate-300 text-slate-900 font-black',
    ctaText: 'اشترك الآن',
  },
  gold: {
    border: 'border-amber-500/40',
    bg: 'bg-gradient-to-b from-amber-950/40 to-slate-900/80',
    glow: 'shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/20',
    icon: <Crown className="w-8 h-8 text-amber-400" />,
    iconBg: 'bg-gradient-to-br from-amber-500 to-amber-600',
    badge: 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-900',
    cta: 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-900 font-black',
    ctaText: 'اشترك الآن',
    popular: true,
  },
  premium: {
    border: 'border-orange-500/30',
    bg: 'bg-gradient-to-b from-orange-950/30 via-slate-900/90 to-slate-950/90',
    glow: 'shadow-xl shadow-orange-500/10 ring-1 ring-orange-500/20',
    icon: <Zap className="w-8 h-8 text-orange-400" />,
    iconBg: 'bg-gradient-to-br from-orange-500 to-red-600',
    badge: 'bg-gradient-to-r from-orange-500 to-red-500 text-white',
    cta: 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400 text-white font-black',
    ctaText: 'تواصل مع الإدارة',
  },
};

const formatPrice = (price: number, currency: string): string => {
  if (price === 0) return 'مجاني';
  if (price < 0) return 'تواصل معنا';
  return `${price} د.ل/شهر`;
};

export const DealerPackagesPage = () => {
  const navigate = useNavigate();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/packages')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setPackages(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const faqs = [
    {
      q: 'كيف أختار الباقة المناسبة لي؟',
      a: 'إذا كنت تاجراً مبتدئاً، ابدأ بالباقة الأساسية المجانية. عندما تحتاج لعرض أكثر من 5 سيارات أو تريد مزايا إضافية، يمكنك الترقية في أي وقت.',
    },
    {
      q: 'هل يمكنني تغيير باقتي لاحقاً؟',
      a: 'نعم! يمكنك الترقية أو التخفيض في أي وقت. سيتم احتساب الفرق تلقائياً.',
    },
    {
      q: 'ما هي طرق الدفع المتاحة؟',
      a: 'نقبل التحويل البنكي والدفع النقدي عبر فروعنا. يمكنك أيضاً الدفع عبر المحفظة الإلكترونية في المنصة.',
    },
    {
      q: 'ماذا يحدث عند انتهاء الاشتراك؟',
      a: 'تتحول تلقائياً للباقة الأساسية المجانية. سياراتك تبقى معروضة لكن بحدود الباقة الأساسية.',
    },
    {
      q: 'هل الباقة المتميزون تشمل مدير حساب مخصص؟',
      a: 'نعم، عند الاشتراك في باقة المتميزون تحصل على مدير حساب شخصي يتابع معك كل التفاصيل ويضمن لك أفضل تجربة.',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white" dir="rtl">

      {/* HERO */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
        <div className="absolute top-20 left-1/4 w-72 h-72 bg-amber-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/5 rounded-full blur-[120px]" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-5 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-orange-400" />
            <span className="text-orange-300 text-sm font-bold">باقات حصرية للتجار والوكلاء</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black mb-6 leading-tight">
            اختر الباقة التي تناسب
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-amber-400 to-orange-600"> حجم أعمالك</span>
          </h1>
          <p className="text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
            من التاجر المبتدئ إلى الوكيل المحترف — لدينا باقة مصممة خصيصاً لاحتياجاتك. ابدأ مجاناً وارتقِ عندما تكون جاهزاً.
          </p>
        </div>
      </section>

      {/* STATS */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-white/5 rtl:divide-x-reverse">
          {[
            { icon: Users, value: '500+', label: 'تاجر مسجل' },
            { icon: Car, value: '10,000+', label: 'سيارة معروضة' },
            { icon: TrendingUp, value: '95%', label: 'نسبة رضا العملاء' },
            { icon: Award, value: '24/7', label: 'دعم فني متواصل' },
          ].map((stat, i) => (
            <div key={i} className="text-center py-8 px-4">
              <stat.icon className="w-6 h-6 text-orange-400 mx-auto mb-2" />
              <div className="text-2xl md:text-3xl font-black text-white">{stat.value}</div>
              <div className="text-sm text-slate-500 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PACKAGES GRID */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-4 animate-pulse">...</div>
              <p className="text-slate-500">جاري تحميل الباقات...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
              {packages.map((pkg) => {
                const style = PACKAGE_STYLES[pkg.id] || PACKAGE_STYLES.basic;
                return (
                  <div
                    key={pkg.id}
                    className={`relative rounded-3xl p-8 ${style.bg} border ${style.border} ${style.glow} transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 flex flex-col`}
                  >
                    {/* Popular tag */}
                    {style.popular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-400 text-slate-900 text-xs font-black px-6 py-1.5 rounded-full shadow-lg shadow-amber-500/30">
                        الأكثر شعبية
                      </div>
                    )}

                    {/* Icon */}
                    <div className={`w-16 h-16 ${style.iconBg} rounded-2xl flex items-center justify-center mb-6`}>
                      {style.icon}
                    </div>

                    {/* Name & Badge */}
                    <h3 className="text-2xl font-black text-white mb-2">{pkg.nameAr}</h3>
                    {pkg.badge && (
                      <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full w-fit mb-4 ${style.badge}`}>
                        <Award className="w-3 h-3" />
                        {pkg.badge}
                      </span>
                    )}
                    {!pkg.badge && <div className="mb-4" />}

                    {/* Price */}
                    <div className="mb-6">
                      {pkg.price === 0 ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-black text-green-400">مجاني</span>
                        </div>
                      ) : pkg.price < 0 ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-black text-orange-400">تواصل معنا</span>
                        </div>
                      ) : (
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl font-black text-white">{pkg.price}</span>
                          <span className="text-slate-400 text-sm">د.ل / شهر</span>
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8 flex-1">
                      {pkg.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <Check className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                          <span className="text-slate-300">{f}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => {
                        if (pkg.id === 'premium') {
                          window.open('https://wa.me/218911234567?text=أرغب في الاشتراك في باقة المتميزون', '_blank');
                        } else {
                          navigate('/auth?mode=register');
                        }
                      }}
                      className={`w-full py-4 rounded-2xl text-lg font-bold transition-all ${style.cta} flex items-center justify-center gap-2`}
                    >
                      {style.ctaText}
                      <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-12">
            مقارنة <span className="text-orange-400">تفصيلية</span>
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/5">
                  <th className="text-right p-4 text-slate-400 font-bold">الميزة</th>
                  {packages.map(pkg => (
                    <th key={pkg.id} className="p-4 text-center font-black text-white">{pkg.nameAr}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-slate-400 flex items-center gap-2"><Car className="w-4 h-4" /> عدد السيارات</td>
                  {packages.map(pkg => (
                    <td key={pkg.id} className="p-4 text-center font-bold text-white">
                      {pkg.maxCars >= 999 ? 'غير محدود' : pkg.maxCars}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-slate-400 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> محاولات المزايدة</td>
                  {packages.map(pkg => (
                    <td key={pkg.id} className="p-4 text-center font-bold text-white">
                      {pkg.maxAuctionRetries < 0 ? 'غير محدود' : pkg.maxAuctionRetries}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-slate-400 flex items-center gap-2"><Clock className="w-4 h-4" /> مدة العرض في السوق</td>
                  {packages.map(pkg => (
                    <td key={pkg.id} className="p-4 text-center font-bold text-white">
                      {pkg.offerMarketDays >= 365 ? 'غير محدود' : `${pkg.offerMarketDays} يوم`}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-slate-400 flex items-center gap-2"><HeadphonesIcon className="w-4 h-4" /> الدعم الفني</td>
                  {packages.map(pkg => (
                    <td key={pkg.id} className="p-4 text-center font-bold text-white">
                      {pkg.id === 'basic' ? 'بريد إلكتروني' : pkg.id === 'silver' ? 'أولوية' : pkg.id === 'gold' ? 'مباشر 24/7' : 'مدير حساب مخصص'}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-slate-400 flex items-center gap-2"><Award className="w-4 h-4" /> شارة مميزة</td>
                  {packages.map(pkg => (
                    <td key={pkg.id} className="p-4 text-center">
                      {pkg.badge ? (
                        <span className="bg-orange-500/10 text-orange-400 text-xs font-bold px-2 py-1 rounded-full">{pkg.badge}</span>
                      ) : (
                        <span className="text-slate-600">-</span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4 text-slate-400 flex items-center gap-2"><MessageCircle className="w-4 h-4" /> السعر</td>
                  {packages.map(pkg => (
                    <td key={pkg.id} className="p-4 text-center font-black">
                      <span className={pkg.price === 0 ? 'text-green-400' : pkg.price < 0 ? 'text-orange-400' : 'text-white'}>
                        {formatPrice(pkg.price, pkg.currency)}
                      </span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-black text-center mb-4">
            أسئلة <span className="text-orange-400">شائعة</span>
          </h2>
          <p className="text-center text-slate-400 mb-12">كل ما تحتاج معرفته عن باقات التجار</p>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className={`border ${openFaq === i ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/10 bg-white/[0.02]'} rounded-2xl overflow-hidden transition-all`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-right"
                >
                  <span className="font-bold text-white text-lg">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform shrink-0 mr-4 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-6 text-slate-400 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section className="pb-32 px-6">
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 rounded-3xl p-12 md:p-16 text-center">
          <Crown className="w-12 h-12 text-orange-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-black mb-4">
            جاهز لتوسيع نشاطك التجاري؟
          </h2>
          <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
            انضم لأكثر من 500 تاجر يثقون في AutoPro لإدارة أعمالهم بنجاح
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/auth?mode=register')}
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-10 py-4 rounded-2xl font-black text-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
            >
              سجل الآن مجاناً
              <ArrowRight className="w-5 h-5 rtl:rotate-180" />
            </button>
            <button
              onClick={() => window.open('https://wa.me/218911234567', '_blank')}
              className="bg-white/5 border border-white/10 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2"
            >
              <MessageCircle className="w-5 h-5" />
              تحدث مع فريقنا
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
