import { lazy,Suspense,useEffect,useState } from 'react';
import { BrowserRouter,Route,Routes,Navigate,Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Header,SiteFooter } from './components/Header';
import { CartDrawer } from './components/CartDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
const HomePage=lazy(()=>import('./pages/HomePage').then(m=>({default:m.HomePage})));
const StorePage=lazy(()=>import('./pages/StorePage').then(m=>({default:m.StorePage})));
const VerifyPage=lazy(()=>import('./pages/VerifyPage').then(m=>({default:m.VerifyPage})));
const LoginPage=lazy(()=>import('./pages/LoginPage').then(m=>({default:m.LoginPage})));
const NotFoundPage=lazy(()=>import('./pages/SystemPages').then(m=>({default:m.NotFoundPage})));
const ForbiddenPage=lazy(()=>import('./pages/SystemPages').then(m=>({default:m.ForbiddenPage})));
const ShopperDashboardLayout=lazy(()=>import('./dashboard/DashboardLayout').then(m=>({default:m.ShopperDashboardLayout})));
const MerchantDashboardLayout=lazy(()=>import('./dashboard/DashboardLayout').then(m=>({default:m.MerchantDashboardLayout})));
const InventoryManagerDashboardLayout=lazy(()=>import('./dashboard/DashboardLayout').then(m=>({default:m.InventoryManagerDashboardLayout})));
const OperatorDashboardLayout=lazy(()=>import('./dashboard/DashboardLayout').then(m=>({default:m.OperatorDashboardLayout})));
const AdminDashboardLayout=lazy(()=>import('./dashboard/DashboardLayout').then(m=>({default:m.AdminDashboardLayout})));
const OverviewPage=lazy(()=>import('./dashboard/OverviewPage').then(m=>({default:m.OverviewPage})));
const MerchantDashboardPage=lazy(()=>import('./dashboard/MerchantDashboardPage').then(m=>({default:m.MerchantDashboardPage})));;
const ShopperDashboardPage=lazy(()=>import('./dashboard/ShopperDashboardPage').then(m=>({default:m.ShopperDashboardPage})));
const TopologyPage=lazy(()=>import('./dashboard/TopologyPage').then(m=>({default:m.TopologyPage})));
const ThreatsPage=lazy(()=>import('./dashboard/ThreatsPage').then(m=>({default:m.ThreatsPage})));
const ActivityPage=lazy(()=>import('./dashboard/ActivityPage').then(m=>({default:m.ActivityPage})));
const ManagePage=lazy(()=>import('./dashboard/ManagePage').then(m=>({default:m.ManagePage})));
const RewardsPage=lazy(()=>import('./dashboard/RewardsPage').then(m=>({default:m.RewardsPage})));
const ReportsPage=lazy(()=>import('./dashboard/ReportsPage').then(m=>({default:m.ReportsPage})));
const AccountPage=lazy(()=>import('./dashboard/AccountPage').then(m=>({default:m.AccountPage})));
const AdminPage=lazy(()=>import('./dashboard/AdminPage').then(m=>({default:m.AdminPage})));
const EscrowOrdersPage=lazy(()=>import('./dashboard/EscrowOrdersPage').then(m=>({default:m.EscrowOrdersPage})));
const InventoryAdjustmentsPage=lazy(()=>import('./dashboard/InventoryAdjustmentsPage').then(m=>({default:m.InventoryAdjustmentsPage})));
function PublicLayout(){return <><Header/><OfflineBanner/><Outlet/><SiteFooter/><CartDrawer/></>;}
function OfflineBanner(){const [offline,setOffline]=useState(!navigator.onLine);useEffect(()=>{const on=()=>setOffline(false);const off=()=>setOffline(true);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};},[]);return offline?<div className="offline-banner" role="status">You are offline. Showing saved data where available.</div>:null;}
function Protected({allowedRoles}:{allowedRoles?:string[]}){const {user,loading}=useAuth();if(loading)return <div className="route-loading"><span className="loading-mark">V</span><p>Opening your workspace…</p></div>;if(!user)return <Navigate to="/login?next=/dashboard" replace/>;const role=user.role as string;if(!['shopper','merchant','inventory_manager','operator','admin'].includes(role))return <Navigate to="/403" replace/>;if(allowedRoles&&!allowedRoles.includes(role))return <Navigate to="/403" replace/>;return <Outlet/>;}
function DashboardEntry(){const {user}=useAuth();const destinations:Record<string,string>={shopper:'/dashboard/shopper',merchant:'/dashboard/merchant',inventory_manager:'/dashboard/inventory',operator:'/dashboard/operator',admin:'/dashboard/admin'};return <Navigate to={destinations[user?.role??'']??'/403'} replace/>;}
function LegacyDashboardRedirect(){const {user}=useAuth();const path=window.location.pathname;const role=user?.role??'shopper';const base:Record<string,string>={shopper:'/dashboard/shopper',merchant:'/dashboard/merchant',inventory_manager:'/dashboard/inventory',operator:'/dashboard/operator',admin:'/dashboard/admin'};const suffixMap:Record<string,string>={topology:role==='inventory_manager'?'/hubs':'/topology',threats:'/threats',activity:'/activity',manage:role==='merchant'?'/listings':'/inventory',rewards:'/trust',reports:'/reports',account:'/account'};const suffix=path.split('/').pop()??'';return <Navigate to={(base[role]??'/dashboard')+(suffixMap[suffix]??'')} replace/>;}
function RoutedApp(){return <Suspense fallback={<div className="route-loading"><span className="loading-mark">V</span><p>Loading VerifyMart…</p></div>}><Routes><Route element={<PublicLayout/>}><Route path="/" element={<HomePage/>}/><Route path="/store" element={<StorePage/>}/><Route path="/verify" element={<VerifyPage/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/register" element={<LoginPage/>}/><Route path="/403" element={<ForbiddenPage/>}/><Route path="*" element={<NotFoundPage/>}/></Route><Route element={<Protected/>}>
<Route path="/dashboard" element={<DashboardEntry/>}/>
<Route path="/dashboard/shopper" element={<Protected allowedRoles={['shopper']}/>}>
  <Route element={<ShopperDashboardLayout/>}><Route index element={<ShopperDashboardPage/>}/><Route path="account" element={<AccountPage/>}/></Route>
</Route>
<Route path="/dashboard/merchant" element={<Protected allowedRoles={['merchant']}/>}>
  <Route element={<MerchantDashboardLayout/>}><Route index element={<MerchantDashboardPage/>}/><Route path="listings" element={<ManagePage/>}/><Route path="threats" element={<ThreatsPage/>}/><Route path="trust" element={<RewardsPage/>}/><Route path="account" element={<AccountPage/>}/></Route>
</Route>
<Route path="/dashboard/inventory" element={<Protected allowedRoles={['inventory_manager']}/>}>
  <Route element={<InventoryManagerDashboardLayout/>}><Route index element={<ManagePage/>}/><Route path="hubs" element={<TopologyPage/>}/><Route path="adjustments" element={<InventoryAdjustmentsPage/>}/><Route path="threats" element={<ThreatsPage/>}/><Route path="account" element={<AccountPage/>}/></Route>
</Route>
<Route path="/dashboard/operator" element={<Protected allowedRoles={['operator']}/>}>
  <Route element={<OperatorDashboardLayout/>}><Route index element={<OverviewPage/>}/><Route path="topology" element={<TopologyPage/>}/><Route path="threats" element={<ThreatsPage/>}/><Route path="orders" element={<OverviewPage/>}/><Route path="activity" element={<ActivityPage/>}/><Route path="reports" element={<ReportsPage/>}/><Route path="account" element={<AccountPage/>}/></Route>
</Route>
<Route path="/dashboard/admin" element={<Protected allowedRoles={['admin']}/>}>
  <Route element={<AdminDashboardLayout/>}><Route index element={<AdminPage/>}/><Route path="users" element={<AdminPage/>}/><Route path="merchants" element={<AdminPage/>}/><Route path="inventory" element={<ManagePage/>}/><Route path="orders" element={<EscrowOrdersPage/>}/><Route path="tariffs" element={<TopologyPage/>}/><Route path="activity" element={<ActivityPage/>}/><Route path="settings" element={<AccountPage/>}/></Route>
</Route>
<Route path="/dashboard/:legacy" element={<LegacyDashboardRedirect/>}/>
</Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Suspense>;}
export default function App(){return <BrowserRouter><ErrorBoundary><RoutedApp/></ErrorBoundary></BrowserRouter>;}
