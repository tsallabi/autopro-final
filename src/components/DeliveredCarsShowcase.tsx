/**
 * DeliveredCarsShowcase — "آخر السيارات التي تم تسليمها" grid.
 * Shows the last N sold cars as social proof: real photos, real winners,
 * real dates. Pulls /api/public/recent-deliveries. Self-hides on empty.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, MapPin, Calendar } from 'lucide-react';

type Item = {
  id: string;
  lot?: string;
  make: string;
  model: string;
  year: number;
  image: string;
  soldAt: string;
  soldPrice: number;
  winnerName: string;
  winnerCountry: string;
};

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ar-LY', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

export default function DeliveredCarsShowcase({ limit = 8 }: { limit?: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/public/recent-deliveries?limit=${limit}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [limit]);

  if (loading) return null;
  if (!items.length) return null;

  return (
    <section dir="rtl" style={{ background: '#f8fafc', padding: '60px 16px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(16,185,129,0.12)', color: '#059669',
            padding: '6px 16px', borderRadius: 999, fontWeight: 800, fontSize: 12,
            marginBottom: 14,
          }}>
            <CheckCircle2 size={14} /> سيارات سُلِّمت فعلاً
          </div>
          <h2 style={{
            fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900,
            color: '#0f172a', margin: 0, lineHeight: 1.15,
          }}>
            آخر السيارات التي وصلت لأصحابها 🏆
          </h2>
          <p style={{ color: '#64748b', fontWeight: 600, marginTop: 10, fontSize: 14 }}>
            ليست مجرد كلام — هذه سيارات حقيقية بيعت لزبائن حقيقيين عبر منصّتنا
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}>
          {items.map((it) => (
            <div key={it.id} style={{
              background: '#fff',
              borderRadius: 18,
              overflow: 'hidden',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              <div style={{ position: 'relative', aspectRatio: '16 / 10', background: '#e2e8f0', overflow: 'hidden' }}>
                {it.image ? (
                  <img src={it.image} alt={`${it.make} ${it.model}`}
                       style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                       loading="lazy" />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#94a3b8', fontWeight: 700,
                  }}>صورة غير متوفرة</div>
                )}
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#10b981', color: '#fff', padding: '4px 10px',
                  borderRadius: 999, fontSize: 11, fontWeight: 900,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <CheckCircle2 size={11} /> تم التسليم
                </div>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>
                  {it.year} {it.make} {it.model}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: '#64748b', fontWeight: 600,
                  }}>
                    <MapPin size={12} /> {it.winnerCountry}
                  </span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: '#64748b', fontWeight: 600,
                  }}>
                    <Calendar size={12} /> {formatDate(it.soldAt)}
                  </span>
                </div>
                <div style={{
                  marginTop: 10, fontSize: 11, color: '#475569',
                  background: '#f1f5f9', padding: '6px 10px', borderRadius: 8,
                  fontWeight: 700, textAlign: 'center',
                }}>
                  استلمها: {it.winnerName}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
