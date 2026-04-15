import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { X, Camera, Keyboard, Zap, ZapOff } from 'lucide-react';

interface VINScannerProps {
  onScan: (vin: string) => void;
  onCancel: () => void;
  onManualEntry: () => void;
}

export const VINScanner: React.FC<VINScannerProps> = ({ onScan, onCancel, onManualEntry }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(true);
  const [detectedVIN, setDetectedVIN] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  // VIN validation
  const isValidVIN = (v: string): boolean => {
    if (!v || v.length !== 17) return false;
    if (/[IOQioq]/.test(v)) return false;
    return /^[A-HJ-NPR-Z0-9]{17}$/i.test(v);
  };

  useEffect(() => {
    if (!scanning) return;
    const reader = new BrowserMultiFormatReader();

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, _err, controls) => {
      if (controls) controlsRef.current = controls;
      if (result) {
        const text = result.getText().toUpperCase().trim();
        // Extract VIN from text (could have prefix like "I:" for NHTSA barcode)
        const vinMatch = text.match(/[A-HJ-NPR-Z0-9]{17}/i);
        if (vinMatch && isValidVIN(vinMatch[0])) {
          setDetectedVIN(vinMatch[0].toUpperCase());
          setScanning(false);
          controls?.stop();
          // Haptic + sound feedback
          if ('vibrate' in navigator) navigator.vibrate(200);
          try { new Audio('data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YRAAAABmZmZmZmZmZmZmZmZmZmZm').play(); } catch {}
        }
      }
    }).catch((e) => {
      console.error('[VINScanner] camera error', e);
      setError('لا يمكن الوصول للكاميرا. تأكد من الإذن أو استخدم الإدخال اليدوي.');
    });

    return () => { controlsRef.current?.stop(); };
  }, [scanning]);

  const toggleTorch = async () => {
    try {
      const stream = (videoRef.current?.srcObject as MediaStream);
      const track = stream?.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          await track.applyConstraints({ advanced: [{ torch: !torchOn }] as any });
          setTorchOn(!torchOn);
        }
      }
    } catch {}
  };

  const handleConfirm = () => { if (detectedVIN) onScan(detectedVIN); };
  const handleRescan = () => { setDetectedVIN(null); setScanning(true); };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col" dir="rtl">
      <div className="flex justify-between items-center p-4 bg-slate-900/95 text-white border-b border-slate-800">
        <h3 className="font-black text-lg flex items-center gap-2"><Camera className="w-5 h-5" /> مسح VIN</h3>
        <button onClick={onCancel} className="p-2 hover:bg-slate-800 rounded-full"><X className="w-6 h-6" /></button>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white p-6 text-center">
          <div className="text-rose-400 mb-4">{error}</div>
          <button onClick={onManualEntry} className="bg-orange-500 hover:bg-orange-600 px-8 py-3 rounded-xl font-black flex items-center gap-2">
            <Keyboard className="w-5 h-5" /> إدخال يدوي
          </button>
        </div>
      ) : detectedVIN ? (
        <div className="flex-1 flex flex-col items-center justify-center text-white p-6">
          <div className="bg-emerald-500/20 border-2 border-emerald-500 rounded-2xl p-8 max-w-md w-full text-center">
            <div className="text-6xl mb-4">✅</div>
            <div className="text-sm text-emerald-300 font-bold mb-2">تم اكتشاف VIN</div>
            <div className="text-2xl font-black font-mono tracking-wider text-white mb-6 break-all" dir="ltr">{detectedVIN}</div>
            <div className="text-xs text-amber-300 mb-6">⚠️ تأكد من الرقم قبل المتابعة</div>
            <div className="flex gap-3">
              <button onClick={handleRescan} className="flex-1 bg-slate-700 hover:bg-slate-600 py-3 rounded-xl font-black">🔄 إعادة المسح</button>
              <button onClick={handleConfirm} className="flex-1 bg-emerald-500 hover:bg-emerald-600 py-3 rounded-xl font-black">✅ تأكيد</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 relative overflow-hidden">
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-11/12 max-w-lg aspect-[4/1] border-4 border-orange-500 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                <div className="absolute -top-8 left-0 right-0 text-center text-white font-bold text-sm">ضع VIN داخل الإطار</div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-slate-900/95 flex gap-3">
            <button onClick={toggleTorch} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2">
              {torchOn ? <ZapOff className="w-5 h-5" /> : <Zap className="w-5 h-5" />} {torchOn ? 'إطفاء الإضاءة' : 'إضاءة'}
            </button>
            <button onClick={onManualEntry} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-black flex items-center justify-center gap-2">
              <Keyboard className="w-5 h-5" /> إدخال يدوي
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default VINScanner;
