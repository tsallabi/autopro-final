import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, Car, Users, TrendingUp, TrendingDown, Receipt, AlertTriangle,
  AlertCircle, Info, CheckCircle2, Wallet, Clock, CreditCard, Shield,
  FileText, Gavel, Plus, Truck, RefreshCw, Eye, UserPlus, ShoppingCart,
  ArrowUpRight, ArrowDownRight, ChevronLeft
} from 'lucide-react';
import { authFetch } from '../../context/StoreContext';

/* ================================================================
   Types
   ================================================================ */
interface KpiData {
  totalSalesMonth: number;
  salesChangePercent: number;
  totalCarsInAuction: number;
  totalRegisteredUsers: number;
  newUsersWeek: number;
  conversionRate: number;
  totalCommissions: number;
  overdueInvoices: number;
}

interface AlertItem {
  id?: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  message: string;
  navigateTo?: string;
  action?: string;  // backend sends 'action' field (view ID)
  count?: number;
  icon?: string;
}

interface RecentSale {
  id: string;
  car: string;
  buyer: string;
  amount: number;
  date: string;
  status: string;
}

interface TopBuyer {
  id: string;
  name: string;
  totalSpent: number;
  bidsCount: number;
  avatar?: string;
}

interface OverviewData {
  kpi: KpiData;
  alerts: AlertItem[];
  recentSales: RecentSale[];
  topBuyers: TopBuyer[];
}

/* ================================================================
   Fallback defaults (used when API is unreachable)
   ================================================================ */
const EMPTY_KPI: KpiData = {
  totalSalesMonth: 0,
  salesChangePercent: 0,
  totalCarsInAuction: 0,
  totalRegisteredUsers: 0,
  newUsersWeek: 0,
  conversionRate: 0,
  totalCommissions: 0,
  overdueInvoices: 0,
};

const EMPTY_DATA: OverviewData = {
  kpi: EMPTY_KPI,
  alerts: [],
  recentSales: [],
  topBuyers: [],
};

/* ================================================================
   Sub-components
   ================================================================ */

/* ---------- KPI Card ---------- */
const KpiCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: string;
  change?: number;
  subtitle?: string;
  accent: string; // tailwind color name: orange, blue, purple, emerald, amber, red
  danger?: boolean;
}> = ({ icon: Icon, label, value, change, subtitle, accent, danger }) => {
  const bgMap: Record<string, string> = {
    orange: 'bg-orange-500/15 text-orange-400',
    blue: 'bg-blue-500/15 text-blue-400',
    purple: 'bg-purple-500/15 text-purple-400',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-400',
    red: 'bg-red-500/15 text-red-400',
  };

  return (
    <div className={`bg-slate-900/80 backdrop-blur-sm border ${danger ? 'border-red-500/40' : 'border-slate-800'} rounded-2xl p-5 hover:border-slate-700 transition-all group`}>
      <div className="flex justify-between items-start mb-3">
        <div className={`p-3 rounded-xl ${bgMap[accent] || bgMap.orange} transition-transform group-hover:scale-110`}>
          <Icon className="w-5 h-5" />
        </div>
        {change !== undefined && change !== 0 && (
          <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${
            change > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {change > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
      <div className={`text-2xl font-black font-mono tracking-tight ${danger ? 'text-red-400' : 'text-white'}`}>{value}</div>
      <div className="text-xs text-slate-400 font-bold mt-1.5">{label}</div>
      {subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{subtitle}</div>}
    </div>
  );
};

/* ---------- Alert Banner ---------- */
const AlertBanner: React.FC<{
  alerts: AlertItem[];
  onNavigate: (view: string) => void;
}> = ({ alerts, onNavigate }) => {
  if (!alerts || alerts.length === 0) return null;

  const colorMap: Record<string, { bg: string; border: string; icon: React.ElementType; text: string }> = {
    danger: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertTriangle, text: 'text-red-400' },
    warning: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: AlertCircle, text: 'text-amber-400' },
    info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: Info, text: 'text-blue-400' },
    success: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: CheckCircle2, text: 'text-emerald-400' },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {alerts.map((alert) => {
        const style = colorMap[alert.type] || colorMap.info;
        const AlertIcon = style.icon;
        return (
          <button
            key={alert.id || alert.message}
            onClick={() => {
              const target = alert.navigateTo || alert.action;
              if (target) onNavigate(target);
            }}
            className={`${style.bg} ${style.border} border rounded-xl p-4 text-right transition-all hover:scale-[1.02] hover:shadow-lg flex items-start gap-3 cursor-pointer`}
          >
            <AlertIcon className={`w-5 h-5 ${style.text} shrink-0 mt-0.5`} />
            <span className={`text-sm font-medium ${style.text}`}>{alert.message}</span>
            {(alert.navigateTo || alert.action) && <ChevronLeft className={`w-4 h-4 ${style.text} shrink-0 mt-0.5 mr-auto`} />}
          </button>
        );
      })}
    </div>
  );
};

