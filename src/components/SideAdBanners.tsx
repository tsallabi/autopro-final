import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, Award, Zap, Shield, Truck, Calculator, Gift } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * SideAdBanners — sticky side advertisement banners for marketplace
 * Loaded from localStorage (admin-editable) with 4 default rotating banners.
 *
 * Position is controlled by parent — pass side="left" or side="right".
 */

interface AdBanner {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  icon: string; // icon name
  gradient: string;
  badge?: string;
}

const ICONS: Record<string, React.ComponentType<any>> = {
  sparkles: Sparkles, trending: TrendingUp, award: Award, zap: Zap,
  shield: Shield, truck: Truck, calculator: Calculator, gift: Gift,
};

const DEFAULT_LEFT: AdBanner[] = [
  {
    id: 'l1', title: 'باقات التجار VIP', subtitle: 'انضم لشبكة التجار المعتمدين واحصل على عمولات مخفّضة وأولوية في المزادات.',
    cta: 'اعرف المزيد ←', href: '/dealer-packages', icon: 'award',
    gradient: 'from-amber-500 via-orange-500 to-red-500', badge: '🏆 جديد'
  },
  {
    id: 'l2', title: 'احسب تكلفتك الكاملة', subtitle: 'حاسبة ذكية تشمل الشحن، الجمارك، والتأمين بدقة عالية.',
    cta: 'احسب الآن ←', href: '/calculator', icon: 'calculator',
    gradient: 'from-blue-500 via-indigo-500 to-purple-600'
  },
];

const DEFAULT_RIGHT: AdBanner[] = [
  {
    id: 'r1', title: 'شحن دولي مضمون', subtitle: 'من ميناء أمريكي مباشرةً إلى طرابلس وبنغازي بأمان وسرعة.',
    cta: 'تتبع شحنتك ←', href: '/shipping', icon: 'truck',
    gradient: 'from-cyan-500 via-teal-500 to-emerald-500', badge: '🚢 سريع'
  },
  {
    id: 'r2', title: 'ضمان المزايدة الآمنة', subtitle: 'وديعتك محمية بنظام Escrow حتى تتسلم سيارتك.',
    cta: 'تعرف على الضمان ←', href: '/refund', icon: 'shield',
    gradient: 'from-emerald-500 via-green-500 to-lime-500'
  },
];

const STORAGE_KEY = 'autopro_side_ads_v1';

const loadAds = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.left && saved.right) return saved;
  } catch {}
  return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
};

interface Props {
  side: 'left' | 'right';
  className?: string;
}

export const SideAdBanners: React.FC<Props> = ({ side, className = '' }) => {
  const [ads, setAds] = useState(loadAds);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const onStorage = () => setAds(loadAds());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const list = side === 'left' ? ads.left : ads.right;

  // Auto-rotate active banner every 7 sec for visual interest
  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => setActiveIdx(i => (i + 1) % list.length), 7000);
    return () => clearInterval(t);
  }, [list.length]);

  if (!list || list.length === 0) return null;

  return (
    <aside className={`hidden xl:flex flex-col gap-4 sticky top-24 self-start w-full ${className}`} dir="rtl">
      {list.map((ad: AdBanner, idx: number) => {
        const Icon = ICONS[ad.icon] || Sparkles;
        const isActive = idx === activeIdx;
        return (
          <Link
            key={ad.id}
            to={ad.href}
            className={`group relative block rounded-2xl overflow-hidden shadow-lg transition-all duration-500 ${
              isActive ? 'scale-100 shadow-2xl' : 'scale-[0.98] opacity-90'
            } hover:scale-105 hover:shadow-2xl`}
          >
            <div className={`bg-gradient-to-br ${ad.gradient} p-5 text-white min-h-[260px] flex flex-col justify-between`}>
              {/* Decorative pulsing circle */}
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-700" />
              <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-white/10 rounded-full blur-xl" />

              {/* Badge */}
              {ad.badge && (
                <div className="relative inline-flex items-center self-start px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-black border border-white/30 mb-2">
                  {ad.badge}
                </div>
              )}

              {/* Icon */}
              <div className="relative w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 group-hover:rotate-12 transition-transform">
                <Icon className="w-7 h-7 text-white drop-shadow" />
              </div>

              <div className="relative">
                <h4 className="text-xl font-black mb-2 leading-tight drop-shadow">{ad.title}</h4>
                <p className="text-sm text-white/90 leading-relaxed mb-4">{ad.subtitle}</p>
                <span className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-white text-slate-900 text-sm font-black group-hover:bg-slate-900 group-hover:text-white transition-all">
                  {ad.cta}
                </span>
              </div>

              {/* Sparkle accents */}
              <Sparkles className="absolute top-3 left-3 w-4 h-4 text-white/40 animate-pulse" />
            </div>
          </Link>
        );
      })}

      {/* Sponsored label */}
      <div className="text-[10px] text-slate-400 text-center font-bold uppercase tracking-widest">
        ⚡ مساحة إعلانية
      </div>
    </aside>
  );
};

export default SideAdBanners;
