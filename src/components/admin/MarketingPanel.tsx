/**
 * Marketing Insights Panel — admin-only floating button + dialog.
 *
 * Usage (one-line):
 *   import MarketingPanel from '@/components/admin/MarketingPanel';
 *   ...
 *   {user?.role === 'admin' && <MarketingPanel />}
 *
 * Tabs:
 *   1. الشرائح (Segments) — 6 cards, each with count + actions
 *      • نسخ الإيميلات    → clipboard
 *      • نسخ الأرقام      → clipboard
 *      • تحميل CSV        → triggers /marketing-segments/csv?segment=...
 *   2. الجغرافيا (Geo)    — bars by country + city
 *   3. الأجهزة (Devices)  — bars by device + browser + OS
 *   4. المستخدمون (Users) — table of all registered users + their device/city
 *      • تحميل CSV (كل المستخدمين)
 *
 * Pure CSS-in-JS so it works regardless of tailwind classes on the host page.
 */
import { useEffect, useState } from 'react';

type SegmentName =
  | 'activeToday' | 'activeThisWeek' | 'dormant30Days'
  | 'neverVisited' | 'withDeposits' | 'pendingKyc';

const SEGMENT_META: Record<SegmentName, { label: string; emoji: string; hint: string; color: string }> = {
  activeToday:    { label: 'نشطون اليوم',           emoji: '🔥', hint: 'مزايدون متاحون الآن — استهدف بعروض فورية',      color: '#10b981' },
  activeThisWeek: { label: 'نشطون هذا الأسبوع',     emoji: '✨', hint: 'متفاعلون لكن غير دائمين — حافظ على الزخم',        color: '#3b82f6' },
  dormant30Days:  { label: 'خاملون +30 يوم',        emoji: '😴', hint: 'حملة إعادة تفعيل — رسالة "افتقدناك"',             color: '#f59e0b' },
  neverVisited:   { label: 'سجّلوا ولم يتصفحوا',     emoji: '🆕', hint: 'حملة Onboarding — وجّههم للخطوة الأولى',         color: '#8b5cf6' },
  withDeposits:   { label: 'لديهم رصيد (VIP)',      emoji: '💎', hint: 'أعلى قيمة — عروض حصرية وعمولة مخفضة',           color: '#ec4899' },
  pendingKyc:     { label: 'بانتظار توثيق KYC',     emoji: '🔒', hint: 'تذكير بالتوثيق لتفعيل الحساب كاملاً',             color: '#ef4444' },
};

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: string;
  deposit?: number;
  joinDate?: string;
  lastLogin?: string;
  primaryCountry?: string;
  primaryCity?: string;
  primaryDevice?: string;
  totalVisits?: number;
}

async function authFetch(url: string, init?: RequestInit) {
  const token = localStorage.getItem('authToken') || '';
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
}

