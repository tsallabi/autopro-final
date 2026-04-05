import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import {
  CreditCard, Shield, CheckCircle, AlertCircle, Wallet,
  Globe, MapPin, ChevronRight, ArrowRight, Lock, Star,
  DollarSign, BadgeDollarSign, Banknote, Info, Loader2,
  Building2, Phone, Copy, Check, ExternalLink
} from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env || {};
const API: string = _env.VITE_API_URL || '';
const STRIPE_PK: string = _env.VITE_STRIPE_PUBLISHABLE_KEY || '';

type Currency = 'USD' | 'LYD';
type Step = 'amount' | 'method' | 'card' | 'bank' | 'success';
type PayMethod = 'card' | 'bank';

const USD_AMOUNTS = [500, 1000, 2000, 5000];
const LYD_AMOUNTS = [1000, 2500, 5000, 10000];

// Bank details for manual transfer
const BANK_USD = {
  bank: 'Wise (TransferWise)',
  accountName: 'AutoPro Libya / Macchinaa',
  iban: 'BE89 9672 0425 7329',
  bic: 'TRWIBEB1XXX',
  ref: 'AUTOPRO-DEPOSIT',
};
const BANK_LYD = {
  bank: 'مصرف الجمهورية - ليبيا',
  accountName: 'طارق سالابي / أوتو برو',
  account: '113-002-0001234567',
  ref: 'عربون-أوتو-برو',
};

