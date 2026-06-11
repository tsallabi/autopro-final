import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Users, Clock, Wallet, Shield, MapPin, Search, Filter,
  Menu, X, Bell, LogOut, LayoutDashboard, History,
  CheckCircle2, CreditCard, Heart, Trophy, Gavel, ArrowUpRight,
  Package, Truck, Ship, MessageSquare, Plus, Trash2, Edit, Building2,
  FileText, Mail, ShieldCheck, Store, List, File, HelpCircle, Settings,
  MoreVertical, UploadCloud, Globe, ShoppingCart, Check, Reply, Hash,
  Link as LinkIcon, Calculator, Info, BookOpen, TrendingUp, Handshake, Map, Camera,
  AlertCircle, Wallet as WalletIcon, FileCheck, User, BarChart3, ChevronRight, ChevronDown, Car, Home, DollarSign,
  RefreshCw, Send, Gift
} from 'lucide-react';
import { useStore, authFetch } from '../context/StoreContext';
import { NotificationDropdown } from '../components/NotificationDropdown';
import { MessageDropdown } from '../components/MessageDropdown';
import { SHIPMENT_STATUS_LABELS } from '../types';
import { KycPanel } from '../components/KycPanel';
import ReferralCard from '../components/ReferralCard';
import KycDocumentsUploader from '../components/KycDocumentsUploader';
import { useTranslation } from 'react-i18next';
import { useClickOutside } from '../hooks/useClickOutside';

