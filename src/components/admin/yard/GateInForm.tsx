import React, { useEffect, useState } from 'react';
import { Camera, Keyboard, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Upload, Loader2, Package, MapPin, X } from 'lucide-react';
import { authFetch } from '../../../context/StoreContext';
import { VINScanner } from '../../yard/VINScanner';
import { CameraCapture } from '../../CameraCapture';

interface GateInFormProps {
  onBack: () => void;
  onSuccess: (vehicleId: string, vin: string) => void;
}

type Step = 'vin' | 'details' | 'photos' | 'done';

export const GateInForm: React.FC<GateInFormProps> = ({ onBack, onSuccess }) => {
  const [step, setStep] = useState<Step>('vin');
  const [showScanner, setShowScanner] = useState(false);
  const [vin, setVin] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [checkingVin, setCheckingVin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [dealers, setDealers] = useState<any[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [gatePass, setGatePass] = useState<string | null>(null);

  const [form, setForm] = useState({
    make: '', model: '', year: '' as any, color: '', mileage: '' as any,
    containerNumber: '', source: 'copart', sourceLotNumber: '', sourceUrl: '',
    purchasePrice: '' as any, ownershipType: 'stock', ownerDealerId: '',
    depositAmount: '' as any, yardLocationId: '', notes: '',
  });

  useEffect(() => {
    authFetch('/api/yard/locations').then(r => r.json()).then(setLocations).catch(() => {});
    authFetch('/api/yard/dealers').then(r => r.json()).then(setDealers).catch(() => {});
  }, []);

  const isValidVIN = (v: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v.toUpperCase()) && !/[IOQ]/.test(v.toUpperCase());

  const checkVin = async (candidate: string) => {
    setCheckingVin(true); setError(null);
    const clean = candidate.toUpperCase().trim();
    if (!isValidVIN(clean)) {
      setError('VIN غير صالح — 17 حرف/رقم بدون I/O/Q');
      setCheckingVin(false);
      return;
    }
    try {
      // Check if exists
      const exists = await authFetch(`/api/yard/vehicles/by-vin/${clean}`);
      if (exists.ok) {
        const v = await exists.json();
        setError(`هذه السيارة مسجلة مسبقاً في الحضيرة — الحالة: ${v.statusAr || v.statusCode}`);
        setCheckingVin(false);
        return;
      }
      // Auto-decode via NHTSA
      try {
        const decRes = await authFetch(`/api/yard/vin/decode/${clean}`);
        if (decRes.ok) {
          const d = await decRes.json();
          setForm(f => ({ ...f, make: d.make || f.make, model: d.model || f.model, year: d.year || f.year }));
        }
      } catch {}
      setVin(clean);
      setStep('details');
    } catch (e: any) {
      setError(e.message || 'خطأ في الشبكة');
    } finally {
      setCheckingVin(false);
    }
  };

  const handleScan = (scannedVin: string) => {
    setShowScanner(false);
    checkVin(scannedVin);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPhotos(p => [...p, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (i: number) => setPhotos(p => p.filter((_, idx) => idx !== i));

  const submit = async () => {
    setSubmitting(true); setError(null);
    try {
      const payload: any = {
        vin,
        ...form,
        year: form.year ? Number(form.year) : null,
        mileage: form.mileage ? Number(form.mileage) : null,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : 0,
        depositAmount: form.depositAmount ? Number(form.depositAmount) : 0,
        entryPhotos: photos,
      };
      const res = await authFetch('/api/yard/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'فشلت العملية');
        setSubmitting(false);
        return;
      }
      setCreatedId(data.id);
      setGatePass(`GP-${Date.now().toString(36).toUpperCase()}`);
      setStep('done');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (showScanner) {
    return <VINScanner onScan={handleScan} onCancel={() => setShowScanner(false)} onManualEntry={() => { setShowScanner(false); setManualMode(true); }} />;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <Package className="w-8 h-8 text-emerald-500" />
            إدخال سيارة جديدة (Gate-In)
          </h2>
          <p className="text-slate-400 font-bold text-sm mt-1">تسجيل دخول سيارة للحضيرة</p>
        </div>
        <button onClick={onBack} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center gap-2">
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2">
        {(['vin', 'details', 'photos', 'done'] as Step[]).map((s, i) => (
          <div key={s} className={`flex-1 h-2 rounded-full transition-all ${step === s ? 'bg-emerald-500' : (['vin','details','photos','done'].indexOf(step) > i ? 'bg-emerald-700' : 'bg-slate-700')}`} />
        ))}
      </div>

      {error && (
        <div className="bg-rose-500/20 border-2 border-rose-500 text-rose-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="font-bold">{error}</span>
        </div>
      )}

      {/* STEP 1: VIN */}
      {step === 'vin' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h3 className="text-xl font-black text-white">الخطوة 1: مسح أو إدخال VIN</h3>
          {!manualMode ? (
            <div className="grid md:grid-cols-2 gap-4">
              <button onClick={() => setShowScanner(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl p-8 font-black text-lg flex flex-col items-center gap-3 transition-all">
                <Camera className="w-12 h-12" />
                <span>مسح بالكاميرا</span>
                <span className="text-xs opacity-80 font-normal">الأسرع والأدق</span>
              </button>
              <button onClick={() => setManualMode(true)} className="bg-slate-800 hover:bg-slate-700 text-white rounded-2xl p-8 font-black text-lg flex flex-col items-center gap-3 transition-all border-2 border-slate-700">
                <Keyboard className="w-12 h-12" />
                <span>إدخال يدوي</span>
                <span className="text-xs opacity-80 font-normal">كتابة 17 حرف</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-black text-slate-300 mb-2 block">VIN (17 حرف، بدون I/O/Q)</span>
                <input
                  autoFocus
                  value={vin}
                  onChange={e => setVin(e.target.value.toUpperCase())}
                  maxLength={17}
                  className="w-full bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-4 text-white font-mono tracking-wider text-xl"
                  dir="ltr"
                  placeholder="1HGBH41JXMN109186"
                />
                <div className="flex justify-between text-xs mt-1">
                  <span className={isValidVIN(vin) ? 'text-emerald-400' : 'text-slate-500'}>{vin.length}/17</span>
                  {isValidVIN(vin) && <span className="text-emerald-400 font-bold">✓ صحيح</span>}
                </div>
              </label>
              <div className="flex gap-3">
                <button onClick={() => { setManualMode(false); setVin(''); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-black">
                  <Camera className="w-5 h-5 inline-block ml-2" /> استخدم الكاميرا
                </button>
                <button
                  onClick={() => checkVin(vin)}
                  disabled={!isValidVIN(vin) || checkingVin}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2"
                >
                  {checkingVin ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowLeft className="w-5 h-5" />}
                  متابعة
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: Details */}
      {step === 'details' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-xl font-black text-white">الخطوة 2: تفاصيل السيارة</h3>
            <div className="text-xs text-emerald-400 font-mono mt-1" dir="ltr">{vin}</div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="الصانع" value={form.make} onChange={v => setForm(f => ({ ...f, make: v }))} />
            <Field label="الموديل" value={form.model} onChange={v => setForm(f => ({ ...f, model: v }))} />
            <Field label="السنة" value={form.year} onChange={v => setForm(f => ({ ...f, year: v }))} type="number" />
            <Field label="اللون" value={form.color} onChange={v => setForm(f => ({ ...f, color: v }))} />
            <Field label="العداد (ميل)" value={form.mileage} onChange={v => setForm(f => ({ ...f, mileage: v }))} type="number" />
            <Field label="رقم الحاوية" value={form.containerNumber} onChange={v => setForm(f => ({ ...f, containerNumber: v }))} />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs font-black text-slate-300 mb-1 block">المصدر</span>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
                <option value="copart">Copart</option>
                <option value="iaai">IAAI</option>
                <option value="manheim">Manheim</option>
                <option value="acv">ACV</option>
                <option value="adesa">ADESA</option>
                <option value="other">أخرى</option>
              </select>
            </label>
            <Field label="رقم اللوت" value={form.sourceLotNumber} onChange={v => setForm(f => ({ ...f, sourceLotNumber: v }))} />
            <Field label="سعر الشراء ($)" value={form.purchasePrice} onChange={v => setForm(f => ({ ...f, purchasePrice: v }))} type="number" />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <label className="block">
              <span className="text-xs font-black text-slate-300 mb-1 block">نوع الملكية</span>
              <select value={form.ownershipType} onChange={e => setForm(f => ({ ...f, ownershipType: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
                <option value="stock">مخزون (Stock)</option>
                <option value="pre_ordered">طلب مسبق (Pre-Ordered)</option>
                <option value="partnership">شراكة (Partnership)</option>
              </select>
            </label>
            {(form.ownershipType === 'pre_ordered' || form.ownershipType === 'partnership') && (
              <label className="block">
                <span className="text-xs font-black text-slate-300 mb-1 block">التاجر المالك *</span>
                <select value={form.ownerDealerId} onChange={e => setForm(f => ({ ...f, ownerDealerId: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
                  <option value="">-- اختر تاجر --</option>
                  {dealers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
            )}
            <Field label="مبلغ التأمين ($)" value={form.depositAmount} onChange={v => setForm(f => ({ ...f, depositAmount: v }))} type="number" />
          </div>

          <label className="block">
            <span className="text-xs font-black text-slate-300 mb-1 block flex items-center gap-2"><MapPin className="w-4 h-4" /> موقع الحضيرة</span>
            <select value={form.yardLocationId} onChange={e => setForm(f => ({ ...f, yardLocationId: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
              <option value="">-- اختر موقع --</option>
              {locations.filter((l: any) => !l.isOccupied).map((l: any) => (
                <option key={l.id} value={l.id}>{l.code} (المنطقة {l.zone})</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-black text-slate-300 mb-1 block">ملاحظات</span>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white" />
          </label>

          <div className="flex gap-3 pt-4">
            <button onClick={() => setStep('vin')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-black">رجوع</button>
            <button
              onClick={() => setStep('photos')}
              disabled={!form.make || !form.model || (form.ownershipType !== 'stock' && !form.ownerDealerId)}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white py-3 rounded-xl font-black"
            >
              متابعة للصور <ArrowLeft className="w-5 h-5 inline-block mr-2" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Photos */}
      {step === 'photos' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <div>
            <h3 className="text-xl font-black text-white">الخطوة 3: صور الدخول</h3>
            <p className="text-xs text-slate-400 font-bold mt-1">مطلوب 4-6 صور على الأقل (أمام، خلف، يمين، يسار، داخلية، عداد)</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowCamera(true)}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-orange-500/60 hover:border-orange-500 bg-orange-500/5 hover:bg-orange-500/10 rounded-xl p-6 transition-all"
            >
              <Camera className="w-10 h-10 text-orange-500" />
              <div className="font-black text-white">التقط بالكاميرا</div>
              <div className="text-xs text-slate-400 font-bold">متعدد الصور</div>
            </button>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-6 text-center cursor-pointer transition-all">
              <input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoUpload} className="hidden" />
              <Upload className="w-10 h-10 text-slate-500" />
              <div className="font-black text-white">رفع من الجهاز</div>
              <div className="text-xs text-slate-500 font-bold">{photos.length} صورة تم رفعها</div>
            </label>
          </div>

          {showCamera && (
            <CameraCapture
              overlayGuide="vehicle-side"
              allowMultiple={true}
              maxPhotos={12}
              onCapture={(url) => setPhotos(p => [...p, url])}
              onCancel={() => setShowCamera(false)}
            />
          )}

          {photos.length > 0 && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square bg-slate-800 rounded-xl overflow-hidden group">
                  <img src={p} alt={`photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button onClick={() => removePhoto(i)} className="absolute top-1 left-1 bg-rose-500 hover:bg-rose-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button onClick={() => setStep('details')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-black">رجوع</button>
            <button
              onClick={submit}
              disabled={submitting || photos.length < 1}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-500 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              تسجيل الدخول
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === 'done' && createdId && (
        <div className="bg-emerald-500/10 border-2 border-emerald-500 rounded-2xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto" />
          <h3 className="text-2xl font-black text-white">تم تسجيل الدخول بنجاح!</h3>
          <div className="font-mono text-lg text-emerald-300" dir="ltr">{vin}</div>
          {gatePass && <div className="text-sm text-slate-300">رقم التصريح: <span className="font-mono font-black">{gatePass}</span></div>}
          <div className="flex gap-3 justify-center pt-4">
            <button onClick={() => onSuccess(createdId, vin)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-black">عرض السيارة</button>
            <button onClick={() => { setStep('vin'); setVin(''); setForm({ make: '', model: '', year: '', color: '', mileage: '', containerNumber: '', source: 'copart', sourceLotNumber: '', sourceUrl: '', purchasePrice: '', ownershipType: 'stock', ownerDealerId: '', depositAmount: '', yardLocationId: '', notes: '' }); setPhotos([]); setCreatedId(null); setManualMode(false); }} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-black">سيارة جديدة</button>
          </div>
        </div>
      )}
    </div>
  );
};

function Field({ label, value, onChange, type = 'text' }: { label: string; value: any; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black text-slate-300 mb-1 block">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white" />
    </label>
  );
}

export default GateInForm;
