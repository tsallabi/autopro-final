import React, { useEffect, useState } from 'react';
import { Download, X, Smartphone, CheckCircle2 } from 'lucide-react';

/**
 * PWA Install Prompt
 * - Chrome/Edge/Samsung: Shows native install button when beforeinstallprompt fires
 * - iOS Safari: Shows custom instructions banner
 * - Already installed: Nothing shown
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STORAGE_KEY = 'autopro_pwa_install_dismissed';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    // Detect iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Check if previously dismissed recently
    const dismissedAt = localStorage.getItem(STORAGE_KEY);
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return; // Don't show for 7 days after dismissal
    }

    // Chrome/Edge/etc — listen for install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Delay showing banner to not be intrusive
      setTimeout(() => setShowBanner(true), 15000);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: Show manual instructions after 20 seconds
    if (ios) {
      setTimeout(() => setShowBanner(true), 20000);
    }

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setShowBanner(false);
      setIsInstalled(true);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowBanner(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  };

  if (isInstalled || !showBanner) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-[100] animate-in slide-in-from-bottom-5 duration-500" dir="rtl">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-orange-500/40 rounded-2xl shadow-2xl shadow-orange-500/20 overflow-hidden">
        {/* Header with logo */}
        <div className="relative bg-gradient-to-r from-orange-500 to-orange-600 p-4 flex items-center gap-3">
          <div className="w-14 h-14 bg-white rounded-2xl p-2 flex items-center justify-center shadow-lg">
            <img src="/icons/icon-192.png" alt="AutoPro" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-black text-sm">ثبّت تطبيق AutoPro</h3>
            <p className="text-orange-100 text-xs">وصول أسرع من شاشة هاتفك</p>
          </div>
          <button
            onClick={handleDismiss}
            aria-label="إغلاق"
            className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="flex items-center gap-2 text-slate-300 text-xs mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>بدون متجر التطبيقات</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-xs mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>يعمل بدون إنترنت (جزئياً)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-300 text-xs mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>إشعارات فورية للمزادات</span>
          </div>

          {isIOS ? (
            // iOS: Manual instructions
            <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-xs text-slate-300 space-y-2">
              <div className="font-bold text-white mb-2 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-orange-400" />
                للتثبيت على iPhone:
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-orange-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">1</span>
                <span>اضغط على زر <span className="inline-block bg-slate-700 px-1.5 py-0.5 rounded text-white">المشاركة</span> في شريط Safari السفلي</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-orange-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">2</span>
                <span>اختر <span className="font-bold text-white">"إضافة إلى الشاشة الرئيسية"</span></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="bg-orange-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5">3</span>
                <span>اضغط <span className="font-bold text-white">"إضافة"</span> في الزاوية</span>
              </div>
            </div>
          ) : (
            // Android/Chrome: Native install button
            <button
              onClick={handleInstall}
              className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all"
            >
              <Download className="w-5 h-5" />
              تثبيت التطبيق الآن
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