export default function MarketingPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'segments' | 'geo' | 'devices' | 'users'>('segments');
  const [segments, setSegments] = useState<any | null>(null);
  const [geo, setGeo] = useState<any | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [overview, setOverview] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      authFetch('/api/admin/analytics/marketing-segments').then((r) => r.json()),
      authFetch('/api/admin/analytics/geo-breakdown?range=month').then((r) => r.json()),
      authFetch('/api/admin/analytics/registered-users-stats').then((r) => r.json()),
      authFetch('/api/admin/analytics/overview?range=month').then((r) => r.json()),
    ])
      .then(([s, g, u, o]) => {
        setSegments(s);
        setGeo(g);
        setUsers(u?.users || []);
        setOverview(o);
      })
      .catch(() => showToast('فشل تحميل البيانات'))
      .finally(() => setLoading(false));
  }, [open]);

  async function copyField(segment: SegmentName, field: 'email' | 'phone') {
    const list: any[] = segments?.segments?.[segment]?.users || [];
    const values = list.map((u) => u[field]).filter(Boolean);
    if (!values.length) {
      showToast('لا توجد بيانات للنسخ');
      return;
    }
    try {
      await navigator.clipboard.writeText(values.join('\n'));
      showToast(`✓ نُسخت ${values.length} ${field === 'email' ? 'إيميل' : 'رقم'}`);
    } catch {
      showToast('فشل النسخ');
    }
  }

  async function downloadCsv(segment: SegmentName) {
    try {
      const res = await authFetch(`/api/admin/analytics/marketing-segments/csv?segment=${segment}`);
      if (!res.ok) {
        showToast('فشل التحميل');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autopro-segment-${segment}-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('✓ تم التحميل');
    } catch {
      showToast('فشل التحميل');
    }
  }

  async function downloadUsersCsv() {
    try {
      const res = await authFetch('/api/admin/analytics/registered-users-stats/csv');
      if (!res.ok) {
        showToast('فشل التحميل');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `autopro-users-${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('✓ تم التحميل');
    } catch {
      showToast('فشل التحميل');
    }
  }

  const filteredUsers = search
    ? users.filter((u) => {
        const q = search.toLowerCase();
        return (
          (u.firstName || '').toLowerCase().includes(q) ||
          (u.lastName || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.phone || '').includes(q) ||
          (u.primaryCity || '').toLowerCase().includes(q) ||
          (u.primaryCountry || '').toLowerCase().includes(q)
        );
      })
    : users;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="لوحة التسويق والتحليلات"
        style={{
          position: 'fixed',
          bottom: 156,
          left: 20,
          zIndex: 9997,
          background: '#a855f7',
          color: '#fff',
          border: 'none',
          borderRadius: 999,
          width: 56,
          height: 56,
          fontSize: 26,
          cursor: 'pointer',
          boxShadow: '0 6px 16px rgba(168,85,247,0.35)',
        }}
      >📊</button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={() => setOpen(false)}
    >
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16, width: '100%',
          maxWidth: 1100, maxHeight: '92vh', overflow: 'auto', padding: 0,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottom: '1px solid #eee', position: 'sticky', top: 0, background: '#fff', zIndex: 2 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📊 لوحة التسويق والتحليلات</h2>
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* KPI strip */}
        {overview?.kpis && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, padding: 16, background: '#f8fafc' }}>
            <Kpi label="مستخدمون مسجلون (الكلي)" value={overview.kpis.totalRegisteredUsers ?? 0} color="#a855f7" />
            <Kpi label="زوار مسجلون (الفترة)"  value={overview.kpis.loggedInVisitors ?? 0}    color="#10b981" />
            <Kpi label="زوار فريدون"            value={overview.kpis.uniqueVisitors ?? 0}      color="#3b82f6" />
            <Kpi label="إجمالي الزيارات"        value={overview.kpis.totalVisits ?? 0}         color="#f59e0b" />
            <Kpi label="متوسط الجلسة (ث)"       value={overview.kpis.avgSessionDuration ?? 0}  color="#ef4444" />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '12px 16px 0', borderBottom: '1px solid #eee', background: '#fff' }}>
          {[
            { id: 'segments', label: '🎯 الشرائح' },
            { id: 'geo',      label: '🌍 الجغرافيا' },
            { id: 'devices',  label: '📱 الأجهزة' },
            { id: 'users',    label: '👥 المستخدمون' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              type="button"
              style={{
                padding: '10px 16px',
                background: tab === t.id ? '#a855f7' : 'transparent',
                color: tab === t.id ? '#fff' : '#444',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: 14,
              }}
            >{t.label}</button>
          ))}
        </div>

        <div style={{ padding: 16 }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>...جاري تحميل البيانات</div>}

          {!loading && tab === 'segments' && segments?.segments && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              {(Object.keys(SEGMENT_META) as SegmentName[]).map((key) => {
                const meta = SEGMENT_META[key];
                const data = segments.segments[key];
                const count = data?.count || 0;
                return (
                  <div key={key} style={{ background: '#fff', border: `2px solid ${meta.color}25`, borderRadius: 14, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 26 }}>{meta.emoji}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{meta.label}</div>
                        <div style={{ fontSize: 32, fontWeight: 900, color: meta.color, lineHeight: 1 }}>{count}</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: '#666', margin: '8px 0 12px' }}>{meta.hint}</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => copyField(key, 'email')}
                        type="button"
                        disabled={count === 0}
                        style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, background: '#fff', border: '1px solid #ccc', borderRadius: 6, cursor: count === 0 ? 'not-allowed' : 'pointer', opacity: count === 0 ? 0.4 : 1 }}
                      >📧 نسخ الإيميلات</button>
                      <button
                        onClick={() => copyField(key, 'phone')}
                        type="button"
                        disabled={count === 0}
                        style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, background: '#fff', border: '1px solid #ccc', borderRadius: 6, cursor: count === 0 ? 'not-allowed' : 'pointer', opacity: count === 0 ? 0.4 : 1 }}
                      >📱 نسخ الأرقام</button>
                      <button
                        onClick={() => downloadCsv(key)}
                        type="button"
                        disabled={count === 0}
                        style={{ padding: '6px 10px', fontSize: 12, fontWeight: 700, background: meta.color, color: '#fff', border: 'none', borderRadius: 6, cursor: count === 0 ? 'not-allowed' : 'pointer', opacity: count === 0 ? 0.4 : 1 }}
                      >⬇️ CSV</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && tab === 'geo' && geo && (
            <div>
              <h3 style={{ marginTop: 0 }}>الدول (آخر 30 يوم)</h3>
              <BarTable
                rows={geo.byCountry || []}
                labelKey="country"
                valueKey="visits"
                extra={(r) => `${r.visitors || 0} زائر • ${r.registeredVisitors || 0} مسجل`}
                empty="لا توجد بيانات جغرافية بعد — انتظر تراكم الزيارات بعد التحديث"
              />
              <h3 style={{ marginTop: 24 }}>المدن</h3>
              <BarTable
                rows={geo.byCity || []}
                labelKey="city"
                valueKey="visits"
                extra={(r) => r.country ? `${r.country}` : ''}
                empty="—"
              />
            </div>
          )}

          {!loading && tab === 'devices' && overview && (
            <div>
              <h3 style={{ marginTop: 0 }}>الأجهزة</h3>
              <BarTable rows={overview.deviceBreakdown || []} labelKey="device" valueKey="count" empty="—" />
              <h3 style={{ marginTop: 24 }}>المتصفحات</h3>
              <BarTable rows={overview.browserBreakdown || []} labelKey="browser" valueKey="count" empty="—" />
            </div>
          )}

          {!loading && tab === 'users' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="search"
                  placeholder="بحث (اسم / إيميل / مدينة)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ flex: '1 1 240px', padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc' }}
                />
                <button
                  onClick={downloadUsersCsv}
                  type="button"
                  style={{ padding: '8px 14px', background: '#a855f7', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}
                >⬇️ تحميل الكل CSV</button>
                <span style={{ fontSize: 13, color: '#666' }}>{filteredUsers.length} / {users.length}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', textAlign: 'right' }}>
                      <th style={th}>الاسم</th>
                      <th style={th}>الإيميل</th>
                      <th style={th}>الهاتف</th>
                      <th style={th}>الدولة</th>
                      <th style={th}>المدينة</th>
                      <th style={th}>الجهاز</th>
                      <th style={th}>الزيارات</th>
                      <th style={th}>آخر زيارة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.slice(0, 200).map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={td}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</td>
                        <td style={td}>{u.email || '—'}</td>
                        <td style={td}>{u.phone || '—'}</td>
                        <td style={td}>{u.primaryCountry || '—'}</td>
                        <td style={td}>{u.primaryCity || '—'}</td>
                        <td style={td}>{u.primaryDevice || '—'}</td>
                        <td style={td}>{u.totalVisits ?? 0}</td>
                        <td style={td}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('ar-LY') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredUsers.length > 200 && (
                  <p style={{ textAlign: 'center', color: '#666', fontSize: 12, margin: '12px 0 0' }}>
                    معروض أول 200 — حمّل CSV لكامل القائمة ({filteredUsers.length} سجل)
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {toast && (
          <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: '#222', color: '#fff', padding: '10px 18px', borderRadius: 999, fontWeight: 700, zIndex: 10000 }}>
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

const th: React.CSSProperties = { padding: 10, fontWeight: 800, textAlign: 'right', borderBottom: '2px solid #ddd' };
const td: React.CSSProperties = { padding: 10, textAlign: 'right' };

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${color}30`, borderRadius: 10, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color }}>{Number(value).toLocaleString('en-US')}</div>
    </div>
  );
}

interface BarTableProps {
  rows: any[];
  labelKey: string;
  valueKey: string;
  extra?: (row: any) => string;
  empty: string;
}
function BarTable({ rows, labelKey, valueKey, extra, empty }: BarTableProps) {
  if (!rows?.length) return <p style={{ color: '#999', padding: 20, textAlign: 'center' }}>{empty}</p>;
  const max = Math.max(...rows.map((r) => Number(r[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.slice(0, 30).map((r, i) => {
        const val = Number(r[valueKey]) || 0;
        const pct = (val / max) * 100;
        return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px', alignItems: 'center', gap: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {r[labelKey] || '—'}
              {extra && <span style={{ display: 'block', fontSize: 11, color: '#666', fontWeight: 400 }}>{extra(r)}</span>}
            </div>
            <div style={{ background: '#f1f5f9', borderRadius: 4, height: 18, overflow: 'hidden' }}>
              <div style={{ background: '#a855f7', height: '100%', width: `${pct}%`, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontWeight: 700, textAlign: 'left', fontFamily: 'monospace' }}>{val.toLocaleString('en-US')}</div>
          </div>
        );
      })}
    </div>
  );
}
