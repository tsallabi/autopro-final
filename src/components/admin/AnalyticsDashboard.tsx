import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, Users, Eye, Clock, RefreshCw, Monitor, Smartphone, Tablet,
  Globe, BarChart3, Activity, Calendar, ChevronDown
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { authFetch } from '../../context/StoreContext';

type Range = 'today' | 'week' | 'month' | 'year';

interface OverviewData {
  range: Range;
  kpis: {
    totalVisits: number;
    uniqueVisitors: number;
    loggedInVisitors: number;
    avgSessionDuration: number;
  };
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ referrer: string; visits: number }>;
  deviceBreakdown: Array<{ device: string; count: number }>;
  browserBreakdown: Array<{ browser: string; count: number }>;
  dailyTimeline: Array<{ date: string; visits: number; uniqueVisitors: number }>;
  hourlyTraffic: Array<{ hour: number; visits: number }>;
}

interface RealtimeData {
  activeNow: number;
  recentPages: Array<{ path: string; count: number }>;
}

const RANGE_LABELS: Record<Range, string> = {
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'آخر 30 يوم',
  year: 'آخر سنة',
};

const DEVICE_COLORS: Record<string, string> = {
  desktop: '#3b82f6',
  mobile: '#10b981',
  tablet: '#f59e0b',
};

const DEVICE_LABELS: Record<string, string> = {
  desktop: 'حاسوب',
  mobile: 'جوال',
  tablet: 'تابلت',
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 1) return '0 ث';
  if (seconds < 60) return `${Math.round(seconds)} ث`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m} د ${s} ث`;
};

const shortenReferrer = (ref: string): string => {
  if (!ref) return 'مباشر';
  try {
    const u = new URL(ref);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return ref.length > 40 ? ref.slice(0, 40) + '…' : ref;
  }
};

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div className="bg-slate-800/60 backdrop-blur border border-slate-700 rounded-2xl p-5 flex items-center gap-4 shadow-lg hover:border-slate-600 transition">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent}`}>
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-xs text-slate-400 font-bold mb-1">{label}</div>
      <div className="text-2xl font-black text-white truncate">{value}</div>
    </div>
  </div>
);

