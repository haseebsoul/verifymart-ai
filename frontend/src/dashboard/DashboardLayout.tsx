import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BadgeCheck, Boxes, ChartNoAxesCombined, ClipboardList, FileCheck2,
  Globe2, LayoutDashboard, LogOut, Menu, Package, Settings, ShieldAlert,
  ShieldCheck, ShoppingBag, Users, WalletCards, Warehouse, X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccessToken } from '../lib/api';

type NavigationItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };

function NavItems({ items, collapsed, onNavigate }: { items: NavigationItem[]; collapsed: boolean; onNavigate: () => void }) {
  return <>{items.map(item => (
    <NavLink key={item.to} to={item.to} {...(item.end === undefined ? {} : { end: item.end })} onClick={onNavigate} {...(collapsed ? { title: item.label } : {})}>
      <item.icon size={18} /><span>{item.label}</span>
    </NavLink>
  ))}</>;
}

function AdminSidebar(props: { collapsed: boolean; onNavigate: () => void }) {
  return <><div className="sidebar-label">ADMIN GOVERNANCE</div><NavItems {...props} items={[
    { to: '/dashboard/admin', label: 'User & role directory', icon: Users, end: true },
    { to: '/dashboard/admin/operations', label: 'Operations overview', icon: LayoutDashboard },
    { to: '/dashboard/admin/topology', label: 'Network topology', icon: Globe2 },
    { to: '/dashboard/admin/threats', label: 'Threats & stock', icon: ShieldAlert },
    { to: '/dashboard/admin/orders', label: 'Escrow & orders', icon: WalletCards },
    { to: '/dashboard/admin/inventory', label: 'Platform inventory', icon: Boxes },
    { to: '/dashboard/admin/activity', label: 'Audit activity', icon: Activity },
    { to: '/dashboard/admin/reports', label: 'Audit reports', icon: ChartNoAxesCombined },
    { to: '/dashboard/admin/account', label: 'Account', icon: Settings }
  ]} /></>;
}

function OperatorSidebar(props: { collapsed: boolean; onNavigate: () => void }) {
  return <><div className="sidebar-label">OPERATIONS CONTROL</div><NavItems {...props} items={[
    { to: '/dashboard/operator', label: 'Operations overview', icon: LayoutDashboard, end: true },
    { to: '/dashboard/operator/topology', label: 'Network topology', icon: Globe2 },
    { to: '/dashboard/operator/threats', label: 'Threats & alerts', icon: ShieldAlert },
    { to: '/dashboard/operator/orders', label: 'Escrow & orders', icon: WalletCards },
    { to: '/dashboard/operator/activity', label: 'Live activity stream', icon: Activity },
    { to: '/dashboard/operator/reports', label: 'Audit reports', icon: ChartNoAxesCombined },
    { to: '/dashboard/operator/account', label: 'Account', icon: Settings }
  ]} /></>;
}

function InventorySidebar(props: { collapsed: boolean; onNavigate: () => void }) {
  return <><div className="sidebar-label">INVENTORY OPERATIONS</div><NavItems {...props} items={[
    { to: '/dashboard/inventory', label: 'Stock control', icon: Package, end: true },
    { to: '/dashboard/inventory/alerts', label: 'Low-stock alerts', icon: ShieldAlert },
    { to: '/dashboard/inventory/adjustments', label: 'Adjustment ledger', icon: ClipboardList },
    { to: '/dashboard/inventory/warehouses', label: 'Hub allocation', icon: Warehouse },
    { to: '/dashboard/inventory/account', label: 'Account', icon: Settings }
  ]} /></>;
}

function MerchantSidebar(props: { collapsed: boolean; onNavigate: () => void }) {
  return <><div className="sidebar-label">SUPPLIER WORKSPACE</div><NavItems {...props} items={[
    { to: '/dashboard/merchant', label: 'Supplier overview', icon: LayoutDashboard, end: true },
    { to: '/dashboard/merchant/listings', label: 'My product listings', icon: Package },
    { to: '/dashboard/merchant/trust', label: 'Trust ledger', icon: BadgeCheck },
    { to: '/dashboard/merchant/account', label: 'Account', icon: Settings }
  ]} /></>;
}

