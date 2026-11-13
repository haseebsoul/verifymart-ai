import { NavLink,Outlet,useNavigate } from 'react-router-dom';
import { Activity,ArrowLeft,BarChart3,Boxes,ChartNoAxesCombined,ChevronDown,Globe2,LayoutDashboard,LogOut,Menu,Settings,ShieldAlert,ShieldCheck,Users,WalletCards,X } from 'lucide-react';
import { useEffect,useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAccessToken } from '../lib/api';
const nav=[
  {to:'/dashboard',label:'Overview',icon:LayoutDashboard,end:true},
  {to:'/dashboard/topology',label:'Network topology',icon:Globe2},
  {to:'/dashboard/threats',label:'Threats & stock',icon:ShieldAlert},
  {to:'/dashboard/activity',label:'Live activity',icon:Activity},
  {to:'/dashboard/manage',label:'Manage',icon:Settings},
  {to:'/dashboard/rewards',label:'Merchant rewards',icon:WalletCards},
  {to:'/dashboard/reports',label:'Reports',icon:ChartNoAxesCombined},
  {to:'/dashboard/account',label:'Account',icon:Boxes}
];
export function DashboardLayout(){
  const {user,logout}=useAuth();const navigate=useNavigate();const [socketStatus,setSocketStatus]=useState<'connecting'|'live'|'reconnecting'>('connecting');const [collapsed,setCollapsed]=useState(false);const [mobile,setMobile]=useState(false);
  useEffect(()=>{if(!user)return;let stopped=false;let retry:number|undefined;let socket:WebSocket|undefined;let attempt=0;const connect=()=>{const token=getAccessToken();if(!token){setSocketStatus('reconnecting');retry=window.setTimeout(connect,1500);return;}const protocol=window.location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(`${protocol}//${window.location.host}/ws/telemetry?token=${encodeURIComponent(token)}`);socket.onopen=()=>{attempt=0;setSocketStatus('live');};socket.onclose=()=>{setSocketStatus('reconnecting');if(!stopped)retry=window.setTimeout(connect,Math.min(8000,1000*2**attempt++));};socket.onerror=()=>setSocketStatus('reconnecting');};connect();return()=>{stopped=true;if(retry!==undefined)window.clearTimeout(retry);socket?.close();};},[user?.id]);
  if(!user)return null;
  return <div className={`dashboard-shell ${collapsed?'sidebar-collapsed':''}`}>
    <aside className={`dashboard-sidebar ${mobile?'mobile-open':''}`}><div className="dashboard-brand"><span className="brand-mark"><ShieldCheck size={20}/></span>{!collapsed&&<span>VerifyMart <i>AI</i></span>}<button className="sidebar-close" onClick={()=>setMobile(false)} aria-label="Close navigation"><X size={17}/></button></div>
      <div className="sidebar-label">WORKSPACE</div><nav className="dashboard-nav">{nav.map(item=><NavLink key={item.to} to={item.to} end={item.end} onClick={()=>setMobile(false)} title={collapsed?item.label:undefined}><item.icon size={18}/><span>{item.label}</span></NavLink>)}{user.role==='admin'&&<><div className="sidebar-label admin-label">ADMINISTRATION</div><NavLink to="/dashboard/admin" onClick={()=>setMobile(false)}><Users size={18}/><span>User management</span></NavLink></>}</nav>
      <div className="sidebar-bottom"><div className="sidebar-telemetry"><span className="pulse-dot"/>{!collapsed&&<span>Simulated telemetry</span>}</div><div className="sidebar-user"><span className="avatar">{user.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</span>{!collapsed&&<span><b>{user.name}</b><small>{user.role}</small></span>}<button onClick={()=>void logout().then(()=>navigate('/'))} aria-label="Sign out" title="Sign out"><LogOut size={16}/></button></div></div>
    </aside>
    <div className="dashboard-main"><header className="dashboard-topbar"><button className="dashboard-mobile-menu" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu/></button><button className="collapse-sidebar" onClick={()=>setCollapsed(v=>!v)} aria-label="Toggle sidebar">{collapsed?'»':'«'}</button><div className="breadcrumb"><span>Workspace</span><b>/</b><strong>{nav.find(n=>location.pathname===n.to)?.label??(location.pathname.includes('admin')?'User management':'Operations')}</strong></div><div className="topbar-actions"><span className={`live-pill ${socketStatus==='live'?'is-live':''}`} role="status"><i/> {socketStatus==='live'?'Live':socketStatus==='connecting'?'Connecting':'Reconnecting'}</span><span className="topbar-avatar">{user.name.slice(0,1).toUpperCase()}</span></div></header><div className="dashboard-content"><Outlet/></div><footer className="dashboard-footer"><span>VerifyMart AI · Ops center</span><span>Prototype data · No real funds or customs declarations</span><a href="/api/health" target="_blank" rel="noreferrer">API status ↗</a></footer></div>
    {mobile&&<button className="mobile-sidebar-backdrop" onClick={()=>setMobile(false)} aria-label="Close sidebar"/>}
  </div>;
}
