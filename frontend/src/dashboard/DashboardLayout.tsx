import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Activity, ArrowLeft, BarChart3, Boxes, ChartNoAxesCombined,
  ChevronDown, Globe2, LayoutDashboard, LogOut, Menu, Settings,
  ShieldAlert, ShieldCheck, Users, WalletCards, X, Bell, Search,
  ShoppingBag, Store, Shield, ArrowRightLeft, FileText, ChevronRight
} from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccessToken, api } from '../lib/api';
import { ROLE_LABELS, type Role } from '@verifymart/shared';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  badge?: string;
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [socketStatus, setSocketStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [notificationsCount, setNotificationsCount] = useState(3);

  // Dynamic Navigation per Stakeholder Role
  const navSections = useMemo(() => {
    if (!user) return [];
    const role = user.role;

    // Common Core
    const core: NavItem[] = [
      { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
    ];

    if (role === 'user') {
      // Shopper Portal Navigation
      core.push(
        { to: '/store', label: 'Verified Catalog', icon: ShoppingBag },
        { to: '/dashboard/activity', label: 'Order History', icon: Activity },
        { to: '/verify/sample', label: 'Verify Batch', icon: ShieldCheck },
        { to: '/dashboard/account', label: 'Shopper Profile', icon: Boxes }
      );
    } else if (role === 'merchant') {
      // Merchant Studio Navigation
      core.push(
        { to: '/store', label: 'Storefront View', icon: ShoppingBag },
        { to: '/dashboard/rewards', label: 'Trust & Rewards', icon: WalletCards },
        { to: '/dashboard/activity', label: 'Shipment Stream', icon: Activity },
        { to: '/dashboard/reports', label: 'Performance', icon: ChartNoAxesCombined },
        { to: '/dashboard/account', label: 'Merchant Profile', icon: Boxes }
      );
    } else if (role === 'inventory_manager') {
      // Inventory Control Navigation
      core.push(
        { to: '/dashboard/threats', label: 'Stock & Thresholds', icon: ShieldAlert },
        { to: '/dashboard/topology', label: 'Warehouse Hubs', icon: Globe2 },
        { to: '/dashboard/manage', label: 'Movements & Transfers', icon: ArrowRightLeft },
        { to: '/dashboard/activity', label: 'Inventory Audit', icon: Activity },
        { to: '/dashboard/reports', label: 'Stock Reports', icon: ChartNoAxesCombined },
        { to: '/dashboard/account', label: 'Account', icon: Boxes }
      );
    } else if (role === 'operator') {
      // Operations Command Navigation
      core.push(
        { to: '/dashboard/topology', label: 'Network Topology', icon: Globe2 },
        { to: '/dashboard/threats', label: 'Threats & Audit', icon: ShieldAlert },
        { to: '/dashboard/activity', label: 'Live Telemetry', icon: Activity },
        { to: '/dashboard/manage', label: 'Threshold Controls', icon: Settings },
        { to: '/dashboard/rewards', label: 'Trust Ledger', icon: WalletCards },
        { to: '/dashboard/reports', label: 'Incident Reports', icon: ChartNoAxesCombined },
        { to: '/dashboard/account', label: 'Operator Account', icon: Boxes }
      );
    } else if (role === 'admin') {
      // Administration Center Navigation
      core.push(
        { to: '/dashboard/topology', label: 'Global Topology', icon: Globe2 },
        { to: '/dashboard/threats', label: 'Platform Threats', icon: ShieldAlert },
        { to: '/dashboard/activity', label: 'Audit Trail', icon: Activity },
        { to: '/dashboard/manage', label: 'System Settings', icon: Settings },
        { to: '/dashboard/rewards', label: 'Merchant Rewards', icon: WalletCards },
        { to: '/dashboard/reports', label: 'Executive Reports', icon: ChartNoAxesCombined },
        { to: '/dashboard/admin', label: 'User Governance', icon: Users, badge: 'Admin' },
        { to: '/dashboard/account', label: 'Admin Security', icon: Boxes }
      );
    }

    return core;
  }, [user]);

  // WebSocket Telemetry Connection
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    let retry: number | undefined;
    let socket: WebSocket | undefined;
    let attempt = 0;

    const connect = () => {
      const token = getAccessToken();
      if (!token) {
        setSocketStatus('reconnecting');
        retry = window.setTimeout(connect, 1500);
        return;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/telemetry?token=${encodeURIComponent(token)}`);
      socket.onopen = () => {
        attempt = 0;
        setSocketStatus('live');
      };
      socket.onclose = () => {
        setSocketStatus('reconnecting');
        if (!stopped) retry = window.setTimeout(connect, Math.min(8000, 1000 * 2 ** attempt++));
      };
      socket.onerror = () => setSocketStatus('reconnecting');
    };

    connect();
    return () => {
      stopped = true;
      if (retry !== undefined) window.clearTimeout(retry);
      socket?.close();
    };
  }, [user?.id]);

  if (!user) return null;

  const currentRoleInfo = ROLE_LABELS[user.role];

  return (
    <div className="min-h-screen bg-[var(--bg-root)] text-[var(--text-primary)] flex">
      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-[var(--border-glass)] bg-[var(--bg-sidebar)] transition-all duration-200 ${
          collapsed ? 'w-20' : 'w-64'
        } ${mobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Workspace Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-[var(--border-glass)]">
          <Link to="/" className="flex items-center gap-3 overflow-hidden">
            <span className="w-8 h-8 rounded-lg bg-[var(--accent-burnt-orange)] flex items-center justify-center text-white shrink-0 shadow-md shadow-orange-950/30">
              <ShieldCheck size={18} />
            </span>
            {!collapsed && (
              <span className="font-bold text-sm tracking-tight truncate">
                VerifyMart <i className="text-[var(--accent-lime)] font-serif">AI</i>
              </span>
            )}
          </Link>
          <button
            onClick={() => setMobile(false)}
            className="lg:hidden p-1 text-[var(--text-secondary)] hover:text-white"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Stakeholder Workspace Pill */}
        {!collapsed ? (
          <div className="px-5 py-4 border-b border-[var(--border-subtle)]">
            <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
              ACTIVE WORKSPACE
            </div>
            <div className="text-xs font-semibold text-[var(--accent-burnt-orange)] mt-0.5 truncate">
              {currentRoleInfo.workspace}
            </div>
          </div>
        ) : (
          <div className="py-2 text-center text-[10px] font-mono text-[var(--accent-burnt-orange)] border-b border-[var(--border-subtle)]">
            {user.role.slice(0, 3).toUpperCase()}
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navSections.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end ?? false}
                onClick={() => setMobile(false)}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[var(--accent-burnt-orange)]/15 text-[var(--accent-burnt-orange)] border border-[var(--accent-burnt-orange)]/30 font-semibold'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-white'
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.badge && (
                  <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--accent-lime)]">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User Card & Sign Out */}
        <div className="p-3 border-t border-[var(--border-glass)]">
          <div className={`p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="w-7 h-7 rounded-full bg-[var(--surface-hover)] text-white text-xs font-bold flex items-center justify-center shrink-0 border border-[var(--border-glass)]">
                {user.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              {!collapsed && (
                <div className="truncate">
                  <div className="text-xs font-medium text-white truncate">{user.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)] font-mono capitalize">{user.role.replace('_', ' ')}</div>
                </div>
              )}
            </div>
            {!collapsed && (
              <button
                onClick={() => void logout().then(() => navigate('/'))}
                title="Sign out"
                className="text-[var(--text-muted)] hover:text-rose-400 p-1 transition-colors"
                aria-label="Sign out"
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Workspace Canvas */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${collapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        {/* Top Navbar */}
        <header className="h-16 sticky top-0 z-20 flex items-center justify-between px-6 border-b border-[var(--border-glass)] bg-[var(--bg-root)]/90 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobile(true)}
              className="lg:hidden p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-hover)]"
              aria-label="Open sidebar"
            >
              <Menu size={18} />
            </button>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="hidden lg:flex p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-hover)]"
              aria-label="Toggle sidebar collapse"
            >
              <Menu size={16} />
            </button>

            {/* Breadcrumb Path */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Link to="/dashboard" className="hover:text-white transition-colors">
                {currentRoleInfo.title}
              </Link>
              <ChevronRight size={13} />
              <span className="text-[var(--text-primary)] font-medium">
                {navSections.find(n => n.to === location.pathname)?.label || 'Console'}
              </span>
            </div>
          </div>

          {/* Right Header Status Controls */}
          <div className="flex items-center gap-3">
            {/* Live Socket Status */}
            <div
              className={`badge-lime text-[10px] ${
                socketStatus === 'live' ? '' : 'border-amber-500/30 text-amber-400 bg-amber-500/10'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${socketStatus === 'live' ? 'bg-[var(--accent-lime)] animate-ping' : 'bg-amber-400'}`} />
              {socketStatus === 'live' ? 'LIVE SYNC' : socketStatus.toUpperCase()}
            </div>

            {/* Notifications Shortcut */}
            <div className="relative">
              <button
                className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-white hover:bg-[var(--surface-hover)] transition-colors relative"
                aria-label="Notifications"
              >
                <Bell size={16} />
                {notificationsCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--accent-burnt-orange)]" />
                )}
              </button>
            </div>

            <Link
              to="/store"
              className="hidden md:inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-white px-3 py-1.5 rounded-lg border border-[var(--border-glass)] hover:bg-[var(--surface-hover)]"
            >
              <ShoppingBag size={14} /> Storefront
            </Link>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Global Footer */}
        <footer className="px-8 py-5 border-t border-[var(--border-subtle)] text-xs text-[var(--text-muted)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span>VerifyMart AI · Operations Command V14</span>
            <span>·</span>
            <span className="text-[var(--accent-burnt-orange)] font-mono">STAGING ENCLAVE</span>
          </div>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <a href="/api/health" target="_blank" rel="noreferrer" className="hover:text-white">API Health ↗</a>
            <Link to="/docs" className="hover:text-white">Architecture</Link>
          </div>
        </footer>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobile && (
        <div
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-20 bg-black/70 backdrop-blur-sm lg:hidden"
        />
      )}
    </div>
  );
}
