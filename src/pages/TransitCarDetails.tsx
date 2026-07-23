/**
 * TransitCarDetails — full page for an in-transit ("قادمة في الطريق") car.
 *
 * Buyers can inspect every photo + full specs + the shipment itinerary
 * (vessel, container, ports, ETA countdown) and BUY the car while it is
 * still at sea (full immediate price — owner decision 2026-07-23), or just
 * reserve a seat to be notified on arrival.
 */
import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Ship, MapPin, Calendar, BellRing, Check, Zap, ArrowRight, Gauge,
  Fuel, Cog, Palette, FileText, Anchor, Container, ExternalLink, Users,
} from 'lucide-react';
import { authFetch, useStore } from '../context/StoreContext';
import CarShareButtons from '../components/CarShareButtons';

type TransitCarFull = {
  id: string;
  lot?: string;
  vin?: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  odometer?: number;
  color?: string;
  interiorColor?: string;
  fuel?: string;
  transmission?: string;
  engine?: string;
  drive?: string;
  primaryDamage?: string;
  titleType?: string;
  runsDrives?: string;
  inspectionPdf?: string;
  videoUrl?: string;
  images: string[];
  description?: string;
  buyItNow?: number;
  sold?: boolean;
  interestCount?: number;
  transitEta?: string;
  transitOrigin?: string;
  transitDestination?: string;
  transitVessel?: string;
  transitContainer?: string;
  transitTrackingUrl?: string;
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return '—'; }
}

