import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, Boxes, ChartNoAxesCombined, Globe2, LayoutDashboard, LogOut,
  Menu, Settings, ShieldAlert, ShieldCheck, Users, WalletCards, X
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccessToken } from '../lib/api';

type WorkspaceRole = 'shopper' | 'merchant' | 'inventory_manager' | 'operator' | 'admin';
type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
const shopperBase='/dashboard/shopper';
const merchantBase='/dashboard/merchant';
const inventoryBase='/dashboard/inventory';
const operatorBase='/dashboard/operator';
const adminBase='/dashboard/admin';

const shopperNav:NavItem[]=[
  {to:shopperBase,label:'My orders',icon:LayoutDashboard,end:true},
  {to:shopperBase+'/account',label:'Account',icon:Boxes}
];
const merchantNav:NavItem[]=[
  {to:merchantBase,label:'Business overview',icon:LayoutDashboard,end:true},
  {to:merchantBase+'/listings',label:'My inventory',icon:Boxes},
  {to:merchantBase+'/threats',label:'My SKU threats',icon:ShieldAlert},
  {to:merchantBase+'/trust',label:'Trust ledger',icon:WalletCards},
  {to:merchantBase+'/account',label:'Account',icon:Settings}
];
const inventoryNav:NavItem[]=[
  {to:inventoryBase,label:'Inventory',icon:LayoutDashboard,end:true},
  {to:inventoryBase+'/hubs',label:'Hubs & stock map',icon:Globe2},
  {to:inventoryBase+'/threats',label:'Threat visibility',icon:ShieldAlert},
  {to:inventoryBase+'/adjustments',label:'Adjustment ledger',icon:Boxes},
  {to:inventoryBase+'/account',label:'Account',icon:Boxes}
];
const operatorNav:NavItem[]=[
  {to:operatorBase,label:'Operations overview',icon:LayoutDashboard,end:true},
  {to:operatorBase+'/topology',label:'Network topology',icon:Globe2},
  {to:operatorBase+'/threats',label:'Threat response',icon:ShieldAlert},
  {to:operatorBase+'/orders',label:'Orders & escrow',icon:WalletCards},
  {to:operatorBase+'/activity',label:'Audit activity',icon:Activity},
  {to:operatorBase+'/reports',label:'Reports',icon:ChartNoAxesCombined},
  {to:operatorBase+'/account',label:'Account',icon:Boxes}
];
const adminNav:NavItem[]=[
  {to:adminBase,label:'Administration',icon:LayoutDashboard,end:true},
  {to:adminBase+'/users',label:'People & roles',icon:Users},
  {to:adminBase+'/merchants',label:'Supplier approvals',icon:ShieldCheck},
  {to:adminBase+'/inventory',label:'Listings & stock',icon:Boxes},
  {to:adminBase+'/orders',label:'Escrow & orders',icon:WalletCards},
  {to:adminBase+'/tariffs',label:'Hubs & tariffs',icon:Globe2},
  {to:adminBase+'/activity',label:'Audit activity',icon:Activity},
  {to:adminBase+'/settings',label:'Workspace settings',icon:Settings}
];

function useWorkspaceSocket(userId:string|undefined, setStatus:(status:'connecting'|'connected'|'reconnecting')=>void) {
  useEffect(()=>{
    if(!userId)return;
    let stopped=false;let retry:number|undefined;let socket:WebSocket|undefined;let attempt=0;
    const connect=()=>{
      const token=getAccessToken();
      if(!token){setStatus('reconnecting');retry=window.setTimeout(connect,1500);return;}
      const protocol=window.location.protocol==='https:'?'wss:':'ws:';
      socket=new WebSocket(`${protocol}//${window.location.host}/ws`,['verifymart',`bearer.${token}`]);
      socket.onopen=()=>{attempt=0;setStatus('connected');};
      socket.onclose=()=>{setStatus('reconnecting');if(!stopped)retry=window.setTimeout(connect,Math.min(8000,1000*2**attempt++));};
      socket.onerror=()=>setStatus('reconnecting');
    };
    connect();
    return()=>{stopped=true;if(retry!==undefined)window.clearTimeout(retry);socket?.close();};
  },[userId,setStatus]);
}

