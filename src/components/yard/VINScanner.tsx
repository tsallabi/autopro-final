import React, { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { X, Camera, Keyboard, Zap, ZapOff, RefreshCw, HelpCircle, ChevronDown, ChevronUp, Lock } from 'lucide-react';

interface VINScannerProps {
  onScan: (vin: string) => void;
  onCancel: () => void;
  onManualEntry: () => void;
}

type CameraErrorKind =
  | 'permission-denied'
  | 'no-camera'
  | 'in-use'
  | 'over-constrained'
  | 'insecure-context'
  | 'unsupported'
  | 'unknown';

interface CameraError {
  kind: CameraErrorKind;
  title: string;
  detail: string;
  rawName?: string;
}

function classifyCameraError(e: any): CameraError {
  const name: string = e?.name || '';
  const message: string = e?.message || String(e || '');

  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return {
      kind: 'insecure-context',
      title: 'الموقع غير آمن (HTTP)',
      detail: 'الكاميرا تعمل فقط على HTTPS. افتح الموقع عبر https:// أو localhost.',
    };
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || /denied|permission/i.test(message)) {
    return {
      kind: 'permission-denied',
      title: 'إذن الكاميرا مرفوض',
      detail: 'سبق أن رفضت إذن الكاميرا لهذا الموقع. اتبع التعليمات لتفعيله.',
      rawName: name,
    };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      kind: 'no-camera',
      title: 'لم يتم العثور على كاميرا',
      detail: 'هذا الجهاز لا يحتوي على كاميرا متاحة. استخدم الإدخال اليدوي.',
      rawName: name,
    };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      kind: 'in-use',
      title: 'الكاميرا مستخدَمة من تطبيق آخر',
      detail: 'تطبيق آخر (واتساب، كاميرا، تليجرام...) يستخدم الكاميرا الآن. أغلقه ثم حاول مجدداً.',
      rawName: name,
    };
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return {
      kind: 'over-constrained',
      title: 'إعدادات الكاميرا غير مدعومة',
      detail: 'كاميرا الجهاز لا تدعم الإعدادات المطلوبة.',
      rawName: name,
    };
  }
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
    return {
      kind: 'unsupported',
      title: 'المتصفح لا يدعم الكاميرا',
      detail: 'استخدم متصفحاً حديثاً مثل Chrome أو Samsung Internet أو Safari.',
    };
  }
  return {
    kind: 'unknown',
    title: 'تعذّر الوصول للكاميرا',
    detail: message || 'سبب غير معروف. جرّب إعادة المحاولة أو استخدم الإدخال اليدوي.',
    rawName: name,
  };
}

type BrowserKind = 'chrome-android' | 'samsung-internet' | 'safari-ios' | 'firefox' | 'edge' | 'other';

