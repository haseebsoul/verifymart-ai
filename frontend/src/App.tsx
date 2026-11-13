import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Header, SiteFooter } from './components/Header';
import { CartDrawer } from './components/CartDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const StorePage = lazy(() => import('./pages/StorePage').then(m => ({ default: m.StorePage })));
const VerifyPage = lazy(() => import('./pages/VerifyPage').then(m => ({ default: m.VerifyPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/RegisterPage').then(m => ({ default: m.RegisterPage })));
const NotFoundPage = lazy(() => import('./pages/SystemPages').then(m => ({ default: m.NotFoundPage })));
const ForbiddenPage = lazy(() => import('./pages/SystemPages').then(m => ({ default: m.ForbiddenPage })));

const DashboardLayout = lazy(() => import('./dashboard/DashboardLayout').then(m => ({ default: m.DashboardLayout })));
const OverviewPage = lazy(() => import('./dashboard/OverviewPage').then(m => ({ default: m.OverviewPage })));
const TopologyPage = lazy(() => import('./dashboard/TopologyPage').then(m => ({ default: m.TopologyPage })));
const ThreatsPage = lazy(() => import('./dashboard/ThreatsPage').then(m => ({ default: m.ThreatsPage })));
const ActivityPage = lazy(() => import('./dashboard/ActivityPage').then(m => ({ default: m.ActivityPage })));
const ManagePage = lazy(() => import('./dashboard/ManagePage').then(m => ({ default: m.ManagePage })));
const RewardsPage = lazy(() => import('./dashboard/RewardsPage').then(m => ({ default: m.RewardsPage })));
const ReportsPage = lazy(() => import('./dashboard/ReportsPage').then(m => ({ default: m.ReportsPage })));
const AccountPage = lazy(() => import('./dashboard/AccountPage').then(m => ({ default: m.AccountPage })));
const AdminPage = lazy(() => import('./dashboard/AdminPage').then(m => ({ default: m.AdminPage })));

function PublicLayout() {
  return (
    <>
      <Header />
      <OfflineBanner />
      <Outlet />
      <SiteFooter />
      <CartDrawer />
    </>
  );
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return offline ? (
    <div className="bg-amber-950/60 border-b border-amber-800 text-amber-300 py-2 px-4 text-xs font-mono text-center" role="status">
      You are offline. Showing cached provenance & telemetry where available.
    </div>
  ) : null;
}

function Protected({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-root)] flex flex-col items-center justify-center font-mono text-xs text-[var(--text-muted)]">
        <span className="w-8 h-8 rounded-xl bg-[var(--accent-burnt-orange)] flex items-center justify-center text-white mb-3">V</span>
        <p>Initializing authenticated enclave…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login?next=/dashboard" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/403" replace />;
  return <Outlet />;
}

function RoutedApp() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg-root)] flex flex-col items-center justify-center font-mono text-xs text-[var(--text-muted)]">
          <span className="w-8 h-8 rounded-xl bg-[var(--accent-burnt-orange)] flex items-center justify-center text-white mb-3">V</span>
          <p>Loading VerifyMart AI V14…</p>
        </div>
      }
    >
      <Routes>
        {/* Public Storefront & Discovery */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/verify/:query" element={<VerifyPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/403" element={<ForbiddenPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Authenticated Dashboard Core for all 5 Stakeholders */}
        <Route element={<Protected />}>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<OverviewPage />} />
            <Route path="topology" element={<TopologyPage />} />
            <Route path="threats" element={<ThreatsPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="manage" element={<ManagePage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route element={<Protected admin />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <RoutedApp />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
