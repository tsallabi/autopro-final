import React, { useEffect, useState } from 'react';
import { ArrowRight, Car, MapPin, Shield, FileText, Camera, History, Archive, Edit3, Loader2, LogIn, LogOut, X, Upload, AlertTriangle } from 'lucide-react';
import { authFetch } from '../../../context/StoreContext';

interface VehicleDetailProps {
  vehicleId: string;
  onBack: () => void;
  currentUserRole?: string;
}

export const VehicleDetail: React.FC<VehicleDetailProps> = ({ vehicleId, onBack, currentUserRole }) => {
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [newStatus, setNewStatus] = useState(''); const [statusReason, setStatusReason] = useState('');
  const [newLoc, setNewLoc] = useState('');
  const [archiveReason, setArchiveReason] = useState('');
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [photoType, setPhotoType] = useState('other');

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/yard/vehicles/${vehicleId}`);
      if (!res.ok) { setError('فشل تحميل البيانات'); setLoading(false); return; }
      const d = await res.json();
      setVehicle(d);
      setError(null);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    authFetch('/api/yard/statuses').then(r => r.json()).then(setStatuses).catch(() => {});
    authFetch('/api/yard/locations').then(r => r.json()).then(setLocations).catch(() => {});
  }, [vehicleId]);

  const action = async (url: string, body: any) => {
    setBusy(true);
    try {
      const r = await authFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const d = await r.json(); alert(d.error || 'فشلت العملية'); return; }
      await load();
    } finally { setBusy(false); }
  };

  const changeStatus = async () => {
    if (!newStatus || !statusReason) return;
    await action(`/api/yard/vehicles/${vehicleId}/change-status`, { toStatusId: newStatus, reason: statusReason });
    setShowStatusModal(false); setNewStatus(''); setStatusReason('');
  };
  const changeLocation = async () => {
    if (!newLoc) return;
    await action(`/api/yard/vehicles/${vehicleId}/change-location`, { toLocationId: newLoc });
    setShowLocationModal(false); setNewLoc('');
  };
  const archive = async () => {
    if (!archiveReason) return;
    await action(`/api/yard/vehicles/${vehicleId}/archive`, { reason: archiveReason });
    setShowArchiveModal(false); setArchiveReason('');
  };
  const uploadPhotos = async () => {
    if (!newPhotos.length) return;
    await action(`/api/yard/vehicles/${vehicleId}/photos`, { photos: newPhotos, photoType });
    setShowPhotoModal(false); setNewPhotos([]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const r = new FileReader();
      r.onload = () => { if (typeof r.result === 'string') setNewPhotos(p => [...p, r.result as string]); };
      r.readAsDataURL(f);
    }
  };

  if (loading) return <div className="p-8 text-center text-white"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;
  if (error) return <div className="p-8 text-rose-400">{error}</div>;
  if (!vehicle) return <div className="p-8 text-slate-400">لم يتم العثور على السيارة</div>;

  const ownershipLabel = vehicle.ownershipType === 'pre_ordered' ? 'طلب مسبق' : vehicle.ownershipType === 'partnership' ? 'شراكة' : 'مخزون';
  const ownershipColor = vehicle.ownershipType === 'pre_ordered' ? '#f59e0b' : vehicle.ownershipType === 'partnership' ? '#8b5cf6' : '#10b981';
  const entryPhotos = (vehicle.photos || []).filter((p: any) => p.photoType === 'entry');
  const exitPhotos = (vehicle.photos || []).filter((p: any) => p.photoType === 'exit');
  const otherPhotos = (vehicle.photos || []).filter((p: any) => !['entry', 'exit'].includes(p.photoType));
  const isAdmin = currentUserRole === 'admin';

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6" dir="rtl">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-2 text-sm font-bold">
            <ArrowRight className="w-4 h-4" /> رجوع للقائمة
          </button>
          <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <Car className="w-8 h-8 text-orange-500" />
            {vehicle.year || ''} {vehicle.make || ''} {vehicle.model || ''}
          </h2>
          <div className="text-emerald-400 font-mono text-sm mt-1" dir="ltr">{vehicle.vin}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowStatusModal(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><Edit3 className="w-4 h-4" /> تغيير الحالة</button>
          <button onClick={() => setShowLocationModal(true)} className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><MapPin className="w-4 h-4" /> نقل الموقع</button>
          <button onClick={() => setShowPhotoModal(true)} className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><Camera className="w-4 h-4" /> صور</button>
          {isAdmin && <button onClick={() => setShowArchiveModal(true)} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2"><Archive className="w-4 h-4" /> أرشفة</button>}
        </div>
      </div>

      {/* Status + ownership badge row */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-500 font-bold mb-2">الحالة الحالية</div>
          <div className="px-4 py-2 rounded-xl font-black inline-block" style={{ backgroundColor: (vehicle.statusColor || '#64748b') + '30', color: vehicle.statusColor || '#64748b', border: `2px solid ${vehicle.statusColor || '#64748b'}` }}>
            {vehicle.statusAr || vehicle.statusCode}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-500 font-bold mb-2">نوع الملكية</div>
          <div className="px-4 py-2 rounded-xl font-black inline-block" style={{ backgroundColor: ownershipColor + '30', color: ownershipColor, border: `2px solid ${ownershipColor}` }}>
            {ownershipLabel}
          </div>
          {vehicle.ownerDealerName && <div className="text-xs text-slate-400 mt-2">التاجر: <span className="font-bold text-white">{vehicle.ownerDealerName}</span></div>}
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <div className="text-xs text-slate-500 font-bold mb-2 flex items-center gap-1"><MapPin className="w-3 h-3" /> الموقع</div>
          <div className="font-black text-white text-lg">{vehicle.locationCode || '— بدون موقع —'}</div>
          {vehicle.locationZone && <div className="text-xs text-slate-400">المنطقة {vehicle.locationZone}</div>}
        </div>
      </div>

      {/* Info grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-black text-white mb-4">المعلومات الأساسية</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <InfoRow label="اللون" value={vehicle.color} />
          <InfoRow label="العداد" value={vehicle.mileage ? `${vehicle.mileage.toLocaleString()} ميل` : '-'} />
          <InfoRow label="رقم الحاوية" value={vehicle.containerNumber} />
          <InfoRow label="المصدر" value={vehicle.source} />
          <InfoRow label="رقم اللوت" value={vehicle.sourceLotNumber} />
          <InfoRow label="سعر الشراء" value={vehicle.purchasePrice ? `$${Number(vehicle.purchasePrice).toLocaleString()}` : '-'} />
          <InfoRow label="تاريخ الوصول" value={vehicle.arrivalDate ? new Date(vehicle.arrivalDate).toLocaleDateString('ar-EG') : '-'} />
          <InfoRow label="تاريخ الإنشاء" value={vehicle.createdAt ? new Date(vehicle.createdAt).toLocaleDateString('ar-EG') : '-'} />
          <InfoRow label="التأمين" value={vehicle.depositAmount ? `$${Number(vehicle.depositAmount).toLocaleString()}` : '-'} />
        </div>
        {vehicle.notes && <div className="mt-4 pt-4 border-t border-slate-800 text-sm"><div className="text-slate-500 font-bold mb-1">ملاحظات:</div><div className="text-white">{vehicle.notes}</div></div>}
      </div>

      {/* Photos */}
      {(entryPhotos.length > 0 || exitPhotos.length > 0 || otherPhotos.length > 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2"><Camera className="w-5 h-5" /> معرض الصور</h3>
          {entryPhotos.length > 0 && <PhotoSection title={`صور الدخول (${entryPhotos.length})`} icon={<LogIn className="w-4 h-4 text-emerald-500" />} photos={entryPhotos} />}
          {exitPhotos.length > 0 && <PhotoSection title={`صور الخروج (${exitPhotos.length})`} icon={<LogOut className="w-4 h-4 text-orange-500" />} photos={exitPhotos} />}
          {otherPhotos.length > 0 && <PhotoSection title={`صور أخرى (${otherPhotos.length})`} icon={<Camera className="w-4 h-4 text-teal-500" />} photos={otherPhotos} />}
        </div>
      )}

      {/* Status history */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2"><History className="w-5 h-5" /> سجل الحالات</h3>
        {(vehicle.statusLog || []).length === 0 ? (
          <div className="text-slate-500 text-sm">لا يوجد سجل</div>
        ) : (
          <div className="space-y-2">
            {vehicle.statusLog.map((log: any) => (
              <div key={log.id} className="bg-slate-800 rounded-xl p-3 flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-orange-500 mt-2" />
                <div className="flex-1">
                  <div className="font-bold text-white">
                    {log.fromStatusAr ? <>من <span className="text-slate-400">{log.fromStatusAr}</span> → </> : null}
                    <span className="text-emerald-400">{log.toStatusAr}</span>
                  </div>
                  <div className="text-slate-400 text-xs mt-1">{log.reason}</div>
                  <div className="text-slate-500 text-xs mt-1">{new Date(log.changedAt).toLocaleString('ar-EG')} — بواسطة {log.changedBy}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gate movements */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2"><FileText className="w-5 h-5" /> حركات البوابة</h3>
        {(vehicle.movements || []).length === 0 ? (
          <div className="text-slate-500 text-sm">لا توجد حركات</div>
        ) : (
          <div className="space-y-2">
            {vehicle.movements.map((m: any) => (
              <div key={m.id} className={`rounded-xl p-4 ${m.movementType === 'IN' ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-orange-500/10 border border-orange-500/30'}`}>
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    {m.movementType === 'IN' ? <LogIn className="w-5 h-5 text-emerald-500" /> : <LogOut className="w-5 h-5 text-orange-500" />}
                    <div>
                      <div className="font-black text-white">{m.movementType === 'IN' ? 'دخول' : 'خروج'}</div>
                      <div className="text-xs text-slate-400">{new Date(m.timestamp).toLocaleString('ar-EG')}</div>
                    </div>
                  </div>
                  {m.gatePassNumber && <div className="font-mono font-black text-emerald-400 text-sm">{m.gatePassNumber}</div>}
                </div>
                {m.receiverName && (
                  <div className="mt-3 pt-3 border-t border-slate-700/50 text-xs text-slate-300 space-y-1">
                    <div>المستلم: <span className="text-white font-bold">{m.receiverName}</span></div>
                    {m.receiverPhone && <div>الهاتف: <span className="text-white">{m.receiverPhone}</span></div>}
                    {m.receiverIdNumber && <div>الهوية: <span className="text-white font-mono">{m.receiverIdNumber}</span></div>}
                  </div>
                )}
                {m.notes && <div className="text-xs text-slate-400 mt-2">{m.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODALS ─── */}
      {showStatusModal && (
        <Modal onClose={() => setShowStatusModal(false)} title="تغيير الحالة">
          <select value={newStatus} onChange={e => setNewStatus(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white mb-3">
            <option value="">-- اختر حالة --</option>
            {statuses.map((s: any) => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
          </select>
          <textarea placeholder="سبب التغيير" value={statusReason} onChange={e => setStatusReason(e.target.value)} rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white mb-3" />
          <button onClick={changeStatus} disabled={busy || !newStatus || !statusReason} className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-slate-800 text-white py-2.5 rounded-xl font-black">{busy ? 'جارٍ...' : 'تأكيد'}</button>
        </Modal>
      )}

      {showLocationModal && (
        <Modal onClose={() => setShowLocationModal(false)} title="نقل إلى موقع آخر">
          <select value={newLoc} onChange={e => setNewLoc(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white mb-3">
            <option value="">-- اختر موقع --</option>
            {locations.filter((l: any) => !l.isOccupied || l.id === vehicle.yardLocationId).map((l: any) => <option key={l.id} value={l.id}>{l.code} ({l.zone})</option>)}
          </select>
          <button onClick={changeLocation} disabled={busy || !newLoc} className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-slate-800 text-white py-2.5 rounded-xl font-black">{busy ? 'جارٍ...' : 'نقل'}</button>
        </Modal>
      )}

      {showArchiveModal && (
        <Modal onClose={() => setShowArchiveModal(false)} title="أرشفة السيارة">
          <div className="bg-rose-500/20 border border-rose-500 rounded-xl p-3 text-rose-200 text-xs font-bold mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> لا يمكن التراجع عن الأرشفة
          </div>
          <textarea placeholder="سبب الأرشفة" value={archiveReason} onChange={e => setArchiveReason(e.target.value)} rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white mb-3" />
          <button onClick={archive} disabled={busy || !archiveReason} className="w-full bg-rose-600 hover:bg-rose-700 disabled:bg-slate-800 text-white py-2.5 rounded-xl font-black">{busy ? 'جارٍ...' : 'أرشفة'}</button>
        </Modal>
      )}

      {showPhotoModal && (
        <Modal onClose={() => setShowPhotoModal(false)} title="رفع صور">
          <select value={photoType} onChange={e => setPhotoType(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white mb-3">
            <option value="entry">دخول</option>
            <option value="exit">خروج</option>
            <option value="damage">تلف</option>
            <option value="other">أخرى</option>
          </select>
          <label className="block border-2 border-dashed border-slate-700 rounded-xl p-6 text-center cursor-pointer mb-3">
            <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />
            <Upload className="w-8 h-8 text-slate-500 mx-auto" />
            <div className="text-xs text-slate-400 mt-2">{newPhotos.length} صورة</div>
          </label>
          {newPhotos.length > 0 && (
            <div className="grid grid-cols-4 gap-1 mb-3">
              {newPhotos.map((p, i) => <img key={i} src={p} className="aspect-square object-cover rounded" alt="" />)}
            </div>
          )}
          <button onClick={uploadPhotos} disabled={busy || !newPhotos.length} className="w-full bg-teal-500 hover:bg-teal-600 disabled:bg-slate-800 text-white py-2.5 rounded-xl font-black">{busy ? 'جارٍ...' : 'رفع'}</button>
        </Modal>
      )}
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-slate-500 font-bold">{label}</div>
      <div className="text-white font-bold mt-0.5">{value || '-'}</div>
    </div>
  );
}

function PhotoSection({ title, icon, photos }: { title: string; icon: React.ReactNode; photos: any[] }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-black text-slate-300 mb-2 flex items-center gap-2">{icon} {title}</div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {photos.map((p: any) => (
          <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="aspect-square bg-slate-800 rounded-lg overflow-hidden hover:ring-2 ring-orange-500">
            <img src={p.url} className="w-full h-full object-cover" alt={p.photoType} />
          </a>
        ))}
      </div>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black text-white text-lg">{title}</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default VehicleDetail;
