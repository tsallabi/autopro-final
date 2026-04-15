import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Phone, MessageCircle, Clock, Navigation, Map as MapIcon, Globe, Loader2, ArrowRight } from 'lucide-react';
import { useGeolocation } from '../hooks/useGeolocation';

type Center = {
  id: string;
  name: string;
  nameEn?: string;
  country: string;
  countryCode?: string;
  city: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  lat: number;
  lng: number;
  workingHours?: string;
  services?: string[];
  distance?: number;
};

const COUNTRY_FLAGS: Record<string, string> = {
  LY: '🇱🇾',
  AE: '🇦🇪',
  SA: '🇸🇦',
  QA: '🇶🇦',
  KW: '🇰🇼',
  BH: '🇧🇭',
  OM: '🇴🇲',
};

const mapsLinkFor = (c: Center) => `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
const directionsLinkFor = (c: Center, from?: { lat: number; lng: number } | null) =>
  from
    ? `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${c.lat},${c.lng}`
    : mapsLinkFor(c);

function CenterCard({ center, userCoords }: { center: Center; userCoords: { lat: number; lng: number } | null }) {
  const flag = center.countryCode ? COUNTRY_FLAGS[center.countryCode] || '🌍' : '🌍';
  const whatsapp = (center.whatsapp || '').replace(/[^0-9]/g, '');
  const phone = center.phone || '';

  return (
    <div className="relative bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600" />
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-4xl shrink-0" aria-hidden>{flag}</div>
          <div className="min-w-0">
            <h3 className="font-black text-lg text-slate-900 truncate">{center.name}</h3>
            <p className="text-xs font-bold text-slate-500 truncate">{center.country} · {center.city}</p>
          </div>
        </div>
        {typeof center.distance === 'number' && (
          <div className="shrink-0 bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-3 py-2 text-center min-w-[92px]">
            <div className="text-lg font-black leading-none">{center.distance}</div>
            <div className="text-[10px] font-bold opacity-80 mt-1">كم منك</div>
          </div>
        )}
      </div>

      {center.address && (
        <div className="flex items-start gap-2 text-sm text-slate-600 mb-2">
          <MapPin className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
          <span className="leading-relaxed">{center.address}</span>
        </div>
      )}
      {center.workingHours && (
        <div className="flex items-start gap-2 text-sm text-slate-600 mb-3">
          <Clock className="w-4 h-4 mt-0.5 text-orange-500 shrink-0" />
          <span className="leading-relaxed">{center.workingHours}</span>
        </div>
      )}

      {center.services && center.services.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {center.services.map((s) => (
            <span key={s} className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">{s}</span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mt-4">
        {phone && (
          <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl py-3 transition-colors">
            <Phone className="w-4 h-4" />
            <span>اتصل</span>
          </a>
        )}
        {whatsapp && (
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl py-3 transition-colors">
            <MessageCircle className="w-4 h-4" />
            <span>واتساب</span>
          </a>
        )}
      </div>

      <a href={directionsLinkFor(center, userCoords)} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-2 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-sm rounded-xl py-3 border border-orange-200 transition-colors">
        <MapIcon className="w-4 h-4" />
        <span>فتح في الخرائط</span>
      </a>
    </div>
  );
}

export const NearestShippingCenterPage: React.FC = () => {
  const { coords, error: geoError, loading: geoLoading, requestLocation } = useGeolocation();
  const [centers, setCenters] = useState<Center[]>([]);
  const [nearest, setNearest] = useState<Center[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Load all centers on mount (fallback list when no geolocation)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/shipping-centers');
        if (!res.ok) throw new Error('failed');
        const data: Center[] = await res.json();
        if (!cancelled) setCenters(data);
      } catch {
        if (!cancelled) setFetchError('تعذر تحميل قائمة المراكز، حاول لاحقاً');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch nearest when coordinates change
  useEffect(() => {
    if (!coords) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shipping-centers/nearest?lat=${coords.lat}&lng=${coords.lng}&limit=5`);
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!cancelled) setNearest(data.centers || []);
      } catch {
        if (!cancelled) setFetchError('تعذر جلب أقرب المراكز');
      }
    })();
    return () => { cancelled = true; };
  }, [coords]);

  // Group centers by country (fallback view)
  const grouped = useMemo(() => {
    const map = new Map<string, Center[]>();
    centers.forEach((c) => {
      const key = c.country;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries());
  }, [centers]);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #f97316 0%, transparent 40%), radial-gradient(circle at 80% 60%, #f97316 0%, transparent 40%)' }} />
        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500/15 border border-orange-500/30 text-orange-300 rounded-full px-4 py-2 text-xs font-black mb-6">
            <Navigation className="w-4 h-4" />
            <span>خدمة تحديد الموقع</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-4">
            ابحث عن أقرب مركز شحن إليك
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto text-base md:text-lg leading-relaxed mb-8">
            نساعدك على الوصول لأقرب مركز استلام أو تخليص جمركي بضغطة زر — سواء كنت في ليبيا أو دول الخليج.
          </p>
          <button
            type="button"
            onClick={requestLocation}
            disabled={geoLoading}
            className="inline-flex items-center gap-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl px-8 py-4 shadow-lg shadow-orange-500/30 transition-all"
          >
            {geoLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
            <span>{geoLoading ? 'جاري تحديد موقعك...' : coords ? 'تحديث الموقع' : 'تحديد موقعي'}</span>
          </button>
          {geoError && (
            <p className="mt-4 text-sm font-bold text-red-300">{geoError}</p>
          )}
          {coords && (
            <p className="mt-4 text-xs text-slate-400">
              موقعك الحالي: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </p>
          )}
        </div>
      </section>

      {/* Content */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        {loading ? (
          <div className="text-center py-16 text-slate-500 font-bold">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-orange-500" />
            جاري تحميل المراكز...
          </div>
        ) : fetchError ? (
          <div className="text-center py-16 text-red-500 font-bold">{fetchError}</div>
        ) : nearest ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
                <Navigation className="w-6 h-6 text-orange-500" />
                أقرب {nearest.length} مراكز إليك
              </h2>
            </div>
            {nearest.length === 0 ? (
              <p className="text-slate-500 font-bold">لم يتم العثور على مراكز قريبة حالياً.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {nearest.map((c) => (
                  <CenterCard key={c.id} center={c} userCoords={coords} />
                ))}
              </div>
            )}

            {/* Mini map preview */}
            {nearest.length > 0 && (
              <div className="mt-10 rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
                <iframe
                  title="map"
                  width="100%"
                  height="360"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  src={`https://www.google.com/maps?q=${nearest[0].lat},${nearest[0].lng}&z=6&output=embed`}
                />
              </div>
            )}
          </>
        ) : (
          // Fallback: grouped list
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
                <Globe className="w-6 h-6 text-orange-500" />
                جميع مراكز الشحن
              </h2>
              <span className="text-xs font-bold text-slate-500">فعّل تحديد الموقع لعرض الأقرب إليك</span>
            </div>
            {grouped.map(([country, list]) => (
              <div key={country} className="mb-10">
                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                  <span className="text-2xl">{list[0]?.countryCode ? COUNTRY_FLAGS[list[0].countryCode] || '🌍' : '🌍'}</span>
                  <span>{country}</span>
                  <span className="text-xs font-bold text-slate-400">({list.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {list.map((c) => (
                    <CenterCard key={c.id} center={c} userCoords={coords} />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <div className="mt-16 bg-gradient-to-l from-orange-500 to-orange-600 rounded-3xl p-8 md:p-10 text-white text-center shadow-lg">
          <h3 className="text-2xl md:text-3xl font-black mb-3">هل تحتاج مساعدة في اختيار المركز المناسب؟</h3>
          <p className="text-white/90 mb-6 max-w-2xl mx-auto">تواصل معنا وسنرشدك إلى أقرب مركز شحن لاستلام سيارتك أو إتمام التخليص الجمركي.</p>
          <a href="/shipping" className="inline-flex items-center gap-2 bg-white text-orange-600 hover:bg-orange-50 font-black rounded-2xl px-6 py-3 transition-colors">
            <span>تفاصيل خدمات الشحن</span>
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>
    </div>
  );
};

export default NearestShippingCenterPage;
