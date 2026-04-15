import React, { useEffect, useState } from 'react';
import { authFetch } from '../../../context/StoreContext';
import { X, Printer, BarChart3, TrendingUp, Target, Package, Handshake, Clock } from 'lucide-react';

type ReportKey = 'daily' | 'source' | 'pre_ordered' | 'stock' | 'partnership' | 'stale';

interface CardDef {
  key: ReportKey;
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  hasDateRange: boolean;
  singleDate?: boolean;
  subtitle: string;
}

const CARDS: CardDef[] = [
  { key: 'daily',       title: 'التقرير اليومي',         icon: BarChart3, color: 'from-blue-500 to-cyan-500',    hasDateRange: false, singleDate: true, subtitle: 'رصيد اليوم والحركات' },
  { key: 'source',      title: 'أداء المصادر',            icon: TrendingUp, color: 'from-green-500 to-emerald-500', hasDateRange: true, subtitle: 'Copart / IAAI / Manheim' },
  { key: 'pre_ordered', title: 'سيارات الطلب المسبق',    icon: Target,     color: 'from-orange-500 to-amber-500', hasDateRange: false, subtitle: 'ودائع وتسليمات' },
  { key: 'stock',       title: 'سيارات المخزون',          icon: Package,    color: 'from-purple-500 to-violet-500', hasDateRange: false, subtitle: 'رأس المال المجمد' },
  { key: 'partnership', title: 'الشراكات',                icon: Handshake,  color: 'from-pink-500 to-rose-500',   hasDateRange: false, subtitle: 'تعرض ومشاركة الأرباح' },
  { key: 'stale',       title: 'السيارات الراكدة',        icon: Clock,      color: 'from-red-500 to-orange-500',  hasDateRange: false, subtitle: 'أكثر من 30 يوماً دون حركة' },
];

