/**
 * TrustBar — slim social-proof strip rendered above public pages.
 * Pulls live numbers from /api/public/trust-stats (cached 15s server-side).
 * Self-hides if the endpoint isn't reachable so it never shows broken numbers.
 */
import { useEffect, useState } from 'react';
import { Users, Trophy, Star, Gavel } from 'lucide-react';

type Stats = {
  visitorsRecent: number;
  soldToday: number;
  totalSold: number;
  totalUsers: number;
  activeAuctions: number;
  rating: number;
  ratingCount: number;
};

export default function TrustBar() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/public/trust-stats')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setStats(d); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!stats) return null;

  const items = [
    { icon: Users,   value: stats.visitorsRecent, label: 'يتصفّحون الآن', color: '#10b981' },
    { icon: Trophy,  value: stats.totalSold,      label: 'سيارة بيعت',     color: '#f97316' },
    { icon: Gavel,   value: stats.activeAuctions, label: 'مزاد مباشر',     color: '#3b82f6' },
    { icon: Star,    value: stats.rating.toFixed(1), label: `تقييم (${stats.ratingCount})`, color: '#facc15' },
  ];

  return (
    <div
      dir="rtl"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid rgba(249,115,22,0.3)',
        color: '#fff',
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 700,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, alignItems: 'center', minWidth: 'min-content' }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Icon style={{ width: 14, height: 14, color: it.color }} />
              <span style={{ color: it.color }}>{it.value}</span>
              <span style={{ color: '#cbd5e1', fontWeight: 500 }}>{it.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
