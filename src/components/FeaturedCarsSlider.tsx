import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Sparkles, ShoppingCart, Gavel } from 'lucide-react';
import { useStore } from '../context/StoreContext';

/**
 * FeaturedCarsSlider — Full-width hero-style slider for recommended cars.
 * Placed ABOVE tabs in the marketplace. Shows cars with isRecommended=1.
 */
export const FeaturedCarsSlider: React.FC = () => {
  const navigate = useNavigate();
  const { cars, exchangeRate } = useStore();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const featured = cars.filter(
    (c) => (c as any).isRecommended && ['live', 'upcoming', 'offer_market'].includes(c.status)
  ).slice(0, 8);

  // Auto-slide every 5 seconds (pause on hover)
  useEffect(() => {
    if (featured.length <= 1 || isHovered) return;
    const t = setInterval(() => setCurrentIdx((i) => (i + 1) % featured.length), 5000);
    return () => clearInterval(t);
  }, [featured.length, isHovered]);

  const goTo = useCallback((idx: number) => {
    setCurrentIdx(((idx % featured.length) + featured.length) % featured.length);
  }, [featured.length]);

  if (featured.length === 0) return null;

  const car = featured[currentIdx];
  const imgs = Array.isArray(car.images) ? car.images : [];
  const bgImg = imgs[0] || 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=1200';
  const price = (car as any).isBuyNow && car.buyItNow ? car.buyItNow : (car.currentBid || car.startingBid || 0);
  const lyd = Math.round(price * (exchangeRate || 7));

  const isLive = car.status === 'live';
  const isOffer = car.status === 'offer_market';

  return (
    <div
      className="relative w-full rounded-3xl overflow-hidden shadow-2xl group mb-6"
      style={{ height: '400px' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      dir="rtl"
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
        style={{ backgroundImage: `url(${bgImg})` }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col justify-end p-6 md:p-10">
        {/* Badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-amber-400 to-yellow-500 text-slate-900 rounded-full text-xs font-black shadow-lg">
            <Sparkles className="w-3.5 h-3.5" /> سيارة مميزة
          </span>
          {isLive && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded-full text-xs font-black animate-pulse">
              <span className="w-2 h-2 bg-white rounded-full" /> مزاد مباشر
            </span>
          )}
          {isOffer && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded-full text-xs font-black">
              سوق العروض
            </span>
          )}
        </div>

        {/* Car info */}
        <h2 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg mb-1 leading-tight">
          {car.year} {car.make} {car.model}
        </h2>
        {car.trim && <p className="text-white/70 text-sm font-bold mb-3">{car.trim}</p>}

        {/* Price */}
        <div className="flex items-end gap-4 mb-5">
          <div className="text-3xl md:text-4xl font-black text-orange-400 font-mono drop-shadow-lg">
            ${price.toLocaleString()}
          </div>
          <div className="text-lg text-white/60 font-bold pb-1">
            {lyd.toLocaleString()} د.ل
          </div>
        </div>

        {/* CTA + dots row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(`/car-details/${car.id}`)}
            className="flex items-center gap-2 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-orange-500/30 hover:scale-105"
          >
            {(car as any).isBuyNow && car.buyItNow ? (
              <><ShoppingCart className="w-5 h-5" /> اشتري الآن</>
            ) : (
              <><Gavel className="w-5 h-5" /> شارك في المزاد</>
            )}
          </button>

          {/* Navigation dots */}
          {featured.length > 1 && (
            <div className="flex items-center gap-2">
              {featured.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  className={`rounded-full transition-all duration-300 ${
                    idx === currentIdx
                      ? 'w-8 h-3 bg-orange-500'
                      : 'w-3 h-3 bg-white/40 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Left/Right Arrows (shown on hover) */}
      {featured.length > 1 && (
        <>
          <button
            onClick={() => goTo(currentIdx + 1)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={() => goTo(currentIdx - 1)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Slide counter */}
      {featured.length > 1 && (
        <div className="absolute top-4 left-4 z-20 px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white/80 text-xs font-bold" dir="ltr">
          {currentIdx + 1} / {featured.length}
        </div>
      )}
    </div>
  );
};

export default FeaturedCarsSlider;