export const AnalyticsDashboard: React.FC = () => {
  const [range, setRange] = useState<Range>('week');
  const [data, setData] = useState<OverviewData | null>(null);
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/admin/analytics/overview?range=${range}`);
      if (!res.ok) throw new Error('فشل تحميل البيانات');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'خطأ غير معروف');
    } finally {
      setLoading(false);
    }
  }, [range]);

  const loadRealtime = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/analytics/realtime');
      if (res.ok) setRealtime(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview, refreshTick]);

  useEffect(() => {
    loadRealtime();
    const i = setInterval(loadRealtime, 15000);
    return () => clearInterval(i);
  }, [loadRealtime]);

  const totalDevices = (data?.deviceBreakdown || []).reduce((s, d) => s + d.count, 0);

  return (
    <div className="p-4 md:p-8 space-y-6 text-right" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-orange-400" />
            تحليلات الزوار 📈
          </h2>
          <p className="text-slate-400 font-medium text-sm mt-1">
            تتبع شامل لحركة الزيارات، المصادر، والأجهزة — لاتخاذ قرارات تسويقية مبنية على البيانات
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
              className="appearance-none bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-2.5 pr-10 font-bold focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              {(['today', 'week', 'month', 'year'] as Range[]).map(r => (
                <option key={r} value={r}>{RANGE_LABELS[r]}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <button
            onClick={() => setRefreshTick(t => t + 1)}
            className="bg-slate-800 border border-slate-700 text-white rounded-xl p-2.5 hover:bg-slate-700 transition"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Realtime widget */}
      {realtime && (
        <div className="bg-gradient-to-r from-emerald-900/40 to-slate-800/60 border border-emerald-700/50 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping absolute" />
              <div className="w-3 h-3 rounded-full bg-emerald-500 relative" />
            </div>
            <div>
              <div className="text-xs text-emerald-300 font-bold">زوار نشطون الآن</div>
              <div className="text-3xl font-black text-white">{realtime.activeNow}</div>
            </div>
          </div>
          {realtime.recentPages.length > 0 && (
            <div className="flex-1 md:border-r md:border-emerald-800/50 md:pr-4">
              <div className="text-xs text-emerald-300 font-bold mb-2">أكثر الصفحات نشاطاً (آخر 5 دقائق)</div>
              <div className="flex flex-wrap gap-2">
                {realtime.recentPages.map((p, i) => (
                  <span key={i} className="bg-emerald-900/50 border border-emerald-700/50 text-emerald-200 text-xs px-2 py-1 rounded-lg font-mono">
                    {p.path} <span className="text-emerald-400 font-bold">({p.count})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl p-4 font-bold">
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<Eye className="w-6 h-6 text-white" />}
          label="إجمالي الزيارات"
          value={(data?.kpis.totalVisits || 0).toLocaleString('ar-EG')}
          accent="bg-blue-500"
        />
        <KpiCard
          icon={<Users className="w-6 h-6 text-white" />}
          label="الزوار الفريدون"
          value={(data?.kpis.uniqueVisitors || 0).toLocaleString('ar-EG')}
          accent="bg-emerald-500"
        />
        <KpiCard
          icon={<Users className="w-6 h-6 text-white" />}
          label="زوار مسجلون"
          value={(data?.kpis.loggedInVisitors || 0).toLocaleString('ar-EG')}
          accent="bg-purple-500"
        />
        <KpiCard
          icon={<Clock className="w-6 h-6 text-white" />}
          label="متوسط الجلسة"
          value={formatDuration(data?.kpis.avgSessionDuration || 0)}
          accent="bg-orange-500"
        />
      </div>

      {/* Daily timeline */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            حركة الزيارات اليومية
          </h3>
          <span className="text-xs text-slate-400 font-bold">{RANGE_LABELS[range]}</span>
        </div>
        <div className="h-64">
          {data?.dailyTimeline && data.dailyTimeline.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.dailyTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff' }}
                  labelStyle={{ color: '#cbd5e1' }}
                />
                <Legend wrapperStyle={{ color: '#cbd5e1', fontSize: 12 }} />
                <Line type="monotone" dataKey="visits" name="الزيارات" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="uniqueVisitors" name="زوار فريدون" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 font-bold">
              {loading ? 'جاري التحميل...' : 'لا توجد بيانات'}
            </div>
          )}
        </div>
      </div>

      {/* Two column: top pages + referrers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
          <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-orange-400" />
            أكثر الصفحات زيارة
          </h3>
          <div className="space-y-2">
            {(data?.topPages || []).length === 0 && (
              <div className="text-slate-500 font-bold text-center py-6">لا توجد بيانات</div>
            )}
            {(data?.topPages || []).map((p, i) => {
              const max = data!.topPages[0].views || 1;
              const pct = (p.views / max) * 100;
              return (
                <div key={i} className="group">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-200 font-mono truncate flex-1 ml-2">{p.path}</span>
                    <span className="text-white font-black">{p.views.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-l from-orange-500 to-orange-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
          <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-emerald-400" />
            أكثر المصادر
          </h3>
          <div className="space-y-2">
            {(data?.topReferrers || []).length === 0 && (
              <div className="text-slate-500 font-bold text-center py-6">لا توجد مصادر مسجلة</div>
            )}
            {(data?.topReferrers || []).map((r, i) => {
              const max = data!.topReferrers[0]?.visits || 1;
              const pct = (r.visits / max) * 100;
              return (
                <div key={i} className="group">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-200 truncate flex-1 ml-2" title={r.referrer}>{shortenReferrer(r.referrer)}</span>
                    <span className="text-white font-black">{r.visits.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-l from-emerald-500 to-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Devices + Browsers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
          <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4">
            <Monitor className="w-5 h-5 text-blue-400" />
            توزيع الأجهزة
          </h3>
          <div className="grid grid-cols-5 gap-4 items-center">
            <div className="col-span-2 h-48">
              {data?.deviceBreakdown && data.deviceBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.deviceBreakdown}
                      dataKey="count"
                      nameKey="device"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {data.deviceBreakdown.map((d, i) => (
                        <Cell key={i} fill={DEVICE_COLORS[d.device] || PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 font-bold text-sm">لا توجد بيانات</div>
              )}
            </div>
            <div className="col-span-3 space-y-3">
              {(data?.deviceBreakdown || []).map((d, i) => {
                const pct = totalDevices ? (d.count / totalDevices) * 100 : 0;
                const Icon = d.device === 'mobile' ? Smartphone : d.device === 'tablet' ? Tablet : Monitor;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2 text-slate-200 font-bold">
                        <Icon className="w-4 h-4" style={{ color: DEVICE_COLORS[d.device] || '#94a3b8' }} />
                        {DEVICE_LABELS[d.device] || d.device}
                      </span>
                      <span className="text-white font-black">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: DEVICE_COLORS[d.device] || '#94a3b8' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
          <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-purple-400" />
            المتصفحات
          </h3>
          <div className="h-56">
            {data?.browserBreakdown && data.browserBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.browserBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="browser" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff' }}
                    cursor={{ fill: '#334155' }}
                  />
                  <Bar dataKey="count" name="زيارات" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 font-bold">لا توجد بيانات</div>
            )}
          </div>
        </div>
      </div>

      {/* Hourly traffic */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5">
        <h3 className="text-lg font-black text-white flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-amber-400" />
          حركة اليوم (على مدار الساعة)
        </h3>
        <div className="h-56">
          {data?.hourlyTraffic && data.hourlyTraffic.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hourlyTraffic}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="hour" stroke="#94a3b8" fontSize={11} tickFormatter={(h) => `${h}:00`} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#fff' }}
                  cursor={{ fill: '#334155' }}
                  labelFormatter={(h) => `الساعة ${h}:00`}
                />
                <Bar dataKey="visits" name="زيارات" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 font-bold">لا توجد بيانات لليوم</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
