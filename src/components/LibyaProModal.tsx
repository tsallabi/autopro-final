import React, { useState, useEffect } from 'react';
import { X, Code, Globe, Smartphone, Server, Zap, Award, CheckCircle2, Send, Sparkles, Building2, Phone, Mail, User, MessageSquare } from 'lucide-react';

interface LibyaProModalProps {
  open: boolean;
  onClose: () => void;
}

const SERVICES = [
  { icon: Globe, title: 'مواقع وتطبيقات ويب', desc: 'منصات تجارية، أنظمة إدارة، لوحات تحكم متقدمة' },
  { icon: Smartphone, title: 'تطبيقات الجوال', desc: 'iOS / Android / PWA — تجربة سلسة على كل الأجهزة' },
  { icon: Server, title: 'حلول السوفتوير', desc: 'برمجيات مخصصة، ERP، CRM، أتمتة العمليات' },
  { icon: Zap, title: 'استشارات تقنية', desc: 'تحليل، تصميم معماري، تكامل مع أنظمة قائمة' },
];

const PROJECT_TYPES = [
  'موقع تعريفي / Landing Page',
  'متجر إلكتروني / E-commerce',
  'منصة مزادات أو حجوزات',
  'تطبيق جوال (iOS / Android)',
  'نظام إدارة (ERP / CRM)',
  'لوحة تحكم وتقارير',
  'أتمتة عمليات داخلية',
  'استشارة تقنية فقط',
  'مشروع آخر',
];

const BUDGET_RANGES = [
  'أقل من 5,000 USD',
  '5,000 – 15,000 USD',
  '15,000 – 50,000 USD',
  'أكثر من 50,000 USD',
  'لم أحدد بعد',
];