export const UserDashboard = () => {
  const { t, i18n } = useTranslation();
  const { currentUser, setCurrentUser, socket, showAlert, cars, watchlist, branchConfig, unreadCounts, markMessageAsRead, markNotificationAsRead } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'overview';

  const [messages, setMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [activeBids, setActiveBids] = useState<any[]>([]);
  const [pendingCars, setPendingCars] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [userBids, setUserBids] = useState<any[]>([]);
  const [userOffers, setUserOffers] = useState<any[]>([]);
  const [lostAuctions, setLostAuctions] = useState<any[]>([]);

  // Sell Car State
  const [sellForm, setSellForm] = useState({
    vin: '',
    make: '',
    model: '',
    year: '',
    reservePrice: '',
    location: '',
    odometer: '',
    transmission: 'automatic',
    engine: '',
    drive: 'AWD',
    primaryDamage: 'None',
    titleType: 'Clean',
    videoUrl: '',
    inspectionPdf: '',
    description: '',
    images: [] as string[],
    acceptOffers: true
  });

  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showDetailedReport, setShowDetailedReport] = useState(false);
  const [showSalesReport, setShowSalesReport] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [marketData, setMarketData] = useState<any>(null);
  const [loadingMarketData, setLoadingMarketData] = useState(false);
  const [newMessageData, setNewMessageData] = useState({ subject: '', content: '', category: 'general' });
  const [inspectionForm, setInspectionForm] = useState({ carDetails: '', location: '', urgency: 'normal' });
  const [depositAmount, setDepositAmount] = useState('1000');
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState(false);

  // Payment System State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'bank_transfer' | 'cash' | 'card'>('wallet');
  const [referenceNo, setReferenceNo] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    address: ''
  });
  const [activeTab, setActiveTab] = useState<'winning' | 'pending' | 'counter' | 'active' | 'lost'>('winning');
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passForm, setPassForm] = useState({ current: '', new: '', confirm: '' });
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState({ emailNotifications: true, whatsappNotifications: true });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Refs for outside click
  const sidebarRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useClickOutside(sidebarRef, () => setIsSidebarOpen(false));
  useClickOutside(notificationsRef, () => setShowNotifications(false));
  useClickOutside(messagesRef, () => setShowMessages(false));

  const navigate = useNavigate();

  const effectiveUser = currentUser || {} as any;

  useEffect(() => {
    if (effectiveUser.id) {
      authFetch(`/api/user/settings/${effectiveUser.id}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            setNotificationSettings({
              emailNotifications: data.emailNotifications === 1,
              whatsappNotifications: data.whatsappNotifications === 1
            });
          }
        })
        .catch(console.error);
    }
  }, [effectiveUser.id]);

  const toggleNotificationSetting = async (key: 'emailNotifications' | 'whatsappNotifications') => {
    const newSettings = { ...notificationSettings, [key]: !notificationSettings[key] };
    setNotificationSettings(newSettings);
    setIsSavingSettings(true);
    try {
      await authFetch(`/api/user/settings/${effectiveUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
    } catch {
      showAlert('فشل تحديث الإعدادات', 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const glassCardClasses = "bg-white/70 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] rounded-[2rem] transition-all duration-500 hover:shadow-[0_8px_32px_0_rgba(31,38,135,0.15)]";

  useEffect(() => {
    if (!currentUser) {
      navigate('/auth');
    }
  }, [currentUser, navigate]);

  const favoriteCars = cars.filter(car => watchlist.some(w => w.carId === car.id));
  const wonCars = cars.filter(car => car.status === 'closed' && car.winnerId === (effectiveUser.id));

  useEffect(() => {
    if (effectiveUser) {
      setProfileForm({
        firstName: effectiveUser.firstName || '',
        lastName: effectiveUser.lastName || '',
        phone: effectiveUser.phone || '',
        address: effectiveUser.address || ''
      });
    }
  }, [currentUser]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await authFetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: effectiveUser.id, ...profileForm })
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        showAlert('تم تحديث الملف الشخصي بنجاح', 'success');
        setIsEditingProfile(false);
      }
    } catch {
      showAlert('فشل التحديث');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passForm.new !== passForm.confirm) {
      showAlert('كلمة المرور الجديدة غير متطابقة', 'error');
      return;
    }
    setIsSavingProfile(true);
    try {
      const res = await authFetch('/api/user/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: effectiveUser.id, currentPassword: passForm.current, newPassword: passForm.new })
      });
      if (res.ok) {
        showAlert('تم تغيير كلمة المرور بنجاح', 'success');
        setIsChangingPass(false);
        setPassForm({ current: '', new: '', confirm: '' });
      } else {
        const err = await res.json();
        showAlert(err.error || 'فشل التغيير', 'error');
      }
    } catch {
      showAlert('خطأ في الاتصال');
    } finally {
      setIsSavingProfile(false);
    }
  };

  useEffect(() => {
    if (effectiveUser && socket) {
      socket.emit('join_user_room', effectiveUser.id);
    }
  }, [effectiveUser, socket]);

  // Fetch static user data only when effectiveUser changes or view changes
  useEffect(() => {
    if (effectiveUser?.id) {
      authFetch(`/api/invoices/user/${effectiveUser.id}`).then(r => r.json()).then(setInvoices).catch(() => { });
      authFetch(`/api/transactions/user/${effectiveUser.id}`).then(r => r.json()).then(setTransactions).catch(() => { });
      authFetch(`/api/bids/user/${effectiveUser.id}`).then(r => r.json()).then(setUserBids).catch(() => { });
      authFetch(`/api/shipments/user/${effectiveUser.id}`).then(r => r.json()).then(setShipments).catch(() => { });
      authFetch(`/api/offers/user/${effectiveUser.id}`).then(r => r.json()).then(setUserOffers).catch(() => { });

      setLoadingMessages(true);
      authFetch(`/api/messages/user/${effectiveUser.id}`)
        .then(r => r.json())
        .then(data => { setMessages(data); setLoadingMessages(false); })
        .catch(() => setLoadingMessages(false));

      if (effectiveUser.role === 'admin') {
        authFetch('/api/admin/pending-cars').then(r => r.json()).then(setPendingCars).catch(() => { });
      }
    }
  }, [effectiveUser?.id, view]);

  // Derive active/lost auctions from cars (which updates frequently) without re-fetching
  useEffect(() => {
    if (effectiveUser) {
      const lost = cars.filter(car =>
        car.status === 'closed' &&
        car.winnerId !== effectiveUser.id &&
        userBids.some(b => b.carId === car.id)
      );
      setLostAuctions(lost);

      // Show ALL cars the user has bid on (not just winning ones)
      const biddedCarIds = new Set(userBids.map(b => b.carId));
      const leadingBids = cars.filter(car =>
        (car.status === 'live' || car.status === 'ultimo') &&
        (car.winnerId === effectiveUser.id || biddedCarIds.has(car.id))
      );
      setActiveBids(leadingBids);
    }
  }, [cars, userBids, effectiveUser?.id]);

  // Mark all unviewed invoices as viewed when navigating to the invoices view
  useEffect(() => {
    if (view === 'invoices' && invoices.length > 0) {
      const unviewedInvoices = invoices.filter(inv => inv.isViewed === 0);

      unviewedInvoices.forEach(async (inv) => {
        try {
          const res = await authFetch(`/api/invoices/${inv.id}/view`, { method: 'PUT' });
          if (res.ok) {
            setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, isViewed: 1 } : i));
          }
        } catch (e) {
          console.error("Failed to mark invoice as viewed", e);
        }
      });
    }
  }, [view, invoices]);

  // Listen for real-time shipment updates
  useEffect(() => {
    if (!socket) return;

    const handleShipmentUpdated = (data: any) => {
      setShipments(prev => {
        const exists = prev.some(s => s.id === data.id);
        if (exists) {
          return prev.map(s => s.id === data.id ? { ...s, ...data } : s);
        }
        return [data, ...prev];
      });
      // Optionally show alert if user is online

    };

    socket.on('shipment_updated', handleShipmentUpdated);
    return () => {
      socket.off('shipment_updated', handleShipmentUpdated);
    };
  }, [socket]);

  const handleRejectCounterOffer = async (bidId: string) => {
    try {
      const res = await authFetch(`/api/bids/${bidId}/reject-counter`, { method: 'POST' });
      if (res.ok) {
        // Assuming toast and fetchActiveBids are defined elsewhere
        // toast.success("تم رفض عرض البائع المضاد.", { icon: '🤝' });
        // fetchActiveBids();
      }
    } catch (e) {
      // toast.error("حدث خطأ أثناء رفض العرض");
    }
  };

  const handleCancelTransport = async (invoiceId: string) => {
    if (!window.confirm("تحذير: اختيارك لهذا الخيار يعني أنك تتكفل بنقل السيارة وشحنها شخصياً وستُلغى فواتير النقل التابعة لنا. هل أنت متأكد؟")) return;
    try {
      const res = await authFetch(`/api/invoices/${invoiceId}/cancel-transport`, { method: 'POST' });
      if (res.ok) {
        showAlert("تم اختيار النقل الشخصي بنجاح 🚚", 'success'); // Using showAlert as toast is not defined in this snippet
        // Assuming fetchInvoices and fetchShipments are available in this scope
        // fetchInvoices();
        // fetchShipments();
      } else {
        const d = await res.json();
        showAlert(d.error || "حدث خطأ أثناء الطلب", 'error');
      }
    } catch (e) {
      showAlert("فشل الاتصال بالخادم", 'error');
    }
  };

  const submitPayment = async () => {
    if (!selectedInvoice) return;
    
    // Validate Wallet Balance if selected
    if (paymentMethod === 'wallet') {
      const currentBalance = effectiveUser.deposit || 0;
      if (currentBalance < selectedInvoice.amount) {
        showAlert('رصيد المحفظة غير كافٍ لسداد هذه الفاتورة. يرجى شحن الرصيد أولاً.', 'error');
        return;
      }
    }

    setPaymentLoading(true);
    try {
      if (!paymentMethod) {
        showAlert('يرجى اختيار طريقة الدفع أولاً', 'error');
        setPaymentLoading(false);
        return;
      }

      // Plutu bank card redirect flow
      if (paymentMethod === 'plutu') {
        const res = await authFetch('/api/payments/plutu/localbank/create', {
          method: 'POST',
          body: JSON.stringify({ amount: selectedInvoice.amount, invoiceId: selectedInvoice.id, type: 'invoice_payment' })
        });
        const data = await res.json();
        if (data.redirect_url) {
          window.location.href = data.redirect_url;
          return;
        } else {
          showAlert(data.error || 'فشل الدفع', 'error');
          setPaymentLoading(false);
          return;
        }
      }

      const res = await authFetch(`/api/invoices/${selectedInvoice.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: paymentMethod,
          referenceNo,
          receiptUrl,
          userId: effectiveUser.id
        })
      });

      if (res.ok) {
        const data = await res.json();
        // Update local state
        setInvoices(prev => prev.map(inv => 
          inv.id === selectedInvoice.id 
            ? { ...inv, status: data.status, pickupAuthCode: data.pickupAuthCode, paidVia: paymentMethod } 
            : inv
        ));
        
        // Update user balance if wallet was used
        if (paymentMethod === 'wallet' && data.status === 'paid') {
           setCurrentUser({ ...effectiveUser, deposit: (effectiveUser.deposit || 0) - selectedInvoice.amount });
        }

        showAlert(data.message || 'تمت العملية بنجاح', 'success');
        setPaymentSuccess(true);
        setReferenceNo('');
        setReceiptUrl('');
        
        // Finalize
        setTimeout(() => {
          setShowPaymentModal(false);
          setPaymentSuccess(false);
        }, 1500);

      } else {
        const err = await res.json();
        showAlert(err.error || 'فشل عملية الدفع', 'error');
      }
    } catch (e) {
      showAlert('حدث خطأ أثناء الاتصال بالخادم', 'error');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handlePayInvoice = (id: string) => {
    const inv = invoices.find(i => i.id === id);
    if (inv) {
      setSelectedInvoice(inv);
      setShowPaymentModal(true);
    }
  };

  const handleConfirmDelivery = async (id: string) => {
    if (!window.confirm('هل أنت متأكد أنك استلمت السيارة وقمت بمعاينتها؟ لا يمكن التراجع عن هذا الإجراء وسيتم تحويل قيمة السداد للبائع المستحق.')) return;
    try {
      const res = await authFetch(`/api/user/invoices/${id}/confirm-delivery`, { method: 'POST' });
      if (res.ok) {
        setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'delivered_to_buyer' } : inv));
        showAlert('تم تأكيد الاستلام بنجاح. مبروك سيارتك الجديدة!', 'success');
      } else {
        showAlert('فشل تأكيد الاستلام', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالشبكة', 'error');
    }
  };

  const handleRequestShipping = async (carId: string) => {
    try {
      const res = await authFetch(`/api/shipments/${carId}/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUser.id })
      });
      if (res.ok) {
        showAlert('تم إرسال طلب الشحن بنجاح! جاري تحويلك للتتبع...', 'success');

        // Refresh shipments to show the new status then navigate to tracking
        const updatedShipments = await authFetch(`/api/shipments/user/${effectiveUser.id}`).then(r => r.json());
        setShipments(updatedShipments);

        // Slight delay to ensure state update completes before switching view
        setTimeout(() => navigateTo('logistics'), 300);
      } else {
        showAlert('فشل إرسال طلب الشحن', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    }
  };

  const handleDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    setIsSubmittingDeposit(true);
    try {
      const res = await authFetch('/api/wallet/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUser.id, amount, method: 'bank_transfer' })
      });

      if (res.ok) {
        showAlert('تم إرسال طلب الشحن بنجاح! سيتم تحديث رصيدك بعد مراجعة الإدارة.', 'success');
        setShowDepositModal(false);
        // Refresh transaction list
        authFetch(`/api/wallet/${effectiveUser.id}/transactions`).then(r => r.json()).then(setTransactions);
      } else {
        showAlert('فشل إتمام العملية. يرجى المحاولة لاحقاً.', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  const handleInspectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectionForm.carDetails) {
      showAlert('يرجى إدخال تفاصيل السيارة', 'error');
      return;
    }

    const res = await authFetch('/api/inspections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: effectiveUser.id,
        carMake: inspectionForm.carDetails.split(' ')[0] || 'Unknown',
        carModel: inspectionForm.carDetails.split(' ').slice(1).join(' ') || 'Unknown',
        carYear: new Date().getFullYear(),
        vin: 'PENDING',
        notes: `Location: ${inspectionForm.location}, Urgency: ${inspectionForm.urgency}`
      })
    });

    if (res.ok) {
      showAlert('تم إرسال طلب الفحص بنجاح', 'success');
      setShowInspectionModal(false);
      setInspectionForm({ carDetails: '', location: '', urgency: 'normal' });
    } else {
      showAlert('فشل إرسال طلب الفحص', 'error');
    }
  };

  const handleSellSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sellForm.images.length < 10) {
      showAlert('يرجى رفع 10 صور على الأقل للسيارة', 'error');
      return;
    }
    try {
      const res = await authFetch('/api/cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sellForm, sellerId: effectiveUser.id })
      });
      if (res.ok) {
        showAlert('تم إرسال السيارة للمراجعة بنجاح', 'success');
        setSellForm({
          vin: '', make: '', model: '', year: '', reservePrice: '', location: '',
          odometer: '', transmission: 'automatic', engine: '', drive: 'AWD',
          primaryDamage: 'None', titleType: 'Clean', videoUrl: '',
          inspectionPdf: '', description: '', images: [], acceptOffers: true
        });
      } else {
        const err = await res.json();
        showAlert(err.error || 'فشل إرسال البيانات', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    }
  };

  const navigateTo = (v: string) => {
    if (v === 'go_home') {
      window.location.href = '/';
      return;
    }
    setSearchParams({ view: v });
  };

  const renderOverview = () => {
    const totalExposure = activeBids.reduce((sum, car) => sum + (car.currentBid || 0), 0);
    const availableBuyingPower = (effectiveUser.buyingPower || 0) - totalExposure;

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* [kyc-uploader] Post-signup checklist asking buyers to upload
            national-ID or passport so they can bid. Hides itself once
            KYC is approved. */}
        <KycDocumentsUploader />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: t('userDashboard.overview.availablePower'), value: `$${availableBuyingPower.toLocaleString()}`, icon: Wallet, color: 'text-orange-500', bg: 'bg-orange-50', title: t('userDashboard.overview.availablePowerDesc'), link: 'wallet' },
            { label: t('userDashboard.overview.committedBids'), value: `$${totalExposure.toLocaleString()}`, icon: Gavel, color: 'text-slate-900', bg: 'bg-slate-100', title: t('userDashboard.overview.committedBidsDesc'), link: 'bids' },
            { label: t('userDashboard.overview.wonCars'), value: wonCars.length, icon: Trophy, color: 'text-yellow-600', bg: 'bg-yellow-50', title: t('userDashboard.overview.wonCarsDesc'), link: 'bids' },
            { label: t('userDashboard.overview.unpaidInvoices'), value: invoices.filter(i => i.status === 'unpaid' || i.status === 'pending').length, icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50', title: t('userDashboard.overview.unpaidInvoicesDesc'), link: 'invoices' },
          ].map((stat, i) => (
            <div key={i} onClick={() => navigateTo(stat.link)} className={`${glassCardClasses} p-6 flex flex-col items-center text-center group cursor-pointer hover:border-orange-500/20 transition-all`} title={stat.title}>
              <div className={`${stat.bg} ${stat.color} p-4 rounded-2xl mb-4 shadow-sm group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="text-2xl font-black text-slate-900 mb-1">{stat.value}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" aria-hidden="true" />
              {t('userDashboard.overview.biddingActivity')}
            </h3>
            <div className="space-y-4">
              {activeBids.map(car => (
                <div key={car.id} onClick={() => navigateTo('bids')} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all group">
                  <div className="flex items-center gap-3">
                    {car.images?.[0] ? (
                      <img src={car.images[0]} className="w-12 h-12 rounded-xl object-cover shadow-sm group-hover:scale-110 transition-transform" alt={`صورة السيارة ${car.make} ${car.model}`} />
                    ) : (
                      <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black">{car.make[0]}</div>
                    )}
                    <div>
                      <div className="font-bold text-slate-900">{car.make} {car.model}</div>
                      <div className="text-[10px] text-slate-400 font-mono">LOT #{car.lotNumber}</div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-black text-slate-900">${car.currentBid?.toLocaleString()}</div>
                    <div className="text-[10px] font-bold text-green-500 uppercase tracking-tighter flex items-center gap-1">
                      {t('userDashboard.overview.winningCurrently')}
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    </div>
                  </div>
                </div>
              ))}
              {activeBids.length === 0 && <div className="text-center py-8 text-slate-400 text-sm italic font-bold">{t('userDashboard.overview.noActiveBids')}</div>}
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2 mb-6">
              <Bell className="w-5 h-5 text-orange-500" />
              {t('userDashboard.overview.recentActivities')}
            </h3>

            {/* Unpaid Invoices Link */}
            {invoices.filter(i => i.status === 'unpaid' || i.status === 'pending').length > 0 && (
              <div onClick={() => navigateTo('invoices')} className="bg-orange-50 p-6 rounded-3xl border border-orange-100 cursor-pointer hover:bg-orange-100 transition-all group flex items-center justify-between shadow-sm hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="bg-orange-500 text-white p-3 rounded-xl shadow-sm group-hover:scale-110 transition-transform"><FileText className="w-5 h-5" /></div>
                  <div>
                    <div className="font-black text-slate-900">{t('userDashboard.overview.unpaidPendingInvoices', { count: invoices.filter(i => i.status === 'unpaid' || i.status === 'pending').length })}</div>
                    <div className="text-xs font-bold text-slate-500 mt-1">{t('userDashboard.overview.payToAvoidFees')}</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-orange-400 rtl:rotate-180" />
              </div>
            )}

            {/* Shipments Link */}
            {shipments.length > 0 && (
              <div onClick={() => navigateTo('logistics')} className="bg-blue-50 p-6 rounded-3xl border border-blue-100 cursor-pointer hover:bg-blue-100 transition-all group flex items-center justify-between shadow-sm hover:shadow-md">
                <div className="flex items-center gap-4">
                  <div className="bg-blue-600 text-white p-3 rounded-xl shadow-sm group-hover:scale-110 transition-transform"><Truck className="w-5 h-5" /></div>
                  <div>
                    <div className="font-black text-slate-900">{t('userDashboard.overview.activeShipments', { count: shipments.length })}</div>
                    <div className="text-xs font-bold text-slate-500 mt-1">{t('userDashboard.overview.trackShipment')}</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-blue-400 rtl:rotate-180" />
              </div>
            )}

            {/* Messages Link */}
            <div onClick={() => navigateTo('messages')} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm cursor-pointer hover:bg-slate-50 transition-all group flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-sm group-hover:scale-110 transition-transform"><MessageSquare className="w-5 h-5" /></div>
                <div>
                  <div className="font-black text-slate-900">{t('userDashboard.overview.messagesSupport')}</div>
                  <div className="text-xs font-bold text-slate-500 mt-1">{t('userDashboard.overview.contactSupport')}</div>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 rtl:rotate-180" />
            </div>

            {/* Fallback Empty Activities */}
            {invoices.filter(i => i.status === 'unpaid' || i.status === 'pending').length === 0 && shipments.length === 0 && (
              <div className="bg-slate-50 p-8 rounded-3xl border border-dashed border-slate-200 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <div className="font-black text-slate-700">{t('userDashboard.overview.noPendingTasks')}</div>
                <div className="text-xs text-slate-400 mt-1 font-bold">{t('userDashboard.overview.everythingLooksGreat')}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderWallet = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-slate-900 tracking-tight">{t('userDashboard.wallet.title')}</h2>
        <button
          onClick={() => setShowDepositModal(true)}
          className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black shadow-xl hover:bg-orange-500 transition-all flex items-center gap-2"
        >
          <CreditCard className="w-5 h-5" />
          {t('userDashboard.wallet.depositBtn')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
          <WalletIcon className="absolute -top-6 -right-6 w-32 h-32 text-white/5 transition-transform group-hover:scale-110" />
          <div className="relative z-10">
            <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{t('userDashboard.wallet.walletBalance')}</div>
            <div className="text-5xl font-black mb-8 text-orange-500">${(effectiveUser.deposit || 0).toLocaleString()}</div>
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <Shield className="w-4 h-4 text-emerald-400" />
              {t('userDashboard.wallet.protectedAccount')}
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl group hover:border-orange-200 transition-all">
          <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{t('userDashboard.wallet.buyingPower')}</div>
          <div className="text-4xl font-black text-slate-900 mb-8 tracking-tight">${(effectiveUser.buyingPower || 0).toLocaleString()}</div>
          <div className="flex items-center gap-2 text-xs text-orange-500 font-black">
            <Gavel className="w-4 h-4" />
            {t('userDashboard.wallet.currentBidLimit', { multiplier: branchConfig?.default_buying_power_multiplier || 10 })}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl group hover:border-blue-200 transition-all">
          <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{t('userDashboard.wallet.totalTransactions')}</div>
          <div className="text-4xl font-black text-slate-900 mb-8 tracking-tight">{transactions.length}</div>
          <div className="flex items-center gap-2 text-xs text-blue-500 font-black">
            <History className="w-4 h-4" />
            {t('userDashboard.wallet.fullActivityLog')}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-black text-slate-900">{t('userDashboard.wallet.financialLogTitle')}</h3>
          <Filter className="w-5 h-5 text-slate-400 cursor-pointer" />
        </div>
        <div className="divide-y divide-slate-50">
          {transactions.map(tx => (
            <div key={tx.id} className="px-8 py-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tx.type === 'deposit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                  {tx.type === 'deposit' ? <ArrowUpRight className="w-6 h-6" /> : <TrendingUp className="rotate-180 w-6 h-6" />}
                </div>
                <div>
                  <div className="font-bold text-slate-900">{tx.type === 'deposit' ? t('userDashboard.wallet.deposit') : t('userDashboard.wallet.bidPayment')}</div>
                  <div className="text-xs text-slate-400">{new Date(tx.timestamp).toLocaleString(i18n.language === 'ar' ? 'ar-EG' : 'en-US')}</div>
                </div>
              </div>
              <div className={`text-xl font-black ${tx.type === 'deposit' ? 'text-green-600' : 'text-slate-900'}`}>
                {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString()}
              </div>
            </div>
          ))}
          {transactions.length === 0 && <div className="p-12 text-center text-slate-400 italic font-bold">{t('userDashboard.wallet.noFinancialLogs')}</div>}
        </div>
      </div>
    </div>
  );

  const renderInvoices = () => {
    // Group invoices by carId and Deduplicate
    const groupedInvoices = (invoices || []).reduce((acc: Record<string, any[]>, inv: any) => {
      if (!acc[inv.carId]) acc[inv.carId] = [];
      // Deduplicate: check if an invoice with same TYPE and carId already exists in this group
      // This is safer than just ID if there's any ID mismatch causing double rendering
      if (!acc[inv.carId].some(existing => existing.type === inv.type)) {
        acc[inv.carId].push(inv);
      }
      return acc;
    }, {} as Record<string, typeof invoices>);

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h2 className="text-3xl font-black text-slate-900">{t('userDashboard.invoices.title')}</h2>

        {Object.keys(groupedInvoices).length === 0 ? (
          <div className="bg-white p-20 rounded-[3rem] border border-slate-100 shadow-xl text-center">
            <FileText className="w-16 h-16 text-slate-200 mx-auto mb-6" />
            <h3 className="text-xl font-black text-slate-400">{t('userDashboard.invoices.noInvoices')}</h3>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedInvoices).map(([carId, carInvoices]) => {
              const primaryInv = carInvoices.find((i: any) => i.type === 'purchase') || carInvoices[0];
              const sortedInvoices = [...carInvoices].sort((a: any, b: any) => {
                const orderMap = { 'purchase': 1, 'transport': 2, 'shipping': 3 };
                return (orderMap[a.type as keyof typeof orderMap] || 9) - (orderMap[b.type as keyof typeof orderMap] || 9);
              });

              return (
                <div key={carId} className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-xl relative overflow-hidden group">
                  {/* Car Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 mb-8 gap-4">
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-slate-950 rounded-3xl flex items-center justify-center text-white shrink-0 shadow-2xl shadow-slate-950/20">
                         <Car className="w-10 h-10 text-orange-500" />
                      </div>
                      <div>
                        <h3 className="text-3xl font-black text-slate-900 tracking-tight">{primaryInv.year} {primaryInv.make} {primaryInv.model}</h3>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <span className="text-xs font-mono font-black text-slate-900 bg-orange-100 border border-orange-200 px-4 py-1.5 rounded-xl flex items-center gap-2">
                             <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                             LOT: {primaryInv.lotNumber || 'غير متوفر'}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 px-4 py-1.5 rounded-xl border border-slate-100 flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" /> VIN: {primaryInv.vin || 'بانتظار التأكيد'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3 Sequential Invoices */}
                  <div className="grid grid-cols-1 gap-5 relative z-10">
                    <div className="absolute top-0 right-7 md:right-8 w-1 h-full bg-slate-100 rounded-full z-0 hidden md:block"></div>

                    {sortedInvoices.map((inv: any, idx) => (
                      <div key={inv.id} className={`relative z-10 bg-white border ${inv.status === 'unpaid' ? 'border-orange-300 shadow-lg shadow-orange-100' : 'border-slate-200 shadow-sm'} p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center md:items-start gap-6 transition-all`}>
                        <div className="flex items-center gap-5 w-full md:w-auto">
                          <div className={`w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center text-xl font-black shadow-inner border ${['paid', 'release_issued', 'delivered_to_buyer', 'seller_paid_by_admin'].includes(inv.status) ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : inv.status === 'pending' ? 'bg-slate-50 text-slate-400 border-slate-200' : inv.status === 'cancelled_self_pickup' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-orange-50 text-orange-600 border-orange-200'}`}>
                            {idx + 1}
                          </div>
                          <div>
                            <div className="font-black text-xl text-slate-900 flex items-center gap-2">
                              {(!inv.type || inv.type === 'purchase') ? t('userDashboard.invoices.carPriceComplete') :
                                inv.type === 'transport' ? t('userDashboard.invoices.inlandTransport') :
                                  inv.type === 'shipping' ? t('userDashboard.invoices.oceanShipping') : t('userDashboard.invoices.otherInvoice')}
                            </div>
                            <div className="text-xs text-slate-400 font-bold mt-1 tracking-wider">INV-{inv.id.toUpperCase().substring(0, 8)}</div>
                          </div>
                        </div>

                        <div className="flex flex-col items-center md:items-end gap-3 w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
                          <div className={`text-3xl font-black px-5 py-2 rounded-2xl border ${inv.status === 'cancelled_self_pickup' ? 'bg-slate-100 border-slate-200 text-slate-400 line-through' : 'bg-slate-50 border-slate-100 text-slate-800'}`}>
                            ${inv.amount.toLocaleString()}
                          </div>

                          <div className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest w-full text-center md:w-auto ${['paid', 'release_issued', 'delivered_to_buyer', 'seller_paid_by_admin'].includes(inv.status) ? 'bg-emerald-100 text-emerald-700' : (inv.status === 'pending_confirmation' || inv.status === 'pending') ? 'bg-slate-100 text-slate-500' : inv.status === 'cancelled_self_pickup' ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-700'}`}>
                            {['paid', 'release_issued', 'delivered_to_buyer', 'seller_paid_by_admin'].includes(inv.status) ? t('userDashboard.invoices.paidSuccess') :
                              inv.status === 'pending_confirmation' ? 'بانتظار تأكيد الإدارة ⏳' :
                                inv.status === 'pending' ? t('userDashboard.invoices.pendingWaitingPrevious') :
                                  inv.status === 'cancelled_self_pickup' ? t('userDashboard.invoices.cancelledSelfPickup') : t('userDashboard.invoices.waitingPayment')}
                          </div>

                          {inv.status === 'unpaid' && (
                            <div className="w-full flex flex-col gap-2 mt-1">
                              <button
                                onClick={() => handlePayInvoice(inv.id)}
                                className="w-full md:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 rounded-xl font-black transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 text-sm"
                              >
                                {t('userDashboard.invoices.payInvoice')}
                              </button>

                              {/* New Self-Transport Action available only on Transport Stage */}
                              {inv.type === 'transport' && (
                                <button
                                  onClick={() => handleCancelTransport(inv.id)}
                                  className="w-full md:w-auto bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 px-8 py-2.5 rounded-xl font-black transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 text-xs"
                                  title={t('userDashboard.invoices.selfTransportTitle')}
                                >
                                  {t('userDashboard.invoices.selfTransportBtn')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Auth Code & Delivery block (Tied to primary car purchase invoice or successful delivery) */}
                  {['paid', 'release_issued', 'delivered_to_buyer', 'seller_paid_by_admin'].includes(primaryInv.status) && (
                    <div className="bg-emerald-50/50 p-6 md:p-8 rounded-3xl border border-emerald-100 relative mt-8">
                      <div className="text-[11px] font-black text-emerald-700 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
                        <Shield className="w-5 h-5" /> {t('userDashboard.invoices.authPickup')}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100">
                          <div className="text-xs font-bold text-slate-400 mb-2">{t('userDashboard.invoices.authCode')}</div>
                          <div className="text-2xl font-mono font-black text-emerald-700 tracking-[0.2em]">
                            {primaryInv.pickupAuthCode || `AUTH-${primaryInv.id.substring(0, 8).toUpperCase()}`}
                          </div>
                        </div>

                        {/* Storage Timer Alert */}
                        <div className="bg-white p-5 rounded-2xl shadow-sm border border-emerald-100 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                              <Clock className="w-5 h-5 text-orange-500" />
                            </div>
                            <div className="text-xs font-bold text-slate-600">{t('userDashboard.invoices.freeStorage')}</div>
                          </div>
                          <div className="text-sm font-black text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg border border-orange-100">
                            {(() => {
                              const days = Math.ceil((new Date(primaryInv.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                              return days > 0 ? t('userDashboard.invoices.daysLeft', { days }) : t('userDashboard.invoices.storageFeesStarted');
                            })()}
                          </div>
                        </div>
                      </div>

                      {primaryInv.status === 'release_issued' && (
                        <button
                          onClick={() => handleConfirmDelivery(primaryInv.id)}
                          className="mt-6 w-full flex items-center justify-center gap-3 bg-purple-600 text-white py-4 rounded-2xl font-black hover:bg-purple-700 transition-all border border-purple-800 shadow-xl cursor-pointer"
                        >
                          <CheckCircle2 className="w-6 h-6" />
                          {t('userDashboard.invoices.confirmDeliveryFinal')}
                        </button>
                      )}

                      {(primaryInv.status === 'delivered_to_buyer' || primaryInv.status === 'seller_paid_by_admin') && (
                        <div className="mt-6 p-4 bg-emerald-100/50 rounded-2xl text-emerald-800 text-sm font-black flex items-center justify-center gap-2 border border-emerald-200">
                          <CheckCircle2 className="w-5 h-5" />
                          {t('userDashboard.invoices.deliveryCompleted')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderBids = () => {
    // Categorize Bids
    const winningCars = activeBids.filter(b => b.winnerId === currentUser?.id && (b.status === 'live' || b.status === 'upcoming'));
    const pendingCarsList = activeBids.filter(b => b.status === 'pending_approval' && b.winnerId === currentUser?.id && !b.sellerCounterPrice);
    const counterOfferedCars = activeBids.filter(b => b.status === 'pending_approval' && b.winnerId === currentUser?.id && b.sellerCounterPrice);
    const activeBidsList = activeBids.filter(b => b.winnerId !== currentUser?.id && (b.status === 'live' || b.status === 'upcoming'));
    const lostList = lostAuctions;

    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between bg-slate-50 p-6 md:p-8 rounded-[3rem] border border-slate-100 shadow-sm gap-6">
          <div>
            <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3">{t('userDashboard.bids.title')} <Gavel className="w-8 h-8 text-orange-500" /></h2>
            <p className="text-slate-500 font-bold mt-2 tracking-wide text-sm max-w-lg">{t('userDashboard.bids.subtitle')}</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { id: 'winning', label: t('userDashboard.bids.tabWinning'), count: winningCars.length, icon: Trophy, activeColor: 'bg-emerald-500 text-white', defaultColor: 'bg-white text-emerald-600 hover:bg-emerald-50 border-emerald-100' },
              { id: 'pending', label: t('userDashboard.bids.tabPending'), count: pendingCarsList.length, icon: Clock, activeColor: 'bg-orange-500 text-white', defaultColor: 'bg-white text-orange-600 hover:bg-orange-50 border-orange-100' },
              { id: 'counter', label: t('userDashboard.bids.tabCounter'), count: counterOfferedCars.length, icon: TrendingUp, activeColor: 'bg-purple-600 text-white', defaultColor: 'bg-white text-purple-600 hover:bg-purple-50 border-purple-100' },
              { id: 'active', label: t('userDashboard.bids.tabActive'), count: activeBidsList.length, icon: Gavel, activeColor: 'bg-blue-600 text-white', defaultColor: 'bg-white text-blue-600 hover:bg-blue-50 border-blue-100' },
              { id: 'lost', label: t('userDashboard.bids.tabLost'), count: lostList.length, icon: AlertCircle, activeColor: 'bg-red-500 text-white', defaultColor: 'bg-white text-red-600 hover:bg-red-50 border-red-100' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${activeTab === tab.id ? tab.activeColor : tab.defaultColor} ${activeTab === tab.id ? 'shadow-lg scale-105' : 'shadow-sm'}`}
              >
                <div className="flex items-center gap-1 mb-1">
                  <tab.icon className="w-4 h-4" />
                  <span className="font-black text-xl font-mono">{tab.count}</span>
                </div>
                <div className="text-[10px] uppercase font-black tracking-widest leading-tight text-center">{tab.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Content based on activeTab */}
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl p-8 min-h-[400px]">

          {/* WINNING TAB */}
          {activeTab === 'winning' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-black text-emerald-700 flex items-center gap-2 border-b border-slate-50 pb-4">
                <Trophy className="w-6 h-6" /> {t('userDashboard.bids.winningTitle')}
              </h3>
              {winningCars.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-100 italic text-slate-400 font-bold">{t('userDashboard.bids.noWinningBids')}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {winningCars.map(car => (
                    <div key={car.id} onClick={() => window.location.href = `/car-details/${car.id}`} className="bg-white rounded-3xl shadow-sm border border-emerald-100 p-6 cursor-pointer hover:border-emerald-300 hover:shadow-lg transition-all group">
                      <div className="text-[10px] font-black w-fit px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full mb-4">🏷️ اللوت: {car.lotNumber}</div>
                      <img src={car.images?.[0] || ''} alt={`${car.make} ${car.model}`} className="w-full h-40 object-cover rounded-2xl mb-4 group-hover:scale-105 transition-transform" />
                      <h4 className="font-black text-slate-900 text-lg mb-1">{car.year} {car.make} {car.model}</h4>
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-xs font-bold text-slate-400">{t('userDashboard.bids.yourBidPrice')}</span>
                        <span className="font-mono font-black text-lg text-emerald-600">${(car.currentBid || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PENDING TAB */}
          {activeTab === 'pending' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-black text-orange-600 flex items-center gap-2 border-b border-slate-50 pb-4">
                <Clock className="w-6 h-6" /> {t('userDashboard.bids.pendingTitle')}
              </h3>
              {pendingCarsList.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-100 italic text-slate-400 font-bold">{t('userDashboard.bids.noPendingCars')}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {pendingCarsList.map(car => (
                    <div key={car.id} onClick={() => window.location.href = `/car-details/${car.id}`} className="bg-white rounded-3xl shadow-sm border-2 border-orange-100 p-6 cursor-pointer hover:border-orange-300 hover:shadow-lg transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-orange-50 rounded-full blur-2xl -mr-10 -mt-10"></div>
                      <div className="relative z-10">
                        <div className="text-[10px] font-black w-fit px-3 py-1 bg-orange-100 text-orange-700 rounded-full mb-4">🏷️ اللوت: {car.lotNumber}</div>
                        <img src={car.images?.[0] || ''} alt={`${car.make} ${car.model}`} className="w-full h-40 object-cover rounded-2xl mb-4 group-hover:scale-105 transition-transform" />
                        <h4 className="font-black text-slate-900 text-lg mb-1">{car.year} {car.make} {car.model}</h4>
                        <div className="font-mono font-black text-2xl text-slate-900 mb-4">${(car.currentBid || 0).toLocaleString()} <span className="text-xs font-bold text-slate-400 inline-block">{t('userDashboard.bids.highestOffer')}</span></div>
                        <div className="text-sm font-bold text-orange-600 bg-orange-50 p-3 rounded-2xl text-center">
                          {t('userDashboard.bids.underReview')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* COUNTER OFFER TAB */}
          {activeTab === 'counter' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-black text-purple-600 flex items-center gap-2 border-b border-slate-50 pb-4">
                <TrendingUp className="w-6 h-6" /> {t('userDashboard.bids.counterTitle')}
              </h3>
              {counterOfferedCars.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-100 italic text-slate-400 font-bold">{t('userDashboard.bids.noCounterOffers')}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {counterOfferedCars.map(car => (
                    <div key={car.id} className="bg-white rounded-3xl shadow-sm border-2 border-purple-200 p-6 flex flex-col md:flex-row gap-6">
                      <div className="w-full md:w-1/3">
                        <img src={car.images?.[0] || ''} alt={`${car.make} ${car.model}`} className="w-full h-full min-h-[120px] object-cover rounded-2xl" />
                      </div>
                      <div className="w-full md:w-2/3 flex flex-col justify-between">
                        <div>
                          <div className="text-[10px] font-black w-fit px-3 py-1 bg-purple-100 text-purple-700 rounded-full mb-2">🏷️ اللوت: {car.lotNumber}</div>
                          <h4 className="font-black text-slate-900 text-lg mb-1">{car.year} {car.make} {car.model}</h4>
                          <div className="flex gap-4 mt-2">
                            <div>
                              <div className="text-[10px] font-bold text-slate-400">{t('userDashboard.bids.originalOffer')}</div>
                              <div className="font-mono font-black text-slate-900 line-through decoration-red-500">${(car.currentBid || 0).toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-bold text-purple-600">{t('userDashboard.bids.newCounterOffer')}</div>
                              <div className="font-mono font-black text-2xl text-purple-700">${car.sellerCounterPrice?.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                          <button
                            onClick={async () => {
                              try {
                                const res = await authFetch(`/api/offers/${car.id}/respond`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ userId: currentUser?.id, action: 'accept' })
                                });
                                if (res.ok) showAlert(t('userDashboard.bids.offerApproved'), 'success');
                              } catch (e) { showAlert(t('userDashboard.bids.error'), 'error'); }
                            }}
                            className="flex-1 bg-slate-900 text-white py-3 rounded-xl text-xs font-black hover:bg-slate-800 transition-colors shadow-lg"
                          >
                            {t('userDashboard.bids.approveAndBuy')}
                          </button>
                          <button
                            onClick={async () => {
                              if (window.confirm(t('userDashboard.bids.rejectCounterWarn'))) {
                                try {
                                  const res = await authFetch(`/api/offers/${car.id}/respond`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: currentUser?.id, action: 'reject' })
                                  });
                                  if (res.ok) showAlert(t('userDashboard.bids.offerRefused'), 'info');
                                } catch (e) { showAlert(t('userDashboard.bids.error'), 'error'); }
                              }
                            }}
                            className="flex-1 bg-white border border-slate-200 text-slate-500 py-3 rounded-xl text-xs font-black hover:bg-slate-50 transition-colors"
                          >
                            {t('userDashboard.bids.finalRejection')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACTIVE (NON-WINNING) TAB */}
          {activeTab === 'active' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-black text-blue-600 flex items-center gap-2 border-b border-slate-50 pb-4">
                <Gavel className="w-6 h-6" /> {t('userDashboard.bids.activeParticipatingTitle')}
              </h3>
              {activeBidsList.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-100 italic text-slate-400 font-bold">{t('userDashboard.bids.noActiveParticipating')}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeBidsList.map(car => (
                    <div key={car.id} onClick={() => window.location.href = `/car-details/${car.id}`} className="bg-white rounded-3xl shadow-sm border border-blue-100 p-6 cursor-pointer hover:border-blue-300 hover:shadow-lg transition-all group relative">
                      <div className="text-[10px] font-black w-fit px-3 py-1 bg-blue-100 text-blue-700 rounded-full mb-4">🏷️ اللوت: {car.lotNumber}</div>
                      <img src={car.images?.[0] || ''} alt={`${car.make} ${car.model}`} className="w-full h-40 object-cover rounded-2xl mb-4 group-hover:scale-105 transition-transform" />
                      <h4 className="font-black text-slate-900 text-lg mb-1">{car.year} {car.make} {car.model}</h4>
                      <div className="flex justify-between items-center mt-4 border-t border-slate-50 pt-4">
                        <span className="text-xs font-bold text-slate-400">{t('userDashboard.bids.currentPrice')}</span>
                        <span className="font-mono font-black text-lg text-slate-900">${(car.currentBid || 0).toLocaleString()}</span>
                      </div>
                      <button className="w-full mt-4 bg-blue-600 text-white py-2 rounded-xl text-xs font-black shadow-lg shadow-blue-500/20 group-hover:bg-blue-700 transition-colors">
                        {t('userDashboard.bids.increaseBid')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LOST TAB */}
          {activeTab === 'lost' && (
            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
              <h3 className="text-xl font-black text-red-600 flex items-center gap-2 border-b border-slate-50 pb-4">
                <AlertCircle className="w-6 h-6" /> {t('userDashboard.bids.lostTitle')}
              </h3>
              {lostList.length === 0 ? (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-100 italic text-slate-400 font-bold">{t('userDashboard.bids.noLostBids')}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {lostList.map(car => (
                    <div key={car.id} onClick={() => window.location.href = `/car-details/${car.id}`} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 cursor-pointer hover:border-red-100 hover:shadow-lg transition-all group opacity-80 hover:opacity-100">
                      <div className="text-[10px] font-black w-fit px-3 py-1 bg-slate-100 text-slate-500 rounded-full mb-4">🏷️ اللوت: {car.lotNumber}</div>
                      <img src={car.images?.[0] || ''} alt={`${car.make} ${car.model}`} className="w-full h-40 object-cover rounded-2xl mb-4 grayscale group-hover:grayscale-0 transition-all" />
                      <h4 className="font-black text-slate-900 text-lg mb-1">{car.year} {car.make} {car.model}</h4>
                      <div className="flex justify-between items-center mt-4">
                        <span className="text-xs font-bold text-slate-500">{t('userDashboard.bids.soldPrice')}</span>
                        <span className="font-mono font-black text-lg text-slate-900">${(car.currentBid || 0).toLocaleString()}</span>
                      </div>
                      <div className="mt-4 text-xs font-black text-red-700 bg-red-50 p-2 rounded-xl text-center">{t('userDashboard.bids.lostReason')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div >
    );
  };

  const renderSellCar = () => (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center">
        <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-3">{t('userDashboard.sell.title')}</h2>
        <p className="text-slate-500 font-medium">{t('userDashboard.sell.subtitle')}</p>
      </div>

      <form onSubmit={handleSellSubmit} className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-2xl space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.vinLock')}</label>
            <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
              required
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-900 font-mono font-bold outline-none focus:border-orange-500 transition-all"
              value={sellForm.vin}
              onChange={e => setSellForm({ ...sellForm, vin: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.year')}</label>
            <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
              required type="number"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-900 font-bold outline-none focus:border-orange-500 transition-all"
              value={sellForm.year}
              onChange={e => setSellForm({ ...sellForm, year: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.make')}</label>
            <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
              required
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-900 font-bold outline-none focus:border-orange-500 transition-all"
              value={sellForm.make}
              onChange={e => setSellForm({ ...sellForm, make: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.model')}</label>
            <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
              required
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-900 font-bold outline-none focus:border-orange-500 transition-all"
              value={sellForm.model}
              onChange={e => setSellForm({ ...sellForm, model: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.reserve')}</label>
            <div className="relative">
              <DollarSign className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
                type="number" required
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 pr-12 text-slate-900 font-bold outline-none focus:border-orange-500 transition-all"
                value={sellForm.reservePrice}
                onChange={e => setSellForm({ ...sellForm, reservePrice: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.odometer')}</label>
            <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
              required type="number"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-900 font-bold outline-none focus:border-orange-500 transition-all"
              value={sellForm.odometer}
              onChange={e => setSellForm({ ...sellForm, odometer: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.uploadImages')}</label>
            <label className="flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all">
              <Camera className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-sm font-bold text-slate-500">
                {sellForm.images.length > 0 ? t('userDashboard.sell.imagesSelected', { count: sellForm.images.length }) : t('userDashboard.sell.uploadImages')}
              </span>
              <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
                type="file" multiple accept="image/*" className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setSellForm({ ...sellForm, images: Array.from(e.target.files) as any });
                  }
                }}
              />
            </label>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.uploadReport')}</label>
            <label className="flex flex-col items-center justify-center h-32 w-full border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-all">
              <FileText className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-sm font-bold text-slate-500">PDF Report</span>
              <input aria-label="مدخل" title="مدخل" type="file" accept=".pdf" className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setSellForm(prev => ({ ...prev, inspectionPdf: e.target.files![0].name }));
                    showAlert('تم رفع التقرير بنجاح', 'success');
                  }
                }}
              />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">{t('userDashboard.sell.descriptionLabel')}</label>
          <textarea aria-label="مدخل" title="مدخل"
            value={sellForm.description}
            onChange={(e) => setSellForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-slate-900 font-bold outline-none focus:border-orange-500 transition-all min-h-[120px]"
            placeholder={t('userDashboard.sell.descriptionPlaceholder')}
          ></textarea>
        </div>

        <button
          type="submit"
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-5 rounded-[2rem] font-black text-lg transition-all shadow-2xl shadow-slate-900/40 active:scale-95 flex items-center justify-center gap-3"
        >
          <Package className="w-6 h-6" />
          إرسال السيارة بانتظار الاعتماد
        </button>
      </form>

      <div className="bg-orange-50 p-6 rounded-3xl flex gap-4 items-start border border-orange-100">
        <Info className="w-6 h-6 text-orange-500 flex-shrink-0" />
        <div className="text-xs text-orange-700 font-bold leading-relaxed">
          سيتم حجز رقم المنفذ (VIN Lock) فور الإرسال. سيقوم فريق المراجعة بالتأكد من البيانات واعتماد السيارة خلال 2-4 ساعات عمل.
        </div>
      </div>
    </div>
  );

  const renderAdminPanel = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-black text-slate-900">غرفة الاعتمادات (Admin Panel) 🛡️</h2>
        <div className="bg-orange-500 text-white px-6 py-2 rounded-full font-black text-xs shadow-lg shadow-orange-500/30">
          {pendingCars.length} طلبات معلقة
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-slate-950 text-white">
              <tr>
                <th className="p-6 font-black text-sm uppercase tracking-widest">المواصفات</th>
                <th className="p-6 font-black text-sm uppercase tracking-widest">VIN Lock</th>
                <th className="p-6 font-black text-sm uppercase tracking-widest">السعر المطلوبة</th>
                <th className="p-6 font-black text-sm uppercase tracking-widest">الإجراءات الحاسمة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingCars.map(car => (
                <tr key={car.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="p-6">
                    <div className="font-black text-slate-900 text-lg group-hover:text-orange-500 transition-colors">{car.year} {car.make} {car.model}</div>
                    <div className="text-xs text-slate-400 font-bold mt-1">البائع: {car.sellerId}</div>
                  </td>
                  <td className="p-6 font-mono font-bold text-slate-500">{car.vin}</td>
                  <td className="p-6 font-black text-slate-900">${car.reservePrice?.toLocaleString()}</td>
                  <td className="p-6">
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          const res = await authFetch(`/api/admin/approve-car/${car.id}`, { method: 'POST' });
                          if (res.ok) {
                            setPendingCars(prev => prev.filter(c => c.id !== car.id));
                            showAlert('تم اعتماد السيارة وستظهر قريباً في المزادات', 'success');
                          }
                        }}
                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2.5 rounded-2xl text-xs font-black shadow-xl shadow-green-600/20 active:scale-95 transition-all"
                      >
                        اعتماد ونشر ✅
                      </button>
                      <button
                        onClick={async () => {
                          const res = await authFetch(`/api/admin/reject-car/${car.id}`, { method: 'POST' });
                          if (res.ok) {
                            setPendingCars(prev => prev.filter(c => c.id !== car.id));
                            showAlert('تم رفض السيارة وإخطار البائع', 'error');
                          }
                        }}
                        className="bg-red-50 hover:bg-red-100 text-red-600 px-6 py-2.5 rounded-2xl text-xs font-black transition-all"
                      >
                        رفض الطلب ❌
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pendingCars.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-20 text-center text-slate-300 font-black italic text-lg bg-slate-50/50">
                    لا توجد طلبات معلقة حالياً. عمل مذهل! ☕
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  /* ── Phase 15: KYC rendered as proper component below ── */

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] lg:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Dynamic Sidebar */}
      <aside 
        ref={sidebarRef}
        className={`
        fixed inset-y-0 right-0 z-[101] w-80 bg-white p-8 pb-12 flex flex-col gap-8 shadow-2xl 
        transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-sm lg:border-l lg:border-slate-100
        overflow-y-auto
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="flex items-center justify-between lg:justify-start">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => { navigateTo('overview'); setIsSidebarOpen(false); }}>
            <div className="w-12 h-12 bg-orange-500 rounded-[1.25rem] flex items-center justify-center text-white shadow-2xl shadow-orange-500/40 rotate-12 group-hover:rotate-0 transition-transform">
              <Car className="w-7 h-7" />
            </div>
            <div>
              {branchConfig ? (
                <div className="text-xl font-black text-slate-950 tracking-tighter leading-tight">
                  {branchConfig.logoText?.split(' ')?.[0]}<br />
                  <span className="text-orange-500">{branchConfig.logoText?.split(' ')?.slice(1)?.join(' ')}</span>
                </div>
              ) : (
                <div className="text-xl font-black text-slate-950 tracking-tighter leading-tight">ليبيا<br /><span className="text-orange-500">AUTO PRO</span></div>
              )}
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">{branchConfig?.logoSubtext || 'Libya'}</div>
            </div>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-600"
            title="إغلاق القائمة"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex flex-col gap-3">
          {[
            { id: 'go_home', label: 'سوق السيارات', icon: Home, customNav: true },
            { id: 'overview', label: 'اللوحة الرئيسية', icon: LayoutDashboard },
            { id: 'bids', label: 'مزاداتي النشطة', icon: Gavel },
            { id: 'watchlist', label: 'المفضلة', icon: Heart },
            { id: 'wallet', label: 'المحفظة والتمويل', icon: WalletIcon },
            { id: 'transactions', label: 'سجل العمليات', icon: History },
            { id: 'invoices', label: 'الفواتير والاستلام', icon: FileText },
            { id: 'logistics', label: 'التتبع والشحن', icon: Truck, badge: shipments.filter(s => s.status !== 'delivered' && s.status !== 'awaiting_payment').length || 0 },
            { id: 'services', label: 'تقارير السوق', icon: BookOpen },
            { id: 'inspections', label: 'فحص السيارات', icon: Shield },
            { id: 'kyc', label: `توثيق الهوية (KYC) ${effectiveUser.kycStatus === 'approved' ? '✅' : effectiveUser.kycStatus === 'pending' ? '⏳' : '⚠️'}`, icon: FileCheck },
            { id: 'invite', label: 'ادعُ صديقاً واربح', icon: Gift },
            { id: 'messages', label: `الرسائل ${unreadCounts.messages > 0 ? `(${unreadCounts.messages})` : ''}`, icon: Mail },
            { id: 'profile', label: 'الملف الشخصي', icon: User },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'go_home') {
                  window.location.href = '/marketplace';
                } else {
                  navigateTo(item.id);
                  setIsSidebarOpen(false);
                }
              }}
              className={`flex items-center justify-between px-6 py-4 rounded-[1.5rem] font-black text-sm transition-all group ${view === item.id
                ? 'bg-slate-950 text-white shadow-2xl shadow-slate-950/40 translate-x-3'
                : (item as any).highlight ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950'
                }`}
            >
              <div className="flex items-center gap-3">
                <item.icon className={`w-5 h-5 ${view === item.id ? 'text-orange-400' : ''}`} />
                {item.label}
              </div>
              <div className="flex items-center gap-2">
                {(item as any).admin && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                {item.id === 'logistics' && (item.badge ?? 0) > 0 && (
                  <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-orange-500/30">
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          ))}
        </nav>

        <button
          onClick={() => {
            setCurrentUser(null);
            localStorage.removeItem('currentUser');
            window.location.href = '/auth';
          }}
          className="flex items-center gap-3 px-6 py-4 rounded-[1.5rem] font-black text-sm text-red-500 hover:bg-red-50 transition-all mt-4 w-full"
          title="تسجيل الخروج"
        >
          <LogOut className="w-5 h-5" />
          تسجيل الخروج
        </button>

        <div className="mt-auto p-6 bg-slate-950 rounded-[2rem] text-white relative overflow-hidden group">
          <div className="relative z-10 text-center">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">الحالة</div>
            <div className="text-xs font-black mb-4">عمولة مخفضة 3% تفعيل</div>
            <button
              onClick={() => navigateTo('bids')}
              className="w-full bg-white text-slate-950 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 hover:text-white transition-all relative"
            >
              تكتات النشطة
              {activeBids.length > 0 && (
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center text-[10px] animate-bounce">
                  {activeBids.length}
                </span>
              )}
            </button>
          </div>
          <Shield className="absolute -bottom-4 -right-4 w-20 h-20 text-white/5 rotate-12" />
        </div>
      </aside>

      {/* Primary Content Viewport */}
      <main className="flex-1 p-4 md:p-8 pb-20 lg:pb-12 overflow-y-auto min-h-screen pt-0">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-4 pb-6 border-b border-slate-100">
          <div className="flex items-center justify-between w-full md:w-auto gap-6 transition-all">
            <div className="flex items-center gap-4 md:gap-6 text-right" dir="rtl">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-3 bg-white border border-slate-100 rounded-2xl text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
                title="فتح القائمة"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="w-12 h-12 md:w-16 md:h-16 bg-slate-950 rounded-2xl flex items-center justify-center text-white shadow-2xl shadow-slate-950/20 relative group cursor-pointer" onClick={() => navigateTo('profile')}>
                <User className="w-6 h-6 md:w-8 md:h-8 text-orange-500 group-hover:scale-110 transition-transform" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-emerald-500 rounded-full border-4 border-white"></div>
              </div>
              <div>
                <h1 className="text-xl md:text-3xl font-black text-slate-950 tracking-tight">
                  أهلاً بك، {effectiveUser.firstName} 👋
                </h1>
                <p className="hidden md:block text-slate-500 font-bold text-sm mt-1">لديك {invoices.filter(i => i.status === 'unpaid').length} فواتير بانتظار الدفع أو المراجعة.</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between w-full md:w-auto gap-4 md:gap-6">
            <div className="flex bg-white p-2 rounded-2xl border border-slate-100 shadow-sm gap-1 md:gap-2">
              <div className="relative" ref={notificationsRef}>
                <button
                  onClick={() => { setShowNotifications(!showNotifications); setShowMessages(false); }}
                  className={`p-3 rounded-xl transition-all relative ${showNotifications ? 'bg-orange-50 text-orange-500' : 'hover:bg-slate-50 text-slate-400'}`}
                >
                  <Bell className="w-6 h-6" />
                  {unreadCounts.notifications > 0 && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-red-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                      {unreadCounts.notifications}
                    </span>
                  )}
                </button>
                {showNotifications && <NotificationDropdown onClose={() => setShowNotifications(false)} />}
              </div>

              <div className="relative" ref={messagesRef}>
                <button
                  onClick={() => { setShowMessages(!showMessages); setShowNotifications(false); }}
                  className={`p-3 rounded-xl transition-all relative ${showMessages ? 'bg-orange-50 text-orange-500' : 'hover:bg-slate-50 text-slate-400'}`}
                >
                  <Mail className="w-6 h-6" />
                  {unreadCounts.messages > 0 && (
                    <span className="absolute top-2.5 right-2.5 w-5 h-5 bg-blue-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                      {unreadCounts.messages}
                    </span>
                  )}
                </button>
                {showMessages && <MessageDropdown onClose={() => setShowMessages(false)} />}
              </div>
            </div>
            <div className="h-10 md:h-14 w-px bg-slate-200"></div>
            <div className="flex items-center gap-3 md:gap-4 group cursor-pointer" onClick={() => navigateTo('profile')}>
              <div className="text-left hidden md:block">
                <div className="text-sm font-black text-slate-900 group-hover:text-orange-500 transition-colors">{effectiveUser.firstName} {effectiveUser.lastName}</div>
                <div className="text-[10px] font-bold text-slate-400 text-right uppercase tracking-[0.2em]">{effectiveUser.role}</div>
              </div>
              <div className="w-10 h-10 md:w-14 md:h-14 bg-slate-950 rounded-xl md:rounded-[1.25rem] flex items-center justify-center text-white font-black text-lg md:text-xl border-2 md:border-4 border-white shadow-2xl group-hover:rotate-6 transition-transform">
                {effectiveUser.firstName?.[0] || 'U'}
              </div>
            </div>
          </div>
        </header>

        {view === 'overview' && renderOverview()}
        {view === 'bids' && renderBids()}
        {view === 'wallet' && renderWallet()}
        {view === 'transactions' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black text-slate-900">سجل العمليات 📜</h2>
              <div className="bg-orange-100 text-orange-600 px-4 py-2 rounded-2xl text-xs font-black">
                {effectiveUser?.deposit ? `الرصيد الحالي: $${effectiveUser.deposit.toLocaleString()}` : ''}
              </div>
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/30">
                <p className="text-slate-500 font-bold">تتبع كافة الحركات المالية والمزادات في حسابك.</p>
              </div>
              
              {transactions.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-200">
                    <History className="w-10 h-10" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 mb-2">لا توجد عمليات مسجلة</h3>
                  <p className="text-slate-400 font-bold">ابدأ بالمزايدة أو شحن المحفظة لتظهر حركاتك هنا.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right" dir="rtl">
                    <thead className="bg-slate-50 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      <tr>
                        <th className="py-6 px-8">العملية / الوصف</th>
                        <th className="py-6 px-8">المبلغ</th>
                        <th className="py-6 px-8">التاريخ</th>
                        <th className="py-6 px-8">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-bold">
                      {transactions.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-6 px-8 text-slate-900">{tx.description}</td>
                          <td className={`py-6 px-8 font-mono ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {tx.type === 'credit' ? '+' : '-'}${tx.amount.toLocaleString()}
                          </td>
                          <td className="py-6 px-8 text-slate-400 text-sm">{new Date(tx.timestamp).toLocaleString('en-US')}</td>
                          <td className="py-6 px-8">
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">
                              مكتملة ✅
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
        {view === 'invoices' && renderInvoices()}
        {view === 'sell' && renderSellCar()}
        {view === 'admin' && effectiveUser.role === 'admin' && renderAdminPanel()}
        {view === 'watchlist' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-3xl font-black text-slate-900">سيارات في المفضلة ❤️</h2>
            {watchlist.length === 0 ? (
              <div className="bg-white p-20 rounded-[3rem] border border-slate-100 shadow-xl text-center">
                <Heart className="w-16 h-16 text-slate-100 mx-auto mb-6" />
                <h3 className="text-xl font-black text-slate-400">لا توجد سيارات في المفضلة حالياً</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {cars.filter(c => watchlist.some(w => w.carId === c.id)).map(car => (
                  <div key={car.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl overflow-hidden group hover:shadow-2xl transition-all">
                    <div className="aspect-video relative overflow-hidden">
                      <img src={car.images[0]} className="w-full h-full object-cover car-card-image group-hover:scale-110 transition-transform duration-700" alt={`صورة السيارة ${car.make} ${car.model}`} />
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-xl text-[10px] font-black shadow-sm">#{car.lotNumber}</div>
                    </div>
                    <div className="p-6">
                      <h3 className="text-lg font-black text-slate-900 mb-4">{car.year} {car.make} {car.model}</h3>
                      <button onClick={() => window.location.href = `/car-details/${car.id}`} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs hover:bg-orange-600 transition-all">مزايدة الآن</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {view === 'logistics' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-3xl font-black text-slate-900">التتبع والشحن 📦</h2>

            {shipments.length === 0 ? (
              <div className="bg-white p-20 rounded-[3rem] border border-slate-100 shadow-xl text-center">
                <Truck className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                <h3 className="text-xl font-black text-slate-400">لا توجد شحنات نشطة حالياً. ادفع فواتير سياراتك واطلب شحنها للبدء بالتتبع.</h3>
              </div>
            ) : (
              <div className="space-y-6">
                {shipments.map((ship: any) => {
                  const steps = [
                    { key: 'car_paid', label: 'سداد السيارة', icon: '💲' },
                    { key: 'inland_paid', label: 'سداد النقل', icon: '💲' },
                    { key: 'in_transit', label: 'النقل البري', icon: '🚛' },
                    { key: 'shipping_paid', label: 'سداد الشحن', icon: '💲' },
                    { key: 'in_shipping', label: 'شحن بحري', icon: '🚢' },
                    { key: 'customs', label: 'التخليص', icon: '📋' },
                    { key: 'delivered', label: 'توصيل', icon: '🎉' }
                  ];

                  // Map existing and new statuses to the timeline index
                  const statusMap: Record<string, string> = {
                    'awaiting_payment': 'none',
                    'paid': 'car_paid',
                    'shipping_requested': 'car_paid',
                    'inland_paid': 'inland_paid',
                    'in_transit': 'in_transit',
                    'in_warehouse': 'in_transit',
                    'shipping_paid': 'shipping_paid',
                    'in_shipping': 'in_shipping',
                    'customs': 'customs',
                    'delivered': 'delivered'
                  };
                  const mappedStatus = statusMap[ship.status] || ship.status;
                  let currentIdx = steps.findIndex(s => s.key === mappedStatus);
                  if (mappedStatus === 'none') currentIdx = -1;

                  return (
                    <div key={ship.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl relative overflow-hidden group">
                      {/* Invoice/Payment Status Badge */}
                      <div className={`absolute top-0 right-0 px-6 py-2 rounded-bl-[2rem] text-xs font-black uppercase tracking-widest ${currentIdx >= 3 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {currentIdx < 0 ? 'بانتظار أداء ثمن السيارة 🛒' :
                          currentIdx < 1 ? 'بانتظار سداد النقل الداخلي 🚛' :
                            currentIdx < 3 ? 'بانتظار سداد الشحن البحري 🚢' :
                              'مدفوعة بالكامل ✅'}
                      </div>

                      <div className="flex items-center gap-6 mb-12 relative z-10 mt-4">
                        {ship.images && ship.images.length > 0 ? (
                          <img src={ship.images[0]} alt={`صورة الشحنة`} className="w-32 h-20 object-cover rounded-2xl shadow-sm border border-slate-200 group-hover:scale-110 transition-transform" />
                        ) : (
                          <div className="w-32 h-20 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200 shadow-sm">
                            <Truck className="w-8 h-8 text-slate-300" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h3 className="text-2xl font-black text-slate-900">{ship.carMake || ship.make} {ship.carModel || ship.model} <span className="text-slate-400 font-bold ml-2">{ship.carYear || ship.year}</span></h3>

                          <div className="flex flex-wrap items-center gap-4 mt-2">
                            <div className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                              LOT #{ship.lotNumber || 'غير متوفر'}
                            </div>
                            <div className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span className="text-slate-500">موقع السيارة:</span> {ship.location || 'مستودع المزاد (غير محدد)'}
                            </div>
                            <div className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 flex items-center gap-1">
                              <span className="text-slate-400">VIN:</span> {ship.vin || 'غير متوفر'}
                            </div>
                            {ship.finalPrice && (
                              <div className="text-xs font-black text-slate-900 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg border border-emerald-100">
                                السعر: ${ship.finalPrice.toLocaleString()}
                              </div>
                            )}

                            {/* Render elapsed times based on payment and shipping creation */}
                            {ship.paidAt && (
                              <div className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 flex items-center gap-1" title="الوقت المنقضي منذ سداد الفاتورة">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                {(() => {
                                  const diff = Math.floor((new Date().getTime() - new Date(ship.paidAt).getTime()) / (1000 * 3600 * 24));
                                  return diff === 0 ? 'دُفعت اليوم' : `منذ ${diff} يوم (الدفع)`;
                                })()}
                              </div>
                            )}
                            {ship.createdAt && ship.status !== 'delivered' && (
                              <div className="text-xs font-bold text-orange-600 bg-orange-100 flex items-center gap-1" title="الزمن المستغرق في عملية الشحن النشطة حتى الآن">
                                <Truck className="w-3.5 h-3.5 text-orange-400" />
                                {(() => {
                                  const diff = Math.floor((new Date().getTime() - new Date(ship.createdAt).getTime()) / (1000 * 3600 * 24));
                                  return diff === 0 ? 'بدأ الشحن اليوم' : `قيد الشحن لـ ${diff} يوم`;
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="relative pt-8 pb-4">
                        <div className="flex items-center justify-between relative z-10">
                          {steps.map((s, i) => (
                            <div key={s.key} className="flex flex-col items-center flex-1 relative">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all duration-500 ${i < currentIdx ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' :
                                i === currentIdx ? 'bg-orange-500 border-orange-500 text-white scale-110 shadow-lg shadow-orange-500/30' :
                                  'bg-slate-50 border-slate-200 text-slate-400'
                                }`}>
                                {i < currentIdx ? <CheckCircle2 className="w-5 h-5" /> : s.icon}
                              </div>
                              <span className={`text-[9px] font-black mt-3 text-center transition-colors duration-500 ${i <= currentIdx ? 'text-slate-900' : 'text-slate-400'
                                }`}>{s.label}</span>
                            </div>
                          ))}
                        </div>
                        <div className="absolute top-5 left-8 right-8 h-1 bg-slate-100 rounded-full">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                            ref={(el) => { if (el) el.style.width = `${(currentIdx / (steps.length - 1)) * 100}%`; }}
                          ></div>
                        </div>
                      </div>
                      {(ship.currentLocation || ship.trackingNumber) && (
                        <div className="mt-4 pt-6 border-t border-slate-50 flex flex-wrap gap-4 justify-between items-center">
                          <div className="flex gap-4">
                            {ship.trackingNumber && (
                              <div className="px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-black text-slate-600 border border-slate-100 flex items-center gap-2">
                                رقم التتبع: <span className="text-slate-900">{ship.trackingNumber}</span>
                              </div>
                            )}
                            {ship.currentLocation && (
                              <div className="px-4 py-2 bg-blue-50 rounded-xl text-[10px] font-black text-blue-700 border border-blue-100 flex items-center gap-2">
                                <MapPin className="w-4 h-4" /> الموقع: {ship.currentLocation}
                              </div>
                            )}
                          </div>
                          <button className="text-xs font-black text-orange-600 hover:text-orange-700 underline underline-offset-4">تحميل تقرير الشحن الكامل</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {view === 'messages' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black text-slate-900">مركز الرسائل والدعم 💬</h2>
              <button
                onClick={() => setShowNewMessageModal(true)}
                className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-orange-500 transition-all shadow-xl flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                رسالة جديدة
              </button>
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
              {messages.length === 0 ? (
                <div className="p-20 text-center">
                  <Mail className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                  <h3 className="text-xl font-black text-slate-400 italic">لا توجد رسائل واردة حالياّ</h3>
                  <p className="text-sm text-slate-400 mt-2">اضغط على "رسالة جديدة" للتواصل مع فريق الدعم</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {messages.map((msg: any) => {
                    const isExpanded = expandedMessageId === msg.id;
                    return (
                    <div
                      key={msg.id}
                      onClick={() => {
                        if (!msg.isRead) markMessageAsRead(msg.id);
                        setExpandedMessageId(isExpanded ? null : msg.id);
                      }}
                      className={`p-8 hover:bg-slate-50/50 transition-all group cursor-pointer ${!msg.isRead ? 'bg-orange-50/20 border-r-4 border-orange-500' : ''}`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white font-black text-sm">
                              {msg.senderFirstName?.[0] || 'إ'}
                            </div>
                            <div>
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                                {msg.category === 'registration' ? 'فريق التسجيل' :
                                  msg.category === 'accounting' ? 'فريق المحاسبة' :
                                    msg.category === 'purchasing' ? 'فريق الشراء' :
                                      msg.category === 'transport' ? 'فريق النقل' :
                                        msg.category === 'clearance' ? 'فريق التخليص الجمركي' :
                                          msg.category === 'shipping' ? 'فريق الشحن' :
                                            msg.category === 'complaints' ? 'فريق الشكاوي والجودة' : 'عام'}
                              </div>
                              <div className="text-sm font-black text-slate-900">{msg.senderFirstName} {msg.senderLastName}</div>
                            </div>
                          </div>
                          <h4 className={`text-lg transition-colors ${!msg.isRead ? 'font-black text-slate-900' : 'font-bold text-slate-600 group-hover:text-slate-900'}`}>{msg.subject}</h4>
                          {!isExpanded && <p className="text-sm text-slate-500 font-medium line-clamp-2 max-w-2xl">{msg.content}</p>}
                        </div>
                        <ChevronDown className={`w-6 h-6 text-slate-300 transition-transform ${isExpanded ? 'rotate-180 text-orange-500' : ''}`} />
                      </div>
                      {isExpanded && (
                        <div className="mt-4 p-6 bg-slate-50 rounded-2xl border border-slate-100 whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
                          {msg.content}
                        </div>
                      )}
                      <div className="text-[10px] font-bold text-slate-400 mt-4">{new Date(msg.timestamp).toLocaleString('en-US')}</div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {showNewMessageModal && (
              <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-start justify-center pt-8 md:pt-16 z-[120] p-4 overflow-y-auto" dir="rtl">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-slate-900">إرسال رسالة للدعم</h3>
                    <button aria-label="زر" title="زر" onClick={() => setShowNewMessageModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                      <X className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">نوع الطلب</label>
                      <select aria-label="تحديد" title="تحديد"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                        value={newMessageData.category}
                        onChange={e => setNewMessageData(p => ({ ...p, category: e.target.value }))}
                      >
                        <option value="registration">فريق التسجيل</option>
                        <option value="accounting">فريق المحاسبة</option>
                        <option value="purchasing">فريق الشراء</option>
                        <option value="transport">فريق النقل</option>
                        <option value="clearance">فريق التخليص الجمركي</option>
                        <option value="shipping">فريق الشحن</option>
                        <option value="complaints">فريق الشكاوي والجودة</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">موضوع الرسالة</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="مدخل"
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-orange-500 transition-all"
                        value={newMessageData.subject}
                        onChange={e => setNewMessageData(p => ({ ...p, subject: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-black text-slate-400 uppercase mb-1.5">نص الرسالة</label>
                      <textarea
                        rows={5}
                        placeholder="اكتب رسالتك هنا..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 font-bold text-sm outline-none focus:border-orange-500 transition-all resize-none"
                        value={newMessageData.content}
                        onChange={e => setNewMessageData(p => ({ ...p, content: e.target.value }))}
                      />
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={async () => {
                          if (!newMessageData.subject.trim() || !newMessageData.content.trim()) {
                            showAlert('يرجى ملء الموضوع ونص الرسالة', 'error');
                            return;
                          }
                          try {
                            const res = await authFetch('/api/messages', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                senderId: effectiveUser.id,
                                receiverId: 'admin-1',
                                subject: newMessageData.subject,
                                content: newMessageData.content,
                                category: newMessageData.category,
                              }),
                            });
                            if (res.ok) {
                              showAlert('✅ تم إرسال رسالتك! سيرد عليك فريق الدعم خلال 24 ساعة.', 'success');
                              setShowNewMessageModal(false);
                              setNewMessageData({ subject: '', content: '', category: 'general' });
                              authFetch(`/api/messages/user/${effectiveUser.id}`)
                                .then(r => r.json())
                                .then(data => setMessages(data))
                                .catch(() => { });
                            } else {
                              showAlert('فشل الإرسال، حاول مرة أخرى', 'error');
                            }
                          } catch {
                            showAlert('خطأ في الاتصال بالخادم', 'error');
                          }
                        }}
                        className="flex-[2] bg-orange-500 hover:bg-orange-400 text-white py-3.5 rounded-2xl font-black transition-all"
                      >
                        📤 إرسال الرسالة
                      </button>
                      <button
                        onClick={() => { setShowNewMessageModal(false); setNewMessageData({ subject: '', content: '', category: 'general' }); }}
                        className="flex-1 bg-slate-100 text-slate-500 py-3.5 rounded-2xl font-black hover:bg-slate-200 transition-all"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {view === 'services' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h2 className="text-3xl font-black text-slate-900">تقارير السوق والأسعار 📊</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { title: 'تحليل أسعار السوق', desc: 'قارن أسعار السيارات المشابهة في السوق المحلي والدولي.', icon: TrendingUp, action: () => navigate('/marketplace') },
                  { title: 'تقرير مبيعات الشهر', desc: 'إحصائيات تفصيلية عن حركة المبيعات والأصناف الأكثر طلباً.', icon: BarChart3, action: () => setShowSalesReport(true) },
                  { title: 'أسعار الشحن المحدثة', desc: 'آخر تحديثات تكاليف الشحن من الموانئ الأمريكية والخليجية.', icon: Ship, action: () => navigate('/shipping') },
                ].map((report, i) => (
                  <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl hover:shadow-2xl transition-all group">
                    <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-6 group-hover:bg-orange-600 group-hover:text-white transition-all">
                      <report.icon className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-black text-slate-900 mb-2">{report.title}</h3>
                    <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed">{report.desc}</p>
                    <button
                      onClick={report.action}
                      className="text-xs font-black text-orange-600 hover:text-orange-700 flex items-center gap-2"
                    >
                      عرض التقرير التفصيلي <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {showSalesReport && (() => {
                const soldCars = cars.filter((c: any) => c.status === 'closed' || c.status === 'sold');
                const thisMonth = soldCars.filter((c: any) => {
                  const d = new Date(c.updatedAt || c.createdAt);
                  const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                });
                const displayCars = thisMonth.length > 0 ? thisMonth : soldCars;
                const avgPrice = displayCars.length ? Math.round(displayCars.reduce((s: number, c: any) => s + (c.currentBid || 0), 0) / displayCars.length) : 0;
                const totalBids = displayCars.reduce((s: number, c: any) => s + (c.bidCount || 0), 0);
                const makeCount: Record<string, number> = {};
                displayCars.forEach((c: any) => { makeCount[c.make] = (makeCount[c.make] || 0) + 1; });
                const topMakes = Object.entries(makeCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
                const prices = displayCars.map((c: any) => c.currentBid || 0).filter((p: number) => p > 0);
                const minPrice = prices.length ? Math.min(...prices) : 0;
                const maxPrice = prices.length ? Math.max(...prices) : 0;
                const topMakeName = topMakes.length > 0 ? topMakes[0][0] : '—';

                return (
                  <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-500 text-right" dir="rtl">
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                          <BarChart3 className="w-6 h-6" />
                        </div>
                        تقرير مبيعات الشهر
                      </h3>
                      <button
                        onClick={() => setShowSalesReport(false)}
                        className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-sm transition-all flex items-center gap-2"
                      >
                        <X className="w-4 h-4" /> العودة للتقارير
                      </button>
                    </div>

                    {displayCars.length === 0 ? (
                      <div className="text-center py-16">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                          <BarChart3 className="w-10 h-10 text-slate-300" />
                        </div>
                        <p className="text-lg font-bold text-slate-400">لا توجد مبيعات مسجلة حالياً</p>
                        <p className="text-sm text-slate-300 mt-2">ستظهر الإحصائيات بمجرد إتمام عمليات بيع على المنصة</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                          <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 p-6 rounded-[2rem] border border-orange-100 text-center">
                            <div className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-2">إجمالي المباع</div>
                            <div className="text-3xl font-black text-orange-600">{displayCars.length}</div>
                            <div className="text-xs font-bold text-orange-400 mt-1">سيارة</div>
                          </div>
                          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-6 rounded-[2rem] border border-emerald-100 text-center">
                            <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">متوسط السعر</div>
                            <div className="text-3xl font-black text-emerald-600">${avgPrice.toLocaleString()}</div>
                            <div className="text-xs font-bold text-emerald-400 mt-1">دولار</div>
                          </div>
                          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-6 rounded-[2rem] border border-blue-100 text-center">
                            <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2">الأكثر طلباً</div>
                            <div className="text-2xl font-black text-blue-600">{topMakeName}</div>
                            <div className="text-xs font-bold text-blue-400 mt-1">ماركة</div>
                          </div>
                          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 p-6 rounded-[2rem] border border-purple-100 text-center">
                            <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2">إجمالي المزايدات</div>
                            <div className="text-3xl font-black text-purple-600">{totalBids}</div>
                            <div className="text-xs font-bold text-purple-400 mt-1">مزايدة</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                            <h4 className="text-sm font-black text-slate-500 mb-4 flex items-center gap-2">
                              <TrendingUp className="w-4 h-4" /> نطاق الأسعار
                            </h4>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="text-[10px] font-black text-slate-400 uppercase mb-1">أقل سعر</div>
                                <div className="text-xl font-black text-slate-800">${minPrice.toLocaleString()}</div>
                              </div>
                              <div className="h-px flex-1 bg-slate-200 mx-4" />
                              <div className="text-left">
                                <div className="text-[10px] font-black text-slate-400 uppercase mb-1">أعلى سعر</div>
                                <div className="text-xl font-black text-slate-800">${maxPrice.toLocaleString()}</div>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                            <h4 className="text-sm font-black text-slate-500 mb-4 flex items-center gap-2">
                              <Car className="w-4 h-4" /> أكثر 5 ماركات مبيعاً
                            </h4>
                            <div className="space-y-3">
                              {topMakes.map(([make, count], idx) => (
                                <div key={make} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center text-xs font-black">{idx + 1}</span>
                                    <span className="text-sm font-bold text-slate-700">{make}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 bg-orange-200 rounded-full" style={{ width: `${Math.max(20, (count / displayCars.length) * 100)}px` }} />
                                    <span className="text-sm font-black text-slate-500">{count}</span>
                                  </div>
                                </div>
                              ))}
                              {topMakes.length === 0 && (
                                <p className="text-sm text-slate-400 font-medium">لا توجد بيانات كافية</p>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-center">
                          <p className="text-xs text-slate-400 font-medium">
                            {thisMonth.length > 0
                              ? `البيانات خاصة بشهر ${new Date().toLocaleDateString('ar-LY', { month: 'long', year: 'numeric' })}`
                              : 'يتم عرض جميع المبيعات المسجلة (لا توجد مبيعات لهذا الشهر بعد)'}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {showReportModal && selectedReport && !showDetailedReport && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[110] p-4 text-right" dir="rtl">
                  <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-10 animate-in zoom-in-95 duration-200">
                    <div className="flex justify-between items-start mb-8">
                      <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                        <selectedReport.icon className="w-8 h-8" />
                      </div>
                      <button aria-label="زر" title="زر" onClick={() => setShowReportModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                        <X className="w-6 h-6 text-slate-400" />
                      </button>
                    </div>

                    <h3 className="text-2xl font-black text-slate-900 mb-2">{selectedReport.title}</h3>
                    <p className="text-slate-500 font-bold mb-8">{selectedReport.desc}</p>

                    <div className="grid grid-cols-2 gap-6 mb-8">
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2">النطاق الزمني</div>
                        <div className="text-lg font-black text-slate-900">آخر 30 يوماً</div>
                      </div>
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase mb-2">دقة المعلومات</div>
                        <div className="text-lg font-black text-emerald-600">99.8% مؤكدة</div>
                      </div>
                    </div>

                    <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 flex gap-4 mb-8">
                      <Info className="w-6 h-6 text-orange-500 shrink-0" />
                      <p className="text-xs text-orange-700 font-bold leading-relaxed">
                        هذا التقرير يستند إلى تحليل البيانات التاريخية لآلاف العمليات المشابهة في المنصة. قد تختلف الأسعار الفعلية بناءً على حالة كل سيارة وتوقيت المزاد.
                      </p>
                    </div>

                    <button
                      onClick={async () => {
                        setShowDetailedReport(true);
                        setLoadingMarketData(true);
                        try {
                          const res = await authFetch('/api/market-data?make=Toyota&model=Camry');
                          const data = await res.json();
                          if (data.success) {
                            setMarketData(data);
                          }
                        } catch (e) {
                          console.error("Failed to load market data", e);
                        } finally {
                          setLoadingMarketData(false);
                        }
                      }}
                      className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                    >
                      <BarChart3 className="w-5 h-5" /> عرض التقرير التفاعلي المفصل
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        {view === 'inspections' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-3xl font-black text-slate-900">طلبات فحص السيارات 🔍</h2>
            <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-xl text-center">
              <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <Shield className="w-12 h-12" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-4">خدمة الفحص الفني المعتمد</h3>
              <p className="text-slate-500 font-medium max-w-lg mx-auto mb-8">
                نوفر لك خدمة فحص فني شاملة بـ 150 نقطة فحص للتأكد من حالة السيارة الميكانيكية والكهربائية قبل الشراء.
              </p>
              <button
                onClick={() => setShowInspectionModal(true)}
                className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black shadow-2xl shadow-slate-900/20 active:scale-95 transition-all"
              >
                طلب فحص سيارة جديدة
              </button>
            </div>

            {showInspectionModal && (
              <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[110] p-4 text-right" dir="rtl">
                <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg p-10 animate-in zoom-in-95 duration-200">
                  <h3 className="text-2xl font-black text-slate-900 mb-6">طلب فحص فني جديد</h3>

                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 mr-1">بيانات السيارة (الماركة، الطراز، VIN)</label>
                      <textarea
                        rows={3}
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 outline-none focus:border-orange-500 transition-all font-bold"
                        placeholder="رقم VIN أو رقم اللوت"
                        value={inspectionForm.carDetails}
                        onChange={e => setInspectionForm(prev => ({ ...prev, carDetails: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 mr-1">موقع تواجد السيارة</label>
                      <input aria-label="ملاحظات إضافية" title="ملاحظات إضافية" placeholder="ملاحظات إضافية (اختياري)"
                        type="text"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 outline-none focus:border-orange-500 transition-all font-bold"
                        value={inspectionForm.location}
                        onChange={e => setInspectionForm(prev => ({ ...prev, location: e.target.value }))}
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 mr-1">درجة الاستعجال</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setInspectionForm(prev => ({ ...prev, urgency: 'normal' }))}
                          className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${inspectionForm.urgency === 'normal' ? 'bg-orange-50 border-orange-500 text-orange-600' : 'bg-slate-50 border-transparent text-slate-400'}`}
                        >
                          عادي (48 ساعة)
                        </button>
                        <button
                          onClick={() => setInspectionForm(prev => ({ ...prev, urgency: 'high' }))}
                          className={`py-4 rounded-2xl font-black text-sm transition-all border-2 ${inspectionForm.urgency === 'high' ? 'bg-red-50 border-red-500 text-red-600' : 'bg-slate-50 border-transparent text-slate-400'}`}
                        >
                          مستعجل (24 ساعة)
                        </button>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-500 shadow-sm shrink-0">
                        <Shield className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-blue-800 mb-1">تقرير معتمد بـ 150 نقطة</div>
                        <p className="text-[10px] text-blue-600 font-bold leading-relaxed">
                          ستحصل على تقرير PDF مفصل مع صور عالية الدقة لكل زوايا السيارة وفحص الكمبيوتر والميكانيكا.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button
                        onClick={() => {
                          if (!inspectionForm.carDetails || !inspectionForm.location) {
                            showAlert('يرجى ملء البيانات المطلوبة', 'error');
                            return;
                          }
                          showAlert('تم إرسال طلب الفحص بنجاح! سيتواصل معك فريق الفحص قريباً.', 'success');
                          setShowInspectionModal(false);
                          setInspectionForm({ carDetails: '', location: '', urgency: 'normal' });
                        }}
                        className="flex-[2] bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl active:scale-95"
                      >
                        تأكيد وإرسال الطلب
                      </button>
                      <button
                        onClick={() => setShowInspectionModal(false)}
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
        )}

        {view === 'profile' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black text-slate-900">الملف الشخصي 👤</h2>
              {!isEditingProfile && (
                <button
                  onClick={() => setIsEditingProfile(true)}
                  className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm hover:bg-orange-500 transition-all flex items-center gap-2"
                >
                  <Edit className="w-5 h-5" />
                  تعديل البيانات
                </button>
              )}
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-full h-2 bg-gradient-to-l from-orange-500 to-amber-400"></div>

              <div className="flex items-center gap-8 mb-10">
                <div className="w-32 h-32 bg-slate-950 rounded-[2.5rem] flex items-center justify-center text-white text-5xl font-black shadow-2xl relative group">
                  {effectiveUser.firstName?.[0] || 'U'}
                  <div className="absolute inset-0 bg-orange-500/80 rounded-[2.5rem] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900">{effectiveUser.firstName} {effectiveUser.lastName}</h3>
                  <p className="text-slate-400 font-bold">{effectiveUser.email}</p>
                  <div className="mt-4 flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${effectiveUser.kycStatus === 'approved' ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
                      {effectiveUser.kycStatus === 'approved' ? 'موثق بالكامل ✅' : 'بانتظار التوثيق ⏳'}
                    </span>
                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black uppercase">عضو {effectiveUser.role === 'admin' ? 'إدارة' : 'تاجر'} ⭐</span>
                  </div>
                </div>
              </div>

              {isEditingProfile ? (
                <form onSubmit={handleUpdateProfile} className="space-y-6 pt-10 border-t border-slate-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">معرف المستخدم (User ID)</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-4 bg-slate-100 rounded-2xl font-bold text-slate-500 border border-slate-200 outline-none cursor-not-allowed"
                        value={effectiveUser.id} disabled />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">البريد الإلكتروني</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-4 bg-slate-100 rounded-2xl font-bold text-slate-500 border border-slate-200 outline-none cursor-not-allowed"
                        value={effectiveUser.email} disabled />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">الاسم الأول</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-4 bg-slate-100 rounded-2xl font-bold text-slate-500 border border-slate-200 outline-none cursor-not-allowed"
                        value={effectiveUser.firstName} disabled />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">الاسم الأخير</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-4 bg-slate-100 rounded-2xl font-bold text-slate-500 border border-slate-200 outline-none cursor-not-allowed"
                        value={effectiveUser.lastName} disabled />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">رقم الهاتف</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-4 bg-slate-100 rounded-2xl font-bold text-slate-500 border border-slate-200 outline-none cursor-not-allowed"
                        value={effectiveUser.phone} disabled />
                      <p className="text-[10px] text-orange-500 px-2 mt-1">لا يمكن تغيير بيانات الهوية أو الاتصال إلا من خلال الإدارة.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">العنوان</label>
                      <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 border border-slate-200 focus:border-orange-500 outline-none transition-all"
                        value={profileForm.address} onChange={e => setProfileForm({ ...profileForm, address: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <button type="submit" disabled={isSavingProfile} className="flex-1 bg-orange-500 text-white py-4 rounded-3xl font-black shadow-xl hover:bg-orange-600 transition-all disabled:opacity-50">
                      {isSavingProfile ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                    </button>
                    <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-3xl font-black hover:bg-slate-200 transition-all">
                      إلغاء
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-10 border-t border-slate-50">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">معرف المستخدم (User ID)</label>
                    <div className="p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 border border-slate-100">{effectiveUser.id}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">البريد الإلكتروني</label>
                    <div className="p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 border border-slate-100">{effectiveUser.email}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">الاسم الأول</label>
                    <div className="p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 border border-slate-100">{effectiveUser.firstName}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">الاسم الأخير</label>
                    <div className="p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 border border-slate-100">{effectiveUser.lastName}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">رقم الهاتف</label>
                    <div className="p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 border border-slate-100">{effectiveUser.phone || '+218 92-000-0000'}</div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">العنوان</label>
                    <div className="p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 border border-slate-100">{effectiveUser.address || 'طرابلس، ليبيا'}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden">
              <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                <Shield className="w-6 h-6 text-orange-500" />
                الأمان وكلمة المرور
              </h3>

              {isChangingPass ? (
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">كلمة المرور الحالية</label>
                    <input aria-label="مدخل" title="مدخل" placeholder="مدخل" type="password" required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-orange-500 font-bold"
                      value={passForm.current} onChange={e => setPassForm({ ...passForm, current: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">كلمة المرور الجديدة</label>
                    <input aria-label="مدخل" title="مدخل" placeholder="مدخل" type="password" required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-orange-500 font-bold"
                      value={passForm.new} onChange={e => setPassForm({ ...passForm, new: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase mb-1.5 block">تأكيد كلمة المرور الجديدة</label>
                    <input aria-label="مدخل" title="مدخل" placeholder="مدخل" type="password" required className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:border-orange-500 font-bold"
                      value={passForm.confirm} onChange={e => setPassForm({ ...passForm, confirm: e.target.value })} />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="submit" disabled={isSavingProfile} className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black hover:bg-orange-500 transition-all disabled:opacity-50">
                      {isSavingProfile ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
                    </button>
                    <button type="button" onClick={() => setIsChangingPass(false)} className="text-slate-400 font-bold hover:text-slate-600">إلغاء</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setIsChangingPass(true)} className="bg-orange-50 text-orange-600 px-8 py-4 rounded-2xl font-black text-sm hover:bg-orange-100 transition-all border border-orange-100">
                  تغيير كلمة المرور الشخصية
                </button>
              )}
            </div>

            <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-xl overflow-hidden mt-8">
              <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                <Bell className="w-6 h-6 text-orange-500" />
                إعدادات الإشعارات (Omnichannel)
              </h3>

              <div className="space-y-4 max-w-lg">
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-slate-900">إشعارات البريد الإلكتروني</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-1">تلقي التنبيهات والفواتير عبر البريد</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleNotificationSetting('emailNotifications')}
                    disabled={isSavingSettings}
                    title={notificationSettings.emailNotifications ? 'إيقاف إشعارات البريد' : 'تفعيل إشعارات البريد'}
                    aria-label={notificationSettings.emailNotifications ? 'إيقاف إشعارات البريد' : 'تفعيل إشعارات البريد'}
                    className={`relative w-14 h-8 rounded-full transition-colors ${notificationSettings.emailNotifications ? 'bg-orange-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${notificationSettings.emailNotifications ? 'right-1' : 'left-1 rtl:right-auto rtl:left-7'}`}></span>
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-slate-900">إشعارات الواتساب (WhatsApp)</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-1">تلقي تنبيهات المزايدات والشحن فوراً</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleNotificationSetting('whatsappNotifications')}
                    disabled={isSavingSettings}
                    title={notificationSettings.whatsappNotifications ? 'إيقاف إشعارات الواتساب' : 'تفعيل إشعارات الواتساب'}
                    aria-label={notificationSettings.whatsappNotifications ? 'إيقاف إشعارات الواتساب' : 'تفعيل إشعارات الواتساب'}
                    className={`relative w-14 h-8 rounded-full transition-colors ${notificationSettings.whatsappNotifications ? 'bg-orange-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all ${notificationSettings.whatsappNotifications ? 'right-1' : 'left-1 rtl:right-auto rtl:left-7'}`}></span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {showDetailedReport && selectedReport && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[115] overflow-y-auto" dir="rtl">
            <div className="min-h-screen flex items-center justify-center p-4">
              <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl p-8 md:p-12 animate-in zoom-in-95 duration-300 relative my-8">
                <div className="flex justify-between items-start mb-10 border-b border-slate-100 pb-8">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-3xl font-black text-slate-900">التحليل الشامل لأسعار السوق</h2>
                        <p className="text-slate-500 font-bold text-sm">مقارنة حية لأسعار السيارات (ليبيا مقابل الاستيراد الامريكي)</p>
                      </div>
                    </div>
                  </div>
                  <button aria-label="زر إغلاق" title="إغلاق التقرير" onClick={() => setShowDetailedReport(false)} className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-all">
                    <X className="w-6 h-6 text-slate-500" />
                  </button>
                </div>

                <div className="flex flex-wrap gap-4 justify-center mb-10">
                  <div className="px-4 py-2 bg-blue-50 text-blue-700 border border-blue-100 rounded-xl text-xs font-black flex items-center gap-2">
                    <Globe className="w-4 h-4" /> مُحلل من فيسبوك (السوق الليبي)
                  </div>
                  <div className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl text-xs font-black flex items-center gap-2">
                    <Store className="w-4 h-4" /> بيانات السوق المفتوح (مؤكدة)
                  </div>
                  <div className="px-4 py-2 bg-orange-50 text-orange-700 border border-orange-100 rounded-xl text-xs font-black flex items-center gap-2">
                    <Car className="w-4 h-4" /> بيانات أوتو برو الحصرية (استيراد)
                  </div>
                </div>

                {selectedReport.title === 'تحليل أسعار السوق' && (
                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 mb-10">
                    <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
                      <TrendingUp className="w-6 h-6 text-slate-400" />
                      متوسط أسعار السيارات المطلوبة حديثاً (مثال: {marketData ? `${marketData.make} ${marketData.model}` : 'تويوتا كامري'})
                    </h3>

                    {loadingMarketData ? (
                      <div className="py-12 flex flex-col items-center justify-center space-y-4">
                        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="text-sm font-bold text-slate-500 animate-pulse">جاري جلب الأسعار الحية من السوق المحلي...</div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                            <span>السوق المحلي (ليبيا - معارض وصفحات فيسبوك)</span>
                            <span className="text-slate-900">~ ${(marketData?.usdEquivalent ? Math.round(marketData.usdEquivalent * 1.05) : 28000).toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-6 overflow-hidden">
                            <div className="bg-slate-400 h-6 rounded-full" style={{ width: '100%' }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-sm font-bold text-slate-600 mb-2">
                            <span>{marketData?.source || 'السوق المفتوح (ليبيا)'}</span>
                            <span className="text-slate-900 font-bold">~ ${(marketData?.usdEquivalent || 27500).toLocaleString()} <span className="text-xs text-slate-400 font-normal">({(marketData?.averageLyd || 192500).toLocaleString()} د.ل)</span></span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-6 overflow-hidden">
                            <div className="bg-blue-400 h-6 rounded-full transition-all duration-1000" style={{ width: '95%' }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between text-sm font-black text-orange-600 mb-2">
                            <span>استيراد مباشر عبر أوتو برو (شامل الشحن والجمارك)</span>
                            <span className="text-orange-600 text-lg">~ ${(marketData?.usdEquivalent ? Math.round(marketData.usdEquivalent * 0.5) : 14000).toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-orange-100 rounded-full h-8 overflow-hidden relative shadow-inner">
                            <div className="bg-gradient-to-l from-orange-400 to-orange-500 h-8 rounded-full shadow-lg relative flex items-center px-4 transition-all duration-1000 delay-500" style={{ width: '50%' }}>
                              <span className="text-white text-xs font-black absolute left-4">توفير 50%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedReport.title === 'تقرير مبيعات الشهر' && (
                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 mb-10 text-right" dir="rtl">
                    <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
                      <BarChart3 className="w-6 h-6 text-slate-400" />
                      إحصائيات المبيعات والأصناف الأكثر طلباً عبر منصة أوتو برو
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
                        <div className="text-sm font-bold text-slate-500 mb-2">إجمالي السيارات المباعة</div>
                        <div className="text-3xl font-black text-orange-500">142</div>
                        <div className="text-xs text-emerald-500 font-bold mt-2">+12% عن الشهر الماضي</div>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
                        <div className="text-sm font-bold text-slate-500 mb-2">حجم المبيعات (دولار)</div>
                        <div className="text-3xl font-black text-orange-500">$1.2M</div>
                        <div className="text-xs text-emerald-500 font-bold mt-8">+8% عن الشهر الماضي</div>
                      </div>
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
                        <div className="text-sm font-bold text-slate-500 mb-2">متوسط التوفير للعملاء</div>
                        <div className="text-3xl font-black text-orange-500">35%</div>
                        <div className="text-xs text-emerald-500 font-bold mt-2">مقارنة بالسوق المحلي</div>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-100 text-slate-500 font-bold">
                          <tr>
                            <th className="py-4 px-6 text-right">الماركة / الطراز</th>
                            <th className="py-4 px-6 text-right">العدد المباع</th>
                            <th className="py-4 px-6 text-right">متوسط سعر البيع</th>
                            <th className="py-4 px-6 text-right">الوجهة الرئيسية</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                          <tr className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-6">Toyota Camry</td>
                            <td className="py-4 px-6">38</td>
                            <td className="py-4 px-6">$14,500</td>
                            <td className="py-4 px-6">ليبيا</td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-6">Hyundai Elantra</td>
                            <td className="py-4 px-6">25</td>
                            <td className="py-4 px-6">$9,200</td>
                            <td className="py-4 px-6">مصر</td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-6">Lexus RX 350</td>
                            <td className="py-4 px-6">14</td>
                            <td className="py-4 px-6">$32,000</td>
                            <td className="py-4 px-6">الإمارات</td>
                          </tr>
                          <tr className="hover:bg-slate-50 transition-colors">
                            <td className="py-4 px-6">Mercedes S500</td>
                            <td className="py-4 px-6">8</td>
                            <td className="py-4 px-6">$85,000</td>
                            <td className="py-4 px-6">السعودية</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedReport.title === 'أسعار الشحن المحدثة' && (
                  <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 mb-10 text-right" dir="rtl">
                    <h3 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
                      <Ship className="w-6 h-6 text-slate-400" />
                      آخر أسعار الشحن المحدثة عبر أوتو برو لجميع الوجهات العربية
                    </h3>

                    <div className="space-y-6">
                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden p-6 shadow-sm mb-4">
                        <h4 className="font-black text-lg text-slate-900 mb-4 border-b border-slate-100 pb-2">من موانئ أمريكا إلى الوجهات العربية</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-bold">
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى ليبيا:</span><span className="text-orange-600">$1,200</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى مصر:</span><span className="text-orange-600">$1,350</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى الإمارات:</span><span className="text-orange-600">$1,100</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى السعودية:</span><span className="text-orange-600">$1,250</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى الأردن:</span><span className="text-orange-600">$1,400</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى عمان:</span><span className="text-orange-600">$1,150</span></div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden p-6 shadow-sm mb-4">
                        <h4 className="font-black text-lg text-slate-900 mb-4 border-b border-slate-100 pb-2">من موانئ ليبيا إلى الوجهات العربية</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-bold">
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى مصر:</span><span className="text-orange-600">$400</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى الإمارات:</span><span className="text-orange-600">$850</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى السعودية:</span><span className="text-orange-600">$750</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى تونس:</span><span className="text-orange-600">$200</span></div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden p-6 shadow-sm mb-4">
                        <h4 className="font-black text-lg text-slate-900 mb-4 border-b border-slate-100 pb-2">من الإمارات إلى الوجهات العربية</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-bold">
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى السعودية:</span><span className="text-orange-600">$300</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى عمان:</span><span className="text-orange-600">$150</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى مصر:</span><span className="text-orange-600">$900</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى ليبيا:</span><span className="text-orange-600">$1,050</span></div>
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden p-6 shadow-sm mb-4">
                        <h4 className="font-black text-lg text-slate-900 mb-4 border-b border-slate-100 pb-2">من السعودية إلى الوجهات العربية</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm font-bold">
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى الإمارات:</span><span className="text-orange-600">$300</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى مصر:</span><span className="text-orange-600">$600</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى الأردن:</span><span className="text-orange-600">$250</span></div>
                          <div className="flex justify-between p-3 bg-slate-50 rounded-xl"><span>إلى البحرين:</span><span className="text-orange-600">$100</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-emerald-50 text-emerald-800 p-6 rounded-2xl mb-10 border border-emerald-100">
                  <div className="flex items-start gap-4">
                    <TrendingUp className="w-8 h-8 text-emerald-600 shrink-0 mt-1" />
                    <div>
                      <h4 className="text-lg font-black mb-2">الخلاصة والتحليل الذكي</h4>
                      <p className="text-sm font-bold leading-relaxed opacity-90">
                        بحسب البيانات الحية وتحليلات الذكاء الاصطناعي لأسعار السيارات في <strong>موقع إقامتك (ليبيا)</strong> مقارنة بمزادات الولايات المتحدة، يتضح أن الاستيراد المباشر للسيارات المستعملة أو المصدومة صدمات خفيفة يوفر لك ما يقارب <strong>50% (نصف التكلفة)</strong> مقارنة بالشراء من السوق المحلي.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 text-white p-8 md:p-10 rounded-[2rem] relative overflow-hidden shadow-2xl">
                  <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-right">
                    <div className="flex-1">
                      <h4 className="text-2xl font-black mb-3">هل تبحث عن الموثوقية والأمان في الاستيراد؟</h4>
                      <p className="text-slate-300 text-sm font-bold leading-relaxed mb-6">
                        إذا كنت تريد جهة موثوقة لتساعدك في استيراد سيارتك بأرخص الأسعار وتتكفل بكافة إجراءات الشحن والجمارك حتى باب بيتك، تواصل معنا الآن.
                      </p>
                    </div>
                    <div className="shrink-0 w-full md:w-auto">
                      <a
                        href="https://www.macchinaa.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full md:w-auto bg-orange-500 text-white px-8 py-4 rounded-xl font-black text-sm hover:bg-orange-400 transition-all shadow-lg hover:shadow-orange-500/50 hover:-translate-y-1 text-center"
                      >
                        تواصل مع مزاد ماكينا
                        <span className="block text-[10px] font-bold text-orange-100 mt-1">أحد فروع مجموعة المزاد الدولي وأوتو برو</span>
                      </a>
                    </div>
                  </div>

                  <div className="absolute top-0 left-0 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2"></div>
                  <div className="absolute bottom-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl translate-y-1/2 translate-x-1/2"></div>
                </div>

              </div>
            </div>
          </div>
        )}

        {view === 'invite' && (
          <div className="p-6 md:p-8 max-w-3xl">
            <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3 mb-6">
              <Gift className="w-7 h-7 text-orange-500" /> ادعُ أصدقاءك واربحوا معاً
            </h2>
            <ReferralCard />
          </div>
        )}

        {view === 'kyc' && (
          <div className="p-6 md:p-8 max-w-3xl">
            <KycPanel
              kycStatus={effectiveUser.kycStatus}
              userId={String(effectiveUser.id)}
              showAlert={showAlert}
            />
          </div>
        )}

        {showDepositModal && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <WalletIcon className="w-6 h-6 text-orange-500" />
                  شحن رصيد المحفظة
                </h3>
                <button aria-label="إغلاق" title="إغلاق" onClick={() => setShowDepositModal(false)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <label className="block text-sm font-bold text-slate-700 mx-1 mb-2">المبلغ (USD)</label>
                <input 
                  type="number" 
                  title="المبلغ"
                  placeholder="أدخل المبلغ بالشكل الصحيح"
                  value={depositAmount} 
                  onChange={(e) => setDepositAmount(e.target.value)} 
                  className="w-full border-2 border-slate-200 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 transition-all text-xl text-center"
                />
                <button 
                  aria-label="طلب شحن" title="طلب شحن"
                  onClick={handleDeposit} 
                  disabled={isSubmittingDeposit}
                  className="w-full mt-6 bg-slate-900 text-white rounded-2xl py-4 font-black hover:bg-orange-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingDeposit ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                  طلب شحن
                </button>
              </div>
            </div>
          </div>
        )}

        {showInspectionModal && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-md overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                  <ShieldCheck className="w-6 h-6 text-indigo-500" />
                  طلب فحص فني
                </h3>
                <button aria-label="إغلاق" title="إغلاق" onClick={() => setShowInspectionModal(false)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleInspectionSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mx-1 mb-2">السيارة (النوع والموديل)</label>
                  <input title="السيارة" required placeholder="مثال: Toyota Camry 2022" value={inspectionForm.carDetails} onChange={(e) => setInspectionForm({...inspectionForm, carDetails: e.target.value})} className="w-full border-2 border-slate-200 rounded-2xl p-3 font-bold outline-none focus:border-indigo-500 transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mx-1 mb-2">موقع السيارة</label>
                  <input title="موقع السيارة" required placeholder="مثال: مزاد دبي أو معرض سيارات" value={inspectionForm.location} onChange={(e) => setInspectionForm({...inspectionForm, location: e.target.value})} className="w-full border-2 border-slate-200 rounded-2xl p-3 font-bold outline-none focus:border-indigo-500 transition-all" />
                </div>
                <button 
                  title="تقديم طلب الفحص"
                  type="submit"
                  className="w-full mt-4 bg-indigo-600 text-white rounded-2xl py-4 font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-5 h-5" />
                  تقديم طلب الفحص
                </button>
              </form>
            </div>
          </div>
        )}

        {showPaymentModal && selectedInvoice && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl z-[150] flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">دفع فاتورة {selectedInvoice.type === 'purchase' ? 'شراء سيارة' : selectedInvoice.type === 'transport' ? 'نقل داخلي' : 'شحن دولي'}</h3>
                  <p className="text-sm font-bold text-slate-400 mt-1">الرقم المرجعي: INV-{selectedInvoice.id.substring(0, 8).toUpperCase()}</p>
                </div>
                <button
                    onClick={() => setShowPaymentModal(false)}
                    className="p-3 bg-slate-50 text-slate-400 hover:text-orange-500 rounded-2xl transition-all"
                    title="إغلاق نافذة الدفع"
                  >
                    <X className="w-6 h-6" />
                  </button>
              </div>

              <div className="p-8 space-y-8">
                <div className="bg-slate-900 text-white p-8 rounded-[2rem] flex items-center justify-between shadow-2xl shadow-slate-900/20">
                  <div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">المبلغ المطلوب سداده</div>
                    <div className="text-4xl font-black">${selectedInvoice.amount.toLocaleString()}</div>
                  </div>
                  <DollarSign className="w-12 h-12 text-orange-500 opacity-50" />
                </div>

                <div>
                  <label className="block text-sm font-black text-slate-900 mb-4 px-2 tracking-wide">اختر طريقة الدفع المناسبة:</label>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 'wallet', label: 'المحفظة الرقمية', icon: Wallet, desc: 'دفع فوري من رصيدك' },
                      { id: 'bank_transfer', label: 'تحويل بنكي', icon: Building2, desc: 'يتطلب مراجعة الإدارة' },
                      { id: 'cash', label: 'دفع نقدي', icon: DollarSign, desc: 'في أقرب مكتب لنا' },
                      { id: 'card', label: 'بطاقة إئتمان', icon: CreditCard, desc: 'دفع إلكتروني سريع' },
                      { id: 'plutu', label: 'Plutu', icon: CreditCard, desc: 'دفع إلكتروني آمن' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setPaymentMethod(m.id as any)}
                        className={`p-6 rounded-[2rem] border-2 transition-all text-right flex flex-col gap-3 group relative overflow-hidden ${paymentMethod === m.id ? 'border-orange-500 bg-orange-50/50 shadow-lg' : 'border-slate-100 hover:border-slate-300 hover:bg-slate-50'}`}
                      >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${paymentMethod === m.id ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                          <m.icon className="w-6 h-6" />
                        </div>
                        <div>
                          <div className={`font-black text-sm ${paymentMethod === m.id ? 'text-orange-900' : 'text-slate-900'}`}>{m.label}</div>
                          <div className="text-[10px] font-bold text-slate-400 mt-0.5">{m.desc}</div>
                        </div>
                        {paymentMethod === m.id && <div className="absolute top-4 left-4 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-sm"><Check className="w-3.5 h-3.5" /></div>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conditional Fields for Manual Methods */}
                {(paymentMethod === 'bank_transfer' || paymentMethod === 'cash') && (
                  <div className="space-y-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-100 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center gap-4 mb-2">
                       <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-orange-500 shadow-sm">
                          <Info className="w-5 h-5" />
                       </div>
                       <div>
                          <div className="text-sm font-black text-slate-900">معلومات إضافية</div>
                          <p className="text-[10px] font-bold text-slate-400">يرجى إرفاق تفاصيل الدفع لتسريع عملية التأكيد</p>
                       </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mr-2">رقم الحوالة أو المرجع</label>
                      <input 
                        type="text" 
                        title="رقم المرجع"
                        placeholder="مثال: REF-12345678"
                        className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 transition-all text-sm"
                        value={referenceNo}
                        onChange={(e) => setReferenceNo(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 mr-2">إرفاق إيصال الدفع (صورة)</label>
                      <div className="relative group cursor-pointer">
                        <input 
                          type="text" 
                          title="رابط الإيصال"
                          placeholder="رابط صورة الإيصال (اختياري)"
                          className="w-full bg-white border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 transition-all text-sm pr-12"
                          value={receiptUrl}
                          onChange={(e) => setReceiptUrl(e.target.value)}
                        />
                        <UploadCloud className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-orange-500 transition-all" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="flex gap-4 pt-4">
                  <button
                    onClick={submitPayment}
                    disabled={isSubmittingPayment}
                    className="flex-[2] bg-slate-900 hover:bg-orange-600 text-white py-5 rounded-[1.5rem] font-black transition-all shadow-xl hover:shadow-orange-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isSubmittingPayment ? <RefreshCw className="w-6 h-6 animate-spin" /> : <ShieldCheck className="w-6 h-6" />}
                    أتعهد بأني قمت بالدفع - تأكيد العملية
                  </button>
                  <button
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 bg-slate-100 text-slate-500 py-5 rounded-[1.5rem] font-black hover:bg-slate-200 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main >
    </div >
  );
};
