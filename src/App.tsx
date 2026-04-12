import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import { PageLoader } from './components/SkeletonLoader';
import ManageAddresses from './pages/ManageAddresses';
import PaymentMethods from './pages/PaymentMethods';
import PrivacyTerms from './pages/PrivacyTerms';
import NotFound from './pages/NotFound';

// ─── Lazy-loaded heavy pages for performance ──────────────────────────────────
const Home = React.lazy(() => import('./pages/Home'));
const Products = React.lazy(() => import('./pages/Products'));
const Cart = React.lazy(() => import('./pages/Cart'));
const Admin = React.lazy(() => import('./pages/Admin'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Referral = React.lazy(() => import('./pages/Referral'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Bookings = React.lazy(() => import('./pages/Bookings'));
const Onboarding = React.lazy(() => import('./pages/Onboarding'));
const UserOnboarding = React.lazy(() => import('./pages/UserOnboarding'));
const VerificationPending = React.lazy(() => import('./pages/VerificationPending'));
const DeliveryDashboard = React.lazy(() => import('./pages/DeliveryDashboard'));
const DeliveryProfile = React.lazy(() => import('./pages/DeliveryProfile'));

// ─── Protected Route — auth + role gating ─────────────────────────────────────
function ProtectedRoute({ 
  children, 
  dashboardUserOnly = false, 
  deliveryOnly = false, 
  skipProfileCheck = false 
}: { 
  children: React.ReactNode, 
  dashboardUserOnly?: boolean, 
  deliveryOnly?: boolean, 
  skipProfileCheck?: boolean 
}) {
  const { user, loading, isDashboardUser, isDelivery, isStaff } = useAuth();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  
  // Profile Completion Gate (applies to ALL users unless skipped)
  // Master admin always bypasses onboarding/verification gates
  if (!skipProfileCheck && !isDashboardUser) {
    // Staff who haven't completed KYC onboarding
    if (isStaff && !user.profileComplete && !user.verificationStatus) {
      return <Navigate to="/onboarding" replace />;
    }
    
    // Staff with pending/rejected verification
    if (isStaff && (user.verificationStatus === 'pending' || user.verificationStatus === 'rejected')) {
      return <Navigate to="/verification-pending" replace />;
    }
    
    // Regular users who haven't completed their profile
    if (!isStaff && !user.profileComplete) {
      return <Navigate to="/user-onboarding" replace />;
    }
  }

  if (dashboardUserOnly && !isDashboardUser) return <Navigate to="/" replace />;
  if (deliveryOnly && !isDelivery) return <Navigate to="/" replace />;

  return <>{children}</>;
}

// ─── Login Route Guard — redirect to home if already logged in ────────────────
function LoginRoute() {
  const { user, loading } = useAuth();
  
  if (loading) return <PageLoader />;
  if (user) return <Navigate to="/" replace />;
  
  return <Login />;
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Login — auto-redirect if already authenticated */}
          <Route path="/login" element={<LoginRoute />} />
          
          {/* Onboarding Routes — skip profile check to prevent infinite redirect */}
          <Route path="/onboarding" element={<ProtectedRoute skipProfileCheck><Onboarding /></ProtectedRoute>} />
          <Route path="/user-onboarding" element={<ProtectedRoute skipProfileCheck><UserOnboarding /></ProtectedRoute>} />
          <Route path="/verification-pending" element={<ProtectedRoute skipProfileCheck><VerificationPending /></ProtectedRoute>} />
          
          {/* Public page — privacy/terms (accessible without auth) */}
          <Route path="/privacy" element={<PrivacyTerms />} />

          {/* Protected App Routes — all inside Layout */}
          <Route element={<Layout />}>
            <Route path="/" element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            } />
            <Route path="/products" element={
              <ProtectedRoute>
                <Products />
              </ProtectedRoute>
            } />
            <Route path="/cart" element={
              <ProtectedRoute>
                <Cart />
              </ProtectedRoute>
            } />
            <Route path="/orders" element={
              <ProtectedRoute>
                <Orders />
              </ProtectedRoute>
            } />
            <Route path="/referral" element={
              <ProtectedRoute>
                <Referral />
              </ProtectedRoute>
            } />
            <Route path="/bookings" element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/profile/addresses" element={
              <ProtectedRoute>
                <ManageAddresses />
              </ProtectedRoute>
            } />
            <Route path="/profile/payments" element={
              <ProtectedRoute>
                <PaymentMethods />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute dashboardUserOnly>
                <Admin />
              </ProtectedRoute>
            } />
            <Route path="/delivery" element={
              <ProtectedRoute deliveryOnly>
                <DeliveryDashboard />
              </ProtectedRoute>
            } />
            <Route path="/delivery/profile" element={
              <ProtectedRoute deliveryOnly>
                <DeliveryProfile />
              </ProtectedRoute>
            } />
          </Route>

          {/* 404 Catch-All — must be last */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
