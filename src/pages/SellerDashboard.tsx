import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Store, Plus, TrendingUp, Package, RefreshCw, Car, DollarSign,
  Activity, Gavel, Handshake, FileText, Truck, MessageSquare,
  CreditCard, UploadCloud, Target, CheckCircle2, Clock, X, Info,
  LineChart as LineChartIcon, Send, ShieldCheck, Reply, Bell, Mail
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore, authFetch } from '../context/StoreContext';
import { IbanUpdateCard, KycUploadCard } from '../components/SellerKycComponents';
import { UnifiedCarForm } from '../components/UnifiedCarForm';
import DealerYardPortal from '../components/dealer/DealerYardPortal';
export const SellerDashboard = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'overview';
  const { showAlert, showConfirm, currentUser, setCurrentUser, cars, messages, markMessageAsRead } = useStore();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    companyName: currentUser?.companyName || '',
    address: currentUser?.address1 || ''
  });

  const [notificationSettings, setNotificationSettings] = useState({ emailNotifications: true, whatsappNotifications: true });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  useEffect(() => {
    if (currentUser?.id) {
      authFetch(`/api/user/settings/${currentUser.id}`)
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
  }, [currentUser?.id]);

  const toggleNotificationSetting = async (key: 'emailNotifications' | 'whatsappNotifications') => {
    const newSettings = { ...notificationSettings, [key]: !notificationSettings[key] };
    setNotificationSettings(newSettings);
    setIsSavingSettings(true);
    try {
      await authFetch(`/api/user/settings/${currentUser?.id}`, {
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

  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        companyName: currentUser.companyName || '',
        address: currentUser.address1 || ''
      });
    }
  }, [currentUser]);

  const [offerMarketCars, setOfferMarketCars] = useState<any[]>([]);
  const [sellerCars, setSellerCars] = useState<any[]>([]);
  const [sellerInvoices, setSellerInvoices] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [inventoryTab, setInventoryTab] = useState('all'); // all, pending, live, sold, unsold, offers
  const [editingCar, setEditingCar] = useState<any>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageForm, setMessageForm] = useState({ category: 'general', supportTeam: '', lotNumber: '', content: '' });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      // Ensure all required fields are sent, converting null to empty string to recover from previous bug
      const payload: any = {
        ...currentUser,
        id: currentUser?.id,
        ...profileForm,
        companyName: profileForm.companyName || '',
        address: profileForm.address || '',
        firstName: currentUser?.firstName || '',
        lastName: currentUser?.lastName || '',
        phone: currentUser?.phone || ''
      };

      console.log('Sending profile payload:', payload);

      const res = await authFetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        showAlert('تم تحديث البيانات بنجاح', 'success');
        setIsEditingProfile(false);
      } else {
        showAlert('فشل التحديث', 'error');
      }
    } catch {
      showAlert('فشل الاتصال بالخادم', 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  // ✅ PHASE 4: Real Seller Wallet State
  const [wallet, setWallet] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawIban, setWithdrawIban] = useState('');
  const [withdrawBank, setWithdrawBank] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const [stats, setStats] = useState({
    totalSales: 145000,
    activeCars: 12,
    pendingPayments: 34500,
    availableBalance: 12500
  });

  // Password change state
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passForm, setPassForm] = useState({ current: '', new: '', confirm: '' });

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
        body: JSON.stringify({ id: currentUser?.id, currentPassword: passForm.current, newPassword: passForm.new })
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

  // Modal States
  const [showAddCarModal, setShowAddCarModal] = useState(false);
  const [carImages, setCarImages] = useState<{ file?: File; preview: string; uploaded?: boolean; serverUrl?: string }[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [newCarStep, setNewCarStep] = useState(1);
  const [newCar, setNewCar] = useState({
    vin: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    trim: '',
    mileage: '',
    mileageUnit: 'mi',
    engineSize: '',
    horsepower: '',
    transmission: 'automatic',
    drivetrain: 'FWD',
    fuelType: 'gasoline',
    exteriorColor: '',
    interiorColor: '',
    primaryDamage: '',
    secondaryDamage: '',
    titleType: 'Clean',
    keys: 'yes',
    runsDrives: 'yes',
    location: '',
    startingPrice: 0,
    reservePrice: 0,
    minOfferPercent: 85,
    buyItNowPrice: 0,
    notes: '',
  });

  const updateNewCar = (field: string, value: any) => {
    setNewCar(prev => ({ ...prev, [field]: value }));
  };

  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshOfferMarket, setRefreshOfferMarket] = useState(0);
  const [invoiceStatuses, setInvoiceStatuses] = useState<Record<string, { isViewed: number, timestamp?: string }>>({});

  // Counter Offer Modal State
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterCar, setCounterCar] = useState<any | null>(null);
  const [counterAmount, setCounterAmount] = useState('');

  // Reschedule Modal State
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleCar, setRescheduleCar] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleAcceptOffers, setRescheduleAcceptOffers] = useState(true);
  const [rescheduleBuyItNow, setRescheduleBuyItNow] = useState('');

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remaining = 20 - carImages.length;
    const selectedFiles = Array.from(files).slice(0, remaining);

    // Show local previews immediately for UX
    const previews = selectedFiles.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      uploaded: false,
      serverUrl: ''
    }));
    setCarImages(prev => [...prev, ...previews]);

    // Upload to server
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      selectedFiles.forEach(file => formData.append('images', file));

      const res = await authFetch('/api/upload/images', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();

      // Replace local previews with server URLs
      setCarImages(prev => {
        const updated = [...prev];
        // The last `selectedFiles.length` items are the ones we just added
        const startIdx = updated.length - selectedFiles.length;
        data.urls.forEach((url: string, i: number) => {
          if (updated[startIdx + i]) {
            URL.revokeObjectURL(updated[startIdx + i].preview);
            updated[startIdx + i] = {
              ...updated[startIdx + i],
              preview: url,
              uploaded: true,
              serverUrl: url
            };
          }
        });
        return updated;
      });
      setUploadProgress(100);
      showAlert(`✅ تم رفع ${data.count} صورة بنجاح على الخادم`, 'success');
    } catch (err) {
      showAlert('فشل رفع الصور. يرجى المحاولة مجدداً.', 'error');
      // Remove the failed previews
      setCarImages(prev => prev.filter(img => img.uploaded !== false || img.file === undefined));
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (index: number) => {
    setCarImages(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  useEffect(() => {
    // Fetch seller's specific cars
    const filteredCars = cars.filter(c => c.sellerId === currentUser?.id);
    setSellerCars(filteredCars);

    if (inventoryTab === 'offers') {
      authFetch(`/api/seller/offer-market-cars/${currentUser?.id}`)
        .then(res => res.json())
        .then(data => setOfferMarketCars(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to fetch offer market cars:', err));
    }

    // Fetch invoice statuses for sold cars - MOVED TO SEPARATE EFFECT TO PREVENT INFINITE LOOP


    if (view === 'logistics' || view === 'overview') {
      authFetch(`/api/shipments/seller/${currentUser?.id}`)
        .then(res => res.json())
        .then(setShipments)
        .catch(err => console.error('Failed to fetch seller shipments:', err));
    }

    if (view === 'invoices') {
      authFetch(`/api/seller/invoices/${currentUser?.id}`)
        .then(res => res.json())
        .then(data => setSellerInvoices(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to fetch seller invoices:', err));
    }

    // Fetch real seller wallet data (for financials AND overview)
    if ((view === 'financials' || view === 'overview') && currentUser?.id) {
      authFetch(`/api/seller/wallet/${currentUser.id}`)
        .then(res => res.json())
        .then(data => {
          setWallet(data);
          setWithdrawIban(data.iban || '');
          setStats(prev => ({
            ...prev,
            availableBalance: data.availableBalance || 0,
            pendingPayments: data.pendingBalance || 0,
            totalSales: data.totalEarned || 0,
            activeCars: data.totalSoldCars || 0
          }));
        })
        .catch(err => console.error('Failed to fetch wallet:', err));

      authFetch(`/api/seller/transactions/${currentUser.id}`)
        .then(res => res.json())
        .then(data => setLedger(Array.isArray(data) ? data : []))
        .catch(err => console.error('Failed to fetch ledger:', err));
    }
  }, [view, inventoryTab, currentUser?.id, cars.length, refreshOfferMarket]);

  useEffect(() => {
    // Separate effect for fetching invoice statuses only when sold cars change
    const soldCars = sellerCars.filter(c => c.status === 'sold' || c.saleStatus === 'sold');
    if (soldCars.length === 0) return;

    soldCars.forEach(car => {
      authFetch(`/api/invoices/car/${car.id}`)
        .then(res => res.json())
        .then(data => {
          setInvoiceStatuses(prev => {
            // Prevent state update if data is same (prevents infinite loop if somehow triggered)
            if (prev[car.id]?.isViewed === data.isViewed && prev[car.id]?.timestamp === data.timestamp) return prev;
            return { ...prev, [car.id]: data };
          });
        })
        .catch(err => console.error('Failed to fetch invoice status:', err));
    });
  }, [sellerCars]);

  // Handle 'Add Car' navigation from Sidebar
  useEffect(() => {
    if (view === 'add') {
      setShowAddCarModal(true);
      setEditingCar(null);
      setSearchParams({ view: 'inventory' }); // Reset view so modal can be closed normally
    }
  }, [view, setSearchParams]);

  // ✅ PHASE 4: Handle withdrawal request
  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount < 100) {
      showAlert('الحد الأدنى للسحب هو $100', 'error');
      return;
    }
    if (!withdrawIban) {
      showAlert('يرجى إدخال رقم الـ IBAN', 'error');
      return;
    }
    setIsWithdrawing(true);
    try {
      const res = await authFetch('/api/seller/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sellerId: currentUser?.id,
          amount,
          iban: withdrawIban,
          bankName: withdrawBank
        })
      });
      const data = await res.json();
      if (res.ok) {
        showAlert(data.message || 'تم إرسال طلب السحب!', 'success');
        setShowWithdrawModal(false);
        setWithdrawAmount('');
        // Refresh wallet
        authFetch(`/api/seller/wallet/${currentUser?.id}`)
          .then(r => r.json())
          .then(setWallet);
      } else {
        showAlert(data.error || 'فشل طلب السحب', 'error');
      }
    } catch {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    } finally {
      setIsWithdrawing(false);
    }
  };


  const handleCreateCar = async () => {
    if (!newCar.make || !newCar.model || !newCar.vin) {
      showAlert('يرجى ملء البيانات الأساسية (الشركة، الموديل، VIN)', 'error');
      return;
    }
    if (!newCar.reservePrice || newCar.reservePrice <= 0) {
      showAlert('يرجى تحديد السعر الاحتياطي', 'error');
      return;
    }

    try {
      // Use already-uploaded server URLs (from handleImageUpload)
      const uploadedUrls = carImages
        .filter(img => img.serverUrl)
        .map(img => img.serverUrl);

      // If some images weren't uploaded yet (edge case), upload them now
      const pendingFiles = carImages.filter(img => !img.serverUrl && img.file);
      let allUrls = [...uploadedUrls];

      if (pendingFiles.length > 0) {
        const formData = new FormData();
        pendingFiles.forEach(img => {
          if (img.file) formData.append('images', img.file);
        });
        const uploadRes = await authFetch('/api/upload/images', { method: 'POST', body: formData });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          allUrls = [...allUrls, ...uploadData.urls];
        }
      }

      const carData = {
        ...newCar,
        sellerId: currentUser?.id,
        images: allUrls,   // ✅ Real server paths, not Object URLs
        status: 'pending_approval',
        lotNumber: `LT-${Math.floor(100000 + Math.random() * 900000)}`,
        currentBid: 0,
        auctionEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const res = await authFetch('/api/cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(carData)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save car');
      }

      showAlert(`تم إضافة السيارة بنجاح، بانتظار موافقة الإدارة!`, 'success');
      setShowAddCarModal(false);
      setNewCarStep(1);

      // Cleanup image previews
      carImages.forEach(img => URL.revokeObjectURL(img.preview));
      setCarImages([]);

      setNewCar({
        vin: '', make: '', model: '', year: new Date().getFullYear(), trim: '',
        mileage: '', mileageUnit: 'mi', engineSize: '', horsepower: '',
        transmission: 'automatic', drivetrain: 'FWD', fuelType: 'gasoline',
        exteriorColor: '', interiorColor: '', primaryDamage: '', secondaryDamage: '',
        titleType: 'Clean', keys: 'yes', runsDrives: 'yes', location: '',
        startingPrice: 0, reservePrice: 0, minOfferPercent: 85, buyItNowPrice: 0, notes: '',
      });

      // Refresh seller cars
      authFetch(`/api/cars?sellerId=${currentUser?.id}`)
        .then(res => res.json())
        .then(data => setSellerCars(Array.isArray(data) ? data : []));

    } catch (err: any) {
      showAlert(err.message || 'حدث خطأ أثناء حفظ السيارة', 'error');
    }
  };

  const handleAcceptOffer = async (carId: string) => {
    try {
      const res = await authFetch(`/api/offers/${carId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
      });
      if (res.ok) {
        showAlert('تم قبول العرض والبيع بنجاح! تم إصدار فاتورة للمشتري.', 'success');
        setOfferMarketCars(prev => prev.filter(c => c.id !== carId));
      } else {
        showAlert('فشل قبول العرض. يرجى المحاولة لاحقاً', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال بالخادم', 'error');
    }
  };

  // Removed handleRejectOffer function as its logic is moved to the onClick handler

  const renderContent = () => {
    switch (view) {
      case 'inventory':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800">مخزون السيارات (Inventory)</h2>
                <p className="text-slate-500 text-sm mt-1">إدارة سياراتك، إضافة مخزون جديد، ومتابعة حالات القبول والمزاد.</p>
              </div>
              <button
                onClick={() => setShowAddCarModal(true)}
                className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-slate-900/20 hover:bg-slate-800 transition-all hover:-translate-y-1"
              >
                <Plus className="w-5 h-5" />
                إضافة سيارة جديدة
              </button>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap gap-2 overflow-x-auto bg-slate-50/50">
                <button onClick={() => setInventoryTab('all')} className={`px-4 py-2 font-bold text-xs md:text-sm rounded-xl transition-all ${inventoryTab === 'all' ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>الكل ({sellerCars.length})</button>
                <button onClick={() => setInventoryTab('pending')} className={`px-4 py-2 font-bold text-xs md:text-sm rounded-xl transition-all ${inventoryTab === 'pending' ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>بانتظار الموافقة ({sellerCars.filter(c => c.status === 'pending_approval').length})</button>
                <button onClick={() => setInventoryTab('live')} className={`px-4 py-2 font-bold text-xs md:text-sm rounded-xl flex items-center gap-1 transition-all ${inventoryTab === 'live' ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                  {inventoryTab === 'live' && <div className="w-2 h-2 rounded-full bg-green-500"></div>}في المزاد ({sellerCars.filter(c => Boolean(c.auctionEndDate) && new Date(c.auctionEndDate) > new Date() && c.status !== 'sold').length})
                </button>
                <button onClick={() => setInventoryTab('sold')} className={`px-4 py-2 font-bold text-xs md:text-sm rounded-xl transition-all ${inventoryTab === 'sold' ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>مُباعة ({sellerCars.filter(c => c.status === 'sold' || c.saleStatus === 'sold').length})</button>
                <button onClick={() => setInventoryTab('unsold')} className={`px-4 py-2 font-bold text-xs md:text-sm rounded-xl transition-all ${inventoryTab === 'unsold' ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>لم تُباع ({sellerCars.filter(c => c.status === 'unsold' && !c.offerMarketEndTime).length})</button>
                <button onClick={() => setInventoryTab('offers')} className={`px-4 py-2 font-bold text-xs md:text-sm rounded-xl flex items-center gap-1 transition-all ${inventoryTab === 'offers' ? 'bg-white text-slate-900 border border-slate-200 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                  عروض ومفاوضات ({offerMarketCars.length})
                </button>
              </div>
              <div className="md:overflow-x-auto bg-slate-50/50 md:bg-transparent p-4 md:p-0 rounded-b-[2rem]">
                <table className="w-full text-right border-collapse">
                  <thead className="hidden md:table-header-group bg-white text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="p-6 font-black text-right min-w-[250px]">السيارة</th>
                      <th className="p-6 font-black text-right min-w-[150px]">رقم الحساب (VIN)</th>
                      <th className="p-6 font-black text-right min-w-[200px]">تفاصيل الأسعار والمفاوضات</th>
                      <th className="p-6 font-black text-right">الزمن / الحالة</th>
                      <th className="p-6 font-black text-left">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="flex flex-col gap-4 md:table-row-group md:divide-y md:divide-slate-50">
                    {inventoryTab === 'offers' ? (
                      offerMarketCars.map(car => (
                        <tr key={car.id} className="flex flex-col md:table-row bg-white rounded-[2rem] md:rounded-none shadow-sm md:shadow-none border border-slate-100 md:border-t-0 md:border-b-0 hover:bg-slate-50 transition-colors group md:border-l-4 md:border-l-transparent hover:border-l-orange-500 overflow-hidden">
                          <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 w-full relative">
                            <div className="flex items-center gap-4">
                              <img src={car.images?.[0] || ''} alt="صورة" className="w-20 h-16 md:w-16 md:h-12 rounded-xl object-cover border border-slate-200 shrink-0" />
                              <div>
                                <div className="font-black text-slate-900">{car.year} {car.make} {car.model}</div>
                                <div className="text-xs text-slate-400 font-bold mt-1 shadow-inner bg-slate-100 px-2 py-0.5 rounded-md inline-block">Lot: {car.lotNumber}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 font-mono text-xs font-bold text-slate-500 w-full">
                            <div className="md:hidden text-[10px] uppercase font-black text-slate-400 mb-1">رقم الحساب (VIN)</div>
                            {car.vin || 'غير محدد'}
                          </td>
                          <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 w-full">
                            <div className="md:hidden text-[10px] uppercase font-black text-slate-400 mb-2">تفاصيل الأسعار والمفاوضات</div>
                            <div className="flex flex-col gap-2 min-w-full md:min-w-[200px]">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 font-bold">السعر المطلوب:</span>
                                <span className="font-black text-slate-400 line-through decoration-red-500/50 decoration-2">${(car.reservePrice || 0).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-100">
                                <span className="font-bold">أعلى عرض مقدّم:</span>
                                <span className="font-black text-lg">${(car.currentBid || 0).toLocaleString()}</span>
                              </div>
                              {car.sellerCounterPrice && (
                                <div className="flex justify-between items-center text-sm bg-orange-50 text-orange-700 px-2 py-1 rounded-lg border border-orange-100 mt-1">
                                  <span className="font-bold">عرض مضاد للعميل:</span>
                                  <span className="font-black text-lg">${parseInt(car.sellerCounterPrice).toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 text-sm text-amber-600 font-bold w-full">
                            <div className="md:hidden text-[10px] uppercase font-black text-slate-400 mb-1">الزمن / الحالة</div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {car.offerMarketEndTime ? new Date(car.offerMarketEndTime).toLocaleString('ar-EG') : 'تنتهي قريباً'}
                            </div>
                          </td>
                          <td className="p-4 md:p-6 block md:table-cell w-full bg-slate-50/50 md:bg-transparent">
                            <div className="flex justify-start gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await authFetch(`/api/offers/${car.id}/accept`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
                                    });
                                    const data = await res.json();
                                    if (res.ok) {
                                      showAlert('تم قبول العرض والبيع بنجاح! تم التحكم بالسيارة كمباعة.', 'success');
                                      setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                      setSellerCars(prev => prev.map(c => c.id === car.id ? { ...c, status: 'sold' } : c));
                                      setRefreshOfferMarket(prev => prev + 1);
                                    } else showAlert(data.error || 'فشل قبول العرض', 'error');
                                  } catch (e) { showAlert('خطأ في الاتصال بالخادم', 'error'); }
                                }}
                                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all hover:-translate-y-0.5"
                              >
                                قبول البيع
                              </button>
                              <button
                                onClick={() => {
                                  setCounterCar(car);
                                  setCounterAmount(car.currentBid ? Math.floor(car.currentBid * 1.05).toString() : '');
                                  setShowCounterModal(true);
                                }}
                                className="px-3 py-2 bg-orange-50 text-orange-600 border border-orange-100 rounded-xl text-xs font-black hover:bg-orange-100 transition-colors"
                              >
                                عرض مضاد
                              </button>
                              <button
                                onClick={() => {
                                  showConfirm('هل أنت متأكد من رفض هذا العرض؟ سيتم حذف العرض الحالي وتصبح السيارة (لم تباع).', async () => {
                                    try {
                                      const res = await authFetch(`/api/offers/${car.id}/reject`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
                                      });
                                      const data = await res.json();
                                      if (res.ok) {
                                        showAlert('تم رفض العرض وانتقلت السيارة لقسم لم تباع.', 'info');
                                        setRefreshOfferMarket(prev => prev + 1);
                                        setSellerCars(prev => prev.map(c => c.id === car.id ? { ...c, status: 'unsold', offerMarketEndTime: null } : c));
                                        setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                      } else showAlert(data.error || 'فشل رفض العرض.', 'error');
                                    } catch (e) { showAlert('خطأ في الاتصال بالخادم', 'error'); }
                                  });
                                }}
                                className="px-3 py-2 bg-white text-rose-500 border border-rose-100 rounded-xl text-xs font-black hover:bg-rose-50 transition-colors"
                              >
                                رفض
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      sellerCars
                        .filter(car => {
                          if (inventoryTab === 'all') return true;
                          if (inventoryTab === 'pending') return car.status === 'pending_approval';
                          if (inventoryTab === 'live') return Boolean(car.auctionEndDate) && new Date(car.auctionEndDate) > new Date() && car.status !== 'sold';
                          if (inventoryTab === 'sold') return car.status === 'sold' || car.saleStatus === 'sold';
                          if (inventoryTab === 'unsold') return car.status === 'unsold' && !car.offerMarketEndTime;
                          return true;
                        })
                        .map((car, idx) => {
                          const isLive = Boolean(car.auctionEndDate) && new Date(car.auctionEndDate) > new Date() && car.status !== 'sold';
                          const isPending = car.status === 'pending_approval';
                          const isSold = car.status === 'sold' || car.saleStatus === 'sold';

                          return (
                            <tr key={car.id || idx} className="flex flex-col md:table-row bg-white rounded-[2rem] md:rounded-none shadow-sm md:shadow-none border border-slate-100 md:border-t-0 md:border-b-0 hover:bg-slate-50 transition-colors group overflow-hidden">
                              <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 w-full relative">
                                <div className="flex items-center gap-4">
                                  <div className="w-20 h-16 md:w-16 md:h-12 bg-slate-100 rounded-xl md:rounded-lg overflow-hidden border border-slate-200 shrink-0">
                                    {car.images?.[0] ? <img src={car.images[0]} alt="صورة" className="w-full h-full object-cover" /> : <Car className="w-full h-full p-3 text-slate-300" />}
                                  </div>
                                  <div>
                                    <div className="font-black text-slate-900">{car.year} {car.make} {car.model}</div>
                                    <div className="text-xs text-slate-400 font-bold flex items-center gap-1 mt-1 shadow-inner bg-slate-100 px-2 py-0.5 rounded-md w-fit">
                                      <Target className="w-3 h-3" /> Lot: {car.lotNumber || `LT-${1000 + idx}`}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 font-mono text-xs font-bold text-slate-500 w-full">
                                <div className="md:hidden text-[10px] uppercase font-black text-slate-400 mb-1">رقم الحساب (VIN)</div>
                                {car.vin || 'غير محدد'}
                              </td>
                              <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 w-full">
                                <div className="md:hidden text-[10px] uppercase font-black text-slate-400 mb-2">تفاصيل الأسعار والمفاوضات</div>
                                <div className="flex flex-col gap-2 min-w-full md:min-w-[200px]">
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500 font-bold">السعر المطلوب:</span>
                                    <span className="font-black text-slate-700">${(car.buyItNow || car.reservePrice || 15000).toLocaleString()}</span>
                                  </div>
                                  {car.currentBid > 0 && (
                                    <div className="flex justify-between items-center text-sm bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-100">
                                      <span className="font-bold">{isSold ? 'بيعت بسعر:' : 'أعلى مزايدة:'}</span>
                                      <span className="font-black text-lg">${car.currentBid.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {car.sellerCounterPrice && (
                                    <div className="flex justify-between items-center text-sm bg-orange-50 text-orange-700 px-2 py-1 rounded-lg border border-orange-100 mt-1">
                                      <span className="font-bold">عرض مضاد مُقدّم:</span>
                                      <span className="font-black text-lg">${parseInt(car.sellerCounterPrice).toLocaleString()}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4 md:p-6 block md:table-cell border-b border-slate-50 md:border-b-0 w-full">
                                <div className="md:hidden text-[10px] uppercase font-black text-slate-400 mb-2">الزمن / الحالة</div>
                                {isPending ? (
                                  <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-xs font-black w-fit block">بانتظار الموافقة</span>
                                ) : isLive ? (
                                  <span className="bg-green-100 text-green-600 px-3 py-1 rounded-full text-xs font-black flex items-center w-fit gap-1 animate-pulse"><div className="w-1.5 h-1.5 rounded-full bg-green-500"></div> مزاد حي</span>
                                ) : isSold ? (
                                  <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-full text-xs font-black flex items-center w-fit gap-1"><CheckCircle2 className="w-3 h-3" /> مباعة</span>
                                ) : (
                                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-black w-fit block">متاحة</span>
                                )}
                              </td>
                              <td className="p-4 md:p-6 block md:table-cell w-full bg-slate-50/50 md:bg-transparent">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingCar(car);
                                      setShowAddCarModal(true);
                                    }}
                                    className="text-sm font-bold text-blue-500 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-blue-100"
                                  >
                                    تفاصيل / تعديل
                                  </button>
                                  {(inventoryTab === 'unsold' || car.status === 'unsold') && (
                                    <button
                                      onClick={() => {
                                        setRescheduleCar(car);
                                        const defaultDate = new Date();
                                        defaultDate.setDate(defaultDate.getDate() + 7);
                                        defaultDate.setMinutes(defaultDate.getMinutes() - defaultDate.getTimezoneOffset());
                                        setRescheduleDate(defaultDate.toISOString().slice(0, 16));
                                        setRescheduleAcceptOffers(Boolean(car.acceptOffers));
                                        setRescheduleBuyItNow(car.buyItNow ? car.buyItNow.toString() : '');
                                        setShowRescheduleModal(true);
                                      }}
                                      className="text-sm font-bold text-orange-500 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors border border-orange-100 whitespace-nowrap"
                                    >
                                      إعادة للمزاد
                                    </button>
                                  )}
                                  {isSold && (
                                    <div className="flex flex-col gap-2">
                                      <button
                                        onClick={async () => {
                                          try {
                                            const res = await authFetch(`/api/cars/${car.id}/notify-winner`, { method: 'POST' });
                                            const data = await res.json();
                                            if (res.ok) {
                                              showAlert(data.message, 'success');
                                            } else {
                                              showAlert(data.error || 'فشل إرسال التنبيه', 'error');
                                            }
                                          } catch (e) {
                                            showAlert('خطأ في الاتصال بالخادم', 'error');
                                          }
                                        }}
                                        className="text-xs font-black bg-slate-900 text-white hover:bg-slate-800 px-3 py-2 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-md shadow-slate-900/10"
                                      >
                                        <Bell className="w-3 h-3" />
                                        تذكير المشترى بالدفع
                                      </button>
                                      <div className="flex justify-center">
                                        {invoiceStatuses[car.id]?.isViewed ? (
                                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                            <CheckCircle2 className="w-3 h-3" />
                                            شاهد المشتري الفاتورة
                                          </span>
                                        ) : (
                                          <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 animate-pulse">
                                            <Clock className="w-3 h-3" />
                                            في انتظار رؤية المشتري
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {isPending && (
                                    <>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const res = await authFetch(`/api/offers/${car.id}/accept`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
                                            });
                                            if (res.ok) {
                                              showAlert('تم قبول العرض والبيع بنجاح! تم التحكم بالسيارة كمباعة.', 'success');
                                              setSellerCars(prev => prev.map(c => c.id === car.id ? { ...c, status: 'sold' } : c));
                                              setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                              setRefreshOfferMarket(prev => prev + 1);
                                            } else showAlert('فشل قبول العرض', 'error');
                                          } catch (e) { showAlert('خطأ', 'error'); }
                                        }}
                                        className="text-xs font-black bg-slate-900 text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        قبول البيع
                                      </button>
                                      <button
                                        onClick={() => {
                                          setCounterCar(car);
                                          setCounterAmount(car.currentBid ? Math.floor(car.currentBid * 1.05).toString() : '');
                                          setShowCounterModal(true);
                                        }}
                                        className="text-xs font-black bg-orange-50 text-orange-600 hover:bg-orange-100 border border-orange-100 px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        عرض مضاد
                                      </button>
                                      <button
                                        onClick={() => {
                                          showConfirm('هل أنت متأكد من رفض هذا العرض؟ سيتم حذف العرض الحالي وتصبح السيارة (لم تباع).', async () => {
                                            try {
                                              const res = await authFetch(`/api/offers/${car.id}/reject`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role })
                                              });
                                              if (res.ok) {
                                                showAlert('تم رفض العرض وانتقلت السيارة لقسم لم تباع.', 'info');
                                                setSellerCars(prev => prev.map(c => c.id === car.id ? { ...c, status: 'unsold', offerMarketEndTime: null } : c));
                                                setOfferMarketCars(prev => prev.filter(c => c.id !== car.id));
                                              } else showAlert('فشل رفض العرض.', 'error');
                                            } catch (e) { showAlert('خطأ', 'error'); }
                                          });
                                        }}
                                        className="text-xs font-black bg-white text-rose-500 hover:bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-lg transition-colors"
                                      >
                                        رفض
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                    )}

                    {inventoryTab === 'offers' && offerMarketCars.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-slate-400 italic font-bold">لا توجد عروض بانتظار الموافقة حالياً</td>
                      </tr>
                    )}
                    {inventoryTab !== 'offers' && sellerCars.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-12 text-center text-slate-400 italic font-bold">لا يوجد مركبات في هذا القسم</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );

      case 'live_auctions': {
        const liveNow = sellerCars.filter(c => Boolean(c.auctionEndDate) && new Date(c.auctionEndDate) > new Date() && (!c.auctionStartTime || new Date(c.auctionStartTime) <= new Date()) && c.status !== 'sold' && c.status !== 'pending_approval' && !c.offerMarketEndTime);
        const upcoming = sellerCars.filter(c => Boolean(c.auctionStartTime) && new Date(c.auctionStartTime) > new Date() && c.status !== 'sold' && c.status !== 'pending_approval');
        const offerMarket = sellerCars.filter(c => Boolean(c.offerMarketEndTime) && new Date(c.offerMarketEndTime) > new Date() && c.status !== 'sold');

        return (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <div>
                <h2 className="text-3xl font-black text-slate-800 flex items-center gap-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]"></div>
                  شاشة المراقبة الحية (Live Monitor)
                </h2>
                <p className="text-slate-500 text-sm mt-1">تتبع مرئي كامل لحالة سياراتك في المزاد وأرقام التفاعل والمزايدات.</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                 <span className="bg-red-50 text-red-600 px-3 py-1.5 rounded-xl text-xs font-black border border-red-100 flex items-center gap-1"><Activity className="w-3.5 h-3.5"/> لايف: {liveNow.length}</span>
                 <span className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-xl text-xs font-black border border-orange-100 flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> مجدولة: {upcoming.length}</span>
                 <span className="bg-slate-50 text-slate-600 px-3 py-1.5 rounded-xl text-xs font-black border border-slate-200 flex items-center gap-1"><Handshake className="w-3.5 h-3.5"/> عروض: {offerMarket.length}</span>
              </div>
            </div>

            {liveNow.length === 0 && upcoming.length === 0 && offerMarket.length === 0 && (
              <div className="border-2 border-dashed border-slate-200 bg-slate-50 rounded-[2rem] p-16 text-center shadow-inner">
                <Activity className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-black text-slate-800">لا توجد سيارات قيد التتبع المباشر</h3>
                <p className="text-slate-500 mt-2">عند جدولة سياراتك للمزاد، ستظهر هنا كبطاقات مراقبة متقدمة لمدى التفاعل.</p>
              </div>
            )}

            {liveNow.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-4">
                  <div className="w-2 h-6 bg-red-500 rounded-full"></div>
                  في المزادات الحية (Live NOW)
                </h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {liveNow.map(car => {
                     let hash = 0; const s = String(car.id); for(let i=0;i<s.length;i++) hash = s.charCodeAt(i)+((hash<<5)-hash);
                     const visitorsCount = 100 + (Math.abs(hash) % 800);
                     const favoritesCount = 10 + (Math.abs(hash) % 150);
                     const bidsCount = car.currentBid > 0 ? 5 + (Math.abs(hash) % 25) : 0;
                     const progressPct = Math.min(100, (car.currentBid / (car.reservePrice || 1)) * 100);
                     const topBidder = car.currentBid > 0 ? `عميل VIP (${(Math.abs(hash) % 9) + 1}...${(Math.abs(hash) % 99) + 10})` : 'لا يوجد';
                     
                     return (
                      <div key={car.id} className="bg-slate-900 rounded-[2rem] p-6 lg:p-8 text-white relative overflow-hidden shadow-xl shadow-slate-900/40">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
                        <div className="relative z-10">
                          <div className="flex justify-between items-start mb-4">
                            <div className="bg-red-500/20 text-red-400 border border-red-500/30 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_10px_rgba(239,68,68,0.3)]">
                              <Activity className="w-3 h-3" /> مزاد حي الآن
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">الوقت المتبقي</div>
                              <div className="text-xl font-black text-white font-mono flex items-center justify-end gap-1">
                                <Clock className="w-4 h-4 text-emerald-400" /> متاح للمشترين
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-4 items-center mb-6 border-b border-slate-700/50 pb-6">
                            {car.images?.[0] ? (
                               <img src={car.images[0]} alt="car" className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-800 shadow-md"/>
                            ) : (
                               <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center"><Car className="text-slate-600"/></div>
                            )}
                            <div>
                              <h3 className="text-2xl font-black text-white mb-1 line-clamp-1">{car.year} {car.make} {car.model}</h3>
                              <p className="text-slate-400 text-xs font-mono font-bold tracking-widest uppercase mb-1">VIN: {car.vin?.slice(-6) || 'N/A'}</p>
                              <div className="text-[10px] text-blue-400 font-bold flex items-center gap-1"><Target className="w-3 h-3"/> أعلى مزايد حالياً: {topBidder}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mb-6 text-center">
                            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 backdrop-blur-md">
                              <div className="text-lg font-black font-mono">👁️ {visitorsCount}</div>
                              <div className="text-[9px] font-bold text-slate-400">زيارة للمشاهدة</div>
                            </div>
                            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 backdrop-blur-md">
                              <div className="text-lg font-black font-mono">⭐️ {favoritesCount}</div>
                              <div className="text-[9px] font-bold text-slate-400">حفظ بالمفضلة</div>
                            </div>
                            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700/50 backdrop-blur-md">
                              <div className="text-lg font-black font-mono text-emerald-400"><TrendingUp className="w-4 h-4 inline-block mb-1"/> {bidsCount}</div>
                              <div className="text-[9px] font-bold text-slate-400">إجمالي المزايدات</div>
                            </div>
                          </div>

                          <div className="bg-slate-800/50 backdrop-blur-md rounded-2xl p-5 border border-slate-700/50">
                            <div className="flex justify-between items-end mb-4">
                              <div>
                                <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest mb-1">أعلى مزايدة حالية</div>
                                <div className="text-3xl font-black text-emerald-400 font-mono">${(car.currentBid || 0).toLocaleString()}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">السعر المطلوب</div>
                                <div className="text-xl font-black text-slate-300 font-mono line-through opacity-50">${(car.reservePrice || 0).toLocaleString()}</div>
                              </div>
                            </div>

                            <div className="w-full bg-slate-900 rounded-full h-2.5 mb-2 overflow-hidden border border-slate-700">
                              <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-2.5 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.5)] transition-all duration-1000" style={{width: `${progressPct}%`}}></div>
                            </div>
                            {(car.currentBid >= car.reservePrice) ? (
                              <div className="text-xs text-emerald-400 font-black text-center flex justify-center items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5"/> تم تجاوز السعر المطلوب، السيارة ستباع! 🎉</div>
                            ) : (
                              <div className="text-[10px] text-amber-400 font-bold text-center">تحتاج مزايدات أكثر لبلوغ السعر المطلوب لضمان البيع.</div>
                            )}
                          </div>
                        </div>
                      </div>
                     );
                  })}
                </div>
              </div>
            )}

            {upcoming.length > 0 && (
              <div className="space-y-4 pt-4">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-4">
                  <div className="w-2 h-6 bg-orange-500 rounded-full"></div>
                  قريباً (Upcoming Queue)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {upcoming.map(car => {
                     let hash = 0; const s = String(car.id); for(let i=0;i<s.length;i++) hash = s.charCodeAt(i)+((hash<<5)-hash);
                     const visitorsCount = 50 + (Math.abs(hash) % 300);
                     const favoritesCount = 5 + (Math.abs(hash) % 50);

                     return (
                      <div key={car.id} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                           <div className="bg-orange-50 text-orange-600 px-3 py-1 text-[10px] font-black uppercase rounded-full border border-orange-100 flex items-center gap-1">
                             <Clock className="w-3 h-3"/> ستدخل المزاد
                           </div>
                           <div className="text-[10px] font-black text-slate-800 bg-slate-100 px-3 py-1 rounded-full">{new Date(car.auctionStartTime || 0).toLocaleString('ar-LY')}</div>
                        </div>
                        <div className="flex gap-4 items-center mb-6">
                            {car.images?.[0] ? <img src={car.images[0]} alt="car" className="w-16 h-16 rounded-2xl object-cover shadow-sm"/> : <div className="w-16 h-16 bg-slate-100 rounded-2xl"></div>}
                            <div>
                               <h4 className="font-black text-slate-800 line-clamp-1">{car.year} {car.make} {car.model}</h4>
                               <p className="text-[10px] text-slate-400 font-mono font-bold">VIN: {car.vin?.slice(-6) || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="border-t border-slate-50 pt-4 grid grid-cols-2 gap-2 text-center border-b pb-4 mb-4">
                           <div>
                              <div className="text-lg font-black text-slate-800">👁️ {visitorsCount}</div>
                              <div className="text-[10px] text-slate-400 font-bold">زائر مُنتظر</div>
                           </div>
                           <div>
                              <div className="text-lg font-black text-slate-800">⭐️ {favoritesCount}</div>
                              <div className="text-[10px] text-slate-400 font-bold">مهتم (بالمفضلة)</div>
                           </div>
                        </div>
                        <div className="text-[10px] bg-orange-50 text-orange-700 font-bold p-3 rounded-xl border border-orange-100">
                           💡 مؤشرات جيدة! يوجد مشترين محتملين وضعوا سيارتك في مفضلتهم وبانتظار بدء المزاد.
                        </div>
                      </div>
                     );
                  })}
                </div>
              </div>
            )}

            {offerMarket.length > 0 && (
              <div className="space-y-4 pt-4">
                <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-4">
                  <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
                  سوق المفاوضات (Offer Market)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {offerMarket.map(car => {
                     let hash = 0; const s = String(car.id); for(let i=0;i<s.length;i++) hash = s.charCodeAt(i)+((hash<<5)-hash);
                     const totalViews = 800 + (Math.abs(hash) % 1500);

                     return (
                      <div key={car.id} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-2xl -mr-10 -mt-10"></div>
                        <div className="flex justify-between items-start mb-4 relative z-10">
                           <div className="bg-blue-50 text-blue-600 px-3 py-1 text-[10px] font-black uppercase rounded-full border border-blue-100 flex items-center gap-1">
                             <Handshake className="w-3 h-3"/> في المفاوضات
                           </div>
                           <div className="text-[10px] font-black text-rose-500 flex items-center gap-1"><Clock className="w-3 h-3"/> تنتهي قريباً</div>
                        </div>
                        <h4 className="font-black text-slate-800 text-lg mb-4 line-clamp-1">{car.year} {car.make} {car.model}</h4>
                        
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4 flex justify-between items-center relative z-10">
                           <div>
                             <div className="text-[10px] text-slate-400 font-bold">أعلى عرض مقدّم</div>
                             <div className="text-lg font-black text-emerald-600 font-mono">${(car.currentBid || 0).toLocaleString()}</div>
                           </div>
                           <div className="text-right">
                             <div className="text-[10px] text-slate-400 font-bold">السعر المطلوب</div>
                             <div className="text-sm font-black text-slate-400 font-mono line-through">${(car.reservePrice || 0).toLocaleString()}</div>
                           </div>
                        </div>

                        <div className="border-t border-slate-50 pt-4 flex justify-between items-center relative z-10">
                           <div className="flex items-center gap-2 text-[10px] font-black text-slate-600">
                               📊 معدل المشاهدة الكلي: {totalViews}
                           </div>
                           <button onClick={() => setInventoryTab('offers')} className="text-[10px] font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">
                              الذهاب للعروض
                           </button>
                        </div>
                      </div>
                     );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'financials':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800">المحفظة والحسابات (Ledger)</h2>
                <p className="text-slate-500 text-sm mt-1">
                  كشف حساب مفصّل، الأرباح المتاحة للسحب، والعمولات المخصومة.
                  {wallet && <span className="text-slate-400"> | عمولة المنصة: {wallet.commissionRate}%</span>}
                </p>
              </div>
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={!wallet || wallet.availableBalance < 100}
                className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CreditCard className="w-5 h-5" />
                طلب سحب رصيد
              </button>
            </div>

            {/* Live Wallet Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="md:col-span-2 bg-slate-900 p-8 rounded-[2rem] text-white overflow-hidden relative shadow-2xl shadow-slate-900/20">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 blur-3xl rounded-full"></div>
                <div className="relative z-10">
                  <div className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">الرصيد المتاح للسحب</div>
                  <div className="text-5xl font-black text-emerald-400 font-mono">
                    ${(wallet?.availableBalance ?? stats.availableBalance).toLocaleString()}
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    بعد خصم عمولات المنصة
                  </div>
                  {wallet && (
                    <div className="mt-2 text-xs text-slate-500">
                      إجمالي المسحوب: <span className="font-mono text-slate-400">${wallet.totalWithdrawn.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full blur-xl -mr-10 -mt-10 group-hover:scale-150 transition-transform"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-3">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">أرصدة معلقة</div>
                  <div className="text-2xl font-black text-slate-800 font-mono">
                    ${(wallet?.pendingBalance ?? stats.pendingPayments).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-amber-500 font-bold mt-1">قيد التسوية مع المشترين</div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full blur-xl -mr-10 -mt-10 group-hover:scale-150 transition-transform"></div>
                <div className="relative z-10">
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-3">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">إجمالي الأرباح</div>
                  <div className="text-2xl font-black text-slate-800 font-mono">
                    ${(wallet?.totalEarned ?? stats.totalSales).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-blue-500 font-bold mt-1">{wallet?.totalSoldCars ?? 0} سيارة مُباعة</div>
                </div>
              </div>
            </div>

            {/* Real Transaction Ledger */}
            <div className="bg-white rounded-[2rem] text-slate-800 border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-50 flex items-center justify-between">
                <h3 className="font-black text-lg">كشف الحساب التفصيلي (Ledger)</h3>
                <span className="text-xs text-slate-400 font-bold bg-slate-50 px-3 py-1 rounded-full">{ledger.length} معاملة</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="p-4 font-black">رقم العملية</th>
                      <th className="p-4 font-black">التفاصيل</th>
                      <th className="p-4 font-black">سعر البيع</th>
                      <th className="p-4 font-black text-rose-500">عمولة المنصة</th>
                      <th className="p-4 font-black text-emerald-600">الصافي لك</th>
                      <th className="p-4 font-black">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ledger.length > 0 ? ledger.map((tx: any) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-mono text-sm text-slate-500">{tx.id.slice(0, 10)}</td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800 text-sm">{tx.description}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(tx.timestamp).toLocaleDateString('ar-EG')}
                            {tx.lotNumber && ` • Lot: ${tx.lotNumber}`}
                          </div>
                        </td>
                        <td className="p-4 font-mono font-bold">
                          {tx.type === 'withdrawal' ? '—' : `$${(tx.amount || 0).toLocaleString()}`}
                        </td>
                        <td className="p-4 font-mono font-bold text-rose-500">
                          {tx.commission > 0 ? `-$${tx.commission.toLocaleString()}` : '—'}
                        </td>
                        <td className={`p-4 font-mono font-black ${tx.type === 'withdrawal' ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {tx.type === 'withdrawal'
                            ? `-$${(tx.netAmount || 0).toLocaleString()}`
                            : `$${(tx.netAmount || 0).toLocaleString()}`}
                        </td>
                        <td className="p-4">
                          {tx.status === 'available' && <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">جاهز للسحب ✅</span>}
                          {tx.status === 'pending' && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold">معلق ⏳</span>}
                          {tx.status === 'completed' && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">مكتمل ✓</span>}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="p-12 text-center text-slate-400 font-bold italic">
                          لا توجد معاملات بعد
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Withdrawal Modal */}
            {showWithdrawModal && (
              <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[200] p-4">
                <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                  <h3 className="text-2xl font-black text-slate-900 mb-2">طلب سحب رصيد</h3>
                  <p className="text-slate-500 text-sm mb-6">سيتم مراجعة الطلب خلال 1-3 أيام عمل</p>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-6">
                    <div className="text-xs text-emerald-600 font-bold uppercase mb-1">الرصيد المتاح</div>
                    <div className="text-3xl font-black text-emerald-600 font-mono">
                      ${(wallet?.availableBalance || 0).toLocaleString()}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">مبلغ السحب (USD) *</label>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={e => setWithdrawAmount(e.target.value)}
                        min={100}
                        max={wallet?.availableBalance || 0}
                        step={100}
                        placeholder="الحد الأدنى $100"
                        className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl font-mono text-xl focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">رقم الـ IBAN *</label>
                      <input
                        type="text"
                        value={withdrawIban}
                        onChange={e => setWithdrawIban(e.target.value)}
                        placeholder="LY00 0000 0000 0000 0000 00"
                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl font-mono focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">اسم البنك</label>
                      <input
                        type="text"
                        value={withdrawBank}
                        onChange={e => setWithdrawBank(e.target.value)}
                        placeholder="مثال: مصرف الجمهورية"
                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleWithdraw}
                      disabled={isWithdrawing}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                    >
                      {isWithdrawing ? 'جاري الإرسال...' : '💳 إرسال طلب السحب'}
                    </button>
                    <button
                      onClick={() => setShowWithdrawModal(false)}
                      className="px-6 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold transition-all"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'logistics':

        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8 text-right" dir="rtl">
              <div>
                <h2 className="text-3xl font-black text-slate-800">اللوجستيات والتسليم 🚚</h2>
                <p className="text-slate-500 text-sm mt-1">تتبع السيارات المباعة، ارفع أوراق الشحن (Title)، وسلّم السيارات للمشتري.</p>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden" dir="rtl">
              <table className="w-full text-right">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">السيارة / رقم اللوت</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">المشتري</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">الحالة</th>
                    <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shipments.map((ship: any) => {
                    const steps = [
                      { key: 'awaiting_payment', label: 'بانتظار الدفع', icon: '💳' },
                      { key: 'paid', label: 'تم الدفع', icon: '✅' },
                      { key: 'shipping_requested', label: 'طلب الشحن', icon: '🚚' },
                      { key: 'in_transit', label: 'قيد النقل', icon: '🚛' },
                      { key: 'in_warehouse', label: 'في المستودع', icon: '🏭' },
                      { key: 'in_shipping', label: 'جاري الشحن', icon: '🚢' },
                      { key: 'customs', label: 'التخليص الجمركي', icon: '📋' },
                      { key: 'delivered', label: 'تم التوصيل', icon: '🎉' }
                    ];
                    const currentIdx = steps.findIndex(s => s.key === ship.status);

                    return (
                      <React.Fragment key={ship.id}>
                        <tr className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {ship.images?.[0] ? (
                                <img src={ship.images[0]} className="w-12 h-12 rounded-xl object-cover" alt="صورة" />
                              ) : (
                                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
                                  <Car className="w-6 h-6 text-slate-300" />
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-slate-900">{ship.year} {ship.make} {ship.model}</div>
                                <div className="text-[10px] font-black text-slate-400">LOT: #{ship.lotNumber}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-slate-700">{ship.firstName} {ship.lastName}</div>
                            <div className="text-[10px] text-slate-400">{ship.phone}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${ship.status === 'delivered' ? 'bg-green-100 text-green-600' :
                              ship.status === 'shipping_requested' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'
                              }`}>
                              {ship.status === 'shipping_requested' ? 'طلب شحن 🚚' : ship.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 flex gap-2">
                            <button className="text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-2 rounded-lg font-black text-xs flex items-center gap-1">
                              <UploadCloud className="w-4 h-4" /> رفع Title
                            </button>
                            {(ship.status === 'paid' || ship.status === 'shipping_requested') && (
                              <button className="text-orange-600 hover:text-orange-700 bg-orange-50 px-3 py-2 rounded-lg font-black text-xs flex items-center gap-1">
                                <Truck className="w-4 h-4" /> تحديث الشحن
                              </button>
                            )}
                          </td>
                        </tr>
                        {/* Tracker Row */}
                        <tr>
                          <td colSpan={4} className="p-0 border-b border-slate-100 bg-slate-50/30">
                            <div className="p-6">
                              <div className="relative px-4 pb-2">
                                <div className="flex items-center justify-between relative z-10">
                                  {steps.map((s, i) => (
                                    <div key={s.key} className="flex flex-col items-center flex-1 relative">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border-2 transition-all duration-500 ${i < currentIdx ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/20' :
                                        i === currentIdx ? 'bg-orange-500 border-orange-500 text-white scale-110 shadow-md shadow-orange-500/30' :
                                          'bg-white border-slate-200 text-slate-400'
                                        }`}>
                                        {i < currentIdx ? <CheckCircle2 className="w-4 h-4" /> : s.icon}
                                      </div>
                                      <span className={`text-[10px] font-black mt-2 text-center transition-colors duration-500 ${i <= currentIdx ? 'text-slate-900' : 'text-slate-400'
                                        }`}>{s.label}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="absolute top-4 left-8 right-8 h-1 bg-slate-200 rounded-full">
                                  <div
                                    className="h-full bg-emerald-500 transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                                    ref={(el) => { if (el) el.style.width = `${(currentIdx / (steps.length - 1)) * 100}%`; }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                  {shipments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-20 text-center text-slate-400 italic font-bold">
                        لا توجد سيارات بانتظار التسليم حالياً
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'messages':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800">مركز المراسلات</h2>
                <p className="text-slate-500 text-sm mt-1">تواصل مباشرة مع إدارة اوتو برو بخصوص الموافقات، المدفوعات واللوجستيات.</p>
              </div>
              <button
                onClick={() => setShowMessageModal(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl shadow-orange-500/20 transition-all flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                رسالة جديدة (تذكرة دعم)
              </button>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
              {messages.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="w-10 h-10 text-orange-500" />
                  </div>
                  <p className="text-lg font-black text-slate-800 mb-2">صندوق الوارد فارغ</p>
                  <p className="text-sm text-slate-500">سيتم عرض جميع الإشعارات والرسائل المتبادلة مع الإدارة هنا.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {messages.map((msg, idx) => (
                    <div key={idx} className={`p-6 transition-colors ${!msg.isRead ? 'bg-orange-50/50' : 'hover:bg-slate-50'} relative group`}>
                      {!msg.isRead && (
                        <div className="absolute top-6 right-6 w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                      )}

                      <div className="flex gap-4">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600 font-bold border border-white shadow-sm shrink-0 overflow-hidden">
                          {msg.senderId === 'admin' ? (
                            <div className="text-orange-500 p-2"><ShieldCheck className="w-6 h-6" /></div>
                          ) : (
                            <img alt="صورة" src={`https://i.pravatar.cc/150?u=${msg.senderId}`} />
                          )}
                        </div>

                        <div className="flex-grow">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-black text-slate-900 group-hover:text-orange-500 transition-colors">
                                {msg.title || (msg.senderId === 'admin' ? 'الإدارة' : 'أنت')}
                              </h4>
                              <div className="flex gap-2 text-[10px] mt-1">
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black">{msg.category || 'عام'}</span>
                                {msg.supportTeam && (
                                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black">موجه إلى: {
                                    ({
                                      accounting: 'فريق المحاسبة', clearance: 'التخليص الجمركي', complaints: 'الشكاوي والجودة',
                                      registration: 'فريق التسجيل', shipping: 'فريق الشحن', transport: 'فريق النقل', purchasing: 'فريق الشراء'
                                    } as Record<string, string>)[msg.supportTeam] || msg.supportTeam
                                  }</span>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-slate-400 font-bold bg-slate-50 px-3 py-1 rounded-lg">
                              {new Date(msg.timestamp).toLocaleString('ar-LY')}
                            </span>
                          </div>

                          <p className="text-sm text-slate-600 leading-relaxed max-w-2xl font-bold whitespace-pre-wrap">{msg.content || typeof msg.message === 'string' ? msg.message : 'يوجد مرفق.'}</p>

                          {msg.repliedAt && (
                            <div className="mt-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                              <div className="flex items-center gap-2 mb-2 text-slate-800 font-black">
                                <Reply className="w-4 h-4 text-orange-500" />
                                رد الإدارة
                              </div>
                              <p className="text-sm text-slate-600 font-bold whitespace-pre-wrap">{msg.replyContent || 'عذراً لا يمكن عرض الرد.'}</p>
                            </div>
                          )}

                          {msg.senderId === 'admin' && !msg.isRead && (
                            <div className="mt-4 flex gap-2">
                              <button onClick={() => markMessageAsRead(msg.id)} className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-black shadow-sm hover:border-emerald-500 hover:text-emerald-500 transition-all flex gap-1 items-center">
                                <CheckCircle2 className="w-4 h-4" /> تعليم كمقروء
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {showMessageModal && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[200]">
                <div className="bg-white rounded-3xl w-full max-w-lg p-8 shadow-2xl animate-in zoom-in duration-300">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-slate-800">إرسال استفسار / تذكرة للإدارة</h3>
                    <button title="إغلاق التذكرة" aria-label="إغلاق نافذة التذكرة" onClick={() => setShowMessageModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-rose-500">
                      <X className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-black text-slate-700 mb-2">نوع الاستفسار</label>
                      <select
                        aria-label="نوع الاستفسار"
                        title="نوع الاستفسار"
                        value={messageForm.category}
                        onChange={(e) => setMessageForm({ ...messageForm, category: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold"
                      >
                        <option value="general">استفسار عام</option>
                        <option value="live_auction">بخصوص مزاد مباشر</option>
                        <option value="logistics">شحن و لوجستيات</option>
                        <option value="financial">أمور مالية والمحفظة</option>
                        <option value="offer">عروض الشراء المباشر</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-black text-slate-700 mb-2">الفريق الموجه إليه (اختياري)</label>
                      <select
                        aria-label="الفريق الموجه إليه"
                        title="الفريق الموجه إليه"
                        value={messageForm.supportTeam}
                        onChange={(e) => setMessageForm({ ...messageForm, supportTeam: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold"
                      >
                        <option value="">توجيه عام (تلقائي)</option>
                        <option value="accounting">فريق المحاسبة</option>
                        <option value="shipping">فريق الشحن</option>
                        <option value="transport">فريق النقل الداخلي</option>
                        <option value="purchasing">فريق المشتريات</option>
                        <option value="clearance">فريق التخليص الجمركي</option>
                        <option value="complaints">الشكاوي والجودة</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-black text-slate-700 mb-2">رقم السيارة (اذا كان متوفراً)</label>
                      <input
                        type="text"
                        placeholder="أدخل رقم الـ Lot أو VIN السري"
                        value={messageForm.lotNumber}
                        onChange={(e) => setMessageForm({ ...messageForm, lotNumber: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 font-mono text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-black text-slate-700 mb-2">الرسالةالتفصيلية</label>
                      <textarea
                        rows={4}
                        placeholder="أكتب رسالتك بوضوح وتفصيل ليتمكن فريقنا من مساعدتك..."
                        value={messageForm.content}
                        onChange={(e) => setMessageForm({ ...messageForm, content: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all font-bold resize-none"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={async () => {
                          if (!messageForm.content) return showAlert('يرجى كتابة الرسالة أولاً', 'error');
                          const res = await authFetch('/api/messages', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              ...messageForm,
                              senderId: currentUser?.id,
                              receiverId: 'admin-1',
                              subject: `استفسار بائع: ${messageForm.category === 'live_auction' ? 'مزاد' :
                                messageForm.category === 'logistics' ? 'لوجستيات' :
                                  messageForm.category === 'financial' ? 'مالية' : 'عام'}`
                            })
                          });
                          if (res.ok) {
                            showAlert('تم إرسال تذكرتك للإدارة بنجاح', 'success');
                            setShowMessageModal(false);
                            setMessageForm({ category: 'general', supportTeam: '', lotNumber: '', content: '' });
                          } else {
                            showAlert('حدث خطأ أثناء الإرسال', 'error');
                          }
                        }}
                        className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-lg hover:bg-orange-500 transition-all shadow-xl shadow-slate-900/20 active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <Send className="w-5 h-5" /> إرسال الرسالة للإدارة
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        );

      case 'invoices':
        return (
          <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
            <div className="mb-8">
              <h2 className="text-3xl font-black text-slate-800">الفواتير والمستندات (Document Cycle)</h2>
              <p className="text-slate-500 text-sm mt-1">تتبع حالة الدفع، كروت الإفراج، واستلام السيارات لجميع مبيعاتك.</p>
            </div>

            {sellerInvoices.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-slate-100 p-12 text-center shadow-sm">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-800">لا توجد فواتير حالياً</h3>
                <p className="text-slate-500 mt-2">ستظهر فواتير سياراتك المباعة هنا لمتابعة دورة تحصيلها.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {sellerInvoices.map(inv => (
                  <div key={inv.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 lg:p-8 flex flex-col md:flex-row gap-8 items-start hover:shadow-md transition-shadow">
                    <div className="flex-1 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold font-mono">
                              Lot: {inv.lotNumber}
                            </span>
                            <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold font-mono">
                              VIN: {inv.vin}
                            </span>
                          </div>
                          <h3 className="text-xl font-black text-slate-800">{inv.year} {inv.make} {inv.model}</h3>
                          <p className="text-slate-500 text-sm mt-1">
                            المشتري: <span className="font-bold">{inv.buyerFirstName} {inv.buyerLastName}</span>
                          </p>
                        </div>
                        <div className="text-left">
                          <p className="text-2xl font-black text-emerald-600 font-mono">${inv.amount?.toLocaleString()}</p>
                          <p className="text-xs text-slate-500 mt-1">تاريخ البيع: {new Date(inv.timestamp).toLocaleDateString('ar-SA')}</p>
                        </div>
                      </div>

                      {/* Document Cycle Progress Bar */}
                      <div className="pt-6 mt-6 border-t border-slate-50">
                        <div className="flex items-center justify-between relative">
                          <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-100 -z-10 -translate-y-1/2 rounded-full"></div>

                          {/* Step 1: Paid by Buyer */}
                          <div className="flex flex-col items-center gap-2 relative bg-white px-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all
                              ${inv.status !== 'unpaid' && inv.status !== 'pending' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-100 text-slate-400'}`}>
                              1
                            </div>
                            <span className={`text-[10px] sm:text-xs font-bold whitespace-nowrap ${inv.status !== 'unpaid' && inv.status !== 'pending' ? 'text-emerald-700' : 'text-slate-400'}`}>الدفع من المشتري</span>
                          </div>

                          {/* Step 2: Release Card Issued */}
                          <div className="flex flex-col items-center gap-2 relative bg-white px-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all
                              ${['release_issued', 'delivered_to_buyer', 'seller_paid_by_admin'].includes(inv.status) ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-100 text-slate-400'}`}>
                              2
                            </div>
                            <span className={`text-[10px] sm:text-xs font-bold whitespace-nowrap ${['release_issued', 'delivered_to_buyer', 'seller_paid_by_admin'].includes(inv.status) ? 'text-blue-700' : 'text-slate-400'}`}>كرت الإفراج</span>
                          </div>

                          {/* Step 3: Delivered */}
                          <div className="flex flex-col items-center gap-2 relative bg-white px-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all
                              ${['delivered_to_buyer', 'seller_paid_by_admin'].includes(inv.status) ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-slate-100 text-slate-400'}`}>
                              3
                            </div>
                            <span className={`text-[10px] sm:text-xs font-bold whitespace-nowrap ${['delivered_to_buyer', 'seller_paid_by_admin'].includes(inv.status) ? 'text-purple-700' : 'text-slate-400'}`}>استلام السيارة</span>
                          </div>

                          {/* Step 4: Seller Paid */}
                          <div className="flex flex-col items-center gap-2 relative bg-white px-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all
                              ${inv.status === 'seller_paid_by_admin' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'bg-slate-100 text-slate-400'}`}>
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <span className={`text-[10px] sm:text-xs font-bold whitespace-nowrap ${inv.status === 'seller_paid_by_admin' ? 'text-orange-700' : 'text-slate-400'}`}>تحصيل القيمة</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="w-full md:w-64 border-t md:border-t-0 md:border-r border-slate-100 pt-6 md:pt-0 md:pr-6 flex flex-col justify-center gap-3">
                      {inv.status === 'unpaid' && (
                        <div className="bg-rose-50 text-rose-600 rounded-xl p-4 text-center">
                          <p className="font-bold text-sm mb-1">بانتظار دفع المشتري</p>
                          <p className="text-xs opacity-80">يرجى متابعة المشتري عبر الرسائل</p>
                        </div>
                      )}

                      {inv.releaseCardUrl && (
                        <a href={inv.releaseCardUrl} target="_blank" rel="noopener noreferrer" className="bg-slate-900 text-white py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-md">
                          <FileText className="w-4 h-4" /> عرض كرت الإفراج
                        </a>
                      )}

                      {inv.status === 'seller_paid_by_admin' && (
                        <div className="bg-emerald-50 text-emerald-600 rounded-xl p-4 flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="font-bold text-sm">تم تسوية الحساب</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'market_insights':
        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800">رؤى السوق (Market Insights)</h2>
                <p className="text-slate-500 text-sm mt-1">حلل أسعار السوق للسيارات المشابهة لسياراتك قبل تسعيرها.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                <LineChartIcon className="w-12 h-12 text-indigo-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-800">متوسط أسعار تويوتا كامري 2021</h3>
                <p className="text-2xl font-black text-emerald-600 mt-2">$13,500 - $15,200</p>
                <p className="text-xs text-slate-400 mt-2">بناءً على 14 مزاد في آخر 30 يوم</p>
              </div>
              <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm text-center">
                <LineChartIcon className="w-12 h-12 text-teal-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-800">متوسط أسعار هيونداي النترا 2022</h3>
                <p className="text-2xl font-black text-emerald-600 mt-2">$11,000 - $12,800</p>
                <p className="text-xs text-slate-400 mt-2">بناءً على 8 مزادات في آخر شهرين</p>
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-6 animate-in fade-in duration-500" dir="rtl">
            <div className="mb-8">
              <h2 className="text-3xl font-black text-slate-800">الملف الشخصي والتوثيق (KYC)</h2>
              <p className="text-slate-500 text-sm mt-1">حدّث بياناتك الشخصية وارفع وثائق التوثيق لتفعيل سحب الأرباح.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Seller Info Card */}
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
                <div className="flex justify-between items-center mb-6 border-b-2 border-slate-100 pb-4">
                  <h3 className="font-black text-lg text-slate-800 flex items-center gap-2">
                    <div className="w-2 h-6 bg-orange-500 rounded-full"></div>
                    بيانات البائع
                  </h3>
                  {!isEditingProfile && (
                    <button
                      onClick={() => setIsEditingProfile(true)}
                      className="text-orange-500 font-bold text-sm bg-orange-50 hover:bg-orange-100 px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" /> {/* Reuse Plus or any other icon, Edit isn't imported here typically but Plus is */}
                      تعديل البيانات
                    </button>
                  )}
                </div>

                {isEditingProfile ? (
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">اسم المعرض / الشركة</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 border border-slate-200 focus:border-orange-500 outline-none transition-all"
                          value={profileForm.companyName} onChange={e => setProfileForm({ ...profileForm, companyName: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">العنوان</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 border border-slate-200 focus:border-orange-500 outline-none transition-all"
                          value={profileForm.address} onChange={e => setProfileForm({ ...profileForm, address: e.target.value })} />
                      </div>
                      <div className="space-y-2 opacity-50">
                        <label className="text-[10px] font-black text-slate-400 uppercase">البريد الإلكتروني (مغلق)</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-3 bg-slate-100 rounded-xl font-bold text-slate-600 border border-slate-200 outline-none cursor-not-allowed"
                          value={currentUser?.email} disabled />
                      </div>
                      <div className="space-y-2 opacity-50">
                        <label className="text-[10px] font-black text-slate-400 uppercase">الاسم (مغلق)</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-3 bg-slate-100 rounded-xl font-bold text-slate-600 border border-slate-200 outline-none cursor-not-allowed"
                          value={currentUser?.firstName + ' ' + currentUser?.lastName} disabled />
                      </div>
                      <div className="space-y-2 opacity-50">
                        <label className="text-[10px] font-black text-slate-400 uppercase">رقم الهاتف (مغلق)</label>
                        <input aria-label="مدخل" title="مدخل" placeholder="مدخل" className="w-full p-3 bg-slate-100 rounded-xl font-bold text-slate-600 border border-slate-200 outline-none cursor-not-allowed"
                          value={currentUser?.phone} disabled />
                      </div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-50">
                      <button type="submit" disabled={isSavingProfile} className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-black hover:bg-orange-600 transition-all disabled:opacity-50">
                        {isSavingProfile ? 'يتم الحفظ...' : 'حفظ'}
                      </button>
                      <button type="button" onClick={() => setIsEditingProfile(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black hover:bg-slate-200 transition-all">
                        إلغاء
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between py-3 border-b border-slate-50">
                      <span className="text-slate-500 text-sm font-bold">الاسم</span>
                      <span className="font-black text-slate-800">{currentUser?.firstName} {currentUser?.lastName}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-50">
                      <span className="text-slate-500 text-sm font-bold">المعرض / الشركة</span>
                      <span className="font-black text-slate-800">{currentUser?.companyName || 'لا يوجد'}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-50">
                      <span className="text-slate-500 text-sm font-bold">العنوان</span>
                      <span className="font-black text-slate-800">{currentUser?.address1 || 'لا يوجد'}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-50">
                      <span className="text-slate-500 text-sm font-bold">البريد الإلكتروني</span>
                      <span className="font-mono text-slate-700 text-sm">{currentUser?.email}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-50">
                      <span className="text-slate-500 text-sm font-bold">الهاتف</span>
                      <span className="font-mono text-slate-700 text-sm">{currentUser?.phone || '—'}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-slate-50">
                      <span className="text-slate-500 text-sm font-bold">نسبة العمولة</span>
                      <span className="font-black text-orange-500">{currentUser?.commission || 2}%</span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-slate-500 text-sm font-bold">حالة التوثيق</span>
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${currentUser?.kycStatus === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        currentUser?.kycStatus === 'rejected' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                        {currentUser?.kycStatus === 'approved' ? '✅ موثّق' :
                          currentUser?.kycStatus === 'rejected' ? '❌ مرفوض' : '⏳ قيد المراجعة'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* IBAN Update Card */}
              <IbanUpdateCard currentUser={currentUser} showAlert={showAlert} />
            </div>

            {/* KYC Document Upload */}
            <KycUploadCard currentUser={currentUser} showAlert={showAlert} />

            {/* Notification Preferences Section */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm mt-8">
              <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                <Bell className="w-5 h-5 text-orange-500" />
                إعدادات الإشعارات (Omnichannel)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-slate-900 text-sm">تنبيهات البريد الإلكتروني</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-1">المبيعات وتحديثات الشحن</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleNotificationSetting('emailNotifications')}
                    disabled={isSavingSettings}
                    className={`relative w-12 h-6 rounded-full transition-colors ${notificationSettings.emailNotifications ? 'bg-orange-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notificationSettings.emailNotifications ? 'right-1' : 'left-1 rtl:right-auto rtl:left-7'}`}></span>
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-black text-slate-900 text-sm">رسائل الواتساب (WhatsApp)</div>
                      <div className="text-[10px] font-bold text-slate-500 mt-1">تنبيهات المزايدات الفورية</div>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleNotificationSetting('whatsappNotifications')}
                    disabled={isSavingSettings}
                    className={`relative w-12 h-6 rounded-full transition-colors ${notificationSettings.whatsappNotifications ? 'bg-orange-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notificationSettings.whatsappNotifications ? 'right-1' : 'left-1 rtl:right-auto rtl:left-7'}`}></span>
                  </button>
                </div>
              </div>
            </div>

            {/* Password Change Section */}
            <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm mt-8">
              <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-orange-500" />
                تغيير كلمة المرور
              </h3>
              {!isChangingPass ? (
                <button onClick={() => setIsChangingPass(true)} className="bg-orange-50 text-orange-600 font-black text-sm px-6 py-3 rounded-xl hover:bg-orange-100 transition-colors">
                  تغيير كلمة المرور
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase">كلمة المرور الحالية</label>
                    <input type="password" aria-label="كلمة المرور الحالية" title="كلمة المرور الحالية" placeholder="كلمة المرور الحالية"
                      className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 border border-slate-200 focus:border-orange-500 outline-none transition-all"
                      value={passForm.current} onChange={e => setPassForm({ ...passForm, current: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase">كلمة المرور الجديدة</label>
                    <input type="password" aria-label="كلمة المرور الجديدة" title="كلمة المرور الجديدة" placeholder="كلمة المرور الجديدة"
                      className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 border border-slate-200 focus:border-orange-500 outline-none transition-all"
                      value={passForm.new} onChange={e => setPassForm({ ...passForm, new: e.target.value })} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase">تأكيد كلمة المرور</label>
                    <input type="password" aria-label="تأكيد كلمة المرور" title="تأكيد كلمة المرور" placeholder="تأكيد كلمة المرور"
                      className="w-full p-3 bg-slate-50 rounded-xl font-bold text-slate-900 border border-slate-200 focus:border-orange-500 outline-none transition-all"
                      value={passForm.confirm} onChange={e => setPassForm({ ...passForm, confirm: e.target.value })} required />
                  </div>
                  <div className="flex gap-3 pt-4 border-t border-slate-50">
                    <button type="submit" disabled={isSavingProfile} className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-black hover:bg-orange-600 transition-all disabled:opacity-50">
                      {isSavingProfile ? 'جاري الحفظ...' : 'تحديث كلمة المرور'}
                    </button>
                    <button type="button" onClick={() => { setIsChangingPass(false); setPassForm({ current: '', new: '', confirm: '' }); }} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-black hover:bg-slate-200 transition-all">
                      إلغاء
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        );

      case 'yard_portal':
        return <DealerYardPortal />;

      default:

        return (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800">الرئيسية (Seller Dashboard)</h2>
                <p className="text-slate-500 text-sm mt-1">مرحباً بك في وكالتك الافتراضية، تابع مبيعاتك وأرباحك.</p>
              </div>
              <button
                onClick={() => setShowAddCarModal(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl shadow-orange-500/20 transition-all hover:-translate-y-1"
              >
                <Plus className="w-5 h-5" />
                إضافة سيارة للمزاد
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50 hover:border-slate-200 transition-all group">
                <div className="w-14 h-14 bg-slate-50 text-slate-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Store className="w-7 h-7" />
                </div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">المخزون المعروض</div>
                <div className="text-3xl font-black text-slate-900">{stats.activeCars}</div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50 hover:border-slate-200 transition-all group">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-7 h-7" />
                </div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">صافي الأرباح</div>
                <div className="text-3xl font-black text-emerald-600 font-mono">${stats.availableBalance.toLocaleString()}</div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50 hover:border-slate-200 transition-all group">
                <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Gavel className="w-7 h-7" />
                </div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">مزايدات نشطة اليوم</div>
                <div className="text-3xl font-black text-amber-600">{sellerCars.filter(c => ['live', 'ultimo', 'offer_market'].includes(c.status)).length}</div>
              </div>

              <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-50 hover:border-slate-200 transition-all group">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Truck className="w-7 h-7" />
                </div>
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">بانتظار الشحن/التسليم</div>
                <div className="text-3xl font-black text-blue-600">{shipments.filter(s => !['delivered', 'cancelled'].includes(s.status)).length}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-[2rem] shadow-sm border border-slate-50 p-6">
                <h3 className="font-black text-lg text-slate-800 mb-6">أداء المبيعات (هذا الشهر)</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={(() => {
                      const now = new Date();
                      const weeks = [0, 1, 2, 3].map(i => {
                        const weekStart = new Date(now.getFullYear(), now.getMonth(), 1 + i * 7);
                        const weekEnd = new Date(now.getFullYear(), now.getMonth(), Math.min(1 + (i + 1) * 7, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() + 1));
                        const weekTotal = ledger.filter(t => t.type === 'credit' && new Date(t.createdAt) >= weekStart && new Date(t.createdAt) < weekEnd)
                          .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
                        return { n: `أسبوع ${i + 1}`, v: weekTotal };
                      });
                      return weeks;
                    })()}>
                      <defs>
                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="n" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      <Area type="monotone" dataKey="v" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-50 p-6">
                <h3 className="font-black text-lg text-slate-800 mb-6">النشاط الأخير</h3>
                <div className="space-y-6">
                  {(() => {
                    const activities: { icon: any; color: string; bg: string; text: string; time: string }[] = [];
                    // Recent sold cars
                    sellerCars.filter(c => c.status === 'sold').slice(0, 2).forEach(c => {
                      activities.push({ icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100', text: `تم بيع ${c.year} ${c.make} ${c.model}`, time: c.auctionEndDate ? new Date(c.auctionEndDate).toLocaleDateString('ar-SA') : '' });
                    });
                    // Recent ledger transactions
                    ledger.slice(0, 2).forEach(t => {
                      activities.push({ icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-100', text: `${t.description || (t.type === 'credit' ? 'إيراد' : 'خصم')}: $${(t.amount || 0).toLocaleString()}`, time: t.createdAt ? new Date(t.createdAt).toLocaleDateString('ar-SA') : '' });
                    });
                    // Recent messages
                    const sellerMsgs = messages.filter((m: any) => m.toUserId === currentUser?.id).slice(0, 1);
                    sellerMsgs.forEach((m: any) => {
                      activities.push({ icon: MessageSquare, color: 'text-blue-600', bg: 'bg-blue-100', text: m.subject || 'رسالة جديدة', time: m.createdAt ? new Date(m.createdAt).toLocaleDateString('ar-SA') : '' });
                    });
                    if (activities.length === 0) {
                      return <p className="text-sm text-slate-400">لا يوجد نشاط حديث</p>;
                    }
                    return activities.slice(0, 4).map((a, i) => (
                      <div key={i} className="flex gap-4 items-start">
                        <div className={`w-10 h-10 rounded-2xl ${a.bg} flex items-center justify-center flex-shrink-0 ${a.color}`}>
                          <a.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{a.text}</p>
                          <p className="text-xs text-slate-500 mt-1">{a.time}</p>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 md:gap-4 mb-6 border-b border-slate-200 pb-4">
        {[
          { id: 'overview', icon: Store, label: 'الرئيسية' },
          { id: 'inventory', icon: Car, label: 'مخزون السيارات' },
          { id: 'invoices', icon: FileText, label: 'الفواتير والمستندات' },
          { id: 'live_auctions', icon: Activity, label: 'شاشة المزادات الحية' },
          { id: 'financials', icon: DollarSign, label: 'الحسابات (Ledger)' },
          { id: 'logistics', icon: Truck, label: 'الشحن والتسليم' },
          { id: 'messages', icon: MessageSquare, label: 'صندوق البريد' },
          { id: 'market_insights', icon: LineChartIcon, label: 'رؤى السوق' },
          { id: 'profile', icon: CreditCard, label: 'الملف الشخصي / KYC' },
          { id: 'yard_portal', icon: Car, label: 'سياراتي في الحضيرة' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setSearchParams({ view: tab.id })}
            className={`flex flex-1 md:flex-none justify-center items-center gap-1.5 md:gap-2 px-3 py-2.5 md:px-5 md:py-3 rounded-xl font-bold text-xs md:text-sm transition-all ${view === tab.id
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20'
              : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 border border-slate-200'
              }`}
          >
            <tab.icon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
            <span className="text-center">{tab.label}</span>
            {tab.id === 'logistics' && shipments.length > 0 && (
              <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-pulse transition-all shrink-0">
                {shipments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {renderContent()}

      {/* Add Car Wizard Modal */}
      {showAddCarModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[100] overflow-y-auto">
          <div className="w-full h-full relative p-4 md:p-8">
            <button
              title="إغلاق النافذة"
              aria-label="إغلاق النافذة"
              onClick={() => {
                setShowAddCarModal(false);
                setEditingCar(null);
              }}
              className="absolute top-6 left-6 z-50 p-3 bg-slate-900/50 hover:bg-rose-500 text-white rounded-full transition-all shadow-xl"
            >
              <X className="w-6 h-6" />
            </button>
            <UnifiedCarForm
              initialData={editingCar || undefined}
              isSubmitting={false}
              onCancel={() => {
                setShowAddCarModal(false);
                setEditingCar(null);
              }}
              onSubmit={async (data, images, engineSound, inspectionReport) => {
                try {
                  const uploadedImages = [];
                  if (images && images.length > 0) {
                    const formData = new FormData();
                    images.forEach(img => formData.append('images', img));
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

                  if (engineSound) {
                    const mediaData = new FormData();
                    mediaData.append('media', engineSound);
                    const mediaRes = await authFetch('/api/upload/media', { method: 'POST', body: mediaData });
                    if (mediaRes.ok) {
                      const mediaJson = await mediaRes.json();
                      engineAudioUrl = mediaJson.url;
                    }
                  }

                  if (inspectionReport) {
                    const pData = new FormData();
                    pData.append('media', inspectionReport);
                    const pRes = await authFetch('/api/upload/media', { method: 'POST', body: pData });
                    if (pRes.ok) {
                      const pJson = await pRes.json();
                      inspectionPdf = pJson.url;
                    }
                  }

                  const isEditing = !!editingCar;
                  const car: any = {
                    id: isEditing ? editingCar.id : Date.now().toString(),
                    lotNumber: isEditing ? editingCar.lotNumber : `LT-${Math.floor(100000 + Math.random() * 900000)}`,
                    vin: data.vin || (isEditing ? editingCar.vin : '1G1' + Math.random().toString(36).substring(7).toUpperCase()),
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
                    buyNowPrice: data.buyNowPrice || 0,
                    acceptedOfferPercentage: data.acceptedOfferPercentage || '',
                    images: uploadedImages.length > 0 ? uploadedImages : (isEditing && editingCar.images?.length ? editingCar.images : ['https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&q=80&w=800']),
                    youtubeVideoUrl: data.youtubeVideoUrl || '',
                    engineSoundUrl: engineAudioUrl || (isEditing ? editingCar.engineSoundUrl : ''),
                    inspectionReportUrl: inspectionPdf || (isEditing ? editingCar.inspectionReportUrl : ''),
                    status: isEditing ? editingCar.status : 'pending_approval',
                    acceptOffers: true,
                    currency: 'USD',
                    sellerId: currentUser?.id
                  };

                  const res = isEditing
                    ? await authFetch(`/api/cars/${editingCar.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(car)
                      })
                    : await authFetch('/api/cars', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(car)
                      });

                  if (!res.ok) throw new Error('فشل الحفظ');

                  setShowAddCarModal(false);
                  setEditingCar(null);
                  showAlert(isEditing ? 'تم تحديث السيارة بنجاح!' : 'تم إضافة السيارة بنجاح، بانتظار موافقة الإدارة!', 'success');
                } catch (err) {
                  showAlert('حدث خطأ أثناء الرفع أو الحفظ', 'error');
                }
              }}
            />
          </div>
        </div>
      )}
      {/* Counter Offer Modal */}
      {showCounterModal && counterCar && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-800 mb-2">إرسال عرض مضاد</h3>
            <p className="text-slate-500 mb-6 text-sm">سيتم إرسال هذا السعر كعرض نهائي للمشتري صاحب أعلى مزايدة الحالية.</p>

            <div className="bg-slate-50 p-4 rounded-2xl mb-6">
              <div className="flex justify-between mb-2">
                <span className="text-slate-500 font-bold text-sm">أعلى عرض حالي:</span>
                <span className="text-emerald-600 font-black">${(counterCar.currentBid || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-bold text-sm">سعرك الاحتياطي:</span>
                <span className="text-slate-400 font-bold line-through">${(counterCar.reservePrice || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">السعر المضاد (USD دولار)</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                <input
                  type="number"
                  placeholder="أدخل سعرك النهائي..."
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-left font-mono font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  const val = Number(counterAmount);
                  if (!val || isNaN(val)) {
                    showAlert('يرجى إدخال سعر صحيح', 'error');
                    return;
                  }
                  try {
                    const res = await authFetch(`/api/offers/${counterCar.id}/counter`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ userId: currentUser?.id, userRole: currentUser?.role, counterAmount: val })
                    });
                    const data = await res.json();
                    if (res.ok) {
                      showAlert('تم إرسال العرض المضاد للمشتري بنجاح.', 'success');
                      setOfferMarketCars(prev => prev.filter(c => c.id !== counterCar.id));
                      setSellerCars(prev => prev.map(c => c.id === counterCar.id ? { ...c, sellerCounterPrice: val, status: 'pending_approval' } : c));
                      setRefreshOfferMarket(prev => prev + 1);
                      setShowCounterModal(false);
                      setCounterCar(null);
                    } else {
                      showAlert(data.error || 'فشل إرسال العرض', 'error');
                    }
                  } catch (e) {
                    showAlert('خطأ في الاتصال بالخادم', 'error');
                  }
                }}
                className="flex-1 bg-orange-500 text-white font-bold py-3 rounded-xl hover:bg-orange-600 transition-colors shadow-lg shadow-orange-500/20"
              >
                تأكيد وإرسال
              </button>
              <button
                onClick={() => {
                  setShowCounterModal(false);
                  setCounterCar(null);
                }}
                className="flex-1 bg-white text-slate-500 border border-slate-200 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {showRescheduleModal && rescheduleCar && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-800 mb-2">إعادة السيارة للمزاد</h3>
            <p className="text-slate-500 mb-6 text-sm">قم بتحديد موعد المزاد القادم وباقي الخيارات.</p>

            <div className="bg-orange-50 p-4 rounded-2xl mb-6 flex justify-between items-center border border-orange-100">
              <span className="text-orange-700 font-bold text-sm">الفرص المتبقية لدخول المزاد:</span>
              <span className="bg-orange-500 text-white font-black px-3 py-1 rounded-lg">
                {5 - (rescheduleCar.auctionSessionCount || 0)} من 5
              </span>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">موعد المزاد القادم</label>
                <input
                  aria-label="موعد المزاد القادم"
                  title="موعد المزاد القادم"
                  type="datetime-local"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">سعر "اشتري الآن" (اختياري)</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="number"
                    placeholder="سيتم عرضه للمشترين"
                    value={rescheduleBuyItNow}
                    onChange={(e) => setRescheduleBuyItNow(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-12 pr-4 text-left font-mono font-bold text-slate-900 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <div className="font-bold text-slate-800 text-sm">قبول العروض (Make Offer)</div>
                  <div className="text-xs text-slate-400 mt-1">السماح للمشترين بتقديم عروض قبل المزاد</div>
                </div>
                <button
                  onClick={() => setRescheduleAcceptOffers(!rescheduleAcceptOffers)}
                  className={`w-12 h-6 rounded-full transition-colors relative ${rescheduleAcceptOffers ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${rescheduleAcceptOffers ? 'left-1' : 'right-1'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  try {
                    const res = await authFetch(`/api/cars/${rescheduleCar.id}/reschedule`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        auctionStartTime: rescheduleDate,
                        acceptOffers: rescheduleAcceptOffers,
                        buyItNow: Number(rescheduleBuyItNow) || null
                      })
                    });
                    const data = await res.json();
                    if (res.ok) {
                      showAlert(data.message, data.status === 'pending_approval' ? 'info' : 'success');
                      setSellerCars(prev => prev.map(c =>
                        c.id === rescheduleCar.id ? {
                          ...c,
                          status: data.status,
                          auctionStartTime: rescheduleDate,
                          acceptOffers: rescheduleAcceptOffers ? 1 : 0,
                          buyItNow: Number(rescheduleBuyItNow) || null,
                          auctionSessionCount: data.auctionSessionCount,
                          offerMarketEndTime: null
                        } : c
                      ));
                      setShowRescheduleModal(false);
                      setRescheduleCar(null);
                    } else {
                      showAlert(data.error || 'فشل إعادة الجدولة', 'error');
                    }
                  } catch (e) {
                    showAlert('خطأ في الاتصال بالخادم', 'error');
                  }
                }}
                className="flex-1 bg-slate-900 text-white font-bold py-3 rounded-xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
              >
                تأكيد الجدولة
              </button>
              <button
                onClick={() => {
                  setShowRescheduleModal(false);
                  setRescheduleCar(null);
                }}
                className="flex-1 bg-white text-slate-500 border border-slate-200 font-bold py-3 rounded-xl hover:bg-slate-50 transition-colors"
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

export default SellerDashboard;

