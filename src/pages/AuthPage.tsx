import React, { useState, useEffect } from 'react';
import {
    Mail, Lock, ArrowRight, Car, Shield, Globe, TrendingUp,
    User, Phone, Building2, FileText, CheckCircle2, ChevronRight,
    Eye, EyeOff, Store, Gavel, X, Sparkles, KeyRound
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useStore } from '../context/StoreContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (el: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

/* ─── account type ─── */
type AccountType = 'buyer' | 'seller';

/* ─── stepper for seller onboarding ─── */
const SELLER_STEPS = ['نوع الحساب', 'بيانات الشركة', 'تأكيد التسجيل'];

export const AuthPage = () => {
    const navigate = useNavigate();
    const { currentUser, setCurrentUser, branchConfig, showAlert } = useStore();

    /* ── mode ── */
    const [isLogin, setIsLogin] = useState(true);
    const [accountType, setAccountType] = useState<AccountType>('buyer');
    const [step, setStep] = useState(0);   // seller onboarding step
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    /* ── forgot password flow ── */
    const [forgotOpen, setForgotOpen] = useState(false);
    const [forgotStep, setForgotStep] = useState<'email' | 'token' | 'done'>('email');
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotToken, setForgotToken] = useState('');
    const [forgotNewPass, setForgotNewPass] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotMsg, setForgotMsg] = useState('');
    const [forgotError, setForgotError] = useState('');

    /* ── form data ── */
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showConfirmPass, setShowConfirmPass] = useState(false);

    const [form, setForm] = useState({
        email: '', password: '', firstName: '', lastName: '', phone: '',
        // seller extras
        companyName: '', commercialRegister: '', address1: '', country: 'ليبيا',
        agreeTerms: false,
    });

    React.useEffect(() => {
        if (currentUser) {
            if (currentUser.role === 'admin') navigate('/dashboard/admin');
            else if (currentUser.role === 'seller') navigate('/dashboard/seller');
            else navigate('/marketplace');
        }
    }, [currentUser, navigate]);

    // Load Google Identity Services
    const googleBtnRef = React.useRef<HTMLDivElement>(null);
    useEffect(() => {
      const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!GOOGLE_CLIENT_ID) return; // not configured
      const scriptId = 'google-gsi-script';
      if (!document.getElementById(scriptId)) {
        const s = document.createElement('script');
        s.id = scriptId;
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.defer = true;
        s.onload = () => initGoogle(GOOGLE_CLIENT_ID);
        document.head.appendChild(s);
      } else if (window.google) {
        initGoogle(GOOGLE_CLIENT_ID);
      }
    }, []);

    const initGoogle = (clientId: string) => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
    };

    const handleGoogleCredential = async (response: { credential: string }) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (res.ok) {
          if (data.token) localStorage.setItem('authToken', data.token);
          setCurrentUser(data);
        } else {
          setError(data.error || 'فشل تسجيل الدخول بـ Google');
        }
      } catch {
        setError('فشل الاتصال بالخادم');
      } finally {
        setLoading(false);
      }
    };

    const handleGoogleClick = () => {
      const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!GOOGLE_CLIENT_ID) {
        setError('تسجيل الدخول بـ Google غير مفعّل حالياً — يرجى التسجيل بالبريد الإلكتروني.');
        return;
      }
      if (window.google) {
        window.google.accounts.id.prompt();
      }
    };

    const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

    /* ── submit ── */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isLogin && accountType === 'seller' && step < 2) {
            setStep(s => s + 1);
            return;
        }
        if (!isLogin && form.password !== confirmPassword) {
            setError('كلمة المرور وتأكيدها غير متطابقتين');
            return;
        }
        if (!isLogin && !form.agreeTerms) {
            setError('يجب الموافقة على الشروط والأحكام للمتابعة');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            const body = isLogin
                ? { email: form.email, password: form.password }
                : { ...form, role: accountType };
            const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            if (res.ok) {
                if (data.token) localStorage.setItem('authToken', data.token);
                setCurrentUser(data);
                if (data.role === 'admin') navigate('/dashboard/admin');
                else if (data.role === 'seller') navigate('/dashboard/seller');
                else navigate('/marketplace');
            } else {
                setError(data.error || 'حدث خطأ ما');
            }
        } catch {
            setError('فشل الاتصال بالخادم');
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => { setIsLogin(p => !p); setError(''); setStep(0); };

    /* ── forgot password handlers ── */
    const openForgotPassword = () => {
        setForgotOpen(true);
        setForgotStep('email');
        setForgotEmail(form.email || '');
        setForgotToken('');
        setForgotNewPass('');
        setForgotMsg('');
        setForgotError('');
    };

    const handleForgotSendCode = async () => {
        if (!forgotEmail) { setForgotError('أدخل بريدك الإلكتروني'); return; }
        setForgotLoading(true);
        setForgotError('');
        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail }),
            });
            const data = await res.json();
            if (res.ok) {
                setForgotMsg(data.message || 'تم إرسال رمز التحقق');
                setForgotStep('token');
            } else {
                setForgotError(data.error || 'حدث خطأ');
            }
        } catch { setForgotError('فشل الاتصال بالخادم'); }
        finally { setForgotLoading(false); }
    };

    const handleResetPassword = async () => {
        if (!forgotToken || !forgotNewPass) { setForgotError('أدخل الرمز وكلمة المرور الجديدة'); return; }
        if (forgotNewPass.length < 6) { setForgotError('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
        setForgotLoading(true);
        setForgotError('');
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: forgotEmail, token: forgotToken, newPassword: forgotNewPass }),
            });
            const data = await res.json();
            if (res.ok) {
                setForgotMsg(data.message || 'تم تغيير كلمة المرور بنجاح');
                setForgotStep('done');
            } else {
                setForgotError(data.error || 'حدث خطأ');
            }
        } catch { setForgotError('فشل الاتصال بالخادم'); }
        finally { setForgotLoading(false); }
    };

    const closeForgotPassword = () => {
        setForgotOpen(false);
        if (forgotStep === 'done') {
            setForm(p => ({ ...p, password: '' }));
        }
    };

    const inp = 'w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3.5 px-4 outline-none focus:border-orange-500 focus:bg-white transition-all text-slate-900 font-bold text-sm';

    /* ── RIGHT PANEL selling points ── */
    const sellingPoints = accountType === 'seller'
        ? [
            { icon: Store, title: 'معرضك الخاص', desc: 'أضف سياراتك وإدارتها من لوحة تحكم متكاملة' },
            { icon: Gavel, title: 'مزادات مباشرة', desc: 'أطرح سياراتك في مزادات حية أمام آلاف المشترين' },
            { icon: TrendingUp, title: 'تقارير فورية', desc: 'تتبع مبيعاتك وأرباحك بتقارير لحظية' },
        ]
        : [
            { icon: Globe, title: 'شحن عالمي', desc: 'استورد من أمريكا وأوروبا ووصّل لباب منزلك' },
            { icon: Shield, title: 'ضمان المزايدة', desc: 'نظام آمن ومدعوم بالتكنولوجيا لحماية صفقاتك' },
            { icon: TrendingUp, title: 'أفضل الأسعار', desc: 'آلاف السيارات في مزادات يومية بأسعار تنافسية' },
        ];

    /* ── current step form content ── */
    const renderFormStep = () => {
        if (isLogin) return (
            <div className="space-y-4">
                <div className="relative">
                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                    <input type="email" name="loginEmail" title="البريد الإلكتروني" placeholder="البريد الإلكتروني" required className={`${inp} pr-12`}
                        value={form.email} onChange={f('email')} />
                </div>
                <div className="relative">
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                    <input type={showPass ? 'text' : 'password'} name="loginPassword" title="كلمة المرور" placeholder="كلمة المرور" required className={`${inp} pr-12 pl-12`}
                        value={form.password} onChange={f('password')} />
                    <button type="button" aria-label="عرض كلمة المرور" title="عرض كلمة المرور" onClick={() => setShowPass(p => !p)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>
                <div className="flex justify-between items-center text-xs font-bold">
                    <label className="flex items-center gap-2 text-slate-500 cursor-pointer">
                        <input type="checkbox" title="تذكرني" className="rounded" /> تذكرني
                    </label>
                    <button type="button" onClick={openForgotPassword} className="text-slate-400 hover:text-orange-600 transition-colors">نسيت كلمة المرور؟</button>
                </div>
            </div>
        );

        /* register — step 0: account type */
        if (step === 0) return (
            <div className="space-y-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">اختر نوع حسابك</p>
                <div className="grid grid-cols-2 gap-3">
                    {([
                        { type: 'buyer' as AccountType, icon: User, label: 'مشتري', desc: 'أبحث عن سيارات' },
                        { type: 'seller' as AccountType, icon: Store, label: 'بائع / معرض', desc: 'أبيع سياراتي' },
                    ]).map(opt => (
                        <button key={opt.type} type="button" aria-label={opt.label} title={opt.label} onClick={() => setAccountType(opt.type)}
                            className={`p-4 rounded-2xl border-2 text-center transition-all ${accountType === opt.type ? 'border-orange-500 bg-orange-50' : 'border-slate-100 hover:border-slate-200'}`}>
                            <opt.icon className={`w-6 h-6 mx-auto mb-2 ${accountType === opt.type ? 'text-orange-500' : 'text-slate-400'}`} />
                            <div className={`font-black text-sm ${accountType === opt.type ? 'text-orange-600' : 'text-slate-700'}`}>{opt.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{opt.desc}</div>
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="firstName" className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">الاسم الأول</label>
                        <input id="firstName" name="firstName" title="الاسم الأول" type="text" placeholder="الاسم الأول" required className={inp} value={form.firstName} onChange={f('firstName')} />
                    </div>
                    <div>
                        <label htmlFor="lastName" className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">اسم العائلة</label>
                        <input id="lastName" name="lastName" title="اسم العائلة" type="text" placeholder="اسم العائلة" required className={inp} value={form.lastName} onChange={f('lastName')} />
                    </div>
                </div>
                <div className="relative">
                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                    <input type="email" name="regEmail" title="البريد الإلكتروني" placeholder="البريد الإلكتروني" required className={`${inp} pr-12`} value={form.email} onChange={f('email')} />
                </div>
                <div className="relative">
                    <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                    <input type="tel" name="regPhone" title="رقم الهاتف" placeholder="رقم الهاتف" className={`${inp} pr-12`} value={form.phone} onChange={f('phone')} />
                </div>
                <div className="relative">
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                    <input type={showPass ? 'text' : 'password'} name="regPassword" title="كلمة المرور" placeholder="كلمة المرور" required className={`${inp} pr-12 pl-12`}
                        value={form.password} onChange={f('password')} />
                    <button type="button" aria-label="عرض كلمة المرور" title="عرض كلمة المرور" onClick={() => setShowPass(p => !p)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                </div>

                {/* تأكيد كلمة المرور */}
                <div className="relative">
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                    <input
                        type={showConfirmPass ? 'text' : 'password'}
                        name="regConfirmPassword"
                        title="تأكيد كلمة المرور"
                        placeholder="تأكيد كلمة المرور"
                        required
                        className={`${inp} pr-12 pl-12 ${confirmPassword && form.password !== confirmPassword ? 'border-red-400 focus:border-red-500' : confirmPassword && form.password === confirmPassword ? 'border-green-400' : ''}`}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                    />
                    <button type="button" aria-label="عرض تأكيد كلمة المرور" title="عرض تأكيد كلمة المرور" onClick={() => setShowConfirmPass(p => !p)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                        {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {confirmPassword && form.password !== confirmPassword && (
                        <p className="text-red-500 text-xs font-bold mt-1 pr-1">كلمة المرور غير متطابقة</p>
                    )}
                    {confirmPassword && form.password === confirmPassword && (
                        <p className="text-green-500 text-xs font-bold mt-1 pr-1">✓ كلمة المرور متطابقة</p>
                    )}
                </div>

                {accountType === 'buyer' && (
                    <label className="flex items-start gap-3 cursor-pointer group pt-2">
                        <input type="checkbox" title="الموافقة على الشروط" required checked={form.agreeTerms}
                            onChange={e => setForm(p => ({ ...p, agreeTerms: e.target.checked }))}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 shrink-0" />
                        <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700 leading-relaxed">
                            أوافق على{' '}
                            <Link to="/terms" className="text-orange-600 hover:underline">الشروط والأحكام</Link>
                            {' '}و{' '}
                            <Link to="/privacy" className="text-orange-600 hover:underline">سياسة الخصوصية</Link>
                        </span>
                    </label>
                )}
            </div>
        );

        /* register — step 1 (seller): company info */
        if (step === 1) return (
            <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-start gap-3">
                    <Store className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                    <p className="text-sm font-bold text-orange-700">بيانات نشاطك التجاري — ستُراجَع من قبل الإدارة قبل تفعيل حسابك</p>
                </div>
                <div>
                    <label htmlFor="companyName" className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">اسم الشركة / المعرض</label>
                    <div className="relative">
                        <Building2 className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                        <input id="companyName" name="companyName" title="اسم الشركة" placeholder="اسم الشركة" type="text" required className={`${inp} pr-12`}
                            value={form.companyName} onChange={f('companyName')} />
                    </div>
                </div>
                <div>
                    <label htmlFor="commercialRegister" className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">رقم السجل التجاري</label>
                    <div className="relative">
                        <FileText className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                        <input id="commercialRegister" name="commercialRegister" title="رقم السجل التجاري" placeholder="رقم السجل التجاري" type="text" className={`${inp} pr-12`}
                            value={form.commercialRegister} onChange={f('commercialRegister')} />
                    </div>
                </div>
                <div>
                    <label htmlFor="address1" className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">العنوان</label>
                    <input id="address1" name="address1" title="العنوان" placeholder="العنوان" type="text" required className={inp}
                        value={form.address1} onChange={f('address1')} />
                </div>
                <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">الدولة</label>
                    <select aria-label="تحديد" title="تحديد" className={inp} value={form.country} onChange={f('country')}>
                        {['ليبيا', 'مصر', 'تونس', 'الإمارات', 'السعودية', 'الكويت', 'قطر', 'الأردن'].map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
            </div>
        );

        /* register — step 2: review & confirm */
        return (
            <div className="space-y-4">
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200 space-y-3 text-sm">
                    {[
                        { label: 'الاسم', value: `${form.firstName} ${form.lastName}` },
                        { label: 'البريد', value: form.email },
                        { label: 'الهاتف', value: form.phone || '—' },
                        ...(accountType === 'seller' ? [
                            { label: 'الشركة', value: form.companyName },
                            { label: 'العنوان', value: `${form.address1}، ${form.country}` },
                        ] : []),
                    ].map(row => (
                        <div key={row.label} className="flex justify-between items-center border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                            <span className="text-slate-400 font-bold">{row.label}</span>
                            <span className="font-black text-slate-800">{row.value}</span>
                        </div>
                    ))}
                </div>
                {accountType === 'seller' && (
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs font-bold text-blue-700">
                        ⏳ سيتم مراجعة بياناتك من قبل الإدارة. قد تستغرق العملية حتى 24 ساعة.
                    </div>
                )}
                <label className="flex items-start gap-3 cursor-pointer group">
                    <input type="checkbox" title="الموافقة على الشروط" required checked={form.agreeTerms}
                        onChange={e => setForm(p => ({ ...p, agreeTerms: e.target.checked }))}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 shrink-0" />
                    <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700 leading-relaxed">
                        أوافق على{' '}
                        <Link to="/terms" className="text-orange-600 hover:underline">الشروط والأحكام</Link>
                        {' '}و{' '}
                        <Link to="/privacy" className="text-orange-600 hover:underline">سياسة الخصوصية</Link>
                    </span>
                </label>
            </div>
        );
    };

    const isLastStep = isLogin || (accountType === 'buyer' && step === 0) || (accountType === 'seller' && step === 2);
    const btnLabel = loading ? 'جاري المعالجة...'
        : isLogin ? 'تسجيل الدخول'
            : isLastStep ? (accountType === 'seller' ? 'إرسال طلب التسجيل' : 'إنشاء حساب')
                : 'التالي';

    return (
        <div className="min-h-screen flex bg-white font-cairo" dir="rtl">

            {/* ── Forgot Password Modal ── */}
            {forgotOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 relative">
                        <button onClick={closeForgotPassword} title="إغلاق" aria-label="إغلاق"
                            className="absolute top-4 left-4 text-slate-300 hover:text-slate-600 transition-colors">
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center">
                                <KeyRound className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h2 className="font-black text-lg text-slate-900">
                                    {forgotStep === 'email' ? 'نسيت كلمة المرور' : forgotStep === 'token' ? 'أدخل رمز التحقق' : 'تم بنجاح'}
                                </h2>
                                <p className="text-xs text-slate-400 font-bold">
                                    {forgotStep === 'email' ? 'سنرسل رمز تحقق إلى بريدك' : forgotStep === 'token' ? 'أدخل الرمز وكلمة المرور الجديدة' : 'يمكنك تسجيل الدخول الآن'}
                                </p>
                            </div>
                        </div>

                        {forgotError && (
                            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-2xl mb-4 text-sm font-bold flex items-center gap-2">
                                <Shield className="w-4 h-4 shrink-0" /> {forgotError}
                            </div>
                        )}
                        {forgotMsg && !forgotError && (
                            <div className="bg-green-50 border border-green-100 text-green-700 p-3 rounded-2xl mb-4 text-sm font-bold flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 shrink-0" /> {forgotMsg}
                            </div>
                        )}

                        {forgotStep === 'email' && (
                            <div className="space-y-4">
                                <div className="relative">
                                    <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                                    <input type="email" placeholder="البريد الإلكتروني" required
                                        className={`${inp} pr-12`}
                                        value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleForgotSendCode()} />
                                </div>
                                <button type="button" onClick={handleForgotSendCode} disabled={forgotLoading}
                                    className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all disabled:opacity-60">
                                    {forgotLoading ? 'جاري الإرسال...' : 'إرسال رمز التحقق'}
                                </button>
                            </div>
                        )}

                        {forgotStep === 'token' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">رمز التحقق (6 أرقام)</label>
                                    <input type="text" placeholder="000000" maxLength={6}
                                        className={`${inp} text-center text-2xl tracking-[0.5em] font-black`}
                                        value={forgotToken} onChange={e => setForgotToken(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase block mb-1.5">كلمة المرور الجديدة</label>
                                    <div className="relative">
                                        <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 w-5 h-5 pointer-events-none" />
                                        <input type="password" placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                                            className={`${inp} pr-12`}
                                            value={forgotNewPass} onChange={e => setForgotNewPass(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && handleResetPassword()} />
                                    </div>
                                </div>
                                <button type="button" onClick={handleResetPassword} disabled={forgotLoading}
                                    className="w-full bg-orange-500 text-white py-3.5 rounded-2xl font-black text-sm hover:bg-orange-600 transition-all disabled:opacity-60">
                                    {forgotLoading ? 'جاري التحقق...' : 'تغيير كلمة المرور'}
                                </button>
                                <button type="button" onClick={handleForgotSendCode} disabled={forgotLoading}
                                    className="w-full text-slate-400 text-xs font-bold hover:text-orange-600 transition-colors">
                                    لم يصلك الرمز؟ أعد الإرسال
                                </button>
                            </div>
                        )}

                        {forgotStep === 'done' && (
                            <button type="button" onClick={closeForgotPassword}
                                className="w-full bg-slate-900 text-white py-3.5 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all">
                                العودة لتسجيل الدخول
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Left: Form Panel ── */}
            <div className="w-full lg:w-[45%] flex flex-col p-8 lg:p-14 overflow-y-auto">

                {/* Top bar */}
                <div className="flex justify-between items-center mb-10">
                    <Link to="/" className="flex items-center gap-3 group">
                        <div className="w-11 h-11 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform">
                            <Car className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-black text-xl text-slate-900">
                            {branchConfig?.name || 'ليبيا أوتو برو'}
                        </span>
                    </Link>
                    <div className="text-sm font-bold text-slate-400">
                        {isLogin ? 'جديد هنا؟' : 'لديك حساب؟'}
                        <button type="button" onClick={switchMode} title={isLogin ? 'سجّل الآن' : 'دخول'} aria-label={isLogin ? 'سجّل الآن' : 'دخول'} className="text-orange-600 mr-2 underline hover:text-orange-700 transition-colors">
                            {isLogin ? 'سجّل الآن' : 'دخول'}
                        </button>
                    </div>
                </div>

                {/* Stepper (seller only during register) */}
                {!isLogin && accountType === 'seller' && (
                    <div className="flex items-center gap-2 mb-8">
                        {SELLER_STEPS.map((s, i) => (
                            <React.Fragment key={i}>
                                <div className={`flex items-center gap-2 text-xs font-black ${i <= step ? 'text-orange-600' : 'text-slate-300'}`}>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${i < step ? 'bg-orange-500 text-white' : i === step ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        {i < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                                    </div>
                                    <span className="hidden sm:block">{s}</span>
                                </div>
                                {i < SELLER_STEPS.length - 1 && (
                                    <div className={`flex-1 h-px transition-all ${i < step ? 'bg-orange-400' : 'bg-slate-100'}`} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* Heading */}
                <div className="mb-7">
                    <h1 className="text-3xl font-black text-slate-900 leading-tight mb-1.5">
                        {isLogin ? 'مرحباً بعودتك 👋'
                            : step === 0 ? 'انضم إلينا ✨'
                                : step === 1 ? 'بيانات نشاطك 🏪'
                                    : 'مراجعة وتأكيد ✅'}
                    </h1>
                    <p className="text-slate-500 text-sm font-bold">
                        {isLogin
                            ? 'سجل دخولك وابدأ المزايدة الآن'
                            : step === 0 ? 'اختر نوع حسابك وأدخل بياناتك الأساسية'
                                : step === 1 ? 'أخبرنا عن نشاطك التجاري لتفعيل حسابك كبائع'
                                    : 'راجع بياناتك قبل إرسال الطلب'}
                    </p>
                </div>

                {/* Error */}
                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-600 p-3.5 rounded-2xl mb-5 text-sm font-bold flex items-center gap-3">
                        <Shield className="w-4 h-4 shrink-0" /> {error}
                        <button aria-label="إغلاق" title="إغلاق" onClick={() => setError('')} className="mr-auto"><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    {renderFormStep()}

                    <div className="flex gap-3 pt-1">
                        {!isLogin && step > 0 && (
                            <button type="button" title="رجوع" aria-label="رجوع" onClick={() => setStep(s => s - 1)}
                                className="px-5 py-3.5 border-2 border-slate-100 rounded-2xl font-black text-slate-500 hover:bg-slate-50 transition-all text-sm">
                                رجوع
                            </button>
                        )}
                        <button type="submit" disabled={loading} title={btnLabel} aria-label={btnLabel}
                            className="flex-1 bg-slate-900 text-white py-3.5 rounded-2xl font-black text-base shadow-xl shadow-slate-200 hover:bg-slate-800 hover:-translate-y-0.5 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-60">
                            <Sparkles className="w-5 h-5" />
                            {btnLabel}
                            {!loading && isLastStep && <ChevronRight className="w-4 h-4 rotate-180" />}
                        </button>
                    </div>
                </form>

                {/* Divider + social */}
                <>
                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100" /></div>
                        <div className="relative flex justify-center text-[10px] uppercase font-black text-slate-300"><span className="bg-white px-4">أو عبر</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            title="استمر مع Google"
                            aria-label="استمر مع Google"
                            onClick={handleGoogleClick}
                            disabled={loading}
                            className="flex items-center justify-center gap-2 py-3.5 border-2 border-slate-100 rounded-2xl hover:bg-red-50 hover:border-red-200 transition-all text-sm font-black text-slate-600 disabled:opacity-50"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Google
                        </button>
                        <button
                            type="button"
                            title="استمر مع Facebook"
                            aria-label="استمر مع Facebook"
                            onClick={() => setError('تسجيل الدخول بـ Facebook قريباً — استخدم Google أو البريد الإلكتروني حالياً.')}
                            className="flex items-center justify-center gap-2 py-3.5 border-2 border-slate-100 rounded-2xl hover:bg-blue-50 hover:border-blue-200 transition-all text-sm font-black text-slate-600"
                        >
                            <svg className="w-5 h-5" fill="#1877F2" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                            Facebook
                        </button>
                    </div>
                </>

                <p className="mt-auto pt-10 text-center text-[10px] text-slate-300 font-black uppercase tracking-widest">
                    © {new Date().getFullYear()} AUTO PRO AUCTIONS •{' '}
                    <Link to="/terms" className="hover:text-orange-500">Terms</Link> •{' '}
                    <Link to="/privacy" className="hover:text-orange-500">Privacy</Link>
                </p>
            </div>

            {/* ── Right: Visual Panel ── */}
            <div className="hidden lg:flex lg:w-[55%] bg-slate-950 relative overflow-hidden items-center justify-center p-16">
                {/* ambient glow */}
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-orange-600/15 rounded-full blur-[120px] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[100px] translate-x-1/3 translate-y-1/3" />

                <div className="relative z-10 max-w-lg w-full">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-black px-4 py-2 rounded-full mb-8 uppercase tracking-widest">
                        <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                        {accountType === 'seller' ? 'منصة البائعين — تاجر سيارات' : 'منصة مزادات السيارات الأولى'}
                    </div>

                    <h2 className="text-4xl font-black text-white leading-tight mb-4">
                        {accountType === 'seller'
                            ? <>أطلق معرضك<br /><span className="text-orange-500">الرقمي</span> اليوم</>
                            : <>مزادات سيارات<br /><span className="text-orange-500">مباشرة</span> يومياً</>}
                    </h2>
                    <p className="text-slate-400 text-base leading-relaxed mb-10">
                        {accountType === 'seller'
                            ? 'انضم لمئات البائعين والمعارض الذين يديرون أعمالهم عبر منصتنا'
                            : 'استورد سيارتك من أمريكا وأوروبا بأفضل الأسعار وشحن مضمون'}
                    </p>

                    {/* Features */}
                    <div className="space-y-4 mb-10">
                        {sellingPoints.map((p, i) => (
                            <div key={i} className="flex items-start gap-4 bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/8 transition-colors">
                                <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
                                    <p.icon className="w-5 h-5 text-orange-400" />
                                </div>
                                <div>
                                    <div className="font-black text-white text-sm">{p.title}</div>
                                    <div className="text-slate-400 text-xs mt-0.5">{p.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Car image card */}
                    <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10">
                        <img src="https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=900"
                            alt="car" className="w-full h-44 object-cover opacity-70" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                        <div className="absolute bottom-4 right-4 left-4 flex justify-between items-end">
                            <div>
                                <div className="text-[10px] text-slate-400 font-black uppercase tracking-wider">أعلى مزايدة</div>
                                <div className="text-2xl font-black text-white">$14,500</div>
                            </div>
                            <div className="bg-red-500 text-white text-[10px] font-black px-3 py-1.5 rounded-xl flex items-center gap-1 animate-pulse">
                                <span className="w-1.5 h-1.5 bg-white rounded-full" /> مباشر
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
