/**
 * Dealer Yard Portal — read-only view of the dealer's vehicles in the yard.
 * Embedded in SellerDashboard under the `yard_portal` view.
 */
import React, { useEffect, useState } from 'react';

type YardVehicle = {
  id: string;
  vin: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  arrivalDate?: string;
  ownershipType?: string;
  notes?: string;
  statusName?: string;
  statusColor?: string;
  statusCode?: string;
  locationCode?: string;
  locationZone?: string;
  mainPhoto?: string;
  updatedAt?: string;
};

function authHeader(): Record<string, string> {
  try {
    const t = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

export default function DealerYardPortal() {
  const [vehicles, setVehicles] = useState<YardVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<YardVehicle | null>(null);
  const [pickupSubmitting, setPickupSubmitting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch('/api/dealer-portal/my-yard-vehicles', { headers: authHeader() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setVehicles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || 'فشل تحميل بيانات الحضيرة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const requestPickup = async (v: YardVehicle) => {
    if (!confirm(`طلب استلام ${v.vin}?`)) return;
    try {
      setPickupSubmitting(true);
      const r = await fetch(`/api/dealer-portal/request-pickup/${v.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ notes: 'طلب استلام من بوابة التاجر' }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      alert('تم إرسال طلب الاستلام — سيتم التواصل معك قريبًا');
      setSelected(null);
      load();
    } catch (e: any) {
      alert('فشل الطلب: ' + (e?.message || ''));
    } finally {
      setPickupSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div dir="rtl" className="p-8 text-center text-slate-500">
        <div className="inline-block w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <div>جارٍ تحميل سياراتك في الحضيرة...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div dir="rtl" className="p-8 bg-red-50 text-red-700 rounded-xl text-center">
        <div className="font-bold mb-2">حدث خطأ</div>
        <div className="text-sm">{error}</div>
        <button onClick={load} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg font-bold">إعادة المحاولة</button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-4 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900">سياراتي في الحضيرة</h2>
          <p className="text-slate-500 font-bold text-sm mt-1">
            عرض فقط — {vehicles.length} سيارة
          </p>
        </div>
        <button
          onClick={load}
          className="bg-white border border-slate-200 hover:border-orange-400 text-slate-700 font-bold px-4 py-2 rounded-xl"
        >
          تحديث
        </button>
      </div>

      {vehicles.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center text-slate-500">
          <div className="text-6xl mb-4">🚗</div>
          <div className="text-lg font-bold">لا توجد سيارات في الحضيرة حاليًا</div>
          <div className="text-sm mt-2">سيتم إشعارك عند وصول سياراتك المطلوبة.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => (
            <div
              key={v.id}
              onClick={() => setSelected(v)}
              className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:shadow-lg hover:border-orange-300 transition cursor-pointer"
            >
              <div className="aspect-video bg-slate-100 flex items-center justify-center">
                {v.mainPhoto ? (
                  <img src={v.mainPhoto} alt={v.vin} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-5xl opacity-30">🚗</div>
                )}
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-black text-slate-900 truncate">
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin}
                  </div>
                  {v.statusName && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-black text-white whitespace-nowrap"
                      style={{ backgroundColor: v.statusColor || '#64748b' }}
                    >
                      {v.statusName}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-mono truncate">{v.vin}</div>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <div>
                    <span className="font-bold">الموقع: </span>
                    {v.locationCode || '—'}
                  </div>
                  <div>
                    <span className="font-bold">وصول: </span>
                    {v.arrivalDate ? new Date(v.arrivalDate).toLocaleDateString('ar-LY') : '—'}
                  </div>
                </div>
                {v.statusCode === 'withdrawn_by_dealer' ? (
                  <div className="bg-fuchsia-50 text-fuchsia-700 text-xs font-bold text-center py-2 rounded-lg">
                    جاهزة للاستلام
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-video bg-slate-100 flex items-center justify-center">
              {selected.mainPhoto ? (
                <img src={selected.mainPhoto} alt={selected.vin} className="w-full h-full object-cover" />
              ) : (
                <div className="text-7xl opacity-30">🚗</div>
              )}
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-black text-slate-900">
                    {[selected.year, selected.make, selected.model].filter(Boolean).join(' ')}
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-1">{selected.vin}</div>
                </div>
                {selected.statusName && (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-black text-white whitespace-nowrap"
                    style={{ backgroundColor: selected.statusColor || '#64748b' }}
                  >
                    {selected.statusName}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="اللون" value={selected.color} />
                <Info label="الموقع" value={selected.locationCode} />
                <Info label="المنطقة" value={selected.locationZone} />
                <Info label="نوع الملكية" value={selected.ownershipType} />
                <Info label="تاريخ الوصول" value={selected.arrivalDate ? new Date(selected.arrivalDate).toLocaleDateString('ar-LY') : undefined} />
                <Info label="آخر تحديث" value={selected.updatedAt ? new Date(selected.updatedAt).toLocaleDateString('ar-LY') : undefined} />
              </div>

              {selected.notes && (
                <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700">
                  <div className="font-bold mb-1">ملاحظات</div>
                  <div>{selected.notes}</div>
                </div>
              )}

              {selected.statusCode === 'withdrawn_by_dealer' && (
                <button
                  disabled={pickupSubmitting}
                  onClick={() => requestPickup(selected)}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl disabled:opacity-50"
                >
                  {pickupSubmitting ? 'جارٍ الإرسال...' : 'طلب استلام'}
                </button>
              )}

              <button
                onClick={() => setSelected(null)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500 font-bold">{label}</div>
      <div className="text-slate-900 font-bold">{value || '—'}</div>
    </div>
  );
}
