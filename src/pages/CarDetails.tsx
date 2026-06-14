import React from 'react';
import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, Calendar, Gauge, MapPin, Shield, Info, FileText,
  Hash, Calculator as CalcIcon, Gavel, Clock, Tag, AlertTriangle, TrendingUp, X, CheckCircle2, ArrowUp, Share2
} from 'lucide-react';
import { calculateTotalCost, MOCK_LOCATIONS } from '../services/calculatorService';
import { VehicleType } from '../types/calculator';
import { LiveAuction } from '../components/LiveAuction';
import { useStore, authFetch } from '../context/StoreContext';
import CarShareButtons from '../components/CarShareButtons';

// ============================================================
// Inline Proxy Bid Panel for Upcoming Market cars
// ============================================================
const PreBidPanel: React.FC<{ car: any; currentUser: any; socket: any; showAlert: any; exchangeRate: number }> = ({ car, currentUser, socket, showAlert, exchangeRate }) => {
  const { t } = useTranslation();
  const [proxyAmount, setProxyAmount] = React.useState(car.currentBid ? car.currentBid + 100 : (car.startingBid || car.reservePrice * 0.5 || 100));
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleProxyBid = () => {
    if (!currentUser) {
      showAlert(t('carDetails.preBid.loginRequired'), 'error');
      return;
    }
    if (proxyAmount > currentUser.buyingPower) {
      showAlert(t('carDetails.preBid.insufficientFunds'), 'error');
      return;
    }
    if (proxyAmount <= (car.currentBid || 0)) {
      showAlert(t('carDetails.preBid.maxTooLow'), 'error');
      return;
    }

    setIsSubmitting(true);
    if (socket) {
      socket.emit('set_proxy_bid', { carId: car.id, userId: currentUser.id, maxAmount: proxyAmount });

      const handleSet = (data: any) => {
        if (data.carId === car.id) {
          showAlert(t('carDetails.preBid.activated'), 'success');
          setIsSubmitting(false);
          socket.off('proxy_bid_set', handleSet);
          socket.off('bid_error', handleError);
        }
      };
      const handleError = (data: any) => {
        showAlert(data.message || t('carDetails.preBid.errorActivating'), 'error');
        setIsSubmitting(false);
        socket.off('proxy_bid_set', handleSet);
        socket.off('bid_error', handleError);
      };

      socket.on('proxy_bid_set', handleSet);
      socket.on('bid_error', handleError);

      setTimeout(() => setIsSubmitting(false), 3000);
    } else {
      showAlert(t('carDetails.preBid.notConnected'), 'error');
      setIsSubmitting(false);
    }
  };

  const handleBuyItNow = async () => {
    if (!currentUser) {
      showAlert(t('carDetails.preBid.loginToBuy'), 'error');
      return;
    }
    showAlert(t('carDetails.preBid.buyItNowSuccess'), 'success');
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-xs text-slate-400 font-bold mb-2 uppercase tracking-widest flex justify-between">
          <span>{t('carDetails.preBid.maxBidLabel')}</span>
          <span className="text-orange-400 font-normal">{t('carDetails.preBid.autoBidHint')}</span>
        </div>
        <div className="flex gap-3">
          <input
            aria-label={t('carDetails.preBid.bidAmount')} title={t('carDetails.preBid.bidAmount')} placeholder={t('carDetails.preBid.enterAmount')}
            type="number"
            value={proxyAmount}
            onChange={e => setProxyAmount(Number(e.target.value))}
            min={car.currentBid ? car.currentBid + 100 : 100}
            step={100}
            className="flex-1 bg-transparent text-white text-2xl font-black font-mono outline-none border-b border-white/20 pb-1"
          />
          <span className="text-slate-400 self-end pb-1 font-bold">USD</span>
        </div>
      </div>
      <button
        onClick={handleProxyBid}
        disabled={isSubmitting}
        className="w-full py-4 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-orange-600/20 active:scale-95 transition-all outline-none disabled:opacity-50"
      >
        <Gavel className="w-5 h-5" />
        {isSubmitting ? t('carDetails.preBid.submitting') : t('carDetails.preBid.activateBtn')}
      </button>

      {/* Buy It Now Render */}
      {(car.buyItNow || (car.reservePrice && car.reservePrice * 1.5)) > 0 && (
        <button
          onClick={handleBuyItNow}
          className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all outline-none mt-2"
        >
          <div className="flex flex-col items-center">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              {t('carDetails.preBid.buyNowBtn', { price: (car.buyItNow || car.reservePrice * 1.5).toLocaleString('en-US') })}
            </span>
            <span className="text-xs text-white/80 font-normal mt-1">≈ {Math.round((car.buyItNow || car.reservePrice * 1.5) * (exchangeRate || 7)).toLocaleString('en-US')} د.ل</span>
          </div>
        </button>
      )}
    </div>
  );
};

