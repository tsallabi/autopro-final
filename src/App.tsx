import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Home } from './pages/Home';
import { LandingPage } from './pages/LandingPage';
import { AuthPage } from './pages/AuthPage';
import { UserDashboard } from './pages/UserDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { SellerDashboard } from './pages/SellerDashboard';
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
import { StoreProvider, useStore } from './context/StoreContext';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AdminErrorBoundary } from './components/AdminErrorBoundary';
import ScrollToTop from './components/ScrollToTop';


const DashboardRedirect = () => {
  const { currentUser } = useStore();

  if (!currentUser) return <Navigate to="/auth" replace />;

  if (currentUser.role === 'admin') return <Navigate to="admin" replace />;
  if (currentUser.role === 'seller') return <Navigate to="seller" replace />;
  return <Navigate to="user" replace />;
};

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
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
          </Route>

          {/* Redirects */}
          <Route path="/admin" element={<Navigate to="/dashboard/admin" replace />} />
          <Route path="/seller" element={<Navigate to="/dashboard/seller" replace />} />

          {/* Dashboard Routes (Admin, User, Seller) */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardRedirect />} />
            <Route path="user" element={<UserDashboard />} />
            <Route path="admin" element={<AdminErrorBoundary><AdminDashboard /></AdminErrorBoundary>} />
            <Route path="seller" element={<SellerDashboard />} />
          </Route>
        </Routes>
        <MobileBottomNav />
      </BrowserRouter>
    </StoreProvider>
  );
}

