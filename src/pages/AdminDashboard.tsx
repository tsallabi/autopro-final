import React, { useState, useEffect, useRef } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Database, RefreshCw, AlertTriangle, CheckCircle2, Car, DollarSign, Users,
  Plus, Trash2, Edit, Building2, FileText, Mail, Wallet, Truck, ShieldCheck,
  Store, Gavel, List, File, History, HelpCircle, Settings, Filter, MessageSquare, MoreVertical,
  Code2, UploadCloud, Globe, Search, ShoppingCart, Ship, Check, Reply, Link as LinkIcon, Calculator, Info,
  Shield, BookOpen, TrendingUp, Bell, Handshake, CreditCard, MapPin, Clock, X, XCircle, Map, Zap, Trophy, Eye, UserPlus, ClipboardCheck, Download, Share2, Send, AlertCircle, Receipt, PlusCircle, Menu, ShieldAlert, User, LogOut, Key, Hash, BarChart3
} from 'lucide-react';

import { NotificationDropdown } from '../components/NotificationDropdown';
import { MessageDropdown } from '../components/MessageDropdown';
import { useStore, authFetch } from '../context/StoreContext';
import { Car as CarType } from '../types';
import { CopartAuctionSystem } from '../components/CopartAuctionSystem';
import { UnifiedCarForm } from '../components/UnifiedCarForm';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReportsPanel } from '../components/admin/ReportsPanel';
import { KycReviewPanel } from '../components/admin/KycReviewPanel';
import { EnhancedOverviewPanel } from '../components/admin/EnhancedOverview';
import { EmployeeManagementPanel } from '../components/admin/EmployeeManagement';
import { AccountingDashboard } from '../components/admin/accounting/AccountingDashboard';
import { InvoicesList } from '../components/admin/accounting/InvoicesList';
import { InvoiceDetail } from '../components/admin/accounting/InvoiceDetail';
import { JournalEntries } from '../components/admin/accounting/JournalEntries';
import { ChartOfAccounts } from '../components/admin/accounting/ChartOfAccounts';
import { ReportsHub } from '../components/admin/accounting/ReportsHub';
import { AnalyticsDashboard } from '../components/admin/AnalyticsDashboard';
import { YardMap } from '../components/admin/yard/YardMap';
import { QuickVINScan } from '../components/admin/yard/QuickVINScan';
import { YardReportsDashboard } from '../components/admin/yard/YardReportsDashboard';
import { GateInForm } from '../components/admin/yard/GateInForm';
import { GateOutForm } from '../components/admin/yard/GateOutForm';
import { VehicleDetail as YardVehicleDetail } from '../components/admin/yard/VehicleDetail';
import { VehiclesList as YardVehiclesList } from '../components/admin/yard/VehiclesList';
import AuditWorkflow from '../components/admin/yard/AuditWorkflow';

/* ============================================================
   SellerInfoRow — Lazy-loaded seller info for car review cards
   ============================================================ */