const CountdownLabel = ({ targetDate }: { targetDate: string | undefined }) => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = React.useState(t('carDetails.countdown.calculating'));

  React.useEffect(() => {
    if (!targetDate) {
      setTimeLeft(t('carDetails.countdown.soon'));
      return;
    }

    const updateCountdown = () => {
      const targetTime = new Date(targetDate).getTime();
      const diff = targetTime - Date.now();

      if (diff <= 0) {
        setTimeLeft(t('carDetails.countdown.startsNow'));
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      let formatted = '';
      if (d > 0) formatted += `${d} ${t('carDetails.countdown.daysSep')} `;
      formatted += `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

      setTimeLeft(formatted);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [targetDate, t]);

  return <span dir="ltr" className="inline-block font-mono tracking-widest">{timeLeft}</span>;
};

export const CarDetails = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { cars, currentUser, marketEstimates, showAlert, socket, exchangeRate } = useStore();

  // Try to get car from location.state first (fast), then from global store
  const carFromState = location.state?.car;
  const carFromStore = cars.find(c => c.id === id);
  const car = carFromState || carFromStore;

  const calculationResult = React.useMemo(() => {
    if (!car) return null;
    const locState = car.location || '';
    const loc = MOCK_LOCATIONS.find(l => locState.includes(l.state)) || MOCK_LOCATIONS[0];
    const calcBid = car.currentBid || car.reservePrice || car.startingBid || 1000;
    return calculateTotalCost(calcBid, VehicleType.SEDAN, loc, 'LIBYA', 'KHOMS', 10);
  }, [car]);

  const estimate = React.useMemo(() => {
    if (!car || !marketEstimates?.length) return null;
    return marketEstimates.find(est => {
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
  }, [car, marketEstimates]);

  const parseEstPrice = (p: any) => {
    const parts = String(p).split('-');
    if (parts.length > 1) {
      return Math.floor((Number(parts[0].replace(/[^0-9]/g, '')) + Number(parts[1].replace(/[^0-9]/g, ''))) / 2);
    }
    return Number(String(p).replace(/[^0-9]/g, ''));
  };
  const estPriceValue = estimate ? parseEstPrice(estimate.price) : 0;

  const allImages = React.useMemo(() => {
    if (!car) return [];
    if (Array.isArray(car.images)) return car.images.slice(0, 20);
    const imageUrls = car['Image URL'] || car.images || '';
    const images = String(imageUrls).split(/[,;\s\n]/).map((url: string) => url.trim()).filter(Boolean);
    if (images.length === 0 && car['Image Thumbnail']) images.push(car['Image Thumbnail']);
    return images.slice(0, 20);
  }, [car]);

  const [currentImageIndex, setCurrentImageIndex] = React.useState(0);
  const [isHoveringGallery, setIsHoveringGallery] = React.useState(false);
  const [showLightbox, setShowLightbox] = React.useState(false);
  const mainImage = allImages[currentImageIndex] || 'https://picsum.photos/seed/car/800/600';
  const [showPdfModal, setShowPdfModal] = React.useState<string | null>(null);

  const getYoutubeEmbedUrl = (url?: string) => {
    if (!url) return '';
    try {
      let videoId = '';
      if (url.includes('youtube.com/watch')) {
        videoId = new URL(url).searchParams.get('v') || '';
      } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split('?')[0];
      } else if (url.includes('youtube.com/shorts/')) {
        videoId = url.split('youtube.com/shorts/')[1].split('?')[0];
      }
      return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
    } catch (e) {
      return url;
    }
  };

  React.useEffect(() => {
    if (allImages.length > 0) setCurrentImageIndex(0);
  }, [allImages]);

  React.useEffect(() => {
    if (!isHoveringGallery && !showLightbox && allImages.length > 1) {
      const timer = setInterval(() => {
        setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
      }, 4000);
      return () => clearInterval(timer);
    }
  }, [allImages.length, isHoveringGallery, showLightbox]);

  if (!car) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-500 pt-24">
        <h2 className="text-2xl font-bold mb-4">{t('carDetails.notFound')}</h2>
        <button onClick={() => navigate(-1)} className="bg-orange-500 text-white px-6 py-2 rounded-xl font-bold">
          {t('carDetails.backToHome')}
        </button>
      </div>
    );
  }

  const isLive = car.status === 'live' || car.status === 'ultimo';
  const isOfferMarket = car.status === 'offer_market';

  const importCountry = (() => {
    const loc = (car.location || car['Location state'] || '').toLowerCase();
    if (['tx','ca','fl','nj','ga','il','md','co','wa','ny','oh','pa','mi','nc','az','nv','or','va','ma','ct','mn','wi','in','tn','mo','la','al','sc','ky','ok','ar','ms','ia','ks','ut','ne','nm','wv','id','hi','me','nh','ri','mt','de','sd','nd','ak','vt','wy','dc',
      'texas','california','florida','georgia','illinois','new york','ohio','michigan','houston','los angeles','miami','atlanta','chicago','denver','seattle','newark','baltimore'].some(s => loc.includes(s)))
      return t('carDetails.countries.us');
    if (['dubai','sharjah','abu dhabi','ajman','uae','emirates'].some(s => loc.includes(s))) return t('carDetails.countries.uae');
    if (['germany','berlin','munich','bremen','hamburg'].some(s => loc.includes(s))) return t('carDetails.countries.germany');
    if (['canada','toronto','montreal','vancouver'].some(s => loc.includes(s))) return t('carDetails.countries.canada');
    if (['uk','london','england','birmingham'].some(s => loc.includes(s))) return t('carDetails.countries.uk');
    if (['korea','seoul','busan'].some(s => loc.includes(s))) return t('carDetails.countries.korea');
    if (['japan','tokyo','osaka'].some(s => loc.includes(s))) return t('carDetails.countries.japan');
    return car.location || t('carDetails.notSpecified');
  })();

  const dateLocale = i18n.language === 'ar' ? 'ar-LY' : 'en-GB';

  const specs = [
    { label: t('carDetails.specs.year'), value: car.year || car.Year, icon: Calendar },
    { label: t('carDetails.specs.make'), value: car.make || car.Make, icon: Shield },
    { label: t('carDetails.specs.model'), value: car.model || car['Model Group'], icon: Info },
    { label: t('carDetails.specs.odometer'), value: `${(car.odometer || car.Odometer || 0).toLocaleString('en-US')} ${car.mileageUnit || 'mi'}`, icon: Gauge },
    { label: t('carDetails.specs.location'), value: car.location || `${car['Location city']}, ${car['Location state']}`, icon: MapPin },
    { label: t('carDetails.specs.vin'), value: car.vin || car.VIN, icon: Hash },
    { label: t('carDetails.specs.damageType'), value: car.primaryDamage && car.primaryDamage !== 'None' ? car.primaryDamage : t('carDetails.noDamage'), icon: AlertTriangle },
    { label: t('carDetails.specs.importDate'), value: car.auctionEndDate ? new Date(car.auctionEndDate).toLocaleDateString(dateLocale, { year: 'numeric', month: 'long' }) : new Date().toLocaleDateString(dateLocale, { year: 'numeric', month: 'long' }), icon: Calendar },
    { label: t('carDetails.specs.importCountry'), value: importCountry, icon: Tag },
  ];

  if (isLive) {
    return <Navigate to="/live-auction" replace />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 pt-24 pb-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500" dir={i18n.dir()}>
      {/* Back + Share row */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-orange-500 transition-colors font-bold"
        >
          <ChevronLeft className="w-5 h-5" />
          {t('carDetails.back')}
        </button>

        {/* [og-share] Native + WhatsApp + Facebook share. The server injects
            car-specific og:image and og:title so previews look great. */}
        <CarShareButtons car={car} />
      </div>

      {/* Status Banner */}
      {car.status === 'upcoming' && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-4 flex items-center gap-3">
          <Clock className="w-6 h-6 text-blue-500 flex-shrink-0" />
          <div>
            <div className="font-black text-blue-800">{t('carDetails.upcomingAuction')}</div>
            <div className="text-blue-600 text-sm font-black mt-1">
              {t('carDetails.timeUntilStart')} <CountdownLabel targetDate={car.auctionStartTime} />
            </div>
          </div>
        </div>
      )}

      {isOfferMarket && (
        <div className="bg-orange-50 border border-orange-100 rounded-2xl px-6 py-4 flex items-center gap-3">
          <Tag className="w-6 h-6 text-orange-500 flex-shrink-0" />
          <div>
            <div className="font-black text-orange-800">{t('carDetails.offerMarketTitle')}</div>
            <div className="text-orange-600 text-sm font-black mt-1">
              {t('carDetails.timeUntilEnd')} <CountdownLabel targetDate={car.offerMarketEndTime} />
            </div>
          </div>
        </div>
      )}

      {car.status === 'closed' && (
        <div className={`rounded-2xl px-6 py-4 flex items-center gap-3 ${car.winnerId === currentUser?.id
          ? 'bg-green-50 border border-green-100'
          : 'bg-slate-50 border border-slate-100'
          }`}>
          <Shield className={`w-6 h-6 flex-shrink-0 ${car.winnerId === currentUser?.id ? 'text-green-500' : 'text-slate-400'}`} />
          <div>
            <div className={`font-black ${car.winnerId === currentUser?.id ? 'text-green-800' : 'text-slate-700'}`}>
              {car.winnerId === currentUser?.id ? t('carDetails.youWon') : t('carDetails.auctionEnded')}
            </div>
            <div className="text-sm font-medium text-slate-500">
              {t('carDetails.finalSalePrice')} ${(car.currentBid || 0).toLocaleString('en-US')}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left: Images */}
        <div
          className="space-y-4"
          onMouseEnter={() => setIsHoveringGallery(true)}
          onMouseLeave={() => setIsHoveringGallery(false)}
        >
          <div
            className="rounded-3xl overflow-hidden shadow-2xl border border-slate-200 bg-white aspect-[4/3] cursor-pointer relative group"
            onClick={() => setShowLightbox(true)}
          >
            <img
              src={mainImage}
              alt={car.make || car.Make}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/car/800/600';
              }}
            />
          </div>
          <div className="grid grid-cols-5 gap-2">
            {allImages.map((img: string, i: number) => (
              <div
                key={i}
                onClick={() => setCurrentImageIndex(i)}
                className={`aspect-square rounded-xl overflow-hidden border-2 transition-all cursor-pointer bg-slate-50 ${currentImageIndex === i ? 'border-orange-500 shadow-md scale-105' : 'border-slate-200 opacity-60 hover:opacity-100'}`}
              >
                <img
                  src={img}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://picsum.photos/seed/car${i}/200/200`;
                  }}
                />
              </div>
            ))}
          </div>

          {/* Media Section */}
          {(car.youtubeVideoUrl || car.videoUrl || car.engineVideoUrl || car.engineSoundUrl || car.engineAudioUrl || car.inspectionReportUrl || car.inspectionPdf) && (
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm mt-8 space-y-6">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-4">
                <FileText className="w-6 h-6 text-orange-500" /> {t('carDetails.inspectionMedia')}
              </h3>

              {(car.youtubeVideoUrl || car.videoUrl || car.engineVideoUrl) && (
                <div className="aspect-video rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-100 flex flex-col">
                  <iframe
                    title={t('carDetails.carVideo')}
                    src={getYoutubeEmbedUrl(car.youtubeVideoUrl || car.videoUrl || car.engineVideoUrl)}
                    className="w-full flex-1"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>
              )}

              {(car.engineSoundUrl || car.engineAudioUrl) && (
                <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-4 border border-slate-100">
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 flex-shrink-0 shadow-sm">
                    <Gauge className="w-6 h-6" />
                  </div>
                  <div className="flex-1 w-full min-w-0">
                    <div className="text-sm font-black text-slate-800 mb-2">{t('carDetails.engineSound')}</div>
                    <audio controls className="w-full h-10 outline-none" src={car.engineSoundUrl || car.engineAudioUrl}>
                      {t('carDetails.audioNotSupported')}
                    </audio>
                  </div>
                </div>
              )}

              {(car.inspectionReportUrl || car.inspectionPdf) && (
                <button onClick={() => setShowPdfModal(car.inspectionReportUrl || car.inspectionPdf)} className="w-full bg-slate-900 hover:bg-orange-500 text-white p-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 shadow-lg active:scale-95 group">
                  <FileText className="w-5 h-5 group-hover:scale-110 transition-transform" /> {t('carDetails.viewInspectionPdf')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Info */}
        <div className="space-y-8">
          {car.isRecommended && (
            <div className="relative bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 p-4 rounded-2xl shadow-xl shadow-amber-400/30 border-2 border-amber-300 animate-pulse-slow">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/30 backdrop-blur rounded-full flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-slate-900 fill-current" />
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900 opacity-80 mb-0.5">{t('carDetails.premiumBadge')}</div>
                  <div className="text-lg font-black text-slate-900">{t('carDetails.premiumDesc')}</div>
                </div>
              </div>
              <div className="absolute top-2 left-2 bg-slate-900 text-amber-400 text-[10px] font-black px-2 py-0.5 rounded-full">PREMIUM</div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 text-orange-500 font-bold text-sm uppercase tracking-widest mb-2">
              <Shield className="w-4 h-4" />
              {car.titleType || car['Sale Title State'] || 'Clean Title'}
            </div>
            <h1 className="text-4xl font-black text-slate-900 mb-4">
              {car.year || car.Year} {car.make || car.Make} {car.model || car['Model Group']}
            </h1>
            <div className="flex items-center gap-4 text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {car.location || `${car['Location city']}, ${car['Location state']}`}
              </span>
              <span className="flex items-center gap-1">
                <Hash className="w-4 h-4" />
                Lot: {car.lotNumber || car['Lot number'] || 'N/A'}
              </span>
            </div>
          </div>

          {/* Quick Specs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {specs.map((spec, i) => {
              const Icon = spec.icon;
              return (
                <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase">
                    <Icon className="w-3 h-3" />
                    {spec.label}
                  </div>
                  <div className="text-slate-800 font-bold truncate">{spec.value}</div>
                </div>
              );
            })}
          </div>

          {/* Damage Info */}
          {(car.primaryDamage && car.primaryDamage !== 'None') && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-amber-800 text-sm">{t('carDetails.damageReport')}</div>
                <div className="text-amber-700 text-sm">
                  {t('carDetails.primaryDamage')} <strong>{car.primaryDamage}</strong>
                  {car.secondaryDamage && <span> | {t('carDetails.secondaryDamage')} <strong>{car.secondaryDamage}</strong></span>}
                </div>
              </div>
            </div>
          )}

          {/* Bid / Offer CTA */}
          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">
                  {isOfferMarket ? t('carDetails.currentHighestOffer') : t('carDetails.lastBidPrice')}
                </div>
                <div className="text-5xl font-black font-mono text-green-400">
                  ${(car.currentBid || car.reservePrice || 0).toLocaleString('en-US')}
                  <div className="text-xl text-slate-400 font-sans tracking-normal font-medium mt-1">≈ {Math.round((car.currentBid || car.reservePrice || 0) * (exchangeRate || 7)).toLocaleString('en-US')} د.ل</div>
                </div>
              </div>
              <div className="text-right flex flex-col gap-4">
                <div>
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">{t('carDetails.reservePrice')}</div>
                  <div className="text-2xl font-black font-mono text-slate-400 line-through decoration-red-500/50">
                    ${(car.reservePrice || 0).toLocaleString('en-US')}
                  </div>
                  <div className="text-sm font-bold text-slate-500 font-sans tracking-normal">
                    ≈ {Math.round((car.reservePrice || 0) * (exchangeRate || 7)).toLocaleString('en-US')} د.ل
                  </div>
                </div>
                {car.buyItNow > 0 && (
                  <div>
                    <div className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-1">{t('carDetails.buyItNowLabel')}</div>
                    <div className="text-3xl font-black font-mono text-amber-500">
                      ${car.buyItNow.toLocaleString('en-US')}
                    </div>
                    <div className="text-sm font-bold text-amber-500/70 font-sans tracking-normal mt-1">
                      ≈ {Math.round(car.buyItNow * (exchangeRate || 7)).toLocaleString('en-US')} د.ل
                    </div>
                  </div>
                )}
              </div>
            </div>

            {car.status === 'upcoming' && (
              <PreBidPanel car={car} currentUser={currentUser} socket={socket} showAlert={showAlert} exchangeRate={exchangeRate} />
            )}

            {isOfferMarket && currentUser && (
              <MakeOfferPanel car={car} currentUser={currentUser} />
            )}

            {car.buyItNow > 0 && car.status !== 'closed' && (
              <button
                onClick={() => {
                  if (!currentUser) {
                    showAlert(t('carDetails.loginFirst'), 'error');
                    return;
                  }
                  showAlert(t('carDetails.buyItNowFlow'), 'success');
                }}
                className="w-full mt-4 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 active:scale-95 transition-all text-lg"
              >
                {t('carDetails.buyItNowBtn', { price: car.buyItNow.toLocaleString('en-US') })}
              </button>
            )}

            {car.status === 'closed' && (
              <div className="w-full py-4 bg-slate-800 text-slate-500 rounded-2xl font-black text-center">
                {t('carDetails.auctionEnded')}
              </div>
            )}

            {/* Mini Cost Calculator */}
            {calculationResult && (car.currentBid > 0 || car.reservePrice > 0 || car.startingBid > 0) && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-widest mb-3">
                  <CalcIcon className="w-4 h-4 text-orange-500" />
                  {t('carDetails.fullCostEstimate')}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('carDetails.auctionFee')}</span>
                    <span className="font-mono">${calculationResult.auctionFee.toLocaleString('en-US')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{t('carDetails.shippingLogistics')}</span>
                    <span className="font-mono">${(calculationResult.inlandFreight + calculationResult.oceanFreight).toLocaleString('en-US')}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-white/10 font-black">
                    <span className="text-orange-400">{t('carDetails.totalLanded')}</span>
                    <div className="flex flex-col items-end">
                      <span className="font-mono text-orange-400">${calculationResult.total.toLocaleString('en-US')}</span>
                      <span className="font-mono text-xs text-orange-400/70">{Math.round(calculationResult.total * (exchangeRate || 7)).toLocaleString('en-US')} د.ل</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Estimated Market Price Widget */}
          <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100/50 rounded-[2rem] p-8 shadow-md relative overflow-hidden group mt-6">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-10 -mt-10 transition-transform group-hover:scale-150 duration-700"></div>
            <div className="relative flex flex-col gap-6">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-16 h-16 bg-white rounded-2xl shadow-sm border border-indigo-50 flex items-center justify-center relative">
                  <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl animate-pulse"></div>
                  <ArrowUp className="w-8 h-8 text-indigo-500 relative z-10" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-indigo-500 mb-1 flex items-center gap-1.5 uppercase tracking-wider">
                    {t('carDetails.expectedMarketPrice')}
                  </div>
                  {estimate ? (
                    <div className="flex items-end gap-3">
                      <div className="text-4xl font-black text-indigo-900 font-mono tracking-tight text-shadow-sm">{estPriceValue.toLocaleString('en-US')} د.ل</div>
                      <div className="text-xl font-bold text-slate-500 font-mono tracking-tight pb-[2px]">
                        (${Math.round(estPriceValue / (exchangeRate || 7)).toLocaleString('en-US')})
                      </div>
                    </div>
                  ) : (
                    <div className="text-xl font-bold text-slate-400 mt-2">{t('carDetails.noMarketData')}</div>
                  )}
                </div>
              </div>

              {calculationResult && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <div className="font-bold text-emerald-800 text-lg">{t('carDetails.estimatedSavings')}</div>
                      <div className="text-emerald-600/80 text-xs mt-1">{t('carDetails.savingsHint')}</div>
                    </div>
                  </div>
                  <div className="text-left font-black text-emerald-600 font-mono text-3xl" dir="ltr">
                    {(() => {
                      if (!estimate) return <span className="text-sm text-emerald-600/50 font-sans tracking-normal font-bold">{t('carDetails.notAvailable')}</span>;
                      const totalCostLYD = Math.floor(calculationResult.total * (exchangeRate || 7));
                      const profit = estPriceValue - totalCostLYD;
                      return profit > 0 ? `+${profit.toLocaleString('en-US')} د.ل` : `${profit.toLocaleString('en-US')} د.ل`;
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Full Details Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-400" />
              <h3 className="font-bold text-slate-800">{t('carDetails.additionalDetails')}</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2">
              {[
                [t('carDetails.fullModel'), car.model || car['Model Group']],
                [t('carDetails.transmission'), car.transmission || t('carDetails.notSpecified')],
                [t('carDetails.fuel'), car.fuelType || t('carDetails.notSpecified')],
                [t('carDetails.drive'), car.drivetrain || car.drive || t('carDetails.notSpecified')],
                [t('carDetails.exteriorColor'), car.exteriorColor || t('carDetails.notSpecified')],
                [t('carDetails.engine'), car.engine || car.engineSize || t('carDetails.notSpecified')],
                [t('carDetails.titleType'), car.titleType || 'Clean'],
                [t('carDetails.runs'), car.runsDrives === 'yes' ? t('carDetails.yes') : car.runsDrives || t('carDetails.notSpecified')],
              ].filter(([, v]) => v).map(([key, value], i) => (
                <div key={i} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors border-b border-slate-50">
                  <span className="text-sm text-slate-500 font-medium">{key}</span>
                  <span className="text-sm text-slate-800 font-bold">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PDF Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
          <div className="bg-white rounded-3xl w-full h-full max-w-5xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-6 h-6 text-orange-500" /> {t('carDetails.inspectionPdfTitle')}
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={showPdfModal}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors text-sm"
                  download
                >
                  <FileText className="w-4 h-4 inline-block mr-1" /> {t('carDetails.downloadFile')}
                </a>
                <button
                  title={t('carDetails.close')}
                  onClick={() => setShowPdfModal(null)}
                  className="p-2 bg-slate-200 hover:bg-rose-500 hover:text-white rounded-full transition-all text-slate-500"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 w-full">
              <iframe src={showPdfModal} className="w-full h-full border-0" title="PDF Viewer" />
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {showLightbox && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center animate-in fade-in duration-300">
          <button
            onClick={() => setShowLightbox(false)}
            aria-label={t('carDetails.close')}
            title={t('carDetails.close')}
            className="absolute top-6 left-6 p-4 bg-white/10 hover:bg-rose-500 hover:text-white rounded-full transition-all text-white/70"
          >
            <X className="w-8 h-8" />
          </button>

          {allImages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1)); }}
              aria-label={t('carDetails.next')}
              title={t('carDetails.next')}
              className="absolute left-6 p-4 bg-white/10 hover:bg-orange-500 hover:text-white rounded-full transition-all text-white/70 z-10"
            >
              <ChevronLeft className="w-10 h-10 -rotate-180" />
            </button>
          )}

          <img
            src={mainImage}
            alt="Fullscreen"
            className="max-w-[90vw] max-h-[90vh] object-contain select-none"
            referrerPolicy="no-referrer"
          />

          {allImages.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setCurrentImageIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1)); }}
              aria-label={t('carDetails.previous')}
              title={t('carDetails.previous')}
              className="absolute right-6 p-4 bg-white/10 hover:bg-orange-500 hover:text-white rounded-full transition-all text-white/70 z-10"
            >
              <ChevronLeft className="w-10 h-10" />
            </button>
          )}

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/50 text-white px-6 py-2 rounded-full font-bold text-lg tracking-widest backdrop-blur-sm">
            {currentImageIndex + 1} / {allImages.length}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Inline Offer Panel for Offer Market cars
// ============================================================
const MakeOfferPanel: React.FC<{ car: any; currentUser: any }> = ({ car, currentUser }) => {
  const { t } = useTranslation();
  const [offerAmount, setOfferAmount] = React.useState(car.currentBid || car.reservePrice * 0.9 || 0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { showAlert } = useStore();

  const minOffer = Math.ceil((car.reservePrice || 0) * 0.9);

  const handleSubmitOffer = async () => {
    if (offerAmount < minOffer) {
      showAlert(t('carDetails.offerPanel.minOfferError', { amount: minOffer.toLocaleString('en-US') }), 'error');
      return;
    }
    if (offerAmount > currentUser.buyingPower) {
      showAlert(t('carDetails.offerPanel.insufficientPower'), 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await authFetch(`/api/cars/${car.id}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, amount: offerAmount })
      });
      const data = await res.json();
      if (res.ok) {
        showAlert(data.message || t('carDetails.offerPanel.submitSuccess'), 'success');
      } else if (data.requiresActivation) {
        // [activation-modal] System-styled popup explaining the user needs
        // admin approval + paid deposit. Dispatched via global event so the
        // BiddingActivationModal mounted in App.tsx renders the dialog.
        window.dispatchEvent(new CustomEvent('bidding:activation-required', {
          detail: { reason: data.eligibilityReason || 'unknown', message: data.error || '' },
        }));
      } else {
        showAlert(data.error || t('carDetails.offerPanel.submitFail'), 'error');
      }
    } catch {
      showAlert(t('carDetails.offerPanel.networkError'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="text-xs text-slate-400 font-bold mb-2 uppercase tracking-widest">
          {t('carDetails.offerPanel.yourOfferLabel', { amount: minOffer.toLocaleString('en-US') })}
        </div>
        <div className="flex gap-3">
          <input aria-label={t('carDetails.offerPanel.input')} title={t('carDetails.offerPanel.input')} placeholder={t('carDetails.offerPanel.specify')}
            type="number"
            value={offerAmount}
            onChange={e => setOfferAmount(Number(e.target.value))}
            min={minOffer}
            step={100}
            className="flex-1 bg-transparent text-white text-2xl font-black font-mono outline-none border-b border-white/20 pb-1"
          />
          <span className="text-slate-400 self-end pb-1 font-bold">USD</span>
        </div>
      </div>
      <button
        onClick={handleSubmitOffer}
        disabled={isSubmitting}
        className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl shadow-orange-500/20 disabled:opacity-50"
      >
        <Gavel className="w-5 h-5" />
        {isSubmitting ? t('carDetails.offerPanel.submitting') : t('carDetails.offerPanel.submitBtn')}
      </button>
      <div className="text-[10px] text-slate-500 text-center">
        {t('carDetails.offerPanel.infoNote')}
      </div>
    </div>
  );
};
