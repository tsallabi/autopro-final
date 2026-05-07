/**
 * WhatsApp Channel Poster — admin-only floating button + dialog.
 *
 * Usage (one-line):
 *   import WhatsAppPoster from '@/components/admin/WhatsAppPoster';
 *   ...
 *   {user?.role === 'admin' && <WhatsAppPoster />}
 *
 * The dialog lets the admin:
 *   1. Pick a car from the active auctions list (or the "Deal of the Day").
 *   2. Choose a tone (default / deal / urgent / new car).
 *   3. Preview the Arabic post.
 *   4. Click "Open in WhatsApp" → wa.me link with text pre-filled.
 *   5. Optionally copy the text + image URL separately.
 *   6. Pin the selected car as "Deal of the Day".
 *
 * It POSTs to /api/admin/whatsapp/* — no API keys needed in the frontend.
 */
import { useEffect, useState } from 'react';

interface CarRow {
  id: string;
  lotNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  currentBid?: number;
  startingPrice?: number;
  endTime?: string;
  imageUrl?: string;
  images?: string;
}

interface Generated {
  text: string;
  imageUrl: string | null;
  carUrl: string;
  waUrl: string;
  style: string;
  car: { id: string; lotNumber?: string; title: string };
}

const STYLES: { value: string; label: string }[] = [
  { value: 'default', label: '🚗 منشور عادي' },
  { value: 'deal',    label: '🔥 عرض اليوم' },
  { value: 'urgent',  label: '⏰ آخر فرصة' },
  { value: 'new',     label: '✨ سيارة جديدة' },
];

async function authFetch(url: string, init?: RequestInit) {
  const token = localStorage.getItem('token') || '';
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

export default function WhatsAppPoster() {
  const [open, setOpen] = useState(false);
  const [cars, setCars] = useState<CarRow[]>([]);
  const [carId, setCarId] = useState('');
  const [style, setStyle] = useState('default');
  const [post, setPost] = useState<Generated | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || cars.length) return;
    (async () => {
      try {
        setLoading(true);
        const res = await authFetch('/api/admin/whatsapp/cars');
        if (!res.ok) throw new Error('فشل تحميل السيارات');
        const data = await res.json();
        setCars(Array.isArray(data) ? data : []);
        if (data?.[0]?.id && !carId) setCarId(data[0].id);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    if (!carId) return;
    setError(null);
    setLoading(true);
    setCopied(false);
    try {
      const res = await authFetch('/api/admin/whatsapp/generate', {
        method: 'POST',
        body: JSON.stringify({ carId, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'فشل التوليد');
      setPost(data);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function copyText() {
    if (!post?.text) return;
    try {
      await navigator.clipboard.writeText(post.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function pinDealOfDay() {
    if (!carId) return;
    setError(null);
    try {
      const res = await authFetch('/api/admin/whatsapp/deal-of-day', {
        method: 'POST',
        body: JSON.stringify({ carId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'فشل التثبيت');
      alert('✓ تم تثبيت السيارة كعرض اليوم');
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  }

  async function logPosted() {
    try {
      await authFetch('/api/admin/whatsapp/log', {
        method: 'POST',
        body: JSON.stringify({ carId, style, channel: 'channel' }),
      });
    } catch {}
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="WhatsApp Channel Poster"
        style={{
          position: 'fixed',
          bottom: 88,
          left: 20,
          zIndex: 9998,
          background: '#25D366',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 56,
          height: 56,
          fontSize: 26,
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
        }}
      >
        💬
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 14, width: '100%',
          maxWidth: 720, maxHeight: '90vh', overflow: 'auto', padding: 20,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>💬 ناشر قناة واتساب</h2>
          <button
            onClick={() => setOpen(false)}
            style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer' }}
          >×</button>
        </div>

        {error && (
          <div style={{ background: '#fee', color: '#900', padding: 10, borderRadius: 8, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>اختر السيارة:</label>
        <select
          value={carId}
          onChange={(e) => setCarId(e.target.value)}
          disabled={loading || !cars.length}
          style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #ccc', marginBottom: 12 }}
        >
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {[c.year, c.make, c.model].filter(Boolean).join(' ')} — {c.lotNumber || c.id}
              {c.currentBid ? ` ($${Number(c.currentBid).toLocaleString('en-US')})` : ''}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>نمط المنشور:</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {STYLES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStyle(s.value)}
              type="button"
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: style === s.value ? '2px solid #25D366' : '1px solid #ccc',
                background: style === s.value ? '#dcf8c6' : '#fff',
                cursor: 'pointer',
              }}
            >{s.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={generate}
            disabled={!carId || loading}
            type="button"
            style={{
              padding: '10px 16px', background: '#075E54', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
            }}
          >
            {loading ? '...جاري التوليد' : '⚡ توليد المنشور'}
          </button>
          <button
            onClick={pinDealOfDay}
            disabled={!carId || loading}
            type="button"
            style={{
              padding: '10px 16px', background: '#fff', color: '#075E54',
              border: '1px solid #075E54', borderRadius: 8, cursor: 'pointer',
            }}
          >📌 تثبيت كعرض اليوم</button>
        </div>

        {post && (
          <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>المعاينة:</h3>

            {post.imageUrl && (
              <img
                src={post.imageUrl}
                alt=""
                style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: 10 }}
              />
            )}

            <pre style={{
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: '#dcf8c6', padding: 14, borderRadius: 12,
              fontFamily: 'inherit', fontSize: 14, lineHeight: 1.7, margin: 0,
            }}>{post.text}</pre>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <a
                href={post.waUrl}
                target="_blank" rel="noopener noreferrer"
                onClick={logPosted}
                style={{
                  padding: '10px 16px', background: '#25D366', color: '#fff',
                  borderRadius: 8, textDecoration: 'none', fontWeight: 600,
                }}
              >📲 فتح في واتساب</a>

              <button
                onClick={copyText}
                type="button"
                style={{
                  padding: '10px 16px', background: '#fff', color: '#000',
                  border: '1px solid #ccc', borderRadius: 8, cursor: 'pointer',
                }}
              >{copied ? '✓ تم النسخ' : '📋 نسخ النص'}</button>

              {post.imageUrl && (
                <a
                  href={post.imageUrl}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    padding: '10px 16px', background: '#fff', color: '#000',
                    border: '1px solid #ccc', borderRadius: 8, textDecoration: 'none',
                  }}
                >🖼️ فتح الصورة</a>
              )}

              <a
                href={post.carUrl}
                target="_blank" rel="noopener noreferrer"
                style={{
                  padding: '10px 16px', background: '#fff', color: '#000',
                  border: '1px solid #ccc', borderRadius: 8, textDecoration: 'none',
                }}
              >🔗 صفحة السيارة</a>
            </div>

            <p style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
              💡 لقنوات واتساب: افتح القناة، اضغط 📎 → صورة، أرفق الصورة من الرابط أعلاه، ثم الصق النص.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
