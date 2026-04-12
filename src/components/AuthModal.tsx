import React, { useState } from 'react';
import { Mail, Lock, User, Phone, Shield, ArrowRight, ArrowLeft, X, Building2, CreditCard, MapPin, FileText, CheckCircle2, AlertCircle, Car } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useGoogleLogin } from '@react-oauth/google';
import FacebookLogin from 'react-facebook-login/dist/facebook-login-render-props';
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState(1); // 1: basic info, 2: KYC, 3: success
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'buyer',
    nationalId: '',
    companyName: '',
    commercialRegister: '',
    showroomLicense: '',
    iban: '',
    country: '',
    address1: '',
    address2: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setCurrentUser, showAlert, branchConfig } = useStore();

  if (!isOpen) return null;

  const handleGoogleSuccess = async (tokenResponse: any) => {
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });
      const userInfo = await userInfoRes.json();

      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          providerId: userInfo.sub,
          email: userInfo.email,
          firstName: userInfo.given_name || userInfo.name?.split(' ')[0] || 'مستخدم',
          lastName: userInfo.family_name || userInfo.name?.split(' ').slice(1).join(' ') || 'جوجل',
          avatar: userInfo.picture
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'pending_approval') {
          showAlert('حسابك الآن قيد المراجعة بواسطة الإدارة.', 'info');
        } else {
          showAlert('تم تسجيل الدخول بنجاح.', 'success');
        }
        setCurrentUser(data);
        onClose();
      } else {
        setError(data.error || 'فشل تسجيل الدخول بواسطة جوجل');
      }
    } catch (e) {
      setError('فشل الاتصال بالخادم');
    }
  };

  const loginWithGoogle = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setError('فشل تسجيل الدخول بواسطة جوجل'),
  });

  const handleFacebookResponse = async (response: any) => {
    if (!response.accessToken) return;
    try {
      const res = await fetch('/api/auth/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'facebook',
          providerId: response.id,
          email: response.email,
          firstName: response.first_name || response.name?.split(' ')[0] || 'مستخدم',
          lastName: response.last_name || response.name?.split(' ').slice(1).join(' ') || 'فيسبوك',
          avatar: response.picture?.data?.url
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'pending_approval') {
          showAlert('حسابك الآن قيد المراجعة بواسطة الإدارة.', 'info');
        } else {
          showAlert('تم تسجيل الدخول بنجاح.', 'success');
        }
        setCurrentUser(data);
        onClose();
      } else {
        setError(data.error || 'فشل تسجيل الدخول بواسطة فيسبوك');
      }
    } catch (e) {
      setError('فشل الاتصال بالخادم');
    }
  };

  const renderOAuthButtons = () => (
    <div className="space-y-3 mb-6">
      <button
        type="button"
        onClick={() => loginWithGoogle()}
        className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 py-3 rounded-2xl font-bold shadow-sm transition-all flex items-center justify-center gap-3"
      >
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
        المتابعة باستخدام جوجل
      </button>

      <FacebookLogin
        appId={(import.meta as any).env?.VITE_FACEBOOK_APP_ID || "1694689404604812"} // Fallback or empty if not provided
        autoLoad={false}
        fields="name,email,picture,first_name,last_name"
        callback={handleFacebookResponse}
        render={(renderProps: any) => (
          <button
            type="button"
            onClick={renderProps.onClick}
            className="w-full bg-[#1877F2] hover:bg-[#166FE5] text-white py-3 rounded-2xl font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
            المتابعة باستخدام فيسبوك
          </button>
        )}
      />

      <div className="flex items-center gap-3 pt-3">
        <div className="flex-1 h-px bg-slate-100"></div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">أو بالبريد الإلكتروني</span>
        <div className="flex-1 h-px bg-slate-100"></div>
      </div>
    </div>
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, password: formData.password })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.status === 'pending_approval') {
          showAlert('حسابك قيد المراجعة من قبل الإدارة. سيتم إشعارك فور الموافقة.', 'info');
        }
        setCurrentUser(data);
        onClose();
      } else {
        setError(data.error || 'بيانات الدخول غير صحيحة');
      }
    } catch (e) {
      setError('فشل الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (formData.password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleRegisterStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentUser(data);
        setStep(3); // Show success screen
      } else {
        setError(data.error || 'حدث خطأ أثناء التسجيل');
      }
    } catch (e) {
      setError('فشل الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setError('');
    setFormData({
      firstName: '', lastName: '', email: '', phone: '', password: '', confirmPassword: '',
      role: 'buyer', nationalId: '', companyName: '', commercialRegister: '',
      showroomLicense: '', iban: '', country: '', address1: '', address2: ''
    });
  };

  const inputClass = "w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 pr-11 pl-4 outline-none focus:border-orange-500 focus:bg-white transition-all text-sm text-slate-900 font-medium";
  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1 mb-1 block";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
        <button title="إغلاق" aria-label="إغلاق النافذة"
          onClick={() => { onClose(); resetForm(); }}
          className="absolute top-5 left-5 p-2 text-slate-400 hover:text-slate-600 transition-colors z-10 bg-white/80 backdrop-blur rounded-full"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ===== SUCCESS SCREEN (Step 3) ===== */}
        {step === 3 && !isLogin && (
          <div className="p-10 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in duration-500">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-3">تم التسجيل بنجاح! 🎉</h2>
            <p className="text-slate-500 font-medium mb-8 leading-relaxed">
              حسابك الآن <span className="text-orange-600 font-black">قيد المراجعة</span> من قبل فريق الإدارة.
              <br />سيتم إشعارك فور الموافقة على حسابك.
            </p>

            <div className="bg-slate-50 rounded-2xl p-6 mb-6 text-right space-y-4 border border-slate-100">
              <h3 className="font-black text-slate-900 flex items-center gap-2 justify-end">
                📋 الخطوات القادمة
              </h3>
              <div className="space-y-3">
                {[
                  { num: '1', text: 'انتظر موافقة المدير على حسابك', icon: '⏳' },
                  { num: '2', text: 'بعد التفعيل، قم بإيداع العربون', icon: '💰' },
                  { num: '3', text: 'القوة الشرائية = العربون × 10', icon: '📊' },
                  { num: '4', text: 'ابدأ المزايدة على السيارات!', icon: '🔨' }
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-3 justify-end">
                    <span className="text-sm font-bold text-slate-600">{s.text}</span>
                    <span className="text-lg">{s.icon}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-orange-50 rounded-2xl p-4 mb-8 flex items-center gap-3 border border-orange-100 justify-end">
              <span className="text-xs font-bold text-orange-700 text-right">
                تم إرسال رسالة ترحيبية في صندوق الرسائل الداخلي. تفقّد الرسائل في لوحة التحكم!
              </span>
              <Mail className="w-5 h-5 text-orange-500 flex-shrink-0" />
            </div>

            <button
              onClick={() => { onClose(); resetForm(); }}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-black transition-all shadow-xl"
            >
              انتقل إلى لوحة التحكم ←
            </button>
          </div>
        )}

        {/* ===== LOGIN FORM ===== */}
        {isLogin && step !== 3 && (
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-orange-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-4 shadow-2xl shadow-orange-500/20">
                <Car className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2">تسجيل الدخول</h2>
              <p className="text-slate-500 font-medium">مرحباً بك مجدداً في عائلة {branchConfig?.name || 'ليبيا AUTO PRO'}</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm font-bold justify-end">
                <span>{error}</span>
                <AlertCircle className="w-4 h-4" />
              </div>
            )}

            {renderOAuthButtons()}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelClass}>البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="email" required className={inputClass} placeholder="email@example.com"
                    value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>

              <div>
                <label className={labelClass}>كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input aria-label="كلمة المرور" title="كلمة المرور" type="password" required className={inputClass} placeholder="أدخل كلمة المرور"
                    value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                </div>
              </div>

              <button aria-label="تسجيل الدخول" title="دخول" type="submit" disabled={loading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-2xl font-black shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2 mt-6">
                {loading ? 'جاري الدخول...' : 'دخول'}
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>

            <div className="mt-8 text-center">
              <button aria-label="التسجيل الآن" title="تسجيل حساب جديد" onClick={() => { setIsLogin(false); setStep(1); setError(''); }}
                className="text-sm font-bold text-slate-500 hover:text-orange-500 transition-colors">
                ليس لديك حساب؟ <span className="text-orange-500 underline">سجّل الآن</span>
              </button>
            </div>

            {/* Quick Demo Login — only in development */}
            {import.meta.env.DEV && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mb-3">دخول سريع (تجريبي - بيئة التطوير فقط)</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { setFormData({ ...formData, email: 'admin@autopro.com', password: 'admin123' }); }}
                  className="bg-red-50 text-red-600 border border-red-100 px-3 py-2.5 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors"
                >
                  مدير النظام
                </button>
                <button
                  onClick={() => { setFormData({ ...formData, email: 'user@autopro.com', password: 'user123' }); }}
                  className="bg-blue-50 text-blue-600 border border-blue-100 px-3 py-2.5 rounded-xl font-bold text-xs hover:bg-blue-100 transition-colors"
                >
                  مشتري
                </button>
                <button
                  onClick={() => { setFormData({ ...formData, email: 'seller@autopro.com', password: 'seller123' }); }}
                  className="bg-emerald-50 text-emerald-600 border border-emerald-100 px-3 py-2.5 rounded-xl font-bold text-xs hover:bg-emerald-100 transition-colors"
                >
                  تاجر
                </button>
              </div>
            </div>
            )}

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              <Shield className="w-3 h-3" /> تشفير آمن 256-bit SSL
            </div>
          </div>
        )}

        {/* ===== REGISTER STEP 1: Basic Info ===== */}
        {!isLogin && step === 1 && (
          <div className="p-8">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-black text-xs">1</div>
                <span className="text-xs font-black text-orange-500">البيانات الأساسية</span>
              </div>
              <div className="w-8 h-px bg-slate-200"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-slate-200 text-slate-400 rounded-full flex items-center justify-center font-black text-xs">2</div>
                <span className="text-xs font-bold text-slate-400">التحقق والهوية</span>
              </div>
            </div>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-slate-900 mb-1">إنشاء حساب جديد</h2>
              <p className="text-slate-500 text-sm font-medium">انضم لأكبر منصة مزادات سيارات</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm font-bold justify-end">
                <span>{error}</span>
                <AlertCircle className="w-4 h-4" />
              </div>
            )}

            {renderOAuthButtons()}

            <form onSubmit={handleRegisterStep1} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>الاسم الأول</label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input aria-label="الاسم الأول" title="الاسم الأول" type="text" required className={inputClass} placeholder="محمد"
                      value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>اسم العائلة</label>
                  <div className="relative">
                    <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input aria-label="اسم العائلة" title="اسم العائلة" type="text" required className={inputClass} placeholder="العربي"
                      value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>البريد الإلكتروني</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="email" required className={inputClass} placeholder="email@example.com"
                    value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
              </div>

              <div>
                <label className={labelClass}>رقم الهاتف</label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input aria-label="رقم الهاتف" title="رقم الهاتف" type="tel" required className={inputClass} placeholder="+966 5xx xxx xxxx"
                    value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
                </div>
                <p className="text-[10px] text-orange-600 font-bold mt-2 bg-orange-50 p-2 rounded-lg border border-orange-100 flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  يرجى كتابة الإيميل ورقم الهاتف (واتساب) بشكل صحيح لتصلك تنبيهات العروض والفواتير الهامة فوراً.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input aria-label="كلمة المرور" title="كلمة المرور" type="password" required className={inputClass} placeholder="6 أحرف على الأقل"
                      value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>تأكيد كلمة المرور</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input aria-label="تأكيد كلمة المرور" title="تأكيد كلمة المرور" type="password" required className={inputClass} placeholder="أعد الإدخال"
                      value={formData.confirmPassword} onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })} />
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>نوع الحساب</label>
                <select aria-label="نوع الحساب" title="نوع الحساب" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 px-4 outline-none focus:border-orange-500 transition-all text-sm text-slate-900 font-bold"
                  value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                  <option value="buyer">🛒 مشتري (Buyer)</option>
                  <option value="seller">🏪 بائع / معرض (Seller)</option>
                </select>
              </div>

              <button aria-label="التالي للتحقق" title="التالي" type="submit"
                className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-2xl font-black shadow-xl transition-all flex items-center justify-center gap-2 mt-2">
                التالي - التحقق والهوية
                <ArrowLeft className="w-5 h-5" />
              </button>
            </form>

            <div className="mt-6 text-center">
              <button aria-label="تسجيل الدخول" title="تسجيل الدخول" onClick={() => { setIsLogin(true); setStep(1); setError(''); }}
                className="text-sm font-bold text-slate-500 hover:text-orange-500 transition-colors">
                لديك حساب بالفعل؟ <span className="text-orange-500 underline">سجّل دخولك</span>
              </button>
            </div>
          </div>
        )}

        {/* ===== REGISTER STEP 2: KYC ===== */}
        {!isLogin && step === 2 && (
          <div className="p-8">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-green-600">البيانات الأساسية</span>
              </div>
              <div className="w-8 h-px bg-orange-400"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-black text-xs">2</div>
                <span className="text-xs font-black text-orange-500">التحقق والهوية</span>
              </div>
            </div>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-black text-slate-900 mb-1">بيانات التحقق (KYC)</h2>
              <p className="text-slate-500 text-sm font-medium">لضمان أمان المعاملات وحماية حقوقك</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-sm font-bold justify-end">
                <span>{error}</span>
                <AlertCircle className="w-4 h-4" />
              </div>
            )}

            <form onSubmit={handleRegisterStep2} className="space-y-4">
              <div>
                <label className={labelClass}>رقم الهوية الوطنية / الإقامة *</label>
                <div className="relative">
                  <CreditCard className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input aria-label="رقم الهوية الوطنية" title="رقم الهوية" type="text" required className={inputClass} placeholder="10XXXXXXXX"
                    value={formData.nationalId} onChange={e => setFormData({ ...formData, nationalId: e.target.value })} />
                </div>
              </div>

              <div>
                <label className={labelClass}>البلد *</label>
                <div className="relative">
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <select aria-label="البلد" title="البلد" className={inputClass + " pr-11"} required
                    value={formData.country} onChange={e => setFormData({ ...formData, country: e.target.value })}>
                    <option value="">اختر البلد</option>
                    <option value="SA">🇸🇦 المملكة العربية السعودية</option>
                    <option value="AE">🇦🇪 الإمارات العربية المتحدة</option>
                    <option value="KW">🇰🇼 الكويت</option>
                    <option value="QA">🇶🇦 قطر</option>
                    <option value="BH">🇧🇭 البحرين</option>
                    <option value="OM">🇴🇲 عمان</option>
                    <option value="EG">🇪🇬 مصر</option>
                    <option value="JO">🇯🇴 الأردن</option>
                    <option value="IQ">🇮🇶 العراق</option>
                    <option value="LB">🇱🇧 لبنان</option>
                    <option value="OTHER">🌍 دول أخرى</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>العنوان *</label>
                <div className="relative">
                  <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input aria-label="العنوان" title="العنوان" type="text" required className={inputClass} placeholder="المدينة - الحي - الشارع"
                    value={formData.address1} onChange={e => setFormData({ ...formData, address1: e.target.value })} />
                </div>
              </div>

              <div>
                <label className={labelClass}>رقم IBAN البنكي *</label>
                <div className="relative">
                  <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input aria-label="رقم ﺍﻻﻳﺒﺎﻥ" title="رقم الآيبان البنكي" type="text" required className={inputClass} placeholder="SA00 0000 0000 0000 0000 0000"
                    value={formData.iban} onChange={e => setFormData({ ...formData, iban: e.target.value.toUpperCase() })} />
                </div>
              </div>

              {/* Optional fields for sellers */}
              {formData.role === 'seller' && (
                <>
                  <div className="border-t border-slate-100 pt-4 mt-4">
                    <p className="text-xs font-black text-orange-500 uppercase tracking-widest mb-4">بيانات المعرض (للبائعين فقط)</p>
                  </div>
                  <div>
                    <label className={labelClass}>اسم الشركة / المعرض</label>
                    <div className="relative">
                      <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input aria-label="اسم الشركة أو المعرض" title="اسم الشركة" type="text" className={inputClass} placeholder="اسم المعرض أو الشركة"
                        value={formData.companyName} onChange={e => setFormData({ ...formData, companyName: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>السجل التجاري</label>
                      <div className="relative">
                        <FileText className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input aria-label="السجل التجاري" title="السجل التجاري" type="text" className={inputClass} placeholder="رقم السجل"
                          value={formData.commercialRegister} onChange={e => setFormData({ ...formData, commercialRegister: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>رخصة المعرض</label>
                      <div className="relative">
                        <FileText className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input aria-label="رخصة المعرض" title="رخصة المعرض" type="text" className={inputClass} placeholder="رقم الرخصة"
                          value={formData.showroomLicense} onChange={e => setFormData({ ...formData, showroomLicense: e.target.value })} />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 mt-4">
                <button aria-label="الرجوع للخطوة السابقة" title="رجوع" type="button" onClick={() => setStep(1)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3.5 rounded-2xl font-black transition-all flex items-center justify-center gap-2">
                  <ArrowRight className="w-5 h-5" />
                  رجوع
                </button>
                <button aria-label="إرسال طلب الانضمام" title="إرسال" type="submit" disabled={loading}
                  className="flex-[2] bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-2xl font-black shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center gap-2">
                  {loading ? 'جاري إرسال الطلب...' : 'إرسال طلب الانضمام'}
                  <CheckCircle2 className="w-5 h-5" />
                </button>
              </div>
            </form>

            <div className="mt-6 p-4 bg-blue-50 rounded-2xl flex items-start gap-3 border border-blue-100">
              <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 font-bold leading-relaxed text-right">
                بياناتك الشخصية محمية وفقاً لسياسة الخصوصية. لن يتم مشاركة أي معلومات مع أطراف ثالثة.
                سيتم مراجعة طلبك خلال 2-4 ساعات عمل.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
