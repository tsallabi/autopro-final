import React, { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, Upload, Loader2, LogOut, X, Printer, ShieldAlert } from 'lucide-react';
import { authFetch } from '../../../context/StoreContext';
import { VINScanner } from '../../yard/VINScanner';
import { CameraCapture } from '../../CameraCapture';

interface GateOutFormProps {
  onBack: () => void;
  onSuccess: (gatePassNumber: string) => void;
}

type Step = 'vin' | 'review' | 'receiver' | 'photos' | 'done';

export const GateOutForm: React.FC<GateOutFormProps> = ({ onBack, onSuccess }) => {
  const [step, setStep] = useState<Step>('vin');
  const [showScanner, setShowScanner] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [vinInput, setVinInput] = useState('');
  const [vehicle, setVehicle] = useState<any>(null);
  const [dealers, setDealers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [gatePassNumber, setGatePassNumber] = useState<string | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sigDataUrl, setSigDataUrl] = useState<string>('');
  const [drawing, setDrawing] = useState(false);

  const [receiver, setReceiver] = useState({
    receiverName: '', receiverPhone: '', receiverIdNumber: '',
    receiverIdPhoto: '', authorizedFor: '', notes: '',
  });

  const isValidVIN = (v: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v.toUpperCase()) && !/[IOQ]/.test(v.toUpperCase());

  useEffect(() => {
    authFetch('/api/yard/dealers').then(r => r.json()).then(setDealers).catch(() => {});
  }, []);

  const loadVehicle = async (vin: string) => {
    setLoading(true); setError(null); setWarning(null);
    try {
      const res = await authFetch(`/api/yard/vehicles/by-vin/${vin.toUpperCase()}`);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'VIN غير مسجل');
        setLoading(false);
        return;
      }
      const v = await res.json();
      setVehicle(v);
      setReceiver(r => ({ ...r, authorizedFor: v.ownershipType === 'pre_ordered' ? v.ownerDealerId : '' }));
      // Warnings
      const allowedStatuses = ['sold_pending_delivery', 'withdrawn_by_dealer', 'delivered_to_dealer'];
      if (!allowedStatuses.includes(v.statusCode)) {
        setWarning(`⚠️ حالة السيارة الحالية (${v.statusAr}) لا تسمح بالخروج. يجب أن تكون: مباعة، مسحوبة من التاجر، أو جاهزة للتسليم.`);
      }
      setStep('review');
    } catch (e: any) {
      setError(e.message || 'خطأ في الشبكة');
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (vin: string) => { setShowScanner(false); loadVehicle(vin); };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const r = new FileReader();
      r.onload = () => { if (typeof r.result === 'string') setPhotos(p => [...p, r.result as string]); };
      r.readAsDataURL(f);
    }
  };

  // Signature pad
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    setDrawing(true);
    const canvas = sigCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    const pos = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    ctx.beginPath();
    ctx.moveTo((pos.clientX - rect.left) * canvas.width / rect.width, (pos.clientY - rect.top) * canvas.height / rect.height);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    const canvas = sigCanvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    const pos = 'touches' in e ? e.touches[0] : (e as React.MouseEvent);
    ctx.lineTo((pos.clientX - rect.left) * canvas.width / rect.width, (pos.clientY - rect.top) * canvas.height / rect.height);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  const endDraw = () => {
    setDrawing(false);
    const canvas = sigCanvasRef.current;
    if (canvas) setSigDataUrl(canvas.toDataURL('image/png'));
  };
  const clearSig = () => {
    const canvas = sigCanvasRef.current; if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setSigDataUrl('');
  };

  const submit = async () => {
    if (!vehicle) return;
    setSubmitting(true); setError(null);
    try {
      const payload = {
        ...receiver,
        receiverSignature: sigDataUrl,
        exitPhotos: photos,
      };
      const res = await authFetch(`/api/yard/vehicles/${vehicle.id}/gate-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.securityIncident) {
          setError(`🚨 ${data.error}\nرقم الحادثة الأمنية: ${data.securityIncident}`);
        } else {
          setError(data.error || 'فشلت العملية');
        }
        setSubmitting(false);
        return;
      }
      setGatePassNumber(data.gatePassNumber);
      setStep('done');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const printGatePass = () => {
    if (!gatePassNumber || !vehicle) return;
    const html = `
      <html dir="rtl"><head><title>تصريح خروج ${gatePassNumber}</title>
      <style>
        body { font-family: 'Cairo', sans-serif; padding: 40px; max-width: 700px; margin: 0 auto; }
        h1 { color: #10b981; border-bottom: 3px solid #10b981; padding-bottom: 10px; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ddd; }
        .lbl { font-weight: bold; color: #555; }
        .val { font-family: monospace; }
        .big { font-size: 28px; color: #10b981; text-align: center; padding: 20px; border: 3px dashed #10b981; margin: 20px 0; }
      </style></head><body>
      <h1>تصريح خروج من الحضيرة</h1>
      <div class="big">${gatePassNumber}</div>
      <div class="row"><span class="lbl">VIN:</span><span class="val">${vehicle.vin}</span></div>
      <div class="row"><span class="lbl">المركبة:</span><span>${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}</span></div>
      <div class="row"><span class="lbl">المستلم:</span><span>${receiver.receiverName}</span></div>
      <div class="row"><span class="lbl">رقم الهوية:</span><span>${receiver.receiverIdNumber}</span></div>
      <div class="row"><span class="lbl">الهاتف:</span><span>${receiver.receiverPhone || '-'}</span></div>
      <div class="row"><span class="lbl">التاريخ:</span><span>${new Date().toLocaleString('ar-EG')}</span></div>
      ${sigDataUrl ? `<div style="margin-top:30px;"><div class="lbl">توقيع المستلم:</div><img src="${sigDataUrl}" style="border:1px solid #ccc; background:#fff; max-width:300px;" /></div>` : ''}
      <p style="margin-top:40px; text-align:center; color:#999; font-size:12px;">AutoPro Yard Management — ${new Date().toISOString()}</p>
      </body></html>
    `;
    const w = window.open('', '_blank', 'width=800,height=900');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
  };

  if (showScanner) {
    return <VINScanner onScan={handleScan} onCancel={() => setShowScanner(false)} onManualEntry={() => { setShowScanner(false); setManualMode(true); }} />;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white flex items-center gap-3">
            <LogOut className="w-8 h-8 text-orange-500" />
            إخراج سيارة (Gate-Out)
          </h2>
          <p className="text-slate-400 font-bold text-sm mt-1">تسليم سيارة للمشتري أو التاجر</p>
        </div>
        <button onClick={onBack} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold flex items-center gap-2">
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>
      </div>

      <div className="flex gap-2">
        {(['vin', 'review', 'receiver', 'photos', 'done'] as Step[]).map((s, i) => (
          <div key={s} className={`flex-1 h-2 rounded-full transition-all ${step === s ? 'bg-orange-500' : (['vin','review','receiver','photos','done'].indexOf(step) > i ? 'bg-orange-700' : 'bg-slate-700')}`} />
        ))}
      </div>

      {error && (
        <div className="bg-rose-500/20 border-2 border-rose-500 text-rose-200 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 flex-shrink-0" />
          <pre className="font-bold whitespace-pre-wrap text-sm">{error}</pre>
        </div>
      )}
      {warning && (
        <div className="bg-amber-500/20 border-2 border-amber-500 text-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <span className="font-bold text-sm">{warning}</span>
        </div>
      )}

      {/* STEP: VIN */}
      {step === 'vin' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <h3 className="text-xl font-black text-white">الخطوة 1: تحديد السيارة</h3>
          {!manualMode ? (
            <div className="grid md:grid-cols-2 gap-4">
              <button onClick={() => setShowScanner(true)} className="bg-orange-500 hover:bg-orange-600 text-white rounded-2xl p-8 font-black text-lg flex flex-col items-center gap-3">
                <Camera className="w-12 h-12" />
                <span>مسح VIN بالكاميرا</span>
              </button>
              <button onClick={() => setManualMode(true)} className="bg-slate-800 hover:bg-slate-700 text-white rounded-2xl p-8 font-black text-lg flex flex-col items-center gap-3 border-2 border-slate-700">
                <Keyboard className="w-12 h-12" /><span>إدخال يدوي</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <input
                autoFocus value={vinInput} onChange={e => setVinInput(e.target.value.toUpperCase())} maxLength={17}
                className="w-full bg-slate-800 border-2 border-slate-700 focus:border-orange-500 rounded-xl px-4 py-4 text-white font-mono tracking-wider text-xl" dir="ltr" placeholder="1HGBH41JXMN109186"
              />
              <div className="flex gap-3">
                <button onClick={() => { setManualMode(false); setVinInput(''); }} className="flex-1 bg-slate-700 text-white py-3 rounded-xl font-black">كاميرا</button>
                <button onClick={() => loadVehicle(vinInput)} disabled={!isValidVIN(vinInput) || loading} className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowLeft className="w-5 h-5" />} بحث
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP: Review */}
      {step === 'review' && vehicle && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-xl font-black text-white">الخطوة 2: مراجعة بيانات السيارة</h3>
          <div className="bg-slate-800 rounded-xl p-4 space-y-2 text-sm">
            <Row label="VIN" val={vehicle.vin} mono />
            <Row label="المركبة" val={`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`} />
            <Row label="اللون" val={vehicle.color || '-'} />
            <Row label="الموقع" val={vehicle.locationCode || '-'} />
            <Row label="الحالة" val={vehicle.statusAr || vehicle.statusCode} valColor={vehicle.statusColor} />
            <Row label="نوع الملكية" val={
              vehicle.ownershipType === 'pre_ordered' ? `طلب مسبق لـ ${vehicle.ownerDealerName || vehicle.ownerDealerId}` :
              vehicle.ownershipType === 'partnership' ? `شراكة — ${vehicle.ownerDealerName || ''}` : 'مخزون'
            } />
          </div>
          {vehicle.ownershipType === 'pre_ordered' && (
            <div className="bg-amber-500/10 border border-amber-500/50 rounded-xl p-4 text-amber-200 text-sm font-bold">
              ⚠️ هذه السيارة بطلب مسبق. يجب التسليم فقط للتاجر: <span className="font-mono">{vehicle.ownerDealerName || vehicle.ownerDealerId}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setStep('vin'); setVehicle(null); }} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-black">رجوع</button>
            <button onClick={() => setStep('receiver')} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-black">متابعة</button>
          </div>
        </div>
      )}

      {/* STEP: Receiver */}
      {step === 'receiver' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-xl font-black text-white">الخطوة 3: بيانات المستلم</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="اسم المستلم *" value={receiver.receiverName} onChange={v => setReceiver(r => ({ ...r, receiverName: v }))} />
            <Field label="رقم الهاتف" value={receiver.receiverPhone} onChange={v => setReceiver(r => ({ ...r, receiverPhone: v }))} />
            <Field label="رقم الهوية *" value={receiver.receiverIdNumber} onChange={v => setReceiver(r => ({ ...r, receiverIdNumber: v }))} />
            <label className="block">
              <span className="text-xs font-black text-slate-300 mb-1 block">مصرح له (تاجر)</span>
              <select value={receiver.authorizedFor} onChange={e => setReceiver(r => ({ ...r, authorizedFor: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white">
                <option value="">-- غير محدد --</option>
                {dealers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="text-xs font-black text-slate-300 mb-1 block">توقيع المستلم</span>
            <canvas
              ref={sigCanvasRef} width={600} height={150}
              className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl touch-none cursor-crosshair"
              onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
              onTouchStart={startDraw as any} onTouchMove={draw as any} onTouchEnd={endDraw}
            />
            <button onClick={clearSig} className="text-xs text-slate-400 mt-1 hover:text-white">مسح التوقيع</button>
          </div>
          <Field label="ملاحظات" value={receiver.notes} onChange={v => setReceiver(r => ({ ...r, notes: v }))} />
          <div className="flex gap-3 pt-4">
            <button onClick={() => setStep('review')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-black">رجوع</button>
            <button
              onClick={() => setStep('photos')}
              disabled={!receiver.receiverName || !receiver.receiverIdNumber}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-800 disabled:text-slate-500 text-white py-3 rounded-xl font-black"
            >
              متابعة للصور
            </button>
          </div>
        </div>
      )}

      {/* STEP: Photos */}
      {step === 'photos' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
          <h3 className="text-xl font-black text-white">الخطوة 4: صور الخروج</h3>
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
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-700 hover:border-orange-500 rounded-xl p-6 text-center cursor-pointer">
              <input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoUpload} className="hidden" />
              <Upload className="w-10 h-10 text-slate-500" />
              <div className="font-black text-white">رفع من الجهاز</div>
              <div className="text-xs text-slate-500 font-bold">{photos.length} صورة</div>
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
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => setPhotos(arr => arr.filter((_, idx) => idx !== i))} className="absolute top-1 left-1 bg-rose-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button onClick={() => setStep('receiver')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-black">رجوع</button>
            <button onClick={submit} disabled={submitting} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              تأكيد الخروج
            </button>
          </div>
        </div>
      )}

      {/* STEP: Done */}
      {step === 'done' && gatePassNumber && (
        <div className="bg-emerald-500/10 border-2 border-emerald-500 rounded-2xl p-8 text-center space-y-4">
          <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto" />
          <h3 className="text-2xl font-black text-white">تم الخروج بنجاح!</h3>
          <div className="bg-slate-900 rounded-2xl p-6">
            <div className="text-sm text-slate-400 mb-2">رقم تصريح الخروج</div>
            <div className="font-mono text-4xl text-emerald-400 font-black">{gatePassNumber}</div>
          </div>
          <div className="flex gap-3 justify-center pt-4 flex-wrap">
            <button onClick={printGatePass} className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-black flex items-center gap-2">
              <Printer className="w-5 h-5" /> طباعة التصريح
            </button>
            <button onClick={() => onSuccess(gatePassNumber)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-black">تم</button>
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
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="w-full bg-slate-800 border border-slate-700 focus:border-orange-500 rounded-xl px-3 py-2.5 text-white" />
    </label>
  );
}

function Row({ label, val, mono, valColor }: { label: string; val: any; mono?: boolean; valColor?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-400">{label}</span>
      <span className={`font-bold text-white ${mono ? 'font-mono' : ''}`} style={valColor ? { color: valColor } : undefined}>{val}</span>
    </div>
  );
}

export default GateOutForm;
