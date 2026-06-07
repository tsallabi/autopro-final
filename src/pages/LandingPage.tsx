import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowRight, Shield, TrendingUp, Truck,
    MessageSquare, Gavel, CheckCircle2,
    Users, DollarSign, Activity, Warehouse,
    Timer, Star, Globe, Zap, Car as CarIcon
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { AgencyRecruitment } from '../components/AgencyRecruitment';
import DealOfDayBanner from '../components/DealOfDayBanner';
import DeliveredCarsShowcase from '../components/DeliveredCarsShowcase';

export const LandingPage = () => {
    const navigate = useNavigate();
    const { branchConfig } = useStore();
    const { t, i18n } = useTranslation();

    return (
        <div className="bg-white selection:bg-orange-500/30 overflow-x-hidden font-sans" dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>

            <section className="relative min-h-screen flex items-center bg-[#0F172A] text-white pt-20 overflow-hidden">
                {/* Background Visual Components */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-0 right-0 w-[1000px] h-[1000px] bg-orange-600/20 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-[800px] h-[800px] bg-blue-600/10 rounded-full blur-[120px] translate-y-1/2 -translate-x-1/2"></div>
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20"></div>
                    {/* Perspective Lines */}
                    <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent"></div>
                </div>

                <div className="container mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-16 items-center">
                    {/* Hero Text */}
                    <div className="space-y-10 animate-in slide-in-from-right duration-1000">
                        <div className="flex flex-col gap-6 items-start">
                            <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-2xl px-6 py-2.5 rounded-full border border-white/10 shadow-2xl">
                                <Zap className="w-5 h-5 text-orange-500 fill-orange-500" />
                                <span className="text-sm font-black uppercase tracking-[0.2em] text-orange-100">المنصة الأقوى للمزادات في ليبيا والخليج</span>
                            </div>
                        </div>

                        <h1 className="text-6xl lg:text-8xl font-black leading-[1.05] tracking-tight">
                            {t('landingPage.heroTitle1')} <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-l from-orange-400 via-orange-500 to-rose-500">{t('landingPage.heroTitleHighlight')}</span>
                            <br />{t('landingPage.heroTitle2')}
                        </h1>

                        <p className="text-xl text-slate-400 max-w-xl font-medium leading-relaxed">
                            {t('landingPage.heroSubtitle')}
                        </p>

                        <div className="flex flex-wrap gap-5 pt-6">
                            <button
                                onClick={() => navigate('/auth?mode=register')}
                                className="bg-[#FF3D00] text-white px-12 py-6 rounded-[2rem] font-black text-xl shadow-[0_20px_50px_-10px_rgba(255,61,0,0.5)] hover:-translate-y-1 hover:shadow-orange-500/60 transition-all flex items-center gap-4 group"
                            >
                                {t('landingPage.registerStart')} <ArrowRight className={`w-7 h-7 transform ${i18n.language === 'ar' ? 'rotate-180 group-hover:-translate-x-2' : 'group-hover:translate-x-2'} transition-transform`} />
                            </button>
                            <button
                                onClick={() => navigate('/marketplace')}
                                className="bg-white/5 backdrop-blur-xl border border-white/10 text-white px-12 py-6 rounded-[2rem] font-black text-xl hover:bg-white/10 transition-all flex items-center gap-3"
                            >
                                {t('landingPage.browseCars')}
                            </button>
                        </div>

                        {/* Trust Stats */}
                        <div className="flex items-center gap-12 pt-10 border-t border-white/5">
                            <div>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-4xl font-black text-white">40k</p>
                                    <span className="text-orange-500 font-bold text-xl">+</span>
                                </div>
                                <p className="text-xs text-slate-500 font-black uppercase tracking-widest mt-1">{t('landingPage.weeklyCars')}</p>
                            </div>
                            <div className="w-px h-12 bg-white/5"></div>
                            <div>
                                <div className="flex items-baseline gap-1">
                                    <p className="text-4xl font-black text-white">100</p>
                                    <span className="text-green-500 font-bold text-xl">%</span>
                                </div>
                                <p className="text-xs text-slate-500 font-black uppercase tracking-widest mt-1">{t('landingPage.transparency')}</p>
                            </div>
                            <div className="w-px h-12 bg-white/5"></div>
                            <div className="hidden sm:block">
                                <div className="flex items-center gap-1 text-orange-500 mb-1">
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                    <Star className="w-4 h-4 fill-current" />
                                </div>
                                <p className="text-xs text-slate-500 font-black uppercase tracking-widest leading-none">{t('landingPage.dealerRating')}</p>
                            </div>
                        </div>
                    </div>

                    {/* Hero Visual Mockup (Image 1 style) */}
                    <div className="relative animate-in zoom-in duration-1000 hidden lg:flex flex-col items-center gap-32">
                        <div className="relative group mb-12">
                            <img
                                src="/logo_transparent_real.png"
                                alt="AutoPro Logo"
                                className="h-20 lg:h-28 w-auto object-contain transition-transform hover:scale-105 duration-700"
                            />
                        </div>

                        <div className="bg-[#1E293B] rounded-[3.5rem] p-4 shadow-[0_0_100px_-20px_rgba(255,61,0,0.3)] border border-white/5 relative group w-full">
                            <div className="bg-slate-900 rounded-[2.5rem] overflow-hidden relative aspect-[4/3]">
                                <img
                                    src="https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?auto=format&fit=crop&q=80&w=1200"
                                    className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-1000"
                                    alt="Luxury Car"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>

                                {/* Floating Auction Card */}
                                <div className="absolute bottom-8 left-8 right-8 bg-white/10 backdrop-blur-2xl border border-white/20 p-8 rounded-[2.5rem] shadow-2xl flex items-center justify-between animate-float">
                                    <div>
                                        <h3 className="text-2xl font-black text-white mb-1">2024 Porsche 911 GT3</h3>
                                        <div className="flex items-center gap-2 text-orange-400 font-bold text-sm">
                                            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                                            {t('landingPage.liveBidStarts')}
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">HIGHEST BID</p>
                                        <div className="text-3xl font-black text-white">$142,500</div>
                                    </div>
                                </div>

                                {/* Live Timer Overlay */}
                                <div className="absolute top-8 right-8 bg-red-600 text-white px-5 py-2.5 rounded-2xl font-black text-lg flex items-center gap-3 shadow-xl shadow-red-600/30">
                                    <Timer className="w-6 h-6 animate-pulse" />
                                    <span className="font-mono tracking-wider">04:12:05</span>
                                </div>
                            </div>

                            {/* Decorative Accents */}
                            <div className="absolute -top-6 -left-6 w-32 h-32 bg-orange-500/20 rounded-full blur-3xl"></div>
                            <div className="absolute -bottom-10 -right-10 bg-white/10 backdrop-blur-3xl border border-white/20 p-6 rounded-[2rem] shadow-2xl">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-500">
                                        <TrendingUp className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{t('landingPage.instantApproval')}</p>
                                        <p className="text-white font-black text-xl">{t('landingPage.readyToShip')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section >

            {/* [WIRING] Deal of the Day banner — only renders when admin pinned a car */}
            <div className="container mx-auto px-6 -mt-8 relative z-10">
                <DealOfDayBanner />
            </div>

            {/* 2. SERVICES SECTION */}
            < section id="services" className="py-32 relative bg-white" >

                <div className="container mx-auto px-6">
                    <div className="flex flex-col items-center mb-24 text-center">
                        <div className="inline-flex items-center gap-2 bg-orange-100 px-4 py-1.5 rounded-full text-orange-600 font-black text-xs uppercase tracking-widest mb-6 border border-orange-200">
                            {t('landingPage.logisticsServices')}
                        </div>
                        <h2 className="text-5xl lg:text-6xl font-black text-slate-900 mb-6 tracking-tight">{t('landingPage.comprehensiveSolutions')} <span className="text-orange-500">{t('landingPage.growBusiness')}</span></h2>
                        <p className="text-xl text-slate-500 font-medium max-w-2xl leading-relaxed">
                            {t('landingPage.logisticsSubtitle')}
                        </p>
                    </div>

                    <div className="grid lg:grid-cols-3 gap-10">
                        {/* BUY */}
                        <div className="group bg-slate-50 border border-slate-100 p-12 rounded-[3.5rem] hover:bg-white hover:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] transition-all duration-500 flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-orange-100 text-[#FF3D00] rounded-[2rem] flex items-center justify-center mb-10 transform -rotate-6 group-hover:rotate-0 transition-transform shadow-xl shadow-orange-500/5">
                                <Gavel className="w-12 h-12" />
                            </div>
                            <h3 className="text-3xl font-black text-slate-900 mb-6">شـراء (Buy)</h3>
                            <p className="text-slate-500 font-bold leading-relaxed mb-10 flex-grow">
                                استفد من الوصول الحصري لأكثر من 50,000 {t('landingPage.weeklyCars')}. نظام مزايدة حي متوافق مع كافة الأجهزة وبشفافية تامة في الرسوم.
                            </p>
                            <button onClick={() => navigate('/marketplace')} className="w-full bg-[#FF3D00] text-white py-5 rounded-[1.5rem] font-black hover:shadow-2xl shadow-orange-500/20 active:scale-95 transition-all text-lg">{t('landingPage.buySection.btn')}</button>
                        </div>

                        {/* SELL */}
                        <div className="group bg-slate-50 border border-slate-100 p-12 rounded-[3.5rem] hover:bg-white hover:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] transition-all duration-500 flex flex-col items-center text-center lg:translate-y-12">
                            <div className="w-24 h-24 bg-blue-100 text-blue-600 rounded-[2rem] flex items-center justify-center mb-10 transform rotate-6 group-hover:rotate-0 transition-transform shadow-xl shadow-blue-500/5">
                                <Activity className="w-12 h-12" />
                            </div>
                            <h3 className="text-3xl font-black text-slate-900 mb-6">بـيـع (Sell)</h3>
                            <p className="text-slate-500 font-bold leading-relaxed mb-10 flex-grow">
                                {t('landingPage.sellSection.desc')}
                            </p>
                            <button onClick={() => navigate('/marketplace')} className="w-full bg-blue-600 text-white py-5 rounded-[1.5rem] font-black hover:shadow-2xl shadow-blue-500/20 active:scale-95 transition-all text-lg">{t('landingPage.sellSection.btn')}</button>
                        </div>

                        {/* VALUE */}
                        <div className="group bg-slate-50 border border-slate-100 p-12 rounded-[3.5rem] hover:bg-white hover:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] transition-all duration-500 flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center mb-10 transform -rotate-3 group-hover:rotate-0 transition-transform shadow-xl shadow-emerald-500/5">
                                <DollarSign className="w-12 h-12" />
                            </div>
                            <h3 className="text-3xl font-black text-slate-900 mb-6">تخـمين (Value)</h3>
                            <p className="text-slate-500 font-bold leading-relaxed mb-10 flex-grow">
                                {t('landingPage.valueSection.desc')}
                            </p>
                            <button onClick={() => navigate('/calculator')} className="w-full bg-emerald-600 text-white py-5 rounded-[1.5rem] font-black hover:shadow-2xl shadow-emerald-500/20 active:scale-95 transition-all text-lg">{t('landingPage.valueSection.btn')}</button>
                        </div>
                    </div>
                </div>
            </section >

            {/* 3. TRANSPORT SECTION */}
            < section id="transport" className="bg-slate-950 py-32 overflow-hidden relative" >

                <div className="container mx-auto px-6 grid lg:grid-cols-2 gap-24 items-center">
                    <div className="relative animate-in slide-in-from-right duration-1000">
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-600/10 rounded-full blur-[100px] -z-10"></div>
                        <img
                            src="https://images.unsplash.com/photo-1590333746438-2831826051c8?auto=format&fit=crop&q=80&w=1200"
                            className="w-full h-auto rounded-[3.5rem] shadow-2xl transition-transform duration-1000 hover:scale-105"
                            alt="Truck Transport"
                        />
                        {/* Status Card Overlay */}
                        <div className="absolute -bottom-10 right-10 bg-white p-8 rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] border border-slate-100 group animate-float">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-orange-500 text-white rounded-2xl flex items-center justify-center">
                                    <Truck className="w-10 h-10" />
                                </div>
                                <div>
                                    <h4 className="text-2xl font-black text-slate-900">{t('landingPage.transport.liveTrack')}</h4>
                                    <p className="text-slate-400 font-bold">{t('landingPage.transport.eta')}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-10 text-white">
                        <div className="w-20 h-2 bg-orange-500 rounded-full"></div>
                        <h2 className="text-5xl lg:text-6xl font-black tracking-tight leading-tight">{t('landingPage.transport.safeTransport')} <br /><span className="text-orange-500">{t('landingPage.transport.portToDoor')}</span></h2>
                        <p className="text-xl text-slate-400 font-medium leading-relaxed">
                            {t('landingPage.transport.desc')}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                            {[
                                { text: t('landingPage.transport.feature1'), icon: Shield },
                                { text: t('landingPage.transport.feature2'), icon: Globe },
                                { text: t('landingPage.transport.feature3'), icon: CheckCircle2 },
                                { text: t('landingPage.transport.feature4'), icon: Users }
                            ].map((item, idx) => (
                                <div key={idx} className="flex items-center gap-4 bg-white/5 border border-white/10 p-5 rounded-[1.5rem] group hover:bg-white/10 transition-colors">
                                    <item.icon className="w-6 h-6 text-orange-500" />
                                    <span className="font-bold text-slate-200">{item.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section >

            {/* 4. READY TO SIGN UP (Image 1 CTA Laptop style) */}
            < section className="bg-orange-600 py-32 relative overflow-hidden" >
                {/* Visual Flair */}
                < div className="absolute inset-0 opacity-10" >
                    <div className="absolute top-0 right-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
                </div >

                <div className="container mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-20 items-center">
                    <div className="text-white space-y-10 order-2 lg:order-1">
                        <h2 className="text-6xl font-black leading-tight">{t('landingPage.cta.title1')} <br />{t('landingPage.cta.title2')}</h2>

                        <div className="space-y-8">
                            {[
                                { title: t('landingPage.cta.feat1Title'), desc: t('landingPage.cta.feat1Desc'), icon: TrendingUp },
                                { title: t('landingPage.cta.feat2Title'), desc: t('landingPage.cta.feat2Desc'), icon: Activity },
                                { title: t('landingPage.cta.feat3Title'), desc: t('landingPage.cta.feat3Desc'), icon: MessageSquare }
                            ].map((feat, i) => (
                                <div key={i} className="flex items-start gap-6 group">
                                    <div className="w-16 h-16 bg-white/10 rounded-[1.5rem] flex items-center justify-center flex-shrink-0 group-hover:bg-white text-white group-hover:text-orange-600 transition-all shadow-xl">
                                        <feat.icon className="w-8 h-8" />
                                    </div>
                                    <div className="pt-1">
                                        <h4 className="text-2xl font-black mb-1">{feat.title}</h4>
                                        <p className="text-orange-50 font-medium leading-relaxed opacity-80">{feat.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button onClick={() => navigate('/auth?mode=register')} className="bg-white text-orange-600 px-14 py-6 rounded-[2.5rem] font-black text-2xl shadow-3xl hover:-translate-y-2 transition-all active:scale-95">{t('landingPage.cta.btn')}</button>
                    </div>

                    <div className="relative order-1 lg:order-2 animate-in slide-in-from-bottom duration-1000">
                        {/* Mockup Frame (Image 1 style) */}
                        <div className="bg-[#0F172A] rounded-[3rem] p-4 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6)] border border-white/20 relative">
                            <div className="bg-slate-900 rounded-[2rem] overflow-hidden aspect-video relative">
                                <img
                                    src="https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&q=80&w=1200"
                                    className="w-full h-full object-cover opacity-60"
                                    alt="Dashboard"
                                />
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-10 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent">
                                    <div className="w-24 h-24 bg-orange-500 rounded-full flex items-center justify-center mb-6 shadow-2xl animate-pulse">
                                        <Gavel className="w-12 h-12 text-white" />
                                    </div>
                                    <h3 className="text-4xl font-black text-white italic tracking-widest mb-4 uppercase">Live Auction Feed</h3>
                                    <p className="text-slate-400 font-bold text-lg">{t('landingPage.cta.liveGateway')}</p>
                                </div>
                            </div>
                        </div>
                        {/* Decoration */}
                        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/20 rounded-full blur-3xl animate-pulse"></div>
                    </div>
                </div>
            </section >

            {/* 5. TESTIMONIALS */}
            < section id="testimonials" className="py-32 bg-slate-50 relative overflow-hidden" >

                <div className="container mx-auto px-6 text-center mb-20">
                    <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">{t('landingPage.testimonials.title')}</h2>
                    <p className="text-xl text-slate-500 font-bold uppercase tracking-widest">{t('landingPage.testimonials.subtitle')}</p>
                </div>

                <div className="container mx-auto px-6 grid md:grid-cols-3 gap-10">
                    {[
                        { name: t('landingPage.testimonials.1_name'), role: t('landingPage.testimonials.1_role'), text: t('landingPage.testimonials.1_text') },
                        { name: t('landingPage.testimonials.2_name'), role: t('landingPage.testimonials.2_role'), text: t('landingPage.testimonials.2_text') },
                        { name: t('landingPage.testimonials.3_name'), role: t('landingPage.testimonials.3_role'), text: t('landingPage.testimonials.3_text') }
                    ].map((testi, i) => (
                        <div key={i} className="bg-white p-12 rounded-[3.5rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all group relative">
                            <div className="text-orange-500 mb-8 transform group-hover:scale-110 transition-transform">
                                <MessageSquare className="w-14 h-14 fill-orange-500/10" />
                            </div>
                            <p className="text-slate-600 font-bold text-xl leading-relaxed mb-10 italic">"{testi.text}"</p>
                            <div className="mt-auto pt-6 border-t border-slate-50">
                                <h4 className="font-black text-slate-900 text-2xl mb-1">{testi.name}</h4>
                                <p className="text-orange-500 font-black text-sm uppercase tracking-widest">{testi.role}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section >

            {/* AGENCY RECRUITMENT */}
            <AgencyRecruitment />

            {/* 5b. SOCIAL PROOF — recently delivered cars */}
            <DeliveredCarsShowcase limit={8} />

            {/* 6. CALL TO ACTION FOOTER (Image 1 Bottom style) */}
            < section className="pb-32 container mx-auto px-6" >
                <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 rounded-[5rem] p-20 text-center relative overflow-hidden border border-white/5 shadow-3xl">
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/black-linen-2.png')] opacity-30"></div>
                    <div className="relative z-10 max-w-3xl mx-auto space-y-10">
                        <div className="w-20 h-2 bg-orange-600 mx-auto rounded-full"></div>
                        <h2 className="text-5xl lg:text-7xl font-black text-white leading-tight">{t('footer.ready')} <br /><span className="text-orange-500">{t('footer.future')}</span></h2>
                        <div className="flex flex-col sm:flex-row gap-6 justify-center pt-6">
                            <button onClick={() => navigate('/auth?mode=register')} className="bg-white text-slate-900 px-16 py-6 rounded-[2rem] font-black text-2xl hover:bg-orange-500 hover:text-white transition-all shadow-2xl">{t('footer.createAccount')}</button>
                            <button onClick={() => navigate('/marketplace')} className="bg-transparent border-2 border-white/20 text-white px-16 py-6 rounded-[2rem] font-black text-2xl hover:bg-white/10 transition-all">{t('landingPage.browseCars')}</button>
                        </div>
                        <p className="text-slate-500 font-bold text-sm tracking-[0.2em] uppercase">{t('footer.note')}</p>
                    </div>
                </div>
            </section >
        </div >
    );
};