export const DepositPage: React.FC = () => {
  const { currentUser, showAlert } = useStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('amount');
  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('card');
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [stripeAvailable, setStripeAvailable] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [txId, setTxId] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [copiedField, setCopiedField] = useState('');

  const isLibya = currentUser?.country === 'Libya' || currentUser?.country === 'ليبيا';
  const finalCurrency: Currency = isLibya ? 'LYD' : 'USD';
  const amounts = finalCurrency === 'LYD' ? LYD_AMOUNTS : USD_AMOUNTS;
  const minAmount = finalCurrency === 'LYD' ? 1000 : 500;
  const symbol = finalCurrency === 'LYD' ? 'د.ل' : '$';

  const finalAmount = useCustom
    ? Math.max(minAmount, parseInt(customAmount) || minAmount)
    : selectedAmount;

  useEffect(() => {
    if (!currentUser) { showAlert('يجب تسجيل الدخول أولاً', 'error'); navigate('/auth'); }
  }, [currentUser]);

  // Check Stripe availability from backend
  useEffect(() => {
    fetch(`${API}/api/payments/stripe-status`)
      .then(r => r.json())
      .then(d => setStripeAvailable(d.available === true))
      .catch(() => setStripeAvailable(false));
  }, []);

  // Load Stripe.js
  useEffect(() => {
    if (!STRIPE_PK || !stripeAvailable) return;
    if ((window as any).Stripe) { setStripeLoaded(true); return; }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => setStripeLoaded(true);
    document.head.appendChild(script);
  }, [stripeAvailable]);

  const formatCurrency = (amount: number) =>
    finalCurrency === 'LYD' ? `${amount.toLocaleString('ar-LY')} د.ل` : `$${amount.toLocaleString('en-US')}`;

  const formatCardNumber = (val: string) =>
    val.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();

  const formatExpiry = (val: string) => {
    const d = val.replace(/\D/g, '').slice(0, 4);
    return d.length >= 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
  };

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const proceedToCard = async () => {
    if (!currentUser) return;
    setLoading(true); setPaymentError('');
    try {
      const res = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({ amount: finalAmount, currency: finalCurrency, type: 'deposit' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء جلسة الدفع');
      setClientSecret(data.clientSecret);
      setStep('card');
    } catch (err: any) {
      showAlert(err.message || 'حدث خطأ، حاول مرة أخرى', 'error');
    } finally { setLoading(false); }
  };

  const proceedToBank = () => {
    // Generate reference code for this user's transfer
    const ref = `APD-${currentUser?.id?.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    setBankRef(ref);
    setStep('bank');
  };

  const handleCardPayment = async () => {
    if (!currentUser) return;
    setLoading(true); setPaymentError('');
    try {
      if (stripeLoaded && STRIPE_PK && clientSecret && !clientSecret.startsWith('demo_')) {
        const stripe = (window as any).Stripe(STRIPE_PK);
        const [month, year] = cardExpiry.split('/');
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: { number: cardNumber.replace(/\s/g, ''), exp_month: parseInt(month), exp_year: parseInt('20' + year), cvc: cardCvc },
            billing_details: { name: cardName },
          },
        });
        if (error) throw new Error(error.message);
        if (paymentIntent?.status === 'succeeded') {
          setTxId(paymentIntent.id);
          await confirmDeposit(paymentIntent.id, false);
          setStep('success');
        }
      } else {
        // Demo mode
        await new Promise(r => setTimeout(r, 1800));
        const demoId = 'demo_' + Date.now();
        setTxId(demoId);
        await confirmDeposit(demoId, true);
        setStep('success');
      }
    } catch (err: any) {
      setPaymentError(err.message || 'فشل الدفع. تحقق من بيانات البطاقة وحاول مرة أخرى.');
    } finally { setLoading(false); }
  };

  const confirmDeposit = async (paymentIntentId: string, demo: boolean) => {
    await fetch(`${API}/api/payments/confirm-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser!.token}` },
      body: JSON.stringify({ paymentIntentId, amount: finalAmount, currency: finalCurrency, demo }),
    });
  };

  const submitBankTransfer = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/wallet/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({ userId: currentUser.id, amount: finalAmount, method: 'bank_transfer', referenceNo: bankRef }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTxId(bankRef);
      setStep('success');
    } catch (err: any) {
      showAlert(err.message || 'حدث خطأ، حاول مرة أخرى', 'error');
    } finally { setLoading(false); }
  };

  if (!currentUser) return null;

  const ProgressBar = () => (
    <div className="flex items-center gap-2 mt-6">
      {(['amount', 'method', payMethod === 'card' ? 'card' : 'bank', 'success'] as const).map((s, i) => {
        const labels = ['المبلغ', 'طريقة الدفع', payMethod === 'card' ? 'البطاقة' : 'التحويل', 'تأكيد'];
        const isActive = step === s;
        const isPast = (['amount','method','card','bank','success'] as string[]).indexOf(step) > i;
        return (
          <React.Fragment key={s}>
            <div className={`flex items-center gap-1.5 ${isActive ? 'text-orange-400' : isPast ? 'text-green-400' : 'text-gray-600'}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${isActive ? 'border-orange-400 bg-orange-400/10' : isPast ? 'border-green-500 bg-green-500/10' : 'border-gray-700'}`}>
                {isPast ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className="text-xs hidden sm:block">{labels[i]}</span>
            </div>
            {i < 3 && <div className={`flex-1 h-px ${isPast ? 'bg-green-500/40' : 'bg-gray-700'}`} />}
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-orange-950/20 py-8 px-4">
      <div className="max-w-2xl mx-auto mb-8">
        <button onClick={() => step === 'amount' ? navigate(-1) : setStep(step === 'card' || step === 'bank' ? 'method' : step === 'method' ? 'amount' : 'amount')}
          className="text-gray-400 hover:text-white flex items-center gap-2 mb-6 transition-colors">
          <ArrowRight className="w-4 h-4" /><span className="text-sm">رجوع</span>
        </button>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">دفع العربون</h1>
            <p className="text-sm text-gray-400">Earnest Money Deposit — AutoPro Libya</p>
          </div>
        </div>
        <ProgressBar />
      </div>

      <div className="max-w-2xl mx-auto">

        {/* ── STEP 1: Amount ── */}
        {step === 'amount' && (
          <div className="space-y-6">
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5">
              <div className="flex gap-3">
                <Info className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-orange-300 font-semibold mb-1">لماذا العربون؟</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">العربون يُثبت جدِّيتك كمشتري ويمنحك صلاحية المزايدة في جميع المزادات. يُحفظ في محفظتك ويُطبَّق على أول صفقة ناجحة. في حال عدم الفوز بأي مزاد، يُعاد المبلغ بالكامل.</p>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex items-center gap-3">
                {isLibya
                  ? <><MapPin className="w-4 h-4 text-green-400" /><span className="text-sm text-gray-300">دفع داخل ليبيا — <strong className="text-white">بالدينار الليبي (LYD)</strong></span></>
                  : <><Globe className="w-4 h-4 text-blue-400" /><span className="text-sm text-gray-300">دفع من خارج ليبيا — <strong className="text-white">بالدولار الأمريكي (USD)</strong></span></>}
              </div>
              <p className="text-xs text-gray-500 mt-2">{isLibya ? 'الحد الأدنى: 1,000 دينار ليبي' : 'Minimum deposit: $500 USD'}</p>
            </div>

            <div>
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-orange-400" />اختر مبلغ العربون
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {amounts.map(amt => (
                  <button key={amt} onClick={() => { setSelectedAmount(amt); setUseCustom(false); }}
                    className={`py-4 rounded-xl border-2 font-bold text-lg transition-all ${!useCustom && selectedAmount === amt ? 'border-orange-500 bg-orange-500/20 text-orange-300' : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-500'}`}>
                    {finalCurrency === 'LYD' ? amt.toLocaleString() : `$${amt.toLocaleString()}`}
                    <span className="block text-xs font-normal text-gray-500 mt-0.5">{finalCurrency}</span>
                  </button>
                ))}
              </div>
              <div className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${useCustom ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'}`} onClick={() => setUseCustom(true)}>
                <div className="flex items-center gap-3">
                  <BadgeDollarSign className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-300 mb-2">مبلغ مخصص</p>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-bold">{symbol}</span>
                      <input type="number" min={minAmount} value={customAmount}
                        onChange={e => { setCustomAmount(e.target.value); setUseCustom(true); }}
                        placeholder={`الحد الأدنى ${minAmount.toLocaleString()}`}
                        className="bg-transparent text-white font-bold text-lg w-full outline-none placeholder-gray-600"
                        onClick={e => e.stopPropagation()} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">مبلغ العربون</span>
                <span className="text-white font-bold text-xl">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-400">رسوم المعالجة</span>
                <span className="text-green-400 text-sm font-medium">مجاناً</span>
              </div>
              <div className="border-t border-gray-700 pt-3 flex justify-between">
                <span className="text-gray-300 font-semibold">الإجمالي</span>
                <span className="text-orange-400 font-bold text-xl">{formatCurrency(finalAmount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[{icon: Shield, title: 'مؤمَّن', desc: 'دفع آمن 100%'}, {icon: CheckCircle, title: 'قابل للاسترداد', desc: 'إذا لم تفز بأي مزاد'}, {icon: Star, title: 'مزايدة حرة', desc: 'في جميع المزادات'}].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-3 text-center">
                  <Icon className="w-5 h-5 text-orange-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-white">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>

            <button onClick={() => setStep('method')}
              disabled={useCustom && (!customAmount || parseInt(customAmount) < minAmount)}
              className="w-full py-4 bg-gradient-to-l from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 text-lg">
              متابعة<ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ── STEP 2: Payment Method ── */}
        {step === 'method' && (
          <div className="space-y-5">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex justify-between">
                <span className="text-gray-400">المبلغ المطلوب</span>
                <span className="text-orange-400 font-bold text-2xl">{formatCurrency(finalAmount)}</span>
              </div>
            </div>

            <h2 className="text-white font-semibold text-lg">اختر طريقة الدفع</h2>

            {/* Card option */}
            <button onClick={() => setPayMethod('card')}
              className={`w-full p-5 rounded-2xl border-2 text-right transition-all ${payMethod === 'card' ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${payMethod === 'card' ? 'bg-orange-500/20' : 'bg-gray-700/50'}`}>
                  <CreditCard className={`w-6 h-6 ${payMethod === 'card' ? 'text-orange-400' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold">بطاقة ائتمان / مدين</p>
                  <p className="text-sm text-gray-400">Visa, Mastercard — دفع فوري</p>
                </div>
                {stripeAvailable ? (
                  <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">متاح</span>
                ) : (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">قريباً</span>
                )}
              </div>
            </button>

            {/* Bank transfer option */}
            <button onClick={() => setPayMethod('bank')}
              className={`w-full p-5 rounded-2xl border-2 text-right transition-all ${payMethod === 'bank' ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'}`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${payMethod === 'bank' ? 'bg-orange-500/20' : 'bg-gray-700/50'}`}>
                  <Building2 className={`w-6 h-6 ${payMethod === 'bank' ? 'text-orange-400' : 'text-gray-400'}`} />
                </div>
                <div className="flex-1">
                  <p className="text-white font-semibold">تحويل بنكي</p>
                  <p className="text-sm text-gray-400">{isLibya ? 'تحويل عبر مصرف ليبيا — يُراجَع خلال 24 ساعة' : 'Bank wire / Wise — reviewed within 24h'}</p>
                </div>
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">متاح الآن</span>
              </div>
            </button>

            {!stripeAvailable && payMethod === 'card' && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex gap-3">
                <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300">الدفع بالبطاقة سيكون متاحاً قريباً. في الوقت الحالي يُنصح باستخدام التحويل البنكي.</p>
              </div>
            )}

            <button onClick={() => payMethod === 'card' ? proceedToCard() : proceedToBank()}
              disabled={loading}
              className="w-full py-4 bg-gradient-to-l from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 text-lg">
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري التحضير...</> : <>متابعة<ChevronRight className="w-5 h-5" /></>}
            </button>
          </div>
        )}

        {/* ── STEP 3a: Card Payment ── */}
        {step === 'card' && (
          <div className="space-y-6">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex justify-between">
                <span className="text-gray-400">المبلغ</span>
                <span className="text-orange-400 font-bold text-2xl">{formatCurrency(finalAmount)}</span>
              </div>
            </div>

            {!stripeAvailable && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex gap-3">
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300"><strong>وضع التجربة:</strong> يمكنك إدخال أي بيانات بطاقة وسيتم تسجيل طلبك. سيُراجَع ويُفعَّل يدوياً من الإدارة.</p>
              </div>
            )}

            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-orange-400" />
                <h3 className="text-white font-semibold">بيانات البطاقة</h3>
                <Lock className="w-3.5 h-3.5 text-green-400 mr-auto" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">اسم حامل البطاقة</label>
                <input type="text" value={cardName} onChange={e => setCardName(e.target.value)} placeholder="الاسم كما يظهر على البطاقة"
                  className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors" dir="ltr" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">رقم البطاقة</label>
                <input type="text" value={cardNumber} onChange={e => setCardNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" maxLength={19}
                  className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono tracking-widest" dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">تاريخ الانتهاء</label>
                  <input type="text" value={cardExpiry} onChange={e => setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/YY" maxLength={5}
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">CVV</label>
                  <input type="text" value={cardCvc} onChange={e => setCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="123" maxLength={4}
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" dir="ltr" />
                </div>
              </div>
              {paymentError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /><span className="text-sm">{paymentError}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-4 opacity-50">
              <img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg" alt="Visa" className="h-6 object-contain" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-6 object-contain" />
              <div className="flex items-center gap-1 text-xs text-gray-500"><Lock className="w-3 h-3" /><span>SSL Encrypted</span></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('method')} disabled={loading}
                className="flex-1 py-4 border border-gray-600 text-gray-300 hover:border-gray-400 font-semibold rounded-xl transition-all">رجوع</button>
              <button onClick={handleCardPayment} disabled={loading || !cardName || !cardNumber || !cardExpiry || !cardCvc}
                className="flex-[2] py-4 bg-gradient-to-l from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 text-lg">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الدفع...</> : <><Lock className="w-4 h-4" />دفع {formatCurrency(finalAmount)}</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3b: Bank Transfer ── */}
        {step === 'bank' && (
          <div className="space-y-5">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">المبلغ المطلوب تحويله</span>
                <span className="text-orange-400 font-bold text-2xl">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">رقم مرجعي (أضفه في وصف التحويل)</span>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-300 font-mono text-sm font-bold">{bankRef}</span>
                  <button onClick={() => copyText(bankRef, 'ref')} className="text-gray-400 hover:text-white">
                    {copiedField === 'ref' ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {isLibya ? (
              <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-orange-400" />بيانات التحويل البنكي (ليبيا)</h3>
                {[
                  { label: 'البنك', value: BANK_LYD.bank, field: 'bank_lyd' },
                  { label: 'اسم الحساب', value: BANK_LYD.accountName, field: 'name_lyd' },
                  { label: 'رقم الحساب', value: BANK_LYD.account, field: 'acc_lyd' },
                  { label: 'الرقم المرجعي', value: bankRef, field: 'ref_lyd' },
                ].map(({ label, value, field }) => (
                  <div key={field} className="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-0">
                    <span className="text-gray-400 text-sm">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono text-sm">{value}</span>
                      <button onClick={() => copyText(value, field)} className="text-gray-500 hover:text-white">
                        {copiedField === field ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-4">
                <h3 className="text-white font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-orange-400" />Bank Transfer Details (International)</h3>
                {[
                  { label: 'Bank', value: BANK_USD.bank, field: 'bank_usd' },
                  { label: 'Account Name', value: BANK_USD.accountName, field: 'name_usd' },
                  { label: 'IBAN', value: BANK_USD.iban, field: 'iban_usd' },
                  { label: 'BIC/SWIFT', value: BANK_USD.bic, field: 'bic_usd' },
                  { label: 'Reference', value: bankRef, field: 'ref_usd' },
                ].map(({ label, value, field }) => (
                  <div key={field} className="flex justify-between items-center py-2 border-b border-gray-700/50 last:border-0">
                    <span className="text-gray-400 text-sm">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono text-sm">{value}</span>
                      <button onClick={() => copyText(value, field)} className="text-gray-500 hover:text-white">
                        {copiedField === field ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex gap-3">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-300 leading-relaxed">بعد إتمام التحويل، اضغط "تأكيد التحويل" أدناه. سيُفعَّل حسابك فور التحقق من وصول المبلغ (خلال 24 ساعة).</p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('method')} className="flex-1 py-4 border border-gray-600 text-gray-300 hover:border-gray-400 font-semibold rounded-xl">رجوع</button>
              <button onClick={submitBankTransfer} disabled={loading}
                className="flex-[2] py-4 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 text-lg">
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الإرسال...</> : <>✅ تأكيد التحويل</>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Success ── */}
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">
                {payMethod === 'bank' ? 'تم استلام طلبك! 📋' : 'تم الدفع بنجاح! 🎉'}
              </h2>
              <p className="text-gray-400">
                {payMethod === 'bank' ? 'سيُفعَّل حسابك فور التحقق من التحويل (خلال 24 ساعة)' : 'تمت إضافة العربون إلى محفظتك'}
              </p>
            </div>
            <div className="bg-gray-800/60 border border-green-500/30 rounded-2xl p-6 text-right space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">المبلغ</span>
                <span className="text-green-400 font-bold text-xl">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الرقم المرجعي</span>
                <span className="text-gray-300 font-mono text-sm">{txId.slice(0, 24)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الحالة</span>
                <span className={`flex items-center gap-1 ${payMethod === 'bank' ? 'text-yellow-400' : 'text-green-400'}`}>
                  {payMethod === 'bank' ? '⏳ قيد المراجعة' : <><CheckCircle className="w-3.5 h-3.5" />مكتمل</>}
                </span>
              </div>
            </div>
            {payMethod === 'bank' && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5 text-right">
                <p className="text-sm text-gray-300">تذكير: الرقم المرجعي الخاص بتحويلك هو <strong className="text-yellow-300 font-mono">{txId}</strong>. احتفظ به للمتابعة مع الدعم.</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => navigate('/marketplace')} className="flex-1 py-4 border border-gray-600 text-gray-300 hover:border-orange-500 hover:text-orange-400 font-semibold rounded-xl transition-all">تصفح المزادات</button>
              <button onClick={() => navigate('/dashboard/user')} className="flex-1 py-4 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl">لوحة التحكم</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
