import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { SiteFooter } from '../components/SiteFooter';

export const MainLayout = () => {
  const location = useLocation();

  // Pages that have their own complete custom layout
  const hideLayout =
    ['/marketplace', '/auth'].includes(location.pathname) ||
    location.pathname.startsWith('/dashboard');

  // Pages that show navbar but not the footer
  const hideFooter = location.pathname.startsWith('/car-details');

  return (
    <div className="min-h-screen flex flex-col selection:bg-orange-500/30">
      {!hideLayout && <Navbar />}
      {/* pb-24 on mobile leaves room for MobileBottomNav */}
      <main className="flex-grow pb-24 md:pb-0">
        <Outlet />
      </main>
      {!hideLayout && !hideFooter && <SiteFooter />}
    </div>
  );
};
