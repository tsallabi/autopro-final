/**
 * TransitCarCard — display card for an "in_transit" car on the marketplace.
 * Showcases the shipment (ETA, port, vessel) and a "احجز مقعدك" CTA that
 * lets the buyer be first-in-line when the car arrives.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ship, MapPin, Calendar, Users, BellRing, Check, Zap } from 'lucide-react';
import { authFetch, useStore } from '../context/StoreContext';

export type TransitCar = {
  id: string;
  lot?: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  odometer?: number;
  color?: string;
  images: string[];
  transitEta?: string;
  transitOrigin?: string;
  transitDestination?: string;
  transitVessel?: string;
  transitTrackingUrl?: string;
  interestCount?: number;
  buyItNow?: number;
  sold?: boolean;
};

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return '—'; }
}

export default function TransitCarCard({ car, onInterestChange }: {
  car: TransitCar;
  onInterestChange?: () => void;
}) {
  const { currentUser, showAlert } = useStore();
  const navigate = useNavigate();
  const [interested, setInterested] = useState(false);
  const [loading, setLoading] = useState(false);

  const image = (car.images && car.images.length > 0) ? car.images[0]
    : 'https://images.unsplash.com/photo-1502877338535-766e1452684a?auto=format&fit=crop&q=80&w=600';
  const days = daysUntil(car.transitEta);
  const openDetails = () => navigate(`/transit-car/${car.id}`);

  const express = async () => {
    if (!currentUser) {
      showAlert('سجّل الدخول أولاً لحجز مقعدك', 'info');
      return;
    }
    setLoading(true);
    try {
      const r = await authFetch(`/api/cars/${car.id}/express-interest`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (r.ok) {
        setInterested(true);
        showAlert('✅ سجّلنا اهتمامك — سنُعلمك فور وصولها', 'success');
        onInterestChange?.();
      } else {
        const d = await r.json().catch(() => ({}));
        showAlert(d.error || 'تعذّر تسجيل الاهتمام', 'error');
      }
    } catch {
      showAlert('فشل الاتصال', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl overflow-hidden border-2 border-blue-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
      {/* Image with status badge — clicking opens the full transit car page */}
      <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden cursor-pointer" onClick={openDetails}>
        <img src={image} alt={`${car.make} ${car.model}`}
             className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
             loading="lazy" />
        {car.sold ? (
          <div className="absolute top-3 right-3 bg-rose-600 text-white text-xs font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
            ⚓ مباعة وهي في البحر
          </div>
        ) : (
          <div className="absolute top-3 right-3 bg-blue-600 text-white text-xs font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
            <Ship className="w-3.5 h-3.5" /> قادمة في الطريق
          </div>
        )}
        {days !== null && (
          <div className="absolute bottom-3 left-3 bg-slate-900/85 backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full">
            ⏱ {days === 0 ? 'تصل اليوم' : days === 1 ? 'تصل غداً' : `تبقى ${days} يوم`}
          </div>
        )}
        {(car.interestCount ?? 0) > 0 && (
          <div className="absolute top-3 left-3 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow">
            <Users className="w-3 h-3" /> {car.interestCount} مهتم
          </div>
        )}
      </div>

      <div className="p-4 space-y-3" dir="rtl">
        <div className="cursor-pointer" onClick={openDetails}>
          <h3 className="text-lg font-black text-slate-900 leading-tight hover:text-blue-700 transition-colors">
            {car.year} {car.make} {car.model}
          </h3>
          {car.trim && <p className="text-xs text-slate-500 font-bold mt-0.5">{car.trim}</p>}
        </div>

        {/* Buy-at-sea price */}
        {(car.buyItNow ?? 0) > 0 && !car.sold && (
          <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl px-3 py-2">
            <span className="text-[11px] font-bold text-orange-700 flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> اشترِها وهي في البحر</span>
            <span className="text-lg font-black text-orange-600" dir="ltr">${Number(car.buyItNow).toLocaleString()}</span>
          </div>
        )}
        {car.sold && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 text-center text-[11px] font-black text-rose-600">
            ⚓ اشتراها زبون قبل وصولها — احجز القادمة قبل غيرك!
          </div>
        )}

        {/* Shipment grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px] bg-blue-50/50 rounded-xl p-3 border border-blue-100">
          <div className="flex items-center gap-1.5 text-blue-700 font-bold">
            <Calendar className="w-3.5 h-3.5" />
            <span>ETA: {formatDate(car.transitEta)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-blue-700 font-bold">
            <MapPin className="w-3.5 h-3.5" />
            <span>{car.transitDestination || 'ليبيا'}</span>
          </div>
          {car.transitOrigin && (
            <div className="flex items-center gap-1.5 text-slate-600 col-span-2">
              <span className="font-bold">من:</span> {car.transitOrigin}
            </div>
          )}
          {car.transitVessel && (
            <div className="flex items-center gap-1.5 text-slate-600 col-span-2">
              <Ship className="w-3 h-3" />
              <span className="font-bold">السفينة:</span> {car.transitVessel}
            </div>
          )}
        </div>

        {(car.buyItNow ?? 0) > 0 && !car.sold && (
          <button
            onClick={openDetails}
            className="w-full font-black text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25"
          >
            <Zap className="w-4 h-4" /> التفاصيل والشراء الفوري ⚓
          </button>
        )}
        {!car.sold && (
          <button
            onClick={express}
            disabled={loading || interested}
            className={`w-full font-black text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
              interested
                ? 'bg-emerald-100 text-emerald-700 cursor-default'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25'
            }`}
          >
            {interested ? (
              <><Check className="w-4 h-4" /> سجّلنا اهتمامك</>
            ) : (
              <><BellRing className="w-4 h-4" /> {loading ? '...جارٍ' : 'احجز مقعدك — أعلمني عند الوصول'}</>
            )}
          </button>
        )}
        {car.sold && (
          <button
            onClick={openDetails}
            className="w-full font-black text-sm py-3 rounded-xl transition-all flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600"
          >
            عرض التفاصيل
          </button>
        )}

        <p className="text-[10px] text-slate-500 text-center leading-relaxed">
          💎 المهتمون الأوائل يحصلون على <strong className="text-orange-600">أولوية المزايدة</strong> عند الوصول
        </p>
      </div>
    </div>
  );
}