export const TransitCarDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser, showAlert } = useStore();

  const [car, setCar] = useState<TransitCarFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [buying, setBuying] = useState(false);
  const [interested, setInterested] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/cars/transit/${id}`);
        const d = await r.json();
        if (!alive) return;
        if (r.ok) setCar(d);
        else showAlert(d.error || 'لم نعثر على السيارة', 'error');
      } catch {
        if (alive) showAlert('فشل الاتصال بالخادم', 'error');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const buyNow = async () => {
    if (!currentUser) {
      showAlert('سجّل الدخول أولاً لإتمام الشراء', 'info');
      navigate('/auth');
      return;
    }
    setBuying(true);
    try {
      const r = await authFetch(`/api/cars/transit/${id}/buy-now`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        showAlert(d.message || '⚓ مبروك! السيارة أصبحت باسمك — راجع فواتيرك لإتمام الدفع.', 'success');
        setCar(prev => (prev ? { ...prev, sold: true } : prev));
        setConfirming(false);
      } else {
        showAlert(d.error || 'تعذّر إتمام الشراء', 'error');
        if (String(d.error || '').includes('بيعت')) {
          setCar(prev => (prev ? { ...prev, sold: true } : prev));
        }
      }
    } catch {
      showAlert('فشل الاتصال بالخادم', 'error');
    } finally {
      setBuying(false);
    }
  };

  const express = async () => {
    if (!currentUser) {
      showAlert('سجّل الدخول أولاً لحجز مقعدك', 'info');
      navigate('/auth');
      return;
    }
    try {
      const r = await authFetch(`/api/cars/${id}/express-interest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (r.ok) { setInterested(true); showAlert('✅ سجّلنا اهتمامك — سنُعلمك فور وصولها', 'success'); }
      else { const d = await r.json().catch(() => ({})); showAlert(d.error || 'تعذّر تسجيل الاهتمام', 'error'); }
    } catch { showAlert('فشل الاتصال', 'error'); }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400 font-bold" dir="rtl">
        ...جارٍ تحميل بيانات السيارة
      </div>
    );
  }
  if (!car) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4" dir="rtl">
        <div className="text-5xl">🚢</div>
        <p className="text-slate-600 font-black">لم نعثر على هذه السيارة في قائمة القادمة في الطريق</p>
        <Link to="/marketplace?tab=transit" className="text-blue-600 font-black flex items-center gap-1">
          العودة لقائمة القادمة في الطريق <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const days = daysUntil(car.transitEta);
  const price = Number(car.buyItNow) || 0;
  const specs: Array<{ icon: any; label: string; value?: string | number }> = [
    { icon: Gauge, label: 'الممشى', value: car.odometer ? `${Number(car.odometer).toLocaleString()} كم/ميل` : undefined },
    { icon: Cog, label: 'ناقل الحركة', value: car.transmission },
    { icon: Fuel, label: 'الوقود', value: car.fuel },
    { icon: Cog, label: 'المحرك', value: car.engine },
    { icon: Cog, label: 'نظام الدفع', value: car.drive },
    { icon: Palette, label: 'اللون الخارجي', value: car.color },
    { icon: Palette, label: 'اللون الداخلي', value: car.interiorColor },
    { icon: FileText, label: 'نوع الملكية', value: car.titleType },
    { icon: FileText, label: 'الضرر الأساسي', value: car.primaryDamage },
    { icon: Check, label: 'تعمل وتسير', value: car.runsDrives },
    { icon: FileText, label: 'VIN', value: car.vin },
    { icon: FileText, label: 'رقم اللوت', value: car.lot },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6" dir="rtl">
      {/* Breadcrumb */}
      <Link to="/marketplace?tab=transit" className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-800">
        <ArrowRight className="w-4 h-4" /> العودة إلى قادمة في الطريق
      </Link>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Gallery */}
        <div className="space-y-3">
          <div className="relative aspect-[16/10] bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
            <img
              src={car.images?.[activeImg] || 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&q=80&w=800'}
              alt={`${car.make} ${car.model}`}
              className="w-full h-full object-cover"
            />
            {car.sold ? (
              <div className="absolute top-4 right-4 bg-rose-600 text-white text-sm font-black px-4 py-2 rounded-full shadow-lg">
                ⚓ مباعة وهي في البحر
              </div>
            ) : (
              <div className="absolute top-4 right-4 bg-blue-600 text-white text-sm font-black px-4 py-2 rounded-full flex items-center gap-1.5 shadow-lg">
                <Ship className="w-4 h-4" /> قادمة في الطريق
              </div>
            )}
            {days !== null && (
              <div className="absolute bottom-4 left-4 bg-slate-900/85 backdrop-blur text-white text-sm font-bold px-4 py-2 rounded-full">
                ⏱ {days === 0 ? 'تصل اليوم' : days === 1 ? 'تصل غداً' : `تبقى ${days} يوماً على الوصول`}
              </div>
            )}
          </div>
          {(car.images?.length || 0) > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {car.images.slice(0, 10).map((img, i) => (
                <button key={i} onClick={() => setActiveImg(i)}
                  className={`aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${i === activeImg ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200 hover:border-blue-300'}`}>
                  <img src={img} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summary + buy */}
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">{car.year} {car.make} {car.model}</h1>
            {car.trim && <p className="text-slate-500 font-bold mt-1">{car.trim}</p>}
            {(car.interestCount ?? 0) > 0 && (
              <p className="text-xs text-orange-600 font-bold mt-2 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {car.interestCount} شخص بانتظار وصولها
              </p>
            )}
          </div>

          {/* Share for promotion — WhatsApp/Facebook/Twitter/copy, with rich
              link previews injected server-side (carDetailsOg). */}
          <CarShareButtons
            car={{ id: car.id, year: car.year, make: car.make, model: car.model, buyItNow: car.buyItNow }}
            pathPrefix="transit-car"
            shareText={`⚓ ${car.year} ${car.make} ${car.model} قادمة في الطريق إلى ليبيا${price > 0 ? ` — اشترِها الآن وهي في البحر بـ$${price.toLocaleString()}` : ''}! على AutoPro Libya:`}
          />

          {/* Shipment itinerary */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
            <h3 className="font-black text-blue-900 flex items-center gap-2"><Anchor className="w-5 h-5" /> رحلة الشحن</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-blue-800 font-bold"><Calendar className="w-4 h-4" /> الوصول: {fmtDate(car.transitEta)}</div>
              <div className="flex items-center gap-2 text-blue-800 font-bold"><MapPin className="w-4 h-4" /> {car.transitDestination || 'ليبيا'}</div>
              {car.transitOrigin && <div className="flex items-center gap-2 text-slate-600 col-span-2"><span className="font-bold">من:</span> {car.transitOrigin}</div>}
              {car.transitVessel && <div className="flex items-center gap-2 text-slate-600"><Ship className="w-4 h-4" /> {car.transitVessel}</div>}
              {car.transitContainer && <div className="flex items-center gap-2 text-slate-600"><Container className="w-4 h-4" /> {car.transitContainer}</div>}
            </div>
            {car.transitTrackingUrl && (
              <a href={car.transitTrackingUrl} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1.5 text-xs font-black text-blue-700 hover:text-blue-900 underline">
                <ExternalLink className="w-3.5 h-3.5" /> تتبّع الشحنة مباشرة
              </a>
            )}
          </div>

          {/* Price + buy at sea */}
          {car.sold ? (
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-6 text-center space-y-2">
              <div className="text-3xl">⚓</div>
              <p className="font-black text-rose-600 text-lg">اشتراها زبون وهي في البحر!</p>
              <p className="text-sm text-slate-600 font-bold">سياراتنا تُباع قبل وصولها — احجز القادمة قبل غيرك</p>
              <Link to="/marketplace?tab=transit" className="inline-block mt-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-sm px-6 py-3 rounded-xl">
                تصفح بقية السيارات القادمة
              </Link>
            </div>
          ) : price > 0 ? (
            <div className="bg-gradient-to-l from-orange-50 to-amber-50 border-2 border-orange-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-black text-slate-700">سعر الشراء الفوري في البحر</span>
                <span className="text-3xl font-black text-orange-600" dir="ltr">${price.toLocaleString()}</span>
              </div>
              <p className="text-xs text-slate-600 font-bold leading-relaxed">
                ⚓ اشترِها الآن وهي في الطريق — تُسجَّل باسمك فوراً وتُصدر فاتورة الشراء، وتستلمها فور وصولها إلى {car.transitDestination || 'ليبيا'}.
              </p>
              {confirming ? (
                <div className="space-y-2">
                  <p className="text-sm font-black text-slate-800 text-center">تأكيد شراء {car.year} {car.make} {car.model} بمبلغ ${price.toLocaleString()}؟</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={buyNow} disabled={buying}
                      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2">
                      <Zap className="w-4 h-4" /> {buying ? '...جارٍ الشراء' : 'نعم، أؤكد الشراء'}
                    </button>
                    <button onClick={() => setConfirming(false)} disabled={buying}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black py-3 rounded-xl">
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirming(true)}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black text-lg py-4 rounded-xl shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2 transition-all">
                  <Zap className="w-5 h-5" /> اشترِها الآن وهي في البحر ⚓
                </button>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
              <p className="text-sm font-bold text-slate-600">هذه السيارة ستدخل المزاد فور وصولها — احجز مقعدك لتحصل على أولوية المزايدة</p>
            </div>
          )}

          {/* Reserve seat */}
          {!car.sold && (
            <button onClick={express} disabled={interested}
              className={`w-full font-black text-sm py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 ${
                interested ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25'
              }`}>
              {interested
                ? <><Check className="w-4 h-4" /> سجّلنا اهتمامك — سنعلمك عند الوصول</>
                : <><BellRing className="w-4 h-4" /> احجز مقعدك — أعلمني عند الوصول</>}
            </button>
          )}

          {car.inspectionPdf && (
            <a href={car.inspectionPdf} target="_blank" rel="noreferrer"
               className="w-full inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm py-3 rounded-xl">
              <FileText className="w-4 h-4" /> عرض تقرير الفحص (PDF)
            </a>
          )}
        </div>
      </div>

      {/* Full specs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2"><Cog className="w-5 h-5 text-blue-600" /> المواصفات الكاملة</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {specs.filter(s => s.value).map((s, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5"><s.icon className="w-3.5 h-3.5" /> {s.label}</span>
              <span className="text-sm font-black text-slate-800" dir="ltr">{s.value}</span>
            </div>
          ))}
        </div>
        {car.description && (
          <p className="mt-4 text-sm text-slate-600 font-bold leading-relaxed bg-amber-50 border border-amber-100 rounded-xl p-4">
            📝 {car.description}
          </p>
        )}
      </div>
    </div>
  );
};

export default TransitCarDetails;
