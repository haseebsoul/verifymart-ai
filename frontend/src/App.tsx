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
const DashboardLayout=lazy(()=>import('./dashboard/DashboardLayout').then(m=>({default:m.DashboardLayout})));
const OverviewPage=lazy(()=>import('./dashboard/OverviewPage').then(m=>({default:m.OverviewPage})));
const MerchantDashboardPage=lazy(()=>import('./dashboard/MerchantDashboardPage').then(m=>({default:m.MerchantDashboardPage})));
const ShopperDashboardPage=lazy(()=>import('./dashboard/ShopperDashboardPage').then(m=>({default:m.ShopperDashboardPage})));
const TopologyPage=lazy(()=>import('./dashboard/TopologyPage').then(m=>({default:m.TopologyPage})));
const ThreatsPage=lazy(()=>import('./dashboard/ThreatsPage').then(m=>({default:m.ThreatsPage})));
const ActivityPage=lazy(()=>import('./dashboard/ActivityPage').then(m=>({default:m.ActivityPage})));
const ManagePage=lazy(()=>import('./dashboard/ManagePage').then(m=>({default:m.ManagePage})));
const RewardsPage=lazy(()=>import('./dashboard/RewardsPage').then(m=>({default:m.RewardsPage})));
const ReportsPage=lazy(()=>import('./dashboard/ReportsPage').then(m=>({default:m.ReportsPage})));
const AccountPage=lazy(()=>import('./dashboard/AccountPage').then(m=>({default:m.AccountPage})));
const AdminPage=lazy(()=>import('./dashboard/AdminPage').then(m=>({default:m.AdminPage})));

const APP_ROLES=['shopper','merchant','inventory_manager','operator','admin'] as const;
type AppRole=(typeof APP_ROLES)[number];

function PublicLayout(){return <><Header/><OfflineBanner/><Outlet/><SiteFooter/><CartDrawer/></>;}

function OfflineBanner(){
  const [offline,setOffline]=useState(!navigator.onLine);
  useEffect(()=>{
    const on=()=>setOffline(false);
    const off=()=>setOffline(true);
    window.addEventListener('online',on);
    window.addEventListener('offline',off);
    return()=>{
      window.removeEventListener('online',on);
      window.removeEventListener('offline',off);
    };
  },[]);
  return offline?<div className="offline-banner" role="status">You are offline. Showing saved data where available.</div>:null;
}

/** Frontend route visibility only; every API must still enforce its own server-side role policy. */
function Protected({roles}:{roles?:readonly AppRole[]}={}){
  const {user,loading}=useAuth();
  if(loading)return <div className="route-loading"><span className="loading-mark">V</span><p>Opening your workspace…</p></div>;
  if(!user)return <Navigate to="/login?next=/dashboard" replace/>;
  const role=user.role as string;
  if(!APP_ROLES.includes(role as AppRole))return <Navigate to="/403" replace/>;
  if(roles&&!roles.includes(role as AppRole))return <Navigate to="/403" replace/>;
  return <Outlet/>;
}

function DashboardHome(){
  const {user}=useAuth();
  const role=user?.role as AppRole|undefined;
  if(role==='shopper')return <ShopperDashboardPage/>;
  if(role==='merchant')return <MerchantDashboardPage/>;
  if(role==='inventory_manager')return <ManagePage/>;
  if(role==='admin')return <AdminPage/>;
  return <OverviewPage/>;
}

function RoutedApp(){
  return <Suspense fallback={<div className="route-loading"><span className="loading-mark">V</span><p>Loading VerifyMart…</p></div>}>
    <Routes>
      <Route element={<PublicLayout/>}>
        <Route path="/" element={<HomePage/>}/>
        <Route path="/store" element={<StorePage/>}/>
        <Route path="/verify" element={<VerifyPage/>}/>
        <Route path="/login" element={<LoginPage/>}/>
        <Route path="/register" element={<LoginPage/>}/>
        <Route path="/403" element={<ForbiddenPage/>}/>
        <Route path="*" element={<NotFoundPage/>}/>
      </Route>
      <Route element={<Protected/>}>
        <Route path="/dashboard" element={<DashboardLayout/>}>
          <Route index element={<DashboardHome/>}/>
          <Route element={<Protected roles={['inventory_manager','operator','admin']}/>}>
            <Route path="topology" element={<TopologyPage/>}/>
          </Route>
          <Route element={<Protected roles={['merchant','inventory_manager','operator','admin']}/>}>
            <Route path="threats" element={<ThreatsPage/>}/>
          </Route>
          <Route element={<Protected roles={['operator','admin']}/>}>
            <Route path="activity" element={<ActivityPage/>}/>
            <Route path="reports" element={<ReportsPage/>}/>
          </Route>
          <Route element={<Protected roles={['merchant','inventory_manager','operator','admin']}/>}>
            <Route path="manage" element={<ManagePage/>}/>
          </Route>
          <Route element={<Protected roles={['merchant','operator','admin']}/>}>
            <Route path="rewards" element={<RewardsPage/>}/>
          </Route>
          <Route element={<Protected roles={APP_ROLES}/>}>
            <Route path="account" element={<AccountPage/>}/>
          </Route>
          <Route element={<Protected roles={['admin']}/>}>
            <Route path="admin" element={<AdminPage/>}/>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace/>}/>
    </Routes>
  </Suspense>;
}

export default function App(){return <BrowserRouter><ErrorBoundary><RoutedApp/></ErrorBoundary></BrowserRouter>;}
