/**
 * Deal of the Day — homepage hero banner.
 *
 * Reads /api/deal-of-day. Renders nothing if no car is pinned (so the
 * homepage layout doesn't break when the admin hasn't picked one yet).
 *
 * Mount on the homepage above the car grid:
 *   import DealOfDayBanner from '@/components/DealOfDayBanner';
 *   <DealOfDayBanner />
 *
 * Pure CSS-in-JS so it works regardless of whether tailwind classes
 * are loaded on the page where it's mounted.
 */
import { useEffect, useState } from 'react';

interface Car {
  id: string;
  lotNumber?: string;
  make?: string;
  model?: string;
  year?: number;
  mileage?: number;
  currentBid?: number;
  reservePrice?: number;
  auctionEndDate?: string;
  auctionStartTime?: string;
  images?: string;
  imageUrl?: string;
  description?: string;
}

interface DealResponse {
  car: Car | null;
  setAt: string | null;
}

function pickHero(car: Car): string | null {
  if (typeof car.images === 'string' && car.images.trim()) {
    try {
      const arr = JSON.parse(car.images);
      if (Array.isArray(arr) && arr.length) return String(arr[0]);
    } catch {
      const first = car.images.split(',')[0].trim();
      if (first) return first;
    }
  }
  return car.imageUrl || null;
}

function fmtTimeLeft(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (days >= 1) return `${days} يوم ${hours} س`;
  if (hours >= 1) return `${hours} س ${mins} د`;
  return `${mins} د`;
}

export default function DealOfDayBanner() {
  const [data, setData] = useState<DealResponse | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch('/api/deal-of-day')
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Re-render every 60s so the countdown stays roughly fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data?.car) return null;
  const car = data.car;
  const lot = car.lotNumber || car.id;
  const title = [car.year, car.make, car.model].filter(Boolean).join(' ') || 'سيارة';
  const img = pickHero(car);
  const price = Number(car.currentBid || car.reservePrice || 0);
  const left = fmtTimeLeft(car.auctionEndDate);

  return (
    <a
      href={`/car/${encodeURIComponent(String(lot))}`}
      dir="rtl"
      data-tick={tick}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        margin: '20px auto',
        maxWidth: 1100,
        background: 'linear-gradient(135deg, #fff8e1 0%, #ffecb3 100%)',
        border: '2px solid #ffc107',
        borderRadius: 16,
        boxShadow: '0 8px 24px rgba(255,193,7,0.2)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 12, right: 12,
        background: '#d32f2f',
        color: '#fff',
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: 0.5,
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
      }}>🔥 عرض اليوم</div>

      <div style={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16, padding: 16 }}>
        {img && (
          <div style={{ flex: '1 1 320px', minWidth: 280, maxWidth: 460 }}>
            <img
              src={img}
              alt={title}
              loading="lazy"
              style={{ width: '100%', height: 240, objectFit: 'cover', borderRadius: 12, display: 'block' }}
            />
          </div>
        )}

        <div style={{ flex: '2 1 380px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 8px' }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 800, color: '#1a1a1a' }}>{title}</h2>
          <div style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
            🏷️ رقم اللوت: <strong>{String(lot)}</strong>
            {car.mileage ? <> · 🛣️ {Number(car.mileage).toLocaleString('en-US')} mi</> : null}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            {price > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#666' }}>السعر الحالي</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#2e7d32' }}>
                  ${price.toLocaleString('en-US')}
                </div>
              </div>
            )}
            {left && (
              <div>
                <div style={{ fontSize: 12, color: '#666' }}>ينتهي خلال</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#d32f2f' }}>{left}</div>
              </div>
            )}
          </div>

          <div
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: '#ff6f00',
              color: '#fff',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 16,
              alignSelf: 'flex-start',
            }}
          >
            ⚡ شاهد التفاصيل وقدّم عرضك ←
          </div>
        </div>
      </div>
    </a>
  );
}
