import React, { useState } from 'react';
import { authFetch } from '../../../context/StoreContext';
import { Search, Camera, Car, MapPin, User } from 'lucide-react';

interface VehicleSummary {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  color?: string;
  mileage?: number;
  statusCode?: string;
  statusAr?: string;
  statusLabel?: string;
  statusColor?: string;
  locationCode?: string;
  locationZone?: string;
  ownershipType: string;
  ownerDealerName?: string;
  ownerDealerPhone?: string;
}

export function QuickVINScan({ onOpenDetail }: { onOpenDetail?: (id: string) => void }) {
  const [vin, setVin] = useState('');
  const [result, setResult] = useState<VehicleSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = async (v: string) => {
    setErr(null); setResult(null);
    const q = v.trim().toUpperCase();
    if (!q) { setErr('أدخل رقم VIN'); return; }
    setLoading(true);
    try {
      const r = await authFetch(`/api/yard/vehicles/by-vin/${encodeURIComponent(q)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || 'لم يتم العثور'); return; }
      setResult(j);
    } catch (e: any) {
      setErr(e.message || 'خطأ');
    } finally { setLoading(false); }
  };

  const openScanner = () => {
    // VINScanner component is being added by a parallel agent at a known mount.
    // Try to dispatch a global event it may listen for. Otherwise inform user.
    const ev = new CustomEvent('yard:open-vin-scanner', {
      detail: { onScanned: (code: string) => { setVin(code); lookup(code); } },
    });
    window.dispatchEvent(ev);
    // Fallback message
    setTimeout(() => {
      if (!document.querySelector('[data-yard-vin-scanner="open"]')) {
        setErr('ماسح VIN غير متاح حالياً — استخدم الإدخال اليدوي');
      }
    }, 300);
  };

  const ownershipLabel = (t: string) => ({
    stock: 'مخزون',
    pre_ordered: 'طلب مسبق',
    partnership: 'شراكة',
  } as Record<string, string>)[t] || t;

  return (
    <div className="p-6 text-right" dir="rtl">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-white flex items-center gap-3">
          <Search className="w-7 h-7 text-orange-500" />
          مسح / بحث سريع بـ VIN 🔍
        </h2>
        <p className="text-slate-400 text-sm mt-1">امسح الباركود أو أدخل الرقم التسلسلي للسيارة</p>
      </div>

      <div className="bg-slate-800/50 rounded-2xl p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-3">
          <button
            onClick={openScanner}
            className="flex-1 md:flex-none px-6 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black flex items-center justify-center gap-3 text-lg"
          >
            <Camera className="w-6 h-6" />
            مسح VIN بالكاميرا
          </button>
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="أدخل VIN (17 خانة)"
              className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 font-bold tracking-wider"
              maxLength={17}
              onKeyDown={(e) => { if (e.key === 'Enter') lookup(vin); }}
            />
            <button
              onClick={() => lookup(vin)}
              disabled={loading}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-xl font-bold"
            >
              {loading ? '...' : 'بحث'}
            </button>
          </div>
        </div>
        {err && <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg text-sm">{err}</div>}
      </div>

      {result && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Car className="w-6 h-6 text-orange-500" />
                <h3 className="text-2xl font-black text-white">
                  {result.year} {result.make} {result.model}
                </h3>
              </div>
              <div className="text-sm text-slate-400 font-mono">VIN: {result.vin}</div>
            </div>
            <span
              className="px-4 py-2 rounded-lg text-sm font-bold text-white"
              style={{ background: result.statusColor || '#64748b' }}
            >
              {result.statusAr || result.statusLabel || '—'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="bg-slate-900/60 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
                <MapPin className="w-3 h-3" /> الموقع في الحضيرة
              </div>
              <div className="text-white font-bold">
                {result.locationCode ? `${result.locationCode} (منطقة ${result.locationZone})` : 'غير محدد'}
              </div>
            </div>

            <div className="bg-slate-900/60 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">الملكية</div>
              <div className="text-white font-bold">{ownershipLabel(result.ownershipType)}</div>
            </div>

            {result.ownerDealerName && (
              <div className="bg-slate-900/60 rounded-xl p-4 md:col-span-2">
                <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
                  <User className="w-3 h-3" /> التاجر المالك
                </div>
                <div className="text-white font-bold">
                  {result.ownerDealerName}
                  {result.ownerDealerPhone && <span className="text-slate-400 mr-2 font-mono text-sm">• {result.ownerDealerPhone}</span>}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => onOpenDetail?.(result.id)}
            className="w-full mt-6 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black"
          >
            فتح الملف الكامل للسيارة
          </button>
        </div>
      )}
    </div>
  );
}

export default QuickVINScan;
