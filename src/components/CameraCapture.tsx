import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  X,
  RotateCw,
  Zap,
  ZapOff,
  Check,
  Image as ImageIcon,
  Grid3x3,
  SwitchCamera,
  AlertTriangle,
  Upload,
  Loader2,
} from 'lucide-react';
import { authFetch } from '../context/StoreContext';

// ============================================================================
// CameraCapture — Full-screen camera modal for vehicle photos, KYC docs, etc.
// ----------------------------------------------------------------------------
// Arabic RTL UI, dark theme with orange accents. Mobile-first.
// Requests camera permission (rear-facing preferred), shows live preview,
// captures + compresses to JPEG, uploads via authFetch, returns URL to parent.
// ============================================================================

export interface CameraCaptureProps {
  onCapture: (url: string) => void;
  onCancel: () => void;
  uploadEndpoint?: string;
  uploadFieldName?: string;
  allowMultiple?: boolean;
  facingMode?: 'user' | 'environment';
  aspectRatio?: number;
  maxPhotos?: number;
  overlayGuide?: 'vehicle-front' | 'vehicle-side' | 'document' | 'none';
}

type Stage = 'requesting' | 'denied' | 'no-camera' | 'live' | 'preview' | 'uploading';

interface CapturedPhoto {
  blob: Blob;
  previewUrl: string; // object URL for preview
  uploadedUrl?: string;
}

// --- Helpers ---------------------------------------------------------------

async function processImage(blob: Blob): Promise<Blob> {
  // Resize to max 1920px dimension + compress to JPEG quality 0.85
  try {
    const img = await createImageBitmap(blob);
    const maxDim = 1920;
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const targetW = Math.round(img.width * ratio);
    const targetH = Math.round(img.height * ratio);

    // Prefer OffscreenCanvas, fall back to DOM canvas
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(targetW, targetH);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-ctx');
      ctx.drawImage(img, 0, 0, targetW, targetH);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    }
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no-ctx');
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('blob-failed'))),
        'image/jpeg',
        0.85
      );
    });
  } catch {
    return blob; // fall back to original if processing fails
  }
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* no-op */
  }
}

function playShutter() {
  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'square';
    o.frequency.setValueAtTime(1800, ctx.currentTime);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    o.start();
    o.stop(ctx.currentTime + 0.13);
    setTimeout(() => ctx.close().catch(() => {}), 300);
  } catch {
    /* no-op */
  }
}

// --- Overlay SVG guides ----------------------------------------------------

