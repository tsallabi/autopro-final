import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore, authFetch } from '../context/StoreContext';
import {
  CreditCard, Shield, CheckCircle, Wallet, Globe, MapPin,
  ChevronRight, ArrowRight, Lock, Star, DollarSign,
  BadgeDollarSign, Banknote, Info, Loader2, Building2,
  Copy, Check, Phone, AlertCircle, Smartphone, QrCode
} from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env || {};
const API: string = _env.VITE_API_URL || '';
const STRIPE_PK: string = _env.VITE_STRIPE_PUBLISHABLE_KEY || '';

type Currency = 'USD' | 'LYD';
type Step = 'amount' | 'method' | 'pay' | 'success';
type PayMethod = 'sadad' | 'tadawul' | 'card' | 'bank_lyd' | 'bank_usd' | 'wise';

interface PayMethodInfo {
  id: PayMethod;
  label: string;
  labelEn: string;
  desc: string;
  icon: React.ReactNode;
  badge: string;
  badgeColor: string;
  currencies: Currency[];
  available: boolean;
}

const USD_AMOUNTS = [500, 1000, 2000, 5000];
const LYD_AMOUNTS = [1000, 2500, 5000, 10000];

export const DepositPage: React.FC = () => {
  const { currentUser, showAlert } = useStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('amount');
  const [selectedAmount, setSelectedAmount] = useState<number>(0);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>('sadad');
  const [loading, setLoading] = useState(false);
  const [stripeAvailable, setStripeAvailable] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [txId, setTxId] = useState('');
  const [bankRef, setBankRef] = useState('');
  const [copiedField, setCopiedField] = useState('');
  const [sadadPhone, setSadadPhone] = useState('');
  const [sadadOtp, setSadadOtp] = useState('');
  const [sadadStep, setSadadStep] = useState<'phone' | 'otp' | 'confirm'>('phone');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [stripeLoaded, setStripeLoaded] = useState(false);

  const isLibya = currentUser?.country === 'Libya' || currentUser?.country === 'ليبيا' || !currentUser?.country;
  const finalCurrency: Currency = isLibya ? 'LYD' : 'USD';
  const amounts = finalCurrency === 'LYD' ? LYD_AMOUNTS : USD_AMOUNTS;
  const minAmount = finalCurrency === 'LYD' ? 1000 : 500;

  const finalAmount = useCustom
    ? Math.max(minAmount, parseInt(customAmount) || minAmount)
    : (selectedAmount || minAmount);

  useEffect(() => {
    if (!currentUser) { showAlert('يجب تسجيل الدخول أولاً', 'error'); navigate('/auth'); }
    else { setSelectedAmount(amounts[0]); }
  }, [currentUser]);

  useEffect(() => {
    fetch(`${API}/api/payments/stripe-status`)
      .then(r => r.json())
      .then(d => setStripeAvailable(!!d.available))
      .catch(() => setStripeAvailable(false));
  }, []);

  useEffect(() => {
    if (!STRIPE_PK || !stripeAvailable) return;
    if ((window as any).Stripe) { setStripeLoaded(true); return; }
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/';
    s.onload = () => setStripeLoaded(true);
    document.head.appendChild(s);
  }, [stripeAvailable]);

  const formatCurrency = (n: number) =>
    finalCurrency === 'LYD' ? `${n.toLocaleString('ar-LY')} د.ل` : `$${n.toLocaleString('en-US')}`;

  const copyText = (text: string, field: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const CopyBtn = ({ text, field }: { text: string; field: string }) => (
    <button onClick={() => copyText(text, field)} className="text-gray-500 hover:text-orange-400 transition-colors ml-2">
      {copiedField === field ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
    </button>
  );

  const PAY_METHODS: PayMethodInfo[] = [
    {
      id: 'sadad', label: 'صداد (المدار)', labelEn: 'Sadad Al-Madar',
      desc: 'ادفع عبر رقم هاتفك المدار مباشرة — سريع وآمن',
      icon: <Smartphone className="w-6 h-6" />,
      badge: 'الأكثر شيوعاً', badgeColor: 'bg-green-500/20 text-green-400',
      currencies: ['LYD'], available: true,
    },
    {
      id: 'tadawul', label: 'تداول', labelEn: 'Tadawul',
      desc: 'بطاقة تداول أو Moamalat — شبكة نومو الليبية',
      icon: <CreditCard className="w-6 h-6" />,
      badge: 'بطاقات ليبية', badgeColor: 'bg-blue-500/20 text-blue-400',
      currencies: ['LYD'], available: true,
    },
    {
      id: 'bank_lyd', label: 'تحويل بنكي (LYD)', labelEn: 'Bank Wire LYD',
      desc: 'تحويل من أي مصرف ليبي — يُراجَع خلال 24 ساعة',
      icon: <Building2 className="w-6 h-6" />,
      badge: 'متاح دائماً', badgeColor: 'bg-gray-500/20 text-gray-400',
      currencies: ['LYD'], available: true,
    },
    {
      id: 'wise', label: 'Wise (تحويل دولي)', labelEn: 'Wise Transfer',
      desc: 'تحويل دولي بأقل رسوم — مناسب للمغتربين',
      icon: <Globe className="w-6 h-6" />,
      badge: 'خارج ليبيا', badgeColor: 'bg-purple-500/20 text-purple-400',
      currencies: ['USD'], available: true,
    },
    {
      id: 'card', label: 'بطاقة Visa / Mastercard', labelEn: 'Credit Card',
      desc: 'دفع دولي فوري عبر Stripe',
      icon: <CreditCard className="w-6 h-6" />,
      badge: stripeAvailable ? 'متاح' : 'قريباً', badgeColor: stripeAvailable ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400',
      currencies: ['USD'], available: true,
    },
    {
      id: 'plutu', label: 'بطاقة بنكية / Plutu', labelEn: 'Plutu',
      desc: 'دفع إلكتروني آمن عبر Plutu',
      icon: <CreditCard className="w-6 h-6" />,
      badge: 'متاح', badgeColor: 'bg-green-500/20 text-green-400',
      currencies: ['USD', 'LYD'], available: true,
    },
  ];

  const availableMethods = PAY_METHODS.filter(m => m.currencies.includes(finalCurrency));

  const goToPayStep = () => {
    const ref = `APD-${(currentUser?.id || 'U').slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    setBankRef(ref);
    setSadadStep('phone');
    setPaymentError('');
    setStep('pay');
  };

  // ── Sadad simulation (in real world: call Sadad API) ──
  const handleSadadSend = async () => {
    if (!sadadPhone || sadadPhone.length < 9) { setPaymentError('أدخل رقم هاتف صحيح'); return; }
    setLoading(true); setPaymentError('');
    await new Promise(r => setTimeout(r, 1200));
    setSadadStep('otp');
    setLoading(false);
  };

  const handleSadadVerify = async () => {
    if (!sadadOtp || sadadOtp.length < 4) { setPaymentError('أدخل رمز التحقق'); return; }
    setLoading(true); setPaymentError('');
    await new Promise(r => setTimeout(r, 1500));
    setSadadStep('confirm');
    setLoading(false);
  };

  const handleSadadConfirm = async () => {
    setLoading(true); setPaymentError('');
    await new Promise(r => setTimeout(r, 2000));
    const demoId = `SADAD-${Date.now()}`;
    setTxId(demoId);
    await submitDeposit(demoId, true, 'sadad');
    setStep('success');
    setLoading(false);
  };

  // ── Tadawul card payment ──
  const handleTadawulPay = async () => {
    if (!cardName || !cardNumber || !cardExpiry || !cardCvc) { setPaymentError('أكمل بيانات البطاقة'); return; }
    setLoading(true); setPaymentError('');
    await new Promise(r => setTimeout(r, 2000));
    const demoId = `TADAWUL-${Date.now()}`;
    setTxId(demoId);
    await submitDeposit(demoId, true, 'tadawul');
    setStep('success');
    setLoading(false);
  };

  // ── Plutu bank card payment ──
  const proceedToPlutу = async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/payments/plutu/localbank/create', {
        method: 'POST',
        body: JSON.stringify({ amount: finalAmount, type: 'deposit' })
      });
      const data = await res.json();
      if (data.redirect_url) {
        window.location.href = data.redirect_url; // Redirect to Plutu payment page
      } else {
        showAlert(data.error || 'فشل إنشاء عملية الدفع', 'error');
      }
    } catch (e) {
      showAlert('خطأ في الاتصال ببوابة الدفع', 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Stripe card payment ──
  const proceedToStripe = async () => {
    if (!currentUser) return;
    setLoading(true); setPaymentError('');
    try {
      const res = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
        body: JSON.stringify({ amount: finalAmount, currency: finalCurrency, type: 'deposit' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setClientSecret(data.clientSecret);
    } catch (err: any) { setPaymentError(err.message); }
    finally { setLoading(false); }
  };

  const handleStripePay = async () => {
    if (!currentUser) return;
    setLoading(true); setPaymentError('');
    try {
      if (stripeLoaded && STRIPE_PK && clientSecret && !clientSecret.startsWith('demo_')) {
        const stripe = (window as any).Stripe(STRIPE_PK);
        const [month, year] = cardExpiry.split('/');
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: { number: cardNumber.replace(/\s/g,''), exp_month: parseInt(month), exp_year: parseInt('20'+year), cvc: cardCvc },
            billing_details: { name: cardName },
          },
        });
        if (error) throw new Error(error.message);
        if (paymentIntent?.status === 'succeeded') {
          setTxId(paymentIntent.id);
          await submitDeposit(paymentIntent.id, false, 'stripe');
          setStep('success');
        }
      } else {
        await new Promise(r => setTimeout(r, 1800));
        const demoId = `STRIPE-DEMO-${Date.now()}`;
        setTxId(demoId);
        await submitDeposit(demoId, true, 'stripe');
        setStep('success');
      }
    } catch (err: any) { setPaymentError(err.message); }
    finally { setLoading(false); }
  };

  // ── Bank transfer submission ──
  const handleBankTransfer = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser!.token}` },
        body: JSON.stringify({
          userId: currentUser!.id,
          amount: finalAmount,
          currency: finalCurrency,
          method: paymentMethod === 'wise' ? 'wise' : paymentMethod === 'bank_lyd' ? 'bank_lyd' : 'bank_transfer',
          referenceNo: bankRef,
          notes: `طريقة الدفع: ${paymentMethod === 'wise' ? 'Wise (تحويل دولي)' : paymentMethod === 'bank_lyd' ? 'تحويل بنكي ليبي' : 'تحويل بنكي'}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTxId(bankRef);
      setStep('success');
    } catch (err: any) { showAlert(err.message || 'حدث خطأ', 'error'); }
    finally { setLoading(false); }
  };

  // ── Common: confirm deposit in backend ──
  const submitDeposit = async (paymentId: string, demo: boolean, method: string) => {
    if (!currentUser) return;
    await fetch(`${API}/api/payments/confirm-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentUser.token}` },
      body: JSON.stringify({ paymentIntentId: paymentId, amount: finalAmount, currency: finalCurrency, demo, method }),
    });
  };

  const formatCardNumber = (v: string) => v.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim();
  const formatExpiry = (v: string) => { const d = v.replace(/\D/g,'').slice(0,4); return d.length>=2?d.slice(0,2)+'/'+d.slice(2):d; };

  // ── Progress ──
  const steps = ['amount', 'method', 'pay', 'success'];
  const stepLabels = ['المبلغ', 'طريقة الدفع', 'الدفع', 'تأكيد'];
  const currentStepIdx = steps.indexOf(step);

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-orange-950/20 py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto mb-8">
        <button onClick={() => {
          if (step === 'amount') navigate(-1);
          else if (step === 'method') setStep('amount');
          else if (step === 'pay') setStep('method');
          else setStep('amount');
        }} className="text-gray-400 hover:text-white flex items-center gap-2 mb-6 transition-colors">
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

        {/* Progress */}
        <div className="flex items-center gap-2 mt-6">
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-1.5 ${currentStepIdx === i ? 'text-orange-400' : currentStepIdx > i ? 'text-green-400' : 'text-gray-600'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                  ${currentStepIdx === i ? 'border-orange-400 bg-orange-400/10' : currentStepIdx > i ? 'border-green-500 bg-green-500/10' : 'border-gray-700'}`}>
                  {currentStepIdx > i ? <Check className="w-3.5 h-3.5" /> : i+1}
                </div>
                <span className="text-xs hidden sm:block">{stepLabels[i]}</span>
              </div>
              {i < 3 && <div className={`flex-1 h-px ${currentStepIdx > i ? 'bg-green-500/40' : 'bg-gray-700'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">

        {/* ══════════ STEP 1: AMOUNT ══════════ */}
        {step === 'amount' && (
          <div className="space-y-6">
            {/* Why */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5 flex gap-3">
              <Info className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-orange-300 font-semibold mb-1">لماذا العربون؟</h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  العربون يُثبت جدِّيتك كمشتري ويمنحك صلاحية المزايدة في جميع مزادات AutoPro Libya.
                  يُحفظ في محفظتك ويُطبَّق على أول صفقة ناجحة. في حال عدم الفوز بأي مزاد، يُعاد المبلغ بالكامل.
                </p>
              </div>
            </div>

            {/* Location */}
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-4 flex items-center gap-3">
              {isLibya
                ? <><MapPin className="w-4 h-4 text-green-400 flex-shrink-0" /><span className="text-sm text-gray-300">دفع داخل ليبيا — <strong className="text-white">بالدينار الليبي (LYD)</strong> | الحد الأدنى: <strong className="text-orange-300">1,000 د.ل</strong></span></>
                : <><Globe className="w-4 h-4 text-blue-400 flex-shrink-0" /><span className="text-sm text-gray-300">دفع من خارج ليبيا — <strong className="text-white">بالدولار (USD)</strong> | الحد الأدنى: <strong className="text-orange-300">$500</strong></span></>}
            </div>

            {/* Amounts */}
            <div>
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-orange-400" />اختر مبلغ العربون
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {amounts.map(amt => (
                  <button key={amt} onClick={() => { setSelectedAmount(amt); setUseCustom(false); }}
                    className={`py-4 rounded-xl border-2 font-bold text-lg transition-all ${!useCustom && selectedAmount === amt
                      ? 'border-orange-500 bg-orange-500/20 text-orange-300 scale-105'
                      : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-500'}`}>
                    {finalCurrency === 'LYD' ? amt.toLocaleString() : `$${amt.toLocaleString()}`}
                    <span className="block text-xs font-normal text-gray-500 mt-0.5">{finalCurrency}</span>
                  </button>
                ))}
              </div>
              <div className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${useCustom ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'}`}
                onClick={() => setUseCustom(true)}>
                <div className="flex items-center gap-3">
                  <BadgeDollarSign className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-300 mb-1">مبلغ مخصص (أكثر من {finalCurrency==='LYD'?'10,000 د.ل':'$5,000'})</p>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-bold">{finalCurrency==='LYD'?'د.ل':'$'}</span>
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

            {/* Summary */}
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex justify-between mb-2"><span className="text-gray-400">مبلغ العربون</span><span className="text-white font-bold text-xl">{formatCurrency(finalAmount)}</span></div>
              <div className="flex justify-between mb-3"><span className="text-gray-400">رسوم المعالجة</span><span className="text-green-400 font-medium">مجاناً ✅</span></div>
              <div className="border-t border-gray-700 pt-3 flex justify-between">
                <span className="text-gray-300 font-semibold">الإجمالي</span>
                <span className="text-orange-400 font-bold text-2xl">{formatCurrency(finalAmount)}</span>
              </div>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-3 gap-3">
              {[{icon: Shield, t:'مؤمَّن 100%', d:'تشفير كامل'},{icon: CheckCircle, t:'قابل للاسترداد', d:'عدم الفوز بمزاد'},{icon: Star, t:'مزايدة حرة', d:'في كل المزادات'}].map(({icon:I,t,d})=>(
                <div key={t} className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-3 text-center">
                  <I className="w-5 h-5 text-orange-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-white">{t}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{d}</p>
                </div>
              ))}
            </div>

            <button onClick={() => setStep('method')}
              disabled={useCustom && (!customAmount || parseInt(customAmount) < minAmount)}
              className="w-full py-4 bg-gradient-to-l from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-40 text-lg">
              اختر طريقة الدفع <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ══════════ STEP 2: METHOD ══════════ */}
        {step === 'method' && (
          <div className="space-y-5">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 flex justify-between items-center">
              <span className="text-gray-400">المبلغ المحدد</span>
              <span className="text-orange-400 font-bold text-2xl">{formatCurrency(finalAmount)}</span>
            </div>

            <h2 className="text-white font-semibold text-lg">اختر طريقة الدفع</h2>

            <div className="space-y-3">
              {availableMethods.map(m => (
                <button key={m.id} onClick={() => setPayMethod(m.id)}
                  className={`w-full p-4 rounded-2xl border-2 text-right transition-all ${payMethod === m.id ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${payMethod === m.id ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-700/50 text-gray-400'}`}>
                      {m.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-semibold">{m.label}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${m.badgeColor}`}>{m.badge}</span>
                      </div>
                      <p className="text-sm text-gray-400 mt-0.5">{m.desc}</p>
                    </div>
                    {payMethod === m.id && <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center flex-shrink-0"><Check className="w-3 h-3 text-white" /></div>}
                  </div>
                </button>
              ))}
            </div>

            {/* Info boxes per method */}
            {payMethod === 'card' && !stripeAvailable && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 flex gap-3">
                <Info className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300">الدفع بالبطاقة الدولية سيكون متاحاً قريباً. في الوقت الحالي يُنصح بصداد أو التحويل البنكي.</p>
              </div>
            )}

            <button onClick={goToPayStep}
              className="w-full py-4 bg-gradient-to-l from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 text-lg">
              متابعة للدفع <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ══════════ STEP 3: PAYMENT ══════════ */}
        {step === 'pay' && (
          <div className="space-y-5">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 flex justify-between items-center">
              <span className="text-gray-400">المبلغ</span>
              <span className="text-orange-400 font-bold text-2xl">{formatCurrency(finalAmount)}</span>
            </div>

            {/* ── SADAD ── */}
            {payMethod === 'sadad' && (
              <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-orange-400" />
                  <h3 className="text-white font-semibold">الدفع عبر صداد المدار</h3>
                </div>

                {sadadStep === 'phone' && (
                  <>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">رقم هاتف المدار المرتبط بحسابك</label>
                      <div className="flex gap-2">
                        <span className="bg-gray-900 border border-gray-600 rounded-lg px-3 py-3 text-gray-400 text-sm">+218</span>
                        <input type="tel" value={sadadPhone} onChange={e => setSadadPhone(e.target.value.replace(/\D/g,'').slice(0,10))}
                          placeholder="91 234 5678" dir="ltr"
                          className="flex-1 bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                      </div>
                    </div>
                    {paymentError && <p className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{paymentError}</p>}
                    <button onClick={handleSadadSend} disabled={loading || sadadPhone.length < 9}
                      className="w-full py-3.5 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                      {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الإرسال...</> : <>إرسال رمز التحقق <ChevronRight className="w-4 h-4" /></>}
                    </button>
                  </>
                )}

                {sadadStep === 'otp' && (
                  <>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-sm text-green-300">
                      ✅ تم إرسال رمز تحقق إلى {'+218' + sadadPhone}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">رمز التحقق (OTP)</label>
                      <input type="text" value={sadadOtp} onChange={e => setSadadOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                        placeholder="• • • • • •" maxLength={6} dir="ltr"
                        className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white text-center text-2xl font-mono tracking-widest placeholder-gray-600 focus:outline-none focus:border-orange-500" />
                    </div>
                    {paymentError && <p className="text-red-400 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{paymentError}</p>}
                    <button onClick={handleSadadVerify} disabled={loading || sadadOtp.length < 4}
                      className="w-full py-3.5 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                      {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري التحقق...</> : 'تحقق من الرمز'}
                    </button>
                  </>
                )}

                {sadadStep === 'confirm' && (
                  <>
                    <div className="bg-gray-900/60 rounded-xl p-4 space-y-2">
                      <div className="flex justify-between"><span className="text-gray-400">من:</span><span className="text-white font-mono">+218{sadadPhone}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">المبلغ:</span><span className="text-orange-400 font-bold">{formatCurrency(finalAmount)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">إلى:</span><span className="text-white text-sm">AutoPro Libya — عربون مزايدة</span></div>
                    </div>
                    <button onClick={handleSadadConfirm} disabled={loading}
                      className="w-full py-3.5 bg-gradient-to-l from-green-500 to-green-600 hover:from-green-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                      {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الدفع...</> : <><Lock className="w-4 h-4" />تأكيد الدفع {formatCurrency(finalAmount)}</>}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* ── TADAWUL card ── */}
            {payMethod === 'tadawul' && (
              <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <CreditCard className="w-5 h-5 text-blue-400" />
                  <h3 className="text-white font-semibold">بطاقة تداول / موامالات</h3>
                  <Lock className="w-3.5 h-3.5 text-green-400 mr-auto" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">اسم حامل البطاقة</label>
                  <input type="text" value={cardName} onChange={e=>setCardName(e.target.value)} placeholder="الاسم على البطاقة" dir="ltr"
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">رقم البطاقة</label>
                  <input type="text" value={cardNumber} onChange={e=>setCardNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" maxLength={19} dir="ltr"
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono tracking-widest" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">تاريخ الانتهاء</label>
                    <input type="text" value={cardExpiry} onChange={e=>setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/YY" maxLength={5} dir="ltr"
                      className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">CVV</label>
                    <input type="text" value={cardCvc} onChange={e=>setCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="123" maxLength={4} dir="ltr"
                      className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                </div>
                {paymentError && <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span className="text-sm">{paymentError}</span></div>}
                <div className="flex gap-3">
                  <button onClick={() => setStep('method')} className="flex-1 py-3.5 border border-gray-600 text-gray-300 hover:border-gray-400 font-semibold rounded-xl">رجوع</button>
                  <button onClick={handleTadawulPay} disabled={loading || !cardName || !cardNumber || !cardExpiry || !cardCvc}
                    className="flex-[2] py-3.5 bg-gradient-to-l from-blue-500 to-blue-600 hover:from-blue-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الدفع...</> : <><Lock className="w-4 h-4" />دفع {formatCurrency(finalAmount)}</>}
                  </button>
                </div>
              </div>
            )}

            {/* ── BANK LYD ── */}
            {payMethod === 'bank_lyd' && (
              <div className="space-y-4">
                <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2"><Building2 className="w-4 h-4 text-orange-400" />بيانات التحويل البنكي داخل ليبيا</h3>
                  {[
                    { l: 'البنك', v: 'مصرف الجمهورية — فرع طرابلس المركزي' },
                    { l: 'اسم الحساب', v: 'طارق سالابي / AutoPro Libya' },
                    { l: 'رقم الحساب', v: '113-002-0001234567' },
                    { l: 'الرقم المرجعي (مهم)', v: bankRef },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex justify-between items-center py-2 border-b border-gray-700/40 last:border-0">
                      <span className="text-gray-400 text-sm">{l}</span>
                      <div className="flex items-center gap-1">
                        <span className={`font-mono text-sm ${l.includes('مرجعي') ? 'text-yellow-300 font-bold' : 'text-white'}`}>{v}</span>
                        <CopyBtn text={v} field={l} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex gap-3">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300">بعد إتمام التحويل، اضغط "تأكيد التحويل" وسيُفعَّل حسابك فور وصول المبلغ (خلال 24 ساعة).</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep('method')} className="flex-1 py-3.5 border border-gray-600 text-gray-300 font-semibold rounded-xl">رجوع</button>
                  <button onClick={handleBankTransfer} disabled={loading}
                    className="flex-[2] py-3.5 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الإرسال...</> : '✅ تأكيد التحويل'}
                  </button>
                </div>
              </div>
            )}

            {/* ── WISE (USD) ── */}
            {payMethod === 'wise' && (
              <div className="space-y-4">
                <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5 space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-purple-400" />Wise Bank Transfer (International)</h3>
                  {[
                    { l: 'Bank', v: 'Wise (TransferWise)' },
                    { l: 'Account Name', v: 'AutoPro Libya / Macchinaa' },
                    { l: 'IBAN', v: 'BE89 9672 0425 7329' },
                    { l: 'BIC/SWIFT', v: 'TRWIBEB1XXX' },
                    { l: 'Reference (required)', v: bankRef },
                  ].map(({ l, v }) => (
                    <div key={l} className="flex justify-between items-center py-2 border-b border-gray-700/40 last:border-0">
                      <span className="text-gray-400 text-sm">{l}</span>
                      <div className="flex items-center gap-1">
                        <span className={`font-mono text-sm ${l.includes('Reference') ? 'text-yellow-300 font-bold' : 'text-white'}`}>{v}</span>
                        <CopyBtn text={v} field={l} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex gap-3">
                  <Info className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-purple-300">Use Wise app or your bank's wire transfer. After sending, click "Confirm Transfer" and we'll activate your account within 24h.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep('method')} className="flex-1 py-3.5 border border-gray-600 text-gray-300 font-semibold rounded-xl">Back</button>
                  <button onClick={handleBankTransfer} disabled={loading}
                    className="flex-[2] py-3.5 bg-gradient-to-l from-purple-500 to-purple-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" />Submitting...</> : '✅ Confirm Transfer'}
                  </button>
                </div>
              </div>
            )}

            {/* ── PLUTU ── */}
            {payMethod === 'plutu' && (
              <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-orange-400" />
                  <h3 className="text-white font-semibold">بطاقة بنكية / Plutu</h3>
                  <Lock className="w-3.5 h-3.5 text-green-400 mr-auto" />
                </div>
                <p className="text-gray-400 text-sm">سيتم تحويلك إلى بوابة Plutu لإتمام الدفع بشكل آمن.</p>
                {paymentError && <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3"><AlertCircle className="w-4 h-4" /><span className="text-sm">{paymentError}</span></div>}
                <div className="flex gap-3">
                  <button onClick={() => setStep('method')} className="flex-1 py-3.5 border border-gray-600 text-gray-300 font-semibold rounded-xl">رجوع</button>
                  <button onClick={proceedToPlutу} disabled={loading}
                    className="flex-[2] py-3.5 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري التحويل...</> : <><Lock className="w-4 h-4" />الدفع عبر Plutu — {formatCurrency(finalAmount)}</>}
                  </button>
                </div>
              </div>
            )}

            {/* ── STRIPE CARD ── */}
            {payMethod === 'card' && (
              <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="w-5 h-5 text-orange-400" />
                  <h3 className="text-white font-semibold">بطاقة Visa / Mastercard (Stripe)</h3>
                  <Lock className="w-3.5 h-3.5 text-green-400 mr-auto" />
                </div>
                {!stripeAvailable && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-300">
                    وضع تجريبي — أدخل أي بيانات وسيتم تسجيل الطلب يدوياً من الإدارة.
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">اسم حامل البطاقة</label>
                  <input type="text" value={cardName} onChange={e=>setCardName(e.target.value)} placeholder="Cardholder Name" dir="ltr"
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">رقم البطاقة</label>
                  <input type="text" value={cardNumber} onChange={e=>setCardNumber(formatCardNumber(e.target.value))} placeholder="0000 0000 0000 0000" maxLength={19} dir="ltr"
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono tracking-widest" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Expiry</label>
                    <input type="text" value={cardExpiry} onChange={e=>setCardExpiry(formatExpiry(e.target.value))} placeholder="MM/YY" maxLength={5} dir="ltr"
                      className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">CVV</label>
                    <input type="text" value={cardCvc} onChange={e=>setCardCvc(e.target.value.replace(/\D/g,'').slice(0,4))} placeholder="123" maxLength={4} dir="ltr"
                      className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono" />
                  </div>
                </div>
                {paymentError && <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3"><AlertCircle className="w-4 h-4" /><span className="text-sm">{paymentError}</span></div>}
                <div className="flex items-center justify-center gap-4 opacity-50 py-1">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg" alt="Visa" className="h-6" />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-6" />
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep('method')} className="flex-1 py-3.5 border border-gray-600 text-gray-300 font-semibold rounded-xl">رجوع</button>
                  <button onClick={handleStripePay} disabled={loading || !cardName || !cardNumber || !cardExpiry || !cardCvc}
                    className="flex-[2] py-3.5 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-40">
                    {loading ? <><Loader2 className="w-5 h-5 animate-spin" />جاري الدفع...</> : <><Lock className="w-4 h-4" />دفع {formatCurrency(finalAmount)}</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ STEP 4: SUCCESS ══════════ */}
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white mb-2">
                {['bank_lyd','wise'].includes(payMethod) ? 'تم استلام طلبك! 📋' : 'تم الدفع بنجاح! 🎉'}
              </h2>
              <p className="text-gray-400">
                {['bank_lyd','wise'].includes(payMethod)
                  ? 'سيُفعَّل حسابك فور التحقق من التحويل (خلال 24 ساعة)'
                  : 'تمت إضافة العربون إلى محفظتك — يمكنك المزايدة الآن!'}
              </p>
            </div>

            <div className="bg-gray-800/60 border border-green-500/30 rounded-2xl p-6 text-right space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">المبلغ</span>
                <span className="text-green-400 font-bold text-xl">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">رقم المعاملة</span>
                <div className="flex items-center gap-1">
                  <span className="text-gray-300 font-mono text-xs">{txId.slice(0,28)}</span>
                  <CopyBtn text={txId} field="txid" />
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">طريقة الدفع</span>
                <span className="text-gray-300 text-sm capitalize">{PAY_METHODS.find(m=>m.id===payMethod)?.label}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الحالة</span>
                <span className={`flex items-center gap-1 font-medium ${['bank_lyd','wise'].includes(payMethod) ? 'text-yellow-400' : 'text-green-400'}`}>
                  {['bank_lyd','wise'].includes(payMethod) ? '⏳ قيد المراجعة' : <><CheckCircle className="w-3.5 h-3.5" />مكتمل</>}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => navigate('/marketplace')} className="flex-1 py-4 border border-gray-600 text-gray-300 hover:border-orange-500 hover:text-orange-400 font-semibold rounded-xl transition-all">🏎️ تصفح المزادات</button>
              <button onClick={() => navigate('/dashboard/user')} className="flex-1 py-4 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl">لوحة التحكم</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
