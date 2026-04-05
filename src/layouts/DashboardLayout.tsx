import React, { useState, useRef } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, User, ShieldCheck, Store, LogOut, Bell, Settings,
  Home, Users, Building2, FileText, Mail, Wallet, Truck, Car, Gavel,
  List, File, History, HelpCircle, ChevronRight, Heart, Database, Calculator,
  CreditCard, Activity, Handshake, DollarSign, MessageSquare, LineChartIcon, PlusCircle,
  Menu, X
} from 'lucide-react';

import { useStore } from '../context/StoreContext';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { MessageDropdown } from '../components/MessageDropdown';

export const DashboardLayout = () => {
  const location = useLocation();

  const getRole = () => {
    if (location.pathname.includes('/admin')) return 'admin';
    if (location.pathname.includes('/seller')) return 'seller';
    return 'user';
  };

  const role = getRole();
  const { branchConfig, currentUser, setCurrentUser, unreadCounts } = useStore();
  const [showNotifications, setShowNotifications] = React.useState(false);
  const [showMessages, setShowMessages] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const messagesRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useClickOutside(messagesRef, () => setShowMessages(false));
  useClickOutside(notificationsRef, () => setShowNotifications(false));

  // Define types for navigation items
  type NavItem = { path: string; label: string; icon: React.ElementType };
  type NavSection = { category?: string; items: NavItem[] };

  const links: Record<string, NavSection[]> = {
    admin: [
      {
        category: 'الرئيسية',
        items: [
          { path: '/dashboard/admin', label: 'اللوحة الرئيسية', icon: Home }
        ]
      },
      {
        category: 'إدارة المستخدمين والوصول',
        items: [
          { path: '/dashboard/admin?view=user_management', label: 'المستخدمين والصلاحيات', icon: Users },
          { path: '/dashboard/admin?view=offices', label: 'إدارة المكاتب', icon: Building2 },
          { path: '/dashboard/admin?view=messages', label: 'رسائل المزاد', icon: Mail },
        ]
      },
      {
        category: 'إدارة المزادات والسيارات',
        items: [
          { path: '/dashboard/admin?view=cars', label: 'إدارة السيارات', icon: Car },
          { path: '/dashboard/admin?view=auctions', label: 'إدارة المزايدات', icon: Gavel },
          { path: '/dashboard/admin?view=offer_market', label: 'سوق العروض', icon: Store },
          { path: '/dashboard/admin?view=copart', label: 'نظام كوبارت (CSV)', icon: Database },
          { path: '/dashboard/admin?view=macchinna_cars', label: 'قائمة سيارات Macchinna', icon: List },
        ]
      },
      {
        category: 'اللوجستيات والشحن',
        items: [
          { path: '/dashboard/admin?view=logistics', label: 'إدارة اللوجستيات والشحن', icon: Truck },
          { path: '/dashboard/admin?view=shipping_settings', label: 'إعدادات صفحة الشحن العامة', icon: Settings },
        ]
      },

      {
        category: 'الإدارة المالية',
        items: [
          { path: '/dashboard/admin?view=payment_requests', label: 'طلبات الدفع والشحن 💳', icon: CreditCard },
          { path: '/dashboard/admin?view=financial_approvals', label: 'الموافقات المالية', icon: Wallet },
          { path: '/dashboard/admin?view=financials', label: 'الحسابات المالية', icon: Wallet },
          { path: '/dashboard/admin?view=financial_ledger', label: 'الرقابة المالية الشاملة', icon: Database },
        ]
      },
      {
        category: 'إعدادات المنصة',
        items: [
          { path: '/dashboard/admin?view=system', label: 'إعدادات النظام', icon: Settings },
          { path: '/dashboard/admin?view=footer_settings', label: 'إعدادات الفوتر 🦶', icon: Settings },
          { path: '/dashboard/admin?view=services', label: 'الخدمات والتقارير', icon: FileText },
          { path: '/dashboard/admin?view=pages', label: 'قائمة الصفحات', icon: File },
          { path: '/dashboard/admin?view=faq', label: 'FAQ list', icon: HelpCircle },
          { path: '/dashboard/admin?view=transactions', label: 'سجل العمليات', icon: History },
        ]
      },
      {
        category: 'أدوات إضافية',
        items: [
          { path: '/dashboard/admin?view=calculator', label: 'حاسبة التكلفة المحلية', icon: Calculator },
        ]
      }
    ],
    user: [
      {
        items: [
          { path: '/dashboard/user', label: 'اللوحة الرئيسية', icon: LayoutDashboard },
          { path: '/wallet', label: 'محفظتي 💰', icon: Wallet },
          { path: '/dashboard/user?view=bids', label: 'مزايداتي وحالتها', icon: Gavel },
          { path: '/calculator', label: 'حاسبة التكلفة المحلية', icon: Calculator },
          { path: '/dashboard/user?view=won', label: 'سيارات تم ربحها', icon: ShieldCheck },
          { path: '/dashboard/user?view=favorites', label: 'المفضلة', icon: Heart },
          { path: '/dashboard/user?view=wallet', label: 'الفواتير والحسابات', icon: Wallet },
          { path: '/dashboard/user?view=logistics', label: 'تتبع الشحن', icon: Truck },
          { path: '/dashboard/user?view=messages', label: 'الرسائل والتنبيهات', icon: Mail },
          { path: '/dashboard/user?view=profile', label: 'الملف الشخصي', icon: User },
        ]
      }
    ],
    seller: [
      {
        category: 'إدارة المعرض والسيارات',
        items: [
          { path: '/dashboard/seller?view=overview', label: 'الرئيسية (Dashboard)', icon: Store },
          { path: '/dashboard/seller?view=inventory', label: 'مخزون السيارات', icon: Car },
          { path: '/dashboard/seller?view=add', label: 'إضافة سيارة', icon: PlusCircle },
        ]
      },
      {
        category: 'المالية واللوجستيات',
        items: [
          { path: '/dashboard/seller?view=financials', label: 'الحسابات (Ledger)', icon: DollarSign },
          { path: '/dashboard/seller?view=logistics', label: 'الشحن والتسليم', icon: Truck },
        ]
      },
      {
        category: 'التواصل والرؤى',
        items: [
          { path: '/dashboard/seller?view=messages', label: 'صندوق البريد', icon: MessageSquare },
          { path: '/dashboard/seller?view=market_insights', label: 'رؤى السوق', icon: LineChartIcon },
          { path: '/dashboard/seller?view=profile', label: 'الملف الشخصي (KYC)', icon: CreditCard },
        ]
      }
    ]
  };

  const currentSections = links[role] || [];

  const getPageTitle = () => {
    const currentView = new URLSearchParams(location.search).get('view');
    if (!currentView) return 'نظرة عامة';

    for (const section of currentSections) {
      const item = section.items.find(i => i.path.includes(`view=${currentView}`));
      if (item) return item.label;
    }
    return 'نظرة عامة';
  };

  // User & Admin dashboards have their own internal sidebar layouts, so skip the DashboardLayout wrapper
  if (role === 'user' || role === 'admin') {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 right-0 z-50 w-[280px] bg-slate-900 text-white flex flex-col flex-shrink-0 h-screen overflow-y-auto custom-scrollbar transition-transform duration-300 transform md:sticky md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-6 flex items-center justify-between border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <img 
              src="/logo_on_dark.png?v=3" 
              alt="Logo" 
              className="h-10 w-auto object-contain rounded-lg shadow-md bg-white/10" 
            />
            <div>
              <h1 className="font-bold text-lg leading-tight text-white shrink-0">ليبيا <span className="text-orange-500 text-sm">AUTO PRO</span></h1>
              <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest shrink-0">
                {(role as string) === 'admin' ? 'الإدارة العامة' : 'حساب العميل'}
              </span>
            </div>
          </div>
          <button 
            aria-label="إغلاق القائمة" title="إغلاق القائمة"
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden p-2 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-grow p-4 space-y-6">
          {currentSections.map((section, idx) => (
            <div key={idx}>
              {section.category && (
                <h3 className="px-4 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  {section.category}
                </h3>
              )}
              <div className="space-y-1">
                {section.items.map((link) => {
                  const Icon = link.icon;
                  const isActive = location.pathname + location.search === link.path ||
                    (link.path === '/dashboard/admin' && location.pathname === '/dashboard/admin' && location.search === '');

                  return (
                    <Link
                      key={link.path}
                      to={link.path}
                      onClick={() => setIsSidebarOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors text-sm ${isActive ? 'bg-orange-500 text-white font-bold shadow-lg shadow-orange-500/20' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 flex-shrink-0 space-y-1">
          {/* Profile */}
          <Link
            to={role === 'seller' ? '/dashboard/seller?view=profile' : '/dashboard/user?view=profile'}
            onClick={() => setIsSidebarOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm"
          >
            <User className="w-4 h-4 shrink-0" />
            <span className="font-bold">الملف الشخصي</span>
          </Link>
          {/* Settings */}
          <Link
            to={role === 'seller' ? '/dashboard/seller?view=profile' : '/dashboard/user?view=settings'}
            onClick={() => setIsSidebarOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm"
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="font-bold">الإعدادات</span>
          </Link>
          {/* Back to site */}
          <Link to="/" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-400 hover:bg-slate-800 transition-colors text-sm">
            <LogOut className="w-4 h-4 shrink-0 rotate-180" />
            <span className="font-medium">العودة للموقع</span>
          </Link>
          {/* Logout */}
          <button
            onClick={() => {
              if (typeof setCurrentUser === 'function') setCurrentUser(null);
              localStorage.removeItem('currentUser');
              localStorage.removeItem('token');
              window.location.href = '/';
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-500/10 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="font-bold">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-grow flex flex-col h-screen overflow-hidden min-w-0">
        <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <button
              aria-label="فتح القائمة" title="فتح القائمة"
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="font-bold text-slate-800 text-base md:text-lg flex flex-wrap md:flex-nowrap items-center gap-1 md:gap-2 truncate">
              {(role as string) === 'admin' && <span className="text-slate-400 font-normal hidden md:inline">لوحة التحكم / </span>}
              <span className="truncate">{getPageTitle()}</span>
            </h2>
          </div>
          <div className="flex items-center gap-1 md:gap-4 shrink-0">
            <div className="relative" ref={messagesRef}>
              <button
                onClick={() => { setShowMessages(!showMessages); setShowNotifications(false); }}
                className={`p-2 rounded-xl transition-all ${showMessages ? 'bg-orange-50 text-orange-500 shadow-lg shadow-orange-500/10' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <Mail className="w-5 h-5" />
                {unreadCounts.messages > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white">
                    {unreadCounts.messages}
                  </span>
                )}
              </button>
              {showMessages && <MessageDropdown onClose={() => setShowMessages(false)} />}
            </div>

            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowMessages(false); }}
                className={`p-2 rounded-xl transition-all ${showNotifications ? 'bg-orange-50 text-orange-500 shadow-lg shadow-orange-500/10' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
              >
                <Bell className="w-5 h-5" />
                {unreadCounts.notifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center ring-2 ring-white animate-pulse">
                    {unreadCounts.notifications}
                  </span>
                )}
              </button>
              {showNotifications && <NotificationDropdown onClose={() => setShowNotifications(false)} />}
            </div>

            <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-slate-100 to-slate-200 border border-white rounded-[1rem] flex items-center justify-center text-slate-800 font-black shadow-sm shrink-0 text-sm md:text-base">
              {currentUser?.firstName?.[0] || 'U'}
            </div>
          </div>
        </header>

        <div className="flex-grow overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 custom-scrollbar bg-slate-50 w-full overflow-x-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
