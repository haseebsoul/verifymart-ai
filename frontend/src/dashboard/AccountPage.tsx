import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity,Check,ClipboardCopy,Globe,LogOut,RefreshCw,ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';import { api,apiBaseUrl } from '../lib/api';
export function AccountPage(){
  const {user,logout,refreshUser}=useAuth();const navigate=useNavigate();const [busy,setBusy]=useState(false);const [result,setResult]=useState<{min:number;average:number;max:number}|null>(null);const [copied,setCopied]=useState(false);const [error,setError]=useState('');const [feedback,setFeedback]=useState('');const [name,setName]=useState(user?.name??'');const [email,setEmail]=useState(user?.email??'');const [currentPassword,setCurrentPassword]=useState('');const [newPassword,setNewPassword]=useState('');const [savingProfile,setSavingProfile]=useState(false);const [savingPassword,setSavingPassword]=useState(false);
  const saveProfile=async(event:React.FormEvent)=>{
    event.preventDefault();setSavingProfile(true);setError('');setFeedback('');
    try{
      await api('/auth/me',{method:'PATCH',body:JSON.stringify({name,email})});
      await refreshUser();setFeedback('Account profile updated.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Profile could not be updated.');}
    finally{setSavingProfile(false);}
  };
  const changePassword=async(event:React.FormEvent)=>{
    event.preventDefault();setSavingPassword(true);setError('');setFeedback('');
    try{
      await api('/auth/password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
      await refreshUser();setCurrentPassword('');setNewPassword('');setFeedback('Password changed. Other refresh sessions were revoked.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Password could not be changed.');}
    finally{setSavingPassword(false);}
  };
  const test=async()=>{setBusy(true);setError('');const durations:number[]=[];try{for(let i=0;i<5;i++){const start=performance.now();await api('/health');durations.push(performance.now()-start);}setResult({min:Math.round(Math.min(...durations)),average:Math.round(durations.reduce((a,b)=>a+b,0)/durations.length),max:Math.round(Math.max(...durations))});}catch(e){setError(e instanceof Error?e.message:'API health test failed.');}finally{setBusy(false);}};
  return <div className="dashboard-page"><div className="dashboard-page-heading"><div><span className="eyebrow">PROFILE / CONNECTION HEALTH</span><h1>Your <em>workspace.</em></h1><p>Account identity, API endpoint and live service round-trip measurements.</p></div></div>
    <section className="account-profile panel"><div className="account-avatar">{user?.name.slice(0,1).toUpperCase()}</div><div><span className="eyebrow">SIGNED-IN USER</span><h2>{user?.name}</h2><p>{user?.email}</p><span className="role-chip">{user?.role}</span></div><ShieldCheck className="account-verified"/></section>
    {feedback&&<p className="success-message" role="status">{feedback}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">PROFILE SETTINGS</span><h2>Update account details</h2></div></div>
      <form className="merchant-listing-form" onSubmit={saveProfile}>
        <label>Full name<input required minLength={2} maxLength={80} value={name} onChange={event=>setName(event.target.value)}/></label>
        <label>Email address<input required type="email" maxLength={254} value={email} onChange={event=>setEmail(event.target.value)}/></label>
        <button className="button button-primary" disabled={savingProfile}>{savingProfile?'Saving…':'Save profile'}</button>
      </form>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">SESSION SECURITY</span><h2>Change password</h2></div></div>
      <form className="merchant-listing-form" onSubmit={changePassword}>
        <label>Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)}/></label>
        <label>New password (10+ characters)<input required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></label>
        <button className="button button-primary" disabled={savingPassword}>{savingPassword?'Updating…':'Change password'}</button>
      </form>
      <p className="dashboard-inline-note">Changing your password revokes other refresh sessions and keeps this browser signed in with a new session.</p>
    </section>
    <section className="panel connection-panel"><div className="panel-heading"><div><span className="eyebrow">API LATENCY TEST</span><h2>Test your connection</h2></div><Globe/></div><p>Five sequential requests to <code>/api/health</code>, measuring browser round-trip time.</p><button className="button button-primary" onClick={()=>void test()} disabled={busy}>{busy?'Measuring…':'Run five checks'} <RefreshCw size={16}/></button>{error&&<p className="form-error">{error}</p>}{result&&<div className="latency-results"><div><span>Minimum</span><b>{result.min} ms</b></div><div><span>Average</span><b>{result.average} ms</b></div><div><span>Maximum</span><b>{result.max} ms</b></div></div>}</section>
    <section className="panel api-url-panel"><div><span className="eyebrow">API BASE URL</span><h2>Developer endpoint</h2></div><div className="copy-url"><code>{apiBaseUrl()}</code><button className="button button-outline" onClick={()=>{void navigator.clipboard.writeText(apiBaseUrl());setCopied(true);}}>{copied?<Check size={16}/>:<ClipboardCopy size={16}/>} {copied?'Copied':'Copy URL'}</button></div></section>
    <button className="button button-outline signout-button" onClick={()=>void logout().then(()=>navigate('/'))}><LogOut size={16}/> Sign out of VerifyMart</button>
    <div className="dashboard-inline-note"><Activity size={17}/> Prototype target: 99.5% API availability. This console's health check measures the API process and database readiness, not an independently monitored production SLA.</div>
  </div>;
}
