import React, { useEffect, useState } from 'react';
import { authFetch } from '../../../context/StoreContext';
import { MapPin, RefreshCw } from 'lucide-react';

// Row as returned from /api/yard/locations/map (joined parallel-agent shape)
interface LocRow {
  id: string;
  code: string;
  zone: string;
  rowNum: number;
  slotNum: number;
  isOccupied: number | boolean;
  currentVehicleId: string | null;
  currentVin?: string | null;
  currentMake?: string | null;
  currentModel?: string | null;
  currentYear?: number | null;
  statusAr?: string | null;
  statusColor?: string | null;
}

interface MapData {
  zones: Record<string, LocRow[]>;
  total?: number;
  occupied?: number;
}

const STATUS_LEGEND = [
  { code: 'entered_yard',          label: 'دخلت الحضيرة',              color: '#2563eb' },
  { code: 'listed_for_sale',       label: 'معروضة للبيع',             color: '#16a34a' },
  { code: 'reserved',              label: 'محجوزة',                    color: '#ca8a04' },
  { code: 'sold_pending_delivery', label: 'مباعة — انتظار التسليم',    color: '#ea580c' },
  { code: 'withdrawn_by_dealer',   label: 'جاهزة للاستلام',            color: '#c026d3' },
  { code: 'damaged',               label: 'تالفة',                     color: '#dc2626' },
];

export function YardMap({ onSelectVehicle }: { onSelectVehicle?: (id: string) => void }) {
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await authFetch('/api/yard/locations/map');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
    } catch (e: any) {
      setErr(e.message || 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const zones = data?.zones || {};
  const zoneKeys = Object.keys(zones).sort();

  return (
    <div className="p-6 text-right" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-3">
            <MapPin className="w-7 h-7 text-orange-500" />
            خريطة الحضيرة 🗺️
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            عرض مباشر للمواقع والسيارات
            {data && ` · ${data.occupied ?? '—'}/${data.total ?? '—'} مشغولة`}
          </p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center gap-2 text-sm font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-4">{err}</div>}

      {loading && !data && <div className="text-slate-400">جاري التحميل...</div>}

      <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold text-white mb-3">مفتاح الألوان</h3>
        <div className="flex flex-wrap gap-4">
          {STATUS_LEGEND.map(s => (
            <div key={s.code} className="flex items-center gap-2 text-xs text-slate-300">
              <div className="w-4 h-4 rounded" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <div className="w-4 h-4 rounded border border-slate-600 bg-slate-900" />
            <span>فارغ</span>
          </div>
        </div>
      </div>

      <div className="space-y-4 overflow-x-auto">
        {zoneKeys.map(zone => {
          const cells = zones[zone] || [];
          const occupied = cells.filter(c => c.isOccupied).length;
          return (
            <div key={zone} className="bg-slate-800/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-black text-orange-500">المنطقة {zone}</span>
                <span className="text-xs text-slate-400">({occupied}/{cells.length} مشغولة)</span>
              </div>
              <div className="grid grid-cols-10 gap-2 min-w-[720px]">
                {cells.map(cell => {
                  const isOcc = !!cell.isOccupied && !!cell.currentVehicleId;
                  const color = isOcc ? (cell.statusColor || '#64748b') : 'transparent';
                  const title = isOcc
                    ? `${cell.code} | ${cell.currentVin} | ${cell.currentYear || ''} ${cell.currentMake || ''} ${cell.currentModel || ''} | ${cell.statusAr || ''}`
                    : `${cell.code} — فارغ`;
                  return (
                    <button
                      key={cell.id}
                      title={title}
                      onClick={() => isOcc && cell.currentVehicleId && onSelectVehicle?.(cell.currentVehicleId)}
                      className={`relative aspect-square rounded-lg border-2 flex items-center justify-center text-[10px] font-bold transition-all ${
                        isOcc
                          ? 'border-transparent text-white hover:ring-2 hover:ring-orange-400 cursor-pointer'
                          : 'border-slate-700 bg-slate-900/60 text-slate-500'
                      }`}
                      style={{ background: isOcc ? color : undefined }}
                    >
                      <span className="truncate px-1">{cell.code.split('-')[1] || cell.code}</span>
                      {isOcc && (
                        <span className="absolute bottom-0 inset-x-0 text-[8px] bg-black/40 truncate px-1">
                          {cell.currentMake}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && zoneKeys.length === 0 && (
        <div className="text-center py-12 text-slate-400">لا توجد مواقع معرّفة</div>
      )}
    </div>
  );
}

export default YardMap;
