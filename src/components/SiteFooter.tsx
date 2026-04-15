import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Car, Phone, Mail, MapPin, Facebook, Twitter, Instagram, Youtube } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useTranslation } from 'react-i18next';
import { LibyaProModal } from './LibyaProModal';

// Key must match FOOTER_KEY in AdminDashboard
const FOOTER_KEY = 'autopro_footer_settings_v7';
const FOOTER_DEFAULT = {
    description: 'منصة مزادات السيارات الأولى في ليبيا — شراء، بيع، شحن دولي بكل شفافية.',
    phone: '+218 91 234 5678',
    email: 'info@autopro.ly',
    address: 'طرابلس، ليبيا',
    facebook: '#', twitter: '#', instagram: '#', youtube: '#',
    companyLinks: [
        { label: 'footer.aboutCompany', href: '/about' },
        { label: 'footer.howItWorks', href: '/how-it-works' },
        { label: 'footer.branches', href: '/branches' },
        { label: 'footer.careers', href: '/careers' },
    ],
    serviceLinks: [
        { label: 'footer.liveAuctions', href: '/marketplace?tab=live' },
        { label: 'footer.browseCars', href: '/marketplace' },
        { label: 'footer.costCalculator', href: '/calculator' },
        { label: 'footer.shippingServices', href: '/shipping' },
        { label: 'أقرب مركز شحن', href: '/nearest-shipping-center' },
    ],
    legalLinks: [
        { label: 'footer.termsAndConditions', href: '/terms' },
        { label: 'footer.privacyPolicy', href: '/privacy' },
        { label: 'footer.refundPolicy', href: '/refund' },
    ],
};

const loadFooter = () => {
    try {
        return { ...FOOTER_DEFAULT, ...JSON.parse(localStorage.getItem(FOOTER_KEY) || '{}') };
    } catch { return FOOTER_DEFAULT; }
};

export const SiteFooter = () => {
    const { branchConfig } = useStore();
    const [cfg, setCfg] = useState(loadFooter);
    const [showLibyaPro, setShowLibyaPro] = useState(false);
    const { t, i18n } = useTranslation();

    // Reload whenever admin saves footer settings
    useEffect(() => {
        const onStorage = () => setCfg(loadFooter());
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const year = new Date().getFullYear();
    const siteName = branchConfig?.name || (i18n.language === 'en' ? 'Libya AUTO PRO' : 'ليبيا AUTO PRO');

    const socialLinks = [
        { name: 'فيسبوك', icon: Facebook, href: cfg.facebook || '#' },
        { name: 'تويتر', icon: Twitter, href: cfg.twitter || '#' },
        { name: 'إنستجرام', icon: Instagram, href: cfg.instagram || '#' },
        { name: 'يوتيوب', icon: Youtube, href: cfg.youtube || '#' },
    ];

    return (
        <footer dir={i18n.language === 'ar' ? 'rtl' : 'ltr'} className="bg-slate-950 text-slate-400 font-sans border-t border-slate-800/50">

            {/* ── Main grid ── */}
            <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-2 md:grid-cols-4 gap-10">

                {/* Brand column */}
                <div className="col-span-2 md:col-span-1 space-y-5">
                    <Link to="/" aria-label="الرئيسية" title="الرئيسية" className="flex items-center gap-3 group w-fit">
                        <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:scale-110 transition-transform">
                            <Car className="w-6 h-6 text-white" />
                        </div>
                        <span className="font-black text-xl text-white leading-tight">
                            {siteName.split(' ')[0]}<br />
                            <span className="text-orange-500 text-sm font-bold">
                                {siteName.split(' ').slice(1).join(' ')}
                            </span>
                        </span>
                    </Link>
                    <p className="text-sm leading-relaxed">{t(cfg.description)}</p>
                    <div className="flex items-center gap-3 pt-1">
                        {socialLinks.map(({ name, icon: Icon, href }) => (
                            <a key={name} href={href} aria-label={name} title={name} target="_blank" rel="noopener noreferrer"
                                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-orange-500 flex items-center justify-center transition-colors group">
                                <Icon className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors" />
                            </a>
                        ))}
                    </div>
                </div>

                {/* Company links */}
                <div className="space-y-4">
                    <h4 className="text-white font-black text-sm uppercase tracking-widest">{t('footer.company')}</h4>
                    <ul className="space-y-2.5">
                        {cfg.companyLinks.map((l: any) => (
                            <li key={l.href}>
                                <Link to={l.href} className="text-sm hover:text-orange-400 hover:translate-x-1 transition-all inline-block">
                                    {t(l.label)}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Services links */}
                <div className="space-y-4">
                    <h4 className="text-white font-black text-sm uppercase tracking-widest">{t('footer.services')}</h4>
                    <ul className="space-y-2.5">
                        {cfg.serviceLinks.map((l: any) => (
                            <li key={l.href}>
                                <Link to={l.href} className="text-sm hover:text-orange-400 hover:translate-x-1 transition-all inline-block">
                                    {t(l.label)}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Contact */}
                <div className="space-y-4">
                    <h4 className="text-white font-black text-sm uppercase tracking-widest">{t('footer.contact')}</h4>
                    <ul className="space-y-3">
                        <li>
                            <a href={`tel:${cfg.phone}`} className="flex items-center gap-2.5 text-sm hover:text-orange-400 transition-colors">
                                <Phone className="w-4 h-4 text-orange-500 shrink-0" />{cfg.phone}
                            </a>
                        </li>
                        <li>
                            <a href={`mailto:${cfg.email}`} className="flex items-center gap-2.5 text-sm hover:text-orange-400 transition-colors">
                                <Mail className="w-4 h-4 text-orange-500 shrink-0" />{cfg.email}
                            </a>
                        </li>
                        <li>
                            <span className="flex items-start gap-2.5 text-sm">
                                <MapPin className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />{t(cfg.address)}
                            </span>
                        </li>
                    </ul>
                </div>
            </div>

            {/* ── Bottom bar ── */}
            <div className="border-t border-slate-800 py-5">
                <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                    <p className="text-center sm:text-right">
                        © {year} منصة <span className="text-white font-semibold">ليبيا أوتو برو</span> من تصميم{' '}
                        <button
                            type="button"
                            onClick={() => setShowLibyaPro(true)}
                            className="inline-flex items-center gap-1 font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 underline decoration-amber-500/40 hover:decoration-amber-400 underline-offset-4 transition-all cursor-pointer"
                            title="ليبيا برو للتقنية — تصميم وبناء المواقع والمنصات"
                        >
                            ليبيا برو للتقنية
                        </button>
                        . جميع الحقوق محفوظة.
                    </p>
                    <div className="flex items-center gap-4">
                        {cfg.legalLinks.map((l: any) => (
                            <Link key={l.href} to={l.href} className="hover:text-orange-400 transition-colors">
                                {t(l.label)}
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
            <LibyaProModal open={showLibyaPro} onClose={() => setShowLibyaPro(false)} />
        </footer>
    );
};
