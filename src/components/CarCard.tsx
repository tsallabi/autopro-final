import React from 'react';
import { Car } from '../types';
import { ArrowUp, CheckCircle2, Clock, MapPin, AlertTriangle, ShieldCheck, Heart } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useTranslation } from 'react-i18next';
import { calculateTotalCost, MOCK_LOCATIONS } from '../services/calculatorService';
import { VehicleType } from '../types/calculator';

interface CarCardProps {
  car: Car;
  onClick: (car: Car) => void;
  onJoinLive?: (car: Car) => void;
}

export const CarCard: React.FC<CarCardProps> = ({ car, onClick, onJoinLive }) => {
  const { t } = useTranslation();
  const { watchlist, toggleWatchlist, exchangeRate, users, marketEstimates } = useStore();
  const isLive = car.status === 'live';
  const isFavorite = watchlist.some((w) => w.carId === car.id);

  const seller = users.find(u => u.id === car.sellerId);
  const showroomName = car.showroomName || seller?.companyName || (seller?.firstName ? `${seller.firstName} ${seller.lastName}` : 'AutoPro Auctions');
  const isVerified = seller?.kycStatus === 'approved' || seller?.status === 'active' || seller?.role === 'admin' || !car.sellerId;

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWatchlist(car.id);
  };

  // Find local market estimate (matched make, model, year ±1)
  const estimate = marketEstimates?.find(est => {
    const cleanString = (s: string) => String(s || '').toLowerCase().trim().replace(/[-\s]/g, '');
    const cMake = cleanString(car.make);
    const cModel = cleanString(car.model);
    const eMake = cleanString(est.make);
    const eMakeEn = cleanString(est.makeEn);
    const eModel = cleanString(est.model);
    const eModelEn = cleanString(est.modelEn);
    
    const makeMatch = cMake.includes(eMake) || cMake.includes(eMakeEn) || eMakeEn.includes(cMake);
    const modelMatch = cModel.includes(eModel) || cModel.includes(eModelEn) || eModelEn.includes(cModel);
    
    if (!makeMatch) return false;
    if (!modelMatch) return false;
    return Math.abs((car.year || 0) - (est.year || 0)) <= 2;
  });

  const parseEstPrice = (p: any) => {
    const parts = String(p).split('-');
    if (parts.length > 1) {
        return Math.floor((Number(parts[0].replace(/[^0-9]/g, '')) + Number(parts[1].replace(/[^0-9]/g, ''))) / 2);
    }
    return Number(String(p).replace(/[^0-9]/g, ''));
  };
  const estPriceValue = estimate ? parseEstPrice(estimate.price) : 0;

  return (
    <div
      onClick={() => onClick(car)}
      className={`rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] transition-all duration-500 cursor-pointer group flex flex-col hover:-translate-y-2 ${car.isRecommended ? 'bg-gradient-to-b from-amber-50 to-white border-2 border-amber-400 ring-2 ring-amber-300/30 shadow-amber-200/50' : 'bg-white border border-slate-100'}`}
    >
      {/* Featured Badge */}
      {car.isRecommended && (
        <div className="absolute top-4 right-4 z-30 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 text-slate-900 px-3 py-1.5 rounded-full text-[11px] font-black flex items-center gap-1.5 shadow-lg shadow-amber-400/50 border border-amber-300 animate-pulse">
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          سيارة مميزة
        </div>
      )}
      {/* Image Container */}
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        <img
          src={car.images[0]}
          alt={`${car.year} ${car.make} ${car.model}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* === HOVER OVERLAY BUTTONS (ACV Style) === */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end items-center pb-4 px-4 gap-2 z-10">
          {car.status === 'live' ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onJoinLive?.(car); }}
                className="w-full bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-600 hover:to-rose-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-500/30 text-sm"
              >
                {t('home.carCard.bidAmount', { amount: (car.currentBid ? car.currentBid + 100 : 0).toLocaleString('en-US') })}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onClick(car); }}
                className="w-full bg-[#D14900] hover:bg-[#b03d00] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-500/20 text-sm"
              >
                {t('home.carCard.setProxy')}
              </button>
            </>
          ) : (car.status === 'offer_market' || car.status === 'closed') ? (
            <button
              onClick={(e) => { e.stopPropagation(); onClick(car); }}
              className="w-full bg-[#D14900] hover:bg-[#b03d00] text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-500/20 text-sm"
            >
              {t('home.carCard.makeOffer')}
            </button>
          ) : null}
        </div>

        {/* Status Badge */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
          {car.status === 'live' && (
            <div className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg animate-pulse">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              {t('home.carCard.statusLive')}
            </div>
          )}
          {car.status === 'offer_market' && (
            <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg">
              <div className="w-2 h-2 bg-white rounded-full"></div>
              {t('home.carCard.statusOffer')}
            </div>
          )}
          {car.status === 'upcoming' && (
            <div className="glass-dark text-white px-4 py-1.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase flex items-center gap-2 shadow-lg">
              <Clock className="w-3 h-3 text-accent-500" />
              {t('home.carCard.statusUpcoming')}
            </div>
          )}

          <button
            title={isFavorite ? t('home.carCard.removeFromFav') : t('home.carCard.addToFav')}
            aria-label={isFavorite ? t('home.carCard.removeFromFav') : t('home.carCard.addToFav')}
            onClick={handleToggleFavorite}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg backdrop-blur-md ${isFavorite
              ? 'bg-red-500 text-white shadow-red-500/40'
              : 'bg-white/90 text-slate-400 hover:text-red-500 shadow-slate-900/10'
              }`}
          >
            <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Lot Number */}
        <div className="absolute bottom-3 left-3 glass-dark text-white/90 px-3 py-1 rounded-lg text-[10px] font-mono tracking-tighter border border-white/5 z-20">
          #{car.lotNumber}
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-grow">
        <h3 className="text-lg font-bold text-slate-900 mb-1 line-clamp-1">
          {car.year} {car.make} {car.model}
        </h3>

        <div className="flex items-center gap-2 text-slate-400 text-[13px] mb-4">
          <MapPin className="w-3.5 h-3.5 text-accent-500" />
          <span className="font-medium">{car.location}</span>
          <span className="mx-2 text-slate-300">•</span>
          <span className="font-bold flex items-center gap-1.5 text-slate-600">
            {showroomName}
            {isVerified ? (
              <span title="معرض موثق" className="flex items-center"><ShieldCheck className="w-3.5 h-3.5 text-blue-500" /></span>
            ) : (
              <span title="معرض غير موثق" className="flex items-center"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /></span>
            )}
          </span>
        </div>

        {/* Market Estimate Widget */}
        <div className="bg-indigo-50/80 border border-indigo-100 rounded-xl p-3 mb-4 flex flex-col gap-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-full blur-xl -mr-8 -mt-8"></div>
          <div className="flex items-center justify-between relative z-10">
             <div className="flex items-center gap-1.5">
               <ArrowUp className="w-4 h-4 text-indigo-500" />
               <span className="text-[10px] font-bold text-indigo-600 tracking-wider">السعر في ليبيا</span>
             </div>
             <div className="font-mono font-black text-slate-800 text-sm">
               {estimate ? `${estPriceValue.toLocaleString('en-US')} د.ل` : <span className="text-[11px] text-slate-400 font-sans tracking-normal font-bold">غير متوفر</span>}
             </div>
          </div>
          
          <div className="flex items-center justify-between bg-emerald-50 rounded-lg p-2 border border-emerald-100/50 relative z-10">
             <div className="flex items-center gap-1.5">
               <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
               <span className="text-[10px] font-bold text-emerald-600">توفير الزبون</span>
             </div>
             <div className="font-mono font-black text-emerald-600 text-[13px]" dir="ltr">
                {(() => {
                      if (!estimate) return <span className="text-[10px] text-emerald-600/50 font-sans tracking-normal font-bold">بيانات غير كافية</span>;
                      
                      const loc = MOCK_LOCATIONS.find(l => (car.location || '').includes(l.state)) || MOCK_LOCATIONS[0];
                      const landingResult = calculateTotalCost(car.currentBid || car.startingBid || 0, VehicleType.SEDAN, loc, 'LIBYA', 'KHOMS', 10);
                      const totalCostLYD = Math.floor(landingResult.total * (exchangeRate || 7));
                      const profit = estPriceValue - totalCostLYD;
                      return profit > 0 ? `+${profit.toLocaleString('en-US')} د.ل` : `${profit.toLocaleString('en-US')} د.ل`;
                })()}
             </div>
          </div>
        </div>

        {/* Specs Grid */}
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm mb-6 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-1 font-bold">الوقود</span>
            <span className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
              {car.fuelType || 'بنزين'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-1 font-bold">ناقل الحركة</span>
            <span className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
              {car.transmission || 'اوتوماتيك'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-1 font-bold">الممشى</span>
            <span className="font-bold text-slate-700 font-mono text-sm">{car.odometer?.toLocaleString('en-US') || '0'} <small className="text-[10px]">MI</small></span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase tracking-wider mb-1 font-bold">حالة الضرر</span>
            <span className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
              <div className={`w-1.5 h-1.5 rounded-full ${car.primaryDamage && car.primaryDamage !== 'لا يوجد' ? 'bg-red-500' : 'bg-green-500'}`}></div>
              {car.primaryDamage ? `حالي: ${car.primaryDamage}` : 'سليم'}
            </span>
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-end">
          <div>
            <span className="text-slate-400 block text-xs mb-1">
              {car.status === 'offer_market' ? t('home.carCard.lastBidDesc') : t('home.carCard.currentBidDesc')}
            </span>
            <div className={`text-2xl font-bold font-mono ${car.status === 'offer_market' ? 'text-blue-600' : 'text-slate-900'}`}>
              ${(car.currentBid || car.startingBid || 0).toLocaleString('en-US')}
            </div>
            <div className="text-sm font-bold text-slate-400 font-mono mt-0.5">
              {Math.round((car.currentBid || car.startingBid || 0) * (exchangeRate || 7)).toLocaleString('en-US')} د.ل
            </div>
          </div>
          <button aria-label={car.status === 'live' ? t('home.carCard.bidNow') : car.status === 'offer_market' ? t('home.carCard.makeOffer') : t('home.carCard.viewDetails')} title={car.status === 'live' ? t('home.carCard.bidNow') : car.status === 'offer_market' ? t('home.carCard.makeOffer') : t('home.carCard.viewDetails')} className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${car.status === 'live'
            ? 'bg-red-50 text-red-600 hover:bg-red-100'
            : car.status === 'offer_market'
              ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}>
            {car.status === 'live' ? t('home.carCard.bidNow') :
              car.status === 'offer_market' ? t('home.carCard.makeOffer') : t('home.carCard.viewDetails')}
          </button>
        </div>
      </div>
    </div>
  );
};