function WorkspaceFrame({role,title,navigation,children}:{role:WorkspaceRole;title:string;navigation:NavItem[];children?:ReactNode}) {
  const {user,logout}=useAuth();const navigate=useNavigate();const location=useLocation();
  const [socketStatus,setSocketStatus]=useState<'connecting'|'connected'|'reconnecting'>('connecting');
  const [collapsed,setCollapsed]=useState(false);const [mobile,setMobile]=useState(false);
  useWorkspaceSocket(user?.id,setSocketStatus);
  if(!user)return null;
  if(user.role!==role)return <Navigate to="/403" replace/>;
  return <div className={`dashboard-shell dashboard-shell-${role} ${collapsed?'sidebar-collapsed':''}`}>
    <aside className={`dashboard-sidebar dashboard-sidebar-${role} ${mobile?'mobile-open':''}`}>
      <div className="dashboard-brand"><span className="brand-mark"><ShieldCheck size={20}/></span>{!collapsed&&<span>VerifyMart <i>AI</i></span>}<button className="sidebar-close" onClick={()=>setMobile(false)} aria-label="Close navigation"><X size={17}/></button></div>
      <div className="sidebar-label">{title.toUpperCase()}</div>
      <nav className="dashboard-nav">
        {navigation.map(item=><NavLink key={item.to} to={item.to} {...(item.end === undefined ? {} : {end:item.end})} onClick={()=>setMobile(false)} {...(collapsed ? {title:item.label} : {})}><item.icon size={18}/><span>{item.label}</span></NavLink>)}
        {role==='admin'&&<><div className="sidebar-label admin-label">GOVERNANCE</div><NavLink to={adminBase+'/users'} onClick={()=>setMobile(false)}><Users size={18}/><span>People & roles</span></NavLink></>}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-telemetry"><span className="pulse-dot"/>{!collapsed&&<span>Prototype / demo feed</span>}</div><div className="sidebar-user"><span className="avatar">{user.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</span>{!collapsed&&<span><b>{user.name}</b><small>{title}</small></span>}<button onClick={()=>void logout().then(()=>navigate('/'))} aria-label="Sign out" title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <div className="dashboard-main">
      <header className="dashboard-topbar"><button className="dashboard-mobile-menu" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu/></button><button className="collapse-sidebar" onClick={()=>setCollapsed(v=>!v)} aria-label="Toggle sidebar">{collapsed?'»':'«'}</button><div className="breadcrumb"><span>{title}</span><b>/</b><strong>{navigation.find(n=>location.pathname===n.to)?.label??'Workspace'}</strong></div><div className="topbar-actions"><span className={`live-pill ${socketStatus==='connected'?'is-live':''}`} role="status"><i/> {socketStatus==='connected'?'Connected':socketStatus==='connecting'?'Connecting':'Reconnecting'}</span><span className="topbar-avatar">{user.name.slice(0,1).toUpperCase()}</span></div></header>
      <div className="dashboard-content">{children??<Outlet/>}</div>
      <footer className="dashboard-footer"><span>VerifyMart AI · {title}</span><span>Demo records · No real funds or customs determinations</span><a href="/api/health" target="_blank" rel="noreferrer">API status ↗</a></footer>
    </div>
    {mobile&&<button className="mobile-sidebar-backdrop" onClick={()=>setMobile(false)} aria-label="Close sidebar"/>}
  </div>;
}

export function ShopperDashboardLayout(){return <WorkspaceFrame role="shopper" title="Shopper workspace" navigation={shopperNav}/>;}
export function MerchantDashboardLayout(){return <WorkspaceFrame role="merchant" title="Merchant workspace" navigation={merchantNav}/>;}
export function InventoryManagerDashboardLayout(){return <WorkspaceFrame role="inventory_manager" title="Inventory workspace" navigation={inventoryNav}/>;}
export function OperatorDashboardLayout(){return <WorkspaceFrame role="operator" title="Operations console" navigation={operatorNav}/>;}
export function AdminDashboardLayout(){return <WorkspaceFrame role="admin" title="Administration" navigation={adminNav}/>;}
