import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Gavel, Calculator, User } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

/**
 * MobileBottomNav — Phase 14
 * Fixed bottom navigation bar, visible only on mobile (< md).
 * Shows 4 tabs: Home / Auctions / Calculator / Profile
 * (Wallet removed — accessible from dashboard instead)
 */
export const MobileBottomNav: React.FC = () => {
    const location = useLocation();
    const { currentUser } = useStore();
    const { t } = useTranslation();

    const tabs = [
        {
            href: '/marketplace?tab=live',
            label: t('nav.liveAuction'),
            icon: Gavel,
            match: ['/marketplace'],
        },
        {
            href: '/calculator',
            label: t('nav.calculator'),
            icon: Calculator,
            match: ['/calculator'],
        },
        {
            href: '/',
            label: t('nav.home'),
            icon: Home,
            match: ['/'],
            exact: true,
        },
        {
            href: currentUser
                ? currentUser.role === 'admin' ? '/dashboard/admin'
                    : currentUser.role === 'seller' ? '/dashboard/seller'
                        : '/dashboard/user'
                : '/auth',
            label: currentUser ? (i18n.language === 'ar' ? 'حسابي' : 'Account') : (i18n.language === 'ar' ? 'دخول' : 'Login'),
            icon: User,
            match: ['/dashboard', '/auth'],
        },
    ];

    const isActive = (tab: typeof tabs[0]) => {
        if (tab.exact) return location.pathname === tab.href;
        return tab.match.some(m => location.pathname.startsWith(m));
    };

    return (
        <nav
            dir="rtl"
            className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 pb-safe"
        >
            <div className="flex items-center justify-around h-16">
                {tabs.map(tab => {
                    const active = isActive(tab);
                    const Icon = tab.icon;
                    return (
                        <Link
                            key={tab.href}
                            to={tab.href}
                            className={`flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-all duration-200 relative ${active ? 'text-orange-400' : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            {/* Active indicator pill */}
                            {active && (
                                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-orange-500 rounded-full" />
                            )}
                            <Icon
                                className={`w-5 h-5 transition-transform ${active ? 'scale-110' : 'scale-100'}`}
                                strokeWidth={active ? 2.5 : 1.8}
                            />
                            <span className={`text-[10px] font-black tracking-tight ${active ? 'text-orange-400' : 'text-slate-500'}`}>
                                {tab.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
};
