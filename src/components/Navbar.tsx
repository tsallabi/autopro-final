import React, { useState, useEffect, useRef } from 'react';
import { Bell, Mail, Menu, X, LogOut, ChevronDown, Car, Calculator, Gavel, Search, LayoutDashboard, ShieldCheck, Wallet, Globe, User, Store } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useStore } from '../context/StoreContext';
import { AuthModal } from './AuthModal';
import { NotificationDropdown } from './NotificationDropdown';
import { MessageDropdown } from './MessageDropdown';
import { BranchSelector } from './BranchSelector';
import { useClickOutside } from '../hooks/useClickOutside';

const getNavLinks = (t: any) => [
  { label: t('nav.liveAuction'), href: '/marketplace?tab=live' },
  { label: t('nav.searchCars'), href: '/marketplace' },
  { label: t('nav.calculator'), href: '/calculator' },
  { label: t('nav.shipping'), href: '/shipping' },
];


export const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, setCurrentUser, branchConfig, unreadCounts } = useStore();
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'ar' ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
  };

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Refs for outside click detection
  const messagesRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(messagesRef, () => setShowMessages(false));
  useClickOutside(notificationsRef, () => setShowNotifications(false));
  useClickOutside(userDropdownRef, () => setShowDropdown(false));

  /* ── scroll effect ── */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // run once on mount
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ── close mobile on route change ── */
  useEffect(() => { setMobileOpen(false); setShowDropdown(false); }, [location.pathname]);

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('authToken');
    setShowDropdown(false);
    navigate('/');
  };

  const dashboardPath =
    currentUser?.role === 'admin' ? '/dashboard/admin' :
      currentUser?.role === 'seller' ? '/dashboard/seller' :
        '/dashboard/user';

  const isOnLanding = location.pathname === '/';

  /* ── glass class helper ── */
  const navClass = isOnLanding
    ? scrolled
      ? 'bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-black/30 border-b border-white/10'
      : 'bg-transparent backdrop-blur-0'
    : 'bg-slate-900 shadow-lg border-b border-slate-800';

  return (
    <>
      <nav
        dir={i18n.dir()}
        className="sticky top-0 z-[200] bg-slate-900 shadow-lg border-b border-slate-800 font-cairo"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

          {/* ── Logo ── */}
          <Link to="/" className="flex items-center gap-3 group shrink-0">
            <img 
              src="/logo_on_dark.png?v=3" 
              alt="Logo" 
              className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
            />
          </Link>

          {/* ── Desktop Nav ── */}
          <div className="hidden md:flex items-center gap-1">
            {getNavLinks(t).map(link => (
              <Link
                key={link.href}
                to={link.href}
                className="px-3 py-2 rounded-xl text-sm font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* ── Desktop Actions ── */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={toggleLanguage}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all border border-slate-700 mx-2"
            >
              <Globe className="w-4 h-4" />
              {i18n.language === 'ar' ? 'English' : 'عربي'}
            </button>

            <BranchSelector />

            {/* Messages */}
            <div className="relative" ref={messagesRef}>
              <button
                onClick={() => { setShowMessages(!showMessages); setShowNotifications(false); }}
                className={`p-2.5 rounded-xl transition-all relative ${showMessages ? 'bg-white/10 text-orange-400' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <Mail className="w-5 h-5" />
                {unreadCounts.messages > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full border border-slate-900" />
                )}
              </button>
              {showMessages && <MessageDropdown onClose={() => setShowMessages(false)} />}
            </div>

            {/* Notifications */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => { setShowNotifications(!showNotifications); setShowMessages(false); }}
                className={`p-2.5 rounded-xl transition-all relative ${showNotifications ? 'bg-white/10 text-orange-400' : 'text-slate-300 hover:text-white hover:bg-white/10'}`}
              >
                <Bell className="w-5 h-5" />
                {unreadCounts.notifications > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-slate-900" />
                )}
              </button>
              {showNotifications && <NotificationDropdown onClose={() => setShowNotifications(false)} />}
            </div>

            <div className="h-6 w-px bg-slate-700 mx-1" />

            {/* User / Login */}
            {currentUser ? (
              <div className="relative flex items-center gap-2" ref={userDropdownRef}>
                {/* Dashboard quick link */}
                <button
                  onClick={() => navigate(dashboardPath)}
                  className="flex items-center gap-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs font-black px-3 py-2 rounded-xl hover:bg-orange-500 hover:text-white transition-all"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  {t('nav.dashboard')}
                </button>

                {/* Avatar dropdown */}
                <button
                  onClick={() => setShowDropdown(!showDropdown)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 rounded-xl transition-colors"
                >
                  <div className="w-6 h-6 bg-orange-500 rounded-lg flex items-center justify-center text-[10px] font-black text-white">
                    {currentUser.role === 'seller' && currentUser.companyName ? currentUser.companyName[0] : (currentUser.firstName?.[0] || 'U')}
                  </div>
                  <span className="text-sm font-bold text-white max-w-[120px] truncate">
                    {currentUser.role === 'seller' && currentUser.companyName ? currentUser.companyName : (currentUser.firstName || t('nav.userFallback'))}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${showDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDropdown && (
                  <div className="absolute top-full mt-2 left-0 w-60 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-slate-800 z-50">
                    <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-orange-50 border-b border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{t('nav.accountType')}</p>
                      <p className="font-black text-slate-800 flex items-center gap-2">
                        {currentUser.role === 'admin' && <><ShieldCheck className="w-4 h-4 text-orange-500" /> {t('nav.admin')}</>}
                        {currentUser.role === 'seller' && <><Car className="w-4 h-4 text-blue-500" /> {t('nav.seller')}</>}
                        {currentUser.role === 'buyer' && <><LayoutDashboard className="w-4 h-4 text-green-500" /> {t('nav.buyer')}</>}
                      </p>
                    </div>
                    <Link to={dashboardPath} onClick={() => setShowDropdown(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 font-bold text-sm transition-colors">
                      <LayoutDashboard className="w-4 h-4 text-orange-500" />
                      {t('nav.dashboard')}
                    </Link>
                    {currentUser.role === 'admin' && (
                      <>
                        <Link to="/dashboard/user" onClick={() => setShowDropdown(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 font-bold text-sm transition-colors">
                          <User className="w-4 h-4 text-green-500" />
                          {t('nav.viewAsBuyer')}
                        </Link>
                        <Link to="/dashboard/seller" onClick={() => setShowDropdown(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 font-bold text-sm transition-colors">
                          <Store className="w-4 h-4 text-blue-500" />
                          {t('nav.viewAsSeller')}
                        </Link>
                      </>
                    )}
                    {currentUser?.role !== 'admin' && (
                      <Link to="/wallet" onClick={() => setShowDropdown(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-100 font-bold text-sm transition-colors">
                        <Wallet className="w-4 h-4 text-green-500" />
                        {t('nav.myWallet')}
                      </Link>
                    )}
                    <button onClick={handleLogout}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-red-50 text-red-600 font-bold text-sm transition-colors">
                      {t('nav.logout')}
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/auth"
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95"
              >
                {t('nav.loginRegister')}
              </Link>
            )}
          </div>

          {/* ── Mobile Hamburger ── */}
          <button
            title={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            className="md:hidden text-slate-300 hover:text-white p-2 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* ── Mobile Menu ── */}
        {mobileOpen && (
          <div className="md:hidden bg-slate-900/98 backdrop-blur-xl border-t border-white/10">
            <div className="px-4 pt-3 pb-5 space-y-1">
              {getNavLinks(t).map(link => (
                <Link key={link.href} to={link.href} onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 rounded-xl text-base font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                  {link.label}
                </Link>
              ))}

              <div className="border-t border-slate-700/50 pt-3 mt-3 space-y-1 px-4">
                <button
                  onClick={toggleLanguage}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-base font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors border border-slate-700/50"
                >
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5" />
                    <span>{i18n.language === 'ar' ? 'English' : 'اللغة العربية'}</span>
                  </div>
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <div className="border-t border-slate-700/50 pt-3 mt-3 space-y-1">
                {currentUser ? (
                  <>
                    <div className="px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-widest">
                      {t('nav.welcome')}، {currentUser.role === 'seller' && currentUser.companyName ? currentUser.companyName : (currentUser.firstName || t('nav.userFallback'))}
                    </div>
                    <Link to={dashboardPath} onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                      <LayoutDashboard className="w-5 h-5" />
                      {t('nav.dashboard')}
                    </Link>
                    <Link to={`${dashboardPath}?view=profile`} onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                      <User className="w-5 h-5" />
                      {t('nav.profile')}
                    </Link>
                    {currentUser.role === 'admin' && (
                      <>
                        <Link to="/dashboard/user" onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                          <User className="w-5 h-5 text-green-500" />
                          {t('nav.viewAsBuyer')}
                        </Link>
                        <Link to="/dashboard/seller" onClick={() => setMobileOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                          <Store className="w-5 h-5 text-blue-500" />
                          {t('nav.viewAsSeller')}
                        </Link>
                      </>
                    )}
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-bold text-red-400 hover:bg-red-500/10 transition-colors">
                      <LogOut className="w-5 h-5" />
                      {t('nav.logout')}
                    </button>
                  </>
                ) : (
                  <Link
                    to="/auth"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full bg-orange-500 text-white py-3 rounded-xl font-black text-base hover:bg-orange-600 transition-colors text-center"
                  >
                    {t('nav.loginRegister')}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
};