function SellerInfoRow({ sellerId, users }: { sellerId: string; users: any[] }) {
  if (!sellerId) return <span className="text-slate-500 text-xs">تاجر نظامي (بدون حساب بائع)</span>;

  const info = users.find((u: any) => u.id === sellerId);
  if (!info) return <span className="text-slate-500 text-xs">بائع: {sellerId}</span>;

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-orange-400 font-bold text-sm">
        {(info.firstName || '?')[0]}
      </div>
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <span className="text-slate-500">الاسم: </span>
          <span className="text-white font-bold">{info.firstName} {info.lastName}</span>
        </div>
        <div>
          <span className="text-slate-500">الحالة: </span>
          <span className={`font-bold ${info.status === 'active' ? 'text-emerald-400' : info.kycStatus === 'approved' ? 'text-emerald-400' : 'text-amber-400'}`}>
            {info.status === 'active' ? 'موثق' : 'غير موثق'}
          </span>
        </div>
        <div>
          <span className="text-slate-500">الرصيد: </span>
          <span className="text-white font-bold">${Number(info.deposit || 0).toLocaleString()}</span>
        </div>
        <div>
          <span className="text-slate-500">الدور: </span>
          <span className="text-white font-bold">{info.role === 'seller' ? 'بائع' : info.role === 'admin' ? 'مدير' : info.role}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FooterSettingsPanel — Admin panel to control SiteFooter
   ============================================================ */
export const FOOTER_KEY = 'autopro_footer_settings_v7';
export const FOOTER_DEFAULT = {
  description: 'منصة مزادات السيارات الأولى في ليبيا — شراء، بيع، شحن دولي بكل شفافية.',
  phone: '+218 91 234 5678',
  email: 'info@autopro.ly',
  address: 'طرابلس، ليبيا',
  facebook: '#', twitter: '#', instagram: '#', youtube: '#',
  companyLinks: [
    { label: 'footer.aboutCompany', href: '/about' },
    { label: 'footer.howItWorks', href: '/how-it-works' },
    { label: 'footer.branches', href: '/branches' },
    { label: 'footer.careers', href: '/careers' },
  ],
  serviceLinks: [
    { label: 'footer.liveAuctions', href: '/marketplace?tab=live' },
    { label: 'footer.browseCars', href: '/marketplace' },
    { label: 'footer.costCalculator', href: '/calculator' },
    { label: 'footer.shippingServices', href: '/shipping' },
  ],
  legalLinks: [
    { label: 'footer.termsAndConditions', href: '/terms' },
    { label: 'footer.privacyPolicy', href: '/privacy' },
    { label: 'footer.refundPolicy', href: '/refund' },
  ],
};

const TEAM_PERMISSIONS: Record<string, string[]> = {
  'registration': ['overview', 'user_management', 'kyc_review', 'messages'],
  'accounting': ['overview', 'financial_approvals', 'payment_requests', 'withdrawal_requests', 'all_invoices', 'financial_ledger', 'expenses', 'payment_gateways'],
  'purchasing': ['overview', 'cars', 'inventory_review', 'manage_live_auctions', 'marketplace_management', 'reports'],
  'transport': ['overview', 'shipments_tracking', 'document_approvals'],
  'clearance': ['overview', 'shipments_tracking', 'document_approvals'],
  'shipping': ['overview', 'shipments_tracking', 'document_approvals', 'shipping_settings'],
  'complaints': ['overview', 'messages', 'user_management'],
  'admin': ['*'],
};

/* ============================================================
   ManageLiveAuctionsPanel
   ============================================================ */

const ManageLiveAuctionsPanel: React.FC<{ currentUser: any }> = ({ currentUser }) => {
  const [data, setData] = useState<any>({ wonCars: [], offerCars: [], scheduledCars: [], counterCars: [], unscheduledCars: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'won' | 'offer' | 'scheduled' | 'counter' | 'unscheduled'>('scheduled');
  const { showAlert, showConfirm } = useStore();
  const [refresh, setRefresh] = useState(0);

  // Edit State for Scheduling
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState({ startTime: '', endTime: '', retries: 1 });

  // Mark Sold State
  const [markSoldId, setMarkSoldId] = useState<string | null>(null);
  const [soldData, setSoldData] = useState({ winnerId: '', amount: 0 });

  const API_BASE = '';

  useEffect(() => {
    authFetch(`/api/admin/manage-live-auctions`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        showAlert('فشل في جلب البيانات', 'error');
        setLoading(false);
      });
  }, [refresh]); // eslint-disable-line -- showAlert is stable, don't include it

  const handleAction = async (url: string, method: string, body?: any) => {
    try {
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
      });
      if (res.ok) {
        showAlert('تمت العملية بنجاح', 'success');
        setRefresh(r => r + 1);
        if (url.includes('schedule')) setEditingId(null);
        if (url.includes('mark-sold')) setMarkSoldId(null);
      } else {
        const d = await res.json();
        showAlert(d.error || 'فشلت العملية', 'error');
      }
    } catch {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    }
  };

  if (loading) return <div className="p-10 text-center animate-pulse text-slate-400 font-bold">جاري تحميل البيانات...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      <div>
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
          <Gavel className="w-8 h-8 text-orange-500" />
          إدارة مزاداتنا الحية
        </h2>
        <p className="text-slate-500 text-sm mt-1">تتبع السيارات المباعة، إدارة العروض، وجدولة المزادات القادمة</p>
      </div>

      {/* Tabs */}
      <div className="flex bg-white rounded-2xl border border-slate-200 p-1 shadow-sm w-fit overflow-x-auto max-w-full">
        {[
          { id: 'unscheduled', label: 'غير مجدولة', count: data.unscheduledCars?.length || 0, icon: Clock },
          { id: 'scheduled', label: 'المزادات المجدولة', count: data.scheduledCars?.length || 0, icon: Clock },
          { id: 'offer', label: 'عروض قيد التفاوض', count: data.offerCars?.length || 0, icon: Handshake },
          { id: 'counter', label: 'انتظار الموافقة / عروض مضادة', count: data.counterCars?.length || 0, icon: AlertCircle },
          { id: 'won', label: 'السيارات المربوحة', count: data.wonCars?.length || 0, icon: Trophy }
        ].map(t => (
          <button key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === t.id ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
            <span className={`px-2 auto bg-slate-900/10 rounded-full text-xs ml-1 ${activeTab === t.id ? 'text-white' : ''}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {activeTab === 'won' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm min-w-[1000px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4">السيارة</th>
                <th className="p-4">رقم اللوت (VIN)</th>
                <th className="p-4">الفائز والبائع</th>
                <th className="p-4">مبلغ البيع</th>
                <th className="p-4">المتابعة والتنبيهات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.wonCars.length === 0 && <tr><td colSpan={5} className="p-10 text-center font-bold text-slate-400">لا توجد سيارات مربوحة</td></tr>}
              {data.wonCars.map((car: any) => (
                <tr key={car.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-black text-slate-800">{car.year} {car.make} {car.model}</td>
                  <td className="p-4 font-mono text-slate-500">{car.lotNumber} <br /><span className="text-xs">{car.vin}</span></td>
                  <td className="p-4">
                    <div className="font-bold text-slate-700">{car.winnerFirstName} {car.winnerLastName}</div>
                    <div className="text-[10px] text-slate-400 mb-2">{car.winnerEmail}</div>
                    
                    <div className="text-[10px] bg-slate-100 text-slate-600 rounded p-1 mb-1 font-bold">
                      البائع: {car.sellerFullName}
                    </div>
                    <div className="text-[10px] bg-slate-100 text-slate-600 rounded p-1 font-bold">
                      محاولات المزاد: {car.auctionSessionCount || 0} من {car.maxAuctionRetries || 1}
                    </div>
                  </td>
                  <td className="p-4 font-black text-lg text-emerald-600">${Number(car.currentBid || 0).toLocaleString()}</td>
                  <td className="p-4 text-xs">
                    <div className="text-[10px] font-bold text-slate-600 text-left mb-1" dir="rtl">
                      تاريخ البيع: <span dir="ltr" className="font-normal text-slate-500">{new Date(car.auctionEndDate || Date.now()).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {car.acceptedByName && (
                      <div className="text-[10px] bg-indigo-50 text-indigo-700 rounded p-1 mb-2 font-bold w-fit ml-auto">
                        مُعتمد البيع: {car.acceptedByName}
                      </div>
                    )}
                    
                    <div className="flex flex-col gap-1 mt-2">
                       {car.notificationSent ? (
                         <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded inline-flex items-center gap-1 w-fit font-bold"><CheckCircle2 className="w-3 h-3"/> تم الإشعار</span>
                       ) : (
                         <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-1 rounded inline-flex items-center gap-1 w-fit font-bold"><XCircle className="w-3 h-3"/> جاري التنبيه...</span>
                       )}
                       
                       {car.invoiceCreated ? (
                         <div className={`text-[10px] px-2 py-1 rounded inline-flex items-center gap-1 w-fit border ${car.invoiceViewed ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600'} font-bold`}>
                           <FileText className="w-3 h-3" />
                           {car.invoiceViewed ? 'عُرضت الفاتورة 👁️' : 'أُرسلت (لم تُشاهد) ❌'}
                         </div>
                       ) : (
                         <div className="text-[10px] px-2 py-1 rounded inline-flex items-center gap-1 w-fit border border-slate-200 bg-slate-50 text-slate-400 font-bold">
                           <RefreshCw className="w-3 h-3" /> جاري الفوترة...
                         </div>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {activeTab === 'offer' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm min-w-[1000px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4">السيارة</th>
                <th className="p-4">أعلى عرض والمقدم</th>
                <th className="p-4">الحد الأدنى (Reserve)</th>
                <th className="p-4">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.offerCars.length === 0 && <tr><td colSpan={4} className="p-10 text-center font-bold text-slate-400">لا توجد سيارات في سوق العروض</td></tr>}
              {data.offerCars.map((car: any) => (
                <tr key={car.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-black text-slate-800">{car.year} {car.make} {car.model}</td>
                  <td className="p-4">
                    <div className="font-black text-lg text-emerald-600">${Number(car.highestOffer || 0).toLocaleString()}</div>
                    {car.bidderDetails ? (
                      <div className="text-xs text-slate-500 font-bold">{car.bidderDetails.firstName} {car.bidderDetails.lastName}</div>
                    ) : <span className="text-xs text-slate-400">بدون عروض</span>}
                  </td>
                  <td className="p-4 font-bold text-slate-600">${Number(car.reservePrice || 0).toLocaleString()}</td>
                  <td className="p-4 flex gap-2 flex-wrap max-w-[250px]">
                    <button onClick={() => handleAction(`/api/offers/${car.id}/accept`, 'POST')} disabled={!car.highestOffer}
                      className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-600 disabled:opacity-50">قبول العرض</button>
                    <button onClick={() => {
                        const amount = window.prompt(`أدخل مبلغ العرض المضاد للسيارة:\n(${car.year} ${car.make} ${car.model})`);
                        if(amount && !isNaN(Number(amount))) {
                           handleAction(`/api/offers/${car.id}/counter`, 'POST', { counterAmount: Number(amount) });
                        }
                      }} disabled={!car.highestOffer}
                      className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-amber-600 disabled:opacity-50">عرض مضاد</button>
                    <button onClick={() => handleAction(`/api/offers/${car.id}/reject`, 'POST')}
                      className="bg-rose-500 text-white px-3 py-1.5 rounded-lg text-xs font-black hover:bg-rose-600">رفض و إرجاع للمزاد</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {activeTab === 'counter' && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm min-w-[1000px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4">السيارة</th>
                <th className="p-4">أعلى عرض والمقدم</th>
                <th className="p-4">السعر المضاد للإدارة</th>
                <th className="p-4">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.counterCars?.length === 0 && <tr><td colSpan={4} className="p-10 text-center font-bold text-slate-400">لا توجد منتجات بانتظار التفاوض</td></tr>}
              {data.counterCars?.map((car: any) => (
                <tr key={car.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-black text-slate-800">{car.year} {car.make} {car.model}</td>
                  <td className="p-4">
                    <div className="font-bold text-lg text-emerald-600">${Number(car.highestOffer || 0).toLocaleString()}</div>
                    <div className="text-[10px] text-slate-400 uppercase">مقدم من المشتري</div>
                  </td>
                  <td className="p-4">
                    <div className="font-black text-xl text-amber-500">${Number(car.sellerCounterPrice || 0).toLocaleString()}</div>
                    <div className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded w-fit mt-1 font-bold">بانتظار رد المشتري</div>
                  </td>
                  <td className="p-4 flex gap-2">
                    <button onClick={() => handleAction(`/api/offers/${car.id}/accept`, 'POST')} disabled={!car.highestOffer}
                      className="bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-100 transition-colors disabled:opacity-50">قبول استثنائي</button>
                    <button onClick={() => handleAction(`/api/offers/${car.id}/reject`, 'POST')}
                      className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-black hover:bg-rose-100 transition-colors">إلغاء وإرجاع للمزاد</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {(activeTab === 'scheduled' || activeTab === 'unscheduled') && (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4">السيارة (VIN)</th>
                <th className="p-4">تاريخ البداية والنهاية</th>
                <th className="p-4">مرات الدخول وإعادة الطرح</th>
                <th className="p-4">الحالة</th>
                <th className="p-4 w-60">إجراءات الإدارة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data[activeTab === 'scheduled' ? 'scheduledCars' : 'unscheduledCars'].length === 0 && <tr><td colSpan={5} className="p-10 text-center font-bold text-slate-400">لا توجد مزادات في هذه القائمة</td></tr>}
              {data[activeTab === 'scheduled' ? 'scheduledCars' : 'unscheduledCars'].map((car: any) => (
                <tr key={car.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-black text-slate-800">{car.year} {car.make} {car.model}</div>
                    <div className="text-xs text-slate-400 font-mono mt-1">{car.vin}</div>
                  </td>
                  {editingId === car.id ? (
                    <td colSpan={2} className="p-4 bg-orange-50/50">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                          <label className="text-xs w-16">البداية:</label>
                          <input type="datetime-local" title="تاريخ بداية المزاد" className="border text-xs p-1 rounded" value={scheduleData.startTime} onChange={e => setScheduleData({ ...scheduleData, startTime: e.target.value })} />
                        </div>
                        <div className="flex gap-2 items-center">
                          <label className="text-xs w-16">النهاية:</label>
                          <input type="datetime-local" title="تاريخ نهاية المزاد" className="border text-xs p-1 rounded" value={scheduleData.endTime} onChange={e => setScheduleData({ ...scheduleData, endTime: e.target.value })} />
                        </div>
                        <div className="flex gap-2 items-center">
                          <label className="text-xs w-16">إعادات الطرح:</label>
                          <input type="number" title="مرات إعادة الطرح" min={1} max={10} className="border text-xs p-1 rounded w-16" value={scheduleData.retries} onChange={e => setScheduleData({ ...scheduleData, retries: parseInt(e.target.value) })} />
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="p-4 text-xs text-slate-600 font-bold" dir="ltr">
                        <div className="text-emerald-600 mb-1">{car.auctionStartTime ? new Date(car.auctionStartTime).toLocaleString('ar-EG') : 'غير محدد'}</div>
                        <div className="text-rose-600">{car.auctionEndDate ? new Date(car.auctionEndDate).toLocaleString('ar-EG') : 'غير محدد'}</div>
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold">{car.auctionSessionCount || 0} من {car.maxAuctionRetries || 1} مرة</span>
                      </td>
                    </>
                  )}

                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-black ${car.status === 'live' ? 'bg-emerald-100 text-emerald-700 animate-pulse' : 'bg-orange-100 text-orange-700'}`}>
                      {car.status === 'live' ? 'لايف الآن' : (car.status === 'upcoming' ? 'مجدول' : 'بانتظار الموافقة')}
                    </span>
                  </td>

                  <td className="p-4 flex flex-col gap-2">
                    {editingId === car.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => handleAction(`/api/admin/cars/${car.id}/schedule`, 'PUT', { auctionStartTime: scheduleData.startTime, auctionEndDate: scheduleData.endTime, maxAuctionRetries: scheduleData.retries })} className="bg-emerald-500 text-white px-2 py-1 rounded text-xs">حفظ</button>
                        <button onClick={() => setEditingId(null)} className="bg-slate-200 text-slate-600 px-2 py-1 rounded text-xs">إلغاء</button>
                      </div>
                    ) : (
                      <button onClick={() => {
                        setScheduleData({
                          startTime: car.auctionStartTime ? new Date(car.auctionStartTime).toISOString().slice(0, 16) : '',
                          endTime: car.auctionEndDate ? new Date(car.auctionEndDate).toISOString().slice(0, 16) : '',
                          retries: car.maxAuctionRetries || 1
                        });
                        setEditingId(car.id);
                        setMarkSoldId(null);
                      }} className="bg-slate-100 text-slate-600 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold w-full">تعديل الجدولة</button>
                    )}

                    {markSoldId === car.id ? (
                      <div className="flex flex-col gap-2 bg-slate-50 p-2 rounded border border-slate-200 mt-2">
                        <input type="text" placeholder="ID الفائز" className="text-xs p-1 border rounded" value={soldData.winnerId} onChange={e => setSoldData({ ...soldData, winnerId: e.target.value })} />
                        <input type="number" placeholder="مبلغ البيع" className="text-xs p-1 border rounded" value={soldData.amount || ''} onChange={e => setSoldData({ ...soldData, amount: parseInt(e.target.value) })} />
                        <div className="flex gap-1">
                          <button onClick={() => handleAction(`/api/admin/cars/${car.id}/mark-sold`, 'POST', { winnerId: soldData.winnerId, soldAmount: soldData.amount })} className="bg-emerald-500 text-white px-2 py-1 text-[10px] rounded">تأكيد البيع</button>
                          <button onClick={() => setMarkSoldId(null)} className="bg-slate-200 text-slate-600 px-2 py-1 text-[10px] rounded">إلغاء</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setMarkSoldId(car.id); setEditingId(null); }} className="bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 px-3 py-1.5 rounded-lg text-xs font-bold w-full">إرساء الفوز يدويًا</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================
   ExternalLogsViewer — Real-time tracking of sent messages
   ============================================================ */
const ExternalLogsViewer: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [trialEmail, setTrialEmail] = useState('tsallabi@yahoo.ca');
  const [trialPhone, setTrialPhone] = useState('00353894435368');

  const fetchLogs = async () => {
    try {
      const res = await authFetch('/api/admin/external-notifications');
      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch logs', e);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // Auto-refresh
    return () => clearInterval(interval);
  }, []);

  const handleTest = async () => {
    if (!trialEmail && !trialPhone) {
      alert('الرجاء إدخال إيميل أو رقم هاتف للتجربة');
      return;
    }

    setTesting(true);
    try {
      const res = await authFetch('/api/admin/external-notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trialEmail, phone: trialPhone })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        const emailRes = data.results.find((r: any) => r.type === 'email');
        const waRes = data.results.find((r: any) => r.type === 'whatsapp');

        let msg = 'نتائج التجربة:\n';
        if (emailRes) msg += `📧 البريد الإلكتروني: ${emailRes.status === 'success' ? '✅ تم بنجاح' : `❌ فشل (${emailRes.message})`}\n`;
        if (waRes) msg += `💬 الواتساب: ${waRes.status === 'success' ? '✅ تم بنجاح' : `❌ فشل (${waRes.message})`}\n`;

        alert(msg);
        fetchLogs();
      } else {
        alert(`❌ فشل الاتصال بالخادم. الخطأ: ${data.error || 'Unknown error'}`);
      }
    } catch (e) {
      alert('❌ فشل إرسال التجربة، السيرفر لا يستجيب');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl p-8 mt-12 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/50 rounded-full -mr-16 -mt-16"></div>
      
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6 relative z-10">
        <div>
          <h3 className="font-black text-2xl text-slate-800 flex items-center gap-3">
            <Share2 className="w-8 h-8 text-indigo-500" />
            سجل الإشعارات الخارجية (Email / WhatsApp)
          </h3>
          <p className="text-slate-500 font-bold text-sm mt-1">متابعة حالة الرسائل الصادرة من النظام لحظياً.</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-tight">إيميل التجربة</label>
            <input 
              type="text" 
              value={trialEmail} 
              onChange={e => setTrialEmail(e.target.value)}
              placeholder="example@mail.com"
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold w-48 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-tight">رقم واتساب التجربة</label>
            <input 
              type="text" 
              value={trialPhone} 
              onChange={e => setTrialPhone(e.target.value)}
              placeholder="00218..."
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold w-48 focus:border-indigo-500 outline-none transition-all"
              dir="ltr"
            />
          </div>
          <button
            onClick={handleTest}
            disabled={testing}
            className="self-end bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-black transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-indigo-100 mt-2 lg:mt-0"
          >
            {testing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            إرسال تجربة الآن
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[2rem] border border-slate-100 shadow-inner">
        <table className="w-full text-right text-sm min-w-[900px]">
          <thead className="bg-slate-50/50 border-b border-slate-100 text-slate-400 uppercase tracking-widest text-[10px] font-black">
            <tr>
              <th className="p-5">التاريخ والوقت</th>
              <th className="p-5">النوع</th>
              <th className="p-5">المستلم (جهة الاتصال)</th>
              <th className="p-5">العنوان / التفاصيل</th>
              <th className="p-5">حالة الإرسال</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {logs.length === 0 ? (
              <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-bold">لا توجد إشعارات سابقة في السجل حالياً</td></tr>
            ) : logs.map((log: any) => (
              <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="p-5 text-slate-500 font-mono text-xs">{log.timestamp ? new Date(log.timestamp).toLocaleString('ar-LY') : '-'}</td>
                <td className="p-5">
                  {log.type === 'email'
                    ? <span className="inline-flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase border border-blue-100"><Mail className="w-3.5 h-3.5" /> EMails</span>
                    : <span className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl font-black text-[10px] uppercase border border-emerald-100"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</span>}
                </td>
                <td className="p-5 font-black text-slate-800" dir="ltr">{log.contact}</td>
                <td className="p-5 text-slate-600 font-bold text-xs">{log.title}</td>
                <td className="p-5">
                  {(log.status === 'sent' || (log.status && typeof log.status === 'string' && log.status.includes('sent_'))) ? (
                    <span className="text-emerald-500 font-black flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-xl w-fit border border-emerald-100 active:scale-95 transition-transform"><CheckCircle2 className="w-4 h-4" /> تم الإرسال بنجاح</span>
                  ) : (
                    <span className="text-rose-500 font-black flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-xl w-fit border border-rose-100"><XCircle className="w-4 h-4" /> فشل الإرسال</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ============================================================
   WelcomeSettingsPanel — Admin-editable welcome message settings
   ============================================================ */
const WelcomeSettingsPanel: React.FC = () => {
  const [form, setForm] = useState({
    welcome_message_subject: '',
    welcome_message_content: '',
    deposit_reminder_text: '',
    company_address: '',
    company_phones: '',
    company_google_maps: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    authFetch('/api/admin/welcome-settings')
      .then(r => r.json())
      .then(data => { setForm(prev => ({ ...prev, ...data })); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await authFetch('/api/admin/welcome-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (loading) return <div className="text-center py-12 text-slate-500">جاري التحميل...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">رسالة الترحيب</h2>
        <p className="text-sm text-slate-500 mt-1">تعديل رسالة الترحيب التي تُرسل للمستخدمين الجدد عند التسجيل</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">عنوان رسالة الترحيب</label>
          <input
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            value={form.welcome_message_subject}
            onChange={e => setForm(f => ({ ...f, welcome_message_subject: e.target.value }))}
            placeholder="🎉 مرحباً بك في أوتو برو — دليلك الكامل للبدء"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">محتوى رسالة الترحيب</label>
          <p className="text-xs text-slate-400 mb-2">استخدم {'${firstName}'} لاسم المستخدم و {'${SITE_URL}'} لرابط الموقع</p>
          <textarea
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none min-h-[250px] font-mono"
            value={form.welcome_message_content}
            onChange={e => setForm(f => ({ ...f, welcome_message_content: e.target.value }))}
            placeholder="أهلاً ${firstName}! مرحباً بك في منصة أوتو برو..."
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">نص تذكير العربون</label>
          <input
            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
            value={form.deposit_reminder_text}
            onChange={e => setForm(f => ({ ...f, deposit_reminder_text: e.target.value }))}
            placeholder="💰 ادفع العربون الآن واحصل على قوة شرائية 10 أضعاف!"
          />
        </div>

        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-lg font-bold text-slate-700 mb-4">معلومات الشركة</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">عنوان الشركة</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                value={form.company_address}
                onChange={e => setForm(f => ({ ...f, company_address: e.target.value }))}
                placeholder="طرابلس، ليبيا"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">أرقام الهاتف</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                value={form.company_phones}
                onChange={e => setForm(f => ({ ...f, company_phones: e.target.value }))}
                placeholder="+218 91 000 0000 / +1 555 000 0000"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">رابط خرائط Google</label>
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                value={form.company_google_maps}
                onChange={e => setForm(f => ({ ...f, company_google_maps: e.target.value }))}
                placeholder="https://maps.google.com/..."
                dir="ltr"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-bold transition-colors"
          >
            {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
          {saved && <span className="text-green-600 font-bold text-sm">تم الحفظ بنجاح ✓</span>}
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   SystemSettingsPanel — Global fees and system behavior
   ============================================================ */
const SystemSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const { showAlert } = useStore();

  const API_BASE = '';

  useEffect(() => {
    authFetch(`${API_BASE}/api/admin/settings`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => {
        setSettings(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(e => {
        console.error('Failed to load settings', e);
        setSettings([]);
        setLoading(false);
      });
  }, []);

  const updateSetting = async (key: string, value: string) => {
    setSavingKey(key);
    try {
      const res = await authFetch(`${API_BASE}/api/admin/settings/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      if (res.ok) {
        setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
        showAlert('تم تحديث الإعداد بنجاح', 'success');
      }
    } catch {
      showAlert('فشل التحديث');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) return <div className="p-10 text-center animate-pulse text-slate-400 font-bold">جاري تحميل الإعدادات...</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      <div>
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
          <Settings className="w-8 h-8 text-orange-500" />
          إعدادات النظام والرسوم
        </h2>
        <p className="text-slate-500 text-sm mt-1">تحكم في العمولات وتكاليف الشحن وسلوك المزادات عالمياً</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financial Fees */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
          <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 mb-4">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            إعدادات الرسوم والعمولات
          </h3>

          <div className="space-y-6">
            {[
              { key: 'platform_commission_rate', label: 'نسبة عمولة المنصة (%)', type: 'percentage', desc: 'تحسب من سعر بيع السيارة' },
              { key: 'internal_transport_fee', label: 'رسوم النقل الداخلي الثابتة ($)', type: 'number', desc: 'تكلفة نقل السيارة من المزاد للمستودع' },
              { key: 'international_shipping_est', label: 'تقدير الشحن الدولي الأولي ($)', type: 'number', desc: 'القيمة الافتراضية المضافة للفاتورة' }
            ].map(item => {
              const setting = settings.find(s => s.key === item.key);
              const val = item.type === 'percentage' ? (parseFloat(setting?.value || '0') * 100).toString() : setting?.value;

              return (
                <div key={item.key} className="bg-slate-50 rounded-2xl p-5 border border-slate-100 group transition-all hover:border-orange-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <label className="block text-sm font-black text-slate-700">{item.label}</label>
                      <span className="text-[10px] text-slate-400 font-bold">{item.desc}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      defaultValue={val}
                      onBlur={(e) => {
                        const newRaw = item.type === 'percentage' ? (parseFloat(e.target.value) / 100).toString() : e.target.value;
                        if (newRaw !== setting?.value) updateSetting(item.key, newRaw);
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold text-slate-900 focus:border-orange-500 outline-none"
                    />
                    <div className="w-12 flex items-center justify-center">
                      {savingKey === item.key ? (
                        <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Buyer Policies */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
          <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-blue-500" />
            سياسات المشترين (Buyer Rules)
          </h3>

          <div className="space-y-6">
            {[
              { key: 'default_buying_power_multiplier', label: 'مضاعف القوة الشرائية الافتراضي (Limit)', type: 'number', desc: 'يتم ضرب العربون في هذا الرقم لتحديد سقف المزايدة' },
              { key: 'require_kyc_for_bidding', label: 'طلب التوثيق للمزايدة (KYC Required)', type: 'boolean', desc: 'منع المزايدة للمستخدمين غير الموثقين' }
            ].map(item => {
              const setting = settings.find(s => s.key === item.key);

              return (
                <div key={item.key} className="bg-slate-50 rounded-2xl p-5 border border-slate-100 group transition-all hover:border-blue-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <label className="block text-sm font-black text-slate-700">{item.label}</label>
                      <span className="text-[10px] text-slate-400 font-bold">{item.desc}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {item.type === 'boolean' ? (
                      <select
                        defaultValue={setting?.value}
                        onChange={(e) => updateSetting(item.key, e.target.value)}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-blue-500 outline-none"
                      >
                        <option value="1">نعم (مفعل)</option>
                        <option value="0">لا (غير مفعل)</option>
                      </select>
                    ) : (
                      <input
                        type="number"
                        defaultValue={setting?.value}
                        onBlur={(e) => {
                          if (e.target.value !== setting?.value) updateSetting(item.key, e.target.value);
                        }}
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold text-slate-900 focus:border-blue-500 outline-none"
                      />
                    )}
                    <div className="w-12 flex items-center justify-center">
                      {savingKey === item.key ? (
                        <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Auction Behavior */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
          <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 mb-4">
            <Gavel className="w-5 h-5 text-orange-500" />
            قواعد المزايدة
          </h3>

          <div className="space-y-6">
            {[
              { key: 'auction_extension_seconds', label: 'وقت التمديد (ثواني)', desc: 'الوقت المضاف عند المزايدة في اللحظات الأخيرة' },
              { key: 'min_bid_increment', label: 'أقل زيادة للمزايدة ($)', desc: 'الفرق الأدنى المسموح به بين المزايدة الحالية والسابقة' }
            ].map(item => {
              const setting = settings.find(s => s.key === item.key);
              return (
                <div key={item.key} className="bg-slate-50 rounded-2xl p-5 border border-slate-100 group transition-all hover:border-orange-200">
                  <label className="block text-sm font-black text-slate-700 mb-1">{item.label}</label>
                  <p className="text-[10px] text-slate-400 font-bold mb-3">{item.desc}</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      defaultValue={setting?.value}
                      onBlur={(e) => {
                        if (e.target.value !== setting?.value) updateSetting(item.key, e.target.value);
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 font-mono font-bold text-slate-900 focus:border-orange-500 outline-none"
                    />
                    <div className="w-12 flex items-center justify-center">
                      {savingKey === item.key ? (
                        <RefreshCw className="w-5 h-5 text-orange-500 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 mt-4">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-orange-500 flex-shrink-0" />
              <div className="text-xs font-bold text-orange-700 leading-relaxed">
                تنبيه: التعديلات على وقت التمديد والمزايدة ستطبق على المزادات الجديدة فقط ولا تؤثر على المزادات التي بدأت بالفعل.
              </div>
            </div>
          </div>
        </div>

        {/* External Notifications */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-6">
          <h3 className="font-black text-lg text-slate-800 flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-indigo-500" />
            الإشعارات الخارجية للتنبيهات
          </h3>

          <div className="space-y-6">
            {[
              { key: 'enable_email_notifications', label: 'تفعيل إشعارات البريد الإلكتروني', type: 'boolean', desc: 'إرسال تنبيهات على إيميل المشتري والبائع' },
              { key: 'enable_whatsapp_notifications', label: 'تفعيل إشعارات الواتساب', type: 'boolean', desc: 'إرسال رسائل واتس اب للمزايدين والبائعين' }
            ].map(item => {
              const setting = settings.find(s => s.key === item.key);

              return (
                <div key={item.key} className="bg-slate-50 rounded-2xl p-5 border border-slate-100 group transition-all hover:border-indigo-200">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <label className="block text-sm font-black text-slate-700">{item.label}</label>
                      <span className="text-[10px] text-slate-400 font-bold">{item.desc}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      defaultValue={setting?.value || '1'}
                      onChange={(e) => updateSetting(item.key, e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-900 focus:border-indigo-500 outline-none"
                    >
                      <option value="1">نعم (مفعل)</option>
                      <option value="0">لا (غير مفعل)</option>
                    </select>
                    <div className="w-12 flex items-center justify-center">
                      {savingKey === item.key ? (
                        <RefreshCw className="w-5 h-5 text-indigo-500 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <ExternalLogsViewer />

      </div>
    </div>
  );
};
const FooterSettingsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [cfg, setCfg] = React.useState<any>(() => {
    try { return { ...FOOTER_DEFAULT, ...JSON.parse(localStorage.getItem(FOOTER_KEY) || '{}') }; }
    catch { return FOOTER_DEFAULT; }
  });
  const [saved, setSaved] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'general' | 'links' | 'social'>('general');

  const save = () => {
    localStorage.setItem(FOOTER_KEY, JSON.stringify(cfg));
    window.dispatchEvent(new Event('storage'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const inp = 'w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-orange-500 transition-all';

  const updateLink = (section: 'companyLinks' | 'serviceLinks' | 'legalLinks', idx: number, field: 'label' | 'href', val: string) =>
    setCfg((p: any) => ({
      ...p,
      [section]: p[section].map((l: any, i: number) => i === idx ? { ...l, [field]: val } : l)
    }));

  const addLink = (section: string) =>
    setCfg((p: any) => ({ ...p, [section]: [...p[section], { label: '', href: '' }] }));

  const removeLink = (section: string, idx: number) =>
    setCfg((p: any) => ({ ...p, [section]: p[section].filter((_: any, i: number) => i !== idx) }));

  const tabs = [
    { id: 'general', label: '📋 البيانات العامة' },
    { id: 'links', label: '🔗 الروابط' },
    { id: 'social', label: '📱 التواصل الاجتماعي' },
  ] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <span className="text-3xl">🦶</span> إعدادات الفوتر (Footer)
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            التعديلات تنعكس فوراً على أسفل كل صفحة في الموقع
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" target="_blank" className="text-xs font-bold text-slate-500 hover:text-orange-500 border border-slate-200 px-3 py-2 rounded-xl transition-colors">
            👁️ معاينة الموقع
          </a>
          <button onClick={save}
            className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg ${saved ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20'}`}>
            {saved ? '✅ تم الحفظ!' : 'حفظ التعديلات'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === t.id ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ── */}
      {activeTab === 'general' && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-slate-800 border-r-4 border-orange-500 pr-3">بيانات التواصل</h3>
            {[
              { label: 'رقم الهاتف', key: 'phone', placeholder: '+218 91 234 5678' },
              { label: 'البريد الإلكتروني', key: 'email', placeholder: 'info@autopro.ly' },
              { label: 'العنوان', key: 'address', placeholder: 'طرابلس، ليبيا' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-1.5">{f.label}</label>
                <input title="حقل إدخال" aria-label="حقل إدخال" type="text" className={inp} placeholder={f.placeholder}
                  value={cfg[f.key]} onChange={e => setCfg({ ...cfg, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-slate-800 border-r-4 border-orange-500 pr-3">وصف الشركة</h3>
            <textarea rows={5} className={`${inp} resize-none`}
              value={cfg.description}
              onChange={e => setCfg({ ...cfg, description: e.target.value })}
              placeholder="وصف مختصر يظهر في الفوتر..." />
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs font-bold text-blue-600">
              💡 يظهر هذا النص أسفل شعار الشركة في الفوتر
            </div>
          </div>
        </div>
      )}

      {/* ── Links Tab ── */}
      {activeTab === 'links' && (
        <div className="grid md:grid-cols-3 gap-6">
          {([
            { key: 'companyLinks', title: 'روابط الشركة' },
            { key: 'serviceLinks', title: 'روابط الخدمات' },
            { key: 'legalLinks', title: 'الروابط القانونية' },
          ] as const).map(section => (
            <div key={section.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-800 text-sm">{section.title}</h3>
                <button onClick={() => addLink(section.key)}
                  className="text-[11px] font-black text-orange-500 border border-orange-200 px-2.5 py-1.5 rounded-xl hover:bg-orange-50 transition-colors">
                  + إضافة
                </button>
              </div>
              {cfg[section.key].map((link: any, idx: number) => (
                <div key={idx} className="space-y-1.5 bg-slate-50 rounded-xl p-3 relative group">
                  <input aria-label="مدخل" title="مدخل" placeholder="تحديد" type="text" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:border-orange-500"
                    value={t(link.label) === link.label ? link.label : `${t(link.label)} (${link.label})`}
                    onChange={e => updateLink(section.key, idx, 'label', e.target.value)} />
                  <input aria-label="مدخل" title="مدخل" placeholder="تحديد" type="text" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono outline-none focus:border-orange-500"
                    value={link.href} onChange={e => updateLink(section.key, idx, 'href', e.target.value)} />
                  <button onClick={() => removeLink(section.key, idx)}
                    className="absolute top-2 left-2 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-black">✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Social Tab ── */}
      {activeTab === 'social' && (
        <div className="max-w-lg">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="font-black text-slate-800 border-r-4 border-orange-500 pr-3">روابط التواصل الاجتماعي</h3>
            {[
              { label: '🔵 Facebook', key: 'facebook', placeholder: 'https://facebook.com/autopro' },
              { label: '🐦 Twitter / X', key: 'twitter', placeholder: 'https://twitter.com/autopro' },
              { label: '📸 Instagram', key: 'instagram', placeholder: 'https://instagram.com/autopro' },
              { label: '📺 YouTube', key: 'youtube', placeholder: 'https://youtube.com/@autopro' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-black text-slate-400 uppercase tracking-tighter mb-1.5">{f.label}</label>
                <input title="حقل إدخال" aria-label="حقل إدخال" type="url" className={inp} placeholder={f.placeholder}
                  value={cfg[f.key]} onChange={e => setCfg({ ...cfg, [f.key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   ShippingSettingsPanel — Admin panel to control /shipping page
   ============================================================ */
const SHIP_KEY = 'autopro_shipping_settings';
const SHIP_DEFAULT = {
  domesticRate: 0.8, seaFreightBase: 1200, customsDuty: 5,
  agencyFee: 350, portHandling: 180, commissionRate: 3,
  deliveryDays: { domestic: 7, sea: 45, customs: 10 },
  notes: '',
  routes: [
    { from: 'USA – Houston', to: 'ليبيا – طرابلس', price: 1800, days: 40 },
    { from: 'USA – Los Angeles', to: 'ليبيا – طرابلس', price: 2100, days: 45 },
    { from: 'UAE – دبي', to: 'ليبيا – طرابلس', price: 900, days: 20 },
    { from: 'Germany – Bremen', to: 'ليبيا – طرابلس', price: 1100, days: 25 },
  ],
};

const ShippingSettingsPanel: React.FC = () => {
  const [cfg, setCfg] = React.useState<any>(() => {
    try { return { ...SHIP_DEFAULT, ...JSON.parse(localStorage.getItem(SHIP_KEY) || '{}') }; } catch { return SHIP_DEFAULT; }
  });
  const [saved, setSaved] = React.useState(false);

  const save = () => {
    localStorage.setItem(SHIP_KEY, JSON.stringify(cfg));
    window.dispatchEvent(new Event('storage'));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const updateRoute = (i: number, field: string, val: any) =>
    setCfg((p: any) => ({ ...p, routes: p.routes.map((r: any, idx: number) => idx === i ? { ...r, [field]: val } : r) }));

  const addRoute = () =>
    setCfg((p: any) => ({ ...p, routes: [...p.routes, { from: '', to: '', price: 0, days: 0 }] }));

  const removeRoute = (i: number) =>
    setCfg((p: any) => ({ ...p, routes: p.routes.filter((_: any, idx: number) => idx !== i) }));

  const field = (label: string, key: string, type = 'number', suffix = '') => (
    <div>
      <label htmlFor={key} className="block text-[11px] font-black text-slate-400 mb-1.5 uppercase tracking-tighter">{label} {suffix && <span className="text-orange-400">{suffix}</span>}</label>
      <input id={key} type={type} value={cfg[key]} onChange={e => setCfg({ ...cfg, [key]: type === 'number' ? Number(e.target.value) : e.target.value })}
        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-orange-500 transition-all text-sm" />
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <Ship className="w-7 h-7 text-orange-500" /> إعدادات صفحة الشحن العامة
          </h2>
          <p className="text-slate-500 text-sm mt-1">هذه الإعدادات تظهر مباشرةً على صفحة <span className="font-black text-orange-600">/shipping</span> للزوار</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/shipping" target="_blank" className="text-xs font-bold text-slate-500 hover:text-orange-500 border border-slate-200 px-3 py-2 rounded-xl transition-colors">
            👁️ معاينة الصفحة
          </a>
          <button onClick={save} className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg ${saved ? 'bg-green-500 text-white shadow-green-500/20' : 'bg-orange-500 text-white hover:bg-orange-600 shadow-orange-500/20'}`}>
            {saved ? '✅ تم الحفظ' : 'حفظ الإعدادات'}
          </button>
        </div>
      </div>

      {/* Rates */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-black text-slate-800 mb-5 flex items-center gap-2"><DollarSign className="w-5 h-5 text-orange-500" />الرسوم والتكاليف</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {field('رسوم الشحن البحري الأساسية', 'seaFreightBase', 'number', '$')}
          {field('النقل الداخلي (لكل كم)', 'domesticRate', 'number', '$/km')}
          {field('رسوم الوكالة والتخليص', 'agencyFee', 'number', '$')}
          {field('رسوم الميناء والمناولة', 'portHandling', 'number', '$')}
          {field('الرسوم الجمركية', 'customsDuty', 'number', '%')}
          {field('عمولة أوتو برو', 'commissionRate', 'number', '%')}
        </div>
      </div>

      {/* Delivery Days */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-black text-slate-800 mb-5 flex items-center gap-2"><Clock className="w-5 h-5 text-orange-500" />مدد التوصيل التقديرية (أيام)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label htmlFor="domesticDays" className="block text-[11px] font-black text-slate-400 mb-1.5 uppercase tracking-tighter">النقل الداخلي</label>
            <input id="domesticDays" type="number" value={cfg.deliveryDays.domestic} onChange={e => setCfg({ ...cfg, deliveryDays: { ...cfg.deliveryDays, domestic: Number(e.target.value) } })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-orange-500 text-sm" />
          </div>
          <div>
            <label htmlFor="seaDays" className="block text-[11px] font-black text-slate-400 mb-1.5 uppercase tracking-tighter">الشحن البحري</label>
            <input id="seaDays" type="number" value={cfg.deliveryDays.sea} onChange={e => setCfg({ ...cfg, deliveryDays: { ...cfg.deliveryDays, sea: Number(e.target.value) } })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-orange-500 text-sm" />
          </div>
          <div>
            <label htmlFor="customsDays" className="block text-[11px] font-black text-slate-400 mb-1.5 uppercase tracking-tighter">التخليص الجمركي</label>
            <input id="customsDays" type="number" value={cfg.deliveryDays.customs} onChange={e => setCfg({ ...cfg, deliveryDays: { ...cfg.deliveryDays, customs: Number(e.target.value) } })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-orange-500 text-sm" />
          </div>
        </div>
      </div>

      {/* Routes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-black text-slate-800 flex items-center gap-2"><Map className="w-5 h-5 text-orange-500" />مسارات الشحن والأسعار</h3>
          <button onClick={addRoute} className="text-xs font-black bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-200 px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" /> إضافة مسار
          </button>
        </div>
        <div className="space-y-3">
          {cfg.routes.map((r: any, i: number) => (
            <div key={i} className="grid grid-cols-6 gap-3 items-center bg-slate-50 rounded-xl p-3">
              <input aria-label="مدخل" title="مدخل" placeholder="تحديد" value={r.from} onChange={e => updateRoute(i, 'from', e.target.value)}
                className="col-span-2 bg-white border border-slate-200 rounded-lg p-2.5 font-bold text-sm outline-none focus:border-orange-500" />
              <input aria-label="مدخل" title="مدخل" placeholder="تحديد" value={r.to} onChange={e => updateRoute(i, 'to', e.target.value)}
                className="col-span-2 bg-white border border-slate-200 rounded-lg p-2.5 font-bold text-sm outline-none focus:border-orange-500" />
              <input aria-label="مدخل" title="مدخل" placeholder="تحديد" type="number" value={r.price} onChange={e => updateRoute(i, 'price', Number(e.target.value))}
                className="bg-white border border-slate-200 rounded-lg p-2.5 font-bold text-sm outline-none focus:border-orange-500" />
              <div className="flex items-center gap-2">
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد" type="number" value={r.days} onChange={e => updateRoute(i, 'days', Number(e.target.value))}
                  className="flex-1 bg-white border border-slate-200 rounded-lg p-2.5 font-bold text-sm outline-none focus:border-orange-500" />
                <button onClick={() => removeRoute(i)} title="حذف المسار" aria-label="حذف المسار" className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Info className="w-5 h-5 text-orange-500" />ملاحظات تظهر على الصفحة</h3>
        <textarea value={cfg.notes} onChange={e => setCfg({ ...cfg, notes: e.target.value })} rows={3}
          placeholder="مثال: الأسعار لا تشمل الضريبة المضافة - قد تختلف الأسعار حسب حجم السيارة..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-bold outline-none focus:border-orange-500 transition-all text-sm resize-none" />
      </div>
    </div>
  );
};

const data = [

  { name: 'يناير', مبيعات: 4000, سيارات: 240 },
  { name: 'فبراير', مبيعات: 3000, سيارات: 139 },
  { name: 'مارس', مبيعات: 2000, سيارات: 980 },
  { name: 'أبريل', مبيعات: 2780, سيارات: 390 },
  { name: 'مايو', مبيعات: 1890, سيارات: 480 },
  { name: 'يونيو', مبيعات: 2390, سيارات: 380 },
];

// ============================================================
// PaymentRequestsPanel — Phase 10: Buyer wallet top-up/withdrawal
// ============================================================
const PaymentRequestsPanel: React.FC = () => {
  const [requests, setRequests] = React.useState<any[]>([]);
  const [stats, setStats] = React.useState<any>({});
  const [filter, setFilter] = React.useState<'all' | 'pending' | 'topup' | 'withdrawal'>('pending');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<Record<string, string>>({});
  const [showTopupModal, setShowTopupModal] = React.useState(false);
  const [topupForm, setTopupForm] = React.useState({ email: '', amount: 0, note: '' });
  const { showAlert, currentUser } = useStore();

  const load = async () => {
    try {
      const [rRes, sRes] = await Promise.all([
        authFetch('/api/admin/payment-requests'),
        authFetch('/api/admin/wallet-stats'),
      ]);
      if (rRes.ok) { const d = await rRes.json(); setRequests(d.requests || []); }
      if (sRes.ok) setStats(await sRes.json());
    } catch { }
  };

  React.useEffect(() => { load(); }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActionLoading(id + action);
    try {
      const res = await authFetch(`/api/admin/payment-requests/${id}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNote: note[id] || '' }),
      });
      if (res.ok) load();
    } catch { }
    setActionLoading(null);
  };

  const handleManualTopup = async () => {
    if (!topupForm.email || topupForm.amount <= 0) {
      showAlert('الرجاء إدخال البريد الإلكتروني والمبلغ بصورة صحيحة');
      return;
    }
    try {
      const res = await authFetch('/api/admin/manual-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...topupForm, adminId: currentUser?.id })
      });
      if (res.ok) {
        showAlert('تم شحن المحفظة بنجاح ✅', 'success');
        setShowTopupModal(false);
        setTopupForm({ email: '', amount: 0, note: '' });
        load();
      } else {
        const d = await res.json();
        showAlert(d.error || 'فشل شحن المحفظة');
      }
    } catch {
      showAlert('خطأ في الاتصال');
    }
  };

  const filtered = requests.filter(r => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'topup') return r.type === 'topup';
    if (filter === 'withdrawal') return r.type === 'withdrawal';
    return true;
  });

  const TYPE_COLOR: Record<string, string> = {
    topup: 'bg-green-100 text-green-700',
    withdrawal: 'bg-blue-100 text-blue-700',
    invoice_payment: 'bg-orange-100 text-orange-700',
  };
  const TYPE_LABEL: Record<string, string> = {
    topup: '⬆️ شحن محفظة', withdrawal: '⬇️ سحب رصيد', invoice_payment: '📄 دفع فاتورة',
  };
  const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300" dir="rtl">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'إجمالي الودائع', val: `$${(stats.totalDeposited || 0).toLocaleString()}`, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'أرصدة نشطة', val: `$${(stats.totalBalance || 0).toLocaleString()}`, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'إجمالي الإنفاق', val: `$${(stats.totalSpent || 0).toLocaleString()}`, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'طلبات شحن معلقة', val: stats.pendingTopups || 0, color: 'text-orange-600', bg: 'bg-orange-50' },
          { label: 'فواتير غير مدفوعة', val: `$${(stats.pendingInvoices || 0).toLocaleString()}`, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-black ${s.color}`}>{s.val}</div>
            <div className="text-xs text-slate-500 font-bold mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
          {([['pending', '⏳ معلقة'], ['topup', '⬆️ شحن'], ['withdrawal', '⬇️ سحب'], ['all', 'الكل']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k as any)}
              className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${filter === k ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
              {l}
              {k === 'pending' && requests.filter(r => r.status === 'pending').length > 0 && (
                <span className="mr-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {requests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </div>
        <button onClick={() => setShowTopupModal(true)} className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl font-black text-sm shadow-lg shadow-orange-500/20 flex items-center gap-2">
          <Plus className="w-5 h-5"/>
          شحن وتسوية محفظة يدوياً
        </button>
      </div>

      {showTopupModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                <Wallet className="w-6 h-6 text-orange-500" />
                شحن وتسوية محفظة (Admin)
              </h3>
              <button onClick={() => setShowTopupModal(false)} title="إغلاق" aria-label="إغلاق" className="p-2 hover:bg-rose-100 hover:text-rose-600 rounded-full text-slate-400 transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1.5">البريد الإلكتروني للمستخدم</label>
                <input type="email" placeholder="user@example.com" value={topupForm.email} onChange={e => setTopupForm(f => ({...f, email: e.target.value}))}
                  className="w-full border border-slate-200 p-3 rounded-xl focus:border-orange-500 outline-none text-left" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1.5">المبلغ ($)</label>
                <input type="number" placeholder="مثال: 5000" value={topupForm.amount || ''} onChange={e => setTopupForm(f => ({...f, amount: Number(e.target.value)}))}
                  className="w-full border border-slate-200 p-3 rounded-xl focus:border-orange-500 outline-none font-black text-xl text-left" dir="ltr" />
                <p className="text-[10px] text-slate-400 font-bold mt-1">يمثل هذا المبلغ تسوية نقدية أو بنكية مسجلة خارج المنصة ويتم إضافته للمحفظة.</p>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 mb-1.5">ملاحظات التحويل (تظهر للمستخدم)</label>
                <input type="text" placeholder="مثال: إيداع نقدي بفرع طرابلس" value={topupForm.note} onChange={e => setTopupForm(f => ({...f, note: e.target.value}))}
                  className="w-full border border-slate-200 p-3 rounded-xl focus:border-orange-500 outline-none" />
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button onClick={handleManualTopup} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5"/> تأكيد الشحن والترصيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 font-bold">
            <CreditCard className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            لا توجد طلبات في هذا التصنيف
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['المستخدم', 'النوع', 'المبلغ', 'طريقة الدفع', 'المرجع', 'التاريخ', 'الحالة', 'إجراء'].map(h => (
                    <th key={h} className="p-3 font-black text-slate-600 text-right text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(pr => (
                  <tr key={pr.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3">
                      <div className="font-black text-slate-800">{pr.firstName} {pr.lastName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{pr.email}</div>
                    </td>
                    <td className="p-3">
                      <span className={`inline-flex items-center text-xs font-black px-2.5 py-1 rounded-lg ${TYPE_COLOR[pr.type] || 'bg-slate-100 text-slate-600'}`}>
                        {TYPE_LABEL[pr.type] || pr.type}
                      </span>
                    </td>
                    <td className="p-3 font-black text-lg text-slate-900">${Number(pr.amount).toLocaleString()}</td>
                    <td className="p-3 text-slate-600 font-bold text-xs">
                      {pr.method === 'bank_transfer' ? 'تحويل بنكي' : pr.method === 'cash' ? 'نقداً' : 'بطاقة'}
                    </td>
                    <td className="p-3 font-mono text-xs text-slate-500">{pr.referenceNo || '—'}</td>
                    <td className="p-3 text-slate-400 text-xs">{pr.requestedAt ? new Date(pr.requestedAt).toLocaleDateString('ar-LY') : '—'}</td>
                    <td className="p-3">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${STATUS_COLOR[pr.status] || 'bg-slate-100 text-slate-500'}`}>
                        {pr.status === 'pending' ? 'معلق' : pr.status === 'approved' ? 'موافق' : 'مرفوض'}
                      </span>
                    </td>
                    <td className="p-3">
                      {pr.status === 'pending' ? (
                        <div className="flex items-center gap-2">
                          <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                            className="text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none focus:border-orange-500 font-bold w-28"
                            value={note[pr.id] || ''}
                            onChange={e => setNote(n => ({ ...n, [pr.id]: e.target.value }))}
                          />
                          <button
                            disabled={actionLoading === pr.id + 'approve'}
                            onClick={() => handleAction(pr.id, 'approve')}
                            className="text-xs font-black bg-green-500 hover:bg-green-400 text-white px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 whitespace-nowrap">
                            {actionLoading === pr.id + 'approve' ? '...' : '✅ قبول'}
                          </button>
                          <button
                            disabled={actionLoading === pr.id + 'reject'}
                            onClick={() => handleAction(pr.id, 'reject')}
                            className="text-xs font-black bg-red-500 hover:bg-red-400 text-white px-3 py-1.5 rounded-xl transition-all disabled:opacity-50">
                            {actionLoading === pr.id + 'reject' ? '...' : '❌ رفض'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-bold">{pr.adminNote || 'تمت المعالجة'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};



// ============================================================
// WithdrawalRow - Sub-component for Withdrawal Requests panel
// ============================================================
const WithdrawalRow: React.FC<{
  wr: any;
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
}> = ({ wr, onApprove, onReject }) => {
  const [showActions, setShowActions] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [action, setAction] = React.useState<'approve' | 'reject' | null>(null);

  return (
    <>
      <tr className="hover:bg-slate-50/80 transition-colors">
        <td className="p-4">
          <div className="font-black text-slate-800">{wr.firstName} {wr.lastName}</div>
          <div className="text-xs text-slate-400 font-mono">{wr.email}</div>
        </td>
        <td className="p-4 font-black text-2xl font-mono text-emerald-600">
          ${(wr.amount || 0).toLocaleString()}
        </td>
        <td className="p-4">
          <div className="font-mono text-sm text-slate-700 font-bold break-all">{wr.iban || '—'}</div>
          {wr.bankName && <div className="text-xs text-slate-400 mt-1">{wr.bankName}</div>}
        </td>
        <td className="p-4 text-sm text-slate-500">
          {wr.requestedAt ? new Date(wr.requestedAt).toLocaleDateString('ar-EG') : '—'}
        </td>
        <td className="p-4">
          {wr.status === 'pending' && <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-black">⏳ معلق</span>}
          {wr.status === 'completed' && <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black">✅ مكتمل</span>}
          {wr.status === 'rejected' && <span className="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-black">❌ مرفوض</span>}
        </td>
        <td className="p-4">
          {wr.status === 'pending' ? (
            <button
              onClick={() => setShowActions(!showActions)}
              className="bg-slate-900 text-white text-xs font-black px-4 py-2 rounded-xl hover:bg-orange-500 transition-all"
            >
              مراجعة
            </button>
          ) : (
            <span className="text-xs text-slate-400">
              {wr.processedAt ? new Date(wr.processedAt).toLocaleDateString('ar-EG') : ''}
            </span>
          )}
        </td>
      </tr>

      {showActions && wr.status === 'pending' && (
        <tr>
          <td colSpan={6} className="p-0 bg-slate-50 border-y border-slate-100">
            <div className="p-6 space-y-3">
              {!action && (
                <div className="flex gap-3">
                  <button onClick={() => setAction('approve')} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all">
                    <CheckCircle2 className="w-5 h-5" /> الموافقة والتحويل
                  </button>
                  <button onClick={() => setAction('reject')} className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 transition-all">
                    <X className="w-5 h-5" /> رفض الطلب
                  </button>
                  <button onClick={() => setShowActions(false)} className="px-4 py-3 bg-white border border-slate-200 text-slate-500 rounded-xl font-bold hover:bg-slate-50 transition-all">
                    إغلاق
                  </button>
                </div>
              )}
              {action === 'approve' && (
                <div className="space-y-3">
                  <div className="text-sm font-black text-slate-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                    ✅ تأكيد تحويل <span className="font-mono text-emerald-700">${(wr.amount || 0).toLocaleString()}</span> → IBAN: {wr.iban || 'غير محدد'}
                  </div>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظة اختيارية للبائع..." rows={2}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-emerald-500" />
                  <div className="flex gap-2">
                    <button onClick={() => { onApprove(wr.id); setShowActions(false); }}
                      className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-black text-sm hover:bg-emerald-600 transition-all">
                      تأكيد الموافقة
                    </button>
                    <button onClick={() => setAction(null)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50">رجوع</button>
                  </div>
                </div>
              )}
              {action === 'reject' && (
                <div className="space-y-3">
                  <div className="text-sm font-black text-rose-600">❌ سبب رفض الطلب (سيُبلَّغ البائع تلقائياً)</div>
                  <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="أدخل سبب الرفض..." rows={2}
                    className="w-full bg-white border border-rose-200 rounded-xl p-3 text-sm outline-none focus:border-rose-400" />
                  <div className="flex gap-2">
                    <button onClick={() => { onReject(wr.id, reason); setShowActions(false); }} disabled={!reason.trim()}
                      className="bg-rose-500 text-white px-6 py-2.5 rounded-xl font-black text-sm hover:bg-rose-600 transition-all disabled:opacity-50">
                      تأكيد الرفض
                    </button>
                    <button onClick={() => setAction(null)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50">رجوع</button>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ============================================================
// KycReviewCard - Per-seller KYC review card
// ============================================================
const KycReviewCard: React.FC<{
  user: any;
  onApprove: (userId: string, note: string) => void;
  onReject: (userId: string, reason: string) => void;
}> = ({ user, onApprove, onReject }) => {
  const [expanded, setExpanded] = React.useState(false);
  const [action, setAction] = React.useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = React.useState('');
  const [reason, setReason] = React.useState('');

  const statusConfig: Record<string, { label: string; class: string }> = {
    pending: { label: '⏳ قيد المراجعة', class: 'bg-violet-100 text-violet-700' },
    approved: { label: '✅ موثّق', class: 'bg-emerald-100 text-emerald-700' },
    rejected: { label: '❌ مرفوض', class: 'bg-rose-100 text-rose-700' },
  };
  const status = statusConfig[user.kycStatus] || statusConfig.pending;

  return (
    <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between p-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center font-black text-lg">
            {user.firstName?.[0]}{user.lastName?.[0]}
          </div>
          <div>
            <div className="font-black text-slate-800">{user.firstName} {user.lastName}</div>
            <div className="text-xs text-slate-400 font-mono">{user.email}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-black ${status.class}`}>
            {status.label}
          </span>
          <span className="text-xs text-slate-400 font-bold bg-slate-50 px-2 py-1 rounded-lg">
            {user.docCount || 0} وثيقة
          </span>
          {user.kycStatus === 'pending' && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="bg-slate-900 text-white text-xs font-black px-4 py-2 rounded-xl hover:bg-violet-600 transition-all"
            >
              {expanded ? 'إغلاق' : 'مراجعة'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: documents + actions */}
      {expanded && (
        <div className="border-t border-slate-50 p-6 space-y-4 bg-slate-50/50">
          {/* Documents */}
          {user.documents && user.documents.length > 0 ? (
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">الوثائق المرفوعة</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {user.documents.map((doc: any, i: number) => (
                  <a
                    key={i}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-3 hover:border-violet-400 hover:bg-violet-50 transition-all group"
                  >
                    <FileText className="w-5 h-5 text-slate-400 group-hover:text-violet-500" />
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-700 truncate">{doc.filename}</div>
                      <div className="text-[10px] text-slate-400">{doc.docType} • {new Date(doc.uploadedAt).toLocaleDateString('ar-EG')}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 font-bold italic">لم يتم رفع أي وثائق بعد</p>
          )}

          {/* Action buttons */}
          {!action && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setAction('approve')}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
              >
                <CheckCircle2 className="w-5 h-5" /> الموافقة والتوثيق
              </button>
              <button
                onClick={() => setAction('reject')}
                className="flex-1 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black flex items-center justify-center gap-2 shadow-lg shadow-rose-500/20 transition-all"
              >
                <X className="w-5 h-5" /> رفض الوثائق
              </button>
            </div>
          )}

          {action === 'approve' && (
            <div className="space-y-3">
              <div className="text-sm font-black text-slate-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                ✅ سيتم توثيق حساب {user.firstName} {user.lastName} وإرسال إشعار له
              </div>
              <textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="ملاحظة اختيارية للبائع..." rows={2}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-emerald-500" />
              <div className="flex gap-2">
                <button onClick={() => { onApprove(user.id, note); setExpanded(false); }}
                  className="bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-black text-sm hover:bg-emerald-600 transition-all">
                  تأكيد الموافقة
                </button>
                <button onClick={() => setAction(null)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50">
                  رجوع
                </button>
              </div>
            </div>
          )}

          {action === 'reject' && (
            <div className="space-y-3">
              <div className="text-sm font-black text-rose-600">❌ سبب الرفض (سيُبلَّغ البائع تلقائياً)</div>
              <textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="أدخل سبب الرفض..." rows={2}
                className="w-full bg-white border border-rose-200 rounded-xl p-3 text-sm outline-none focus:border-rose-400" />
              <div className="flex gap-2">
                <button onClick={() => { onReject(user.id, reason); setExpanded(false); }}
                  disabled={!reason.trim()}
                  className="bg-rose-500 text-white px-6 py-2.5 rounded-xl font-black text-sm hover:bg-rose-600 transition-all disabled:opacity-50">
                  تأكيد الرفض
                </button>
                <button onClick={() => setAction(null)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-50">
                  رجوع
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================================
   MarketingPanel — Email Campaigns & Marketing
   ============================================================ */
const MarketingPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'campaign' | 'templates'>('campaign');
  const [users, setUsers] = useState<any[]>([]);
  const [cars, setCars] = useState<any[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedCars, setSelectedCars] = useState<string[]>([]);
  const [templateType, setTemplateType] = useState<'upcoming' | 'live_auction' | 'offer_market'>('live_auction');
  const [subject, setSubject] = useState('🚗 مزاد أوتو برو مفتوح الآن! سيارات حصرية بانتظارك');
  const [sending, setSending] = useState(false);
  
  // Templates State
  const [notifTemplates, setNotifTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [previewMode, setPreviewMode] = useState<'code' | 'preview'>('code');

  const { showAlert } = useStore();

  const getCarImage = (c: any) => {
    try {
      if (Array.isArray(c.images) && c.images.length > 0) return c.images[0];
      if (typeof c.images === 'string' && c.images.startsWith('[')) return JSON.parse(c.images)[0] || '';
      return c.images || c.image || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=400';
    } catch {
      return 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=400';
    }
  };

  const renderPreview = (html: string) => {
    if (!html) return '';
    const mockData: any = {
      userName: 'أحمد محمد',
      carLink: 'https://www.autopro.ac/cars/123',
      invoiceLink: 'https://www.autopro.ac/dashboard/invoices',
      shippingLink: 'https://www.autopro.ac/dashboard/shipments',
      winLink: 'https://www.autopro.ac/dashboard/wins',
      itemInfo: '2024 Mercedes-Benz G-Class',
      title: 'إشعار تجريبي',
      message: 'هذا هو نص الرسالة التجريبي للمعاينة.'
    };
    
    let rendered = html;
    Object.keys(mockData).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, mockData[key]);
    });
    return rendered;
  };

  const fetchMarketingData = () => {
    authFetch('/api/admin/mailing-list').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setUsers(data);
    }).catch(e => console.error(e));

    authFetch('/api/admin/marketing-cars').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setCars(data);
    }).catch(e => console.error("Marketing Cars Fetch Error:", e));
  };

  const fetchTemplates = () => {
    authFetch('/api/admin/notification-templates').then(r => r.json()).then(data => {
      if (Array.isArray(data)) {
        setNotifTemplates(data);
        if (data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(data[0].id);
          setEditTemplate(data[0]);
        }
      }
    }).catch(e => console.error(e));
  };

  useEffect(() => {
    if (activeTab === 'campaign') fetchMarketingData();
    else fetchTemplates();
  }, [activeTab]);

  const toggleUser = (id: string) => {
    setSelectedUsers(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  };

  const toggleAllUsers = () => {
    if (selectedUsers.length === users.length) setSelectedUsers([]);
    else setSelectedUsers(users.map(u => u.id));
  };

  const toggleCar = (id: string) => {
    setSelectedCars(p => {
      if (p.includes(id)) return p.filter(x => x !== id);
      if (p.length >= 18) return p;
      return [...p, id];
    });
  };

  const generateHTML = () => {
    let config = {
      bgTitle: '#0f172a',
      bgBody: '#1e293b',
      accent: '#f97316',
      title: 'إغلاق المزاد!',
      buttonText: 'تصفح واربح سيارتك من هنا',
      badgeText: 'متاح الآن!',
      priceLabel: 'السعر الحالي',
      showPrice: (c: any) => c.buyNowPrice || c.currentBid || 0
    };

    if (templateType === 'upcoming') {
      config = { bgTitle: '#1e3a8a', bgBody: '#172554', accent: '#fcd34d', title: 'سيارات نخبوية قادمة!', buttonText: 'أضف لمفضلتك واستعد للمزايدة', badgeText: 'قريباً في المزاد', priceLabel: 'السعر المبدئي', showPrice: (c: any) => c.startingBid || 0 };
    } else if (templateType === 'live_auction') {
      config = { bgTitle: '#9f1239', bgBody: '#881337', accent: '#f8fafc', title: 'المزاد يشتعل الآن!', buttonText: 'ادخل المزاد قبل انتهاء الوقت', badgeText: 'متاح الآن للمزايدة!', priceLabel: 'السعر الحالي', showPrice: (c: any) => c.currentBid || c.startingBid || 0 };
    } else if (templateType === 'offer_market') {
      config = { bgTitle: '#065f46', bgBody: '#064e3b', accent: '#ea580c', title: 'عروض مذهلة بانتظارك', buttonText: 'تصفح سوق العروض واشترِ الآن', badgeText: 'شراء فوري', priceLabel: 'سعر الشراء الفوري', showPrice: (c: any) => c.buyNowPrice || 0 };
    }

    const carsHtml = selectedCars.map(carId => {
      const c = cars.find(x => x.id === carId);
      if (!c) return '';
      return `
          <div style="display:inline-block; width:46%; margin: 1%; text-align:center; background:white; border-radius:12px; overflow:hidden; box-shadow:0 6px 15px rgba(0,0,0,0.15); vertical-align:top;">
          <img src="${getCarImage(c)}" style="width:100%; height:140px; object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=400';" />
          <div style="padding:15px; text-align:center;">
            <div style="font-weight:900; font-size:15px; color:#1e293b;">${c.year} ${c.make} ${c.model}</div>
            <div style="color:${config.accent}; font-size:13px; font-weight:bold; margin-top:4px;">${config.badgeText}</div>
            <div style="color:#ea580c; font-size:18px; font-weight:900; margin-top:8px;">$${config.showPrice(c)} ${config.priceLabel}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html dir="rtl">
      <head><meta charset="utf-8"></head>
      <body style="margin:0; padding:0; background-color:#f1f5f9; font-family:Arial, sans-serif;">
        <div style="max-width:600px; margin:0 auto; background-color:${config.bgBody}; overflow:hidden;">
          <div style="text-align:center; padding-top:20px; border-bottom:1px solid rgba(255,255,255,0.1); background-color:${config.bgTitle};">
            <h1 style="color:${config.accent}; font-size:24px; letter-spacing:2px; margin-bottom:5px;">A U T O &nbsp; P R O</h1>
            <p style="color:#e2e8f0; font-size:14px; letter-spacing:4px; margin-top:0;">A U C T I O N S</p>
          </div>
          <div style="background-color:${config.bgTitle}; padding:30px 20px; text-align:center;">
            <h2 style="color:white; margin:0; font-size:38px; font-weight:900; text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">${config.title}</h2>
            <div style="width:50px; height:4px; background-color:${config.accent}; margin: 15px auto 0;"></div>
          </div>
          <div style="padding:20px 10px; background-color:${config.bgBody}; text-align:center;">
             ${carsHtml || '<div style="color:white; padding:20px; font-weight:bold;">لم يتم تحديد سيارات لعرضها في هذه الحملة.</div>'}
          </div>
          <div style="padding:25px 40px; color:#f8fafc; font-size:17px; font-weight:bold; line-height:2; text-align:right; background-color:${config.bgTitle}; border-top:2px solid rgba(255,255,255,0.1);" dir="rtl">
            <ul style="margin:0; padding:0 20px 0 0;">
              <li style="margin-bottom:12px;"><span style="color:${config.accent};">✓</span> توفير حقيقي وفريد في رسوم المزاد يصل إلى 40%.</li>
              <li style="margin-bottom:12px;"><span style="color:${config.accent};">✓</span> سيارات فخمة ونظيفة مضمونة وحصرية لعملائنا الأعزاء.</li>
              <li><span style="color:${config.accent};">✓</span> أسعار منافسة للسوق المحلي وشفافية مطلقة!</li>
            </ul>
          </div>
          <div style="text-align:center; padding:35px 20px; background-color:${config.bgBody};">
             <a href="https://www.autopro.ac/marketplace" style="display:inline-block; background-color:${config.accent}; color:${config.bgTitle}; padding:18px 36px; font-size:22px; font-weight:900; text-decoration:none; border-radius:10px; box-shadow:0 6px 15px rgba(0,0,0,0.4);">
               ${config.buttonText}
             </a>
          </div>
          <div style="background-color:#020617; padding:20px; text-align:center;">
             <p style="color:#64748b; font-size:12px; margin:0;">حقوق النشر أوتو برو للمزادات 2026. المتبعة في السوق المحلي، ليبيا</p>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handleSend = async () => {
    if (selectedUsers.length === 0) return showAlert('يجب اختيار مستخدم واحد على الأقل', 'error');
    if (!subject) return showAlert('يجب إدخال عنوان للإيميل', 'error');

    setSending(true);
    const emails = users.filter(u => selectedUsers.includes(u.id)).map(u => u.email).filter(Boolean);

    try {
      const res = await authFetch('/api/admin/send-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails, subject, html: generateHTML() })
      });
      if (res.ok) {
        showAlert('تم إدراج الحملة للإرسال بنجاح!', 'success');
        setSelectedUsers([]);
      } else {
        showAlert('فشل في إرسال الحملة', 'error');
      }
    } catch (e) {
      showAlert('حدث خطأ في النظام', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editTemplate) return;
    setSavingTemplate(true);
    try {
      const res = await authFetch(`/api/admin/notification-templates/${editTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editTemplate)
      });
      if (res.ok) {
        showAlert('تم حفظ القالب بنجاح!', 'success');
        fetchTemplates();
      } else {
        showAlert('فشل حفظ القالب', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال', 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
      {/* Header & Sub-Tabs */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <Mail className="w-8 h-8 text-indigo-500" />
              أدوات التسويق والتواصل
            </h2>
            <p className="text-slate-500 font-bold text-sm mt-1">إدارة الحملات البريدية وتعديل قوالب الإشعارات التلقائية.</p>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            <button
              onClick={() => setActiveTab('campaign')}
              className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${activeTab === 'campaign' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🚀 حملة بريدية
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-6 py-2.5 rounded-xl font-black text-sm transition-all ${activeTab === 'templates' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              📝 قوالب الإشعارات
            </button>
          </div>
        </div>

        {activeTab === 'campaign' && (
          <div className="flex justify-end">
            <button
              onClick={handleSend}
              disabled={sending || selectedUsers.length === 0}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3 rounded-2xl font-black transition-all flex items-center gap-2 shadow-lg shadow-indigo-200"
            >
              {sending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              إرسال الحملة الآن ({selectedUsers.length})
            </button>
          </div>
        )}
      </div>

      {activeTab === 'campaign' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="font-black text-lg text-slate-800 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-500" />
                الجمهور المستهدف
              </h3>
              <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-xl">
                <table className="w-full text-right text-sm min-w-[600px]">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="p-3">
                        <input title="اختيار الكل" aria-label="اختيار الكل" type="checkbox" checked={selectedUsers.length === users.length && users.length > 0} onChange={toggleAllUsers} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                      </th>
                      <th className="p-3 font-bold text-slate-600">الاسم</th>
                      <th className="p-3 font-bold text-slate-600">الإيميل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="p-3">
                          <input title="اختيار المستخدم" aria-label={`اختيار المستخدم ${u.firstName} `} type="checkbox" checked={selectedUsers.includes(u.id)} onChange={() => toggleUser(u.id)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300" />
                        </td>
                        <td className="p-3 font-bold text-slate-800">{u.firstName} {u.lastName}</td>
                        <td className="p-3 text-slate-500">{u.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="font-black text-lg text-slate-800 mb-4 flex items-center gap-2">
                <Car className="w-5 h-5 text-emerald-500" />
                ربط سيارات بالحملة (الحد الأقصى 18)
              </h3>
              <div className="space-y-5 max-h-[500px] overflow-y-auto pr-2 pb-2">
                {[
                  { title: 'قريباً', list: cars.filter(c => c.status === 'upcoming').slice(0, 6) },
                  { title: 'المزادات المباشرة', list: cars.filter(c => c.status === 'active' || c.status === 'live').slice(0, 6) },
                  { title: 'سوق العروض', list: cars.filter(c => c.status === 'offer_market' || c.status === 'ultimo').slice(0, 10) }
                ].map(section => section.list.length > 0 && (
                  <div key={section.title} className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <h4 className="font-black text-sm text-indigo-900 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                      {section.title}
                    </h4>
                    <div className="grid grid-cols-3 gap-3">
                      {section.list.map(c => (
                        <div
                          key={c.id}
                          onClick={() => toggleCar(c.id)}
                          className={`cursor-pointer bg-white rounded-xl border-2 transition-all overflow-hidden relative group ${selectedCars.includes(c.id) ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <img alt={`سيارة ${c.make} ${c.model} `} src={getCarImage(c)} className="w-full h-20 object-cover" />
                          <div className="p-2 text-center">
                            <p className="font-bold text-xs truncate text-slate-800" dir="ltr">{c.year} {c.make}</p>
                            <p className="text-emerald-600 font-bold text-xs mt-1">${c.buyNowPrice || c.currentBid || 0}</p>
                          </div>
                          {selectedCars.includes(c.id) && (
                            <div className="absolute top-1 right-1 bg-indigo-500 text-white rounded-full p-1 shadow-sm">
                              <CheckCircle2 className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
            <h3 className="font-black text-lg text-slate-800 mb-4 flex items-center gap-2">
              <Eye className="w-5 h-5 text-orange-500" />
              معاينة الإيميل (Live Preview)
            </h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">القالب</label>
                <select
                  value={templateType}
                  onChange={e => setTemplateType(e.target.value as any)}
                  title="نوع القالب"
                  aria-label="نوع القالب"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="upcoming">سيارات قريباً</option>
                  <option value="live_auction">المزادات المباشرة</option>
                  <option value="offer_market">سوق العروض</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-black text-slate-700 mb-2">عنوان الإيميل</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  title="عنوان الإيميل"
                  aria-label="عنوان الإيميل"
                  placeholder="أدخل عنوان الرسالة هنا..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-slate-800 outline-none focus:border-indigo-500 transition-all"
                />
              </div>
            </div>
            <div className="flex-1 bg-slate-100 rounded-2xl border-4 border-slate-300 overflow-hidden relative" dir="ltr">
              <iframe
                srcDoc={generateHTML()}
                className="w-full h-[600px] border-none"
                title="Email Preview"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-[600px]">
          <div className="lg:col-span-1 space-y-3">
            <h3 className="font-black text-lg text-slate-800 px-2 flex items-center gap-2">
              <List className="w-5 h-5 text-indigo-500" />
              قائمة القوالب
            </h3>
            {notifTemplates.map(t => (
              <div
                key={t.id}
                onClick={() => { setSelectedTemplateId(t.id); setEditTemplate(t); }}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedTemplateId === t.id ? 'border-indigo-500 bg-indigo-50 shadow-md' : 'border-slate-100 bg-white hover:border-slate-200'}`}
              >
                <div className="font-black text-slate-800 text-sm mb-1">{t.name || t.id}</div>
                <div className="text-[10px] text-slate-400 font-bold truncate">{t.subject}</div>
                <div className="text-[9px] text-slate-400 mt-2">آخر تحديث: {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString('ar-EG') : '—'}</div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            {editTemplate ? (
              <>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div>
                    <h3 className="font-black text-xl text-slate-800">تعديل قالب: <span className="text-indigo-600">{editTemplate.name || editTemplate.id}</span></h3>
                    <p className="text-xs text-slate-400 font-bold mt-1">تعديل محتوى الرسائل التلقائية (Email & WhatsApp)</p>
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-2.5 rounded-xl font-black transition-all flex items-center gap-2 shadow-lg shadow-emerald-200"
                  >
                    {savingTemplate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    حفظ التغييرات
                  </button>
                </div>

                <div className="bg-slate-100 p-1 flex border-b border-slate-200">
                  <button
                    onClick={() => setPreviewMode('code')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${previewMode === 'code' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Code2 className="w-4 h-4 inline-block ml-1" /> المحرر البرمجي
                  </button>
                  <button
                    onClick={() => setPreviewMode('preview')}
                    className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${previewMode === 'preview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Eye className="w-4 h-4 inline-block ml-1" /> معاينة مباشرة
                  </button>
                </div>
                
                <div className="p-8 space-y-6 overflow-y-auto flex-1">
                  <div className="space-y-2">
                    <label className="block text-sm font-black text-slate-700">عنوان الرسالة (Subject)</label>
                    <input
                      type="text"
                      value={editTemplate.subject || ''}
                      onChange={e => setEditTemplate({ ...editTemplate, subject: e.target.value })}
                      title="عنوان الرسالة (Subject)"
                      aria-label="عنوان الرسالة (Subject)"
                      placeholder="أدخل عنوان القالب هنا..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {previewMode === 'code' ? (
                      <>
                        <div className="space-y-3">
                          <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                            <Mail className="w-4 h-4 text-blue-500" /> محتوى البريد (HTML)
                          </label>
                          <textarea
                            dir="ltr"
                            value={editTemplate.body_html || ''}
                            onChange={e => setEditTemplate({ ...editTemplate, body_html: e.target.value })}
                            title="محتوى البريد (HTML)"
                            aria-label="محتوى البريد (HTML)"
                            placeholder="<!-- أدخل كود HTML هنا -->"
                            className="w-full bg-slate-900 text-emerald-400 font-mono text-xs rounded-2xl p-6 min-h-[400px] outline-none border-2 border-slate-800 focus:border-indigo-500"
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                            <MessageSquare className="w-4 h-4 text-emerald-500" /> محتوى الواتساب (WhatsApp)
                          </label>
                          <textarea
                            value={editTemplate.body_whatsapp || ''}
                            onChange={e => setEditTemplate({ ...editTemplate, body_whatsapp: e.target.value })}
                            title="محتوى الواتساب (WhatsApp)"
                            aria-label="محتوى الواتساب (WhatsApp)"
                            placeholder="أدخل نص الرسالة هنا..."
                            className="w-full bg-emerald-50 text-emerald-900 font-bold text-sm rounded-2xl p-6 min-h-[400px] outline-none border-2 border-emerald-100 focus:border-emerald-500"
                          />
                          <div className="text-[10px] text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="font-black text-slate-700 mb-2 border-b border-slate-200 pb-1">المتغيرات المتاحة:</h4>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
                              <div><code className="text-indigo-600">{"{{userName}}"}</code> اسم العميل</div>
                              <div><code className="text-indigo-600">{"{{carLink}}"}</code> رابط السيارة</div>
                              <div><code className="text-indigo-600">{"{{invoiceLink}}"}</code> رابط الفاتورة</div>
                              <div><code className="text-indigo-600">{"{{shippingLink}}"}</code> رابط الشحن</div>
                              <div><code className="text-indigo-600">{"{{winLink}}"}</code> رابط السيارات الفائزة</div>
                              <div><code className="text-indigo-600">{"{{itemInfo}}"}</code> معلومات الغرض</div>
                              <div><code className="text-indigo-600">{"{{title}}"}</code> عنوان الإشعار</div>
                              <div><code className="text-indigo-600">{"{{message}}"}</code> نص الرسالة</div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-3 h-full flex flex-col">
                          <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                             📧 معاينة البريد الإلكتروني
                          </label>
                          <div className="flex-1 bg-white border-4 border-slate-200 rounded-3xl overflow-hidden shadow-inner min-h-[500px]">
                            <iframe
                              srcDoc={renderPreview(editTemplate.body_html)}
                              className="w-full h-full border-none"
                              title="Email Template Preview"
                            />
                          </div>
                        </div>
                        <div className="space-y-3 h-full flex flex-col">
                          <label className="flex items-center gap-2 text-sm font-black text-slate-700">
                             📱 معاينة الواتساب
                          </label>
                          <div className="flex-1 bg-[#e5ddd5] border-4 border-slate-200 rounded-3xl p-4 min-h-[500px] relative overflow-y-auto">
                            <div className="max-w-[85%] bg-white rounded-2xl p-4 shadow-sm relative mr-auto">
                              <p className="text-slate-800 text-sm whitespace-pre-wrap leading-relaxed">
                                {renderPreview(editTemplate.body_whatsapp)}
                              </p>
                              <div className="text-[10px] text-slate-400 text-left mt-1">10:45 AM</div>
                              <div className="absolute top-0 right-[-8px] w-0 h-0 border-t-[10px] border-t-white border-r-[10px] border-r-transparent"></div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <FileText className="w-10 h-10 text-slate-200" />
                </div>
                <h3 className="text-slate-400 font-black">اختر قالباً من القائمة للبدء في تعديله</h3>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// CRM Panel — Customer Relationship Management
// ============================================================
const CRMPanel: React.FC = () => {
  const [customers, setCustomers] = React.useState<any[]>([]);
  const [leads, setLeads] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'hot' | 'warm' | 'cold' | 'broadcast'>('overview');
  const [broadcastForm, setBroadcastForm] = React.useState({ segment: 'all', subject: '', content: '' });
  const [sending, setSending] = React.useState(false);
  const { showAlert } = useStore();

  // --- Customer Detail Modal State ---
  const [selectedCustomer, setSelectedCustomer] = React.useState<any>(null);
  const [showCustomerModal, setShowCustomerModal] = React.useState(false);
  const [customerBids, setCustomerBids] = React.useState<any[]>([]);
  const [customerInvoices, setCustomerInvoices] = React.useState<any[]>([]);
  const [customerShipments, setCustomerShipments] = React.useState<any[]>([]);
  const [customerNotes, setCustomerNotes] = React.useState<any[]>([]);
  const [modalLoading, setModalLoading] = React.useState(false);
  const [newNote, setNewNote] = React.useState('');
  const [addingNote, setAddingNote] = React.useState(false);
  const [dmForm, setDmForm] = React.useState({ subject: '', content: '' });
  const [showDmForm, setShowDmForm] = React.useState(false);
  const [sendingDm, setSendingDm] = React.useState(false);
  const [statusUpdating, setStatusUpdating] = React.useState(false);
  const [modalTab, setModalTab] = React.useState<'info' | 'bids' | 'invoices' | 'shipments' | 'notes'>('info');

  // Open customer detail modal and fetch all related data
  const openCustomerDetail = async (customer: any) => {
    setSelectedCustomer(customer);
    setShowCustomerModal(true);
    setModalTab('info');
    setShowDmForm(false);
    setDmForm({ subject: '', content: '' });
    setNewNote('');
    setModalLoading(true);
    try {
      const userId = customer.userId || customer.id;
      const [bidsRes, invoicesRes, shipmentsRes, notesRes] = await Promise.all([
        authFetch(`/api/bids/user/${userId}`).then(r => r.ok ? r.json() : []).catch(() => []),
        authFetch(`/api/invoices/user/${userId}`).then(r => r.ok ? r.json() : []).catch(() => []),
        authFetch(`/api/shipments/user/${userId}`).then(r => r.ok ? r.json() : []).catch(() => []),
        authFetch(`/api/crm/notes/${userId}`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setCustomerBids(Array.isArray(bidsRes) ? bidsRes : []);
      setCustomerInvoices(Array.isArray(invoicesRes) ? invoicesRes : []);
      setCustomerShipments(Array.isArray(shipmentsRes) ? shipmentsRes : []);
      setCustomerNotes(Array.isArray(notesRes) ? notesRes : []);
    } catch { /* silently handle */ }
    finally { setModalLoading(false); }
  };

  // Add a CRM note
  const addNote = async () => {
    if (!newNote.trim() || !selectedCustomer) return;
    setAddingNote(true);
    try {
      const userId = selectedCustomer.userId || selectedCustomer.id;
      const r = await authFetch('/api/crm/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, note: newNote }),
      });
      if (r.ok) {
        const saved = await r.json();
        setCustomerNotes(prev => [saved, ...prev]);
        setNewNote('');
        showAlert('تم إضافة الملاحظة ✅', 'success');
      } else { showAlert('فشل إضافة الملاحظة'); }
    } finally { setAddingNote(false); }
  };

  // Send direct message
  const sendDirectMessage = async () => {
    if (!dmForm.subject || !dmForm.content || !selectedCustomer) return;
    setSendingDm(true);
    try {
      const userId = selectedCustomer.userId || selectedCustomer.id;
      const r = await authFetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: 'admin-1', receiverId: userId, subject: dmForm.subject, content: dmForm.content, category: 'crm' }),
      });
      if (r.ok) {
        showAlert('تم إرسال الرسالة ✅', 'success');
        setDmForm({ subject: '', content: '' });
        setShowDmForm(false);
      } else { showAlert('فشل إرسال الرسالة'); }
    } finally { setSendingDm(false); }
  };

  // Update lead status
  const updateLeadStatus = async (newStatus: string) => {
    if (!selectedCustomer) return;
    setStatusUpdating(true);
    try {
      const userId = selectedCustomer.userId || selectedCustomer.id;
      const r = await authFetch('/api/crm/update-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: newStatus }),
      });
      if (r.ok) {
        showAlert('تم تحديث حالة العميل ✅', 'success');
        setSelectedCustomer((prev: any) => ({ ...prev, leadStatus: newStatus }));
        setLeads(prev => prev.map(l => (l.userId || l.id) === userId ? { ...l, leadStatus: newStatus } : l));
      } else { showAlert('فشل تحديث الحالة'); }
    } finally { setStatusUpdating(false); }
  };

  // Check if customer is inactive (no bids in 30 days)
  const isInactive = (customer: any): boolean => {
    if (!customer.lastBidDate) return true;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return new Date(customer.lastBidDate) < thirtyDaysAgo;
  };

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      authFetch('/api/crm/customers').then(r => r.ok ? r.json() : []),
      authFetch('/api/marketing/leads').then(r => r.ok ? r.json() : []),
    ]).then(([c, l]) => {
      setCustomers(Array.isArray(c) ? c : []);
      setLeads(Array.isArray(l) ? l : []);
    }).finally(() => setLoading(false));
  }, []);

  const hot = leads.filter((l: any) => l.leadStatus === 'hot');
  const warm = leads.filter((l: any) => l.leadStatus === 'warm');
  const cold = leads.filter((l: any) => l.leadStatus === 'cold');
  const totalRevenue = customers.reduce((s: number, c: any) => s + (c.totalDeposited || 0), 0);
  const avgDeposit = customers.length ? totalRevenue / customers.filter((c: any) => c.totalDeposited > 0).length || 0 : 0;

  const sendBroadcast = async () => {
    if (!broadcastForm.subject || !broadcastForm.content) { showAlert('الموضوع والمحتوى مطلوبان'); return; }
    setSending(true);
    try {
      const r = await authFetch('/api/crm/send-message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(broadcastForm),
      });
      const d = await r.json();
      if (r.ok) showAlert(`✅ تم الإرسال إلى ${d.sent} عميل`, 'success');
      else showAlert(d.error || 'فشل الإرسال');
    } finally { setSending(false); }
  };

  const listByTab = activeTab === 'hot' ? hot : activeTab === 'warm' ? warm : activeTab === 'cold' ? cold : leads;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 p-6" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 bg-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
          <Users className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800">CRM — إدارة العلاقات مع العملاء</h2>
          <p className="text-slate-500 text-sm">تتبع كل عميل من التسجيل حتى الشراء وما بعده</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'إجمالي العملاء', val: leads.length, color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: '🔥 عملاء ساخنون', val: hot.length, color: 'text-red-600', bg: 'bg-red-50' },
          { label: '🌡️ عملاء دافئون', val: warm.length, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: '❄️ عملاء باردون', val: cold.length, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'إجمالي الإيداعات', val: `$${totalRevenue.toLocaleString()}`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-black ${k.color}`}>{k.val}</div>
            <div className="text-xs text-slate-500 font-bold mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit flex-wrap">
        {([['overview','كل العملاء'],['hot','🔥 ساخنون'],['warm','🌡️ دافئون'],['cold','❄️ باردون'],['broadcast','📢 رسالة جماعية']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k as any)}
            className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${activeTab === k ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Broadcast Form */}
      {activeTab === 'broadcast' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 space-y-4 max-w-2xl">
          <h3 className="text-lg font-black text-slate-800">إرسال رسالة جماعية</h3>
          <select value={broadcastForm.segment} onChange={e => setBroadcastForm(p => ({...p, segment: e.target.value}))}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-purple-400">
            <option value="all">كل العملاء</option>
            <option value="hot">العملاء الساخنون (أودعوا عرابين)</option>
            <option value="warm">العملاء الدافئون (زايدوا لكن لم يودعوا)</option>
            <option value="cold">العملاء الباردون (سجلوا فقط)</option>
            <option value="no_deposit">بدون إيداع</option>
            <option value="kyc_pending">KYC معلق</option>
          </select>
          <input value={broadcastForm.subject} onChange={e => setBroadcastForm(p => ({...p, subject: e.target.value}))}
            placeholder="موضوع الرسالة" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-purple-400" />
          <textarea value={broadcastForm.content} onChange={e => setBroadcastForm(p => ({...p, content: e.target.value}))}
            placeholder="نص الرسالة..." rows={5}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-purple-400 resize-none" />
          <button onClick={sendBroadcast} disabled={sending}
            className="bg-purple-600 text-white px-8 py-3 rounded-xl font-black text-sm hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2">
            {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {sending ? 'جاري الإرسال...' : 'إرسال الرسالة'}
          </button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 font-bold">جاري التحميل...</div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[900px]">
              <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="p-4">العميل</th>
                  <th className="p-4">حالة العميل</th>
                  <th className="p-4">المزايدات</th>
                  <th className="p-4">الإيداع</th>
                  <th className="p-4">الرصيد</th>
                  <th className="p-4">تاريخ التسجيل</th>
                  <th className="p-4">الدولة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {listByTab.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-all cursor-pointer" onClick={() => openCustomerDetail(c)}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-black text-sm">
                          {(c.firstName||'?').charAt(0)}
                        </div>
                        <div>
                          <div className="font-black text-slate-900 text-sm">{c.firstName} {c.lastName}</div>
                          <div className="text-[10px] text-slate-400">{c.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-black ${
                          c.leadStatus === 'hot' ? 'bg-red-100 text-red-700' :
                          c.leadStatus === 'warm' ? 'bg-amber-100 text-amber-700' :
                          c.leadStatus === 'vip' ? 'bg-purple-100 text-purple-700' :
                          'bg-blue-100 text-blue-700'}`}>
                          {c.leadStatus === 'hot' ? '🔥 ساخن' : c.leadStatus === 'warm' ? '🌡️ دافئ' : c.leadStatus === 'vip' ? '⭐ VIP' : '❄️ بارد'}
                        </span>
                        {isInactive(c) && (
                          <span className="px-2 py-1 rounded-full text-[10px] font-black bg-orange-100 text-orange-700 border border-orange-200">
                            غير نشط
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 font-mono font-black text-slate-700">{c.totalBids || 0}</td>
                    <td className="p-4 font-mono font-black text-emerald-600">${(c.deposit || 0).toLocaleString()}</td>
                    <td className="p-4 font-mono text-sm text-slate-600">${(c.walletBalance || 0).toLocaleString()}</td>
                    <td className="p-4 text-xs text-slate-500">{c.joinDate ? new Date(c.joinDate).toLocaleDateString('ar-EG') : '—'}</td>
                    <td className="p-4 text-sm text-slate-600">{c.country || '—'}</td>
                  </tr>
                ))}
                {listByTab.length === 0 && (
                  <tr><td colSpan={7} className="p-12 text-center text-slate-400 font-bold">لا يوجد عملاء في هذه الفئة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== Customer Detail Modal ========== */}
      {showCustomerModal && selectedCustomer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowCustomerModal(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 rounded-t-3xl p-6 flex items-center justify-between z-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">
                  {(selectedCustomer.firstName || '?').charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selectedCustomer.firstName} {selectedCustomer.lastName}</h2>
                  <p className="text-sm text-slate-500">{selectedCustomer.email}</p>
                </div>
                <div className="flex items-center gap-2 mr-4">
                  {/* Status Dropdown */}
                  <select
                    value={selectedCustomer.leadStatus || 'cold'}
                    onChange={e => updateLeadStatus(e.target.value)}
                    disabled={statusUpdating}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 outline-none transition-all cursor-pointer ${
                      selectedCustomer.leadStatus === 'hot' ? 'border-red-300 bg-red-50 text-red-700' :
                      selectedCustomer.leadStatus === 'warm' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                      selectedCustomer.leadStatus === 'vip' ? 'border-purple-300 bg-purple-50 text-purple-700' :
                      'border-blue-300 bg-blue-50 text-blue-700'
                    } disabled:opacity-50`}
                  >
                    <option value="hot">🔥 ساخن</option>
                    <option value="warm">🌡️ دافئ</option>
                    <option value="cold">❄️ بارد</option>
                    <option value="vip">⭐ VIP</option>
                  </select>
                  {isInactive(selectedCustomer) && (
                    <span className="px-2 py-1 rounded-full text-[10px] font-black bg-orange-100 text-orange-700 border border-orange-200">غير نشط</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowDmForm(!showDmForm)}
                  className="bg-purple-600 text-white px-4 py-2 rounded-xl text-xs font-black hover:bg-purple-700 transition-all flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5" /> رسالة مباشرة
                </button>
                <button onClick={() => setShowCustomerModal(false)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            {/* Direct Message Form (collapsible) */}
            {showDmForm && (
              <div className="mx-6 mt-4 p-4 bg-purple-50 border border-purple-200 rounded-2xl space-y-3">
                <h4 className="font-black text-sm text-purple-800">إرسال رسالة مباشرة</h4>
                <input
                  value={dmForm.subject} onChange={e => setDmForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="الموضوع" className="w-full bg-white border border-purple-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:border-purple-400"
                />
                <textarea
                  value={dmForm.content} onChange={e => setDmForm(p => ({ ...p, content: e.target.value }))}
                  placeholder="نص الرسالة..." rows={3}
                  className="w-full bg-white border border-purple-200 rounded-xl p-2.5 text-sm font-bold outline-none focus:border-purple-400 resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={sendDirectMessage} disabled={sendingDm || !dmForm.subject || !dmForm.content}
                    className="bg-purple-600 text-white px-5 py-2 rounded-xl text-xs font-black hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
                    {sendingDm ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {sendingDm ? 'جاري الإرسال...' : 'إرسال'}
                  </button>
                  <button onClick={() => { setShowDmForm(false); setDmForm({ subject: '', content: '' }); }}
                    className="px-4 py-2 rounded-xl text-xs font-black bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all">إلغاء</button>
                </div>
              </div>
            )}

            {/* Modal Tabs */}
            <div className="px-6 pt-4">
              <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl w-fit flex-wrap">
                {([
                  ['info', 'المعلومات'],
                  ['bids', 'المزايدات'],
                  ['invoices', 'الفواتير'],
                  ['shipments', 'الشحنات'],
                  ['notes', 'الملاحظات'],
                ] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setModalTab(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${modalTab === k ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {modalLoading ? (
                <div className="flex items-center justify-center h-32 text-slate-400 font-bold">
                  <RefreshCw className="w-5 h-5 animate-spin ml-2" /> جاري تحميل البيانات...
                </div>
              ) : modalTab === 'info' ? (
                /* --- Info Tab --- */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'الاسم الكامل', value: `${selectedCustomer.firstName || ''} ${selectedCustomer.lastName || ''}`.trim() || '—', icon: <User className="w-4 h-4" /> },
                    { label: 'البريد الإلكتروني', value: selectedCustomer.email || '—', icon: <Mail className="w-4 h-4" /> },
                    { label: 'الهاتف', value: selectedCustomer.phone || '—', icon: <Bell className="w-4 h-4" /> },
                    { label: 'الدولة', value: selectedCustomer.country || '—', icon: <MapPin className="w-4 h-4" /> },
                    { label: 'تاريخ التسجيل', value: selectedCustomer.joinDate ? new Date(selectedCustomer.joinDate).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '—', icon: <Clock className="w-4 h-4" /> },
                    { label: 'حالة KYC', value: selectedCustomer.kycStatus === 'approved' ? '✅ مُعتمد' : selectedCustomer.kycStatus === 'pending' ? '⏳ قيد المراجعة' : '❌ غير مكتمل', icon: <ShieldCheck className="w-4 h-4" /> },
                    { label: 'إجمالي الإيداع', value: `$${(selectedCustomer.totalDeposited || selectedCustomer.deposit || 0).toLocaleString()}`, icon: <DollarSign className="w-4 h-4" /> },
                    { label: 'قوة الشراء', value: `$${(selectedCustomer.buyingPower || 0).toLocaleString()}`, icon: <TrendingUp className="w-4 h-4" /> },
                    { label: 'رصيد المحفظة', value: `$${(selectedCustomer.walletBalance || 0).toLocaleString()}`, icon: <Wallet className="w-4 h-4" /> },
                    { label: 'عدد المزايدات', value: selectedCustomer.totalBids || 0, icon: <Gavel className="w-4 h-4" /> },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-500 shadow-sm">{item.icon}</div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-bold">{item.label}</div>
                        <div className="text-sm font-black text-slate-800">{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>

              ) : modalTab === 'bids' ? (
                /* --- Bids Tab --- */
                <div>
                  {customerBids.length === 0 ? (
                    <div className="text-center text-slate-400 font-bold py-12">لا توجد مزايدات لهذا العميل</div>
                  ) : (
                    <div className="space-y-2">
                      {customerBids.map((bid: any, i: number) => (
                        <div key={bid.id || i} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                              <Gavel className="w-4 h-4 text-orange-600" />
                            </div>
                            <div>
                              <div className="font-black text-sm text-slate-800">{bid.carTitle || bid.carId || `مزايدة #${i + 1}`}</div>
                              <div className="text-[10px] text-slate-400">{bid.createdAt ? new Date(bid.createdAt).toLocaleDateString('ar-EG') : '—'}</div>
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="font-black text-emerald-600">${(bid.amount || 0).toLocaleString()}</div>
                            <div className={`text-[10px] font-bold ${bid.status === 'winning' ? 'text-emerald-500' : bid.status === 'outbid' ? 'text-red-500' : 'text-slate-400'}`}>
                              {bid.status === 'winning' ? 'رابح' : bid.status === 'outbid' ? 'تم تجاوزه' : bid.status || '—'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              ) : modalTab === 'invoices' ? (
                /* --- Invoices Tab --- */
                <div>
                  {customerInvoices.length === 0 ? (
                    <div className="text-center text-slate-400 font-bold py-12">لا توجد فواتير لهذا العميل</div>
                  ) : (
                    <div className="space-y-2">
                      {customerInvoices.map((inv: any, i: number) => (
                        <div key={inv.id || i} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                              <Receipt className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <div className="font-black text-sm text-slate-800">فاتورة #{inv.invoiceNumber || inv.id || i + 1}</div>
                              <div className="text-[10px] text-slate-400">{inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('ar-EG') : '—'}</div>
                            </div>
                          </div>
                          <div className="text-left">
                            <div className="font-black text-slate-800">${(inv.totalAmount || inv.amount || 0).toLocaleString()}</div>
                            <div className={`text-[10px] font-bold ${inv.status === 'paid' ? 'text-emerald-500' : inv.status === 'pending' ? 'text-amber-500' : 'text-slate-400'}`}>
                              {inv.status === 'paid' ? 'مدفوعة' : inv.status === 'pending' ? 'معلقة' : inv.status || '—'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              ) : modalTab === 'shipments' ? (
                /* --- Shipments Tab --- */
                <div>
                  {customerShipments.length === 0 ? (
                    <div className="text-center text-slate-400 font-bold py-12">لا توجد شحنات لهذا العميل</div>
                  ) : (
                    <div className="space-y-2">
                      {customerShipments.map((sh: any, i: number) => (
                        <div key={sh.id || i} className="flex items-center justify-between bg-slate-50 rounded-xl p-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center">
                              <Ship className="w-4 h-4 text-teal-600" />
                            </div>
                            <div>
                              <div className="font-black text-sm text-slate-800">{sh.trackingNumber || sh.carTitle || `شحنة #${i + 1}`}</div>
                              <div className="text-[10px] text-slate-400">{sh.createdAt ? new Date(sh.createdAt).toLocaleDateString('ar-EG') : '—'}</div>
                            </div>
                          </div>
                          <div className="text-left">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black ${
                              sh.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                              sh.status === 'in_transit' ? 'bg-blue-100 text-blue-700' :
                              sh.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {sh.status === 'delivered' ? 'تم التسليم' : sh.status === 'in_transit' ? 'في الطريق' : sh.status === 'pending' ? 'قيد الانتظار' : sh.status || '—'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              ) : modalTab === 'notes' ? (
                /* --- Notes Tab --- */
                <div className="space-y-4">
                  {/* Add new note */}
                  <div className="flex gap-2">
                    <input
                      value={newNote} onChange={e => setNewNote(e.target.value)}
                      placeholder="أضف ملاحظة جديدة..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold outline-none focus:border-purple-400"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                    />
                    <button onClick={addNote} disabled={addingNote || !newNote.trim()}
                      className="bg-purple-600 text-white px-5 py-3 rounded-xl text-xs font-black hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-1.5">
                      {addingNote ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                      إضافة
                    </button>
                  </div>
                  {/* Notes list */}
                  {customerNotes.length === 0 ? (
                    <div className="text-center text-slate-400 font-bold py-12">لا توجد ملاحظات لهذا العميل</div>
                  ) : (
                    <div className="space-y-2">
                      {customerNotes.map((note: any, i: number) => (
                        <div key={note.id || i} className="bg-slate-50 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400 font-bold">
                              {note.createdBy || 'مدير'} — {note.createdAt ? new Date(note.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 font-bold leading-relaxed">{note.note || note.content || note.text || '—'}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Seller Journey Panel — KYC, Cars, Payouts
// ============================================================
const SellerJourneyPanel: React.FC = () => {
  const [sellers, setSellers] = React.useState<any[]>([]);
  const [payouts, setPayouts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<'sellers' | 'payouts'>('sellers');
  const { showAlert } = useStore();

  const load = () => {
    setLoading(true);
    Promise.all([
      authFetch('/api/sellers').then(r => r.ok ? r.json() : []),
      authFetch('/api/admin/seller-payouts').then(r => r.ok ? r.json() : []),
    ]).then(([s, p]) => {
      setSellers(Array.isArray(s) ? s : []);
      setPayouts(Array.isArray(p) ? p : []);
    }).finally(() => setLoading(false));
  };

  React.useEffect(() => { load(); }, []);

  const approvePayout = async (id: string) => {
    const r = await authFetch(`/api/admin/approve-seller-withdrawal/${id}`, { method: 'POST' });
    if (r.ok) { showAlert('تم الموافقة على طلب السحب ✅', 'success'); load(); }
    else showAlert((await r.json()).error || 'فشل');
  };

  const kycApprove = async (userId: string) => {
    const r = await authFetch(`/api/admin/kyc/${userId}/approve`, { method: 'POST' });
    if (r.ok) { showAlert('تم اعتماد البائع ✅', 'success'); load(); }
  };

  const kycReject = async (userId: string) => {
    const r = await authFetch(`/api/admin/kyc/${userId}/reject`, { method: 'POST' });
    if (r.ok) { showAlert('تم رفض طلب KYC ❌', 'success'); load(); }
    else showAlert((await r.json().catch(() => ({}))).error || 'فشل في الرفض', 'error');
  };

  const rejectPayout = async (id: string) => {
    const r = await authFetch(`/api/admin/withdrawal-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'تم الرفض من قبل الإدارة' })
    });
    if (r.ok) { showAlert('تم رفض طلب السحب ❌', 'success'); load(); }
    else showAlert((await r.json().catch(() => ({}))).error || 'فشل في الرفض', 'error');
  };

  const STATUS_COLOR: Record<string,string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
    active: 'bg-emerald-100 text-emerald-700',
    suspended: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 p-6" dir="rtl">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
            <Car className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800">رحلة البائعين</h2>
            <p className="text-slate-500 text-sm">KYC، إدارة السيارات، وصرف المستحقات</p>
          </div>
        </div>
        <button onClick={load} className="bg-slate-100 hover:bg-slate-200 p-2 rounded-xl transition-all">
          <RefreshCw className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'إجمالي البائعين', val: sellers.length, color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: 'طلبات KYC معلقة', val: sellers.filter((s:any) => s.kycStatus === 'pending').length, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'طلبات سحب معلقة', val: payouts.filter((p:any) => p.status === 'pending').length, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-4 text-center`}>
            <div className={`text-2xl font-black ${k.color}`}>{k.val}</div>
            <div className="text-xs text-slate-500 font-bold mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
        {([['sellers','البائعون والـ KYC'],['payouts','طلبات صرف المستحقات']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k as any)}
            className={`px-5 py-2 rounded-xl text-sm font-black transition-all ${activeTab === k ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
            {l}
            {k === 'payouts' && payouts.filter((p:any)=>p.status==='pending').length > 0 &&
              <span className="mr-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{payouts.filter((p:any)=>p.status==='pending').length}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 font-bold">جاري التحميل...</div>
      ) : activeTab === 'sellers' ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[950px]">
              <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="p-4">البائع</th>
                  <th className="p-4">KYC</th>
                  <th className="p-4">السيارات</th>
                  <th className="p-4">المبيع</th>
                  <th className="p-4">الرصيد المتاح</th>
                  <th className="p-4">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sellers.map((s: any) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-all">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-black text-sm">
                          {(s.firstName||'?').charAt(0)}
                        </div>
                        <div>
                          <div className="font-black text-slate-900 text-sm">{s.firstName} {s.lastName}</div>
                          <div className="text-[10px] text-slate-400">{s.email}</div>
                          {s.companyName && <div className="text-[10px] text-slate-500 font-bold">{s.companyName}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black ${STATUS_COLOR[s.kycStatus] || 'bg-slate-100 text-slate-500'}`}>
                        {s.kycStatus === 'approved' ? '✅ معتمد' : s.kycStatus === 'pending' ? '⏳ معلق' : s.kycStatus === 'rejected' ? '❌ مرفوض' : '—'}
                      </span>
                    </td>
                    <td className="p-4 font-mono font-black text-slate-700">{s.totalCars || 0}</td>
                    <td className="p-4 font-mono font-black text-emerald-600">{s.soldCars || 0}</td>
                    <td className="p-4 font-mono font-black text-slate-700">${(s.availableBalance || 0).toLocaleString()}</td>
                    <td className="p-4">
                      {s.kycStatus === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => kycApprove(s.id)}
                            className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-700 transition-all">
                            اعتماد KYC ✅
                          </button>
                          <button onClick={() => kycReject(s.id)}
                            className="bg-rose-500 text-white px-4 py-1.5 rounded-lg text-xs font-black hover:bg-rose-600 transition-all">
                            رفض KYC ❌
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {sellers.length === 0 && (
                  <tr><td colSpan={6} className="p-12 text-center text-slate-400 font-bold">لا يوجد بائعون بعد</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[900px]">
              <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="p-4">البائع</th>
                  <th className="p-4">المبلغ</th>
                  <th className="p-4">IBAN / البنك</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4">تاريخ الطلب</th>
                  <th className="p-4">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payouts.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-all">
                    <td className="p-4">
                      <div className="font-black text-slate-900 text-sm">{p.firstName} {p.lastName}</div>
                      <div className="text-[10px] text-slate-400">{p.email}</div>
                    </td>
                    <td className="p-4 font-mono font-black text-emerald-600 text-lg">${Number(p.amount).toLocaleString()}</td>
                    <td className="p-4">
                      {p.iban ? <code className="bg-slate-100 px-2 py-1 rounded text-xs">{p.iban}</code> : '—'}
                      {p.bankName && <div className="text-xs text-slate-500 mt-1">{p.bankName}</div>}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black ${STATUS_COLOR[p.status] || 'bg-slate-100'}`}>
                        {p.status === 'pending' ? '⏳ معلق' : p.status === 'approved' ? '✅ موافق' : '❌ مرفوض'}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-slate-500">{p.requestedAt ? new Date(p.requestedAt).toLocaleDateString('ar-EG') : '—'}</td>
                    <td className="p-4">
                      {p.status === 'pending' && (
                        <div className="flex gap-2">
                          <button onClick={() => approvePayout(p.id)}
                            className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-black hover:bg-emerald-700 transition-all">
                            صرف ✅
                          </button>
                          <button onClick={() => rejectPayout(p.id)}
                            className="bg-rose-500 text-white px-4 py-1.5 rounded-lg text-xs font-black hover:bg-rose-600 transition-all">
                            رفض ❌
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr><td colSpan={6} className="p-12 text-center text-slate-400 font-bold">لا توجد طلبات سحب</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Financial Summary — Balance Sheet / P&L
// ============================================================
const FinancialSummaryPanel: React.FC = () => {
  const [data, setData] = React.useState<any>(null);
  const [report, setReport] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      authFetch('/api/admin/financial-summary').then(r => r.ok ? r.json() : {}),
      authFetch('/api/admin/reports').then(r => r.ok ? r.json() : {}),
    ]).then(([f, r]) => { setData(f); setReport(r); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400 font-bold p-8">جاري تحميل البيانات المالية...</div>;
  if (!data) return null;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 p-6" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg">
          <DollarSign className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800">الميزانية العمومية والتقارير المالية</h2>
          <p className="text-slate-500 text-sm">صورة مالية شاملة للمنصة</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الإيداعات', val: `$${(data.assets?.totalDepositIn || 0).toLocaleString()}`, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: '💰' },
          { label: 'عمولات المنصة', val: `$${(data.revenue?.totalCommission || 0).toLocaleString()}`, color: 'text-blue-600', bg: 'bg-blue-50', icon: '📊' },
          { label: 'أرصدة المشترين', val: `$${(data.assets?.buyerDeposits || 0).toLocaleString()}`, color: 'text-purple-600', bg: 'bg-purple-50', icon: '👥' },
          { label: 'صافي مركز المنصة', val: `$${(data.netPosition || 0).toLocaleString()}`, color: data.netPosition >= 0 ? 'text-emerald-600' : 'text-red-600', bg: data.netPosition >= 0 ? 'bg-emerald-50' : 'bg-red-50', icon: '⚖️' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} rounded-2xl p-5`}>
            <div className="text-2xl mb-2">{k.icon}</div>
            <div className={`text-2xl font-black ${k.color} font-mono`}>{k.val}</div>
            <div className="text-xs text-slate-500 font-bold mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Two columns: Assets vs Liabilities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full"></div>
            الأصول والإيرادات
          </h3>
          {[
            { label: 'إجمالي الإيداعات الواردة', val: data.assets?.totalDepositIn || 0 },
            { label: 'أرصدة المحافظ (مشترون)', val: data.assets?.buyerDeposits || 0 },
            { label: 'عمولات محصّلة', val: data.revenue?.totalCommission || 0 },
            { label: 'فواتير مدفوعة', val: data.revenue?.paidInvoices || 0 },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
              <span className="text-sm text-slate-600 font-bold">{row.label}</span>
              <span className="font-mono font-black text-emerald-600">${Number(row.val).toLocaleString()}</span>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            الالتزامات والمدفوعات
          </h3>
          {[
            { label: 'أرصدة البائعين المتاحة', val: data.liabilities?.sellerAvailable || 0 },
            { label: 'أرصدة بائعين معلقة', val: data.liabilities?.sellerPending || 0 },
            { label: 'طلبات سحب معلقة', val: data.pending?.pendingWithdrawals || 0 },
            { label: 'فواتير غير مدفوعة', val: data.pending?.unpaidInvoices || 0 },
            { label: 'مدفوعات سحب معتمدة', val: data.paid?.approvedWithdrawals || 0 },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
              <span className="text-sm text-slate-600 font-bold">{row.label}</span>
              <span className="font-mono font-black text-red-500">${Number(row.val).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Revenue Chart (text-based) */}
      {report?.monthly && report.monthly.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-black text-slate-800 mb-4">الإيداعات الشهرية (آخر 6 أشهر)</h3>
          <div className="space-y-3">
            {report.monthly.map((m: any) => {
              const pct = Math.max(5, Math.min(100, (m.total / (report.monthly[0]?.total || 1)) * 100));
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-500 w-20 shrink-0">{m.month}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full flex items-center px-3 transition-all"
                      style={{ width: `${pct}%` }}>
                      <span className="text-white text-[10px] font-black">${Number(m.total).toLocaleString()}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-bold w-16 text-left">{m.count} صفقة</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Buyers */}
      {report?.topBuyers && report.topBuyers.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-black text-slate-800">🏆 أبرز المشترين</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase">
                <tr>
                  <th className="p-4">#</th>
                  <th className="p-4">المزايد</th>
                  <th className="p-4">عدد المزايدات</th>
                  <th className="p-4">أعلى مزايدة</th>
                  <th className="p-4">إجمالي الإيداع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {report.topBuyers.map((b: any, i: number) => (
                  <tr key={b.email} className="hover:bg-slate-50 transition-all">
                    <td className="p-4 font-black text-slate-400">#{i+1}</td>
                    <td className="p-4">
                      <div className="font-black text-slate-900 text-sm">{b.firstName} {b.lastName}</div>
                      <div className="text-[10px] text-slate-400">{b.email}</div>
                    </td>
                    <td className="p-4 font-mono font-black text-slate-700">{b.bidCount}</td>
                    <td className="p-4 font-mono font-black text-orange-600">${Number(b.maxBid).toLocaleString()}</td>
                    <td className="p-4 font-mono font-black text-emerald-600">${Number(b.deposit || 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// Audit Log Panel — Security & Operations Trail
// ============================================================
const AuditLogPanel: React.FC = () => {
  const [logs, setLogs] = React.useState<any[]>([]);
  const [secData, setSecData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'all' | 'bid' | 'deposit' | 'register'>('all');

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      authFetch('/api/admin/audit-log').then(r => r.ok ? r.json() : []),
      authFetch('/api/admin/security-log').then(r => r.ok ? r.json() : {}),
    ]).then(([l, s]) => { setLogs(Array.isArray(l) ? l : []); setSecData(s); }).finally(() => setLoading(false));
  }, []);

  const ACTION_ICONS: Record<string, string> = { bid: '🔨', deposit: '💰', register: '👤', commission: '📊' };
  const ACTION_COLOR: Record<string, string> = {
    bid: 'bg-blue-100 text-blue-700',
    deposit: 'bg-emerald-100 text-emerald-700',
    register: 'bg-purple-100 text-purple-700',
  };

  const filtered = filter === 'all' ? logs : logs.filter((l: any) => l.action === filter);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 p-6" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 bg-slate-800 rounded-2xl flex items-center justify-center shadow-lg">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800">سجل الأمان والعمليات</h2>
          <p className="text-slate-500 text-sm">كل الأنشطة الحرجة مُسجَّلة — مطابقة لمعايير ISO 27001</p>
        </div>
      </div>

      {/* Security Stats */}
      {secData && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-slate-50 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-slate-700">{secData.total || 0}</div>
            <div className="text-xs text-slate-500 font-bold mt-1">إجمالي المستخدمين</div>
          </div>
          <div className="bg-amber-50 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-amber-600">{(secData.suspiciousUsers || []).length}</div>
            <div className="text-xs text-slate-500 font-bold mt-1">حسابات موقوفة/محظورة</div>
          </div>
          <div className="bg-emerald-50 rounded-2xl p-4 text-center">
            <div className="text-2xl font-black text-emerald-600">{logs.length}</div>
            <div className="text-xs text-slate-500 font-bold mt-1">سجلات الأنشطة</div>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
        {([['all','الكل'],['bid','مزايدات'],['deposit','إيداعات'],['register','تسجيلات']] as const).map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k as any)}
            className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${filter === k ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>
            {ACTION_ICONS[k] || '📋'} {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-slate-400 font-bold">جاري التحميل...</div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right min-w-[800px]">
              <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <tr>
                  <th className="p-4">النشاط</th>
                  <th className="p-4">المستخدم</th>
                  <th className="p-4">التفاصيل</th>
                  <th className="p-4">التوقيت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((log: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50 transition-all">
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black ${ACTION_COLOR[log.action] || 'bg-slate-100 text-slate-600'}`}>
                        {ACTION_ICONS[log.action] || '📋'} {log.action}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-black text-slate-900 text-sm">{log.actor}</div>
                      <div className="text-[10px] text-slate-400">{log.email}</div>
                    </td>
                    <td className="p-4 text-sm text-slate-600 font-bold">{log.detail}</td>
                    <td className="p-4 text-xs text-slate-400 font-mono">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('ar-EG') : '—'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="p-12 text-center text-slate-400 font-bold">لا توجد سجلات</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminDashboard = () => {
  const INVOICE_STATUS_LABELS: any = {
    unpaid: 'بانتظار الدفع',
    pending: 'قيد المراجعة',
    paid: 'تم الدفع بالكامل',
    awaiting_dispatch: 'بانتظار النقل الداخلي',
    picked_up: 'تم التحميل (Picked Up)',
    at_port: 'في الميناء (At Port)',
    title_received: 'استلام المستندات (Title)',
    in_transit: 'في الشحن البحري',
    arrived_khoms: 'وصلت ميناء الوصول',
    ready_for_delivery: 'جاهزة للتسليم',
    delivered_to_buyer: 'تم التسليم للمشتري',
    seller_paid: 'تم الدفع للبائع',
    seller_paid_by_admin: 'دورة مكتملة ✔️'
  };

  const INVOICE_TYPE_LABELS: any = {
    purchase: 'شراء سيارة',
    shipping: 'شحن بحري',
    transport: 'نقل داخلي',
    customs: 'تخليص جمركي',
    storage_fine: 'غرامة تخزين',
    extra_service: 'خدمة إضافية'
  };

  const { cars, addCar, updateCar, deleteCar, stats, users, setUsers, addUser, showAlert, showConfirm, socket, messages, notifications, unreadCounts, markMessageAsRead, markNotificationAsRead, sendMessage, marketEstimates, addMarketEstimate, updateMarketEstimate, deleteMarketEstimate, exchangeRate, updateExchangeRate, currentUser, setCurrentUser } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'overview';
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [showAddFeeModal, setShowAddFeeModal] = useState<{ isOpen: boolean; carId: string; userId: string } | null>(null);
  const [feeForm, setFeeForm] = useState({ amount: '', type: 'storage_fine', dueDate: '' });
  const [isAddingFee, setIsAddingFee] = useState(false);

  const [estimateSearch, setEstimateSearch] = useState('');
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [editingEstimate, setEditingEstimate] = useState<any>(null);
  const [estimateForm, setEstimateForm] = useState({
    make: '', makeEn: '', model: '', modelEn: '', year: 2024,
    condition: 'مستعمل', transmission: 'اوتوماتيك', fuel: 'بنزين',
    mileage: '1,000 - 9,999', price: '', city: 'طرابلس'
  });

  const [filter, setFilter] = useState('all');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  // Users pagination & search
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const USERS_PER_PAGE = 15;

  // Cars pagination & search
  const [carSearch, setCarSearch] = useState('');
  const [carPage, setCarPage] = useState(1);
  const CARS_PER_PAGE = 15;

  // Click Outside Refs
  const notificationsRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  useClickOutside(notificationsRef, () => setShowNotifications(false));
  useClickOutside(messagesRef, () => setShowMessages(false));
  useClickOutside(sidebarRef, () => setMobileSidebarOpen(false));
  useClickOutside(adminMenuRef, () => setShowAdminMenu(false));

  // Accordion state for sidebar categories
  const [openGroup, setOpenGroup] = useState<string>('INITIAL');

  // Reply functionality state
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyRole, setReplyRole] = useState<'manager' | 'user' | 'employee' | 'merchant'>('user');

  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [offerMarketCars, setOfferMarketCars] = useState<any[]>([]);
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [adminShipments, setAdminShipments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [editingBranch, setEditingBranch] = useState<any>(null);
  const [offices, setOffices] = useState<any[]>([]);
  const [editingOffice, setEditingOffice] = useState<any>(null);
  const [adminPendingCars, setAdminPendingCars] = useState<any[]>([]);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<any>({ stripe: true, paypal: false, tlync: true });
  const [pendingDeposits, setPendingDeposits] = useState<any[]>([]);
  // ✅ PHASE 5: Withdrawal requests
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [withdrawalNote, setWithdrawalNote] = useState('');
  const [allSystemMessages, setAllSystemMessages] = useState<any[]>([]);
  const [allSystemNotifications, setAllSystemNotifications] = useState<any[]>([]);
  const [fetchingMessages, setFetchingMessages] = useState(false);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [allInvoices, setAllInvoices] = useState<any[]>([]);
  const [adminInvoices, setAdminInvoices] = useState<any[]>([]);
  const [showInvoiceConfirmModal, setShowInvoiceConfirmModal] = useState<{ isOpen: boolean; invoice: any; nextStatus: string }>({ isOpen: false, invoice: null, nextStatus: '' });
  const [rejectReason, setRejectReason] = useState('');
  const [editingInvoice, setEditingInvoice] = useState<any>(null);
  const [showLibyanModal, setShowLibyanModal] = useState(false);
  const [libyanModalForm, setLibyanModalForm] = useState<any>({ make: '', model: '', year: 2024, price: '' });
  const [showReportModal, setShowReportModal] = useState<{ title: string; data: any } | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiKeyForm, setNewApiKeyForm] = useState({ name: '', website: '' });

  // Auto-fetch data based on view
  useEffect(() => {
    if (view === 'messages') {
      setFetchingMessages(true);
      Promise.all([
        authFetch('/api/admin/all-messages').then(res => res.ok ? res.json() : []),
        authFetch('/api/admin/all-notifications').then(res => res.ok ? res.json() : [])
      ]).then(([msgs, notes]) => {
        setAllSystemMessages(Array.isArray(msgs) ? msgs : []);
        setAllSystemNotifications(Array.isArray(notes) ? notes : []);
        setFetchingMessages(false);
      }).catch(err => {
        console.error('System feed error:', err);
        setFetchingMessages(false);
      });
    }
    if (view === 'marketplace_management' || view === 'offer_market') {
      authFetch('/api/admin/offer-market-cars')
        .then(res => res.ok ? res.json() : [])
        .then(data => setOfferMarketCars(Array.isArray(data) ? data : []))
        .catch(() => setOfferMarketCars([]));
    }
    if (view === 'financials' || view === 'financial_ledger') {
      authFetch('/api/admin/all-transactions').then(res => res.ok ? res.json() : []).then(txs => setAllTransactions(Array.isArray(txs) ? txs : [])).catch(() => setAllTransactions([]));
      authFetch('/api/admin/all-invoices').then(res => res.ok ? res.json() : []).then(invs => setAllInvoices(Array.isArray(invs) ? invs : [])).catch(() => setAllInvoices([]));
    }
    if (view === 'reports') {
      authFetch('/api/admin/reports-analytics').then(res => res.ok ? res.json() : null).then(setReportsAnalytics).catch(() => {});
      authFetch('/api/libyan-market').then(res => res.ok ? res.json() : []).then(data => setLibyanMarketPrices(Array.isArray(data) ? data : [])).catch(() => setLibyanMarketPrices([]));
    }
    if (view === 'expenses') {
      setExpensesLoading(true);
      authFetch('/api/admin/expenses').then(res => res.ok ? res.json() : []).then(data => setExpenses(Array.isArray(data) ? data : [])).catch(() => setExpenses([])).finally(() => setExpensesLoading(false));
    }
    if (view === 'overview') {
      authFetch('/api/admin/reports').then(r => r.ok ? r.json() : {}).then(data => {
        if (data.monthly && Array.isArray(data.monthly)) setOverviewMonthly(data.monthly);
      }).catch(() => {});
    }
  }, [view]);

  // Handle initial sidebar expansion based on current view
  useEffect(() => {
    if (openGroup === 'INITIAL') {
      const groups = [
        { group: 'Overview & Reports', items: ['overview', 'reports', 'messages'] },
        { group: 'User Management', items: ['user_management', 'kyc_review'] },
        { group: 'Vehicles & Auctions', items: ['cars', 'inventory_review', 'manage_live_auctions', 'marketplace_management', 'inspections'] },
        { group: 'Treasury & Accounting', items: ['financial_approvals', 'payment_requests', 'withdrawal_requests', 'all_invoices', 'financial_ledger', 'expenses', 'payment_gateways'] },
        { group: 'Logistics & Shipping', items: ['inventory_review', 'shipments_tracking', 'shipping_settings', 'calculator'] },
        { group: 'Platform Settings', items: ['system_global', 'marketing', 'offices', 'footer_settings', 'api_keys', 'welcome_settings'] }
      ];
      const activeGroup = groups.find(g => g.items.includes(view));
      if (activeGroup) {
        setOpenGroup(activeGroup.group);
      } else {
        setOpenGroup('Overview & Reports'); // Fallback
      }
    }
  }, [view, openGroup]);

  const [invoiceActiveTab, setInvoiceActiveTab] = useState('all');

  // Unified system activity log
  const systemActivity = [
    ...(Array.isArray(allSystemMessages) ? allSystemMessages : []).map(m => ({ ...m, activityType: 'message' })),
    ...(Array.isArray(allSystemNotifications) ? allSystemNotifications : []).map(n => ({ ...n, activityType: 'notification' }))
  ].sort((a, b) => (new Date(b.timestamp || 0).getTime() || 0) - (new Date(a.timestamp || 0).getTime() || 0));

  // ✅ PHASE 6: Wallet overview stats
  const [walletStats, setWalletStats] = useState({ totalAvailable: 0, totalPending: 0, totalEarned: 0, totalWithdrawn: 0 });
  const [withdrawalStats, setWithdrawalStats] = useState({ pendingCount: 0, pendingAmount: 0, completedAmount: 0 });
  // ✅ PHASE 7: KYC review
  const [kycUsers, setKycUsers] = useState<any[]>([]);
  const [libyanMarketPrices, setLibyanMarketPrices] = useState<any[]>([]);
  const [buyerWalletStats, setBuyerWalletStats] = useState({ totalCashBalance: 0, totalDeposited: 0, pendingTopups: 0, pendingTopupAmount: 0 });
  const [receivables, setReceivables] = useState({ unpaidPurchase: 0, unpaidTransport: 0, unpaidShipping: 0 });
  const [calculatorSettings, setCalculatorSettings] = useState({
    auctionFee: 500,
    commission: 5, // %
    transport: 300,
    other: 100
  });
  const [calcInput, setCalcInput] = useState<number>(5000);
  const [reportsAnalytics, setReportsAnalytics] = useState<any>({ activeUsers: 0, totalBids: 0, salesVol: 0, dbHitRate: 99.8, geoSalesRaw: [] });

  // Expenses state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '' });
  const [expensesLoading, setExpensesLoading] = useState(false);

  // Overview chart monthly data
  const [overviewMonthly, setOverviewMonthly] = useState<any[]>([]);

  // Stripe API key state
  const [stripeApiKey, setStripeApiKey] = useState('');
  const [stripeSaving, setStripeSaving] = useState(false);

  useEffect(() => {
    // 1. Fetch System Summary for badges and Overview
    authFetch('/api/admin/system-summary')
      .then(res => res.json())
      .then(data => {
        setPendingUsers(data.pendingUsers || []);
        setAdminPendingCars(data.pendingCars || []);
        setAdminShipments(data.shipments || []);
        if (data.walletStats) setWalletStats(data.walletStats);
        if (data.withdrawalStats) setWithdrawalStats(data.withdrawalStats);
        if (data.buyerWalletStats) setBuyerWalletStats(data.buyerWalletStats);
        if (data.receivables) setReceivables(data.receivables);
      })
      .catch(err => console.error('Summary fetch error:', err));

    if (view === 'user_management' || view === 'user_verification') {
      authFetch('/api/admin/pending-users').then(res => res.json()).then(setPendingUsers);
      // Also fetch pending deposits to show them in the financial section of verification
      authFetch('/api/transactions?status=pending&type=deposit').then(res => res.json()).then(setPendingDeposits);
    }

    if (view === 'financial_approvals' || view === 'overview') {
      authFetch('/api/transactions?status=pending&type=deposit')
        .then(res => res.json())
        .then(setPendingDeposits)
        .catch(err => console.error('Pending deposits fetch error:', err));
    }

    if (view === 'transactions' || view === 'financial_ledger') {
      authFetch('/api/transactions')
        .then(res => res.json())
        .then(setTransactions)
        .catch(err => console.error('Transactions fetch error:', err));
    }

    // Original fetching for other views
    if (view === 'logistics') {
      authFetch('/api/admin/shipments').then(res => res.json()).then(setAdminShipments);
    }
    if (view === 'system') {
      authFetch('/api/admin/branches').then(res => res.json()).then(setBranches);
    }
    if (view === 'marketplace_management') {
      authFetch('/api/admin/offer-market-cars')
        .then(res => res.json())
        .then(data => setOfferMarketCars(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to fetch offer market cars:', err));
    }

    // ✅ PHASE 7: Fetch KYC pending
    if (view === 'kyc_review') {
      authFetch('/api/admin/kyc-pending')
        .then(r => r.json())
        .then(d => setKycUsers(Array.isArray(d) ? d : []))
        .catch(err => console.error('KYC fetch error:', err));
    }

    // ✅ PHASE 5: Fetch withdrawal requests
    if (view === 'withdrawal_requests') {
      authFetch('/api/admin/withdrawal-requests')
        .then(res => res.json())
        .then(data => setWithdrawalRequests(Array.isArray(data) ? data : []))
        .catch(err => console.error('Withdrawal requests fetch error:', err));
    }

    if (view === 'api_keys') {
      authFetch('/api/admin/api-keys').then(r => r.json()).then(data => setApiKeys(Array.isArray(data) ? data : [])).catch(err => console.error('API keys fetch error:', err));
    }

    if ((view === 'document_cycle' || view === 'all_invoices' || view === 'shipments_tracking') && adminInvoices.length === 0) {
      authFetch('/api/admin/invoices')
        .then(res => res.json())
        .then(data => setAdminInvoices(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to fetch admin invoices:', err));
    }
  }, [view, currentUser, adminInvoices.length]);

  // ✅ PHASE 5: Approve/Reject withdrawal handlers
  const handleApproveWithdrawal = async (id: string) => {
    try {
      const res = await authFetch(`/api/admin/withdrawal-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: withdrawalNote })
      });
      if (res.ok) {
        showAlert('تمت الموافقة على السحب وتحويل المبلغ للبائع ✅', 'success');
        setWithdrawalRequests(prev => prev.map(w => w.id === id ? { ...w, status: 'completed' } : w));
        setWithdrawalNote('');
      } else {
        showAlert('فشل تحديث الحالة', 'error');
      }
    } catch { showAlert('خطأ في الاتصال'); }
  };

  const handleRejectWithdrawal = async (id: string, reason: string) => {
    try {
      const res = await authFetch(`/api/admin/withdrawal-requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        showAlert('تم رفض الطلب وإعادة المبلغ للبائع', 'success');
        setWithdrawalRequests(prev => prev.map(w => w.id === id ? { ...w, status: 'rejected' } : w));
      } else {
        showAlert('فشل رفض الطلب', 'error');
      }
    } catch { showAlert('خطأ في الاتصال'); }
  };

  const handleApproveCar = async (id: string) => {
    try {
      const res = await authFetch(`/api/admin/approve-car/${id}`, { method: 'POST' });
      if (res.ok) {
        showAlert('تمت الموافقة على السيارة ونشرها في المزاد', 'success');
        setAdminPendingCars(prev => prev.filter(c => c.id !== id));
      }
    } catch (e) { showAlert('فشل تحديث البيانات'); }
  };

  const handleApproveUser = async (id: string) => {
    try {
      const res = await authFetch(`/api/admin/approve-user/${id}`, { method: 'POST' });
      if (res.ok) {
        showAlert('تم تفعيل المستخدم بنجاح', 'success');
        setPendingUsers(prev => prev.filter(u => u.id !== id));
      }
    } catch (e) { showAlert('فشل تفعيل المستخدم'); }
  };

  const handleRejectUser = async (id: string, reason: string) => {
    try {
      const res = await authFetch(`/api/admin/reject-user/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        showAlert('تم رفض المستخدم', 'info');
        setPendingUsers(prev => prev.filter(u => u.id !== id));
      }
    } catch (e) { showAlert('فشل معالجة الطلب'); }
  };

  const handleUpdateShipment = async (id: string, status: string, notes: string, trackingNumber?: string, location?: string) => {
    try {
      const res = await authFetch(`/api/admin/shipments/${id}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, trackingNotes: notes, trackingNumber, currentLocation: location })
      });
      if (res.ok) {
        showAlert('تم تحديث حالة الشحنة', 'success');
        authFetch('/api/admin/shipments').then(r => r.json()).then(setAdminShipments);
      }
    } catch (e) { showAlert('فشل تحديث الشحنة'); }
  };

  // ======= MANUAL INVOICE HANDLER =======
  const handleCreateManualInvoice = async () => {
    if (!showAddFeeModal || !feeForm.amount || !feeForm.type) {
      showAlert('يرجى ملء كافة البيانات المطلوبة', 'error');
      return;
    }

    setIsAddingFee(true);
    try {
      const res = await authFetch('/api/admin/invoices/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: showAddFeeModal.userId,
          carId: showAddFeeModal.carId,
          amount: parseFloat(feeForm.amount),
          type: feeForm.type,
          dueDate: feeForm.dueDate || undefined
        })
      });

      if (res.ok) {
        showAlert('✅ تم إصدار الفاتورة الإضافية بنجاح وإشعار العميل', 'success');
        setShowAddFeeModal(null);
        setFeeForm({ amount: '', type: 'storage_fine', dueDate: '' });
        // Refresh invoices
        authFetch('/api/admin/invoices').then(r => r.json()).then(data => setAdminInvoices(Array.isArray(data) ? data : []));
      } else {
        const err = await res.json();
        showAlert(err.error || 'فشل إصدار الفاتورة', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setIsAddingFee(false);
    }
  };

  const [showAddCarModal, setShowAddCarModal] = useState(false);
  const [editingCarId, setEditingCarId] = useState<string | null>(null);
  const [showOpenSooqModal, setShowOpenSooqModal] = useState(false);
  const [opensooqMake, setOpensooqMake] = useState('تويوتا');
  const [opensooqModel, setOpensooqModel] = useState('كامري');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ success: boolean; count?: number; error?: string } | null>(null);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageForm, setMessageForm] = useState({ subject: '', content: '' });

  // New Car Form State (Comprehensive)
  const [newCar, setNewCar] = useState<Partial<CarType>>({
    make: '', model: '', year: 2024, currentBid: 0, status: 'upcoming',
    trim: '', mileageUnit: 'mi', engineSize: '', horsepower: '',
    drivetrain: 'FWD', fuelType: 'gasoline', exteriorColor: '',
    interiorColor: '', secondaryDamage: 'None', keys: 'yes',
    runsDrives: 'yes', notes: '',
    odometer: 0, transmission: 'automatic', engine: '',
    primaryDamage: 'None', titleType: 'Clean',
    location: 'Warehouse', description: '', images: [],
    reservePrice: 0, acceptOffers: true
  });

  // New User Form State
  const [newUser, setNewUser] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    role: '', manager: '', office: '', companyName: '', country: '',
    address1: '', address2: '', status: 'active' as 'active' | 'inactive',
    deposit: 0, commission: 0
  });

  const handleAddUser = async () => {
    if (!newUser.firstName || !newUser.email) {
      showAlert('يرجى ملء الحقول الأساسية (الاسم والبريد الإلكتروني)');
      return;
    }

    try {
      // Map Arabic roles to English keys
      const roleMap: Record<string, string> = {
        'مستخدم': 'buyer',
        'تاجر': 'seller',
        'مدير': 'manager',
        'مسؤول': 'admin'
      };

      const res = await authFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newUser,
          role: roleMap[newUser.role] || 'buyer',
          password: newUser.password || '123456'
        })
      });

      if (res.ok) {
        // Refresh users list
        const usersRes = await authFetch('/api/users');
        if (usersRes.ok) {
          const updatedUsers = await usersRes.json();
          setUsers(updatedUsers);
        }

        setShowAddUserModal(false);
        setNewUser({
          firstName: '', lastName: '', email: '', phone: '', password: '',
          role: '', manager: '', office: '', companyName: '', country: '',
          address1: '', address2: '', status: 'active', deposit: 0, commission: 0
        });
        showAlert('تم إضافة المستخدم بنجاح', 'success');
      } else {
        const error = await res.json();
        showAlert(error.error || 'فشل إضافة المستخدم');
      }
    } catch (err) {
      console.error(err);
      showAlert('فشل الاتصال بالخادم');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const roleMap: Record<string, string> = {
        'مستخدم': 'buyer',
        'تاجر': 'seller',
        'مدير': 'manager',
        'مسؤول': 'admin',
        'buyer': 'buyer',
        'seller': 'seller',
        'manager': 'manager',
        'admin': 'admin'
      };

      const res = await authFetch(`/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedUser,
          role: roleMap[selectedUser.role] || selectedUser.role
        })
      });

      if (res.ok) {
        const usersRes = await authFetch('/api/users');
        if (usersRes.ok) {
          const updatedUsers = await usersRes.json();
          setUsers(updatedUsers);
        }
        setShowEditUserModal(false);
        showAlert('تم تحديث بيانات المستخدم بنجاح', 'success');
      } else {
        showAlert('فشل تحديث بيانات المستخدم');
      }
    } catch (err) {
      showAlert('فشل الاتصال بالخادم');
    }
  };

  const handleSendMessage = async () => {
    if (!selectedUser || !messageForm.content) return;

    try {
      const messageData = {
        senderId: currentUser?.id,
        receiverId: selectedUser.id,
        subject: messageForm.subject || 'رسالة من الإدارة',
        content: messageForm.content,
        category: filter !== 'all' ? filter : 'admin'
      };

      if (socket) {
        socket.emit('send_message', messageData);
        setShowMessageModal(false);
        setMessageForm({ subject: '', content: '' });
        showAlert('تم إرسال الرسالة بنجاح', 'success');
      } else {
        showAlert('فشل الاتصال بالخادم (Socket)');
      }
    } catch (err) {
      showAlert('فشل إرسال الرسالة');
    }
  };

  const startScraper = () => {
    setIsScraping(true);
    setScrapeProgress(0);
    const interval = setInterval(() => {
      setScrapeProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsScraping(false);
          return 100;
        }
        return prev + 5;
      });
    }, 200);
  };

  const handleAddCar = async () => {
    if (!newCar.make || !newCar.model) return;

    const car: any = {
      id: Date.now().toString(),
      lotNumber: Math.floor(Math.random() * 100000000).toString(),
      vin: newCar.vin || ('1G1' + Math.random().toString(36).substring(7).toUpperCase()),
      make: newCar.make,
      model: newCar.model,
      year: newCar.year || 2024,
      odometer: newCar.odometer || 0,
      engine: newCar.engine || 'Unknown',
      drive: newCar.drive || 'AWD',
      primaryDamage: newCar.primaryDamage || 'None',
      titleType: newCar.titleType || 'Clean',
      location: newCar.location || 'Warehouse',
      currentBid: newCar.currentBid || 0,
      currency: 'USD',
      images: newCar.images?.length ? newCar.images : ['https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=800'],
      description: newCar.description || '',
      acceptOffers: newCar.acceptOffers ?? true,
      status: newCar.status || 'upcoming',
      reservePrice: newCar.reservePrice,
      transmission: newCar.transmission,
      keys: newCar.keys,
      trim: newCar.trim,
      mileageUnit: newCar.mileageUnit,
      engineSize: newCar.engineSize,
      horsepower: newCar.horsepower,
      fuelType: newCar.fuelType,
      exteriorColor: newCar.exteriorColor,
      interiorColor: newCar.interiorColor,
      secondaryDamage: newCar.secondaryDamage,
      runsDrives: newCar.runsDrives,
      notes: newCar.notes
    };

    await addCar(car);
    setShowAddCarModal(false);
    setNewCar({
      make: '', model: '', year: 2024, currentBid: 0, status: 'upcoming',
      trim: '', mileageUnit: 'mi', engineSize: '', horsepower: '',
      drivetrain: 'FWD', fuelType: 'gasoline', exteriorColor: '',
      interiorColor: '', secondaryDamage: 'None', keys: 'yes',
      runsDrives: 'yes', notes: '',
      odometer: 0, transmission: 'automatic', engine: '',
      primaryDamage: 'None', titleType: 'Clean',
      location: 'Warehouse', description: '', images: [],
      reservePrice: 0, acceptOffers: true
    });
    showAlert('تم إضافة السيارة بنجاح إلى النظام', 'success');
  };

  const handleUpdateBranch = async (config: any) => {
    try {
      const res = await authFetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        showAlert('تم تحديث إعدادات الفرع بنجاح', 'success');
        setEditingBranch(null);
        authFetch('/api/admin/branches').then(r => r.json()).then(setBranches);
      }
    } catch (e) {
      showAlert('خطأ في تحديث البيانات');
    }
  };

  const handleUpdateOffice = async (office: any) => {
    try {
      const res = await authFetch('/api/admin/offices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(office)
      });
      if (res.ok) {
        showAlert('تم حفظ المكتب بنجاح', 'success');
        setEditingOffice(null);
        authFetch('/api/admin/offices').then(r => r.json()).then(setOffices);
      }
    } catch (e) {
      showAlert('خطأ في حفظ البيانات');
    }
  };

  const renderSystemSettings = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-800">إدارة الدول والفروع (Multi-Country)</h2>
          <p className="text-slate-500 text-sm mt-1">تخصيص الهوية البصرية، العملات، ونطاقات الوصول لكل دولة بشكل مستقل.</p>
        </div>
        <button
          onClick={() => {
            setEditingBranch({ id: `branch-${Date.now()}`, name: '', englishName: '', logoText: '', logoSubtext: '', currency: '', domain: '', contactEmail: '', contactPhone: '' });
          }}
          className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-slate-900/20 hover:bg-slate-800 transition-all hover:-translate-y-1"
        >
          <Plus className="w-5 h-5" />
          إضافة دولة جديدة للنظام
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {branches.length === 0 ? (
          <div className="col-span-full py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-center opacity-50">
            <Globe className="w-16 h-16 text-slate-300 mb-4" />
            <p className="font-black text-slate-400">لا توجد دول مضافة حالياً</p>
            <p className="text-xs text-slate-300">ابدأ بإضافة أول فرع دولي للمنصة الآن</p>
          </div>
        ) : (
          branches.map(branch => (
            <div key={branch.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-orange-500/10 transition-all group overflow-hidden relative">
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-150`}></div>

              <div className="p-8 relative">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-orange-500 group-hover:bg-orange-500 group-hover:text-white transition-all shadow-inner">
                    <Globe className="w-7 h-7" />
                  </div>
                  <div className="flex gap-2">
                    <button aria-label="زر" title="زر"
                      onClick={() => setEditingBranch(branch)}
                      className="p-3 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-xl transition-all"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button aria-label="زر" title="زر" className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-black text-slate-900 text-xl mb-1 flex items-center gap-2">
                    {branch.name}
                    <span className="text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">{branch.id}</span>
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-slate-400 font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    {branch.domain === 'all' ? 'كافة النطاقات' : branch.domain} • {branch.currency}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                  <div className="bg-slate-50/50 p-4 rounded-2xl text-center">
                    <div className="text-[10px] text-slate-400 font-black mb-1 uppercase">المشترين</div>
                    <div className="text-xl font-black text-slate-800">{branch.userCount || 0}</div>
                  </div>
                  <div className="bg-slate-50/50 p-4 rounded-2xl text-center">
                    <div className="text-[10px] text-slate-400 font-black mb-1 uppercase">السيارات</div>
                    <div className="text-xl font-black text-slate-800">{branch.carCount || 0}</div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold">هوية اللوجو:</span>
                    <span className="text-slate-900 font-black">{branch.logoText}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-bold">الحالة الفنية:</span>
                    <span className="text-emerald-500 font-black flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      متصل بالخادم
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {editingBranch && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-10 animate-in zoom-in-95 duration-200 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-500 via-blue-500 to-emerald-500"></div>

            <h3 className="text-3xl font-black text-slate-900 mb-8 flex items-center gap-3">
              <div className="p-3 bg-orange-50 rounded-2xl text-orange-500">
                <Settings className="w-8 h-8" />
              </div>
              <div>
                <div className="text-sm text-slate-400 font-bold mb-1 uppercase tracking-widest leading-none">تطوير المنصة</div>
                تعديل إعدادات الفرع
              </div>
            </h3>

            <div className="grid grid-cols-2 gap-6">
              <div className="col-span-2">
                <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">اسم الدولة أو الفرع (للعرض)</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={editingBranch.name}
                  onChange={e => setEditingBranch({ ...editingBranch, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-bold"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">كود الدولة (ID)</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={editingBranch.id}
                  onChange={e => setEditingBranch({ ...editingBranch, id: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-bold uppercase"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">نص اللوجو الرئيسي</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={editingBranch.logoText}
                  onChange={e => setEditingBranch({ ...editingBranch, logoText: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">نص اللوجو الفرعي</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={editingBranch.logoSubtext}
                  onChange={e => setEditingBranch({ ...editingBranch, logoSubtext: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">عملة المنصة</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={editingBranch.currency}
                  onChange={e => setEditingBranch({ ...editingBranch, currency: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-bold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">النطاق (Subdomain)</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={editingBranch.domain}
                  onChange={e => setEditingBranch({ ...editingBranch, domain: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-bold"
                />
              </div>
            </div>

            {/* ── بيانات التذييل (Footer Contact) ── */}
            <div className="mt-6 p-5 bg-orange-50 rounded-2xl border border-orange-100">
              <p className="text-[11px] font-black text-orange-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                🔗 بيانات التذييل — تظهر في Footer الموقع
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">البريد الإلكتروني</label>
                  <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                    type="email"
                    value={editingBranch.contactEmail || ''}
                    onChange={e => setEditingBranch({ ...editingBranch, contactEmail: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-orange-500 transition-all font-bold text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">رقم الهاتف</label>
                  <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                    type="tel"
                    value={editingBranch.contactPhone || ''}
                    onChange={e => setEditingBranch({ ...editingBranch, contactPhone: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-orange-500 transition-all font-bold text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">العنوان</label>
                  <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                    type="text"
                    value={(editingBranch as any).address || ''}
                    onChange={e => setEditingBranch({ ...editingBranch, address: e.target.value } as any)}
                    className="w-full bg-white border border-slate-200 rounded-xl p-3 outline-none focus:border-orange-500 transition-all font-bold text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button
                onClick={() => handleUpdateBranch(editingBranch)}
                className="flex-grow bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 active:scale-95"
              >
                تحديث وحفظ البيانات
              </button>
              <button
                onClick={() => setEditingBranch(null)}
                className="px-10 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-all"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (view) {
      // ─── Yard Management System ──────────────────────────────
      case 'yard_gate_in':
        return (
          <GateInForm
            onBack={() => setSearchParams({ view: 'yard_vehicles_list' })}
            onSuccess={(id) => setSearchParams({ view: 'yard_vehicle_detail', id })}
          />
        );
      case 'yard_gate_out':
        return (
          <GateOutForm
            onBack={() => setSearchParams({ view: 'yard_vehicles_list' })}
            onSuccess={() => setSearchParams({ view: 'yard_vehicles_list' })}
          />
        );
      case 'yard_vehicles_list':
        return (
          <YardVehiclesList
            onOpen={(id) => setSearchParams({ view: 'yard_vehicle_detail', id })}
            onGateIn={() => setSearchParams({ view: 'yard_gate_in' })}
            onGateOut={() => setSearchParams({ view: 'yard_gate_out' })}
          />
        );
      case 'yard_vehicle_detail': {
        const id = searchParams.get('id') || '';
        return (
          <YardVehicleDetail
            vehicleId={id}
            onBack={() => setSearchParams({ view: 'yard_vehicles_list' })}
            currentUserRole={currentUser?.role}
          />
        );
      }
      case 'accounting_dashboard':
        return <AccountingDashboard onNavigate={(v) => setSearchParams({ view: v })} />;
      case 'accounting_invoices':
        return <InvoicesList onOpenInvoice={(id) => setSearchParams({ view: 'accounting_invoice_detail', id })} />;
      case 'accounting_invoice_detail': {
        const id = searchParams.get('id') || '';
        return <InvoiceDetail invoiceId={id} onBack={() => setSearchParams({ view: 'accounting_invoices' })} />;
      }
      case 'accounting_journal':
        return <JournalEntries />;
      case 'accounting_accounts':
        return <ChartOfAccounts />;
      case 'accounting_reports':
        return <ReportsHub />;
      case 'marketing':
        return <MarketingPanel />;
      case 'shipping_settings':
        return <ShippingSettingsPanel />;
      case 'footer_settings':
        return (
          <div className="p-6 md:p-8">
            <FooterSettingsPanel />
          </div>
        );
      case 'calculator':

        return (
          <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                  <Calculator className="w-8 h-8 text-orange-500" />
                  حاسبة التكلفة المحلية 🧮
                </h2>
                <p className="text-slate-500 font-bold text-sm mt-1">حساب تلقائي للتكلفة النهائية للسيارات المحلية مع التحكم في الرسوم.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Inputs & Settings */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-orange-500 rounded-full"></div>
                    بيانات العملية
                  </h3>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 mb-3 uppercase tracking-tighter">سعر شراء السيارة ($)</label>
                      <div className="relative group">
                        <DollarSign className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                        <input
                          type="number"
                          value={calcInput}
                          onChange={(e) => setCalcInput(Number(e.target.value))}
                          className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl py-6 px-14 text-4xl font-black font-mono focus:border-orange-500 focus:bg-white outline-none transition-all shadow-inner"
                          placeholder="0.00"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">رسوم المزاد الثابتة ($)</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                          type="number"
                          value={calculatorSettings.auctionFee}
                          onChange={(e) => setCalculatorSettings({ ...calculatorSettings, auctionFee: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">عمولة المنصة (%)</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                          type="number"
                          value={calculatorSettings.commission}
                          onChange={(e) => setCalculatorSettings({ ...calculatorSettings, commission: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">تكلفة النقل المحلي ($)</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                          type="number"
                          value={calculatorSettings.transport}
                          onChange={(e) => setCalculatorSettings({ ...calculatorSettings, transport: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold outline-none focus:border-orange-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-black text-slate-400 mb-2 uppercase tracking-tighter">رسوم إدارية / تخليص ($)</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                          type="number"
                          value={calculatorSettings.other}
                          onChange={(e) => setCalculatorSettings({ ...calculatorSettings, other: Number(e.target.value) })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-6 rounded-[2rem] flex items-center gap-4">
                  <div className="p-3 bg-orange-500 text-white rounded-2xl shadow-lg shadow-orange-500/20">
                    <Settings className="w-5 h-5 animate-spin-slow" />
                  </div>
                  <div>
                    <h4 className="font-black text-orange-900 text-sm">حفظ الإعدادات الافتراضية</h4>
                    <p className="text-orange-700 text-xs font-bold mt-1">القيم التي تدخلها هنا يتم استخدامها كقيم افتراضية في كافة حسابات المنصة المحلية.</p>
                  </div>
                </div>
              </div>

              {/* Results - Styled like Live Auction HUD */}
              <div className="lg:col-span-5">
                <div className="sticky top-6 space-y-6">
                  <div className="bg-slate-950 rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl relative">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 blur-[100px] -mr-32 -mt-32"></div>

                    <div className="p-10 bg-gradient-to-br from-slate-900 to-slate-950 relative z-10">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">التكلفة الإجمالية (تقدير مؤكد)</div>
                      <div className="text-7xl font-black font-mono text-emerald-400 tracking-tight">
                        ${(
                          calcInput +
                          calculatorSettings.auctionFee +
                          (calcInput * (calculatorSettings.commission / 100)) +
                          calculatorSettings.transport +
                          calculatorSettings.other
                        ).toLocaleString()}
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase">حساب محلي دقيق 100%</span>
                      </div>
                    </div>

                    <div className="p-10 space-y-6 bg-slate-900/50 backdrop-blur-md">
                      {[
                        { label: 'سعر شراء السيارة', value: calcInput, icon: Car },
                        { label: 'رسوم المزاد', value: calculatorSettings.auctionFee, icon: Gavel },
                        { label: 'عمولة المنصة', value: (calcInput * (calculatorSettings.commission / 100)), icon: ShieldCheck },
                        { label: 'النقل واللوجستيات', value: calculatorSettings.transport, icon: Truck },
                        { label: 'رسوم إدارية إضافية', value: calculatorSettings.other, icon: Calculator },
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/5 rounded-xl group-hover:bg-orange-500/10 transition-colors">
                              <item.icon className="w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                            </div>
                            <span className="text-sm font-bold text-slate-300">{item.label}</span>
                          </div>
                          <span className="text-lg font-black font-mono text-white">${item.value.toLocaleString()}</span>
                        </div>
                      ))}

                      <div className="pt-8 border-t border-white/5">
                        <button className="w-full bg-white text-slate-950 py-5 rounded-[2rem] font-black text-lg hover:bg-orange-500 hover:text-white transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3">
                          تصدير عرض السعر PDF
                          <FileText className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-500/5 border border-blue-500/10 p-6 rounded-3xl flex gap-4">
                    <Info className="w-6 h-6 text-blue-400 shrink-0" />
                    <p className="text-xs text-blue-200/60 font-bold leading-relaxed">
                      هذه الحاسبة مصممة للعمليات المحلية حصراً. يتم تطبيق عمولة {calculatorSettings.commission}% على سعر الشراء الأساسي بالإضافة إلى الرسوم الثابتة المحددة.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'user_management':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">إدارة المستخدمين والصلاحيات 👥</h2>
                <p className="text-slate-500 font-bold text-sm mt-1">إدارة كافة الأعضاء، طلبات التفعيل، وتوزيع الأدوار والصلاحيات من مكان واحد.</p>
              </div>
              <div className="flex gap-3">
                <div className="bg-white px-4 py-2 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 font-black uppercase">إجمالي الأعضاء</div>
                    <div className="text-lg font-black text-slate-900">{users.length}</div>
                  </div>
                  <div className="w-px h-8 bg-slate-100"></div>
                  <div className="text-center">
                    <div className="text-[10px] text-orange-400 font-black uppercase">بانتظار التفعيل</div>
                    <div className="text-lg font-black text-orange-500">{pendingUsers.length}</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center gap-2"
                >
                  <Plus className="w-5 h-5 font-black" />
                  إضافة مستخدم
                </button>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'كافة المستخدمين', count: users.length, icon: Users, color: 'slate', active: filter === 'all', id: 'all' },
                { label: 'بانتظار التفعيل KYC', count: pendingUsers.length, icon: ShieldCheck, color: 'orange', active: filter === 'pending', id: 'pending' },
                { label: 'تجار نشطون', count: users.filter(u => u.role === 'seller').length, icon: Store, color: 'emerald', active: filter === 'sellers', id: 'sellers' },
                { label: 'الإدارة والمدراء', count: users.filter(u => u.role === 'admin' || u.role === 'manager').length, icon: ShieldCheck, color: 'blue', active: filter === 'admin', id: 'admin' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setFilter(item.id)}
                  className={`p-4 rounded-3xl border-2 transition-all text-right flex items-center justify-between group ${item.active ? `bg-white border-${item.color}-500 shadow-xl shadow-${item.color}-500/10` : 'bg-white/50 border-transparent hover:border-slate-200'}`}
                >
                  <div>
                    <div className="text-[10px] text-slate-400 font-black uppercase mb-1">{item.label}</div>
                    <div className="text-2xl font-black text-slate-900">{item.count}</div>
                  </div>
                  <div className={`p-3 bg-${item.color}-50 text-${item.color}-500 rounded-2xl group-hover:scale-110 transition-transform`}>
                    <item.icon className="w-6 h-6" />
                  </div>
                </button>
              ))}
            </div>

            {/* Main User Table */}
            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden min-h-[500px]">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-200 w-96">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input aria-label="بحث عن مستخدم" title="بحث" placeholder="ابحث بالاسم أو الإيميل أو الهاتف..." type="text" value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1); }} className="bg-transparent text-sm font-bold flex-1 outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-bold">فرز حسب:</span>
                  <select aria-label="تحديد" title="تحديد" className="bg-transparent text-xs font-black text-slate-900 outline-none cursor-pointer">
                    <option value="all">الكل</option>
                    <option value="paid">المدفوعة</option>
                    <option>أعلى ميزانية</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                      <th className="p-6">العضو والبيانات</th>
                      <th className="p-6">الحالة & التوثيق</th>
                      <th className="p-6">الدور الوظيفي</th>
                      <th className="p-6">القوة الشرائية</th>
                      <th className="p-6">العمولة</th>
                      <th className="p-6 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const baseList = filter === 'pending' ? pendingUsers : users;
                      const q = userSearch.trim().toLowerCase();
                      const filtered = q ? baseList.filter(u =>
                        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
                        (u.email || '').toLowerCase().includes(q) ||
                        (u.phone || '').includes(q)
                      ) : baseList;
                      const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PER_PAGE));
                      const page = Math.min(userPage, totalPages);
                      const paged = filtered.slice((page - 1) * USERS_PER_PAGE, page * USERS_PER_PAGE);
                      return (<>
                        {paged.map(user => (
                      <tr key={user.id} className="hover:bg-slate-50/80 transition-all group">
                        {/* User Info */}
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 text-xl border-2 border-white shadow-sm overflow-hidden">
                                <img src={`https://i.pravatar.cc/150?u=${user.id}`} alt="صورة" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                              </div>
                              <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white ${user.status === 'active' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-slate-400'}`}></div>
                            </div>
                            <div>
                              <div className="font-black text-slate-900 flex items-center gap-2">
                                {user.firstName} {user.lastName}
                                {user.isVip && <div className="w-4 h-4 bg-orange-500 rounded-lg flex items-center justify-center text-[8px] text-white">★</div>}
                                {user.googleId && <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-4 h-4 inline-block" title="مسجل عبر جوجل" />}
                                <span title="مسجل عبر فيسبوك" className="inline-block"><svg className="w-4 h-4 text-[#1877F2] fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg></span>
                              </div>
                              <div className="text-xs text-slate-400 font-bold">{user.email}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">{user.phone}</div>
                            </div>
                          </div>
                        </td>

                        {/* Status & KYC */}
                        <td className="p-6">
                          <div className="space-y-1.5">
                            <div className={`text-[10px] font-black uppercase flex items-center gap-1.5 ${user.status === 'active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                              {user.status === 'active' ? 'حساب نشط' : 'حساب معلق'}
                            </div>
                            {pendingUsers.some(p => p.id === user.id) ? (
                              <button
                                onClick={() => {
                                  showConfirm(`هل أنت متأكد من تفعيل حساب ${user.firstName}؟`, () => handleApproveUser(user.id));
                                }}
                                className="px-3 py-1 bg-orange-100 text-orange-600 rounded-lg text-[9px] font-black hover:bg-orange-500 hover:text-white transition-all border border-orange-200"
                              >
                                بانتظار التوثيق KYC (اضغط للتفعيل)
                              </button>
                            ) : (
                              <div className="flex items-center gap-1 text-[9px] text-emerald-600 font-black">
                                <CheckCircle2 className="w-3 h-3" />
                                موثق بالكامل
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Role Dropdown */}
                        <td className="p-6">
                          <select aria-label="تحديد" title="تحديد"
                            value={user.role}
                            onChange={(e) => {
                              setSelectedUser({ ...user, role: e.target.value });
                              // Here we would typically call an API to update the role
                              showAlert(`تم تحديث دور ${user.firstName} إلى ${e.target.value}`, 'success');
                            }}
                            className={`w-36 bg-slate-100 border-none rounded-xl p-2.5 text-xs font-black outline-none cursor-pointer hover:bg-slate-200 transition-colors appearance-none text-center ${user.role === 'admin' ? 'text-blue-600 bg-blue-50' :
                              user.role === 'manager' ? 'text-purple-600 bg-purple-50' :
                                user.role === 'seller' ? 'text-orange-600 bg-orange-50' : 'text-slate-600'
                              }`}
                          >
                            <option value="buyer">مشتري / مستخدم</option>
                            <option value="seller">تاجر (Seller)</option>
                            <option value="manager">مدير (Manager)</option>
                            <option value="admin">مسؤول (Admin)</option>
                          </select>
                        </td>

                        {/* Purchasing Power */}
                        <td className="p-6">
                          <div className="font-black text-slate-800 font-mono text-lg">${(user.buyingPower || 0).toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400 font-bold">تأمين: ${(user.deposit || 0).toLocaleString()}</div>
                        </td>

                        {/* Commission */}
                        <td className="p-6">
                          <div className="flex items-center gap-1">
                            <span className="font-black text-slate-900 text-lg">{user.commission || 5}</span>
                            <span className="text-slate-400 font-black">%</span>
                          </div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">نسبة المنصة</div>
                        </td>

                        {/* Actions */}
                        <td className="p-6">
                          <div className="flex items-center justify-center gap-2">
                            <button aria-label="تعديل المستخدم" title="تعديل المستخدم"
                              onClick={() => { setSelectedUser(user); setShowEditUserModal(true); }}
                              className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-orange-500 hover:border-orange-200 shadow-sm transition-all"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button aria-label="إرسال رسالة" title="إرسال رسالة"
                              onClick={() => { setSelectedUser(user); setShowMessageModal(true); }}
                              className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-blue-500 hover:border-blue-200 shadow-sm transition-all"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                            <button aria-label="حذف المستخدم" title="حذف المستخدم"
                              onClick={() => {
                                showConfirm(`هل أنت متأكد من حذف حساب ${user.firstName} ${user.lastName} بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء وسيتم حذف كافة البيانات المرتبطة به.`, async () => {
                                  try {
                                    const res = await authFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
                                    if (res.ok) {
                                      setUsers(users.filter(u => u.id !== user.id));
                                      showAlert('تم حذف المستخدم بنجاح', 'success');
                                      // fetchStats();
                                    } else {
                                      showAlert('فشل في حذف المستخدم', 'error');
                                    }
                                  } catch (e) {
                                    showAlert('حدث خطأ أثناء الاتصال بالخادم', 'error');
                                  }
                                });
                              }}
                              className="p-3 bg-white border border-slate-100 rounded-xl text-slate-400 hover:text-red-500 hover:border-red-200 shadow-sm transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                        {paged.length === 0 && (
                          <tr><td colSpan={6} className="py-24 text-center">
                            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Users className="w-10 h-10 text-slate-200" />
                            </div>
                            <p className="font-black text-slate-400 text-xl">لا يوجد مستخدمين لعرضهم</p>
                            <p className="text-xs text-slate-300 mt-2">جرب تغيير الفلتر أو كلمة البحث</p>
                          </td></tr>
                        )}
                      </>);
                    })()}
                  </tbody>
                </table>
                {/* Users Pagination */}
                {(() => {
                  const baseList = filter === 'pending' ? pendingUsers : users;
                  const q = userSearch.trim().toLowerCase();
                  const filtered = q ? baseList.filter(u =>
                    `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
                    (u.email || '').toLowerCase().includes(q) ||
                    (u.phone || '').includes(q)
                  ) : baseList;
                  const totalPages = Math.max(1, Math.ceil(filtered.length / USERS_PER_PAGE));
                  if (totalPages <= 1) return null;
                  return (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                      <span className="text-xs text-slate-400 font-bold">
                        {filtered.length} مستخدم — صفحة {Math.min(userPage, totalPages)} من {totalPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setUserPage(p => Math.max(1, p - 1))}
                          disabled={userPage <= 1}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-30 hover:border-orange-300 hover:text-orange-600 transition-all"
                        >← السابق</button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          const pg = Math.max(1, Math.min(userPage - 2, totalPages - 4)) + i;
                          return (
                            <button key={pg} onClick={() => setUserPage(pg)}
                              className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${userPage === pg ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-white border border-slate-200 text-slate-600 hover:border-orange-300'}`}>
                              {pg}
                            </button>
                          );
                        })}
                        <button
                          onClick={() => setUserPage(p => Math.min(totalPages, p + 1))}
                          disabled={userPage >= totalPages}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-30 hover:border-orange-300 hover:text-orange-600 transition-all"
                        >التالي →</button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );


      case 'financial_approvals':
        return (
          <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-800">مراجعة تأمينات المزايدة (العرابين)</h2>
                <p className="text-slate-500 font-bold">بانتظار تأكيد وصول الأموال لـ {pendingDeposits.length} طلب</p>
              </div>
              <button aria-label="زر" title="زر"
                onClick={() => authFetch('/api/transactions?status=pending&type=deposit').then(res => res.json()).then(setPendingDeposits)}
                className="p-3 bg-white rounded-2xl border border-slate-100 shadow-sm hover:bg-slate-50 transition-all"
              >
                <RefreshCw className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[1100px]">
                <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <tr>
                    <th className="p-5">المزايد</th>
                    <th className="p-5">المبلغ</th>
                    <th className="p-5">طريقة الدفع</th>
                    <th className="p-5">رقم المرجع</th>
                    <th className="p-5">التاريخ</th>
                    <th className="p-5 text-center">القرار المالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingDeposits.length > 0 ? pendingDeposits.map((tx: any) => {
                    const methodLabels: Record<string,string> = {
                      bank_transfer: '🏦 تحويل بنكي',
                      bank_lyd: '🏦 تحويل ليبي (LYD)',
                      wise: '💸 Wise دولي',
                      sadad: '📱 سداد (مدار)',
                      tadawul: '💳 تداول (نوماك)',
                      stripe: '💳 Stripe',
                    };
                    const amtLabel = tx.currency === 'LYD'
                      ? `${Number(tx.amount).toLocaleString()} د.ل`
                      : `$${Number(tx.amount).toLocaleString()}`;
                    const userName = [tx.firstName, tx.lastName].filter(Boolean).join(' ') || `مستخدم #${tx.userId}`;
                    return (
                    <tr key={tx.id} className="hover:bg-orange-50/40 transition-all group">
                      <td className="p-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center font-black text-sm">
                            {(tx.firstName || 'U').charAt(0)}
                          </div>
                          <div>
                            <div className="font-black text-slate-900 text-sm">{userName}</div>
                            <div className="text-[10px] text-slate-400 font-bold">{tx.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-5">
                        <span className="text-lg font-black text-emerald-600 font-mono">{amtLabel}</span>
                      </td>
                      <td className="p-5">
                        <span className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[11px] font-black">
                          {methodLabels[tx.method] || tx.method || 'تحويل بنكي'}
                        </span>
                      </td>
                      <td className="p-5">
                        {tx.referenceNo ? (
                          <code className="bg-slate-100 text-slate-700 px-2 py-1 rounded-lg text-[11px] font-mono select-all">{tx.referenceNo}</code>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="p-5 text-slate-500 font-bold text-xs">
                        {new Date(tx.timestamp).toLocaleString('ar-EG')}
                      </td>
                      <td className="p-5">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => {
                              showConfirm(
                                `هل تؤكد استلام ${amtLabel} من ${userName}؟\nسيتم تفعيل القوة الشرائية فوراً.`,
                                async () => {
                                  const res = await authFetch(`/api/admin/approve-deposit/${tx.id}`, { method: 'POST' });
                                  if (res.ok) {
                                    setPendingDeposits((prev: any[]) => prev.filter(p => p.id !== tx.id));
                                    showAlert(`✅ تم تأكيد إيداع ${userName} وتفعيل القوة الشرائية`, 'success');
                                  } else {
                                    const d = await res.json().catch(() => ({}));
                                    showAlert(d.error || 'فشل تأكيد الإيداع');
                                  }
                                }
                              );
                            }}
                            className="bg-emerald-600 text-white px-5 py-2 rounded-xl font-black text-xs hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            قبول
                          </button>
                          <button
                            className="bg-red-50 text-red-500 px-4 py-2 rounded-xl font-black text-xs hover:bg-red-500 hover:text-white transition-all flex items-center gap-1.5"
                            onClick={() => {
                              const reason = window.prompt(`سبب رفض إيداع ${userName}:`);
                              if (reason !== null) {
                                authFetch(`/api/admin/reject-deposit/${tx.id}`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ reason }),
                                }).then(res => {
                                  if (res.ok) {
                                    setPendingDeposits((prev: any[]) => prev.filter(p => p.id !== tx.id));
                                    showAlert(`تم رفض طلب الإيداع وإشعار ${userName}`, 'success');
                                  }
                                });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                            رفض
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={6} className="p-20 text-center">
                        <div className="flex flex-col items-center opacity-20">
                          <Wallet className="w-16 h-16 mb-4" />
                          <p className="font-black text-xl text-slate-400">لا توجد طلبات إيداع معلقة</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        );

      case 'offices':
        return (
          <>
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">إدارة المكاتب</h2>
                  <p className="text-slate-500 text-sm mt-1">تتبع المكاتب الإقليمية وإدارة الموظفين والعمليات المرتبطة بها.</p>
                </div>
                <button
                  onClick={() => setEditingOffice({ name: '', manager: '', branchId: 'main', status: 'active' })}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  <Plus className="w-5 h-5" />
                  إضافة مكتب جديد
                </button>
              </div>
              {offices.map((office) => (
                <div key={office.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative group overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full -mr-12 -mt-12 group-hover:bg-blue-100/50 transition-colors"></div>
                  <div className="flex justify-between items-start mb-4 relative z-10">
                    <div className="p-3 bg-blue-50 rounded-xl text-blue-600 group-hover:scale-110 transition-transform">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${office.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                      {office.status === 'active' ? 'نشط' : 'متوقف'}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 relative z-10">{office.name}</h3>
                  <div className="text-sm text-slate-500 mt-2 font-medium flex items-center gap-2 relative z-10">
                    <Globe className="w-4 h-4 text-slate-400" />
                    الفرع: {office.branchName || office.branchId}
                  </div>
                  <div className="text-sm text-slate-500 mt-1 font-medium flex items-center gap-2 relative z-10">
                    <Users className="w-4 h-4 text-slate-400" />
                    المدير: {office.manager || 'بدون مدير'}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center relative z-10">
                    <span className="text-sm font-bold text-slate-700 bg-slate-50 px-3 py-1 rounded-lg">
                      {office.userCount || 0} عميل مسجل
                    </span>
                    <button
                      onClick={() => setEditingOffice(office)}
                      className="text-orange-500 font-bold hover:text-orange-600 hover:bg-orange-50 p-2 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Edit className="w-4 h-4" /> تعديل
                    </button>
                  </div>
                </div>
              ))}

              {offices.length === 0 && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-3xl">
                  <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-slate-500 font-bold">لا توجد مكاتب مضافة حتى الآن</h3>
                </div>
              )}
            </div>

            {editingOffice && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-8 animate-in zoom-in-95 duration-200">
                  <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
                    <Building2 className="w-7 h-7 text-orange-500" />
                    {editingOffice.id ? 'تعديل بيانات المكتب' : 'إضافة مكتب جديد'}
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">اسم المكتب</label>
                      <input
                        type="text"
                        value={editingOffice.name}
                        onChange={e => setEditingOffice({ ...editingOffice, name: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-orange-500 transition-colors"
                        placeholder="مثال: مكتب الرياض الرئيسي"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">المدير المسؤول</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                        type="text"
                        value={editingOffice.manager}
                        onChange={e => setEditingOffice({ ...editingOffice, manager: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">الفرع / الدولة التابع لها</label>
                        <select aria-label="تحديد" title="تحديد"
                          value={editingOffice.branchId}
                          onChange={e => setEditingOffice({ ...editingOffice, branchId: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-orange-500 transition-colors"
                        >
                          <option value="main">الفرع الرئيسي</option>
                          {branches.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">الحالة</label>
                        <select aria-label="تحديد" title="تحديد"
                          value={editingOffice.status}
                          onChange={e => setEditingOffice({ ...editingOffice, status: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 outline-none focus:border-orange-500 transition-colors"
                        >
                          <option value="active">نشط</option>
                          <option value="inactive">مغلق / متوقف</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 mt-8">
                    <button
                      onClick={() => handleUpdateOffice(editingOffice)}
                      className="flex-grow bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
                    >
                      حفظ بيانات المكتب
                    </button>
                    <button
                      onClick={() => setEditingOffice(null)}
                      className="px-8 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            )
            }
          </>
        );

      case 'services':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-slate-800">الخدمات والتقارير</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: 'تقارير المبيعات', icon: DollarSign, color: 'blue' },
                { title: 'تقارير المستخدمين', icon: Users, color: 'purple' },
                { title: 'أداء المزادات', icon: Gavel, color: 'orange' },
                { title: 'اللوجستيات', icon: Truck, color: 'green' }
              ].map((service, i) => (
                <button key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-orange-500 transition-all text-right group">
                  <div className={`p-3 bg-${service.color}-50 rounded-xl text-${service.color}-600 w-fit mb-4 group-hover:scale-110 transition-transform`}>
                    <service.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-slate-800">{service.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">عرض وتحميل التقارير التفصيلية</p>
                </button>
              ))}
            </div>
          </div>
        );

      case 'messages': {
        const combinedActivity = [
          ...messages.map(m => ({ ...m, activityType: 'message', content: m.content || m.message, timestamp: m.timestamp })),
          ...notifications.map(n => ({ ...n, activityType: 'notification', content: n.message, timestamp: n.timestamp })),
          ...allSystemNotifications.map(n => ({ ...n, activityType: 'notification' }))
        ].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i).sort((a, b) => (new Date(b.timestamp || 0).getTime() || 0) - (new Date(a.timestamp || 0).getTime() || 0));

        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800">مركز رسائل الدعم والفرق المتخصصة</h2>
                <p className="text-slate-500 text-sm mt-1">إدارة وتحليل أداء الفرق في الرد على استفسارات العملاء</p>
              </div>

              <div className="flex gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold">نسبة الرد</div>
                    <div className="text-lg font-black text-slate-800">
                      {messages.length > 0 ? Math.round((messages.filter(m => m.isRead).length / messages.length) * 100) : 0}%
                    </div>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                    <History className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-bold">إجمالي الرسائل</div>
                    <div className="text-lg font-black text-slate-800">{messages.length}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Teams & Performance Filter Sidebar */}
              <div className="lg:col-span-1 space-y-2">
                <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">توجيه الرسائل والفرق</div>
                {[
                  { id: 'all', label: 'كافة النشاطات', icon: Zap, color: 'text-amber-500' },
                  { id: 'message', label: 'المراسلات', icon: Mail, color: 'text-blue-500' },
                  { id: 'notification', label: 'التنبيهات', icon: Bell, color: 'text-purple-500' },
                  { id: 'bid', label: 'المزايدات', icon: Gavel, color: 'text-emerald-500' },
                  { id: 'win', label: 'عمليات الفوز', icon: Trophy, color: 'text-orange-500' },
                  { id: 'registration', label: 'فريق التسجيل', icon: UserPlus, color: 'text-indigo-500' },
                  { id: 'accounting', label: 'فريق المحاسبة', icon: Calculator, color: 'text-cyan-500' },
                  { id: 'purchasing', label: 'فريق الشراء', icon: ShoppingCart, color: 'text-rose-500' },
                  { id: 'transport', label: 'فريق النقل', icon: Truck, color: 'text-amber-600' },
                  { id: 'clearance', label: 'فريق التخليص الجمركي', icon: ClipboardCheck, color: 'text-teal-500' },
                  { id: 'shipping', label: 'فريق الشحن', icon: Ship, color: 'text-blue-600' },
                  { id: 'complaints', label: 'فريق الشكاوي والجودة', icon: Shield, color: 'text-red-500' },
                ].map(team => {
                  const teamLogs = combinedActivity.filter(l => team.id === 'all' || l.activityType === team.id || l.type === team.id || l.category === team.id);
                  const unreadCount = teamLogs.filter(l => !l.isRead).length;

                  return (
                    <button
                      key={team.id}
                      onClick={() => setFilter(team.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${filter === team.id ? 'bg-white shadow-lg border-2 border-orange-500' : 'bg-white/50 border border-slate-100 hover:bg-white hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-3">
                        <team.icon className={`w-5 h-5 ${team.color}`} />
                        <div className="text-right">
                          <div className={`text-sm font-black ${filter === team.id ? 'text-slate-900' : 'text-slate-600'}`}>{team.label}</div>
                          <div className="text-[10px] text-slate-400 font-bold">تحديث فوري للسجل</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        {unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-[10px] px-2 py-1 rounded-full animate-pulse font-black mb-1">{unreadCount}</span>
                        )}
                        <span className="text-[9px] text-slate-400 font-mono">{teamLogs.length}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Messages List & Interaction */}
              <div className="lg:col-span-3 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden min-h-[600px] flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div className="flex items-center gap-3">
                    <h3 className="font-black text-slate-800 uppercase tracking-tighter">سجل النشاط الشامل: {filter === 'all' ? 'كافة الأحداث' : filter}</h3>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-slate-400 text-[10px] font-black">مراقبة حية للنظام</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-100 shadow-inner">
                      <Search className="w-4 h-4 text-slate-300" />
                      <input aria-label="مدخل" title="مدخل" placeholder="تحديد" type="text" className="bg-transparent text-sm font-bold focus:outline-none w-48" />
                    </div>
                  </div>
                </div>

                <div className="flex-grow overflow-y-auto">
                  {combinedActivity.filter(l => filter === 'all' || l.activityType === filter || l.type === filter || l.category === filter).length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-40">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <Zap className="w-10 h-10 text-slate-200" />
                      </div>
                      <p className="font-black text-slate-400">لا توجد بوادر نشاط في هذا القسم حالياً</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {combinedActivity
                        .filter(l => filter === 'all' || l.activityType === filter || l.type === filter || l.category === filter)
                        .map(log => (
                          <div
                            key={log.id}
                            onClick={() => {
                              if (!log.isRead) {
                                if (log.activityType === 'message') {
                                  markMessageAsRead(log.id);
                                } else {
                                  markNotificationAsRead(log.id);
                                }
                              }
                            }}
                            className={`p-6 hover:bg-slate-50 transition-all border-r-4 relative cursor-pointer ${log.activityType === 'message' ? 'border-blue-500' : 'border-purple-500'} ${!log.isRead ? 'bg-white' : 'bg-slate-50/30 grayscale-[20%]'}`}
                          >
                            {!log.isRead && (
                              <div className="absolute top-6 left-6 w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                            )}
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600 font-black text-lg border-2 border-white shadow-sm overflow-hidden">
                                  {log.activityType === 'message' ? (
                                    <img alt="صورة" src={`https://i.pravatar.cc/150?u=${log.senderId}`} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="p-2 bg-purple-50 text-purple-600">
                                      <Bell className="w-6 h-6" />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-black text-slate-900">
                                    {log.activityType === 'message' ? `${log.senderFirstName || 'مستخدم'} ${log.senderLastName || ''}` : 'تنبيه النظام الذكي'}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-md font-black ${log.activityType === 'message' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                      {log.activityType === 'message' ? 'رسالة مباشرة' : log.title || 'إشعار'}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-bold">UTC: {new Date(log.timestamp).toLocaleString('ar-LY')}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100/50">
                              <p className="text-sm text-slate-600 leading-relaxed font-bold whitespace-pre-wrap">{log.content || log.message}</p>

                              {log.activityType === 'message' && (
                                <div className="mt-4 pt-4 border-t border-slate-200/60">
                                  {log.repliedAt ? (
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                                      <div className="flex items-center gap-3">
                                        <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl flex items-center justify-center shadow-sm">
                                          <Reply className="w-4 h-4" />
                                        </div>
                                        <div>
                                          <span className="text-sm font-black text-slate-800 block">تم الرد بواسطة: {log.repliedBy || 'عضو الفريق'}</span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-3">
                                        {log.replyTimeMs && (
                                          <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-100 shadow-sm" title="زمن الاستجابة">
                                            <Clock className="w-4 h-4" />
                                            <span className="text-xs font-black">
                                              استغرق الرد: {log.replyTimeMs < 60000 ? 'أقل من دقيقة' : `${Math.round(log.replyTimeMs / 60000)} دقيقة`}
                                            </span>
                                          </div>
                                        )}
                                        <div className="flex items-center gap-1.5 bg-orange-50 text-orange-600 px-3 py-1.5 rounded-xl border border-orange-100 shadow-sm cursor-help" title="جودة الدعم مراقبة من قبل الإدارة">
                                          <Eye className="w-4 h-4" />
                                          <span className="text-[10px] font-black uppercase tracking-wider">مراقب من المدير</span>
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="mb-4 mt-2">
                                      <button onClick={() => setReplyingTo(log.id)} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 text-xs font-black bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-xl border border-blue-100 transition-colors shadow-sm">
                                        <Reply className="w-4 h-4" />
                                        الرد على الرسالة أو التوجيه
                                      </button>
                                    </div>
                                  )}

                                  {replyingTo === log.id && (
                                    <div className="mt-4 p-5 bg-white border border-blue-100 rounded-2xl shadow-sm relative overflow-hidden">
                                      <div className="absolute top-0 right-0 w-1 bg-blue-500 h-full"></div>
                                      <div className="flex sm:flex-row flex-col gap-3 mb-4">
                                        <div className="flex items-center gap-3">
                                          <span className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">توجيه الرد إلى:</span>
                                          <select title="توجيه الرد إلى" aria-label="توجيه الرد إلى" value={replyRole} onChange={(e: any) => setReplyRole(e.target.value)} className="text-xs p-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-bold text-slate-700 shadow-sm transition-all min-w-[200px]">
                                            <option value="user">المستخدم / طالب الخدمة</option>
                                            <option value="employee">الموظف المختص (داخلي)</option>
                                            <option value="merchant">التاجر / البائع</option>
                                            <option value="manager">الإدارة العليا للتصعيد</option>
                                          </select>
                                        </div>
                                      </div>
                                      <textarea
                                        value={replyMessage}
                                        onChange={e => setReplyMessage(e.target.value)}
                                        className="w-full p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm mb-4 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 min-h-[100px] transition-all"
                                        placeholder="اكتب تفاصيل الرد أو ملاحظات التوجيه الداخلي هنا..."
                                      />
                                      <div className="flex gap-2 justify-end">
                                        <button onClick={() => setReplyingTo(null)} className="px-5 py-2 text-xs font-black text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">إلغاء</button>
                                        <button onClick={() => {
                                          sendMessage({
                                            receiverId: replyRole === 'user' ? log.senderId : replyRole,
                                            subject: 'رد على: ' + (log.subject || log.title || 'رسالة نظام'),
                                            content: replyMessage,
                                            category: log.category || 'general'
                                          });
                                          setReplyingTo(null);
                                          setReplyMessage('');
                                          showAlert('تم الإرسال والتوجيه بنجاح', 'success');
                                        }} className="bg-blue-600 text-white px-6 py-2.5 text-xs font-black rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2">
                                          <Send className="w-4 h-4" />
                                          تأكيد وإرسال
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'manage_live_auctions':
        return <ManageLiveAuctionsPanel currentUser={currentUser} />;

      case 'employee_management':
        return <EmployeeManagementPanel />;

      case 'financials':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-slate-800">الحسابات المالية</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-r-4 border-r-green-500">
                <p className="text-slate-500 text-sm">إجمالي الإيرادات</p>
                <h3 className="text-2xl font-bold text-slate-800 mt-1">$1,240,500</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-r-4 border-r-blue-500">
                <p className="text-slate-500 text-sm">العمولات المعلقة</p>
                <h3 className="text-2xl font-bold text-slate-800 mt-1">$45,200</h3>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm border-r-4 border-r-red-500">
                <p className="text-slate-500 text-sm">المصروفات التشغيلية</p>
                <h3 className="text-2xl font-bold text-slate-800 mt-1">$12,800</h3>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 font-bold text-slate-800">آخر العمليات المالية</div>
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[600px]">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="p-4">العملية</th>
                    <th className="p-4">المستخدم</th>
                    <th className="p-4">المبلغ</th>
                    <th className="p-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allTransactions.length > 0 ? allTransactions.map((tx: any) => (
                    <tr key={tx.id}>
                      <td className="p-4 text-sm font-bold">{tx.type === 'deposit' ? 'إيداع عربون' : tx.type}</td>
                      <td className="p-4 text-sm">{tx.userId}</td>
                      <td className={`p-4 text-sm font-black ${tx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {tx.amount > 0 ? '+' : ''}${tx.amount.toLocaleString()}
                      </td>
                      <td className="p-4 text-xs">
                        <span className={`px-2 py-1 rounded font-black ${tx.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                          {tx.status === 'completed' ? 'ناجحة' : 'قيد المعالجة'}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={4} className="p-10 text-center text-slate-400 font-bold">لا توجد عمليات مسجلة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        );


      case 'inventory_review':
        return (
          <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-orange-500" />
              مراجعة وقبول السيارات الجديدة
              <span className="text-sm font-bold text-slate-400 mr-2">({adminPendingCars.length} بانتظار المراجعة)</span>
            </h2>
            <div className="space-y-6">
              {adminPendingCars.map(car => {
                const sellerInfo = (car as any)._sellerInfo;
                return (
                <div key={car.id} className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
                  <div className="flex flex-col lg:flex-row">
                    {/* Image section */}
                    <div className="lg:w-[400px] shrink-0">
                      <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full">
                        <img
                          src={car.images?.[0] || '/placeholder-car.jpg'}
                          className="w-full h-full object-cover"
                          alt={`${car.make} ${car.model}`}
                        />
                        <div className="absolute top-3 right-3 bg-orange-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                          بانتظار المراجعة
                        </div>
                      </div>
                      {/* Thumbnail gallery */}
                      {car.images?.length > 1 && (
                        <div className="flex gap-1 p-2 bg-slate-950 overflow-x-auto">
                          {car.images.slice(0, 6).map((img: string, idx: number) => (
                            <img key={idx} src={img} className="w-14 h-10 object-cover rounded border border-slate-700 opacity-70 hover:opacity-100 transition-opacity cursor-pointer" alt="" />
                          ))}
                          {car.images.length > 6 && (
                            <div className="w-14 h-10 bg-slate-800 rounded border border-slate-700 flex items-center justify-center text-slate-400 text-xs font-bold">
                              +{car.images.length - 6}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Details section */}
                    <div className="flex-1 p-5 space-y-4">
                      {/* Car title */}
                      <div>
                        <h3 className="text-xl font-black text-white">{car.year} {car.make} {car.model} {car.trim || ''}</h3>
                        {car.vin && <p className="text-xs text-slate-500 font-mono mt-1">VIN: {car.vin}</p>}
                      </div>

                      {/* Car details grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        {car.odometer && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">العداد</div>
                            <div className="text-white font-bold">{Number(car.odometer).toLocaleString()} {car.mileageUnit || 'mi'}</div>
                          </div>
                        )}
                        {car.location && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">الموقع</div>
                            <div className="text-white font-bold text-xs">{car.location}</div>
                          </div>
                        )}
                        {car.primaryDamage && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">الضرر الرئيسي</div>
                            <div className="text-orange-400 font-bold text-xs">{car.primaryDamage}</div>
                          </div>
                        )}
                        {car.exteriorColor && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">اللون</div>
                            <div className="text-white font-bold text-xs">{car.exteriorColor}</div>
                          </div>
                        )}
                        {car.transmission && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">ناقل الحركة</div>
                            <div className="text-white font-bold text-xs">{car.transmission}</div>
                          </div>
                        )}
                        {car.engine && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">المحرك</div>
                            <div className="text-white font-bold text-xs">{car.engine}</div>
                          </div>
                        )}
                        {(car.reservePrice > 0) && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">السعر الاحتياطي</div>
                            <div className="text-emerald-400 font-bold">${Number(car.reservePrice).toLocaleString()}</div>
                          </div>
                        )}
                        {(car.currentBid > 0) && (
                          <div className="bg-slate-800/60 rounded-xl p-3">
                            <div className="text-[10px] text-slate-500 font-bold uppercase">سعر البداية</div>
                            <div className="text-white font-bold">${Number(car.currentBid).toLocaleString()}</div>
                          </div>
                        )}
                      </div>

                      {/* Seller info */}
                      <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
                        <div className="text-[10px] text-slate-500 font-bold uppercase mb-2 flex items-center gap-1">
                          <User className="w-3 h-3" /> معلومات البائع
                        </div>
                        <SellerInfoRow sellerId={car.sellerId} users={users} />
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={async () => {
                            const res = await authFetch(`/api/admin/cars/${car.id}/review`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'approve' })
                            });
                            if (res.ok) {
                              setAdminPendingCars(prev => prev.filter(c => c.id !== car.id));
                              showAlert('تم نشر السيارة بنجاح', 'success');
                            }
                          }}
                          className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black text-sm hover:bg-emerald-500 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          موافقة ونشر
                        </button>
                        <button
                          onClick={() => {
                            const notes = window.prompt('ملاحظات التعديل المطلوبة:');
                            if (notes) {
                              authFetch(`/api/admin/cars/${car.id}/request-edit`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ notes })
                              }).then(res => {
                                if (res.ok) showAlert('تم إرسال طلب التعديل للبائع', 'success');
                              });
                            }
                          }}
                          className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-black text-sm hover:bg-amber-500 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          طلب تعديل
                        </button>
                        <button
                          onClick={async () => {
                            const reason = window.prompt('سبب الرفض النهائي:');
                            if (reason) {
                              const res = await authFetch(`/api/admin/cars/${car.id}/review`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'reject', reason })
                              });
                              if (res.ok) {
                                setAdminPendingCars(prev => prev.filter(c => c.id !== car.id));
                                showAlert('تم رفض السيارة نهائياً', 'error');
                              }
                            }
                          }}
                          className="flex-1 bg-red-600 text-white py-3 rounded-xl font-black text-sm hover:bg-red-500 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          رفض نهائي
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
              {adminPendingCars.length === 0 && (
                <div className="py-20 text-center bg-slate-900 rounded-2xl border-2 border-dashed border-slate-700">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <p className="text-slate-400 font-bold">كل السيارات مراجعة تماماً!</p>
                </div>
              )}
            </div>
          </div>
        );





      case 'financial_ledger':
        return (
          <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-800">الرقابة المالية الشاملة 💰</h2>
              <div className="text-xs font-black bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl">النظام متوازن مالياً</div>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-900 p-6 rounded-[2rem] text-white">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">إجمالي السيولة (الإيداعات)</div>
                <div className="text-2xl font-black font-mono text-emerald-400">
                  ${allTransactions.filter(t => t.type === 'deposit').reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">صافي العمولات</div>
                <div className="text-2xl font-black font-mono text-slate-900">
                  ${allTransactions.filter(t => t.type === 'commission').reduce((sum, t) => sum + (t.amount || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">فواتير بانتظار التحصيل</div>
                <div className="text-2xl font-black font-mono text-blue-600">
                  ${allInvoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + (i.amount || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">صافي مبيعات المزاد</div>
                <div className="text-2xl font-black font-mono text-orange-500">
                  ${allInvoices.filter(i => i.status === 'paid' && i.type === 'purchase').reduce((sum, i) => sum + (i.amount || 0), 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mb-8">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center text-right">
                <h3 className="font-black text-slate-800">سجل المعاملات المالية الموثق</h3>
                <button onClick={() => authFetch('/api/admin/all-transactions').then(res => res.json()).then(setAllTransactions)} className="text-blue-500 text-xs font-black">تحديث البيانات ↺</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[800px]">
                <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase">
                  <tr>
                    <th className="p-4">المستخدم</th>
                    <th className="p-4">نوع العملية</th>
                    <th className="p-4">المبلغ</th>
                    <th className="p-4">الحالة</th>
                    <th className="p-4">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allTransactions.length > 0 ? allTransactions.map(tx => (
                    <tr key={tx.id} className="text-sm hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-800">{tx.firstName} {tx.lastName || `#${tx.userId}`}</td>
                      <td className="p-4 font-bold text-slate-500">
                        {tx.type === 'deposit' ? 'إيداع عربون' : tx.type === 'commission' ? 'عمولة شراء' : 'دفع فاتورة'}
                      </td>
                      <td className={`p-4 font-black font-mono ${tx.type === 'deposit' || tx.type === 'commission' ? 'text-emerald-600' : 'text-slate-900'}`}>${(tx.amount || 0).toLocaleString()}</td>
                      <td className="p-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${tx.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'}`}>
                          {tx.status === 'completed' ? 'ناجحة' : 'قيد المراجعة'}
                        </span>
                      </td>
                      <td className="p-4 text-xs font-mono text-slate-400 block pt-5" dir="ltr">{new Date(tx.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} <span className="opacity-50 text-[10px] block">{new Date(tx.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold">لا توجد حركات مالية مسجلة</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

            {/* Invoices Table */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center text-right">
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  الفواتير والمطالبات المالية
                </h3>
                <button onClick={() => authFetch('/api/admin/all-invoices').then(res => res.json()).then(setAllInvoices)} className="text-blue-500 text-xs font-black">تحديث البيانات ↺</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[1000px]">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase">
                    <tr>
                      <th className="p-4">الفاتورة / المشتري</th>
                      <th className="p-4">السيارة</th>
                      <th className="p-4">التاريخ والعمر</th>
                      <th className="p-4">المبلغ</th>
                      <th className="p-4">الحالة والمقروئية</th>
                      <th className="p-4">إجراءات إدارية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allInvoices.length > 0 ? allInvoices.map(inv => (
                      <tr key={inv.id} className="text-sm hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-slate-900 border-b border-slate-100 block pb-1 mb-1">
                            INV-{inv.id.substring(0, 8)}...
                            <span className="text-[9px] text-orange-500 font-black mr-2 uppercase bg-orange-50 px-2 py-0.5 rounded-full">{INVOICE_TYPE_LABELS[inv.type] || inv.type}</span>
                          </div>
                          <div className="text-xs text-slate-500">{inv.firstName} {inv.lastName}</div>
                        </td>
                        <td className="p-4 font-bold text-slate-600">
                          {inv.make} {inv.model}
                        </td>
                        <td className="p-4">
                          <div className="text-sm font-bold text-slate-800 font-mono" dir="ltr">{new Date(inv.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
                          {Math.floor((Date.now() - new Date(inv.timestamp).getTime()) / 86400000) > 0 && inv.status === 'unpaid' && (
                            <div className="text-[10px] font-black mt-1 bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                               <AlertCircle className="w-3 h-3" /> تأخير {Math.floor((Date.now() - new Date(inv.timestamp).getTime()) / 86400000)} يوماً
                            </div>
                          )}
                          {Math.floor((Date.now() - new Date(inv.timestamp).getTime()) / 86400000) === 0 && inv.status === 'unpaid' && (
                            <div className="text-[10px] font-bold mt-1 text-slate-400">البيع اليوم</div>
                          )}
                        </td>
                        <td className="p-4 font-black font-mono text-slate-900">
                          ${(inv.amount || 0).toLocaleString()}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${inv.status === 'paid' ? 'bg-green-50 text-green-600' : inv.status === 'pending' ? 'bg-slate-100 text-slate-500' : 'bg-orange-50 text-orange-600'}`}>
                              {inv.status === 'paid' ? 'مدفوعة' : inv.status === 'pending' ? 'معلقة' : 'بانتظار التحصيل'}
                            </span>
                            {inv.isViewed === 1 && inv.status !== 'paid' && (
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-500 flex items-center gap-1">
                                <Eye className="w-3 h-3" />
                                تمت المشاهدة
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            {inv.status === 'unpaid' && (
                              <button
                                onClick={() => {
                                  showConfirm(`تأكيد استلام تحويل بقيمة $${inv.amount.toLocaleString()} واعتماد الفاتورة؟`, async () => {
                                    try {
                                      const res = await authFetch(`/api/invoices/${inv.id}/pay`, { method: 'POST' });
                                      if (res.ok) {
                                        showAlert('تم اعتماد الدفع بنجاح وتسوية حساب البائع ✅', 'success');
                                        authFetch('/api/admin/all-invoices').then(r => r.json()).then(setAllInvoices);
                                        authFetch('/api/admin/shipments').then(r => r.json()).then(setAdminShipments);
                                      } else {
                                        showAlert('حدث خطأ في ترصيد الدفعة', 'error');
                                      }
                                    } catch (error) {
                                      showAlert('التصال بالخادم فشل', 'error');
                                    }
                                  });
                                }}
                                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-black transition-all shadow-md flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                سداد
                              </button>
                            )}
                            <button
                              onClick={() => setEditingInvoice(inv)}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-[10px] font-black transition-all flex items-center gap-1"
                            >
                              <Edit className="w-3 h-3" />
                              الفتح والتعديل
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold">لا توجد فواتير مسجلة</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );



      case 'copart':
        return <CopartAuctionSystem />;

      case 'macchinna_cars':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">إدارة سيارات المزاد المحلي Macchinna</h2>
              <button className="bg-orange-500 text-white px-4 py-2 rounded-xl font-bold shadow-lg shadow-orange-500/20 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                إضافة سيارة للمزاد المحلي
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
              <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <List className="w-10 h-10 text-orange-500" />
              </div>
              <h3 className="text-xl font-bold text-slate-800">لا توجد سيارات في المزاد المحلي حالياً</h3>
              <p className="text-slate-500 mt-2 max-w-md mx-auto">يمكنك البدء بإضافة سيارات من المخزون المحلي لعرضها في مزاد Macchinna الخاص بالمنصة.</p>
            </div>
          </div>
        );

      case 'pages':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-slate-800">إدارة صفحات الموقع</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {['الرئيسية', 'من نحن', 'شروط الاستخدام', 'سياسة الخصوصية', 'تواصل معنا'].map((page, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-slate-800">{page}</h3>
                    <p className="text-xs text-slate-400 mt-1">آخر تحديث: منذ يومين</p>
                  </div>
                  <button aria-label="زر" title="زر" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
                    <Edit className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );

      case 'transactions':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <h2 className="text-2xl font-bold text-slate-800">سجل العمليات (Transactions)</h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[800px]">
                <thead className="bg-slate-50 text-slate-500 text-sm">
                  <tr>
                    <th className="p-4">التاريخ</th>
                    <th className="p-4">المستخدم</th>
                    <th className="p-4">السيارة</th>
                    <th className="p-4">المبلغ</th>
                    <th className="p-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allTransactions.length > 0 ? allTransactions.map((t, i) => (
                    <tr key={i}>
                      <td className="p-4 text-sm text-slate-500 font-mono">{new Date(t.timestamp).toLocaleString('ar-EG')}</td>
                      <td className="p-4 text-sm font-bold text-slate-800">{t.firstName} {t.lastName}</td>
                      <td className="p-4 text-sm text-slate-600">عملية {t.type}</td>
                      <td className="p-4 text-sm font-bold text-slate-900">${t.amount.toLocaleString()}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                          {t.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">لا توجد عمليات مسجلة حالياً</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        );

      case 'offer_market':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">سوق العروض (Secondary Market)</h2>
              <button aria-label="زر" title="زر"
                onClick={() => {
                  authFetch(`/api/admin/offer-market-cars?userId=${currentUser?.id}&userRole=${currentUser?.role}`)
                    .then(res => res.json())
                    .then(setOfferMarketCars);
                }}
                className="p-2 text-slate-500 hover:text-slate-800"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[1000px]">
                  <thead className="bg-slate-50 text-slate-500 text-sm">
                    <tr>
                      <th className="p-4 font-medium">السيارة</th>
                      <th className="p-4 font-medium">السعر الاحتياطي</th>
                      <th className="p-4 font-medium">أعلى عرض</th>
                      <th className="p-4 font-medium">الوقت المتبقي</th>
                      <th className="p-4 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {offerMarketCars.length > 0 ? offerMarketCars.map(car => (
                      <tr key={car.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img src={car.images[0]} alt="صورة" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                            <div>
                              <div className="font-bold text-slate-900">{car.year} {car.make} {car.model}</div>
                              <div className="text-xs text-slate-500">ID: {car.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-900 font-mono">${(car.reservePrice || 0).toLocaleString()}</td>
                        <td className="p-4 font-bold text-green-600 font-mono">${(car.currentBid || 0).toLocaleString()}</td>
                        <td className="p-4 text-sm text-slate-600 font-mono">
                          {car.offerMarketEndTime ? new Date(car.offerMarketEndTime).toLocaleString('ar-EG') : '-'}
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                showConfirm('هل أنت متأكد من قبول هذا العرض؟', async () => {
                                  const res = await authFetch(`/api/offers/${car.id}/accept`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
                                  });
                                  if (res.ok) {
                                    showAlert('تم قبول العرض والبيع بنجاح', 'success');
                                    setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                  } else {
                                    const err = await res.json();
                                    showAlert(err.error || 'فشل قبول العرض');
                                  }
                                });
                              }}
                              className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs font-bold hover:bg-green-600 transition-colors"
                            >
                              قبول العرض
                            </button>
                            <button
                              onClick={() => {
                                showConfirm('هل أنت متأكد من رفض العرض؟ سيتم حذف العرض الحالي.', async () => {
                                  const res = await authFetch(`/api/offers/${car.id}/reject`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
                                  });
                                  if (res.ok) {
                                    showAlert('تم رفض العرض', 'success');
                                    // Refresh car data
                                    authFetch(`/api/admin/offer-market-cars?userId=${currentUser?.id}&userRole=${currentUser?.role}`)
                                      .then(res => res.json())
                                      .then(setOfferMarketCars);
                                  }
                                });
                              }}
                              className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors"
                            >
                              رفض
                            </button>
                            <button
                              onClick={() => {
                                showConfirm('هل تريد إعادة إدراج السيارة للمزاد القادم؟', async () => {
                                  const res = await authFetch(`/api/cars/${car.id}/re-list`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
                                  });
                                  if (res.ok) {
                                    showAlert('تم إعادة إدراج السيارة بنجاح', 'success');
                                    setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                  }
                                });
                              }}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors"
                            >
                              إعادة للمزاد
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-500">لا توجد سيارات في سوق العروض حالياً</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );



      case 'payments':
        return (
          <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">
            <h2 className="text-2xl font-black text-slate-800">إدارة بوابات الدفع والتحصيل</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: 'Stripe', status: 'نشط', icon: '💳', color: 'indigo' },
                { name: 'PayPal', status: 'غير مفعل', icon: '🅿️', color: 'blue' },
                { name: 'Tlync (Local)', status: 'نشط', icon: '🇱🇾', color: 'emerald' }
              ].map(gate => (
                <div key={gate.name} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                  <div className="flex justify-between items-start mb-6">
                    <div className="text-4xl">{gate.icon}</div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black ${gate.status === 'نشط' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                      {gate.status}
                    </div>
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">{gate.name}</h3>
                  <p className="text-slate-500 text-xs font-bold leading-relaxed mb-6">ربط بوابة {gate.name} لتحصيل العرابين ودفع فواتير الشحن تلقائياً.</p>
                  <button className="w-full py-4 bg-slate-50 text-slate-900 font-black text-xs rounded-2xl hover:bg-slate-900 hover:text-white transition-all shadow-sm">إعدادات الربط API</button>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 p-10 rounded-[3rem] text-white relative overflow-hidden">
              <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                <div className="max-w-xl">
                  <h3 className="text-2xl font-black mb-4">نظام التحويل البنكي اليدوي</h3>
                  <p className="text-slate-400 font-bold text-sm leading-relaxed">تفعيل خيار "التحويل البنكي" يتيح للعملاء إرفاق صورة الحوالة، وسيظهر لك إشعار في قسم "توثيق الأعضاء" لتأكيد المبلغ يدوياً.</p>
                </div>
                <button className="bg-orange-500 text-white px-10 py-5 rounded-2xl font-black shadow-2xl shadow-orange-500/40 hover:scale-105 transition-all">تفعيل التحويل اليدوي</button>
              </div>
              <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
            </div>
          </div>
        );



      case 'system_global':
        return <SystemSettingsPanel />;

      case 'welcome_settings':
        return <WelcomeSettingsPanel />;

      case 'api_keys':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">مفاتيح API</h2>
                <p className="text-sm text-slate-500 mt-1">إدارة مفاتيح الوصول للتطبيقات الخارجية</p>
              </div>
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                إنشاء مفتاح جديد
              </button>
            </div>

            {/* API Docs URL */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
              <Code2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">رابط توثيق الـ API</p>
                <p className="text-xs text-blue-600 mt-0.5 font-mono" dir="ltr">{window.location.origin}/api/v1/docs</p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/v1/docs`)}
                className="mr-auto text-blue-600 hover:text-blue-800 text-xs font-medium"
              >
                نسخ
              </button>
            </div>

            {/* Keys Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">الاسم</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">الموقع</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">المفتاح</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">الاستخدام</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">الحالة</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">إجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400">
                          <Key className="w-10 h-10 mx-auto mb-2 opacity-40" />
                          <p>لا توجد مفاتيح API بعد</p>
                        </td>
                      </tr>
                    ) : apiKeys.map((k: any, idx: number) => (
                      <tr key={k.key || idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-800">{k.name}</td>
                        <td className="px-4 py-3 text-slate-500">{k.website || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono" dir="ltr">
                              {k.key ? `${k.key.slice(0, 8)}...${k.key.slice(-4)}` : '—'}
                            </code>
                            <button
                              onClick={() => navigator.clipboard.writeText(k.key || '')}
                              className="text-slate-400 hover:text-orange-500 transition-colors"
                              title="نسخ المفتاح"
                            >
                              <ClipboardCheck className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{k.usageCount ?? 0}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            k.active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${k.active !== false ? 'bg-green-500' : 'bg-red-500'}`} />
                            {k.active !== false ? 'مفعّل' : 'معطّل'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={async () => {
                              try {
                                await authFetch(`/api/admin/api-keys/${k.key}/toggle`, { method: 'PUT' });
                                const res = await authFetch('/api/admin/api-keys');
                                const data = await res.json();
                                setApiKeys(Array.isArray(data) ? data : []);
                              } catch (err) { console.error('Toggle error:', err); }
                            }}
                            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                              k.active !== false
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                            }`}
                          >
                            {k.active !== false ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Create Modal */}
            {showApiKeyModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-800">إنشاء مفتاح API جديد</h3>
                    <button onClick={() => { setShowApiKeyModal(false); setNewApiKeyForm({ name: '', website: '' }); }} className="text-slate-400 hover:text-slate-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">اسم التطبيق</label>
                      <input
                        type="text"
                        value={newApiKeyForm.name}
                        onChange={e => setNewApiKeyForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                        placeholder="مثال: تطبيق الجوال"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">رابط الموقع</label>
                      <input
                        type="text"
                        value={newApiKeyForm.website}
                        onChange={e => setNewApiKeyForm(f => ({ ...f, website: e.target.value }))}
                        className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                        placeholder="https://example.com"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={async () => {
                        if (!newApiKeyForm.name.trim()) return;
                        try {
                          await authFetch('/api/admin/api-keys', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newApiKeyForm.name, website: newApiKeyForm.website })
                          });
                          const res = await authFetch('/api/admin/api-keys');
                          const data = await res.json();
                          setApiKeys(Array.isArray(data) ? data : []);
                          setShowApiKeyModal(false);
                          setNewApiKeyForm({ name: '', website: '' });
                        } catch (err) { console.error('Create API key error:', err); }
                      }}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
                    >
                      إنشاء المفتاح
                    </button>
                    <button
                      onClick={() => { setShowApiKeyModal(false); setNewApiKeyForm({ name: '', website: '' }); }}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-medium transition-colors"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'system':
        return renderSystemSettings();

      case 'overview':
        return (
          <EnhancedOverviewPanel
            onNavigate={(v) => setSearchParams({ view: v })}
            stats={stats}
            users={users}
            walletStats={walletStats}
            withdrawalStats={withdrawalStats}
            buyerWalletStats={buyerWalletStats}
            receivables={receivables}
            pendingDeposits={pendingDeposits}
            overviewMonthly={overviewMonthly}
          />
        );

      case 'cars':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-800">إدارة السيارات</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingCarId(null);
                    setNewCar({
                      make: '', model: '', year: 2024, currentBid: 0, status: 'upcoming',
                      trim: '', mileageUnit: 'mi', engineSize: '', horsepower: '',
                      drivetrain: 'FWD', fuelType: 'gasoline', exteriorColor: '',
                      interiorColor: '', secondaryDamage: 'None', keys: 'yes',
                      runsDrives: 'yes', notes: '',
                      odometer: 0, transmission: 'automatic', engine: '',
                      primaryDamage: 'None', titleType: 'Clean',
                      location: 'Warehouse', description: '', images: [],
                      reservePrice: 0, acceptOffers: true
                    });
                    setShowAddCarModal(true);
                  }}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-orange-500/20"
                >
                  <Plus className="w-5 h-5" />
                  إضافة سيارة يدوياً
                </button>
              </div>
            </div>

            {/* Cars search bar */}
            <div className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="ابحث بالماركة أو الموديل أو VIN أو Lot..."
                value={carSearch}
                onChange={e => { setCarSearch(e.target.value); setCarPage(1); }}
                className="bg-transparent text-sm font-bold flex-1 outline-none"
                aria-label="بحث سيارات"
              />
              {carSearch && <button onClick={() => setCarSearch('')} className="text-slate-400 hover:text-slate-600 text-xs font-black">✕</button>}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[1100px]">
                  <thead className="bg-slate-50 text-slate-500 text-sm">
                    <tr>
                      <th className="p-4 font-medium">السيارة</th>
                      <th className="p-4 font-medium">VIN / Lot</th>
                      <th className="p-4 font-medium">السعر الحالي</th>
                      <th className="p-4 font-medium">بيانات الإضافة والبائع</th>
                      <th className="p-4 font-medium">الحالة</th>
                      <th className="p-4 font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const q = carSearch.trim().toLowerCase();
                      const filtered = q ? cars.filter(c =>
                        `${c.make} ${c.model}`.toLowerCase().includes(q) ||
                        (c.vin || '').toLowerCase().includes(q) ||
                        (c.lotNumber || '').toLowerCase().includes(q) ||
                        String(c.year || '').includes(q)
                      ) : cars;
                      const totalPages = Math.max(1, Math.ceil(filtered.length / CARS_PER_PAGE));
                      const page = Math.min(carPage, totalPages);
                      const paged = filtered.slice((page - 1) * CARS_PER_PAGE, page * CARS_PER_PAGE);
                      return paged;
                    })().map(car => (
                      <tr key={car.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <img src={car.images[0]} alt="صورة" className="w-12 h-12 rounded-lg object-cover border border-slate-200" />
                            <div>
                              <div className="font-bold text-slate-900">{car.year} {car.make} {car.model}</div>
                              <div className="text-xs text-slate-500">{car.location}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-sm text-slate-600 font-mono">
                          <div>VIN: {car.vin}</div>
                          <div>Lot: {car.lotNumber}</div>
                        </td>
                        <td className="p-4 font-bold text-slate-900 font-mono">${(car.currentBid || 0).toLocaleString()}</td>
                        <td className="p-4 text-sm font-bold text-slate-600">
                           <div className="text-orange-600 font-black truncate max-w-[120px]" title={car.sellerName || car.sellerId}>{car.sellerName || car.sellerId || 'إدارة المنصة'}</div>
                           <div className="text-[10px] text-slate-400 font-mono mt-1">{new Date(car.createdAt || Date.now()).toLocaleDateString('ar-EG')}</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs font-bold ${car.status === 'live' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {car.status === 'live' ? 'مباشر' : 'قادم'}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2">
                            <button aria-label="زر" title="زر"
                              onClick={() => {
                                setEditingCarId(car.id);
                                setNewCar(car as any);
                                setShowAddCarModal(true);
                              }}
                              className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 transition-colors">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button aria-label="زر" title="زر"
                              onClick={async () => {
                                if (window.confirm('هل أنت متأكد من حذف هذه السيارة؟')) {
                                  await deleteCar(car.id);
                                }
                              }}
                              className="p-2 bg-red-50 hover:bg-red-100 rounded-lg text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Cars Pagination */}
                {(() => {
                  const q = carSearch.trim().toLowerCase();
                  const filtered = q ? cars.filter(c =>
                    `${c.make} ${c.model}`.toLowerCase().includes(q) ||
                    (c.vin || '').toLowerCase().includes(q) ||
                    (c.lotNumber || '').toLowerCase().includes(q) ||
                    String(c.year || '').includes(q)
                  ) : cars;
                  const totalPages = Math.max(1, Math.ceil(filtered.length / CARS_PER_PAGE));
                  if (totalPages <= 1) return null;
                  return (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                      <span className="text-xs text-slate-400 font-bold">
                        {filtered.length} سيارة — صفحة {Math.min(carPage, totalPages)} من {totalPages}
                      </span>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setCarPage(p => Math.max(1, p - 1))} disabled={carPage <= 1}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-30 hover:border-orange-300 hover:text-orange-600 transition-all">← السابق</button>
                        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                          const pg = Math.max(1, Math.min(carPage - 2, totalPages - 4)) + i;
                          return (
                            <button key={pg} onClick={() => setCarPage(pg)}
                              className={`w-8 h-8 rounded-xl text-xs font-black transition-all ${carPage === pg ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' : 'bg-white border border-slate-200 text-slate-600 hover:border-orange-300'}`}>
                              {pg}
                            </button>
                          );
                        })}
                        <button onClick={() => setCarPage(p => Math.min(totalPages, p + 1))} disabled={carPage >= totalPages}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-600 disabled:opacity-30 hover:border-orange-300 hover:text-orange-600 transition-all">التالي →</button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        );



      case 'inspections':
        return (
          <div className="space-y-6 animate-in fade-in duration-500 text-right" dir="rtl">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-black text-slate-800">إدارة طلبات الفحص الفني 🔍</h2>
              <div className="bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
                <span className="text-xs font-black text-slate-400">إجمالي الطلبات:</span>
                <span className="text-sm font-black text-slate-900">0</span>
              </div>
            </div>
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-20 text-center">
              <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-800">لا توجد طلبات فحص حالياً</h3>
              <p className="text-slate-500 font-bold mt-2 max-w-md mx-auto">سيتم عرض قائمة السيارات التي طلب العملاء فحصها فنياً هنا للمراجعة والتعميد.</p>
            </div>
          </div>
        );

      case 'marketplace_management':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800">سوق العروض (Marketplace Offers)</h2>
                <p className="text-slate-500 text-sm mt-1">إدارة السيارات التي لم تصل للسعر المطلوب وراجعة عروض المشترين.</p>
              </div>
              <button
                onClick={() => {
                  authFetch('/api/admin/offer-market-cars')
                    .then(res => res.json())
                    .then(data => setOfferMarketCars(data));
                }}
                className="bg-white text-slate-500 border border-slate-200 px-4 py-3 rounded-2xl font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                تحديث البيانات
              </button>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[1000px]">
                  <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="p-6 font-black">السيارة</th>
                      <th className="p-6 font-black">السعر المطلوب (Reserve)</th>
                      <th className="p-6 font-black">أعلى عرض مقدّم</th>
                      <th className="p-6 font-black">الوقت المتبقي</th>
                      <th className="p-6 text-center font-black">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {offerMarketCars.length > 0 ? offerMarketCars.map(car => (
                      <tr key={car.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <img src={car.images?.[0] || ''} alt="صورة" className="w-16 h-12 rounded-lg object-cover border border-slate-200" />
                            <div>
                              <div className="font-black text-slate-900">{car.year} {car.make} {car.model}</div>
                              <div className="text-[10px] text-slate-400 font-bold mt-1">Lot: {car.lotNumber}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-6 font-black text-slate-400 line-through decoration-red-500/50">${(car.reservePrice || 0).toLocaleString()}</td>
                        <td className="p-6">
                          <div className="font-black text-xl text-emerald-600">${(car.currentBid || 0).toLocaleString()}</div>
                          <div className={`text-[10px] font-bold ${car.status === 'pending_approval' ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {car.status === 'pending_approval' ? 'بانتظار موافقة البائع' : 'بانتظار قرار الإدارة'}
                          </div>
                          {car.sellerCounterPrice && (
                            <div className="text-[10px] mt-1 text-orange-600 font-bold bg-orange-50 px-2 py-1 rounded inline-block">
                              عرض البائع: ${car.sellerCounterPrice.toLocaleString()}
                            </div>
                          )}
                        </td>
                        <td className="p-6 text-sm text-amber-600 font-bold">
                          {car.offerMarketEndTime ? new Date(car.offerMarketEndTime).toLocaleString('ar-LY') : 'تنتهي قريباً'}
                        </td>
                        <td className="p-6">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => {
                                showConfirm('هل تريد قبول أعلى عرض وإتمام البيع؟', async () => {
                                  const res = await authFetch(`/api/offers/${car.id}/accept`, { method: 'POST' });
                                  if (res.ok) {
                                    showAlert('تم قبول العرض والبيع بنجاح!', 'success');
                                    setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                  }
                                });
                              }}
                              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black hover:bg-slate-800 transition-all"
                            >
                              قبول البيع
                            </button>
                            <button
                              onClick={() => {
                                showConfirm('هل تريد رفض العروض وإعادة السيارة للمزاد؟', async () => {
                                  const res = await authFetch(`/api/offers/${car.id}/reject`, { method: 'POST' });
                                  if (res.ok) {
                                    showAlert('تم رفض العروض وإعادة السيارة للجدولة', 'info');
                                    setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                  }
                                });
                              }}
                              className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-xs font-black hover:bg-rose-100 transition-all"
                            >
                              رفض وإعادة للجدولة
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="py-20 text-center">
                          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                            <Handshake className="w-8 h-8" />
                          </div>
                          <h3 className="text-xl font-black text-slate-400">لا توجد سيارات في سوق العروض حالياً</h3>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'reports':
        return <ReportsPanel reportsAnalytics={reportsAnalytics} setReportsAnalytics={setReportsAnalytics} />;

      case 'analytics':
        return <AnalyticsDashboard />;

      case 'kyc_review':
        return <KycReviewPanel kycUsers={kycUsers} setKycUsers={setKycUsers} showAlert={showAlert} />;

      case 'withdrawal_requests':

        return (
          <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800 flex items-center gap-3">
                  <CreditCard className="w-8 h-8 text-emerald-500" />
                  طلبات سحب البائعين
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  راجع وأقرّ أو ارفض طلبات تحويل الأرباح للبائعين.
                  <span className="mr-3 text-amber-500 font-bold">
                    {withdrawalRequests.filter(w => w.status === 'pending').length} طلب معلق
                  </span>
                </p>
              </div>
              <button
                onClick={() => authFetch('/api/admin/withdrawal-requests').then(r => r.json()).then(d => setWithdrawalRequests(Array.isArray(d) ? d : []))}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                تحديث
              </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'معلقة', count: withdrawalRequests.filter(w => w.status === 'pending').length, color: 'amber', icon: Clock },
                { label: 'مكتملة', count: withdrawalRequests.filter(w => w.status === 'completed').length, color: 'emerald', icon: CheckCircle2 },
                { label: 'مرفوضة', count: withdrawalRequests.filter(w => w.status === 'rejected').length, color: 'rose', icon: X },
              ].map(card => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`bg-${card.color}-50 border border-${card.color}-100 rounded-2xl p-5 flex items-center gap-4`}>
                    <div className={`w-12 h-12 bg-${card.color}-100 text-${card.color}-600 rounded-xl flex items-center justify-center`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <div className={`text-2xl font-black text-${card.color}-700`}>{card.count}</div>
                      <div className={`text-xs font-bold text-${card.color}-500`}>{card.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Withdrawals Table */}
            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right min-w-[1000px]">
                  <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="p-4 font-black">البائع</th>
                      <th className="p-4 font-black">المبلغ</th>
                      <th className="p-4 font-black">IBAN / البنك</th>
                      <th className="p-4 font-black">تاريخ الطلب</th>
                      <th className="p-4 font-black">الحالة</th>
                      <th className="p-4 font-black">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {withdrawalRequests.length > 0 ? withdrawalRequests.map((wr: any) => (
                      <WithdrawalRow
                        key={wr.id}
                        wr={wr}
                        onApprove={handleApproveWithdrawal}
                        onReject={handleRejectWithdrawal}
                      />
                    )) : (
                      <tr>
                        <td colSpan={6} className="p-16 text-center text-slate-400 font-bold italic">
                          لا توجد طلبات سحب حتى الآن
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'payment_requests':
        return (
          <div className="p-6 md:p-8 animate-in fade-in duration-300">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-11 h-11 bg-green-500 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/20">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800">طلبات الدفع والمحافظ</h2>
                <p className="text-slate-500 text-sm">مراجعة وإدارة طلبات شحن المحافظ وسحب الأرصدة</p>
              </div>
            </div>
            <PaymentRequestsPanel />
          </div>
        );

      case 'all_invoices':
        return (
          <div className="p-6 md:p-8 animate-in fade-in duration-300 relative min-h-[600px]" dir="rtl">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800">الخزينة: فواتير المبيعات والمطالبات المالية</h2>
                  <p className="text-slate-500 text-sm mt-1">
                    إدارة الدفع النقدي، المطالبات الإضافية، وتأكيد تحصيل المبالغ.
                    <span className="font-bold text-emerald-600 mr-2">
                       ({adminInvoices.filter(i => i.status === 'unpaid').length} فواتير غير محصلة)
                    </span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => authFetch('/api/admin/invoices').then(r => r.json()).then(data => setAdminInvoices(Array.isArray(data) ? data : []))}
                className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all"
              >
                <RefreshCw className="w-4 h-4" /> تحديث السجل
              </button>
            </div>

            <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-2xl border border-slate-200 w-fit overflow-x-auto max-w-full">
              {[
                { id: 'all', label: 'كافة الفواتير' },
                { id: 'unpaid', label: 'غير مدفوعة' },
                { id: 'paid', label: 'مدفوعة' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setInvoiceActiveTab(tab.id)}
                  className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${invoiceActiveTab === tab.id ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm min-w-[1000px]">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 font-black">
                  <tr>
                    <th className="p-5">المرجع والسيارة</th>
                    <th className="p-5">العميل</th>
                    <th className="p-5">القيمة المالية</th>
                    <th className="p-5 text-center">حالة السداد</th>
                    <th className="p-5 text-center">الإجراءات المحاسبية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminInvoices.filter(i => invoiceActiveTab === 'all' || i.status === invoiceActiveTab).map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-5">
                         <div className="font-black text-slate-800">{inv.year} {inv.make} {inv.model}</div>
                         <div className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-tighter">ID: {inv.id}</div>
                         <div className="inline-flex mt-2 px-2 py-0.5 rounded-md bg-slate-100 text-[9px] font-black text-slate-500 uppercase border border-slate-200">
                            {inv.type === 'purchase' ? 'شراء' : inv.type === 'transport' ? 'نقل' : inv.type === 'shipping' ? 'شحن' : 'رسوم إضافية'}
                         </div>
                      </td>
                      <td className="p-5">
                         <div className="font-bold text-slate-700">{inv.buyerFirstName} {inv.buyerLastName}</div>
                         <div className="text-xs text-slate-400 mt-1">{inv.buyerPhone}</div>
                      </td>
                      <td className="p-5">
                         <div className="text-lg font-black text-slate-900">${Number(inv.amount).toLocaleString()}</div>
                         <div className="text-[10px] text-slate-400 italic">بواسطة: {inv.paidVia || 'N/A'}</div>
                      </td>
                      <td className="p-5 text-center">
                         <span className={`px-4 py-1.5 rounded-full text-[10px] font-black border uppercase
                           ${inv.status === 'unpaid' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}
                         `}>
                            {inv.status === 'unpaid' ? 'غير مسددة' : 'تم السداد'}
                         </span>
                      </td>
                      <td className="p-5">
                         <div className="flex flex-col gap-2">
                            {inv.status === 'unpaid' && (
                              <button
                                onClick={() => setShowInvoiceConfirmModal({ isOpen: true, invoice: inv, nextStatus: 'paid' })}
                                className="w-full bg-emerald-600 text-white font-black py-2 rounded-xl text-xs shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all border border-emerald-500"
                              >
                                تأكيد تحصيل المبلع
                              </button>
                            )}
                            <button
                              onClick={() => setShowAddFeeModal({ isOpen: true, carId: inv.carId, userId: inv.userId })}
                              className="w-full bg-slate-100 text-slate-600 font-black py-2 rounded-xl text-[10px] hover:bg-slate-200 transition-all border border-slate-200 flex items-center justify-center gap-1"
                            >
                               <PlusCircle className="w-3.5 h-3.5" /> إضافة مطالبة مالية
                            </button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        );

      case 'shipments_tracking':
        return (
          <div className="p-6 md:p-8 animate-in fade-in duration-300 relative min-h-[600px]" dir="rtl">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Truck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800">قسم اللوجستيات: تتبع حركة السيارات</h2>
                  <p className="text-slate-500 text-sm mt-1">تحديث الموقع الجغرافي، رفع الصور، وإدارة خط سير الشحن البحري.</p>
                </div>
              </div>
              <button 
                 onClick={() => authFetch('/api/admin/invoices').then(r => r.json()).then(data => setAdminInvoices(Array.isArray(data) ? data : []))}
                 className="bg-orange-50 text-orange-600 hover:bg-orange-100 px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all border border-orange-200"
              >
                <RefreshCw className="w-4 h-4" /> تحديث المواقع
              </button>
            </div>

            <div className="flex gap-2 mb-6 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 w-fit overflow-x-auto max-w-full no-scrollbar">
              {[
                { id: 'all', label: 'الكل' },
                { id: 'awaiting_dispatch', label: 'بانتظار التحميل' },
                { id: 'picked_up', label: 'تم النقل' },
                { id: 'at_port', label: 'في الميناء' },
                { id: 'in_transit', label: 'في البحر' },
                { id: 'arrived_khoms', label: 'وصلت الوجهة' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setInvoiceActiveTab(tab.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all ${invoiceActiveTab === tab.id ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm min-w-[800px]">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="p-4 font-black">السيارة والوجهة</th>
                      <th className="p-4 font-black">الموقع الحالي</th>
                      <th className="p-4 font-black text-center">الإجراءات اللوجستية</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adminInvoices.filter(i => invoiceActiveTab === 'all' || i.status === invoiceActiveTab).map((inv: any) => (
                      <tr key={inv.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-4">
                           <div className="font-black text-slate-800">{inv.year} {inv.make} {inv.model}</div>
                           <div className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-tighter">Lot: {inv.lotNumber}</div>
                           <div className="flex items-center gap-2 mt-2">
                              <div className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-black border border-indigo-100">
                                 {inv.destinationPort || 'بانتظار التحديد'}
                              </div>
                           </div>
                        </td>
                        <td className="p-4">
                           <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                              <span className="font-black text-slate-700 text-xs">
                                 {inv.status === 'arrived_khoms' ? `وصلت ${inv.destinationPort}` : (INVOICE_STATUS_LABELS[inv.status] || inv.status)}
                              </span>
                           </div>
                           <div className="text-[10px] text-slate-400 mt-1 font-bold italic">آخر تحديث: {new Date().toLocaleDateString('ar-EG')}</div>
                        </td>
                        <td className="p-4">
                           <div className="flex flex-col gap-2 max-w-[200px] mx-auto">
                              {inv.status === 'awaiting_dispatch' && (
                                <button
                                  onClick={() => setShowInvoiceConfirmModal({ isOpen: true, invoice: inv, nextStatus: 'picked_up' })}
                                  className="w-full bg-orange-500 text-white font-black py-2 rounded-xl text-[10px] shadow-lg shadow-orange-500/20 hover:bg-orange-600 border border-orange-400"
                                >
                                  تأكيد التحميل (Picked Up)
                                </button>
                              )}
                              {inv.status === 'picked_up' && (
                                <button
                                  onClick={() => setShowInvoiceConfirmModal({ isOpen: true, invoice: inv, nextStatus: 'at_port' })}
                                  className="w-full bg-blue-500 text-white font-black py-2 rounded-xl text-[10px] hover:bg-blue-600 border border-blue-400"
                                >
                                  وصول الميناء (At Port)
                                </button>
                              )}
                              {inv.status === 'at_port' && (
                                <>
                                  <input 
                                    type="text" 
                                    placeholder="تحديد الميناء الوجهة..." 
                                    className="w-full text-center text-xs border border-slate-200 rounded-lg p-2 outline-none focus:border-orange-500"
                                    value={inv.destinationPort || ''}
                                    onChange={e => setAdminInvoices(prev => prev.map(item => item.id === inv.id ? { ...item, destinationPort: e.target.value } : item))}
                                  />
                                  <button
                                    onClick={() => setShowInvoiceConfirmModal({ isOpen: true, invoice: inv, nextStatus: 'in_transit' })}
                                    className="w-full bg-indigo-600 text-white font-black py-2 rounded-xl text-[10px] hover:bg-indigo-700 border border-indigo-500"
                                  >
                                    بدء الشحن البحري
                                  </button>
                                </>
                              )}
                              {inv.status === 'in_transit' && (
                                <button
                                  onClick={() => setShowInvoiceConfirmModal({ isOpen: true, invoice: inv, nextStatus: 'arrived_khoms' })}
                                  className="w-full bg-emerald-600 text-white font-black py-2 rounded-xl text-[10px] hover:bg-emerald-700 border border-emerald-500"
                                >
                                  تأكيد الوصول النهائي
                                </button>
                              )}
                           </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'expenses': {
        const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
        const categoryTotals: Record<string, number> = {};
        expenses.forEach((e: any) => { categoryTotals[e.category || 'أخرى'] = (categoryTotals[e.category || 'أخرى'] || 0) + Number(e.amount || 0); });
        const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 3);

        const handleAddExpense = async () => {
          if (!newExpense.description || !newExpense.amount || !newExpense.category) { showAlert('يرجى تعبئة جميع الحقول', 'error'); return; }
          try {
            const res = await authFetch('/api/admin/expenses', {
              method: 'POST',
              body: JSON.stringify({ date: newExpense.date, category: newExpense.category, description: newExpense.description, amount: Number(newExpense.amount) })
            });
            if (res.ok) {
              const created = await res.json();
              setExpenses(prev => [created, ...prev]);
              setShowAddExpenseModal(false);
              setNewExpense({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '' });
              showAlert('تم إضافة المصروف بنجاح', 'success');
            } else { const err = await res.json(); showAlert(err.error || 'فشل في الإضافة', 'error'); }
          } catch { showAlert('خطأ في الاتصال', 'error'); }
        };

        const handleDeleteExpense = (id: string) => {
          showConfirm('هل أنت متأكد من حذف هذا المصروف؟', async () => {
            try {
              const res = await authFetch(`/api/admin/expenses/${id}`, { method: 'DELETE' });
              if (res.ok) { setExpenses(prev => prev.filter(e => e.id !== id)); showAlert('تم الحذف', 'success'); }
              else showAlert('فشل في الحذف', 'error');
            } catch { showAlert('خطأ في الاتصال', 'error'); }
          });
        };

        return (
          <div className="p-6 md:p-8 animate-in fade-in duration-300" dir="rtl">
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-rose-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-rose-500/20">
                  <Receipt className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-3xl font-black text-slate-800">إدارة المصاريف التشغيلية 💸</h2>
                  <p className="text-slate-500 text-sm mt-1">تسجيل ومتابعة كافة المصاريف الإدارية والتشغيلية للمنصة</p>
                </div>
              </div>
              <button onClick={() => setShowAddExpenseModal(true)} className="bg-rose-500 hover:bg-rose-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-rose-500/20 transition-all">
                <Plus className="w-5 h-5" />
                إضافة مصروف جديد
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              {[
                { label: 'إجمالي المصاريف', value: `$${totalExpenses.toLocaleString()}`, color: 'rose' },
                { label: 'عدد السجلات', value: `${expenses.length}`, color: 'indigo' },
                { label: 'أعلى فئة', value: topCategories[0] ? `${topCategories[0][0]} ($${topCategories[0][1].toLocaleString()})` : '—', color: 'amber' },
              ].map((card, i) => (
                <div key={i} className={`bg-${card.color}-500 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden group`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl group-hover:bg-white/20 transition-all"></div>
                  <div className="relative z-10">
                    <div className="text-xs font-black text-white/70 uppercase tracking-widest mb-1">{card.label}</div>
                    <div className="text-4xl font-black font-mono tracking-tighter mb-4">{card.value}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-slate-800">سجل المصاريف الأخيرة</h3>
                <div className="flex gap-2">
                   <button className="p-2 text-slate-400 hover:text-slate-600 transition-all"><Filter className="w-5 h-5"/></button>
                   <button className="p-2 text-slate-400 hover:text-slate-600 transition-all"><Download className="w-5 h-5"/></button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm min-w-[900px]">
                <thead className="bg-slate-50/80 text-slate-500 font-black border-b border-slate-100">
                  <tr>
                    <th className="p-5">التاريخ</th>
                    <th className="p-5">البند / الوصف</th>
                    <th className="p-5">الفئة</th>
                    <th className="p-5">المبلغ</th>
                    <th className="p-5 text-center">بواسطة</th>
                    <th className="p-5 text-left">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {expensesLoading ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-400 font-bold">جاري التحميل...</td></tr>
                  ) : expenses.length === 0 ? (
                    <tr><td colSpan={6} className="p-10 text-center text-slate-300 font-bold italic">لا توجد مصاريف مسجلة بعد</td></tr>
                  ) : expenses.map((ex: any) => (
                    <tr key={ex.id} className="hover:bg-slate-50 transition-all">
                      <td className="p-5 font-mono text-slate-400">{ex.date || '—'}</td>
                      <td className="p-5 font-black text-slate-800">{ex.description}</td>
                      <td className="p-5">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold border border-slate-200">{ex.category}</span>
                      </td>
                      <td className="p-5 font-black text-rose-600 text-lg" dir="ltr">${Number(ex.amount).toLocaleString()}</td>
                      <td className="p-5 text-center font-bold text-slate-500">{ex.createdBy || '—'}</td>
                      <td className="p-5 text-left">
                        <button onClick={() => handleDeleteExpense(ex.id)} title="حذف" aria-label="حذف" className="p-2 text-slate-300 hover:text-rose-500 transition-all"><Trash2 className="w-4 h-4"/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Add Expense Modal */}
          {showAddExpenseModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddExpenseModal(false)}>
              <div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800">إضافة مصروف جديد</h3>
                  <button onClick={() => setShowAddExpenseModal(false)} className="p-2 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-black text-slate-500 mb-1">التاريخ</label>
                    <input type="date" value={newExpense.date} onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-rose-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 mb-1">الفئة</label>
                    <select value={newExpense.category} onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                      className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-rose-400 bg-white">
                      <option value="">اختر الفئة</option>
                      <option value="مكاتب">مكاتب</option>
                      <option value="رواتب">رواتب</option>
                      <option value="تقنية">تقنية</option>
                      <option value="لوجستيات">لوجستيات</option>
                      <option value="تسويق">تسويق</option>
                      <option value="صيانة">صيانة</option>
                      <option value="أخرى">أخرى</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 mb-1">الوصف</label>
                    <input type="text" value={newExpense.description} onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                      placeholder="مثال: إيجار مكتب طرابلس" className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-rose-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-slate-500 mb-1">المبلغ ($)</label>
                    <input type="number" value={newExpense.amount} onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                      placeholder="0.00" className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:border-rose-400" dir="ltr" />
                  </div>
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={handleAddExpense} className="flex-1 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-2xl font-black transition-all">
                    <Plus className="w-4 h-4 inline ml-2" /> إضافة
                  </button>
                  <button onClick={() => setShowAddExpenseModal(false)} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-slate-600 transition-all">
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          )}
          </div>
        );
      }

      case 'payment_gateways':
        return (
          <div className="p-6 md:p-8 animate-in fade-in duration-300" dir="rtl">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-2xl">
                <CreditCard className="w-9 h-9 text-orange-500" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-800">إدارة بوابات الدفع والتحصيل آلياً 💳</h2>
                <p className="text-slate-500 text-sm mt-1">تفعيل Stripe، PayPal، وتحويل حالات الفواتير آلياً عبر الـ Webhooks</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
              {/* Stripe Config */}
              <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#635BFF] rounded-xl flex items-center justify-center text-white font-black italic">S</div>
                    <h3 className="font-black text-xl text-slate-800">تكامل Stripe</h3>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" title="تفعيل بوابة Stripe" aria-label="تفعيل بوابة Stripe" className="sr-only peer" checked={paymentSettings.stripe} onChange={e => setPaymentSettings({ ...paymentSettings, stripe: e.target.checked })} />
                    <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#635BFF]"></div>
                  </label>
                </div>
                <div className="space-y-4">
                   <div>
                     <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">API Secret Key</label>
                     <input type="password" placeholder="sk_live_..." value={stripeApiKey} onChange={e => setStripeApiKey(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-mono outline-none focus:border-[#635BFF] text-left" dir="ltr" />
                   </div>
                   <div>
                     <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase">Webhook Endpoint URL</label>
                     <div className="flex gap-2">
                       <input readOnly value="https://autopro.ac/api/webhooks/stripe" className="flex-grow bg-slate-100 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-500 text-left" dir="ltr" />
                       <button onClick={() => { navigator.clipboard.writeText('https://autopro.ac/api/webhooks/stripe'); showAlert('تم نسخ رابط الـ Webhook', 'success'); }}
                         className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-black px-4 py-2 rounded-xl text-xs transition-colors">نسخ</button>
                     </div>
                   </div>
                   <button
                     disabled={stripeSaving || !stripeApiKey.trim()}
                     onClick={async () => {
                       setStripeSaving(true);
                       try {
                         const res = await authFetch('/api/admin/settings/update', {
                           method: 'POST',
                           body: JSON.stringify({ stripeSecretKey: stripeApiKey, stripeEnabled: paymentSettings.stripe })
                         });
                         if (res.ok) showAlert('تم حفظ إعدادات Stripe بنجاح ✅', 'success');
                         else { const err = await res.json().catch(() => ({})); showAlert(err.error || 'فشل في الحفظ', 'error'); }
                       } catch { showAlert('خطأ في الاتصال', 'error'); }
                       finally { setStripeSaving(false); }
                     }}
                     className="w-full bg-[#635BFF] hover:bg-[#5248e6] disabled:opacity-50 text-white font-black py-3 rounded-2xl transition-all">
                     {stripeSaving ? 'جاري الحفظ...' : 'حفظ إعدادات Stripe'}
                   </button>
                   <p className="text-[11px] text-slate-400 font-bold leading-relaxed bg-blue-50/50 p-3 rounded-xl border border-blue-50">
                     💡 بمجرد تفعيل هذا الرابط في لوحة Stripe، سيقوم النظام آلياً بتحويل حالة أي سيارة إلى <b className="text-blue-600">"تم الدفع"</b> فور نجاح العملية دون تدخل بشري.
                   </p>
                </div>
              </div>

              {/* Buying Power & Wallet Rules */}
              <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-orange-500/20 transition-all"></div>
                <h3 className="font-black text-xl mb-6 relative z-10 flex items-center gap-2">
                   <Shield className="w-6 h-6 text-orange-500" />
                   قواعد القوة الشرائية والمحفظة
                </h3>
                <div className="space-y-6 relative z-10">
                  <div className="p-5 bg-white/5 border border-white/10 rounded-2xl">
                    <div className="flex justify-between items-center mb-4">
                       <span className="text-xs font-black text-slate-400">القوة الشرائية لكل $1 عربون</span>
                       <span className="text-orange-500 font-black text-lg">×10</span>
                    </div>
                    <input type="range" className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500" min="1" max="50" defaultValue="10" />
                    <p className="text-[10px] text-slate-500 mt-3 font-bold italic">
                      مثال: إذا دفع العميل $1,000 عربون، يمكنه المزايدة حتى $10,000 في المزادات الحية.
                    </p>
                  </div>
                  <button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-orange-500/20 transition-all mt-4 active:scale-95">
                    حفظ القواعد المالية الجديدة
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm">
                <h3 className="font-black text-xl text-slate-800 mb-6 flex items-center gap-2">
                   <Zap className="w-6 h-6 text-amber-500" />
                   محفزات النظام (Webhooks Event Emitters)
                </h3>
                <div className="grid md:grid-cols-3 gap-6">
                   <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 hover:border-indigo-300 transition-all group">
                      <div className="text-indigo-600 font-black text-xs mb-2 flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></div>
                         EVENT: PAYMENT_SUCCESS
                      </div>
                      <p className="text-xs text-slate-600 font-bold leading-relaxed">بمجرد التحقق من الدفع، يتم فتح ملف اللوجستيات فوراً وإرسال إشعارات للفريق.</p>
                   </div>
                   <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 hover:border-emerald-300 transition-all">
                      <div className="text-emerald-600 font-black text-xs mb-2">EVENT: BUYER_WIN_AUCTION</div>
                      <p className="text-xs text-slate-600 font-bold leading-relaxed">توليد "فاتورة شراء" فورية وإرسال رابط دفع Stripe مباشر للمشتري.</p>
                   </div>
                </div>
            </div>
          </div>
        );

      // ── CRM: Customer Relationship Management ──
      case 'crm':
        return <CRMPanel />;

      // ── Seller Journey: KYC + Cars + Payouts ──
      case 'seller_journey':
        return <SellerJourneyPanel />;

      // ── Financial Summary: Balance Sheet ──
      case 'financial_summary':
        return <FinancialSummaryPanel />;

      // ── Audit Log: Security & Operations ──
      case 'audit_log':
        return <AuditLogPanel />;

      // ── Yard Management ──
      case 'yard_map':
        return <YardMap onSelectVehicle={(id) => setSearchParams({ view: 'yard_vehicle', id })} />;
      case 'yard_quick_scan':
        return <QuickVINScan onOpenDetail={(id) => setSearchParams({ view: 'yard_vehicle', id })} />;
      case 'yard_reports':
      case 'yard_daily_report':
        return <YardReportsDashboard />;
      case 'yard_stale':
        return <YardReportsDashboard />;
      case 'yard_audit':
        return <AuditWorkflow />;

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden font-sans" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {mobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[90] lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Unified Sidebar - Drawer on Mobile, Static on lg+ */}
      <aside ref={sidebarRef} className={`
        fixed inset-y-0 right-0 z-[100] w-80 bg-slate-900 text-white flex-shrink-0 flex flex-col p-6 
        transition-transform duration-300 transform lg:translate-x-0 lg:static lg:inset-0
        ${mobileSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
        overflow-y-auto border-l border-slate-800 pb-32 lg:pb-6
      `}>
        <div className="flex items-center justify-between mb-8 px-2 mt-4">
          <div className="flex flex-col items-center gap-2 w-full">
            <img
              src="/logo_on_dark.png?v=3"
              alt="Logo"
              className="h-16 w-auto object-contain drop-shadow-lg"
            />
            <div className="text-center space-y-0.5">
              <h1 className="text-base font-black tracking-tight leading-tight text-white">ليبيا اوتو برو</h1>
              <p className="text-[11px] font-black text-orange-400 tracking-widest uppercase">إدارة المنصة · ADMIN</p>
            </div>
          </div>
          <button 
            onClick={() => setMobileSidebarOpen(false)}
            title="إغلاق القائمة"
            aria-label="إغلاق القائمة"
            className="lg:hidden p-2 text-slate-400 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-grow space-y-1.5 px-1 pr-2">
          {[
            {
              group: 'Overview & Reports',
              label: 'نظرة عامة وتقارير',
              icon: Store,
              items: [
                { id: 'overview', label: 'الرئيسية (الإحصائيات)', icon: Store },
                { id: 'reports', label: 'تقارير السوق', icon: BookOpen },
                { id: 'analytics', label: 'تحليلات الزوار 📈', icon: TrendingUp },
                { id: 'messages', label: 'مركز الرسائل', icon: MessageSquare, badge: (messages || []).filter((m: any) => !m.isRead).length },
              ]
            },
            {
              group: 'User Management',
              label: 'إدارة المستخدمين',
              icon: Users,
              items: [
                { id: 'user_management', label: 'إدارة المشتركين', icon: Users, badge: (pendingUsers?.length || 0) },
                { id: 'kyc_review', label: 'مراجعة التوثيق KYC', icon: ShieldCheck, badge: (kycUsers || []).filter((u: any) => u.kycStatus === 'pending').length || undefined },
                { id: 'employee_management', label: 'إدارة الموظفين', icon: Shield },
              ]
            },
            {
              group: 'Vehicles & Auctions',
              label: 'السيارات والمزادات',
              icon: Car,
              items: [
                { id: 'cars', label: 'إدارة السيارات', icon: Car },
                { id: 'inventory_review', label: 'مراجعة السيارات', icon: ShieldCheck, badge: (adminPendingCars?.length || 0) },
                { id: 'manage_live_auctions', label: 'إدارة مزاداتنا الحية', icon: Gavel },
                { id: 'marketplace_management', label: 'سوق العروض', icon: Handshake },
                { id: 'inspections', label: 'طلبات الفحص', icon: Shield },
              ]
            },
            {
              group: 'Treasury & Accounting',
              label: 'الخزينة والمحاسبة',
              icon: Wallet,
              items: [
                { id: 'financial_approvals', label: 'تأمينات المزايدة', icon: Wallet, badge: (pendingDeposits?.length || 0) },
                { id: 'payment_requests', label: 'طلبات شحن المحفظة 💳', icon: CreditCard },
                { id: 'withdrawal_requests', label: 'طلبات سحب الأرباح', icon: CreditCard, badge: (withdrawalRequests || []).filter((w: any) => w.status === 'pending').length || undefined },
                { id: 'all_invoices', label: 'فواتير المبيعات والمطالبات', icon: FileText, badge: (adminInvoices || []).filter((i: any) => i.status === 'unpaid').length || undefined },
                { id: 'financial_ledger', label: 'الدفتر المالي والتقارير', icon: DollarSign },
                { id: 'expenses', label: 'إدارة المصاريف 💸', icon: Receipt },
                { id: 'payment_gateways', label: 'بوابات الدفع الإلكتروني', icon: ShieldCheck },
              ]
            },
            {
              group: 'Accounting',
              label: 'النظام المحاسبي',
              icon: Calculator,
              items: [
                { id: 'accounting_dashboard', label: 'لوحة المحاسبة', icon: BarChart3 },
                { id: 'accounting_invoices', label: 'الفواتير', icon: FileText },
                { id: 'accounting_journal', label: 'دفتر اليومية', icon: BookOpen },
                { id: 'accounting_accounts', label: 'دليل الحسابات', icon: Hash },
                { id: 'accounting_reports', label: 'التقارير المالية', icon: TrendingUp },
              ]
            },
            {
              group: 'Logistics & Shipping',
              label: 'اللوجستيات والشحن',
              icon: Truck,
              items: [
                { id: 'inventory_review', label: 'مراجعة السيارات الجديدة', icon: ShieldCheck, badge: (adminPendingCars?.length || 0) },
                { id: 'shipments_tracking', label: 'تتبع حركة الشحن والسيارات', icon: Truck, badge: (adminShipments?.length || 0) },
                { id: 'shipping_settings', label: 'تعريفة وأسعار الشحن', icon: Ship },
                { id: 'calculator', label: 'حاسبة التكلفة الجمركية', icon: Calculator },
              ]
            },
            {
              group: 'Yard Management',
              label: 'إدارة الحضيرة',
              icon: MapPin,
              items: [
                { id: 'yard_vehicles_list', label: 'قائمة السيارات 🚗', icon: Car },
                { id: 'yard_gate_in', label: 'إدخال سيارة ✅', icon: PlusCircle },
                { id: 'yard_gate_out', label: 'إخراج سيارة 🚪', icon: Send },
                { id: 'yard_map', label: 'خريطة الحضيرة 🗺️', icon: Map },
                { id: 'yard_quick_scan', label: 'بحث سريع VIN 🔍', icon: Search },
                { id: 'yard_reports', label: 'تقارير الحضيرة 📊', icon: BarChart3 },
                { id: 'yard_daily_report', label: 'التقرير اليومي 📋', icon: FileText },
                { id: 'yard_stale', label: 'السيارات الراكدة ⏰', icon: Clock },
                { id: 'yard_audit', label: 'الجرد الفعلي 📝', icon: ShieldCheck },
              ]
            },
            {
              group: 'Platform Settings',
              label: 'إعدادات المنصة',
              icon: Settings,
              items: [
                { id: 'system_global', label: 'إعدادات النظام الرئيسية ⚙️', icon: Settings },
                { id: 'marketing', label: 'مركز التسويق 📧', icon: Mail },
                { id: 'crm', label: 'CRM إدارة العملاء', icon: Users },
                { id: 'seller_journey', label: 'رحلة البائعين', icon: Car },
                { id: 'financial_summary', label: 'الميزانية العمومية', icon: DollarSign },
                { id: 'audit_log', label: 'سجل الأمان والعمليات', icon: Shield },
                { id: 'offices', label: 'إدارة الفروع والمكاتب', icon: Building2 },
                { id: 'footer_settings', label: 'إعدادات الفوتر والروابط', icon: Settings },
                { id: 'api_keys', label: 'مفاتيح API', icon: Key },
                { id: 'welcome_settings', label: 'رسالة الترحيب', icon: MessageSquare },
              ]
            }
          ]
          .map(group => {
            const allowedViews = TEAM_PERMISSIONS[currentUser?.supportTeam || ''] || TEAM_PERMISSIONS['admin'];
            const filteredItems = group.items.filter(item => 
              allowedViews.includes('*') || allowedViews.includes(item.id)
            );
            return { ...group, items: filteredItems };
          })
          .filter(group => group.items.length > 0)
          .map((category) => {
            const isActiveGroup = category.items.some(item => item.id === view);
            const isOpen = openGroup === category.group || (openGroup === 'INITIAL' && isActiveGroup);

            return (
              <div key={category.group} className="mb-2">
                <button
                  onClick={() => setOpenGroup(isOpen ? '' : category.group)}
                  className="w-full flex items-center justify-between p-3 rounded-2xl transition-all duration-300 text-slate-300 hover:bg-slate-800/50 hover:text-white"
                >
                  <div className="flex items-center gap-3">
                    <category.icon className="w-5 h-5 text-slate-500" />
                    <span className="text-sm font-black">{category.label}</span>
                  </div>
                  <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[800px] opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                  <div className="pl-4 pr-6 space-y-1 relative before:absolute before:right-8 before:top-2 before:bottom-2 before:w-px before:bg-slate-800">
                    {category.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { setSearchParams({ view: item.id }); setMobileSidebarOpen(false); }}
                        className={`w-full group flex items-center justify-between py-2.5 px-3 rounded-xl transition-all duration-300 relative z-10 ${view === item.id
                          ? 'bg-orange-500/10 text-orange-500'
                          : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${view === item.id ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]' : 'bg-slate-600 group-hover:bg-slate-400'}`}></div>
                          <span className="text-sm font-bold">{item.label}</span>
                        </div>
                        {item.badge ? (
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black transition-colors ${view === item.id ? 'bg-orange-500 text-white' : 'bg-red-500/20 text-red-500'}`}>
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800 space-y-2">
          <button
            onClick={() => window.location.href = '/'}
            title="الذهاب للموقع الخارجي"
            aria-label="الذهاب للموقع الخارجي"
            className="w-full flex items-center gap-3 p-4 text-slate-400 hover:text-white transition-colors text-sm font-bold"
          >
            <Globe className="w-5 h-5" />
            الذهاب للموقع
          </button>
          <button
            title="عرض سجل العمليات"
            aria-label="عرض سجل العمليات"
            onClick={() => { setSearchParams({ view: 'financial_ledger' }); setMobileSidebarOpen(false); }}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all text-sm font-black border ${view === 'financial_ledger' ? 'bg-orange-500/10 border-orange-500 text-orange-400' : 'bg-slate-800/50 text-slate-300 border-slate-700/50 hover:bg-slate-800 hover:text-white'}`}
          >
            <History className="w-5 h-5" />
            سجل العمليات
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow overflow-y-auto p-4 lg:p-10 pb-28 lg:pb-10 bg-white relative">
        <header className="flex flex-col lg:flex-row justify-between items-center mb-6 lg:mb-10 pb-6 border-b border-slate-100 gap-4">
          <div className="flex items-center gap-4 lg:gap-6 text-right w-full lg:w-auto" dir="rtl">
            <button 
              onClick={() => setMobileSidebarOpen(true)}
              title="فتح القائمة الجانبية"
              aria-label="فتح القائمة الجانبية"
              className="lg:hidden p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-orange-500 hover:text-white transition-all shadow-sm"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="w-12 h-12 lg:w-14 lg:h-14 bg-slate-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-slate-900/20">
              <ShieldCheck className="w-6 h-6 lg:w-8 lg:h-8 text-orange-500" />
            </div>
            <div>
              <h2 className="text-xl lg:text-2xl font-black text-slate-800 tracking-tighter leading-none">أهلاً بك، {currentUser?.firstName || 'المدير'} 👋</h2>
              <p className="text-slate-400 font-bold text-[10px] lg:text-xs mt-1">لديك {(pendingUsers?.length || 0) + (adminPendingCars?.length || 0)} طلبات تحتاج مراجعتك.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-4 w-full lg:w-auto justify-between lg:justify-end">
            <div className="relative group flex-grow lg:flex-grow-0">
              <input aria-label="البحث عن العناصر" title="البحث الحاضر" placeholder="بحث..."
                type="text"
                className="bg-slate-50 border border-slate-200 rounded-2xl px-10 lg:px-12 py-3 text-sm font-bold w-full lg:w-64 xl:w-80 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all shadow-sm group-hover:shadow-md text-right"
                dir="rtl"
              />
              <Search className="w-4 h-4 lg:w-5 lg:h-5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100 shadow-sm gap-1 shrink-0">
              <div className="relative" ref={notificationsRef}>
                <button
                  title="الاشعارات"
                  aria-label="عرض الاشعارات"
                  onClick={() => { setShowNotifications(!showNotifications); setShowMessages(false); }}
                  className={`p-2 rounded-xl transition-all relative ${showNotifications ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Bell className="w-5 h-5" />
                  {(unreadCounts?.notifications || 0) > 0 && (
                    <span className="absolute top-2 right-2 w-4 h-4 bg-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                      {unreadCounts.notifications}
                    </span>
                  )}
                </button>
                {showNotifications && <NotificationDropdown onClose={() => setShowNotifications(false)} />}
              </div>

              <div className="relative" ref={messagesRef}>
                <button
                  title="الرسائل"
                  aria-label="عرض الرسائل"
                  onClick={() => { setShowMessages(!showMessages); setShowNotifications(false); }}
                  className={`p-2 rounded-xl transition-all relative ${showMessages ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Mail className="w-5 h-5" />
                  {(unreadCounts?.messages || 0) > 0 && (
                    <span className="absolute top-2 right-2 w-4 h-4 bg-blue-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
                      {unreadCounts.messages}
                    </span>
                  )}
                </button>
                {showMessages && <MessageDropdown onClose={() => setShowMessages(false)} />}
              </div>
            </div>

            <div className="relative" ref={adminMenuRef}>
              <button
                onClick={() => setShowAdminMenu(!showAdminMenu)}
                className="flex items-center gap-3 bg-slate-900 text-white p-1.5 pr-4 rounded-2xl shadow-xl shadow-slate-900/20 shrink-0 hover:bg-slate-800 transition-all group"
              >
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-black">{currentUser?.firstName || 'Admin'}</div>
                  <div className="text-[9px] text-orange-500 font-black uppercase tracking-widest">Administrator</div>
                </div>
                <div className="w-8 h-8 lg:w-9 lg:h-9 bg-orange-500 rounded-xl flex items-center justify-center font-black group-hover:scale-110 transition-transform">
                  {currentUser?.firstName?.[0] || 'A'}
                </div>
              </button>
              {showAdminMenu && (
                <div className="absolute top-full mt-2 left-0 w-52 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50" dir="rtl">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <div className="text-sm font-black text-slate-800">{currentUser?.firstName} {currentUser?.lastName}</div>
                    <div className="text-xs text-orange-500 font-bold">مدير النظام</div>
                  </div>
                  <button
                    onClick={() => { setView('profile'); setShowAdminMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    الملف الشخصي
                  </button>
                  <button
                    onClick={() => { setView('platform_settings'); setShowAdminMenu(false); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-slate-400" />
                    إعدادات المنصة
                  </button>
                  <div className="h-px bg-slate-100 my-1" />
                  <button
                    onClick={() => {
                      setCurrentUser(null);
                      localStorage.removeItem('currentUser');
                      localStorage.removeItem('authToken');
                      window.location.href = '/';
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    تسجيل الخروج
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {renderContent()}
      </main>

      {/* Modals & Overlays */}
      <div className="fixed bottom-10 left-10 z-50">
        <button aria-label="إضافة سيارة جديدة" title="إضافة سيارة"
          onClick={() => {
            setEditingCarId(null);
            setNewCar({
              make: '', model: '', year: 2024, currentBid: 0, status: 'upcoming',
              trim: '', mileageUnit: 'mi', engineSize: '', horsepower: '',
              drivetrain: 'FWD', fuelType: 'gasoline', exteriorColor: '',
              interiorColor: '', secondaryDamage: 'None', keys: 'yes',
              runsDrives: 'yes', notes: '',
              odometer: 0, transmission: 'automatic', engine: '',
              primaryDamage: 'None', titleType: 'Clean',
              location: 'Warehouse', description: '', images: [],
              reservePrice: 0, acceptOffers: true
            });
            setShowAddCarModal(true);
          }}
          className="w-16 h-16 bg-slate-900 text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-slate-900/40 hover:scale-110 active:scale-95 transition-all group"
        >
          <Plus className="w-8 h-8 group-hover:rotate-90 transition-transform" />
        </button>
      </div>

      {showAddCarModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] overflow-y-auto">
          <div className="w-full h-full relative p-4 md:p-8">
            <button
              title="إغلاق"
              aria-label="إغلاق النافذة الاضافية"
              onClick={() => setShowAddCarModal(false)}
              className="absolute top-6 left-6 z-50 p-3 bg-slate-900/50 hover:bg-rose-500 text-white rounded-full transition-all shadow-xl"
            >
              <X className="w-6 h-6" />
            </button>
            <UnifiedCarForm
              isSubmitting={false}
              initialData={editingCarId ? cars.find(c => c.id === editingCarId) : newCar}
              onCancel={() => setShowAddCarModal(false)}
              onSubmit={async (data, images, engineSound, inspectionReport) => {
                try {
                  const uploadedImages: string[] = [];
                  if (images && images.length > 0) {
                    const formData = new FormData();
                    images.forEach((img: File) => formData.append('images', img));
                    const imgRes = await authFetch('/api/upload/images', { method: 'POST', body: formData });
                    if (imgRes.ok) {
                      const imgData = await imgRes.json();
                      if (imgData.urls) uploadedImages.push(...imgData.urls);
                    } else {
                      const errData = await imgRes.json();
                      throw new Error(errData.error || 'Failed to upload images');
                    }
                  }

                  let engineAudioUrl = '';
                  let inspectionPdf = '';

                  // Upload engine sound
                  if (engineSound) {
                    const soundData = new FormData();
                    soundData.append('media', engineSound);
                    const soundRes = await authFetch('/api/upload/media', { method: 'POST', body: soundData });
                    if (soundRes.ok) {
                      const soundJson = await soundRes.json();
                      engineAudioUrl = soundJson.url || '';
                    }
                  }

                  // Upload inspection PDF
                  if (inspectionReport) {
                    const pdfData = new FormData();
                    pdfData.append('media', inspectionReport);
                    const pdfRes = await authFetch('/api/upload/media', { method: 'POST', body: pdfData });
                    if (pdfRes.ok) {
                      const pdfJson = await pdfRes.json();
                      inspectionPdf = pdfJson.url || '';
                    }
                  }

                  const car = {
                    id: Date.now().toString(),
                    lotNumber: Math.floor(Math.random() * 100000000).toString(),
                    vin: data.vin || ('1G1' + Math.random().toString(36).substring(7).toUpperCase()),
                    make: data.make,
                    model: data.model,
                    year: data.year,
                    odometer: data.odometer,
                    actualOdometer: data.actualOdometer,
                    engine: data.engine,
                    cylinders: data.cylinders,
                    transmission: data.transmission,
                    drive: data.drive,
                    fuelType: data.fuelType,
                    auctionLane: data.auctionLane,
                    showroomName: data.showroomName,
                    startingBid: data.startingBid,
                    reservePrice: data.reservePrice,
                    saleStatus: data.saleStatus,
                    locationDetails: data.locationDetails,
                    exchangeRate: data.exchangeRate,
                    minPrice: data.minPrice,
                    specialNote: data.specialNote,
                    images: uploadedImages.length > 0 ? uploadedImages : ['https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=800'],
                    engineVideoUrl: data.youtubeVideoUrl || '',
                    engineAudioUrl,
                    inspectionPdf,
                    status: 'upcoming' as const,
                    acceptOffers: true,
                    currency: 'USD',
                    location: data.locationDetails || 'Unknown Location', // Added location
                    currentBid: data.currentBid || 0 // Added currentBid
                  };

                  if (editingCarId) {
                    await updateCar(editingCarId, car);
                    setShowAddCarModal(false);
                    showAlert('تم تحديث بيانات السيارة بنجاح', 'success');
                  } else {
                    await addCar(car);
                    setShowAddCarModal(false);
                    showAlert('تم إضافة السيارة بنجاح إلى النظام', 'success');
                  }
                } catch (err: any) {
                  const msg = err?.message || '';
                  if (msg.includes('VIN') || msg.includes('vin')) {
                    showAlert(`⚠️ رقم الشاصي (VIN) مسجل مسبقاً في النظام. يرجى استخدام رقم شاصي مختلف.`, 'error');
                  } else if (msg.includes('FOREIGN KEY')) {
                    showAlert(`⚠️ خطأ في ربط البيانات — تأكد من صحة معلومات البائع.`, 'error');
                  } else {
                    showAlert(`⚠️ ${msg || 'حدث خطأ أثناء حفظ السيارة — تأكد من ملء جميع الحقول المطلوبة.'}`, 'error');
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {showOpenSooqModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden" dir="rtl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <Download className="w-6 h-6 text-indigo-500" />
                استيراد من السوق المفتوح
              </h3>
              <button
                title="إغلاقنافذة الاستيراد"
                aria-label="إغلاقنافذة الاستيراد"
                onClick={() => { setShowOpenSooqModal(false); setScrapeResult(null); setIsScraping(false); }}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                disabled={isScraping}
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {scrapeResult && (
                <div className={`p-4 rounded-xl text-sm font-bold ${scrapeResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                  {scrapeResult.success ? `تم استيراد ${scrapeResult.count} سيارة بنجاح!` : `خطأ: ${scrapeResult.error}`}
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الماركة (Make)</label>
                <input
                  type="text"
                  value={opensooqMake}
                  onChange={e => setOpensooqMake(e.target.value)}
                  disabled={isScraping}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-bold disabled:opacity-50"
                  placeholder="مثال: تويوتا, هونداي"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الموديل (Model)</label>
                <input
                  type="text"
                  value={opensooqModel}
                  onChange={e => setOpensooqModel(e.target.value)}
                  disabled={isScraping}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-bold disabled:opacity-50"
                  placeholder="مثال: كامري, النترا"
                />
              </div>

              <div className="bg-blue-50 text-blue-800 text-xs p-3 rounded-lg flex items-start gap-2 mt-4">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>سيتم استخراج بيانات السيارات وإدخالها مباشرة إلى قاعدة البيانات ويمكنك مراجعتها في القائمة.</span>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => { setShowOpenSooqModal(false); setScrapeResult(null); }}
                className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                disabled={isScraping}
              >
                إلغاء
              </button>
              <button
                onClick={async () => {
                  setIsScraping(true);
                  setScrapeResult(null);
                  try {
                    const res = await authFetch('/api/admin/scrape-opensooq', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ make: opensooqMake, model: opensooqModel })
                    });
                    const data = await res.json();
                    if (data.success) {
                      setScrapeResult({ success: true, count: data.count });
                      setTimeout(() => window.location.reload(), 1500);
                    } else {
                      setScrapeResult({ success: false, error: data.error || 'فشل الاستيراد' });
                    }
                  } catch (e) {
                    setScrapeResult({ success: false, error: 'تعذر الاتصال بالخادم. حاول مجدداً.' });
                  } finally {
                    setIsScraping(false);
                  }
                }}
                disabled={isScraping || !opensooqMake || !opensooqModel}
                className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isScraping ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {isScraping ? 'جاري الاستيراد...' : 'بدء الاستيراد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditUserModal && selectedUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 animate-in zoom-in-95 duration-200 my-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">تعديل بيانات المستخدم</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الاسم الأول</label>
                <input aria-label="الاسم الأول" title="الاسم الأول" placeholder="تعديل الاسم الأول"
                  type="text"
                  value={selectedUser.firstName}
                  onChange={e => setSelectedUser({ ...selectedUser, firstName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">البريد الإلكتروني</label>
                <input aria-label="البريد الإلكتروني" title="البريد الإلكتروني" placeholder="تعديل البريد الإلكتروني"
                  type="email"
                  value={selectedUser.email}
                  onChange={e => setSelectedUser({ ...selectedUser, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">رقم الهاتف</label>
                <input aria-label="رقم الهاتف" title="رقم الهاتف" placeholder="تعديل رقم الهاتف"
                  type="tel"
                  value={selectedUser.phone}
                  onChange={e => setSelectedUser({ ...selectedUser, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الاسم الأخير</label>
                <input aria-label="الاسم الأخير" title="الاسم الأخير" placeholder="تعديل الاسم الأخير"
                  type="text"
                  value={selectedUser.lastName}
                  onChange={e => setSelectedUser({ ...selectedUser, lastName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الدور</label>
                <select aria-label="تحديد دور المستخدم" title="دور المستخدم"
                  value={selectedUser.role}
                  onChange={e => setSelectedUser({ ...selectedUser, role: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors appearance-none"
                >
                  <option value="buyer">مستخدم</option>
                  <option value="seller">تاجر</option>
                  <option value="manager">مدير</option>
                  <option value="admin">مسؤول</option>
                </select>
              </div>

              {(selectedUser.role === 'admin' || selectedUser.role === 'manager') && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">فريق الدعم (اختياري)</label>
                  <select aria-label="تحديد فريق الدعم" title="فريق الدعم"
                    value={selectedUser.supportTeam || ''}
                    onChange={e => setSelectedUser({ ...selectedUser, supportTeam: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors appearance-none"
                  >
                    <option value="">بدون فريق (عام)</option>
                    <option value="registration">فريق التسجيل</option>
                    <option value="accounting">فريق المحاسبة</option>
                    <option value="purchasing">فريق الشراء</option>
                    <option value="transport">فريق النقل</option>
                    <option value="clearance">فريق التخليص الجمركي</option>
                    <option value="shipping">فريق الشحن</option>
                    <option value="complaints">فريق الشكاوي والجودة</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الحالة</label>
                <select aria-label="حالة المستخدم" title="حالة المستخدم"
                  value={selectedUser.status}
                  onChange={e => setSelectedUser({ ...selectedUser, status: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors appearance-none"
                >
                  <option value="active">نشط</option>
                  <option value="inactive">غير نشط</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">العربون (Deposit)</label>
                <input aria-label="عربون المستخدم" title="العربون" placeholder="تعديل العربون"
                  type="number"
                  value={selectedUser.deposit}
                  onChange={e => setSelectedUser({ ...selectedUser, deposit: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">نسبة العمولة (%)</label>
                <input aria-label="نسبة عمولة المستخدم" title="العمولة" placeholder="تعديل نسبة العمولة"
                  type="number"
                  value={selectedUser.commission}
                  onChange={e => setSelectedUser({ ...selectedUser, commission: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">البلد / الفرع التابع له</label>
                <select aria-label="البلد والفرع للمستخدم" title="البلد"
                  value={selectedUser.country}
                  onChange={e => setSelectedUser({ ...selectedUser, country: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-all appearance-none"
                >
                  <option value="">اختر البلد</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t border-slate-100">
              <button
                onClick={handleUpdateUser}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-8 rounded-lg transition-colors shadow-lg shadow-orange-500/20"
              >
                تحديث
              </button>
              <button
                onClick={() => setShowEditUserModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-8 rounded-lg transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Modal */}
      {showMessageModal && selectedUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-slate-900 mb-4">إرسال رسالة إلى {selectedUser.firstName}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-500 mb-1">الموضوع</label>
                <input
                  type="text"
                  aria-label="موضوع الرسالة"
                  title="موضوع الرسالة"
                  value={messageForm.subject}
                  onChange={e => setMessageForm({ ...messageForm, subject: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 focus:border-orange-500 outline-none"
                  placeholder="موضوع الرسالة"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-500 mb-1">نص الرسالة</label>
                <textarea
                  aria-label="نص الرسالة"
                  title="نص الرسالة"
                  value={messageForm.content}
                  onChange={e => setMessageForm({ ...messageForm, content: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-900 focus:border-orange-500 outline-none h-32 resize-none"
                  placeholder="اكتب رسالتك هنا..."
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSendMessage}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 rounded-lg transition-colors shadow-lg shadow-orange-500/20"
                >
                  إرسال
                </button>
                <button
                  onClick={() => setShowMessageModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-6 animate-in zoom-in-95 duration-200 my-8">
            <h3 className="text-xl font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">إضافة مستخدم جديد</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Row 1 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الاسم الأول</label>
                <input aria-label="الاسم الأول" title="الاسم الأول" placeholder="إدخال الاسم الأول"
                  type="text"
                  value={newUser.firstName}
                  onChange={e => setNewUser({ ...newUser, firstName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">البريد الإلكتروني</label>
                <input aria-label="البريد الإلكتروني" title="البريد الإلكتروني" placeholder="إدخال البريد الإلكتروني"
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Row 2 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">رقم الهاتف</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="tel"
                  value={newUser.phone}
                  onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الاسم الأخير</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={newUser.lastName}
                  onChange={e => setNewUser({ ...newUser, lastName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Row 3 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الدور</label>
                <select aria-label="تحديد" title="تحديد"
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors appearance-none"
                >
                  <option value="">الرجاء اختيار الدور</option>
                  <option value="مستخدم">مستخدم</option>
                  <option value="تاجر">تاجر</option>
                  <option value="مدير">مدير</option>
                  <option value="مسؤول">مسؤول</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">كلمة المرور</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Row 4 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">المدير</label>
                <select aria-label="تحديد" title="تحديد"
                  value={newUser.manager}
                  onChange={e => setNewUser({ ...newUser, manager: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors appearance-none"
                >
                  <option value="">Select Manager</option>
                  <option value="المدير طارق">المدير طارق</option>
                  <option value="المدير أحمد">المدير أحمد</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">المكتب</label>
                <select aria-label="تحديد" title="تحديد"
                  value={newUser.office}
                  onChange={e => setNewUser({ ...newUser, office: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors appearance-none"
                >
                  <option value="">أختار المكتب</option>
                  {offices.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Row 5 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الشركة</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={newUser.companyName}
                  onChange={e => setNewUser({ ...newUser, companyName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">البلد / الفرع</label>
                <select aria-label="تحديد" title="تحديد"
                  value={newUser.country}
                  onChange={e => setNewUser({ ...newUser, country: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:bg-white transition-all appearance-none"
                >
                  <option value="">الرجاء اختيار الفرع التابع له</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Row 6 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Address Line 2</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={newUser.address2}
                  onChange={e => setNewUser({ ...newUser, address2: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Address Line 1</label>
                <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                  type="text"
                  value={newUser.address1}
                  onChange={e => setNewUser({ ...newUser, address1: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-orange-500 focus:bg-white transition-colors"
                />
              </div>

              {/* Row 7 - Status, Deposit & Commission */}
              <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-3">الحالة</label>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="inactive"
                        checked={newUser.status === 'inactive'}
                        onChange={() => setNewUser({ ...newUser, status: 'inactive' })}
                        className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-sm font-medium text-slate-600">Inactive</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="active"
                        checked={newUser.status === 'active'}
                        onChange={() => setNewUser({ ...newUser, status: 'active' })}
                        className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-sm font-medium text-slate-600">Active</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">العربون (Deposit)</label>
                  <div className="relative">
                    <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                      type="number"
                      value={newUser.deposit || ''}
                      onChange={e => setNewUser({ ...newUser, deposit: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-colors pl-8"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">نسبة العمولة (%)</label>
                  <div className="relative">
                    <input aria-label="مدخل" title="مدخل" placeholder="تحديد"
                      type="number"
                      value={newUser.commission || ''}
                      onChange={e => setNewUser({ ...newUser, commission: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-3 text-sm outline-none focus:border-orange-500 transition-colors pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                  </div>
                </div>
              </div>

              {/* Bid Limit Display */}
              <div className="md:col-span-2 flex justify-end">
                <div className="bg-orange-50 px-6 py-3 rounded-xl border border-orange-100 flex items-center gap-4">
                  <span className="text-sm font-bold text-orange-800">القوة الشرائية (Bid Limit):</span>
                  <span className="text-xl font-black text-orange-600">${(newUser.deposit * 10).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-8 pt-6 border-t border-slate-100">
              <button
                onClick={handleAddUser}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 px-8 rounded-lg transition-colors shadow-lg shadow-orange-500/20"
              >
                حفظ
              </button>
              <button
                onClick={() => setShowAddUserModal(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-8 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Edit Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9999] p-4 flex items-center justify-center animate-in fade-in zoom-in-95 duration-200 shadow-2xl" dir="rtl">
          <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden border border-slate-200 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                مراجعة وتعديل الفاتورة
              </h3>
              <button onClick={() => setEditingInvoice(null)} className="p-2 hover:bg-rose-100 rounded-full text-slate-400 hover:text-rose-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-right overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">تاريخ الإصدار</label>
                  <div className="p-3 bg-slate-50 rounded-xl font-black text-slate-800 font-mono text-center" dir="ltr">
                    {new Date(editingInvoice.timestamp).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">نوع الفاتورة</label>
                  <div className="p-3 bg-slate-50 rounded-xl font-black text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                    {INVOICE_TYPE_LABELS[editingInvoice.type] || editingInvoice.type}
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">اسم العميل / المشتري</label>
                <div className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 text-lg">
                  {editingInvoice.firstName} {editingInvoice.lastName}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">المبلغ المطلوب ($)</label>
                <input type="number" value={editingInvoice.amount || ''} onChange={e => setEditingInvoice({ ...editingInvoice, amount: Number(e.target.value) })}
                  className="w-full border-2 border-slate-200 p-4 rounded-xl font-black text-xl font-mono focus:border-blue-500 outline-none text-left transition-colors" dir="ltr" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">ملاحظات إضافية</label>
                <textarea rows={3} value={editingInvoice.notes || ''} onChange={e => setEditingInvoice({ ...editingInvoice, notes: e.target.value })}
                  className="w-full border-2 border-slate-200 p-4 rounded-xl focus:border-blue-500 outline-none text-sm transition-colors resize-none" placeholder="اكتب ملاحظاتك هنا..."></textarea>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setEditingInvoice(null)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-200 rounded-xl transition-colors">إلغاء</button>
              <button 
                onClick={async () => {
                  try {
                    const res = await authFetch(`/api/admin/invoices/${editingInvoice.id}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ amount: editingInvoice.amount, notes: editingInvoice.notes })
                    });
                    if (res.ok) {
                      showAlert('تم حفظ التعديلات بنجاح', 'success');
                      authFetch('/api/admin/all-invoices').then(r => r.json()).then(setAllInvoices);
                      setEditingInvoice(null);
                    } else {
                      showAlert('فشل التحديث', 'error');
                    }
                  } catch (err) {
                    console.error('Invoice Update Error:', err);
                    showAlert('حدث خطأ في الاتصال', 'error');
                  }
                }} 
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-black shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex justify-center items-center gap-2"
              >
                 <CheckCircle2 className="w-5 h-5" /> حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Confirmation Modal */}
      {showInvoiceConfirmModal.isOpen && (
        <ConfirmModal
          isOpen={true}
          title="تأكيد التحديث"
          message={`هل أنت متأكد من تغيير حالة الفاتورة لسيارة ${showInvoiceConfirmModal.invoice.make} ${showInvoiceConfirmModal.invoice.model} إلى ${INVOICE_STATUS_LABELS[showInvoiceConfirmModal.nextStatus]}؟`}
          onConfirm={async () => {
            const { invoice, nextStatus } = showInvoiceConfirmModal;
            try {
              const res = await authFetch(`/api/admin/invoices/${invoice.id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus, releaseCardUrl: invoice._newUrl || invoice.releaseCardUrl })
              });
              if (res.ok) {
                setAdminInvoices(prev => prev.map(i => i.id === invoice.id ? { ...i, status: nextStatus, releaseCardUrl: invoice._newUrl || i.releaseCardUrl } : i));
                showAlert('تم تحديث الفاتورة بنجاح', 'success');
              } else {
                showAlert('فشل التحديث', 'error');
              }
            } catch (err) {
              showAlert('حدث خطأ في تحديث الفاتورة', 'error');
            }
            setShowInvoiceConfirmModal({ isOpen: false, invoice: null, nextStatus: '' });
          }}
          onCancel={() => setShowInvoiceConfirmModal({ isOpen: false, invoice: null, nextStatus: '' })}
          confirmText="تحديث الحالة"
        />
      )}

      {/* Estimate Modal */}
      {showEstimateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                {editingEstimate ? <Edit className="w-6 h-6 text-indigo-500" /> : <Plus className="w-6 h-6 text-emerald-500" />}
                {editingEstimate ? 'تعديل بيانات التسعيرة' : 'إضافة تسعيرة جديدة'}
              </h3>
              <button
                title="إغلاق النموذج"
                aria-label="إغلاق النموذج"
                onClick={() => setShowEstimateModal(false)}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" dir="rtl">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">الماركة (عربي)</label>
                  <input type="text" value={estimateForm.make} onChange={e => setEstimateForm({ ...estimateForm, make: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="مثال: تويوتا" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">الماركة (إنجليزي)</label>
                  <input type="text" value={estimateForm.makeEn} onChange={e => setEstimateForm({ ...estimateForm, makeEn: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="مثال: Toyota" dir="ltr" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">الموديل (عربي)</label>
                  <input type="text" value={estimateForm.model} onChange={e => setEstimateForm({ ...estimateForm, model: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="مثال: كامري" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">الموديل (إنجليزي)</label>
                  <input type="text" value={estimateForm.modelEn} onChange={e => setEstimateForm({ ...estimateForm, modelEn: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="مثال: Camry" dir="ltr" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">سنة الصنع</label>
                  <input title="سنة الصنع" aria-label="سنة الصنع" type="number" value={estimateForm.year} onChange={e => setEstimateForm({ ...estimateForm, year: parseInt(e.target.value) || 2024 })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500" dir="ltr" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">حالة السيارة</label>
                  <select title="حالة السيارة" aria-label="حالة السيارة" value={estimateForm.condition} onChange={e => setEstimateForm({ ...estimateForm, condition: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500">
                    <option value="جديد">جديد</option>
                    <option value="مستعمل">مستعمل</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">ناقل الحركة</label>
                  <select title="ناقل الحركة" aria-label="ناقل الحركة" value={estimateForm.transmission} onChange={e => setEstimateForm({ ...estimateForm, transmission: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500">
                    <option value="اوتوماتيك">أوتوماتيك</option>
                    <option value="عادي">عادي (مانيوال)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">نوع الوقود</label>
                  <select title="نوع الوقود" aria-label="نوع الوقود" value={estimateForm.fuel} onChange={e => setEstimateForm({ ...estimateForm, fuel: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500">
                    <option value="بنزين">بنزين</option>
                    <option value="ديزل">ديزل</option>
                    <option value="هايبرد">هايبرد</option>
                    <option value="كهرباء">كهرباء</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">الممشى (كم)</label>
                  <input type="text" value={estimateForm.mileage} onChange={e => setEstimateForm({ ...estimateForm, mileage: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="مثال: 10,000 - 19,999" dir="ltr" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">المدينة</label>
                  <input type="text" value={estimateForm.city} onChange={e => setEstimateForm({ ...estimateForm, city: e.target.value })} className="w-full border border-slate-300 rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="مثال: طرابلس" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2">متوسط السعر (حسب السوق الموازي)</label>
                  <div className="relative">
                    <input type="text" value={estimateForm.price} onChange={e => setEstimateForm({ ...estimateForm, price: e.target.value })} className="w-full border border-slate-300 rounded-lg p-3 outline-none focus:border-indigo-500 pl-10 text-lg font-mono font-bold" placeholder="مثال: 85,000" dir="ltr" />
                    <DollarSign className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => setShowEstimateModal(false)}
                className="px-6 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={async () => {
                  if (!estimateForm.make || !estimateForm.model || !estimateForm.price) {
                    showAlert('يرجى تعبئة الحقول الأساسية', 'error');
                    return;
                  }
                  let success = false;
                  if (editingEstimate) {
                    success = await updateMarketEstimate(editingEstimate.id, estimateForm);
                  } else {
                    success = await addMarketEstimate(estimateForm);
                  }
                  if (success) {
                    showAlert(editingEstimate ? 'تم التعديل بنجاح' : 'تمت الإضافة بنجاح', 'success');
                    setShowEstimateModal(false);
                  } else {
                    showAlert('حدث خطأ أثناء حفظ التسعيرة', 'error');
                  }
                }}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editingEstimate ? 'حفظ التغييرات' : 'إضافة التسعيرة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Libyan Market Admin Modal */}
      {showLibyanModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                <Car className="w-6 h-6 text-indigo-500" />
                إضافة تسعيرة جديدة
              </h3>
              <button onClick={() => setShowLibyanModal(false)} title="إغلاق" aria-label="إغلاق" className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4" dir="rtl">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الحالة</label>
                <select title="الحالة" aria-label="الحالة" value={libyanModalForm.condition} onChange={e => setLibyanModalForm({ ...libyanModalForm, condition: e.target.value })} className="w-full border rounded-lg p-2.5 outline-none focus:border-indigo-500">
                  <option value="جديد">جديد</option>
                  <option value="مستعمل">مستعمل</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الماركة (عربي)</label>
                <input type="text" value={libyanModalForm.make} onChange={e => setLibyanModalForm({ ...libyanModalForm, make: e.target.value })} className="w-full border rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="تويوتا" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الماركة (English)</label>
                <input type="text" value={libyanModalForm.makeEn || ''} onChange={e => setLibyanModalForm({ ...libyanModalForm, makeEn: e.target.value })} className="w-full border rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="Toyota" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الموديل (عربي)</label>
                <input type="text" value={libyanModalForm.model} onChange={e => setLibyanModalForm({ ...libyanModalForm, model: e.target.value })} className="w-full border rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="كامري" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">الموديل (English)</label>
                <input type="text" value={libyanModalForm.modelEn || ''} onChange={e => setLibyanModalForm({ ...libyanModalForm, modelEn: e.target.value })} className="w-full border rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="Camry" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">السنة</label>
                <input type="number" value={libyanModalForm.year} onChange={e => setLibyanModalForm({ ...libyanModalForm, year: Number(e.target.value) })} className="w-full border rounded-lg p-2.5 outline-none focus:border-indigo-500" placeholder="2024" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">السعر بالدينار</label>
                <input type="number" value={libyanModalForm.priceLYD} onChange={e => setLibyanModalForm({ ...libyanModalForm, priceLYD: e.target.value })} className="w-full border rounded-lg p-2.5 outline-none focus:border-indigo-500 font-mono" placeholder="75000" dir="ltr" />
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 text-sm font-bold">
              <button onClick={() => setShowLibyanModal(false)} className="px-5 py-2 rounded-xl text-slate-500 hover:bg-slate-200 transition-colors">إلغاء</button>
              <button onClick={async () => {
                if(!libyanModalForm.make || !libyanModalForm.model) {
                  showAlert('يرجى تعبئة الحقول الأساسية', 'error'); return;
                }
                try {
                  const url = libyanModalForm.id ? `/api/libyan-market/${libyanModalForm.id}` : '/api/libyan-market';
                  const method = libyanModalForm.id ? 'PUT' : 'POST';
                  const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(libyanModalForm) });
                  if (res.ok) {
                    showAlert(libyanModalForm.id ? 'تم التعديل بنجاح' : 'تمت الإضافة بنجاح', 'success');
                    setShowLibyanModal(false);
                    authFetch('/api/libyan-market').then(r => r.json()).then(setLibyanMarketPrices);
                  }
                } catch(e) { showAlert('حدث خطأ أثناء الاتصال بالخادم', 'error'); }
              }} className="px-5 py-2 flex gap-2 items-center rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-colors"><Check className="w-4 h-4" />{libyanModalForm.id ? 'حفظ التعديلات' : 'حفظ البيانات'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Report PDF Modal Overlay */}
      {showReportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200" dir="rtl">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <FileText className="w-6 h-6 text-indigo-500" />
                {showReportModal.title}
              </h3>
              <button onClick={() => setShowReportModal(null)} title="إغلاق" aria-label="إغلاق" className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-8 text-center bg-slate-50 text-indigo-900 font-bold overflow-y-auto max-h-60 rounded-lg m-4 border flex items-center justify-center whitespace-pre-wrap font-mono relative">
               <div className="bg-indigo-50 absolute inset-0 opacity-50 blur-xl"></div>
               <span className="relative z-10 text-xl">{JSON.stringify(showReportModal.data, null, 2)}</span>
            </div>
            <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 text-sm font-bold">
               <button onClick={() => {
                 showAlert('تم تحميل التقرير (محاكاة)', 'success');
                 setShowReportModal(null);
               }} className="px-5 py-2 flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-colors">
                 <Download className="w-4 h-4" />
                 تحميل PDF
               </button>
            </div>
          </div>
        </div>
      )}
      {/* EXTRA FEE / MANUAL INVOICE MODAL */}
      {showAddFeeModal && showAddFeeModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" dir="rtl">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                  <Receipt className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-slate-800">إضافة رسوم / غرامة إضافية</h3>
              </div>
              <button 
                aria-label="إغلاق"
                onClick={() => setShowAddFeeModal(null)} 
                className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mr-1">نوع الرسوم</label>
                <select
                  aria-label="تحديد نوع المصروف"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                  value={feeForm.type}
                  onChange={e => setFeeForm({ ...feeForm, type: e.target.value })}
                >
                  <option value="storage_fine">غرامة تخزين (Storage Fine)</option>
                  <option value="extra_service">خدمة إضافية (Extra Service)</option>
                  <option value="inspection_fee">رسوم فحص (Inspection Fee)</option>
                  <option value="late_payment_fine">غرامة تأخير دفع</option>
                  <option value="other">أخرى</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mr-1">القيمة (USD)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    aria-label="قيمة الرسوم"
                    type="number"
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 pl-10 font-bold text-sm outline-none focus:border-orange-500 transition-all text-left"
                    value={feeForm.amount}
                    onChange={e => setFeeForm({ ...feeForm, amount: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mr-1">تاريخ الاستحقاق (اختياري)</label>
                <input
                  aria-label="تاريخ الاستحقاق"
                  type="date"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                  value={feeForm.dueDate}
                  onChange={e => setFeeForm({ ...feeForm, dueDate: e.target.value })}
                />
              </div>

              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
                <Info className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                  سيتم إنشاء فاتورة "غير مدفوعة" باسم العميل، وسيظهر له إشعار فوري في لوحة التحكم الخاصة به.
                </p>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={handleCreateManualInvoice}
                  disabled={isAddingFee}
                  className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isAddingFee ? (
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>🚀 إصدار الفاتورة</>
                  )}
                </button>
                <button
                  onClick={() => setShowAddFeeModal(null)}
                  className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-2xl font-black hover:bg-slate-200 transition-all"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
