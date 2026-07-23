/**
 * CarShareButtons — share-this-car widget on the car-details page.
 *
 * Server injects per-car og:image / og:title / og:description into the SPA
 * shell (see lib/carDetailsOg.ts), so Facebook / WhatsApp / Twitter
 * previews automatically render the right card the moment the URL is
 * pasted. This widget just opens the share dialog with the same URL.
 */
import { useState } from 'react';
import { Share2, MessageCircle, Facebook, Twitter, Copy, Check } from 'lucide-react';

interface CarLike {
  id: string;
  year?: number | string;
  make?: string;
  model?: string;
  currency?: string;
  currentBid?: number;
  startingBid?: number;
  buyItNow?: number;
}

export default function CarShareButtons({ car, pathPrefix = 'car-details', shareText }: {
  car: CarLike;
  /** URL segment — 'car-details' (default) or 'transit-car' for at-sea cars. */
  pathPrefix?: string;
  /** Optional override for the share message (e.g. transit promo copy). */
  shareText?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  // Share the /api/share/car/:id link, NOT the SPA page URL: /api/* is
  // guaranteed to reach Node behind any proxy (Apache serves the SPA shell
  // itself on the VPS, so crawlers hitting /transit-car/... saw the generic
  // homepage card with no photo). The share endpoint returns full OG tags
  // for crawlers and instantly redirects humans to the real page.
  void pathPrefix; // kept for API compat; landing path now resolved server-side
  // ?v= cache-buster: WhatsApp/Facebook cache a URL's preview for DAYS, so a
  // preview fetched while the page was broken (or before a price change)
  // would stick. A fresh token per mount makes every share a fresh preview.
  const [shareToken] = useState(() => Date.now().toString(36));
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/api/share/car/${car.id}?v=${shareToken}`
    : `/api/share/car/${car.id}?v=${shareToken}`;

  const title = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim() || 'سيارة في AutoPro';
  const price = Number(car.currentBid || car.startingBid || car.buyItNow || 0);
  const currencyLabel = car.currency === 'LYD' ? 'د.ل' : '$';
  const priceText = price > 0 ? ` بـ${currencyLabel} ${price.toLocaleString('en-US')}` : '';
  const text = shareText || `🚗 ${title}${priceText} — تصفّح التفاصيل وقدّم عرضك على AutoPro Libya:`;

  const tryNativeShare = async () => {
    if ((navigator as any).share) {
      try {
        await (navigator as any).share({ title, text, url });
        return;
      } catch { /* user cancelled — fall through to menu */ }
    }
    setOpen((o) => !o);
  };

  const openWhatsApp = () => {
    const msg = `${text}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };
  const openFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener,width=600,height=500');
  };
  const openTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener,width=600,height=500');
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select-prompt
      window.prompt('انسخ الرابط:', url);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={tryNativeShare}
        className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-black text-sm shadow-md transition"
      >
        <Share2 className="w-4 h-4" />
        مشاركة
      </button>

      {open && (
        <div
          dir="rtl"
          className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 z-50 animate-in fade-in slide-in-from-top-1 duration-150"
          onMouseLeave={() => setOpen(false)}
        >
          <button onClick={openWhatsApp}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-emerald-50 rounded-xl text-right">
            <span className="w-9 h-9 bg-emerald-500 text-white rounded-full flex items-center justify-center">
              <MessageCircle className="w-4 h-4" />
            </span>
            <span className="font-bold text-slate-700 text-sm">واتساب</span>
          </button>

          <button onClick={openFacebook}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 rounded-xl text-right">
            <span className="w-9 h-9 bg-blue-600 text-white rounded-full flex items-center justify-center">
              <Facebook className="w-4 h-4" />
            </span>
            <span className="font-bold text-slate-700 text-sm">فيسبوك</span>
          </button>

          <button onClick={openTwitter}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-sky-50 rounded-xl text-right">
            <span className="w-9 h-9 bg-sky-500 text-white rounded-full flex items-center justify-center">
              <Twitter className="w-4 h-4" />
            </span>
            <span className="font-bold text-slate-700 text-sm">تويتر / X</span>
          </button>

          <button onClick={copyLink}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-100 rounded-xl text-right border-t border-slate-100 mt-1 pt-3">
            <span className="w-9 h-9 bg-slate-700 text-white rounded-full flex items-center justify-center">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </span>
            <span className="font-bold text-slate-700 text-sm">
              {copied ? 'تم النسخ' : 'نسخ الرابط'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
