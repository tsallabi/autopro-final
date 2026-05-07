/**
 * ShareButton — share a car to popular Arab social platforms.
 *
 * Channels: WhatsApp (primary in MENA), Facebook, X/Twitter, Telegram,
 * Email, native Web Share API (mobile), and Copy Link (TikTok fallback).
 *
 * The shared message includes the car title, price, location, and a link.
 * Image preview in WhatsApp/Facebook etc. relies on Open Graph meta tags
 * which are emitted by the backend (routes/seo.ts) per car URL — this
 * component just produces the share intent.
 *
 * For TikTok, there is no public web share intent; we copy the link and
 * tell the user to paste it. A future enhancement can generate a 1080×1920
 * shareable image card the user can download and post.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Share2, X, Copy, Check, MessageCircle, Send, Mail, Link2 } from 'lucide-react';

interface CarLike {
  id: string;
  make?: string;
  model?: string;
  year?: number;
  currentBid?: number;
  reservePrice?: number;
  location?: string;
  lotNumber?: string;
}

interface ShareButtonProps {
  car: CarLike;
  /** Override the share URL (defaults to current window URL). */
  url?: string;
  /** Visual size. */
  size?: 'sm' | 'md' | 'lg';
}

function buildShareText(car: CarLike): string {
  const title = `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim();
  const price = car.currentBid || car.reservePrice;
  const priceText = price ? `\n💰 السعر: $${Number(price).toLocaleString('en-US')}` : '';
  const locText = car.location ? `\n📍 ${car.location}` : '';
  const lotText = car.lotNumber ? `\n🔖 لوت: ${car.lotNumber}` : '';
  return `🚗 ${title}${priceText}${locText}${lotText}\n\n🔥 سيارة بسعر مميز في مزاد AutoPro Libya — انضم وزايد الآن!`;
}

export const ShareButton: React.FC<ShareButtonProps> = ({ car, url, size = 'md' }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = buildShareText(car);
  const fullMessage = `${shareText}\n\n${shareUrl}`;
  const encodedText = encodeURIComponent(shareText);
  const encodedFullMessage = encodeURIComponent(fullMessage);
  const encodedUrl = encodeURIComponent(shareUrl);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const sizeClasses =
    size === 'sm'
      ? 'p-2 text-sm'
      : size === 'lg'
        ? 'p-4 text-base'
        : 'p-3 text-sm';

  const tryNativeShare = async () => {
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: `${car.year || ''} ${car.make || ''} ${car.model || ''}`.trim(),
          text: shareText,
          url: shareUrl,
        });
        return true;
      } catch {
        // User cancelled or browser blocked — fall through to popover
      }
    }
    return false;
  };

  const handleClick = async () => {
    // On mobile, prefer the native share sheet (Web Share API).
    // It exposes WhatsApp, Telegram, TikTok, Instagram, Twitter, Email, etc.
    // depending on which apps the user has installed.
    const usedNative = await tryNativeShare();
    if (!usedNative) setOpen(o => !o);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const ta = document.createElement('textarea');
      ta.value = fullMessage;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); }
      catch {}
      document.body.removeChild(ta);
    }
  };

  const platforms = [
    {
      name: 'واتساب',
      href: `https://wa.me/?text=${encodedFullMessage}`,
      icon: <MessageCircle className="w-5 h-5" />,
      color: 'bg-green-500 hover:bg-green-600',
    },
    {
      name: 'تيليجرام',
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      icon: <Send className="w-5 h-5" />,
      color: 'bg-sky-500 hover:bg-sky-600',
    },
    {
      name: 'فيسبوك',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z" />
        </svg>
      ),
      color: 'bg-blue-600 hover:bg-blue-700',
    },
    {
      name: 'X (تويتر)',
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      icon: (
        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      color: 'bg-slate-900 hover:bg-slate-800',
    },
    {
      name: 'البريد',
      href: `mailto:?subject=${encodeURIComponent(`سيارة في مزاد AutoPro: ${car.year || ''} ${car.make || ''} ${car.model || ''}`)}&body=${encodedFullMessage}`,
      icon: <Mail className="w-5 h-5" />,
      color: 'bg-slate-500 hover:bg-slate-600',
    },
  ];

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={handleClick}
        title="مشاركة"
        aria-label="مشاركة السيارة"
        className={`${sizeClasses} bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black transition-all shadow-lg shadow-orange-500/20 active:scale-95 flex items-center gap-2`}
      >
        <Share2 className="w-5 h-5" />
        <span className="hidden sm:inline">مشاركة</span>
      </button>

      {open && (
        <>
          {/* mobile-friendly backdrop */}
          <div className="fixed inset-0 z-[80] bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
          <div
            dir="rtl"
            className="fixed bottom-0 left-0 right-0 sm:absolute sm:bottom-auto sm:right-0 sm:left-auto sm:top-full sm:mt-2 z-[81] sm:w-72 bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                <Share2 className="w-4 h-4 text-orange-500" /> مشاركة السيارة
              </h4>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 grid grid-cols-3 gap-3">
              {platforms.map(p => (
                <a
                  key={p.name}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setTimeout(() => setOpen(false), 250)}
                  className={`${p.color} text-white rounded-2xl p-4 flex flex-col items-center gap-2 transition-all shadow-md active:scale-95`}
                >
                  {p.icon}
                  <span className="text-[11px] font-black">{p.name}</span>
                </a>
              ))}

              {/* Copy link — works for TikTok, Instagram DM, anywhere else */}
              <button
                onClick={copyLink}
                className="bg-slate-700 hover:bg-slate-800 text-white rounded-2xl p-4 flex flex-col items-center gap-2 transition-all shadow-md active:scale-95"
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                <span className="text-[11px] font-black">{copied ? 'تم النسخ' : 'نسخ الرابط'}</span>
              </button>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-[10px] text-slate-500 font-bold leading-relaxed text-center">
                💡 لـ TikTok و Instagram: انسخ الرابط، ثم الصقه في وصف منشورك أو في bio.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ShareButton;
