import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import {
  CreditCard, Shield, CheckCircle, AlertCircle, Wallet,
  Globe, MapPin, ChevronRight, ArrowRight, Lock, Star,
  DollarSign, BadgeDollarSign, Banknote, Info, Loader2
} from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _env = (import.meta as any).env || {};
const API: string = _env.VITE_API_URL || '';
// Stripe publishable key - set via env var VITE_STRIPE_PUBLISHABLE_KEY
const STRIPE_PK: string = _env.VITE_STRIPE_PUBLISHABLE_KEY || '';

type Currency = 'USD' | 'LYD';
type Step = 'amount' | 'payment' | 'success';

const USD_AMOUNTS = [500, 1000, 2000, 5000];
const LYD_AMOUNTS = [1000, 2500, 5000, 10000];

export const DepositPage: React.FC = () => {
  const { currentUser, showAlert } = useStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('amount');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [selectedAmount, setSelectedAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [useCustom, setUseCustom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState('');
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [txId, setTxId] = useState('');

  const isLibya = currentUser?.country === 'Libya' || currentUser?.country === 'ليبيا';
  const finalCurrency: Currency = isLibya ? 'LYD' : 'USD';
  const amounts = finalCurrency === 'LYD' ? LYD_AMOUNTS : USD_AMOUNTS;
  const minAmount = finalCurrency === 'LYD' ? 1000 : 500;
  const symbol = finalCurrency === 'LYD' ? 'د.ل' : '$';
  const symbolEn = finalCurrency === 'LYD' ? 'LYD' : 'USD';

  const finalAmount = useCustom
    ? Math.max(minAmount, parseInt(customAmount) || minAmount)
    : selectedAmount;

  // Redirect if not logged in
  useEffect(() => {
    if (!currentUser) {
      showAlert('يجب تسجيل الدخول أولاً', 'error');
      navigate('/auth');
    }
  }, [currentUser]);

  // Load Stripe.js
  useEffect(() => {
    if (!STRIPE_PK) {
      setStripeLoaded(false);
      return;
    }
    if ((window as any).Stripe) {
      setStripeLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.onload = () => setStripeLoaded(true);
    document.head.appendChild(script);
  }, []);

  const formatCurrency = (amount: number) => {
    if (finalCurrency === 'LYD') return `${amount.toLocaleString('ar-LY')} د.ل`;
    return `$${amount.toLocaleString('en-US')}`;
  };

  const formatCardNumber = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 2) return digits.slice(0, 2) + '/' + digits.slice(2);
    return digits;
  };

  const proceedToPayment = async () => {
    if (!currentUser) return;
    setLoading(true);
    setPaymentError('');
    try {
      const res = await fetch(`${API}/api/payments/create-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token}`,
        },
        body: JSON.stringify({
          amount: finalAmount,
          currency: finalCurrency,
          type: 'deposit',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء جلسة الدفع');
      setClientSecret(data.clientSecret);
      setStep('payment');
    } catch (err: any) {
      showAlert(err.message || 'حدث خطأ أثناء الاتصال بخادم الدفع', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!currentUser) return;
    setLoading(true);
    setPaymentError('');

    try {
      // If Stripe is loaded, use real Stripe.js
      if (stripeLoaded && STRIPE_PK && clientSecret) {
        const stripe = (window as any).Stripe(STRIPE_PK);
        const [month, year] = cardExpiry.split('/');
        const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: {
              number: cardNumber.replace(/\s/g, ''),
              exp_month: parseInt(month),
              exp_year: parseInt('20' + year),
              cvc: cardCvc,
            },
            billing_details: { name: cardName },
          },
        });
        if (error) throw new Error(error.message);
        if (paymentIntent?.status === 'succeeded') {
          setTxId(paymentIntent.id);
          // Confirm with backend
          await fetch(`${API}/api/payments/confirm-deposit`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${currentUser.token}`,
            },
            body: JSON.stringify({ paymentIntentId: paymentIntent.id, amount: finalAmount, currency: finalCurrency }),
          });
          setStep('success');
        }
      } else {
        // Demo mode (no Stripe key configured) — simulate success
        await new Promise(r => setTimeout(r, 2000));
        const demoId = 'demo_' + Date.now();
        setTxId(demoId);
        // Notify backend of demo deposit
        await fetch(`${API}/api/payments/confirm-deposit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${currentUser.token}`,
          },
          body: JSON.stringify({ paymentIntentId: demoId, amount: finalAmount, currency: finalCurrency, demo: true }),
        });
        setStep('success');
      }
    } catch (err: any) {
      setPaymentError(err.message || 'فشل الدفع. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-orange-950/20 py-8 px-4">
      {/* Header */}
      <div className="max-w-2xl mx-auto mb-8">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-400 hover:text-white flex items-center gap-2 mb-6 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span className="text-sm">رجوع</span>
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">دفع العربون</h1>
            <p className="text-sm text-gray-400">Earnest Money Deposit</p>
          </div>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 mt-6">
          {(['amount', 'payment', 'success'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex items-center gap-2 ${step === s ? 'text-orange-400' : step === 'success' || (step === 'payment' && i === 0) ? 'text-green-400' : 'text-gray-600'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  step === s ? 'border-orange-400 bg-orange-400/10 text-orange-400' :
                  (step === 'payment' && i === 0) || step === 'success' ? 'border-green-500 bg-green-500/10 text-green-400' :
                  'border-gray-700 text-gray-600'
                }`}>
                  {((step === 'payment' && i === 0) || step === 'success') ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className="text-xs hidden sm:block">
                  {s === 'amount' ? 'المبلغ' : s === 'payment' ? 'الدفع' : 'تأكيد'}
                </span>
              </div>
              {i < 2 && <div className={`flex-1 h-px ${i === 0 && step !== 'amount' ? 'bg-green-500/50' : 'bg-gray-700'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">

        {/* ── STEP 1: Choose Amount ── */}
        {step === 'amount' && (
          <div className="space-y-6">
            {/* Why deposit box */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-orange-300 font-semibold mb-1">لماذا العربون؟</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    العربون يُثبت جدِّيتك كمشتري ويمنحك صلاحية المزايدة في جميع المزادات.
                    يُحفظ المبلغ في محفظتك ويُطبَّق على أول صفقة ناجحة. في حال عدم الفوز بأي مزاد، يُعاد المبلغ بالكامل.
                  </p>
                </div>
              </div>
            </div>

            {/* Location detection */}
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                {isLibya ? (
                  <><MapPin className="w-4 h-4 text-green-400" /><span className="text-sm text-gray-300">دفع داخل ليبيا — <strong className="text-white">بالدينار الليبي (LYD)</strong></span></>
                ) : (
                  <><Globe className="w-4 h-4 text-blue-400" /><span className="text-sm text-gray-300">دفع من خارج ليبيا — <strong className="text-white">بالدولار الأمريكي (USD)</strong></span></>
                )}
              </div>
              <p className="text-xs text-gray-500">
                {isLibya
                  ? `الحد الأدنى للعربون: 1,000 د.ل`
                  : `Minimum deposit: $500 USD`}
              </p>
            </div>

            {/* Amount grid */}
            <div>
              <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
                {finalCurrency === 'LYD' ? <Banknote className="w-4 h-4 text-orange-400" /> : <DollarSign className="w-4 h-4 text-orange-400" />}
                اختر مبلغ العربون
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {amounts.map(amt => (
                  <button
                    key={amt}
                    onClick={() => { setSelectedAmount(amt); setUseCustom(false); }}
                    className={`py-4 rounded-xl border-2 font-bold text-lg transition-all ${
                      !useCustom && selectedAmount === amt
                        ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                        : 'border-gray-700 bg-gray-800/40 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {finalCurrency === 'LYD' ? `${amt.toLocaleString()}` : `$${amt.toLocaleString()}`}
                    <span className="block text-xs font-normal text-gray-500 mt-0.5">{symbolEn}</span>
                  </button>
                ))}
              </div>

              {/* Custom amount */}
              <div
                className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                  useCustom ? 'border-orange-500 bg-orange-500/10' : 'border-gray-700 bg-gray-800/40 hover:border-gray-500'
                }`}
                onClick={() => setUseCustom(true)}
              >
                <div className="flex items-center gap-3">
                  <BadgeDollarSign className="w-5 h-5 text-orange-400 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-300 mb-2">مبلغ مخصص</p>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-bold">{symbol}</span>
                      <input
                        type="number"
                        min={minAmount}
                        value={customAmount}
                        onChange={e => { setCustomAmount(e.target.value); setUseCustom(true); }}
                        placeholder={`الحد الأدنى ${minAmount.toLocaleString()}`}
                        className="bg-transparent text-white font-bold text-lg w-full outline-none placeholder-gray-600"
                        onClick={e => e.stopPropagation()}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-400">مبلغ العربون</span>
                <span className="text-white font-bold text-xl">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-gray-400">رسوم المعالجة</span>
                <span className="text-green-400 text-sm font-medium">مجاناً</span>
              </div>
              <div className="border-t border-gray-700 pt-3 flex justify-between items-center">
                <span className="text-gray-300 font-semibold">الإجمالي</span>
                <span className="text-orange-400 font-bold text-xl">{formatCurrency(finalAmount)}</span>
              </div>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Shield, title: 'مؤمَّن', desc: 'دفع آمن 100%' },
                { icon: CheckCircle, title: 'قابل للاسترداد', desc: 'إذا لم تفز بأي مزاد' },
                { icon: Star, title: 'مزايدة حرة', desc: 'في جميع المزادات' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-gray-800/40 border border-gray-700/30 rounded-xl p-3 text-center">
                  <Icon className="w-5 h-5 text-orange-400 mx-auto mb-1.5" />
                  <p className="text-xs font-semibold text-white">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>

            <button
              onClick={proceedToPayment}
              disabled={loading || (useCustom && (!customAmount || parseInt(customAmount) < minAmount))}
              className="w-full py-4 bg-gradient-to-l from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />جاري التحضير...</>
              ) : (
                <>متابعة للدفع<ChevronRight className="w-5 h-5" /></>
              )}
            </button>
          </div>
        )}

        {/* ── STEP 2: Payment ── */}
        {step === 'payment' && (
          <div className="space-y-6">
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-5">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">المبلغ المطلوب دفعه</span>
                <span className="text-orange-400 font-bold text-2xl">{formatCurrency(finalAmount)}</span>
              </div>
            </div>

            {!STRIPE_PK && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex gap-3">
                <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-300">
                  <strong>وضع التجربة:</strong> مفتاح Stripe غير مُفعَّل حالياً. يمكنك إدخال أي بيانات بطاقة وسيتم محاكاة الدفع بنجاح.
                  لتفعيل الدفع الحقيقي، أضف <code className="bg-gray-900 px-1 rounded">VITE_STRIPE_PUBLISHABLE_KEY</code> في إعدادات Render.
                </p>
              </div>
            )}

            {/* Card form */}
            <div className="bg-gray-800/60 border border-gray-700/50 rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-orange-400" />
                <h3 className="text-white font-semibold">بيانات البطاقة</h3>
                <Lock className="w-3.5 h-3.5 text-green-400 mr-auto" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">اسم حامل البطاقة</label>
                <input
                  type="text"
                  value={cardName}
                  onChange={e => setCardName(e.target.value)}
                  placeholder="الاسم كما يظهر على البطاقة"
                  className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1.5">رقم البطاقة</label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={e => setCardNumber(formatCardNumber(e.target.value))}
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors font-mono tracking-widest"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">تاريخ الانتهاء</label>
                  <input
                    type="text"
                    value={cardExpiry}
                    onChange={e => setCardExpiry(formatExpiry(e.target.value))}
                    placeholder="MM/YY"
                    maxLength={5}
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">رمز الأمان (CVV)</label>
                  <input
                    type="text"
                    value={cardCvc}
                    onChange={e => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="123"
                    maxLength={4}
                    className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors font-mono"
                    dir="ltr"
                  />
                </div>
              </div>

              {paymentError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="text-sm">{paymentError}</span>
                </div>
              )}
            </div>

            {/* Logos */}
            <div className="flex items-center justify-center gap-4 opacity-60">
              <img src="https://upload.wikimedia.org/wikipedia/commons/0/04/Visa.svg" alt="Visa" className="h-6 object-contain" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-6 object-contain" />
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Lock className="w-3 h-3" />
                <span>SSL Encrypted</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('amount')}
                disabled={loading}
                className="flex-1 py-4 border border-gray-600 text-gray-300 hover:border-gray-400 font-semibold rounded-xl transition-all"
              >
                رجوع
              </button>
              <button
                onClick={handlePayment}
                disabled={loading || !cardName || !cardNumber || !cardExpiry || !cardCvc}
                className="flex-[2] py-4 bg-gradient-to-l from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" />جاري الدفع...</>
                ) : (
                  <><Lock className="w-4 h-4" />دفع {formatCurrency(finalAmount)}</>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Success ── */}
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-green-500/20 border-2 border-green-500/50 flex items-center justify-center mx-auto animate-pulse">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>

            <div>
              <h2 className="text-3xl font-bold text-white mb-2">تم الدفع بنجاح! 🎉</h2>
              <p className="text-gray-400">تمت إضافة العربون إلى محفظتك</p>
            </div>

            <div className="bg-gray-800/60 border border-green-500/30 rounded-2xl p-6 text-right space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">المبلغ المودَع</span>
                <span className="text-green-400 font-bold text-xl">{formatCurrency(finalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">رقم المعاملة</span>
                <span className="text-gray-300 font-mono text-sm">{txId.slice(0, 20)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الحالة</span>
                <span className="text-green-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> مكتمل</span>
              </div>
            </div>

            <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5 text-right">
              <h3 className="text-orange-300 font-semibold mb-2">ما الخطوة التالية؟</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                محفظتك مُفعَّلة الآن. يمكنك البدء في المزايدة على أي سيارة في المزاد.
                عند الفوز بمزاد، سيُخصَم العربون من قيمة السيارة تلقائياً.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate('/marketplace')}
                className="flex-1 py-4 border border-gray-600 text-gray-300 hover:border-orange-500 hover:text-orange-400 font-semibold rounded-xl transition-all"
              >
                تصفح المزادات
              </button>
              <button
                onClick={() => navigate('/dashboard/user')}
                className="flex-1 py-4 bg-gradient-to-l from-orange-500 to-orange-600 text-white font-bold rounded-xl transition-all"
              >
                لوحة التحكم
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
