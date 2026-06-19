import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowLeft } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { SoldStampIfSold } from './SoldStamp';

export const FeaturedCarsBanner: React.FC = () => {
  const navigate = useNavigate();
  const { cars } = useStore();
  const [currentIdx, setCurrentIdx] = useState(0);

  const featured = cars.filter(c => (c as any).isRecommended && (c.status === 'live' || c.status === 'upcoming')).slice(0, 5);

  useEffect(() => {
    if (featured.length <= 1) return;
    const t = setInterval(() => setCurrentIdx(i => (i + 1) % featured.length), 5000);
    return () => clearInterval(t);
  }, [featured.length]);

  if (featured.length === 0) return null;

  const car = featured[currentIdx];
  const img = Array.isArray(car.images) && car.images[0] ? car.images[0] : 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=800';

  return (
    <div className="bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 rounded-3xl overflow-hidden border-2 border-amber-300 shadow-xl shadow-amber-200/50 relative">
      {/* Premium Badge */}
      <div className="absolute top-3 right-3 z-20 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-900 px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1 shadow-lg border border-amber-200">
        <Sparkles className="w-3 h-3" />
        مميزة
      </div>

      {/* Image */}
      <div
        onClick={() => navigate(`/car-details/${car.id}`)}
        className="relative aspect-video overflow-hidden cursor-pointer group"
      >
        <img src={img} alt={`${car.make} ${car.model}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
        {/* [sold-stamp] Banner sometimes recycles sold-status cars; show stamp. */}
        <SoldStampIfSold status={(car as any).status} size="sm" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 right-0 left-0 p-4 text-white">
          <h3 className="text-lg font-black mb-1">{car.year} {car.make} {car.model}</h3>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold text-amber-300">المزايدة الحالية</div>
              <div className="text-xl font-black text-amber-300">${(car.currentBid || 0).toLocaleString()}</div>
            </div>
            <button className="bg-amber-400 text-slate-900 hover:bg-amber-300 px-3 py-1.5 rounded-lg font-black text-xs flex items-center gap-1">
              زايد الآن <ArrowLeft className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Dots indicator */}
      {featured.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3 bg-amber-100/50">
          {featured.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === currentIdx ? 'bg-amber-500 w-6' : 'bg-amber-300'}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Upgrade CTA */}
      <div className="p-3 border-t border-amber-200 bg-white/60 text-center">
        <button
          onClick={() => navigate('/dealer-packages')}
          className="text-[10px] font-black text-amber-700 hover:text-amber-900 inline-flex items-center gap-1"
        >
          اجعل سيارتك مميزة — اشترك في الباقة الذهبية
        </button>
      </div>
    </div>
  );
};