function detectBrowser(): BrowserKind {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return 'samsung-internet';
  if (/EdgA?\//i.test(ua)) return 'edge';
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox';
  if (/CriOS|Chrome\//i.test(ua) && /Android/i.test(ua)) return 'chrome-android';
  if (/Safari/i.test(ua) && /(iPhone|iPad|iPod)/i.test(ua) && !/CriOS|FxiOS/i.test(ua)) return 'safari-ios';
  if (/Chrome\//i.test(ua)) return 'chrome-android';
  return 'other';
}

function getPermissionInstructions(browser: BrowserKind): { browserName: string; steps: string[] } {
  switch (browser) {
    case 'chrome-android':
      return {
        browserName: 'Chrome (أندرويد)',
        steps: [
          'اضغط على رمز القفل 🔒 (أو ⓘ) بجانب رابط الموقع في الأعلى',
          'اختر "Permissions" أو "أذونات"',
          'ابحث عن "Camera" أو "الكاميرا"',
          'غيّرها إلى "Allow" أو "السماح"',
          'أعد تحميل الصفحة (اسحب لأسفل)',
        ],
      };
    case 'samsung-internet':
      return {
        browserName: 'Samsung Internet',
        steps: [
          'اضغط على رمز القفل 🔒 بجانب رابط الموقع',
          'اضغط على "Permissions" أو "أذونات"',
          'فعّل "Camera" أو "الكاميرا"',
          'أو من القائمة (☰) → Settings → Sites and downloads → Site permissions → Camera',
          'أعد تحميل الصفحة',
        ],
      };
    case 'safari-ios':
      return {
        browserName: 'Safari (آيفون / آيباد)',
        steps: [
          'افتح تطبيق Settings (الإعدادات) في الجهاز',
          'انزل لـ Safari → Camera',
          'اختر "Allow" (السماح)',
          'ارجع لـ Safari وأعد تحميل الصفحة',
        ],
      };
    case 'firefox':
      return {
        browserName: 'Firefox',
        steps: [
          'اضغط على القفل 🔒 بجانب رابط الموقع',
          'اضغط على "Connection secure" أو "More information"',
          'اذهب لـ Permissions → Camera',
          'غيّرها إلى Allow',
          'أعد تحميل الصفحة',
        ],
      };
    case 'edge':
      return {
        browserName: 'Edge',
        steps: [
          'اضغط على القفل 🔒 بجانب رابط الموقع',
          'اختر "Permissions for this site"',
          'فعّل "Camera"',
          'أعد تحميل الصفحة',
        ],
      };
    default:
      return {
        browserName: 'متصفحك',
        steps: [
          'ابحث عن إعدادات الموقع في المتصفح (عادة بالضغط على القفل 🔒 بجانب الرابط)',
          'فعّل إذن الكاميرا (Camera)',
          'أعد تحميل الصفحة',
        ],
      };
  }
}

export const VINScanner: React.FC<VINScannerProps> = ({ onScan, onCancel, onManualEntry }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(true);
  const [detectedVIN, setDetectedVIN] = useState<string | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
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
        const vinMatch = text.match(/[A-HJ-NPR-Z0-9]{17}/i);
        if (vinMatch && isValidVIN(vinMatch[0])) {
          setDetectedVIN(vinMatch[0].toUpperCase());
          setScanning(false);
          controls?.stop();
          if ('vibrate' in navigator) navigator.vibrate(200);
          try { new Audio('data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YRAAAABmZmZmZmZmZmZmZmZmZmZm').play(); } catch {}
        }
      }
    }).catch((e) => {
      const classified = classifyCameraError(e);
      console.error('[VINScanner] camera error:', classified.kind, e);
      setError(classified);
    });

    return () => { controlsRef.current?.stop(); };
  }, [scanning, retryKey]);

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
  const handleRetry = () => {
    setError(null);
    setShowHelp(false);
    setScanning(true);
    setRetryKey(k => k + 1);
  };

  const browser = detectBrowser();
  const instructions = error?.kind === 'permission-denied' ? getPermissionInstructions(browser) : null;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col" dir="rtl">
      <div className="flex justify-between items-center p-4 bg-slate-900/95 text-white border-b border-slate-800">
        <h3 className="font-black text-lg flex items-center gap-2"><Camera className="w-5 h-5" /> مسح VIN</h3>
        <button onClick={onCancel} aria-label="إغلاق" className="p-2 hover:bg-slate-800 rounded-full"><X className="w-6 h-6" /></button>
      </div>

      {error ? (
        <div className="flex-1 overflow-y-auto text-white p-6">
          <div className="max-w-md mx-auto">
            <div className="bg-rose-500/10 border border-rose-500/40 rounded-2xl p-5 mb-4">
              <div className="flex items-start gap-3">
                <Lock className="w-6 h-6 text-rose-300 flex-shrink-0 mt-1" />
                <div>
                  <div className="text-rose-200 font-black text-base mb-1">{error.title}</div>
                  <div className="text-rose-100/80 text-sm leading-relaxed">{error.detail}</div>
                </div>
              </div>
            </div>

            {instructions && (
              <div className="bg-slate-800/60 rounded-2xl p-4 mb-4">
                <button
                  onClick={() => setShowHelp(s => !s)}
                  className="w-full flex justify-between items-center text-right"
                  aria-expanded={showHelp}
                >
                  <span className="flex items-center gap-2 font-black text-amber-300 text-sm">
                    <HelpCircle className="w-5 h-5" /> كيف أُفعّل الكاميرا في {instructions.browserName}؟
                  </span>
                  {showHelp ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {showHelp && (
                  <ol className="mt-4 space-y-2 text-sm text-slate-200 list-decimal pr-5">
                    {instructions.steps.map((step, i) => (
                      <li key={i} className="leading-relaxed">{step}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {(error.kind === 'permission-denied' || error.kind === 'in-use' || error.kind === 'unknown') && (
                <button
                  onClick={handleRetry}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-black flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-5 h-5" /> حاول مجدداً
                </button>
              )}
              <button
                onClick={onManualEntry}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-black flex items-center justify-center gap-2"
              >
                <Keyboard className="w-5 h-5" /> إدخال يدوي
              </button>
              <button
                onClick={onCancel}
                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-xl font-bold"
              >
                إلغاء
              </button>
            </div>

            {error.rawName && (
              <div className="mt-6 text-center text-xs text-slate-500 font-mono">
                {error.rawName}
              </div>
            )}
          </div>
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
