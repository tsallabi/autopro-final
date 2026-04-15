import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Home } from './pages/Home';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { CarDetails } from './pages/CarDetails';
import { LiveAuctionRoom } from './pages/LiveAuctionRoom';
import { CostCalculator } from './pages/CostCalculator';
import { ShippingPage } from './pages/ShippingPage';
import { WalletPage } from './pages/WalletPage';
import { AboutPage } from './pages/AboutPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { BranchesPage } from './pages/BranchesPage';
import { CareersPage } from './pages/CareersPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RefundPage } from './pages/RefundPage';
import { DepositPage } from './pages/DepositPage';
import { DealerPackagesPage } from './pages/DealerPackagesPage';
import { GulfBranchesPage } from './pages/GulfBranchesPage';
import { DealerClearancePage } from './pages/DealerClearancePage';
import { StoreProvider, useStore } from './context/StoreContext';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AdminErrorBoundary } from './components/AdminErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import { useVisitorTracking } from './hooks/useVisitorTracking';

// Lazy-load heavy dashboard pages for code splitting
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const SellerDashboard = lazy(() => import('./pages/SellerDashboard').then(m => ({ default: m.SellerDashboard })));
const UserDashboard = lazy(() => import('./pages/UserDashboard').then(m => ({ default: m.UserDashboard })));

const DashboardFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
    <div style={{ textAlign: 'center', color: '#94a3b8' }}>
      <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
      <div>جاري التحميل...</div>
    </div>
  </div>
);

// Route guard — requires authentication
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useStore();
  if (!currentUser) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

// Route guard — requires specific role
const RequireRole = ({ children, role }: { children: React.ReactNode; role: string }) => {
  const { currentUser } = useStore();
  if (!currentUser) return <Navigate to="/auth" replace />;
  if (currentUser.role !== role) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

const DashboardRedirect = () => {
  const { currentUser } = useStore();

  if (!currentUser) return <Navigate to="/auth" replace />;

  if (currentUser.role === 'admin') return <Navigate to="admin" replace />;
  if (currentUser.role === 'seller') return <Navigate to="seller" replace />;
  return <Navigate to="user" replace />;
};

function AppContent() {
  useVisitorTracking();
  return (
    <>
      <ScrollToTop />
      <Routes>
          {/* Public Website Routes */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="marketplace" element={<Home />} />
            <Route path="auth" element={<AuthPage />} />
            <Route path="login" element={<Navigate to="/auth" replace />} />
            <Route path="live-auction" element={<LiveAuctionRoom />} />
            <Route path="car-details/:id" element={<CarDetails />} />
            <Route path="calculator" element={<CostCalculator />} />
            <Route path="shipping" element={<ShippingPage />} />
            <Route path="wallet" element={<WalletPage />} />
            {/* Informative / Footer Pages */}
            <Route path="about" element={<AboutPage />} />
            <Route path="how-it-works" element={<HowItWorksPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="careers" element={<CareersPage />} />
            <Route path="terms" element={<TermsPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="refund" element={<RefundPage />} />
            <Route path="deposit" element={<DepositPage />} />
            <Route path="dealer-packages" element={<DealerPackagesPage />} />
            <Route path="gulf-branches" element={<GulfBranchesPage />} />
            <Route path="dealer-clearance" element={<DealerClearancePage />} />
          </Route>

          {/* Redirects */}
          <Route path="/admin" element={<Navigate to="/dashboard/admin" replace />} />
          <Route path="/seller" element={<Navigate to="/dashboard/seller" replace />} />

          {/* Dashboard Routes — protected with role-based access */}
          <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<DashboardRedirect />} />
            <Route path="user" element={
              <Suspense fallback={<DashboardFallback />}>
                <UserDashboard />
              </Suspense>
            } />
            <Route path="admin" element={
              <RequireRole role="admin">
                <Suspense fallback={<DashboardFallback />}>
                  <AdminErrorBoundary><AdminDashboard /></AdminErrorBoundary>
                </Suspense>
              </RequireRole>
            } />
            <Route path="seller" element={
              <RequireRole role="seller">
                <Suspense fallback={<DashboardFallback />}>
                  <SellerDashboard />
                </Suspense>
              </RequireRole>
            } />
          </Route>
        </Routes>
        <MobileBottomNav />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </StoreProvider>
  );
}
