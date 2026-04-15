import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { Car } from '../types';
import {
  LayoutGrid, List, Heart, Activity, Bell, Save, Filter,
  ChevronDown, ArrowUpRight, Search, SlidersHorizontal,
  MapPin, Shield, Clock, CheckCircle2, AlertCircle, X,
  Calendar, Gauge, Info, Gavel, User, Menu, Settings,
  Car as CarIcon, Mail, Laptop, Truck, BookOpen,
  Calculator as CalcIcon, Wallet, LayoutDashboard, Plus, Handshake,
  Droplets, Settings2, ShieldCheck, AlertTriangle, Star
} from 'lucide-react';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { MessageDropdown } from '../components/MessageDropdown';
import { useTranslation } from 'react-i18next';
import { CAR_MAKES_AND_MODELS } from '../data/carData';
import { DualRangeSlider } from '../components/DualRangeSlider';
import { FeaturedCarsBanner } from '../components/FeaturedCarsBanner';
import { useClickOutside } from '../hooks/useClickOutside';
import { useSavedSearches, SavedSearch } from '../hooks/useSavedSearches';

const ListCarTimer = ({ car }: { car: Car }) => {
  const [timeLeft, setTimeLeft] = useState('00:00:00');

  useEffect(() => {
    const updateCountdown = () => {
      let targetTime = 0;
      if (car.status === 'upcoming' && car.auctionStartTime) {
        targetTime = new Date(car.auctionStartTime).getTime();
      } else if (car.status === 'live' && car.auctionEndDate) {
        targetTime = new Date(car.auctionEndDate).getTime();
      }

      if (!targetTime) {
        setTimeLeft('لا يوجد موعد');
        return;
      }

      const diff = targetTime - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00:00');
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [car]);

  return (
    <div className="flex items-center gap-2 text-rose-600">
      <Clock className="w-4 h-4" />
      <span className="text-sm font-black font-mono">{timeLeft}</span>
    </div>
  );
};

export const Home = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { cars, watchlist, toggleWatchlist, currentUser, unreadCounts, users, exchangeRate } = useStore();
  const { t } = useTranslation();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Saved searches
  const { searches: savedSearches, save: saveSearch, remove: removeSavedSearch } = useSavedSearches();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchEmailAlerts, setSaveSearchEmailAlerts] = useState(true);
  const [saveSearchFrequency, setSaveSearchFrequency] = useState<'instant' | 'daily' | 'weekly'>('instant');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'events' | 'saved'>('events');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isDesktopMoreOpen, setIsDesktopMoreOpen] = useState(false);
  const [isMyAuctionsOpen, setIsMyAuctionsOpen] = useState(true);

  // Advanced Filter States
  const [activeFilterPopover, setActiveFilterPopover] = useState<string | null>(null);
  const [filterMake, setFilterMake] = useState<string>('');
  const [filterModel, setFilterModel] = useState<string>('');
  const [filterYearMin, setFilterYearMin] = useState<number | ''>('');
  const [filterYearMax, setFilterYearMax] = useState<number | ''>('');
  const [filterMileageMin, setFilterMileageMin] = useState<number | ''>('');
  const [filterMileageMax, setFilterMileageMax] = useState<number | ''>('');
  const [filterPriceMin, setFilterPriceMin] = useState<number | ''>('');
  const [filterPriceMax, setFilterPriceMax] = useState<number | ''>('');
  const [filterAuctionTypes, setFilterAuctionTypes] = useState<string[]>([]);
  const [filterDriveTypes, setFilterDriveTypes] = useState<string[]>([]);
  const [filterBodyTypes, setFilterBodyTypes] = useState<string[]>([]);
  const [filterFuelTypes, setFilterFuelTypes] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'ending_soonest' | 'recommended' | 'priced_to_sell'>('ending_soonest');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [displayCount, setDisplayCount] = useState(24);

  // Reset pagination when filters/search change
  useEffect(() => {
    setDisplayCount(24);
  }, [searchTerm, filterMake, filterModel, filterYearMin, filterYearMax, filterMileageMin, filterMileageMax, filterPriceMin, filterPriceMax, filterAuctionTypes, filterDriveTypes, filterBodyTypes, filterFuelTypes, sortBy]);

  // Refs for outside click detection
  const messagesRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useClickOutside(messagesRef, () => setShowMessages(false));
  useClickOutside(notificationsRef, () => setShowNotifications(false));
  useClickOutside(userDropdownRef, () => setShowUserDropdown(false));
  useClickOutside(filtersRef, () => setActiveFilterPopover(null));
  useClickOutside(moreRef, () => setIsDesktopMoreOpen(false));
  useClickOutside(sortRef, () => setIsSortOpen(false));

  // Scroll Logic for Mobile FABs
  const [isScrollingDown, setIsScrollingDown] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isMobileSortOpen, setIsMobileSortOpen] = useState(false);

  const clearAllFilters = () => {
    setSearchTerm('');
    setSearchInput('');
    setFilterMake('');
    setFilterModel('');
    setFilterYearMin('');
    setFilterYearMax('');
    setFilterMileageMin('');
    setFilterMileageMax('');
    setFilterPriceMin('');
    setFilterPriceMax('');
    setFilterAuctionTypes([]);
    setFilterDriveTypes([]);
    setFilterBodyTypes([]);
    setFilterFuelTypes([]);
    setSortBy('ending_soonest');

    // Clear URL params too
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'all');
    newParams.delete('search');
    newParams.delete('make');
    setSearchParams(newParams);

    setIsMobileMenuOpen(false);
    setIsBottomSheetOpen(false);
    setIsDesktopMoreOpen(false);
    setActiveFilterPopover(null);
  };

  // Read filters FROM URL on mount
  const didHydrateFromUrl = useRef(false);
  useEffect(() => {
    if (didHydrateFromUrl.current) return;
    didHydrateFromUrl.current = true;
    const p = searchParams;
    const getArr = (k: string) => {
      const v = p.get(k);
      return v ? v.split(',').filter(Boolean) : [];
    };
    const getNum = (k: string): number | '' => {
      const v = p.get(k);
      if (v === null || v === '') return '';
      const n = Number(v);
      return isNaN(n) ? '' : n;
    };
    const s = p.get('search') || '';
    if (s) { setSearchInput(s); setSearchTerm(s); }
    const mk = p.get('make') || '';
    if (mk && mk !== 'all') setFilterMake(mk);
    const md = p.get('model') || '';
    if (md) setFilterModel(md);
    const yMin = getNum('minYear'); if (yMin !== '') setFilterYearMin(yMin);
    const yMax = getNum('maxYear'); if (yMax !== '') setFilterYearMax(yMax);
    const pMin = getNum('minPrice'); if (pMin !== '') setFilterPriceMin(pMin);
    const pMax = getNum('maxPrice'); if (pMax !== '') setFilterPriceMax(pMax);
    const mMin = getNum('minMileage'); if (mMin !== '') setFilterMileageMin(mMin);
    const mMax = getNum('maxMileage'); if (mMax !== '') setFilterMileageMax(mMax);
    const at = getArr('auctionTypes'); if (at.length) setFilterAuctionTypes(at);
    const dt = getArr('driveTypes'); if (dt.length) setFilterDriveTypes(dt);
    const bt = getArr('bodyTypes'); if (bt.length) setFilterBodyTypes(bt);
    const ft = getArr('fuelTypes'); if (ft.length) setFilterFuelTypes(ft);
    const sb = p.get('sortBy');
    if (sb === 'recommended' || sb === 'priced_to_sell' || sb === 'ending_soonest') setSortBy(sb);
    const vm = p.get('viewMode');
    if (vm === 'grid' || vm === 'list') setViewMode(vm);
  }, []);

  // Write filters TO URL on change
  useEffect(() => {
    if (!didHydrateFromUrl.current) return;
    const p = new URLSearchParams(searchParams);
    const setOrDel = (k: string, v: string | number | '' | undefined | null) => {
      if (v === '' || v === undefined || v === null) p.delete(k);
      else p.set(k, String(v));
    };
    const setArrOrDel = (k: string, arr: string[]) => {
      if (!arr || arr.length === 0) p.delete(k);
      else p.set(k, arr.join(','));
    };
    setOrDel('search', searchTerm);
    setOrDel('make', filterMake);
    setOrDel('model', filterModel);
    setOrDel('minYear', filterYearMin);
    setOrDel('maxYear', filterYearMax);
    setOrDel('minPrice', filterPriceMin);
    setOrDel('maxPrice', filterPriceMax);
    setOrDel('minMileage', filterMileageMin);
    setOrDel('maxMileage', filterMileageMax);
    setArrOrDel('auctionTypes', filterAuctionTypes);
    setArrOrDel('driveTypes', filterDriveTypes);
    setArrOrDel('bodyTypes', filterBodyTypes);
    setArrOrDel('fuelTypes', filterFuelTypes);
    if (sortBy && sortBy !== 'ending_soonest') p.set('sortBy', sortBy); else p.delete('sortBy');
    if (viewMode && viewMode !== 'list') p.set('viewMode', viewMode); else p.delete('viewMode');
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, filterMake, filterModel, filterYearMin, filterYearMax, filterPriceMin, filterPriceMax,
      filterMileageMin, filterMileageMax, filterAuctionTypes, filterDriveTypes, filterBodyTypes,
      filterFuelTypes, sortBy, viewMode]);

  // Save / Apply / compute active filter list
  const currentFiltersSnapshot = () => ({
    searchTerm, filterMake, filterModel,
    filterYearMin, filterYearMax, filterPriceMin, filterPriceMax,
    filterMileageMin, filterMileageMax,
    filterAuctionTypes, filterDriveTypes, filterBodyTypes, filterFuelTypes,
    sortBy, activeTab: searchParams.get('tab') || 'all', viewMode,
  });

  const applySavedSearch = (s: SavedSearch) => {
    const f = s.filters || {};
    setSearchInput(f.searchTerm || '');
    setSearchTerm(f.searchTerm || '');
    setFilterMake(f.filterMake || '');
    setFilterModel(f.filterModel || '');
    setFilterYearMin(f.filterYearMin ?? '');
    setFilterYearMax(f.filterYearMax ?? '');
    setFilterPriceMin(f.filterPriceMin ?? '');
    setFilterPriceMax(f.filterPriceMax ?? '');
    setFilterMileageMin(f.filterMileageMin ?? '');
    setFilterMileageMax(f.filterMileageMax ?? '');
    setFilterAuctionTypes(f.filterAuctionTypes || []);
    setFilterDriveTypes(f.filterDriveTypes || []);
    setFilterBodyTypes(f.filterBodyTypes || []);
    setFilterFuelTypes(f.filterFuelTypes || []);
    setSortBy(f.sortBy || 'ending_soonest');
    if (f.viewMode === 'grid' || f.viewMode === 'list') setViewMode(f.viewMode);
    if (f.activeTab) {
      const np = new URLSearchParams(searchParams);
      np.set('tab', f.activeTab);
      setSearchParams(np);
    }
  };

  const handleSaveSearchConfirm = async () => {
    const name = saveSearchName.trim();
    if (!name) return;
    const loggedIn = !!currentUser;
    try {
      await saveSearch(name, currentFiltersSnapshot(), {
        emailAlerts: saveSearchEmailAlerts,
        alertFrequency: saveSearchFrequency,
      });
      if (!loggedIn && saveSearchEmailAlerts) {
        // Gentle prompt: let the user know they need to log in for email alerts
        try {
          // eslint-disable-next-line no-alert
          alert('تم حفظ البحث محلياً. لتفعيل تنبيهات البريد، يرجى تسجيل الدخول.');
        } catch {}
      }
    } catch {}
    setSaveSearchName('');
    setSaveSearchEmailAlerts(true);
    setSaveSearchFrequency('instant');
    setShowSaveModal(false);
    setActiveSidebarTab('saved');
  };

  useEffect(() => {
    const handleScroll = () => {
      if (typeof window !== 'undefined') {
        if (window.scrollY > lastScrollY && window.scrollY > 100) {
          setIsScrollingDown(true);
        } else if (window.scrollY < lastScrollY) {
          setIsScrollingDown(false);
        }
        setLastScrollY(window.scrollY);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Use URL for tab state
  const activeTab = searchParams.get('tab') || 'all';

  const handleTabChange = (tabId: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tabId);
    setSearchParams(newParams);
  };

  // Filters logic
  // Filters logic
  const filteredCars = (cars || []).filter(car => {
    if (!car) return false;

    const urlSearch = searchParams.get('search')?.toLowerCase() || '';
    const urlMake = searchParams.get('make')?.toLowerCase() || 'all';

    const effectiveSearch = (searchTerm || urlSearch).toLowerCase().trim();
    const anyCar = car as any;
    const searchableText = [
      car.make, car.model, car.lotNumber, car.year,
      anyCar.vin, anyCar.trim, anyCar.primaryDamage, anyCar.damage,
      anyCar.location, anyCar.notes,
    ].filter(Boolean).map((v: any) => String(v).toLowerCase()).join(' ');
    const matchesSearch = !effectiveSearch || searchableText.includes(effectiveSearch);

    let matchesTab = true;
    if (activeTab === 'all') matchesTab = ['live', 'upcoming', 'offer_market', 'closed'].includes(car.status);
    if (activeTab === 'live') matchesTab = car.status === 'live';
    if (activeTab === 'watchlist') matchesTab = (watchlist || []).some((w: any) => w.carId === car.id);
    if (activeTab === 'upcoming') matchesTab = car.status === 'upcoming';
    if (activeTab === 'offer_market') matchesTab = car.status === 'offer_market';
    if (activeTab === 'closed') matchesTab = car.status === 'closed';

    // Additional Brand Filter from URL or Advanced Filter Menu
    const isUrlMakeMatching = urlMake === 'all' || car.make?.toLowerCase() === urlMake;
    const isStateMakeMatching = !filterMake || filterMake === 'all' || car.make?.toLowerCase() === filterMake.toLowerCase();
    const isStateModelMatching = !filterModel || filterModel === 'all' || car.model?.toLowerCase() === filterModel.toLowerCase();

    // Advanced Numeric Range Filters
    const carYear = car.year || 0;
    const isYearMinMatching = filterYearMin === '' || carYear >= Number(filterYearMin);
    const isYearMaxMatching = filterYearMax === '' || carYear <= Number(filterYearMax);

    const carMileage = car.odometer || (car as any).mileage || 0;
    const isMileageMinMatching = filterMileageMin === '' || carMileage >= Number(filterMileageMin);
    const isMileageMaxMatching = filterMileageMax === '' || carMileage <= Number(filterMileageMax);

    const carPrice = car.currentBid || car.buyItNow || car.reservePrice || (car as any).buyNowPrice || (car as any).originalPrice || 0;
    const isPriceMinMatching = filterPriceMin === '' || carPrice >= Number(filterPriceMin);
    const isPriceMaxMatching = filterPriceMax === '' || carPrice <= Number(filterPriceMax);

    // Advanced Checkboxes Filters
    // When a filter is set but the car lacks the field, EXCLUDE it (no fallback pollution)
    const carAuctionType = (car as any).auctionType;
    const isAuctionTypeMatching = filterAuctionTypes.length === 0 || (!!carAuctionType && filterAuctionTypes.includes(carAuctionType));
    const carDriveType = (car as any).driveType;
    const isDriveTypeMatching = filterDriveTypes.length === 0 || (!!carDriveType && filterDriveTypes.includes(carDriveType));
    const carBodyType = (car as any).bodyType;
    const isBodyTypeMatching = filterBodyTypes.length === 0 || (!!carBodyType && filterBodyTypes.includes(carBodyType));
    const carFuelType = (car as any).fuelType;
    const isFuelTypeMatching = filterFuelTypes.length === 0 || (!!carFuelType && filterFuelTypes.includes(carFuelType));

    return matchesSearch && matchesTab && isUrlMakeMatching && isStateMakeMatching && isStateModelMatching &&
      isYearMinMatching && isYearMaxMatching && isMileageMinMatching && isMileageMaxMatching &&
      isPriceMinMatching && isPriceMaxMatching && isAuctionTypeMatching &&
      isDriveTypeMatching && isBodyTypeMatching && isFuelTypeMatching;
  }).sort((a, b) => {
    if (sortBy === 'recommended') {
      return ((b as any).isRecommended ? 1 : 0) - ((a as any).isRecommended ? 1 : 0);
    } else if (sortBy === 'priced_to_sell') {
      const aPrice = a.buyItNow || a.currentBid || 0;
      const bPrice = b.buyItNow || b.currentBid || 0;
      return aPrice - bPrice;
    }
    // Default: ending_soonest
    const aEnd = a.auctionEndDate ? new Date(a.auctionEndDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bEnd = b.auctionEndDate ? new Date(b.auctionEndDate).getTime() : Number.MAX_SAFE_INTEGER;

    // For closed auctions, sort by inverse of end date (most recently closed first)
    if (activeTab === 'closed') {
      return bEnd - aEnd;
    }

    return aEnd - bEnd;
  });

  const categories = [
    { id: 'marketplace', label: t('home.categories.carMarket'), icon: CarIcon, path: '/marketplace' },
    { id: 'offer_market', label: t('home.categories.offersMarket'), icon: Handshake, path: currentUser?.role === 'admin' ? '/dashboard/admin?view=marketplace_management' : '/marketplace?tab=offer_market' },
    { id: 'reports', label: t('home.categories.marketReports'), icon: BookOpen, path: currentUser?.role === 'admin' ? '/dashboard/admin?view=reports' : '/dashboard/user?view=services' },
    { id: 'capital', label: t('home.categories.financeWallet'), icon: Wallet, path: currentUser?.role === 'admin' ? '/dashboard/admin?view=financial_ledger' : '/dashboard/user?view=wallet' },
    { id: 'shipping', label: t('home.categories.shippingServices'), icon: Truck, path: currentUser?.role === 'admin' ? '/dashboard/admin?view=logistics' : '/dashboard/user?view=logistics' },
  ];

  const handleCategoryClick = (cat: any) => {
    if (!currentUser && cat.id !== 'marketplace') {
      navigate('/auth');
      return;
    }
    navigate(cat.path);
  };

  const handleBidClick = (car: Car) => {
    navigate(`/car-details/${car.id}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-cairo text-slate-900" dir="rtl">
      {/* --- TOP FULL-WIDTH HEADER --- */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-[101] shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger (Mobile Only) */}
            <button
              title="القائمة الجانبية"
              aria-label="القائمة الجانبية"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 hover:text-orange-500 transition-colors mr-2"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Logo */}
            <div onClick={() => navigate('/')} className="flex items-center gap-2 cursor-pointer group shrink-0">
              <img
                src="/logo_on_white.jpg?v=4"
                alt="AutoPro"
                className="h-8 lg:h-10 w-auto object-contain transition-transform group-hover:scale-110"
              />
            </div>

            {/* Navigation Links — only on xl+ to avoid crowding */}
            <nav className="hidden xl:flex items-center gap-0.5">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat)}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-950 transition-all whitespace-nowrap"
                >
                  {cat.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* Action Buttons — hidden on mobile to avoid crowding navbar */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-1 rounded-2xl">
              <div className="relative" ref={messagesRef}>
                <button
                  title="الرسائل"
                  aria-label="عرض الرسائل"
                  onClick={() => { setShowMessages(!showMessages); setShowNotifications(false); }}
                  className={`p-2.5 rounded-xl transition-all relative ${showMessages ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Mail className="w-5 h-5" />
                  {unreadCounts.messages > 0 && (
                    <span className="absolute top-2 right-2 w-4 h-4 bg-orange-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white">
                      {unreadCounts.messages}
                    </span>
                  )}
                </button>
                {showMessages && <MessageDropdown onClose={() => setShowMessages(false)} />}
              </div>

              <div className="relative" ref={notificationsRef}>
                <button
                  title="الإشعارات"
                  aria-label="عرض الإشعارات"
                  onClick={() => { setShowNotifications(!showNotifications); setShowMessages(false); }}
                  className={`p-2.5 rounded-xl transition-all relative ${showNotifications ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCounts.notifications > 0 && (
                    <span className="absolute top-2 right-2 w-4 h-4 bg-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                      {unreadCounts.notifications}
                    </span>
                  )}
                </button>
                {showNotifications && <NotificationDropdown onClose={() => setShowNotifications(false)} />}
              </div>
            </div>

            {/* User Profile / Login */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <div className="relative" ref={userDropdownRef}>
                  <button
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="flex items-center gap-2 bg-slate-900 text-white px-3 py-1.5 rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                  >
                    <div className="w-7 h-7 bg-orange-500 rounded-xl flex items-center justify-center font-black text-sm shrink-0">
                      {currentUser.firstName[0]}
                    </div>
                    <div className="text-right hidden xl:block">
                      <div className="text-xs font-black leading-none">{currentUser.firstName}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-0.5">{currentUser.role}</div>
                    </div>
                  </button>

                  {showUserDropdown && (
                    <div className="absolute left-0 mt-3 w-56 bg-white rounded-3xl shadow-2xl border border-slate-100 p-2 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                      <button
                        onClick={() => navigate(currentUser.role === 'admin' ? '/dashboard/admin' : '/dashboard/user')}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-2xl transition-colors"
                      >
                        <LayoutDashboard className="w-4 h-4 text-orange-500" />
                        {t('nav.dashboard')}
                      </button>
                      <button onClick={() => navigate('/dashboard/user?view=profile')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-2xl transition-colors">
                        <User className="w-4 h-4 text-slate-400" />
                        الملف الشخصي
                      </button>
                      <button onClick={() => navigate('/dashboard/user?view=settings')} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-2xl transition-colors">
                        <Settings className="w-4 h-4 text-slate-400" />
                        الإعدادات
                      </button>
                      <div className="h-px bg-slate-50 my-1"></div>
                      <button onClick={() => { localStorage.removeItem('currentUser'); window.location.reload(); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-50 rounded-2xl transition-colors">
                        <Activity className="w-4 h-4" />
                        {t('nav.logout')}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => navigate(
                    currentUser.role === 'admin' ? '/dashboard/admin' :
                      currentUser.role === 'seller' ? '/dashboard/seller' :
                        '/dashboard/user'
                  )}
                  className="hidden lg:flex items-center gap-1.5 bg-orange-500 text-white text-xs font-black px-3 py-2 rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-orange-500/20"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  {t('nav.dashboard')}
                </button>
              </div>
            ) : (
              <button onClick={() => navigate('/auth')} className="hidden sm:block bg-orange-600 text-white px-6 py-2.5 rounded-2xl font-black text-sm hover:bg-orange-700 transition-all shadow-lg shadow-orange-500/20 active:scale-95">
                {t('nav.loginRegister')}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* --- TOP SEARCH & QUICK FILTERS BAR (Desktop Only) --- */}
      <div className="hidden lg:block bg-white border-b border-slate-200 sticky top-[64px] z-[100]">
        <div className="max-w-[1920px] mx-auto px-6 py-1 flex items-center gap-6 relative">
          {/* Main Search */}
          <div className="relative flex-1 max-w-2xl group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
            <input
              type="text"
              placeholder={t('home.search.placeholder')}
              className="w-full bg-white border-2 border-slate-200 rounded-lg py-2.5 pr-12 pl-4 outline-none focus:border-orange-500 focus:shadow-[0_0_0_4px_rgba(249,115,22,0.1)] transition-all text-sm font-bold placeholder:text-slate-400 hover:border-slate-300"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-2" ref={filtersRef}>
            {/* Make & Model Popover */}
            <div className="relative">
              <button onClick={() => setActiveFilterPopover(activeFilterPopover === 'make' ? null : 'make')} className={`px-4 py-2.5 border rounded-lg text-sm font-bold transition-all whitespace-nowrap shadow-sm hover:shadow active:scale-95 flex items-center gap-1 ${activeFilterPopover === 'make' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
                {filterMake || 'الشركة والموديل'} {filterMake && filterModel && ` - ${filterModel}`}
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
              {activeFilterPopover === 'make' && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 w-80 bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 p-5 flex flex-col z-[150] animate-in fade-in slide-in-from-top-4 overflow-hidden">
                  <h3 className="font-black text-slate-900 text-base mb-4">الشركة والموديل (Make & Model)</h3>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                    {Object.keys(CAR_MAKES_AND_MODELS).map(make => (
                      <div key={make} className="space-y-1">
                        <label className="flex items-center justify-between cursor-pointer group p-2 hover:bg-slate-50 rounded-xl transition-colors">
                          <div className="flex items-center gap-3">
                            <input type="radio" name="make_filter" checked={filterMake === make} onChange={() => { setFilterMake(make); setFilterModel(''); }} className="hidden peer" />
                            <div className="w-5 h-5 rounded-md border-2 border-slate-300 peer-checked:bg-orange-600 peer-checked:border-orange-600 flex items-center justify-center transition-all bg-white">
                              <CheckCircle2 className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-sm font-bold text-slate-700 peer-checked:text-slate-900">{make}</span>
                          </div>
                          <ChevronDown className={`w-4 h-4 transition-transform ${filterMake === make ? 'rotate-180 text-orange-500' : 'text-slate-300'}`} />
                        </label>
                        {filterMake === make && (
                          <div className="pl-9 pr-4 py-2 space-y-3 bg-slate-50 rounded-xl mt-1 mb-2 shadow-inner">
                            {(CAR_MAKES_AND_MODELS[make] || []).map((mdl) => (
                              <label key={mdl} className="flex items-center gap-3 cursor-pointer group">
                                <input type="radio" name="model_filter" checked={filterModel === mdl} onChange={() => setFilterModel(mdl)} className="hidden peer" />
                                <div className="w-4 h-4 rounded-full border-2 border-slate-300 peer-checked:border-4 peer-checked:border-orange-500 bg-white transition-all"></div>
                                <span className="text-xs font-bold text-slate-600 peer-checked:text-slate-900">{mdl}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between">
                    <button onClick={() => { setFilterMake(''); setFilterModel(''); }} className="text-xs font-black text-slate-500 hover:text-slate-900">تفريغ (Clear)</button>
                    <button onClick={() => setActiveFilterPopover(null)} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-black text-xs hover:bg-orange-700 active:scale-95 transition-all shadow-lg shadow-orange-500/20">تم (Done)</button>
                  </div>
                </div>
              )}
            </div>

            {/* Price Popover */}
            <div className="relative">
              <button onClick={() => setActiveFilterPopover(activeFilterPopover === 'price' ? null : 'price')} className={`px-4 py-2.5 border rounded-lg text-sm font-bold transition-all whitespace-nowrap shadow-sm hover:shadow active:scale-95 flex items-center gap-1 ${activeFilterPopover === 'price' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
                {filterPriceMin || filterPriceMax ? `${filterPriceMin || 0}$ - ${filterPriceMax || '1M+'}$` : 'السعر'}
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
              {activeFilterPopover === 'price' && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 w-80 bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 p-6 flex flex-col z-[150] animate-in fade-in slide-in-from-top-4 overflow-hidden">
                  <h3 className="font-black text-slate-900 text-base mb-6">السعر (Price)</h3>

                  <div className="mb-8">
                    <DualRangeSlider
                      min={0} max={150000} step={500}
                      value={[Number(filterPriceMin) || 0, Number(filterPriceMax) || 150000]}
                      onChange={(val) => { setFilterPriceMin(val[0]); setFilterPriceMax(val[1]); }}
                    />
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-orange-500 transition-colors">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Min Price</div>
                      <div className="flex items-center gap-1 text-slate-900 font-bold overflow-hidden">
                        <span className="text-xs text-slate-400">$</span>
                        <input type="number" min="0" placeholder="0" className="w-full outline-none bg-transparent font-mono" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value ? Number(e.target.value) : '')} />
                      </div>
                    </div>
                    <div className="flex-1 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-orange-500 transition-colors">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Max Price</div>
                      <div className="flex items-center gap-1 text-slate-900 font-bold overflow-hidden">
                        <span className="text-xs text-slate-400">$</span>
                        <input type="number" min="0" placeholder="100,000+" className="w-full outline-none bg-transparent font-mono" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value ? Number(e.target.value) : '')} />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
                    <button onClick={() => { setFilterPriceMin(''); setFilterPriceMax(''); }} className="text-xs font-black text-slate-500 hover:text-slate-900">تفريغ (Clear)</button>
                    <button onClick={() => setActiveFilterPopover(null)} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-black text-xs hover:bg-orange-700 active:scale-95 transition-all shadow-lg shadow-orange-500/20">تم (Done)</button>
                  </div>
                </div>
              )}
            </div>

            {/* Year Popover */}
            <div className="relative">
              <button onClick={() => setActiveFilterPopover(activeFilterPopover === 'year' ? null : 'year')} className={`px-4 py-2.5 border rounded-lg text-sm font-bold transition-all whitespace-nowrap shadow-sm hover:shadow active:scale-95 flex items-center gap-1 ${activeFilterPopover === 'year' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
                {filterYearMin || filterYearMax ? `${filterYearMin || '<1901'} - ${filterYearMax || '2027'}` : 'السنة'}
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
              {activeFilterPopover === 'year' && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 w-80 bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 p-6 flex flex-col z-[150] animate-in fade-in slide-in-from-top-4 overflow-hidden">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="font-black text-slate-900 text-base">السنة (Year)</h3>
                    <button className="text-[10px] font-black text-blue-600 hover:text-blue-800">Switch By Year</button>
                  </div>

                  <div className="mb-8">
                    <DualRangeSlider
                      min={1990} max={2027} step={1}
                      value={[Number(filterYearMin) || 1990, Number(filterYearMax) || 2027]}
                      onChange={(val) => { setFilterYearMin(val[0]); setFilterYearMax(val[1]); }}
                    />
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-orange-500 transition-colors">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Min Year</div>
                      <input type="number" min="1901" max="2027" placeholder="<1901" className="w-full outline-none bg-transparent text-slate-900 font-bold font-mono text-sm" value={filterYearMin} onChange={e => setFilterYearMin(e.target.value ? Number(e.target.value) : '')} />
                    </div>
                    <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-orange-500 transition-colors">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Max Year</div>
                      <input type="number" min="1901" max="2027" placeholder="2027" className="w-full outline-none bg-transparent text-slate-900 font-bold font-mono text-sm" value={filterYearMax} onChange={e => setFilterYearMax(e.target.value ? Number(e.target.value) : '')} />
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
                    <button onClick={() => { setFilterYearMin(''); setFilterYearMax(''); }} className="text-xs font-black text-slate-500 hover:text-slate-900">تفريغ (Clear)</button>
                    <button onClick={() => setActiveFilterPopover(null)} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-black text-xs hover:bg-orange-700 active:scale-95 transition-all shadow-lg shadow-orange-500/20">تم (Done)</button>
                  </div>
                </div>
              )}
            </div>

            {/* Mileage Popover */}
            <div className="relative">
              <button onClick={() => setActiveFilterPopover(activeFilterPopover === 'mileage' ? null : 'mileage')} className={`px-4 py-2.5 border rounded-lg text-sm font-bold transition-all whitespace-nowrap shadow-sm hover:shadow active:scale-95 flex items-center gap-1 ${activeFilterPopover === 'mileage' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
                {filterMileageMin || filterMileageMax ? `${filterMileageMin || 0} - ${filterMileageMax || 'مفتوح'}` : 'المسافة'}
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
              {activeFilterPopover === 'mileage' && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 w-80 bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 p-6 flex flex-col z-[150] animate-in fade-in slide-in-from-top-4 overflow-hidden">
                  <h3 className="font-black text-slate-900 text-base mb-6">المسافة (Mileage)</h3>

                  <div className="mb-8">
                    <DualRangeSlider
                      min={0} max={300000} step={5000}
                      value={[Number(filterMileageMin) || 0, Number(filterMileageMax) || 300000]}
                      onChange={(val) => { setFilterMileageMin(val[0]); setFilterMileageMax(val[1]); }}
                    />
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-orange-500 transition-colors">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Min Miles</div>
                      <input type="number" min="0" placeholder="0" className="w-full outline-none bg-transparent text-slate-900 font-bold font-mono text-sm" value={filterMileageMin} onChange={e => setFilterMileageMin(e.target.value ? Number(e.target.value) : '')} />
                    </div>
                    <div className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200 focus-within:border-orange-500 transition-colors">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Max Miles</div>
                      <input type="number" min="0" placeholder="100k+" className="w-full outline-none bg-transparent text-slate-900 font-bold font-mono text-sm" value={filterMileageMax} onChange={e => setFilterMileageMax(e.target.value ? Number(e.target.value) : '')} />
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-100 flex items-center justify-between">
                    <button onClick={() => { setFilterMileageMin(''); setFilterMileageMax(''); }} className="text-xs font-black text-slate-500 hover:text-slate-900">تفريغ (Clear)</button>
                    <button onClick={() => setActiveFilterPopover(null)} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-black text-xs hover:bg-orange-700 active:scale-95 transition-all shadow-lg shadow-orange-500/20">تم (Done)</button>
                  </div>
                </div>
              )}
            </div>

            {/* Auction Type Popover */}
            <div className="relative">
              <button onClick={() => setActiveFilterPopover(activeFilterPopover === 'auctionType' ? null : 'auctionType')} className={`px-4 py-2.5 border rounded-lg text-sm font-bold transition-all whitespace-nowrap shadow-sm hover:shadow active:scale-95 flex items-center gap-1 ${activeFilterPopover === 'auctionType' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>
                {filterAuctionTypes.length > 0 ? `نوع المزاد (${filterAuctionTypes.length})` : 'نوع المزاد'}
                <ChevronDown className="w-4 h-4 opacity-50" />
              </button>
              {activeFilterPopover === 'auctionType' && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 w-80 bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 p-6 flex flex-col z-[150] animate-in fade-in slide-in-from-top-4 overflow-hidden">
                  <h3 className="font-black text-slate-900 text-base mb-4">نوع المزاد (Auction Type)</h3>

                  <div className="space-y-2">
                    {['بيع مباشر', 'سعر احتياطي', 'اشتري الآن', 'تصفية معارض', 'سيارات الخليج', 'Ready to Sell', 'Live Appraisal'].map(opt => (
                      <label key={opt} className="flex items-center gap-3 cursor-pointer group hover:bg-slate-50 p-2 rounded-xl transition-colors">
                        <input
                          type="checkbox"
                          checked={filterAuctionTypes.includes(opt)}
                          className="hidden peer"
                          onChange={(e) => {
                            if (e.target.checked) setFilterAuctionTypes([...filterAuctionTypes, opt]);
                            else setFilterAuctionTypes(filterAuctionTypes.filter(a => a !== opt));
                          }}
                        />
                        <div className="w-5 h-5 rounded-md border-2 border-slate-300 peer-checked:bg-orange-600 peer-checked:border-orange-600 flex items-center justify-center transition-all bg-white">
                          <CheckCircle2 className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                        </div>
                        <span className="text-sm font-bold text-slate-700 peer-checked:text-slate-900">{opt}</span>
                      </label>
                    ))}
                  </div>

                  <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between">
                    <button onClick={() => setFilterAuctionTypes([])} className="text-xs font-black text-slate-500 hover:text-slate-900">تفريغ (Clear)</button>
                    <button onClick={() => setActiveFilterPopover(null)} className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-black text-xs hover:bg-orange-700 active:scale-95 transition-all shadow-lg shadow-orange-500/20">تم (Done)</button>
                  </div>
                </div>
              )}
            </div>

            {/* Sort Select */}
            <div className="relative border-l border-slate-200 pl-2 ml-2" ref={sortRef}>
              <button onClick={() => setIsSortOpen(!isSortOpen)} className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95 ${isSortOpen ? 'bg-slate-900 text-white shadow-slate-900/20' : 'bg-slate-900 text-white hover:bg-slate-800 hover:shadow'}`}>
                ترتيب <SlidersHorizontal className="w-4 h-4" />
              </button>
              {isSortOpen && (
                <div className="absolute top-[calc(100%+0.5rem)] right-0 w-60 bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 p-3 flex flex-col z-[150] animate-in fade-in slide-in-from-top-4 overflow-hidden">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest px-3 py-2 mb-1 block">Sort Options</span>
                  <button onClick={() => { setSortBy('ending_soonest'); setIsSortOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all text-sm font-bold ${sortBy === 'ending_soonest' ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center p-[2px]">
                      {sortBy === 'ending_soonest' && <div className="w-full h-full bg-orange-600 rounded-full"></div>}
                    </div>
                    ينتهي أولاً (Ending Soonest)
                  </button>
                  <button onClick={() => { setSortBy('recommended'); setIsSortOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all text-sm font-bold ${sortBy === 'recommended' ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center p-[2px]">
                      {sortBy === 'recommended' && <div className="w-full h-full bg-orange-600 rounded-full"></div>}
                    </div>
                    مُوصى به (Recommended)
                  </button>
                  <button onClick={() => { setSortBy('priced_to_sell'); setIsSortOpen(false); }} className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all text-sm font-bold ${sortBy === 'priced_to_sell' ? 'bg-orange-50 text-orange-700' : 'hover:bg-slate-50 text-slate-700'}`}>
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center p-[2px]">
                      {sortBy === 'priced_to_sell' && <div className="w-full h-full bg-orange-600 rounded-full"></div>}
                    </div>
                    سعر منافس (Priced to Sell)
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <button onClick={() => setIsDesktopMoreOpen(!isDesktopMoreOpen)} className={`px-4 py-2.5 border rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95 ${isDesktopMoreOpen ? 'bg-slate-900 border-slate-900 text-white shadow-slate-900/20' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 hover:shadow'}`}>
                المزيد <SlidersHorizontal className="w-4 h-4" />
              </button>
              {isDesktopMoreOpen && (
                <div className="absolute top-[calc(100%+0.5rem)] left-0 w-[600px] bg-white rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 flex flex-col z-[150] animate-in fade-in slide-in-from-top-4 overflow-hidden">
                  <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-black text-xl text-slate-900 flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5 text-orange-500" /> الفلاتر المتقدمة
                    </h3>
                    <button title="إغلاق الشاشة" aria-label="إغلاق الشاشة" onClick={() => setIsDesktopMoreOpen(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500 hover:text-slate-900" /></button>
                  </div>
                  <div className="p-6 grid grid-cols-2 gap-x-8 gap-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">

                    {/* Year Range */}
                    <div className="col-span-2 sm:col-span-1 space-y-3">
                      <label className="text-xs font-black text-slate-900 uppercase tracking-wider">سنة الصنع (Year)</label>
                      <div className="flex items-center gap-3">
                        <input title="من سنة" type="number" placeholder="من" className="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl py-3 px-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-mono font-bold text-sm text-center" value={filterYearMin} onChange={e => setFilterYearMin(e.target.value ? Number(e.target.value) : '')} />
                        <span className="text-slate-400 font-black">-</span>
                        <input title="إلى سنة" type="number" placeholder="إلى" className="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl py-3 px-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-mono font-bold text-sm text-center" value={filterYearMax} onChange={e => setFilterYearMax(e.target.value ? Number(e.target.value) : '')} />
                      </div>
                    </div>

                    {/* Mileage Range */}
                    <div className="col-span-2 sm:col-span-1 space-y-3">
                      <label className="text-xs font-black text-slate-900 uppercase tracking-wider">الممشى (Mileage)</label>
                      <div className="flex items-center gap-3">
                        <input title="الممشى الأدنى" type="number" placeholder="من" className="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl py-3 px-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-mono font-bold text-sm text-center" value={filterMileageMin} onChange={e => setFilterMileageMin(e.target.value ? Number(e.target.value) : '')} />
                        <span className="text-slate-400 font-black">-</span>
                        <input title="الممشى الأقصى" type="number" placeholder="إلى" className="w-full bg-slate-50 border border-slate-200 shadow-sm rounded-xl py-3 px-4 outline-none focus:border-orange-500 focus:bg-white transition-all font-mono font-bold text-sm text-center" value={filterMileageMax} onChange={e => setFilterMileageMax(e.target.value ? Number(e.target.value) : '')} />
                      </div>
                    </div>

                    {/* Drive Type */}
                    <div className="col-span-2 space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-black text-slate-900 uppercase tracking-wider">نظام الدفع (Drive Type)</label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['دفع رباعي 4x4', 'AWD', 'دفع أمامي FWD', 'دفع خلفي RWD'].map(opt => (
                          <label key={opt} className="cursor-pointer group">
                            <input
                              type="checkbox"
                              className="peer hidden"
                              checked={filterDriveTypes.includes(opt)}
                              onChange={(e) => {
                                if (e.target.checked) setFilterDriveTypes([...filterDriveTypes, opt]);
                                else setFilterDriveTypes(filterDriveTypes.filter(d => d !== opt));
                              }}
                            />
                            <div className="px-4 py-2 border border-slate-200 bg-slate-50 rounded-xl text-xs font-bold text-slate-500 peer-checked:bg-orange-500 peer-checked:border-orange-500 peer-checked:text-white hover:border-orange-300 transition-all select-none">
                              {opt}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between mt-auto">
                    <button onClick={clearAllFilters} className="px-6 py-3 text-sm font-black text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-colors">إعادة ضبط الكل</button>
                    <button onClick={() => setIsDesktopMoreOpen(false)} className="px-8 py-3 bg-orange-600 text-white rounded-xl font-black text-sm hover:bg-orange-700 transition-all active:scale-95 shadow-lg shadow-orange-500/20 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> تطبيق الفلاتر
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-slate-200 mx-2"></div>

            <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
              <button title="شبكة" onClick={() => setViewMode('grid')} className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button title="قائمة" onClick={() => setViewMode('list')} className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- MAIN CONTENT --- */}
      <div className="max-w-[1920px] mx-auto px-4 md:px-6 pt-2 pb-6 flex flex-col lg:flex-row gap-8 items-start w-full overflow-hidden min-w-0">

        {/* Left Sidebar (Desktop Only) */}
        <aside className="hidden lg:flex w-80 flex-col gap-6 sticky top-[90px] z-10">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex p-2 bg-slate-50">
              <button
                onClick={() => setActiveSidebarTab('events')}
                className={`flex-1 py-3 rounded-2xl text-xs font-black transition-all ${activeSidebarTab === 'events' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {t('home.sidebar.eventsAuctions')}
              </button>
              <button
                onClick={() => setActiveSidebarTab('saved')}
                className={`flex-1 py-3 rounded-2xl text-xs font-black transition-all ${activeSidebarTab === 'saved' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {t('home.sidebar.savedSearches')}
              </button>
            </div>

            <div className="p-6">
              {activeSidebarTab === 'events' ? (
                <div className="space-y-4">
                  {(() => {
                    const noReserveCount = cars.filter(c => (c.reservePrice === 0 || !c.reservePrice) && (c.status === 'live' || c.status === 'upcoming')).length;
                    const items = [
                      {
                        label: 'مزادات ماكينا مباشر',
                        count: '↗',
                        active: true,
                        action: () => window.open('https://www.macchinaa.com', '_blank'),
                        accent: 'orange',
                      },
                      {
                        label: 'سيارات بدون احتياطي',
                        count: noReserveCount,
                        active: false,
                        action: () => { handleTabChange('all'); /* scroll to cars with no reserve */ setTimeout(() => { const e = document.querySelector('[data-no-reserve]'); e?.scrollIntoView({ behavior: 'smooth' }); }, 200); },
                        accent: 'emerald',
                      },
                      {
                        label: 'فروع أوتو برو في الخليج',
                        count: 6,
                        active: false,
                        action: () => navigate('/gulf-branches'),
                        accent: 'blue',
                      },
                      {
                        label: 'تصفية مخزون المعارض',
                        count: '↗',
                        active: false,
                        action: () => navigate('/dealer-clearance'),
                        accent: 'purple',
                      },
                    ];
                    return items.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={item.action}
                        className={`p-4 rounded-2xl cursor-pointer transition-all border ${item.active ? 'bg-orange-50 border-orange-100 text-orange-700 hover:bg-orange-100' : 'bg-slate-50 border-transparent hover:border-slate-200 hover:bg-slate-100 text-slate-600'}`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-black text-sm">{item.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${item.active ? 'bg-orange-500 text-white' : 'bg-slate-200 text-slate-500'}`}>{item.count}</span>
                        </div>
                        {item.active && <div className="text-[10px] font-bold opacity-70">رابط خارجي</div>}
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="space-y-3">
                  {savedSearches.length === 0 ? (
                    <div className="text-center py-10">
                      <Save className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <h3 className="text-base font-black text-slate-900 mb-2">{t('home.sidebar.noSavedSearches')}</h3>
                      <p className="text-xs text-slate-500 font-bold mb-6">{t('home.sidebar.saveSearchAlert')}</p>
                      <button onClick={() => setShowSaveModal(true)} className="bg-slate-900 text-white px-6 py-2.5 rounded-2xl font-black text-xs hover:bg-slate-800 transition-colors">{t('home.sidebar.saveCurrentSearch')}</button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setShowSaveModal(true)} className="w-full bg-slate-900 text-white px-4 py-2.5 rounded-2xl font-black text-xs hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                        <Save className="w-4 h-4" /> {t('home.sidebar.saveCurrentSearch')}
                      </button>
                      {savedSearches.map((s) => {
                        const f = s.filters || {};
                        const summary: string[] = [];
                        if (f.searchTerm) summary.push(`"${f.searchTerm}"`);
                        if (f.filterMake) summary.push(f.filterMake);
                        if (f.filterModel) summary.push(f.filterModel);
                        if (f.filterYearMin || f.filterYearMax) summary.push(`${f.filterYearMin || '—'}-${f.filterYearMax || '—'}`);
                        if (f.filterPriceMin || f.filterPriceMax) summary.push(`$${f.filterPriceMin || 0}-$${f.filterPriceMax || '∞'}`);
                        if ((f.filterAuctionTypes || []).length) summary.push((f.filterAuctionTypes || []).join(', '));
                        if ((f.filterBodyTypes || []).length) summary.push((f.filterBodyTypes || []).join(', '));
                        if ((f.filterFuelTypes || []).length) summary.push((f.filterFuelTypes || []).join(', '));
                        if ((f.filterDriveTypes || []).length) summary.push((f.filterDriveTypes || []).join(', '));
                        const summaryText = summary.length ? summary.join(' · ') : 'بدون فلاتر';
                        return (
                          <div key={s.id} className="p-3 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-orange-200 transition-all group">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="font-black text-sm text-slate-900 truncate">{s.name}</div>
                              <button
                                aria-label="حذف"
                                onClick={() => removeSavedSearch(s.id)}
                                className="shrink-0 p-1 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-[11px] font-bold text-slate-500 mb-3 line-clamp-2">{summaryText}</div>
                            <button
                              onClick={() => applySavedSearch(s)}
                              className="w-full bg-orange-500 text-white px-3 py-1.5 rounded-xl font-black text-[11px] hover:bg-orange-600 transition-colors"
                            >
                              تطبيق (Apply)
                            </button>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Featured Cars Banner in left sidebar */}
          <FeaturedCarsBanner />

          <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden group border border-white/10 shadow-2xl">
            <div className="relative z-10">
              <div className="text-orange-500 font-black text-[10px] uppercase tracking-widest mb-2 text-right">{t('home.news.platformNews')}</div>
              <h3 className="text-xl font-black mb-4 leading-tight">{t('home.news.freeCarfax')}</h3>
              <button className="flex items-center gap-2 text-sm font-black text-white group-hover:gap-4 transition-all">
                {t('home.news.details')} <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
            <Shield className="absolute -bottom-10 -right-10 w-48 h-48 text-white/5 -rotate-12" />
          </div>
        </aside>

        {/* Main Feed */}
        <main className="flex-1 space-y-6 min-w-0 overflow-hidden w-full max-w-[100vw] pb-32 lg:pb-0 pt-0">
          {/* Tabs Bar Sticky Fix */}
          <div className="flex items-center gap-2 overflow-x-auto pb-4 pt-2 mb-4 scrollbar-hide min-w-0 w-full max-w-[100vw] lg:sticky lg:top-[85px] sticky top-[40px] z-[40] bg-[#F8FAFC]">
            {[
              { id: 'all', label: t('home.tabs.all'), count: (cars || []).length },
              { id: 'upcoming', label: t('home.tabs.upcoming'), count: (cars || []).filter(c => c.status === 'upcoming').length },
              { id: 'live', label: t('home.tabs.liveAuctions'), count: (cars || []).filter(c => c.status === 'live').length },
              { id: 'offer_market', label: t('home.tabs.offersMarket'), count: (cars || []).filter(c => c.status === 'offer_market').length },
              { id: 'closed', label: t('home.tabs.soldCars'), count: (cars || []).filter(c => c.status === 'closed').length },
              { id: 'watchlist', label: t('home.tabs.favorites'), count: (watchlist || []).length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-6 py-2.5 rounded-full text-sm font-black whitespace-nowrap transition-all border-2 flex items-center gap-2 ${activeTab === tab.id ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-900/10' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-300'
                  }`}
              >
                {tab.label}
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-slate-100'}`}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Active Filter Chips */}
          {(() => {
            const chips: { label: string; onRemove: () => void; key: string }[] = [];
            if (searchTerm) chips.push({ key: 'search', label: `بحث: ${searchTerm}`, onRemove: () => { setSearchTerm(''); setSearchInput(''); } });
            if (filterMake) chips.push({ key: 'make', label: `الماركة: ${filterMake}`, onRemove: () => setFilterMake('') });
            if (filterModel) chips.push({ key: 'model', label: `الموديل: ${filterModel}`, onRemove: () => setFilterModel('') });
            if (filterYearMin !== '') chips.push({ key: 'ymin', label: `سنة من: ${filterYearMin}`, onRemove: () => setFilterYearMin('') });
            if (filterYearMax !== '') chips.push({ key: 'ymax', label: `سنة إلى: ${filterYearMax}`, onRemove: () => setFilterYearMax('') });
            if (filterPriceMin !== '') chips.push({ key: 'pmin', label: `سعر من: $${filterPriceMin}`, onRemove: () => setFilterPriceMin('') });
            if (filterPriceMax !== '') chips.push({ key: 'pmax', label: `سعر إلى: $${filterPriceMax}`, onRemove: () => setFilterPriceMax('') });
            if (filterMileageMin !== '') chips.push({ key: 'mmin', label: `عداد من: ${filterMileageMin}`, onRemove: () => setFilterMileageMin('') });
            if (filterMileageMax !== '') chips.push({ key: 'mmax', label: `عداد إلى: ${filterMileageMax}`, onRemove: () => setFilterMileageMax('') });
            filterAuctionTypes.forEach((a) => chips.push({ key: `at-${a}`, label: `نوع المزاد: ${a}`, onRemove: () => setFilterAuctionTypes(filterAuctionTypes.filter((x) => x !== a)) }));
            filterDriveTypes.forEach((a) => chips.push({ key: `dt-${a}`, label: `الدفع: ${a}`, onRemove: () => setFilterDriveTypes(filterDriveTypes.filter((x) => x !== a)) }));
            filterBodyTypes.forEach((a) => chips.push({ key: `bt-${a}`, label: `الهيكل: ${a}`, onRemove: () => setFilterBodyTypes(filterBodyTypes.filter((x) => x !== a)) }));
            filterFuelTypes.forEach((a) => chips.push({ key: `ft-${a}`, label: `الوقود: ${a}`, onRemove: () => setFilterFuelTypes(filterFuelTypes.filter((x) => x !== a)) }));
            if (chips.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-2 px-2 py-3 items-center">
                {chips.map((c) => (
                  <button
                    key={c.key}
                    onClick={c.onRemove}
                    className="inline-flex items-center gap-1 bg-slate-900 text-white px-3 py-1.5 rounded-full text-xs font-bold hover:bg-slate-700 transition-colors"
                  >
                    {c.label} <X className="w-3 h-3" />
                  </button>
                ))}
                <button
                  onClick={clearAllFilters}
                  className="text-xs font-black text-orange-600 hover:text-orange-700 underline ml-2"
                >
                  مسح الكل (Clear all)
                </button>
                <button
                  onClick={() => setShowSaveModal(true)}
                  className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-full text-xs font-bold hover:border-orange-300 hover:text-orange-600 transition-colors"
                >
                  <Save className="w-3 h-3" /> حفظ البحث
                </button>
              </div>
            );
          })()}

          {filteredCars.length === 0 ? (
            <div className="bg-white rounded-[3rem] p-20 text-center border-2 border-dashed border-slate-200 mt-8">
              <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-200">
                <Search className="w-12 h-12" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">{t('home.emptyState.title')}</h3>
              <p className="text-slate-500 font-bold mb-8">{t('home.emptyState.subtitle')}</p>
              <button onClick={clearAllFilters} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-sm">{t('home.emptyState.clearFilters')}</button>
            </div>
          ) : (
            <div className={`mt-20 ${viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-10' : 'flex flex-col gap-8'}`}>
              {filteredCars.slice(0, displayCount).map((car) => {
                const seller = users.find(u => u.id === car.sellerId);
                const showroomName = car.showroomName || seller?.companyName || (seller?.firstName ? `${seller.firstName || ''} ${seller.lastName || ''}`.trim() : 'AutoPro Auctions');
                const isVerified = seller?.kycStatus === 'approved' || seller?.status === 'active';

                return (
                  <div
                    key={car.id}
                    style={{ scrollMarginTop: '160px' }}
                    className={`rounded-[2rem] overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 group ${viewMode === 'list' ? 'flex flex-col md:flex-row h-auto' : 'flex flex-col'} ${car.isRecommended ? 'bg-gradient-to-b from-amber-50 to-white border-2 border-amber-400 shadow-amber-200/50 ring-2 ring-amber-300/30' : 'bg-white border border-slate-200'}`}
                  >
                    {/* Image Section with Consistent Sizing */}
                    <div className={`relative overflow-hidden bg-slate-100 shrink-0 ${viewMode === 'list' ? 'w-full aspect-[4/3] md:aspect-auto md:h-auto md:w-[30%] lg:w-[32%] xl:w-[350px]' : 'w-full aspect-[16/9]'}`}>
                      <img
                        src={car.images && car.images[0] && car.images[0].length > 5 ? car.images[0] : 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800'}
                        alt={`${car.make} ${car.model}`}
                        onError={(e) => { e.currentTarget.src = 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800' }}
                        className="w-full h-full object-cover car-card-image transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                      {/* Status Overlay */}
                      <div className="absolute top-6 right-6 flex flex-col gap-2 z-20">
                        {car.status === 'live' && (
                          <div className="bg-red-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-2 shadow-xl animate-pulse">
                            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                            {t('home.carCard.liveNow')}
                          </div>
                        )}
                        <div className="bg-white/90 backdrop-blur-md text-slate-900 px-3 py-1.5 rounded-xl text-[10px] font-black shadow-lg">
                          #{car.lotNumber}
                        </div>
                        {car.isRecommended && (
                          <div className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-900 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-xl shadow-amber-400/30 border border-amber-300 animate-pulse">
                            <Star className="w-4 h-4 fill-current text-amber-700" />
                            سيارة مميزة
                          </div>
                        )}
                      </div>

                      <div className="absolute top-6 left-6 flex gap-2 z-20">
                        <button
                          title="إضافة للمفضلة"
                          aria-label="المفضلة"
                          onClick={(e) => { e.stopPropagation(); toggleWatchlist(car.id); }}
                          className={`p-2 rounded-xl transition-all shadow-lg ${watchlist.some((w: any) => w.carId === car.id) ? 'bg-rose-500 text-white' : 'bg-white/80 backdrop-blur text-slate-600 hover:text-rose-500'}`}
                        >
                          <Heart className={`w-5 h-5 ${watchlist.some((w: any) => w.carId === car.id) ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Content Section */}
                    <div className="p-4 md:p-6 flex-1 flex flex-col justify-between min-w-0">
                      <div onClick={() => handleBidClick(car)} className="cursor-pointer">
                        <div className="flex justify-between items-start mb-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-xl font-black text-slate-900 group-hover:text-orange-600 transition-colors truncate">
                              {car.year} {car.make} {car.model}
                            </h3>
                            <p className="text-xs font-bold text-slate-400 mt-0.5 flex items-center gap-2 tracking-widest leading-none">
                              <MapPin className="w-3 h-3" /> {car.location}
                              <span className="mx-1 text-slate-300">•</span>
                              <span className="font-bold flex items-center gap-1 text-slate-600">
                                {showroomName}
                                {isVerified ? (
                                  <span title="معرض موثق" className="flex items-center"><ShieldCheck className="w-3.5 h-3.5 text-blue-500" /></span>
                                ) : (
                                  <span title="معرض غير موثق" className="flex items-center"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /></span>
                                )}
                              </span>
                            </p>
                          </div>
                          <div className="text-left">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                              {car.status === 'offer_market' ? t('home.carCard.lastOffer') : car.status === 'upcoming' ? t('home.carCard.startingPrice') : car.status === 'closed' ? t('home.carCard.finalSalePrice') : t('home.carCard.currentAuction')}
                            </div>
                            <div className={`text-2xl font-black font-mono mt-1 ${car.status === 'live' ? 'text-emerald-600' :
                              car.status === 'offer_market' ? 'text-purple-600' :
                                car.status === 'closed' ? 'text-slate-600' :
                                  'text-slate-900'
                              }`}>${(car.currentBid || car.startingBid || 0).toLocaleString()}
                              <div className="text-sm font-bold text-slate-400 font-mono mt-0.5">
                                {Math.round((car.currentBid || car.startingBid || 0) * (exchangeRate || 7)).toLocaleString()} د.ل
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2 overflow-hidden">
                            <Droplets className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-[10px] font-black text-slate-900 truncate">{car.fuelType || 'بنزين'}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2 overflow-hidden">
                            <Settings2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-[10px] font-black text-slate-900 truncate">{car.transmission || 'اوتوماتيك'}</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2 overflow-hidden">
                            <Gauge className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-[10px] font-black text-slate-900 truncate">{car.odometer?.toLocaleString() || '0'} mi</span>
                          </div>
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center gap-2 overflow-hidden">
                            <div className={`w-1.5 h-1.5 shrink-0 rounded-full ${car.primaryDamage && car.primaryDamage !== 'لا يوجد' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                            <span className="text-[10px] font-black text-slate-900 truncate">{car.primaryDamage ? `حالي: ${car.primaryDamage}` : 'سليم'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-center gap-4 mt-2">
                        {viewMode === 'list' && (
                          <div className="flex-1 flex flex-wrap items-center gap-4 sm:gap-8 px-2">
                            <ListCarTimer car={car} />
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden xl:block">
                              Lot: #{car.lotNumber}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:w-auto mt-3 sm:mt-0">
                          <button
                            title="تفاصيل"
                            aria-label="تفاصيل"
                            onClick={() => navigate(`/car-details/${car.id}`)}
                            className="flex-1 sm:w-32 py-3 bg-slate-950 text-white rounded-2xl font-black text-xs hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-900/10"
                          >
                            {t('home.carCard.details')}
                          </button>

                          {/* ── Status-aware action button ── */}
                          {car.status === 'live' && (
                            <button
                              onClick={() => handleBidClick(car)}
                              className="flex-1 sm:w-40 py-3 bg-red-600 text-white rounded-2xl font-black text-xs hover:bg-red-700 transition-all active:scale-95 shadow-xl shadow-red-600/20 flex items-center justify-center gap-2 animate-pulse"
                            >
                              <Gavel className="w-4 h-4" />
                              {t('home.carCard.bidNow')}
                            </button>
                          )}

                          {car.status === 'offer_market' && (
                            <button
                              onClick={() => navigate(`/car-details/${car.id}`)}
                              className="flex-1 sm:w-40 py-3 bg-purple-600 text-white rounded-2xl font-black text-xs hover:bg-purple-700 transition-all active:scale-95 shadow-xl shadow-purple-600/20 flex items-center justify-center gap-2"
                            >
                              <Handshake className="w-4 h-4" />
                              {t('home.carCard.makeOffer')}
                            </button>
                          )}

                          {car.status === 'closed' && (
                            <div className="flex-1 sm:w-40 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs border border-slate-200 flex items-center justify-center gap-2 cursor-default">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              {t('home.carCard.sold')}
                            </div>
                          )}

                          {(car.status === 'upcoming' || car.status === 'pending_approval') && (
                            <button
                              onClick={() => navigate(`/car-details/${car.id}`)}
                              className="flex-1 sm:w-40 py-3 bg-orange-500 text-white rounded-2xl font-black text-xs hover:bg-orange-600 transition-all active:scale-95 shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2"
                            >
                              <Gavel className="w-4 h-4" />
                              {t('home.carCard.preBid')}
                            </button>
                          )}

                          {car.status !== 'live' && car.status !== 'offer_market' && car.status !== 'upcoming' && car.status !== 'pending_approval' && car.status !== 'closed' && (
                            <button
                              onClick={() => navigate(`/car-details/${car.id}`)}
                              className="flex-1 sm:w-40 py-3 bg-slate-200 text-slate-600 rounded-2xl font-black text-xs hover:bg-slate-300 transition-all active:scale-95"
                            >
                              {t('home.carCard.viewDetails')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {filteredCars.length > displayCount && (
            <div className="flex justify-center mt-8">
              <button onClick={() => setDisplayCount(d => d + 24)} className="bg-orange-500 hover:bg-orange-600 text-white px-10 py-3 rounded-xl font-black text-sm transition-all shadow-lg">
                عرض {Math.min(24, filteredCars.length - displayCount)} سيارة إضافية ({filteredCars.length - displayCount} متبقية)
              </button>
            </div>
          )}
        </main>

        {/* Right Sidebar (Desktop Only) */}
        {
          currentUser && (
            <aside className="hidden lg:flex w-80 flex-col gap-6 sticky top-[90px] z-10">
              {/* Featured Cars Banner — Premium Gold Dealers */}
              <FeaturedCarsBanner />

              <div className="bg-white rounded-3xl border border-slate-200 shadow-xl p-4">
                <div onClick={() => setIsMyAuctionsOpen(!isMyAuctionsOpen)} className="flex items-center justify-between mb-2 cursor-pointer group pb-3 border-b border-slate-100">
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-2 group-hover:text-orange-500 transition-colors">مزايداتي (My Auctions)</h3>
                  <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isMyAuctionsOpen ? 'rotate-180' : ''}`} />
                </div>

                {isMyAuctionsOpen && (
                  <div className="space-y-3 pt-2 animate-in fade-in slide-in-from-top-2">
                    {cars.filter(car => car.status === 'live' && car.winnerId === currentUser?.id).length === 0 && (
                      <div className="text-center py-4 text-slate-400 text-xs italic">لا توجد مزايدات نشطة حالياً</div>
                    )}
                    {cars.filter(car => (car.status === 'live' || car.status === 'ultimo') && car.winnerId === currentUser?.id).map((car) => {
                      const isWinning = car.winnerId === currentUser?.id;
                      const carImage = Array.isArray(car.images) && car.images.length > 0 ? car.images[0] : 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=300';
                      const remaining = car.auctionEndDate ? Math.max(0, Math.floor((new Date(car.auctionEndDate).getTime() - Date.now()) / 60000)) : 0;
                      return (
                      <div key={car.id} onClick={() => navigate('/live-auction')} className={`flex gap-3 p-2.5 rounded-2xl bg-white border cursor-pointer hover:shadow-md transition-all ${isWinning ? 'border-emerald-500/50 shadow-emerald-500/5 bg-emerald-50/10' : 'border-rose-500/50 bg-rose-50/30 shadow-rose-500/5'}`}>
                        <div className="relative w-20 h-[60px] shrink-0 rounded-xl overflow-hidden bg-slate-100">
                          <img src={carImage} alt="car" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div className="flex justify-between items-start">
                            <div className="min-w-0 pr-1">
                              <h4 className="text-[12px] font-black text-slate-900 truncate leading-none mb-1">{car.year} {car.make} {car.model}</h4>
                              <div className="text-[9px] text-slate-500 truncate mt-0.5 leading-none">{car.trim || ''} • {car.odometer?.toLocaleString()} mi</div>
                            </div>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${isWinning ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                              <CheckCircle2 className="w-3 h-3" />
                            </div>
                          </div>
                          <div className="flex justify-between items-end mt-1">
                            <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 font-mono">
                              <Clock className="w-3 h-3 text-slate-400" /> {remaining}m
                            </div>
                            <div className={`text-sm font-black font-mono leading-none ${isWinning ? 'text-emerald-600' : 'text-rose-600'}`}>
                              ${(car.currentBid || 0).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}

                    <button onClick={() => navigate('/dashboard/user?view=bids')} className="w-full mt-2 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl font-black text-[11px] hover:bg-slate-100 hover:text-slate-900 transition-all flex items-center justify-center gap-2">
                      عرض جميع المزايدات <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </aside>
          )
        }
      </div>

      {/* Mobile Advanced Filters Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[200] lg:hidden flex">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="relative w-[85%] max-w-md ml-auto bg-slate-50 h-full overflow-hidden animate-in slide-in-from-right duration-300 rtl:slide-in-from-left flex flex-col shadow-2xl">

            {/* Header */}
            <div className="bg-white px-6 py-4 flex justify-between items-center border-b border-slate-100 z-10 sticky top-0 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Filter className="w-5 h-5 text-orange-500" /> الفلاتر المتقدمة
              </h2>
              <div className="flex items-center gap-3">
                <button onClick={() => { setSearchTerm(''); setSearchInput(''); setFilterMake(''); setFilterModel(''); setFilterYearMin(''); setFilterYearMax(''); setFilterMileageMin(''); setFilterMileageMax(''); setFilterPriceMin(''); setFilterPriceMax(''); setFilterAuctionTypes([]); }} className="text-[11px] font-bold text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-wider">إعادة ضبط</button>
                <button aria-label="إغلاق" onClick={() => setIsMobileMenuOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Filters Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-24">
              {/* Search */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider">البحث (Search)</label>
                <div className="relative group">
                  <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="رقم اللوت، الشاصي، الخ..."
                    className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-3 pr-12 pl-4 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold text-sm"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                </div>
              </div>

              {/* Make & Model */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3 cursor-pointer group relative">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider">المصنع (Make)</label>
                  <select title="المصنع" aria-label="المصنع" value={filterMake} onChange={(e) => { setFilterMake(e.target.value); setFilterModel(''); }} className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-3 px-4 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold text-sm text-slate-700 appearance-none cursor-pointer">
                    <option value="">الكل (All)</option>
                    {Object.keys(CAR_MAKES_AND_MODELS).map(make => (
                      <option key={make} value={make}>{make}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute left-3 top-10 w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors pointer-events-none" />
                </div>
                <div className="space-y-3 relative group">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider">الموديل (Model)</label>
                  <select title="الموديل" aria-label="الموديل" value={filterModel} onChange={(e) => setFilterModel(e.target.value)} disabled={!filterMake} className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-3 px-4 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold text-sm text-slate-700 appearance-none disabled:bg-slate-50 disabled:text-slate-400 cursor-pointer">
                    <option value="">الكل (All)</option>
                    {filterMake && (CAR_MAKES_AND_MODELS[filterMake] || []).map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute left-3 top-10 w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors pointer-events-none" />
                </div>
              </div>

              {/* Price Range */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider">السعر (Price)</label>
                  <span className="text-xs font-bold text-slate-500">{filterPriceMin || 0}$ - {filterPriceMax || '1M+'}$</span>
                </div>
                <DualRangeSlider
                  min={0} max={150000} step={500}
                  value={[Number(filterPriceMin) || 0, Number(filterPriceMax) || 150000]}
                  onChange={(val) => { setFilterPriceMin(val[0]); setFilterPriceMax(val[1]); }}
                />
                <div className="flex items-center gap-4 mt-2">
                  <input type="number" value={filterPriceMin} onChange={(e) => setFilterPriceMin(e.target.value ? Number(e.target.value) : '')} placeholder="Min $" className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-2 px-3 outline-none focus:border-orange-500 transition-all font-mono font-bold text-[11px] text-center" />
                  <span className="text-slate-400 font-black">-</span>
                  <input type="number" value={filterPriceMax} onChange={(e) => setFilterPriceMax(e.target.value ? Number(e.target.value) : '')} placeholder="Max $" className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-2 px-3 outline-none focus:border-orange-500 transition-all font-mono font-bold text-[11px] text-center" />
                </div>
              </div>

              {/* Year Range */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider">سنة الصنع (Year)</label>
                  <span className="text-xs font-bold text-slate-500">{filterYearMin || '<1901'} - {filterYearMax || '2027'}</span>
                </div>
                <DualRangeSlider
                  min={1990} max={2027} step={1}
                  value={[Number(filterYearMin) || 1990, Number(filterYearMax) || 2027]}
                  onChange={(val) => { setFilterYearMin(val[0]); setFilterYearMax(val[1]); }}
                />
                <div className="flex items-center gap-4 mt-2">
                  <input type="number" value={filterYearMin} onChange={(e) => setFilterYearMin(e.target.value ? Number(e.target.value) : '')} placeholder="من سنة" className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-2 px-3 outline-none focus:border-orange-500 transition-all font-mono font-bold text-[11px] text-center" />
                  <span className="text-slate-400 font-black">-</span>
                  <input type="number" value={filterYearMax} onChange={(e) => setFilterYearMax(e.target.value ? Number(e.target.value) : '')} placeholder="إلى سنة" className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-2 px-3 outline-none focus:border-orange-500 transition-all font-mono font-bold text-[11px] text-center" />
                </div>
              </div>

              {/* Mileage Range */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-black text-slate-900 uppercase tracking-wider">المسافة (Mileage)</label>
                  <span className="text-xs font-bold text-slate-500">{filterMileageMin || 0} - {filterMileageMax || 'مفتوح'}</span>
                </div>
                <DualRangeSlider
                  min={0} max={300000} step={5000}
                  value={[Number(filterMileageMin) || 0, Number(filterMileageMax) || 300000]}
                  onChange={(val) => { setFilterMileageMin(val[0]); setFilterMileageMax(val[1]); }}
                />
                <div className="flex items-center gap-4 mt-2">
                  <input type="number" value={filterMileageMin} onChange={(e) => setFilterMileageMin(e.target.value ? Number(e.target.value) : '')} placeholder="أدنى كم" className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-2 px-3 outline-none focus:border-orange-500 transition-all font-mono font-bold text-[11px] text-center" />
                  <span className="text-slate-400 font-black">-</span>
                  <input type="number" value={filterMileageMax} onChange={(e) => setFilterMileageMax(e.target.value ? Number(e.target.value) : '')} placeholder="أقصى كم" className="w-full bg-white border border-slate-200 shadow-sm rounded-xl py-2 px-3 outline-none focus:border-orange-500 transition-all font-mono font-bold text-[11px] text-center" />
                </div>
              </div>

              {/* Auction Type */}
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-900 uppercase tracking-wider">نوع المزاد (Auction Type)</label>
                <div className="space-y-2">
                  {['بيع مباشر', 'سعر احتياطي', 'اشتري الآن', 'تصفية معارض', 'سيارات الخليج'].map(type => (
                    <label key={type} className="flex items-center gap-3 p-3 bg-white border border-slate-100 shadow-sm rounded-xl cursor-pointer hover:bg-slate-50 transition-colors group">
                      <input type="checkbox" checked={filterAuctionTypes.includes(type)} onChange={(e) => {
                        if (e.target.checked) setFilterAuctionTypes([...filterAuctionTypes, type]);
                        else setFilterAuctionTypes(filterAuctionTypes.filter(a => a !== type));
                      }} className="w-5 h-5 rounded border-slate-300 text-orange-500 focus:ring-orange-500/20" />
                      <span className="font-bold text-sm text-slate-700 group-hover:text-slate-900">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

            </div>

            {/* Footer Sticky Button */}
            <div className="bg-white p-6 border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.05)] z-10 sticky bottom-0">
              <button onClick={() => setIsMobileMenuOpen(false)} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> عرض النتائج ({filteredCars.length})
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet (Sticky above Bottom Nav) */}
      <div className={`fixed left-0 right-0 z-[95] lg:hidden bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.1)] rounded-t-3xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] border-t border-slate-200 ${isBottomSheetOpen ? 'bottom-16 h-[80vh] overflow-y-auto pb-6' : 'bottom-16 h-16 cursor-pointer'} `}>
        {!isBottomSheetOpen ? (
          <div className="w-full h-full flex items-center justify-between px-6 hover:bg-slate-50 transition-colors" onClick={() => setIsBottomSheetOpen(true)}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-orange-600 to-orange-400 text-white rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30 animate-pulse">
                <ChevronDown className="w-5 h-5 rotate-180" />
              </div>
              <span className="font-black text-slate-900 tracking-wide">حالة المزايدات والملخص</span>
            </div>
            {currentUser && (
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">القوة الشرائية</div>
                <div className="text-sm font-black font-mono text-emerald-600">${currentUser.buyingPower?.toLocaleString()}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative h-full flex flex-col">
            <div className="sticky top-0 bg-white/90 backdrop-blur-md pt-4 pb-4 z-10 border-b border-slate-100 mb-6">
              <button
                title="سحب الدرج"
                aria-label="سحب الدرج"
                onClick={() => setIsBottomSheetOpen(false)}
                className="mx-auto w-12 h-1.5 bg-slate-300 rounded-full mb-4 focus:ring-2 focus:ring-orange-500 outline-none block"
              />
              <div className="px-6 flex items-center justify-between">
                <h3 className="font-black text-xl text-slate-900">حالة المزايدات والملخص</h3>
                <button title="إغلاق الدرج" aria-label="إغلاق الدرج" onClick={() => setIsBottomSheetOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 space-y-8 pb-10 flex-1">
              {currentUser ? (
                <>
                  {/* Bids Status content cloned from right sidebar */}
                  <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                        <Wallet className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-500 mb-1 leading-none">{t('home.rightSidebar.buyingPower')}</div>
                        <div className="text-xl font-black text-slate-900 font-mono leading-none">${currentUser.buyingPower?.toLocaleString()}</div>
                      </div>
                    </div>
                    <button title="إضافة رصيد" onClick={() => navigate('/dashboard/user?view=wallet')} className="w-10 h-10 bg-white rounded-xl shadow-sm text-slate-400 hover:text-emerald-500 transition-all flex items-center justify-center">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right flex items-center gap-2">
                      <Gavel className="w-4 h-4 text-orange-500" />
                      {t('home.rightSidebar.activeAuctions')} ({cars.filter(c => c.winnerId === currentUser?.id && (c.status === 'live' || c.status === 'upcoming' || (c as any).status === 'ultimo')).length})
                    </h4>
                    {cars.filter(c => c.winnerId === currentUser?.id && (c.status === 'live' || c.status === 'upcoming' || (c as any).status === 'ultimo')).length === 0 ? (
                      <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <Gavel className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                        <div className="text-sm font-black text-slate-600">لا توجد مزايدات نشطة</div>
                      </div>
                    ) : (
                    <div className="space-y-3">
                      {cars.filter(c => c.winnerId === currentUser?.id && (c.status === 'live' || c.status === 'upcoming' || (c as any).status === 'ultimo')).map((carItem) => {
                        const carImg = Array.isArray(carItem.images) && carItem.images.length > 0 && carItem.images[0].length > 5 ? carItem.images[0] : 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=300';
                        const remainingMin = carItem.auctionEndDate ? Math.max(0, Math.floor((new Date(carItem.auctionEndDate).getTime() - Date.now()) / 60000)) : 0;
                        const item = { year: carItem.year, make: carItem.make, model: carItem.model, trim: carItem.trim || '', miles: `${(carItem.odometer || 0).toLocaleString()} miles`, time: `${remainingMin}m`, bid: carItem.currentBid || 0, winning: true, image: carImg };
                        const idx = carItem.id;
                        return (
                        <div key={idx} className={`flex gap-3 p-2.5 rounded-2xl bg-white border cursor-pointer hover:shadow-md transition-all ${item.winning ? 'border-emerald-500/50 shadow-emerald-500/5 bg-emerald-50/10' : 'border-rose-500/50 bg-rose-50/30 shadow-rose-500/5'}`}>
                          <div className="relative w-20 h-[60px] shrink-0 rounded-xl overflow-hidden bg-slate-100">
                            <img src={item.image} alt="car" className="w-full h-full object-cover" />
                            <div className="absolute top-1 left-1 w-4 h-4 bg-black/60 backdrop-blur rounded-full flex items-center justify-center">
                              <Heart className="w-2.5 h-2.5 text-rose-500 fill-current" />
                            </div>
                          </div>
                          <div className="flex-1 flex flex-col justify-between min-w-0">
                            <div className="flex justify-between items-start">
                              <div className="min-w-0 pr-1">
                                <h4 className="text-[12px] font-black text-slate-900 truncate leading-none mb-1">{item.year || '2016'} {item.make} {item.model}</h4>
                                <div className="text-[9px] text-slate-500 truncate mt-0.5 leading-none">{item.trim}</div>
                                <div className="text-[9px] text-slate-400 mt-0.5">{item.miles}</div>
                              </div>
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${item.winning ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                <CheckCircle2 className="w-3 h-3" />
                              </div>
                            </div>
                            <div className="flex justify-between items-end mt-1">
                              <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 font-mono">
                                <Clock className="w-3 h-3 text-slate-400" /> {item.time}
                              </div>
                              <div className={`text-sm font-black font-mono leading-none ${item.winning ? 'text-emerald-600' : 'text-rose-600'}`}>
                                ${item.bid.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                    )}
                  </div>

                  <button onClick={() => navigate('/dashboard/user?view=bids')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20">
                    {t('home.rightSidebar.viewAllBids')}
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <div className="py-12 text-center bg-slate-50 rounded-3xl border border-slate-100">
                  <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="font-black text-lg text-slate-900 mb-2">قم بتسجيل الدخول للمنصة</h3>
                  <p className="text-xs text-slate-500 font-bold mb-8 px-6 leading-relaxed">لعرض وتتبع حالة المزايدات الخاصة بك والقوة الشرائية وتلقي تنبيهات فورية بحالة سياراتك.</p>
                  <button onClick={() => navigate('/auth')} className="bg-orange-600 text-white px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-orange-700 active:scale-95 transition-all shadow-lg shadow-orange-500/20">
                    {t('nav.loginRegister')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Scroll-Aware FABs for Mobile */}
      {!isBottomSheetOpen && (
        <div className="fixed bottom-40 right-4 z-[90] flex flex-col gap-3 lg:hidden items-end">
          {/* Sort FAB */}
          <button onClick={() => setIsMobileSortOpen(true)} className={`bg-slate-900 text-white shadow-lg shadow-slate-900/20 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden ${isScrollingDown ? 'w-[48px] h-[48px]' : 'px-5 h-[48px] w-auto'}`}>
            <div className="flex items-center justify-center gap-2 w-max text-center">
              <SlidersHorizontal className="w-5 h-5 shrink-0" />
              <span className={`font-black text-sm transition-all duration-300 ${isScrollingDown ? 'w-0 opacity-0 hidden' : 'opacity-100 block'}`}>ترتيب</span>
            </div>
          </button>
          {/* Search & Filters FAB */}
          <button onClick={() => setIsMobileMenuOpen(true)} className={`bg-orange-500 text-white shadow-xl shadow-orange-500/30 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden ${isScrollingDown ? 'w-[56px] h-[56px]' : 'px-5 h-[56px] w-auto'}`}>
            <div className="flex items-center justify-center gap-2 w-max">
              <Filter className="w-5 h-5 shrink-0" />
              <span className={`font-black text-sm transition-all duration-300 ${isScrollingDown ? 'w-0 opacity-0 hidden' : 'opacity-100 block'}`}>بحث وفلاتر</span>
            </div>
          </button>
        </div>
      )}

      {/* Mobile Sort Menu Popup */}
      {isMobileSortOpen && (
        <div className="fixed inset-0 z-[210] flex items-end justify-center px-4 pb-20">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileSortOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-black text-xl text-slate-900">ترتيب النتائج</h3>
              <button title="إغلاق الترتيب" aria-label="إغلاق" onClick={() => setIsMobileSortOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <button onClick={() => { setSortBy('ending_soonest'); setIsMobileSortOpen(false); }} className={`flex items-center justify-between w-full p-4 rounded-2xl border-2 transition-all ${sortBy === 'ending_soonest' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                <span className="font-black text-sm">ينتهي أولاً (Ending Soon)</span>
                {sortBy === 'ending_soonest' && <CheckCircle2 className="w-5 h-5" />}
              </button>
              <button onClick={() => { setSortBy('recommended'); setIsMobileSortOpen(false); }} className={`flex items-center justify-between w-full p-4 rounded-2xl border-2 transition-all ${sortBy === 'recommended' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                <span className="font-black text-sm">مُوصى به (Recommended)</span>
                {sortBy === 'recommended' && <CheckCircle2 className="w-5 h-5" />}
              </button>
              <button onClick={() => { setSortBy('priced_to_sell'); setIsMobileSortOpen(false); }} className={`flex items-center justify-between w-full p-4 rounded-2xl border-2 transition-all ${sortBy === 'priced_to_sell' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 bg-slate-50 text-slate-600'}`}>
                <span className="font-black text-sm">سعر منافس (Priced to Sell)</span>
                {sortBy === 'priced_to_sell' && <CheckCircle2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSaveModal(false)}></div>
          <div className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-xl text-slate-900 flex items-center gap-2">
                <Save className="w-5 h-5 text-orange-500" /> حفظ البحث الحالي
              </h3>
              <button aria-label="إغلاق" onClick={() => setShowSaveModal(false)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs font-bold text-slate-500 mb-4">أدخل اسماً لهذا البحث حتى تتمكن من استعادته لاحقاً.</p>
            <input
              type="text"
              value={saveSearchName}
              onChange={(e) => setSaveSearchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSearchConfirm(); }}
              placeholder="مثال: بي ام دبليو X5 2020+"
              autoFocus
              className="w-full bg-white border-2 border-slate-200 rounded-xl py-3 px-4 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold text-sm mb-4"
            />
            <label className="flex items-start gap-3 mb-3 p-3 bg-orange-50 border-2 border-orange-100 rounded-xl cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveSearchEmailAlerts}
                onChange={(e) => setSaveSearchEmailAlerts(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-orange-500"
              />
              <div className="text-xs font-bold text-slate-700 leading-relaxed">
                إرسال إيشعار بالبريد عند توفر سيارات جديدة تطابق هذا البحث
              </div>
            </label>
            {saveSearchEmailAlerts && (
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">تكرار التنبيهات</label>
                <select
                  value={saveSearchFrequency}
                  onChange={(e) => setSaveSearchFrequency(e.target.value as 'instant' | 'daily' | 'weekly')}
                  className="w-full bg-white border-2 border-slate-200 rounded-xl py-2.5 px-3 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold text-sm"
                >
                  <option value="instant">فوري (كل ساعة)</option>
                  <option value="daily">ملخص يومي</option>
                  <option value="weekly">ملخص أسبوعي</option>
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveSearchConfirm}
                disabled={!saveSearchName.trim()}
                className="flex-1 bg-slate-900 text-white px-4 py-3 rounded-xl font-black text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                حفظ
              </button>
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 bg-slate-100 text-slate-700 px-4 py-3 rounded-xl font-black text-sm hover:bg-slate-200 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