/* ---------- Recent Sales Table ---------- */
const RecentSalesTable: React.FC<{ sales: RecentSale[] }> = ({ sales }) => {
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-emerald-500/15 text-emerald-400',
      paid: 'bg-emerald-500/15 text-emerald-400',
      pending: 'bg-amber-500/15 text-amber-400',
      cancelled: 'bg-red-500/15 text-red-400',
    };
    const labels: Record<string, string> = {
      completed: 'مكتمل',
      paid: 'مدفوع',
      pending: 'معلق',
      cancelled: 'ملغي',
    };
    return (
      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${map[status] || 'bg-slate-700 text-slate-400'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-5">
      <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
        <ShoppingCart className="w-4 h-4 text-orange-400" />
        آخر عمليات البيع
      </h4>
      {sales.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">لا توجد مبيعات حديثة</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" dir="rtl">
            <thead>
              <tr className="text-slate-500 text-[11px] font-bold border-b border-slate-800">
                <th className="text-right py-2 px-2">السيارة</th>
                <th className="text-right py-2 px-2">المشتري</th>
                <th className="text-right py-2 px-2">المبلغ</th>
                <th className="text-right py-2 px-2">التاريخ</th>
                <th className="text-right py-2 px-2">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 8).map((sale) => (
                <tr key={sale.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 px-2 text-white font-medium text-xs">{sale.car}</td>
                  <td className="py-2.5 px-2 text-slate-400 text-xs">{sale.buyer}</td>
                  <td className="py-2.5 px-2 text-orange-400 font-bold font-mono text-xs">${sale.amount?.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-slate-500 text-xs">{sale.date}</td>
                  <td className="py-2.5 px-2">{statusBadge(sale.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ---------- Top Buyers List ---------- */
const TopBuyersList: React.FC<{ buyers: TopBuyer[] }> = ({ buyers }) => (
  <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-5">
    <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
      <Users className="w-4 h-4 text-purple-400" />
      أنشط المشترين
    </h4>
    {buyers.length === 0 ? (
      <div className="text-center py-8 text-slate-500 text-sm">لا توجد بيانات</div>
    ) : (
      <div className="space-y-3">
        {buyers.slice(0, 6).map((buyer, idx) => (
          <div key={buyer.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 transition-colors">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
              idx === 0 ? 'bg-amber-500/20 text-amber-400' :
              idx === 1 ? 'bg-slate-400/20 text-slate-300' :
              idx === 2 ? 'bg-orange-700/20 text-orange-500' :
              'bg-slate-700/50 text-slate-400'
            }`}>
              {idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-bold truncate">{buyer.name}</div>
              <div className="text-slate-500 text-[10px]">{buyer.bidsCount} مزايدة</div>
            </div>
            <div className="text-orange-400 font-bold font-mono text-xs">${buyer.totalSpent?.toLocaleString()}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);

/* ================================================================
   Main Component
   ================================================================ */
export const EnhancedOverviewPanel: React.FC<{
  onNavigate: (view: string) => void;
  /* Pass-through props from the parent so the financial liquidity section can reuse existing state */
  stats: any;
  users: any[];
  walletStats: any;
  withdrawalStats: any;
  buyerWalletStats: any;
  receivables: any;
  pendingDeposits: any[];
  overviewMonthly: any[];
}> = ({
  onNavigate,
  stats,
  users,
  walletStats,
  withdrawalStats,
  buyerWalletStats,
  receivables,
  pendingDeposits,
  overviewMonthly,
}) => {
  const [data, setData] = useState<OverviewData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authFetch('/api/admin/dashboard-overview');
      if (res.ok) {
        const json = await res.json();
        setData({
          kpi: { ...EMPTY_KPI, ...json.kpi },
          alerts: Array.isArray(json.alerts) ? json.alerts : [],
          recentSales: Array.isArray(json.recentSales) ? json.recentSales : [],
          topBuyers: Array.isArray(json.topBuyers) ? json.topBuyers : [],
        });
      } else {
        // API not ready yet -- fall back to stats from parent
        setData({
          ...EMPTY_DATA,
          kpi: {
            ...EMPTY_KPI,
            totalSalesMonth: stats?.totalSales || 0,
            totalCarsInAuction: stats?.activeAuctions || 0,
            totalRegisteredUsers: users?.length || 0,
          },
        });
      }
    } catch {
      // Graceful fallback
      setData({
        ...EMPTY_DATA,
        kpi: {
          ...EMPTY_KPI,
          totalSalesMonth: stats?.totalSales || 0,
          totalCarsInAuction: stats?.activeAuctions || 0,
          totalRegisteredUsers: users?.length || 0,
        },
      });
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [stats, users]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const kpi = data.kpi;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">

      {/* ---- Header with refresh ---- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-orange-400" />
            لوحة المعلومات
          </h2>
          <p className="text-slate-500 text-xs mt-1">آخر تحديث: {lastRefresh.toLocaleTimeString('ar-LY')}</p>
        </div>
        <button
          onClick={fetchOverview}
          disabled={loading}
          className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ---- Row 1: KPI Cards (3 columns desktop, 2 mobile) ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          icon={DollarSign}
          label="اجمالي المبيعات هذا الشهر"
          value={`$${kpi.totalSalesMonth.toLocaleString()}`}
          change={kpi.salesChangePercent}
          accent="orange"
        />
        <KpiCard
          icon={Car}
          label="المزادات النشطة"
          value={kpi.totalCarsInAuction.toLocaleString()}
          accent="blue"
        />
        <KpiCard
          icon={Users}
          label="المستخدمين المسجلين"
          value={kpi.totalRegisteredUsers.toLocaleString()}
          subtitle={kpi.newUsersWeek > 0 ? `+${kpi.newUsersWeek} هذا الاسبوع` : undefined}
          accent="purple"
        />
        <KpiCard
          icon={TrendingUp}
          label="معدل التحويل"
          value={`${kpi.conversionRate.toFixed(1)}%`}
          accent="emerald"
        />
        <KpiCard
          icon={Wallet}
          label="اجمالي العمولات"
          value={`$${kpi.totalCommissions.toLocaleString()}`}
          accent="amber"
        />
        <KpiCard
          icon={Receipt}
          label="فواتير متاخرة"
          value={kpi.overdueInvoices.toLocaleString()}
          accent="red"
          danger={kpi.overdueInvoices > 0}
        />
      </div>

      {/* ---- Row 2: Smart Alerts ---- */}
      {data.alerts.length > 0 && (
        <div>
          <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            تنبيهات ذكية
          </h3>
          <AlertBanner alerts={data.alerts} onNavigate={onNavigate} />
        </div>
      )}

      {/* ---- Row 3: Recent Sales + Top Buyers ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <RecentSalesTable sales={data.recentSales} />
        </div>
        <div className="lg:col-span-2">
          <TopBuyersList buyers={data.topBuyers} />
        </div>
      </div>

      {/* ---- Row 4: Financial Liquidity (kept as-is from original) ---- */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-[2rem] p-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-orange-500"></div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 relative z-10 gap-4">
          <div>
            <h3 className="text-white font-black text-xl flex items-center gap-3">
              <Shield className="w-7 h-7 text-emerald-400" />
              الرقابة المالية الشاملة (System Liquidity)
            </h3>
            <p className="text-slate-400 text-xs font-bold mt-1">تتبع السيولة النقدية والمستحقات عبر كافة محافظ المشترين والبائعين</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
            Live Sync Active
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'سيولة محافظ المشترين', value: `$${buyerWalletStats.totalCashBalance.toLocaleString()}`, sub: 'نقدي متاح للمزايدين', color: 'orange', icon: Wallet },
            { label: 'ارصدة البائعين (المتاحة)', value: `$${walletStats.totalAvailable.toLocaleString()}`, sub: 'جاهز للسحب فورا', color: 'emerald', icon: TrendingUp },
            { label: 'فواتير غير مدفوعة', value: `$${(receivables.unpaidPurchase + receivables.unpaidTransport + receivables.unpaidShipping).toLocaleString()}`, sub: 'مستحقات بانتظار التحصيل', color: 'blue', icon: FileText },
            { label: 'طلبات شحن معلقة', value: buyerWalletStats.pendingTopups > 0 ? `${buyerWalletStats.pendingTopups} طلب` : 'لا يوجد', sub: `$${buyerWalletStats.pendingTopupAmount.toLocaleString()} اجمالي المبالغ`, color: 'amber', icon: Clock },
          ].map((card, i) => {
            const Icon = card.icon;
            return (
              <div key={i} className="bg-white/5 hover:bg-white/10 rounded-2xl p-5 transition-all border border-white/5 group">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${
                  card.color === 'orange' ? 'bg-orange-500/20 text-orange-400' :
                  card.color === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                  card.color === 'blue' ? 'bg-blue-500/20 text-blue-400' :
                  card.color === 'amber' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-500/20 text-slate-400'
                }`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="text-2xl font-black text-white font-mono tracking-tight">{card.value}</div>
                <div className="text-xs text-slate-400 font-bold mt-1.5 uppercase tracking-wide">{card.label}</div>
                <div className="text-[10px] text-slate-500 mt-1 capitalize">{card.sub}</div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate('payment_requests')}
            className="px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white rounded-2xl font-black text-xs transition-all flex items-center gap-2 shadow-lg shadow-orange-500/20"
          >
            <CreditCard className="w-4 h-4" />
            مراجعة طلبات شحن المحافظ ({buyerWalletStats.pendingTopups})
          </button>
          <button
            onClick={() => onNavigate('withdrawal_requests')}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-2xl font-black text-xs transition-all flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            طلبات سحب البائعين ({withdrawalStats.pendingCount})
          </button>
          <div className="mr-auto flex flex-wrap gap-6 px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3">
              <div className="text-[10px] text-slate-500 font-bold uppercase">اجمالي العمولات المحصلة</div>
              <div className="text-sm font-black text-emerald-400 font-mono">${walletStats.totalWithdrawn.toLocaleString()}</div>
            </div>
            <div className="w-px h-full bg-white/10 hidden sm:block"></div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] text-slate-500 font-bold uppercase">الالتزامات الضريبية</div>
              <div className="text-sm font-black text-slate-300 font-mono">$0.00</div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Row 5: Quick Actions ---- */}
      <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-5">
        <h4 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
          <Gavel className="w-4 h-4 text-orange-400" />
          اجراءات سريعة
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigate('cars')}
            className="flex items-center justify-between p-4 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-colors border border-slate-700/50"
          >
            <span className="font-medium text-slate-300 text-sm">اضافة سيارة جديدة</span>
            <Plus className="w-5 h-5 text-orange-400" />
          </button>
          <button
            onClick={() => onNavigate('financial_approvals')}
            className="flex items-center justify-between p-4 bg-orange-500/10 hover:bg-orange-500/20 rounded-xl transition-colors border border-orange-500/20"
          >
            <span className="font-medium text-orange-400 text-sm flex items-center gap-2">
              مراجعة الايداعات المعلقة
              {pendingDeposits.length > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{pendingDeposits.length}</span>}
            </span>
            <DollarSign className="w-5 h-5 text-orange-400" />
          </button>
          <button
            onClick={() => onNavigate('manage_live_auctions')}
            className="flex items-center justify-between p-4 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-colors border border-slate-700/50"
          >
            <span className="font-medium text-slate-300 text-sm">مراجعة المزادات المعلقة</span>
            <Gavel className="w-5 h-5 text-blue-400" />
          </button>
          <button
            onClick={() => onNavigate('shipping_settings')}
            className="flex items-center justify-between p-4 bg-slate-800/60 hover:bg-slate-800 rounded-xl transition-colors border border-slate-700/50"
          >
            <span className="font-medium text-slate-300 text-sm">تحديث اسعار الشحن</span>
            <Truck className="w-5 h-5 text-emerald-400" />
          </button>
        </div>
      </div>

      <AccountingSnapshot onNavigate={onNavigate} />
    </div>
  );
};

/* ================================================================
   Accounting Snapshot — quick P&L overview on admin dashboard
   ================================================================ */
const AccountingSnapshot: React.FC<{ onNavigate: (view: string) => void }> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ revenue: number; expenses: number; netProfit: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/accounting/reports/income-statement');
        if (!res.ok) return;
        const d = await res.json();
        if (cancelled) return;
        // API returns { revenue: { total, accounts }, expenses: { total, accounts }, netProfit }
        const revenue = typeof d.revenue === 'object' ? (d.revenue?.total || 0) : (d.revenue || d.totalRevenue || 0);
        const expenses = typeof d.expenses === 'object' ? (d.expenses?.total || 0) : (d.expenses || d.totalExpenses || 0);
        const netProfit = Number(d.netProfit) || (revenue - expenses) || 0;
        setData({
          revenue: Number(revenue) || 0,
          expenses: Number(expenses) || 0,
          netProfit: Number(netProfit) || 0,
        });
      } catch { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const fmt = (n: number) => {
    const safeNum = typeof n === 'number' && !isNaN(n) ? n : 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(safeNum);
  };

  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-700/50 p-6" dir="rtl">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-orange-500" />
          لمحة محاسبية سريعة
        </h3>
        <button onClick={() => onNavigate('accounting_dashboard')} className="text-xs font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1">
          عرض كامل <ChevronLeft className="w-3 h-3" />
        </button>
      </div>
      {loading ? (
        <div className="text-center text-slate-500 py-6 text-sm">جارٍ التحميل...</div>
      ) : !data ? (
        <div className="text-center text-slate-500 py-6 text-sm">لا توجد بيانات محاسبية بعد</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">إيرادات</div>
            <div className="text-xl font-black text-emerald-400">{fmt(data.revenue)}</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">مصاريف</div>
            <div className="text-xl font-black text-red-400">{fmt(data.expenses)}</div>
          </div>
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="text-xs text-slate-400 mb-1">صافي الربح</div>
            <div className={`text-xl font-black ${data.netProfit >= 0 ? 'text-orange-400' : 'text-red-400'}`}>{fmt(data.netProfit)}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedOverviewPanel;