export const LibyaProModal: React.FC<LibyaProModalProps> = ({ open, onClose }) => {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', company: '',
    projectType: '', budget: '', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setSuccess(false);
      setError('');
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.message.trim()) {
      setError('الرجاء تعبئة الاسم والهاتف والرسالة على الأقل');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/libyapro/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال');
      setSuccess(true);
      setForm({ name: '', phone: '', email: '', company: '', projectType: '', budget: '', message: '' });
    } catch (err: any) {
      setError(err.message || 'حدث خطأ. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-amber-500/20"
        onClick={(e) => e.stopPropagation()}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* Decorative glow */}
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-10 p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-white transition-all hover:rotate-90"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* HERO */}
        <div className="relative px-6 sm:px-10 pt-10 pb-8 text-center border-b border-slate-800/50">
          <div className="inline-flex items-center justify-center gap-3 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
              <Code className="w-9 h-9 text-white" />
            </div>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-2 leading-tight">
            ليبيا برو <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">للتقنية</span>
          </h2>
          <p className="text-amber-400/90 text-sm sm:text-base font-semibold mb-3">
            تصميم وبناء المواقع والمنصات والتطبيقات المميزة في ليبيا
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs sm:text-sm font-medium">
            <Award className="w-4 h-4" />
            <span>فرع من شركة <strong>Egypt Pro Ospra</strong> العريقة</span>
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="mt-5 text-slate-300 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            نحن نصنع المنصات التي تُحدث فرقاً — من التصميم الأنيق إلى الكود النظيف، ومن الأمان العالي إلى الأداء الفائق.
            خبرة مصرية عريقة، تنفيذ ليبي محترف.
          </p>
        </div>

        {/* SERVICES GRID */}
        <div className="px-6 sm:px-10 py-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SERVICES.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={i}
                className="group p-4 rounded-xl bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/50 hover:border-amber-500/40 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Icon className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-white font-bold text-sm mb-1">{s.title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>

        {/* TRUST INDICATORS */}
        <div className="px-6 sm:px-10 pb-6 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { n: '+50', l: 'مشروع منجز' },
            { n: '+15', l: 'سنة خبرة' },
            { n: '24/7', l: 'دعم فني' },
            { n: '100%', l: 'التزام بالجودة' },
          ].map((s, i) => (
            <div key={i} className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
              <div className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-500">{s.n}</div>
              <div className="text-slate-400 text-xs mt-1">{s.l}</div>
            </div>
          ))}
        </div>

        {/* CONTACT FORM */}
        <div className="relative px-6 sm:px-10 py-8 bg-gradient-to-b from-slate-900/50 to-slate-950/80 border-t border-slate-800/50">
          {success ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mb-4 animate-bounce">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2">تم استلام طلبك بنجاح! 🎉</h3>
              <p className="text-slate-300 mb-6">شكراً لتواصلك مع <strong className="text-amber-400">ليبيا برو للتقنية</strong>.<br/>سيقوم فريقنا بالرد عليك خلال 24 ساعة.</p>
              <button
                onClick={onClose}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold hover:shadow-lg hover:shadow-amber-500/30 transition-all"
              >
                إغلاق
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h3 className="text-2xl font-black text-white mb-2">احصل على عرض سعر مجاني</h3>
                <p className="text-slate-400 text-sm">املأ النموذج وسنتواصل معك خلال 24 ساعة</p>
              </div>

              <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field icon={User} label="الاسم الكامل *" type="text" value={form.name}
                  onChange={(v) => setForm(f => ({ ...f, name: v }))} placeholder="مثال: أحمد محمد" />
                <Field icon={Phone} label="رقم الهاتف *" type="tel" value={form.phone}
                  onChange={(v) => setForm(f => ({ ...f, phone: v }))} placeholder="+218 91 xxx xxxx" />
                <Field icon={Mail} label="البريد الإلكتروني" type="email" value={form.email}
                  onChange={(v) => setForm(f => ({ ...f, email: v }))} placeholder="you@example.com" />
                <Field icon={Building2} label="الشركة / الجهة" type="text" value={form.company}
                  onChange={(v) => setForm(f => ({ ...f, company: v }))} placeholder="اختياري" />

                <Select label="نوع المشروع" value={form.projectType}
                  onChange={(v) => setForm(f => ({ ...f, projectType: v }))} options={PROJECT_TYPES} />
                <Select label="الميزانية المتوقعة" value={form.budget}
                  onChange={(v) => setForm(f => ({ ...f, budget: v }))} options={BUDGET_RANGES} />

                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-amber-400" /> تفاصيل المشروع *
                  </label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
                    rows={4}
                    placeholder="اشرح فكرتك، أهدافك، أي ميزات محددة تحتاجها..."
                    className="w-full px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-slate-500 outline-none transition-all resize-none"
                  />
                </div>

                {error && (
                  <div className="sm:col-span-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm text-center">
                    {error}
                  </div>
                )}

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600 text-white font-black text-base hover:shadow-2xl hover:shadow-amber-500/40 hover:scale-[1.02] active:scale-100 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>⏳ جاري الإرسال...</>
                    ) : (
                      <><Send className="w-5 h-5" /> إرسال الطلب الآن</>
                    )}
                  </button>
                  <p className="text-center text-xs text-slate-500 mt-3">
                    🔒 معلوماتك سرية ولن تُشارك مع أي طرف ثالث
                  </p>
                </div>
              </form>
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-6 sm:px-10 py-5 bg-slate-950/80 border-t border-slate-800/50 text-center">
          <p className="text-slate-500 text-xs">
            <strong className="text-amber-400">Libya Pro Tech</strong> — A subsidiary of <strong className="text-amber-400">Egypt Pro Ospra</strong>
            <br />
            بناء المستقبل الرقمي العربي 🌍
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .animate-fadeIn { animation: fadeIn .25s ease }
      `}</style>
    </div>
  );
};

// ─────────── Helpers ───────────
const Field: React.FC<{
  icon: React.ComponentType<any>; label: string; type: string;
  value: string; onChange: (v: string) => void; placeholder?: string;
}> = ({ icon: Icon, label, type, value, onChange, placeholder }) => (
  <div>
    <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
      <Icon className="w-4 h-4 text-amber-400" /> {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white placeholder-slate-500 outline-none transition-all"
    />
  </div>
);

const Select: React.FC<{
  label: string; value: string; onChange: (v: string) => void; options: string[];
}> = ({ label, value, onChange, options }) => (
  <div>
    <label className="block text-sm font-semibold text-slate-300 mb-2">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-3 rounded-xl bg-slate-800/60 border border-slate-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-white outline-none transition-all"
    >
      <option value="">— اختر —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

export default LibyaProModal;
