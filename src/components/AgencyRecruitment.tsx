import React, { useState } from 'react';
import {
  MapPin, Phone, Building2, Car, FileText, Send, X,
  Handshake, Globe, TrendingUp, Shield, CheckCircle2,
  Sparkles, ArrowRight, Users
} from 'lucide-react';

interface FormData {
  fullName: string;
  cityCountry: string;
  phone: string;
  whatsapp: string;
  showroomName: string;
  expectedCarsPerMonth: string;
  notes: string;
}

const initialFormData: FormData = {
  fullName: '',
  cityCountry: '',
  phone: '',
  whatsapp: '',
  showroomName: '',
  expectedCarsPerMonth: '',
  notes: '',
};

export const AgencyRecruitment = () => {
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.cityCountry || !formData.phone) {
      setError('الرجاء تعبئة الحقول المطلوبة');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/agency-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
        setFormData(initialFormData);
      } else {
        setError(data.error || 'حدث خطأ. حاول مرة أخرى.');
      }
    } catch {
      setError('فشل الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setSubmitting(false);
    }
  };

  const benefits = [
    { icon: Globe, title: 'تغطية واسعة', desc: 'نبحث عن وكلاء في جميع المدن الليبية والخليجية' },
    { icon: TrendingUp, title: 'عمولات مجزية', desc: 'نظام عمولات تنافسي مع مكافآت أداء شهرية' },
    { icon: Shield, title: 'دعم كامل', desc: 'تدريب شامل ودعم فني وتسويقي من فريقنا' },
    { icon: Users, title: 'شبكة متنامية', desc: 'انضم لشبكة وكلاء AutoPro المتنامية حول المنطقة' },
  ];

  return (
    <>
      {/* RECRUITMENT SECTION */}
      <section className="relative py-32 overflow-hidden" dir="rtl">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#0c1222] to-slate-950" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/30 to-transparent" />

        {/* Glow effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/5 rounded-full blur-[150px]" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-6xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">

              {/* Left: Content */}
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-full px-5 py-2">
                  <Handshake className="w-4 h-4 text-orange-400" />
                  <span className="text-orange-300 text-sm font-bold">فرصة شراكة حصرية</span>
                </div>

                <h2 className="text-4xl md:text-5xl font-black text-white leading-tight">
                  كن وكيلاً لمزادات
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-l from-orange-400 to-amber-500">AutoPro</span>
                  {' '}في مدينتك
                </h2>

                <p className="text-lg text-slate-400 leading-relaxed max-w-lg">
                  نبحث عن شركاء طموحين في جميع أنحاء ليبيا والخليج لتمثيل منصتنا محلياً.
                  كن جزءاً من أسرع منصة مزادات نمواً في المنطقة واستفد من شبكة واسعة وأرباح مجزية.
                </p>

                {/* Benefits grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  {benefits.map((b, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white/[0.03] border border-white/5 rounded-2xl p-4 hover:border-orange-500/20 transition-colors">
                      <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center shrink-0">
                        <b.icon className="w-5 h-5 text-orange-400" />
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm mb-1">{b.title}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed">{b.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => { setShowModal(true); setSubmitted(false); }}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-10 py-5 rounded-2xl font-black text-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-xl shadow-orange-500/20 flex items-center gap-3"
                >
                  <Sparkles className="w-5 h-5" />
                  تقدم الآن
                  <ArrowRight className="w-5 h-5 rtl:rotate-180" />
                </button>
              </div>

              {/* Right: Decorative stats */}
              <div className="hidden lg:block">
                <div className="relative">
                  {/* Floating cards */}
                  <div className="space-y-4">
                    <div className="bg-white/[0.04] border border-white/10 rounded-3xl p-8 backdrop-blur-sm">
                      <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-l from-orange-400 to-amber-500 mb-2">50+</div>
                      <div className="text-slate-400 font-bold">وكيل معتمد حالياً</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                        <div className="text-3xl font-black text-white mb-1">15+</div>
                        <div className="text-xs text-slate-500 font-bold">مدينة مغطاة</div>
                      </div>
                      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-sm">
                        <div className="text-3xl font-black text-white mb-1">98%</div>
                        <div className="text-xs text-slate-500 font-bold">رضا الوكلاء</div>
                      </div>
                    </div>
                    <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/5 border border-orange-500/20 rounded-2xl p-6">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5 text-orange-400" />
                        </div>
                        <span className="text-sm font-bold text-orange-300">مزايا الوكيل</span>
                      </div>
                      <ul className="space-y-2 text-sm text-slate-400">
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-orange-500" /> أسعار حصرية للوكلاء</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-orange-500" /> أولوية في المزادات</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-orange-500" /> تدريب ودعم مستمر</li>
                        <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-orange-500" /> مواد تسويقية جاهزة</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" dir="rtl">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-white/5 rounded-t-3xl px-6 py-5 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500/10 rounded-xl flex items-center justify-center">
                  <Handshake className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="font-black text-white text-lg">طلب وكالة</h3>
                  <p className="text-xs text-slate-500">املأ البيانات وسنتواصل معك</p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-10 h-10 text-green-400" />
                  </div>
                  <h4 className="text-2xl font-black text-white mb-3">تم استلام طلبك!</h4>
                  <p className="text-slate-400 mb-8 leading-relaxed">
                    شكراً لاهتمامك بالشراكة مع AutoPro. سيتواصل معك فريقنا خلال 24-48 ساعة.
                  </p>
                  <button
                    onClick={() => setShowModal(false)}
                    className="bg-white/5 border border-white/10 text-white px-8 py-3 rounded-xl font-bold hover:bg-white/10 transition-colors"
                  >
                    إغلاق
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold p-3 rounded-xl">
                      {error}
                    </div>
                  )}

                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-bold text-slate-400 mb-2">
                      الاسم الكامل <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={e => handleChange('fullName', e.target.value)}
                        placeholder="أدخل اسمك الكامل"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                      />
                      <Users className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    </div>
                  </div>

                  {/* City & Country */}
                  <div>
                    <label className="block text-sm font-bold text-slate-400 mb-2">
                      المدينة والدولة <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.cityCountry}
                        onChange={e => handleChange('cityCountry', e.target.value)}
                        placeholder="مثال: طرابلس، ليبيا"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                      />
                      <MapPin className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    </div>
                  </div>

                  {/* Phone & WhatsApp in 2 cols */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-400 mb-2">
                        رقم الهاتف <span className="text-red-400">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={e => handleChange('phone', e.target.value)}
                          placeholder="+218 91 000 0000"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                        />
                        <Phone className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-400 mb-2">
                        واتساب
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          value={formData.whatsapp}
                          onChange={e => handleChange('whatsapp', e.target.value)}
                          placeholder="نفس الرقم أو مختلف"
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                        />
                        <Phone className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-slate-600" />
                      </div>
                    </div>
                  </div>

                  {/* Showroom Name */}
                  <div>
                    <label className="block text-sm font-bold text-slate-400 mb-2">
                      اسم المعرض (إن وجد)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formData.showroomName}
                        onChange={e => handleChange('showroomName', e.target.value)}
                        placeholder="اسم معرض السيارات"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all"
                      />
                      <Building2 className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    </div>
                  </div>

                  {/* Expected Cars Per Month */}
                  <div>
                    <label className="block text-sm font-bold text-slate-400 mb-2">
                      عدد السيارات المتوقع شهرياً
                    </label>
                    <div className="relative">
                      <select
                        value={formData.expectedCarsPerMonth}
                        onChange={e => handleChange('expectedCarsPerMonth', e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all appearance-none"
                      >
                        <option value="" className="bg-slate-900">اختر العدد التقريبي</option>
                        <option value="1-5" className="bg-slate-900">1 - 5 سيارات</option>
                        <option value="5-15" className="bg-slate-900">5 - 15 سيارة</option>
                        <option value="15-30" className="bg-slate-900">15 - 30 سيارة</option>
                        <option value="30-50" className="bg-slate-900">30 - 50 سيارة</option>
                        <option value="50+" className="bg-slate-900">أكثر من 50 سيارة</option>
                      </select>
                      <Car className="absolute top-1/2 right-3 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-bold text-slate-400 mb-2">
                      ملاحظات إضافية
                    </label>
                    <div className="relative">
                      <textarea
                        value={formData.notes}
                        onChange={e => handleChange('notes', e.target.value)}
                        placeholder="أي معلومات إضافية تود مشاركتها..."
                        rows={3}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/20 transition-all resize-none"
                      />
                      <FileText className="absolute top-3 right-3 w-4 h-4 text-slate-600" />
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-4 rounded-xl font-black text-lg hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        جاري الإرسال...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        أرسل الطلب
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