function OverlayGuide({ kind }: { kind: CameraCaptureProps['overlayGuide'] }) {
  if (!kind || kind === 'none') return null;
  const common =
    'absolute inset-0 w-full h-full pointer-events-none flex items-center justify-center';
  if (kind === 'document') {
    return (
      <div className={common}>
        <div
          className="border-2 border-dashed border-orange-400/90 rounded-lg"
          style={{ width: '85%', height: '55%', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}
        />
      </div>
    );
  }
  if (kind === 'vehicle-front') {
    return (
      <div className={common}>
        <svg viewBox="0 0 300 200" className="w-[85%] h-[70%] opacity-80">
          <g fill="none" stroke="#FB923C" strokeWidth="2.5" strokeDasharray="6 4">
            <path d="M40 150 Q40 100 80 90 L110 60 Q150 50 190 60 L220 90 Q260 100 260 150 L260 170 L40 170 Z" />
            <circle cx="80" cy="170" r="18" />
            <circle cx="220" cy="170" r="18" />
            <rect x="100" y="95" width="100" height="35" rx="6" />
            <line x1="150" y1="60" x2="150" y2="95" />
          </g>
        </svg>
      </div>
    );
  }
  if (kind === 'vehicle-side') {
    return (
      <div className={common}>
        <svg viewBox="0 0 320 160" className="w-[90%] h-[65%] opacity-80">
          <g fill="none" stroke="#FB923C" strokeWidth="2.5" strokeDasharray="6 4">
            <path d="M20 120 L50 120 Q55 90 90 85 L130 60 Q180 55 220 65 L260 85 Q290 90 300 120 L300 130 L20 130 Z" />
            <circle cx="75" cy="130" r="18" />
            <circle cx="250" cy="130" r="18" />
            <path d="M100 85 L130 65 L180 62 L210 85 Z" />
            <line x1="155" y1="62" x2="155" y2="85" />
          </g>
        </svg>
      </div>
    );
  }
  return null;
}

// --- Main component --------------------------------------------------------

export const CameraCapture: React.FC<CameraCaptureProps> = ({
  onCapture,
  onCancel,
  uploadEndpoint = '/api/upload/images',
  uploadFieldName = 'images',
  allowMultiple = false,
  facingMode: initialFacing = 'environment',
  aspectRatio = 4 / 3,
  maxPhotos = 20,
  overlayGuide = 'none',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>('requesting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(initialFacing);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<CapturedPhoto | null>(null);
  const [captured, setCaptured] = useState<CapturedPhoto[]>([]);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  // -------- Camera start/stop --------
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startStream = useCallback(
    async (mode: 'user' | 'environment') => {
      stopStream();
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setStage('no-camera');
        return;
      }
      setStage('requesting');
      setErrorMsg('');
      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch {
            /* autoplay may fail silently; UI still renders */
          }
        }
        // Probe torch support
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() || {}) as any;
        setTorchSupported(!!caps.torch);
        setTorchOn(false);
        setStage('live');
      } catch (err: any) {
        console.error('[CameraCapture] getUserMedia failed:', err);
        if (
          err?.name === 'NotAllowedError' ||
          err?.name === 'PermissionDeniedError' ||
          err?.name === 'SecurityError'
        ) {
          setStage('denied');
          setErrorMsg(
            'تم رفض إذن الكاميرا. يرجى السماح بالوصول من إعدادات المتصفح ثم إعادة المحاولة.'
          );
        } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
          setStage('no-camera');
          setErrorMsg('لم يتم العثور على كاميرا متاحة على هذا الجهاز.');
        } else {
          setStage('no-camera');
          setErrorMsg(err?.message || 'تعذر الوصول إلى الكاميرا.');
        }
      }
    },
    [stopStream]
  );

  useEffect(() => {
    startStream(facingMode);
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // -------- Torch toggle --------
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch (e) {
      console.warn('[CameraCapture] torch toggle failed', e);
    }
  };

  // -------- Flip camera --------
  const flipCamera = async () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    await startStream(next);
  };

  // -------- Tap to focus (best-effort) --------
  const handleVideoTap = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setFocusPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => setFocusPoint(null), 900);
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() || {}) as any;
    if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'manual', pointsOfInterest: [{ x, y }] } as any],
        });
      } catch {
        /* ignore */
      }
    }
  };

  // -------- Capture --------
  const capture = async () => {
    if (!videoRef.current || stage !== 'live') return;
    const video = videoRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    const rawBlob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('capture-failed'))),
        'image/jpeg',
        0.95
      )
    );
    const processed = await processImage(rawBlob);
    const previewUrl = URL.createObjectURL(processed);

    vibrate(30);
    playShutter();

    setCurrentPhoto({ blob: processed, previewUrl });
    setStage('preview');
  };

  // -------- Upload --------
  const uploadBlob = async (blob: Blob): Promise<string> => {
    const form = new FormData();
    const filename = `camera-${Date.now()}.jpg`;
    form.append(uploadFieldName, blob, filename);
    const res = await authFetch(uploadEndpoint, { method: 'POST', body: form });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(msg || `Upload failed (${res.status})`);
    }
    const data = await res.json().catch(() => ({}));
    const url: string | undefined =
      data?.urls?.[0] || data?.url || data?.location || data?.path;
    if (!url) throw new Error('لم يرد الخادم برابط الصورة');
    return url;
  };

  // -------- Retake --------
  const retake = () => {
    if (currentPhoto) {
      URL.revokeObjectURL(currentPhoto.previewUrl);
    }
    setCurrentPhoto(null);
    setStage('live');
  };

  // -------- Use photo (single or multi) --------
  const confirmPhoto = async () => {
    if (!currentPhoto) return;
    setStage('uploading');
    try {
      const url = await uploadBlob(currentPhoto.blob);
      if (allowMultiple) {
        setCaptured((prev) => [
          ...prev,
          { ...currentPhoto, uploadedUrl: url },
        ]);
        // Emit to parent as each photo is confirmed so parent can accumulate
        onCapture(url);
        setCurrentPhoto(null);
        if (captured.length + 1 >= maxPhotos) {
          cleanupAndClose();
        } else {
          setStage('live');
        }
      } else {
        onCapture(url);
        cleanupAndClose();
      }
    } catch (e: any) {
      console.error('[CameraCapture] upload failed', e);
      setErrorMsg(e?.message || 'فشل رفع الصورة');
      setStage('preview');
    }
  };

  const cleanupAndClose = () => {
    if (currentPhoto) URL.revokeObjectURL(currentPhoto.previewUrl);
    captured.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    stopStream();
  };

  const handleCancel = () => {
    cleanupAndClose();
    onCancel();
  };

  const handleDone = () => {
    cleanupAndClose();
    onCancel(); // closes the modal; parent already has each URL via onCapture
  };

  // -------- File fallback (no camera) --------
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);
  const handleFallbackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setStage('uploading');
    try {
      for (const f of files) {
        const processed = await processImage(f);
        const url = await uploadBlob(processed);
        onCapture(url);
        if (!allowMultiple) break;
      }
      handleDone();
    } catch (err: any) {
      setErrorMsg(err?.message || 'فشل رفع الصورة');
      setStage('no-camera');
    }
  };

  // -------- Render ---------------------------------------------------------

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] bg-black text-white flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur-md border-b border-white/10">
        <button
          onClick={handleCancel}
          className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          aria-label="إغلاق"
          title="إغلاق"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="text-sm font-bold text-white/90 flex items-center gap-2">
          <Camera className="w-4 h-4 text-orange-500" />
          <span>
            {stage === 'preview'
              ? 'معاينة الصورة'
              : stage === 'uploading'
              ? 'جاري الرفع...'
              : allowMultiple
              ? `التقاط صور (${captured.length}/${maxPhotos})`
              : 'التقاط صورة'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {stage === 'live' && (
            <>
              <button
                onClick={() => setShowGrid((g) => !g)}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  showGrid ? 'bg-orange-500 text-white' : 'bg-white/10 hover:bg-white/20'
                }`}
                aria-label="شبكة"
                title="شبكة"
              >
                <Grid3x3 className="w-5 h-5" />
              </button>
              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                    torchOn ? 'bg-orange-500 text-white' : 'bg-white/10 hover:bg-white/20'
                  }`}
                  aria-label="فلاش"
                  title="فلاش"
                >
                  {torchOn ? <Zap className="w-5 h-5" /> : <ZapOff className="w-5 h-5" />}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main viewport */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {/* LIVE */}
        {(stage === 'live' || stage === 'requesting') && (
          <div
            className="relative w-full h-full flex items-center justify-center"
            onClick={handleVideoTap}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />
            {/* Grid */}
            {showGrid && stage === 'live' && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40" />
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40" />
              </div>
            )}
            {/* Overlay guide */}
            {stage === 'live' && <OverlayGuide kind={overlayGuide} />}
            {/* Focus ring */}
            {focusPoint && (
              <div
                className="absolute w-16 h-16 border-2 border-orange-400 rounded-full pointer-events-none animate-ping"
                style={{
                  left: focusPoint.x - 32,
                  top: focusPoint.y - 32,
                }}
              />
            )}
            {/* Requesting overlay */}
            {stage === 'requesting' && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center px-6">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin mb-4" />
                <div className="text-lg font-black">
                  نحتاج إذن الكاميرا لالتقاط الصور
                </div>
                <div className="text-sm text-white/70 mt-2">
                  يرجى السماح بالوصول عند ظهور الطلب
                </div>
              </div>
            )}
          </div>
        )}

        {/* DENIED / NO CAMERA */}
        {(stage === 'denied' || stage === 'no-camera') && (
          <div className="max-w-md w-full mx-auto p-6 text-center">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8">
              <AlertTriangle className="w-14 h-14 text-orange-500 mx-auto mb-4" />
              <div className="text-xl font-black mb-2">
                {stage === 'denied' ? 'تم رفض إذن الكاميرا' : 'الكاميرا غير متاحة'}
              </div>
              <div className="text-sm text-white/70 mb-5 leading-relaxed">
                {errorMsg ||
                  (stage === 'denied'
                    ? 'يرجى فتح إعدادات المتصفح والسماح بالوصول إلى الكاميرا ثم إعادة المحاولة.'
                    : 'لا توجد كاميرا متاحة. يمكنك اختيار صورة من الجهاز بدلاً من ذلك.')}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => startStream(facingMode)}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCw className="w-5 h-5" />
                  إعادة المحاولة
                </button>
                <button
                  onClick={() => fallbackInputRef.current?.click()}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <Upload className="w-5 h-5" />
                  اختيار من الجهاز
                </button>
                <input
                  ref={fallbackInputRef}
                  type="file"
                  accept="image/*"
                  multiple={allowMultiple}
                  className="hidden"
                  onChange={handleFallbackFile}
                />
                <button
                  onClick={handleCancel}
                  className="w-full bg-transparent border border-white/20 hover:bg-white/5 text-white font-black py-3 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {stage === 'preview' && currentPhoto && (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <img
              src={currentPhoto.previewUrl}
              alt="Preview"
              className="max-w-full max-h-full object-contain"
            />
            {errorMsg && (
              <div className="absolute top-4 left-4 right-4 bg-rose-500/90 text-white font-bold text-sm px-4 py-2 rounded-lg text-center">
                {errorMsg}
              </div>
            )}
          </div>
        )}

        {/* UPLOADING */}
        {stage === 'uploading' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
            <div className="text-lg font-black">جاري رفع الصورة...</div>
          </div>
        )}
      </div>

      {/* Captured thumbnails strip (multi-mode) */}
      {allowMultiple && captured.length > 0 && stage !== 'denied' && stage !== 'no-camera' && (
        <div className="bg-black/70 backdrop-blur-md border-t border-white/10 px-3 py-2 flex gap-2 overflow-x-auto">
          {captured.map((p, i) => (
            <div
              key={i}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-orange-500/60 flex-shrink-0"
            >
              <img src={p.previewUrl} alt={`#${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute top-0.5 right-0.5 bg-black/70 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                {i + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bottom controls */}
      {stage === 'live' && (
        <div className="bg-black/80 backdrop-blur-md border-t border-white/10 px-6 py-5">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            {/* Flip */}
            <button
              onClick={flipCamera}
              className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              aria-label="تبديل الكاميرا"
              title="تبديل الكاميرا"
            >
              <SwitchCamera className="w-6 h-6" />
            </button>

            {/* Big capture button */}
            <button
              onClick={capture}
              className="relative w-20 h-20 rounded-full bg-white active:scale-95 transition-transform flex items-center justify-center shadow-2xl"
              aria-label="التقاط"
              title="التقاط"
            >
              <span className="absolute inset-2 rounded-full border-4 border-orange-500" />
              <span className="w-14 h-14 rounded-full bg-orange-500" />
            </button>

            {/* Done (multi) or placeholder */}
            {allowMultiple && captured.length > 0 ? (
              <button
                onClick={handleDone}
                className="h-14 px-4 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-black flex items-center gap-2 transition-colors"
                aria-label="تم"
                title="تم"
              >
                <Check className="w-5 h-5" />
                <span>تم ({captured.length})</span>
              </button>
            ) : (
              <div className="w-14 h-14 flex items-center justify-center text-white/40">
                <ImageIcon className="w-6 h-6" />
              </div>
            )}
          </div>
          <div className="text-center text-xs text-white/50 mt-3 font-bold">
            {aspectRatio ? null : null}
            اضغط على الشاشة للتركيز
          </div>
        </div>
      )}

      {stage === 'preview' && currentPhoto && (
        <div className="bg-black/80 backdrop-blur-md border-t border-white/10 px-6 py-4">
          <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
            <button
              onClick={retake}
              className="flex-1 bg-white/10 hover:bg-white/20 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCw className="w-5 h-5" />
              إعادة التقاط
            </button>
            <button
              onClick={confirmPhoto}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors"
            >
              <Check className="w-5 h-5" />
              استخدام الصورة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CameraCapture;