async function fetchReport(key: ReportKey, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const urls: Record<ReportKey, string> = {
    daily:       `/api/yard/reports/daily${qs ? '?' + qs : ''}`,
    source:      `/api/yard/reports/source-performance${qs ? '?' + qs : ''}`,
    pre_ordered: `/api/yard/reports/ownership/pre-ordered`,
    stock:       `/api/yard/reports/ownership/stock`,
    partnership: `/api/yard/reports/ownership/partnership`,
    stale:       `/api/yard/reports/stale-vehicles${qs ? '?' + qs : ''}`,
  };
  const r = await authFetch(urls[key]);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function YardReportsDashboard() {
  const [openKey, setOpenKey] = useState<ReportKey | null>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const [singleDate, setSingleDate] = useState(today);
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [daysThreshold, setDaysThreshold] = useState('30');

  const runReport = async (key: ReportKey) => {
    setOpenKey(key); setData(null); setErr(null); setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (key === 'daily') params.date = singleDate;
      if (key === 'source') { params.dateFrom = dateFrom; params.dateTo = dateTo; }
      if (key === 'stale') params.daysThreshold = daysThreshold;
      const j = await fetchReport(key, params);
      setData(j);
    } catch (e: any) {
      setErr(e.message || 'فشل التحميل');
    } finally { setLoading(false); }
  };

  const closeModal = () => { setOpenKey(null); setData(null); setErr(null); };

  return (
    <div className="p-6 text-right" dir="rtl">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-white flex items-center gap-3">
          <BarChart3 className="w-7 h-7 text-orange-500" />
          تقارير الحضيرة 📊
        </h2>
        <p className="text-slate-400 text-sm mt-1">تقارير يومية، أداء المصادر، الملكية، السيارات الراكدة</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CARDS.map(c => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => runReport(c.key)}
              className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${c.color} p-6 text-right hover:scale-[1.02] transition-all shadow-lg`}
            >
              <div className="relative z-10">
                <Icon className="w-10 h-10 text-white/90 mb-3" />
                <h3 className="text-lg font-black text-white mb-1">{c.title}</h3>
                <p className="text-white/80 text-xs">{c.subtitle}</p>
              </div>
              <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-white/10 rounded-full group-hover:scale-125 transition-transform" />
            </button>
          );
        })}
      </div>

      {/* Modal */}
      {openKey && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 print:static print:bg-white print:p-0" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-auto print:bg-white print:text-black print:max-h-none print:border-0">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between print:hidden">
              <h3 className="text-xl font-black text-white">
                {CARDS.find(c => c.key === openKey)?.title}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-bold flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" /> طباعة
                </button>
                <button
                  onClick={closeModal}
                  className="p-2 text-slate-400 hover:text-white"
                  aria-label="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 print:p-4">
              {/* Date selector bar */}
              <div className="bg-slate-800/60 rounded-xl p-4 mb-4 print:hidden">
                {openKey === 'daily' && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-bold text-slate-300">التاريخ:</label>
                    <input type="date" value={singleDate} onChange={(e) => setSingleDate(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2" />
                    <button onClick={() => runReport('daily')} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold">تحديث</button>
                  </div>
                )}
                {openKey === 'source' && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-bold text-slate-300">من:</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2" />
                    <label className="text-sm font-bold text-slate-300">إلى:</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2" />
                    <button onClick={() => runReport('source')} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold">تحديث</button>
                  </div>
                )}
                {openKey === 'stale' && (
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-bold text-slate-300">عتبة الأيام:</label>
                    <input type="number" min={1} value={daysThreshold} onChange={(e) => setDaysThreshold(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 w-24" />
                    <button onClick={() => runReport('stale')} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-bold">تحديث</button>
                  </div>
                )}
              </div>

              {loading && <div className="text-center text-slate-400 py-12">جاري التحميل...</div>}
              {err && <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl">{err}</div>}

              {!loading && !err && data && (
                <ReportBody reportKey={openKey} data={data} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: any; sub?: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 print:border-slate-300">
      <div className="text-xs text-slate-400 mb-1 print:text-slate-600">{label}</div>
      <div className="text-2xl font-black text-white print:text-black">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function ReportBody({ reportKey, data }: { reportKey: ReportKey; data: any }) {
  if (reportKey === 'daily') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatTile label="الرصيد الافتتاحي" value={data.openingBalance} />
          <StatTile label="دخول اليوم" value={data.entriesToday} />
          <StatTile label="مبيعات اليوم" value={data.salesToday} />
          <StatTile label="سحوبات اليوم" value={data.withdrawalsToday} />
          <StatTile label="الرصيد الختامي" value={data.closingBalance} />
        </div>

        <section>
          <h4 className="text-lg font-black text-white mb-2">حسب الحالة</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(data.byStatus || {}).map(([k, v]) => (
              <div key={k} className="bg-slate-800/50 rounded-lg p-3 text-sm">
                <div className="text-slate-400 text-xs">{k}</div>
                <div className="text-white font-black">{String(v)}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 className="text-lg font-black text-white mb-2">حسب الملكية / المصدر</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-400 mb-2">الملكية</div>
              {Object.entries(data.byOwnership || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-slate-800 text-sm">
                  <span className="text-slate-300">{k}</span><span className="text-white font-bold">{String(v)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-2">المصدر</div>
              {Object.entries(data.bySource || {}).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b border-slate-800 text-sm">
                  <span className="text-slate-300">{k}</span><span className="text-white font-bold">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {(data.staleVehicles || []).length > 0 && (
          <section>
            <h4 className="text-lg font-black text-white mb-2">السيارات الراكدة</h4>
            <TableVehicles rows={data.staleVehicles} columns={[
              { key: 'vin', label: 'VIN' }, { key: 'year', label: 'السنة' },
              { key: 'make', label: 'الصنع' }, { key: 'model', label: 'الموديل' },
              { key: 'daysStale', label: 'أيام الركود' }, { key: 'statusLabel', label: 'الحالة' },
            ]} />
          </section>
        )}

        {(data.movements || []).length > 0 && (
          <section>
            <h4 className="text-lg font-black text-white mb-2">حركات البوابة اليوم</h4>
            <TableVehicles rows={data.movements} columns={[
              { key: 'timestamp', label: 'الوقت' }, { key: 'movementType', label: 'النوع' },
              { key: 'vin', label: 'VIN' }, { key: 'gatePassNumber', label: 'رقم التصريح' },
              { key: 'receiverName', label: 'المستلم' },
            ]} />
          </section>
        )}
      </div>
    );
  }

  if (reportKey === 'source') {
    return (
      <div className="overflow-auto">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="p-3">المصدر</th>
              <th className="p-3">عدد السيارات</th>
              <th className="p-3">متوسط الأيام</th>
              <th className="p-3">معدل البيع</th>
              <th className="p-3">متوسط سعر الشراء</th>
              <th className="p-3">متوسط سعر البيع</th>
              <th className="p-3">الهامش %</th>
            </tr>
          </thead>
          <tbody>
            {(data.sources || []).map((s: any) => (
              <tr key={s.source} className="border-b border-slate-800 text-white">
                <td className="p-3 font-bold">{s.source}</td>
                <td className="p-3">{s.totalVehicles}</td>
                <td className="p-3">{s.avgDaysInYard}</td>
                <td className="p-3">{(s.soldRate * 100).toFixed(1)}%</td>
                <td className="p-3">${s.avgPurchasePrice.toLocaleString()}</td>
                <td className="p-3">${s.avgSellPrice.toLocaleString()}</td>
                <td className="p-3">{s.avgMargin}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (reportKey === 'pre_ordered') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label="الإجمالي" value={data.total} />
          <StatTile label="إجمالي الودائع" value={`$${Number(data.depositsCollected || 0).toLocaleString()}`} />
          <StatTile label="تم التسليم" value={data.deliveredCount} />
          <StatTile label="في انتظار التسليم" value={data.pendingDelivery} />
        </div>
        {(data.lateDeliveries || []).length > 0 && (
          <section>
            <h4 className="text-lg font-black text-red-400 mb-2">تسليمات متأخرة (أكثر من 14 يوماً)</h4>
            <TableVehicles rows={data.lateDeliveries} columns={[
              { key: 'vin', label: 'VIN' }, { key: 'year', label: 'السنة' },
              { key: 'make', label: 'الصنع' }, { key: 'model', label: 'الموديل' },
              { key: 'daysWaiting', label: 'أيام الانتظار' },
              { key: 'ownerDealerName', label: 'التاجر' }, { key: 'statusLabel', label: 'الحالة' },
            ]} />
          </section>
        )}
      </div>
    );
  }

  if (reportKey === 'stock') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile label="الإجمالي" value={data.total} />
        <StatTile label="رأس المال المجمد" value={`$${Number(data.capitalTiedUp || 0).toLocaleString()}`} />
        <StatTile label="متوسط الأيام" value={data.avgDaysInYard} />
        <StatTile label="راكد" value={data.staleCount} />
        <StatTile label="متوسط الهامش" value={`${data.avgMarginActualized}%`} />
      </div>
    );
  }

  if (reportKey === 'partnership') {
    return (
      <div className="overflow-auto">
        {(data.partners || []).length === 0 && <div className="text-slate-400 py-8 text-center">لا توجد شراكات مسجلة</div>}
        {(data.partners || []).length > 0 && (
          <table className="w-full text-sm text-right">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="p-3">الشريك</th>
                <th className="p-3">السيارات</th>
                <th className="p-3">الاستثمار</th>
                <th className="p-3">حصة الأرباح</th>
                <th className="p-3">التعرض الحالي</th>
              </tr>
            </thead>
            <tbody>
              {data.partners.map((p: any) => (
                <tr key={p.dealerId} className="border-b border-slate-800 text-white">
                  <td className="p-3 font-bold">{p.dealerName}</td>
                  <td className="p-3">{p.vehicles}</td>
                  <td className="p-3">${Number(p.invested || 0).toLocaleString()}</td>
                  <td className="p-3">${Number(p.profitShare || 0).toLocaleString()}</td>
                  <td className="p-3">${Number(p.currentExposure || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  if (reportKey === 'stale') {
    return (
      <div>
        <div className="mb-3 text-slate-300">إجمالي: <span className="font-black text-white">{data.count}</span> سيارة تجاوزت {data.daysThreshold} يوماً</div>
        <TableVehicles rows={data.vehicles || []} columns={[
          { key: 'vin', label: 'VIN' }, { key: 'year', label: 'السنة' },
          { key: 'make', label: 'الصنع' }, { key: 'model', label: 'الموديل' },
          { key: 'daysStale', label: 'أيام' }, { key: 'statusLabel', label: 'الحالة' },
          { key: 'ownershipType', label: 'الملكية' }, { key: 'lastAction', label: 'آخر حركة' },
        ]} />
      </div>
    );
  }

  return null;
}

function TableVehicles({ rows, columns }: { rows: any[]; columns: { key: string; label: string }[] }) {
  if (!rows || rows.length === 0) {
    return <div className="text-slate-400 py-6 text-center">لا توجد بيانات</div>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm text-right">
        <thead className="bg-slate-800 text-slate-300">
          <tr>{columns.map(c => <th key={c.key} className="p-2 font-bold">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-b border-slate-800 text-white">
              {columns.map(c => (
                <td key={c.key} className="p-2 font-mono text-xs">{formatCell(r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'string' && v.length > 30) return v.slice(0, 30) + '…';
  return String(v);
}

export default YardReportsDashboard;
