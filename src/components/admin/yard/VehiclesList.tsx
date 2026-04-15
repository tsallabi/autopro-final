import React, { useEffect, useState } from 'react';
import { Search, Car, MapPin, Filter, Loader2, LogIn, LogOut, Eye } from 'lucide-react';
import { authFetch } from '../../../context/StoreContext';

interface VehiclesListProps {
  onOpen: (id: string) => void;
  onGateIn: () => void;
  onGateOut: () => void;
}

export const VehiclesList: React.FC<VehiclesListProps> = ({ onOpen, onGateIn, onGateOut }) => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('');

  const load = async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (search) qs.set('search', search);
    if (statusFilter) qs.set('status', statusFilter);
    if (ownershipFilter) qs.set('ownership', ownershipFilter);
    try {
      const r = await authFetch(`/api/yard/vehicles?${qs}`);
      setVehicles(await r.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    authFetch('/api/yard/statuses').then(r => r.json()).then(setStatuses).catch(() => {});
  }, []);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search, statusFilter, ownershipFilter]);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6" dir="rtl">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <Car className="w-8 h-8 text-orange-500" /> سيارات الحضيرة
          </h2>
          <p className="text-slate-400 font-bold text-sm mt-1">{vehicles.length} سيارة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onGateIn} className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-black flex items-center gap-2">
            <LogIn className="w-5 h-5" /> إدخال
          </button>
          <button onClick={onGateOut} className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-black flex items-center gap-2">
            <LogOut className="w-5 h-5" /> إخراج
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 grid md:grid-cols-4 gap-3">
        <div className="relative md:col-span-2">
          <Search className="w-5 h-5 absolute right-3 top-3 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث VIN / الصانع / الموديل..." className="w-full bg-slate-800 border border-slate-700 rounded-xl pr-10 pl-3 py-2.5 text-white" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
          <option value="">كل الحالات</option>
          {statuses.map((s: any) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
        </select>
        <select value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
          <option value="">كل أنواع الملكية</option>
          <option value="stock">مخزون</option>
          <option value="pre_ordered">طلب مسبق</option>
          <option value="partnership">شراكة</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-500 mx-auto" /></div>
      ) : vehicles.length === 0 ? (
        <div className="text-center p-16 bg-slate-900 border border-slate-800 rounded-2xl">
          <Car className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <div className="text-slate-400 font-bold">لا توجد سيارات مطابقة</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {vehicles.map((v: any) => (
            <div key={v.id} className="bg-slate-900 border border-slate-800 hover:border-orange-500/50 rounded-2xl p-4 flex items-center gap-4 flex-wrap transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-emerald-400 font-black text-sm" dir="ltr">{v.vin}</span>
                  <span className="px-2 py-0.5 rounded-lg text-[10px] font-black" style={{ backgroundColor: (v.statusColor || '#64748b') + '30', color: v.statusColor || '#64748b' }}>{v.statusAr || v.statusCode}</span>
                  {v.ownershipType === 'pre_ordered' && <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-500/20 text-amber-400">طلب مسبق</span>}
                  {v.ownershipType === 'partnership' && <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-purple-500/20 text-purple-400">شراكة</span>}
                </div>
                <div className="text-white font-bold mt-1">{v.year || ''} {v.make || ''} {v.model || ''}</div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                  {v.locationCode && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {v.locationCode}</span>}
                  {v.color && <span>اللون: {v.color}</span>}
                  {v.source && <span>{v.source}</span>}
                  {v.ownerDealerName && <span>التاجر: {v.ownerDealerName}</span>}
                </div>
              </div>
              <button onClick={() => onOpen(v.id)} className="bg-slate-800 hover:bg-orange-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all">
                <Eye className="w-4 h-4" /> عرض
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VehiclesList;