function ShopperSidebar(props: { collapsed: boolean; onNavigate: () => void }) {
  return <><div className="sidebar-label">BUYER WORKSPACE</div><NavItems {...props} items={[
    { to: '/dashboard/shopper', label: 'My orders & escrow', icon: ShoppingBag, end: true },
    { to: '/dashboard/shopper/verify', label: 'Verify batch hash', icon: BadgeCheck },
    { to: '/dashboard/shopper/catalog', label: 'Catalog', icon: Package },
    { to: '/dashboard/shopper/account', label: 'Account', icon: Settings }
  ]} /></>;
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const role = user?.role as string;
  const sidebarProps = { collapsed, onNavigate: () => setMobile(false) };
  const roleTitle: Record<string, string> = {
    admin: 'Administrator', operator: 'SRE Operator', inventory_manager: 'Inventory Manager',
    merchant: 'Merchant / Supplier', shopper: 'Buyer / Shopper'
  };

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
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`, ['verifymart', `bearer.${token}`]);
      socket.onopen = () => { attempt = 0; setSocketStatus('connected'); };
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
  return <div className={`dashboard-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
    <aside className={`dashboard-sidebar ${mobile ? 'mobile-open' : ''}`}>
      <div className="dashboard-brand">
        <span className="brand-mark"><ShieldCheck size={20} /></span>
        {!collapsed && <span>VerifyMart <i>AI</i></span>}
        <button className="sidebar-close" onClick={() => setMobile(false)} aria-label="Close navigation"><X size={17} /></button>
      </div>
      <nav className="dashboard-nav" aria-label={roleTitle[role] + ' navigation'}>
        {role === 'admin' && <AdminSidebar {...sidebarProps} />}
        {role === 'operator' && <OperatorSidebar {...sidebarProps} />}
        {role === 'inventory_manager' && <InventorySidebar {...sidebarProps} />}
        {role === 'merchant' && <MerchantSidebar {...sidebarProps} />}
        {role === 'shopper' && <ShopperSidebar {...sidebarProps} />}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-telemetry"><span className="pulse-dot" />{!collapsed && <span>Simulated operations feed</span>}</div>
        <div className="sidebar-user">
          <span className="avatar">{user.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}</span>
          {!collapsed && <span><b>{user.name}</b><small>{roleTitle[role] ?? user.role}</small></span>}
          <button onClick={() => void logout().then(() => navigate('/'))} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
    <div className="dashboard-main">
      <header className="dashboard-topbar">
        <button className="dashboard-mobile-menu" onClick={() => setMobile(true)} aria-label="Open navigation"><Menu /></button>
        <button className="collapse-sidebar" onClick={() => setCollapsed(v => !v)} aria-label="Toggle sidebar">{collapsed ? '»' : '«'}</button>
        <div className="breadcrumb"><span>{roleTitle[role]}</span><b>/</b><strong>{location.pathname.split('/').filter(Boolean).slice(-1)[0]?.replaceAll('-', ' ') ?? 'Workspace'}</strong></div>
        <div className="topbar-actions">
          <span className={`live-pill ${socketStatus === 'connected' ? 'is-live' : ''}`} role="status"><i />{socketStatus === 'connected' ? 'Connected' : socketStatus === 'connecting' ? 'Connecting' : 'Reconnecting'}</span>
          <span className="topbar-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        </div>
      </header>
      <div className="dashboard-content"><Outlet /></div>
      <footer className="dashboard-footer">
        <span>VerifyMart AI · {roleTitle[role] ?? 'Workspace'}</span>
        <span>Demo estimates · Simulated escrow · No real funds movement</span>
        <a href="/api/health" target="_blank" rel="noreferrer">API status ↗</a>
      </footer>
    </div>
    {mobile && <button className="mobile-sidebar-backdrop" onClick={() => setMobile(false)} aria-label="Close sidebar" />}
  </div>;
}
