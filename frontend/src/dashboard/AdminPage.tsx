import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { AlertTriangle,Check,Shield,Trash2,UserCog,Users } from 'lucide-react';
import { ATLAS_ROLES,type AtlasRole } from '@verifymart/shared';import { api } from '../lib/api';import { useAuth } from '../context/AuthContext';import { ReferenceDataAdminSection } from './ReferenceDataAdminSection';
type AdminUser={id:string;name:string;email:string;role:AtlasRole;lastLogin:string|null;createdAt:string;disabledAt?:string|null};
type AdminMerchant={_id:string;businessName:string;country:string;status:'pending'|'approved'|'rejected';userId:string};
type AdminProduct={id:string;sku:string;name:string;brand:string;listingStatus:'draft'|'published'|'archived';merchantId:string|null};
export function AdminPage(){
  const client=useQueryClient();const {user}=useAuth();
  const {data,isLoading}=useQuery({queryKey:['admin-users'],queryFn:()=>api<{users:AdminUser[]}>('/admin/users')});
  const {data:merchantData}=useQuery({queryKey:['admin-merchants'],queryFn:()=>api<{merchants:AdminMerchant[]}>('/admin/merchants?status=pending')});
  const {data:productData}=useQuery({queryKey:['admin-products'],queryFn:()=>api<{products:AdminProduct[]}>('/admin/products')});
  const [selected,setSelected]=useState<AdminUser|null>(null);const [confirmEmail,setConfirmEmail]=useState('');const [busy,setBusy]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');
  const [merchantReasons,setMerchantReasons]=useState<Record<string,string>>({});
  const [listingReasons,setListingReasons]=useState<Record<string,string>>({});
  const merchants=merchantData?.merchants??[];const products=productData?.products??[];
  const decideMerchant=async(merchant:AdminMerchant,decision:'approved'|'rejected')=>{
    const reason=merchantReasons[merchant._id]?.trim()??'';
    if(reason.length<4){setError('Enter a reason of at least four characters for this merchant decision.');return;}
    setBusy(merchant._id);setError('');setMessage('');
    try{await api(`/admin/merchants/${merchant._id}/decision`,{method:'POST',body:JSON.stringify({decision,reason})});setMessage(`${merchant.businessName} was ${decision}.`);await Promise.all([client.invalidateQueries({queryKey:['admin-merchants']}),client.invalidateQueries({queryKey:['admin-products']})]);}
    catch(e){setError(e instanceof Error?e.message:'Merchant decision failed.');}
    finally{setBusy('');}
  };
  const setListingState=async(product:AdminProduct,listingStatus:'published'|'archived')=>{
    const reason=listingReasons[product.id]?.trim()??'';
    if(reason.length<4){setError('Enter a reason of at least four characters for listing moderation.');return;}
    setBusy(product.id);setError('');setMessage('');
    try{await api(`/admin/products/${product.id}/listing`,{method:'PATCH',body:JSON.stringify({listingStatus,reason})});setMessage(`${product.sku} listing is now ${listingStatus}.`);await client.invalidateQueries({queryKey:['admin-products']});}
    catch(e){setError(e instanceof Error?e.message:'Listing update failed.');}
    finally{setBusy('');}
  };
  const changeRole=async(target:AdminUser,role:AtlasRole)=>{setBusy(target.id);setError('');setMessage('');try{await api(`/admin/users/${target.id}/role`,{method:'PATCH',body:JSON.stringify({role})});setMessage(`Role updated for ${target.email}.`);await client.invalidateQueries({queryKey:['admin-users']});}catch(e){setError(e instanceof Error?e.message:'Role update failed.');}finally{setBusy('');}};
  const remove=async()=>{if(!selected)return;setBusy(selected.id);setError('');try{await api(`/admin/users/${selected.id}`,{method:'DELETE',body:JSON.stringify({email:confirmEmail})});setMessage(`${selected.email} was disabled; order and audit history were preserved.`);setSelected(null);setConfirmEmail('');await client.invalidateQueries({queryKey:['admin-users']});}catch(e){setError(e instanceof Error?e.message:'Account disable failed.');}finally{setBusy('');}};
  return <div className="dashboard-page"><div className="dashboard-page-heading"><div><span className="eyebrow">ADMINISTRATION / ACCESS CONTROL</span><h1>People & <em>permissions.</em></h1><p>Manage account roles and remove users with explicit two-step confirmation.</p></div><span className="mini-tag"><Shield size={15}/> Admin only</span></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="success-message">{message}</p>}
    <section className="panel admin-users-panel"><div className="panel-heading"><div><span className="eyebrow">REGISTERED ACCOUNTS</span><h2>User directory</h2></div><span className="mini-tag"><Users size={14}/> {data?.users.length??0} users</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>User</th><th>Role</th><th>Last login</th><th>Access actions</th></tr></thead><tbody>{data?.users.map(person=><tr key={person.id}><td><b>{person.name}</b><small>{person.email}</small></td><td><span className={`role-chip role-${person.role}`}>{person.role}</span>{person.disabledAt&&<small>Disabled</small>}</td><td>{person.lastLogin?new Date(person.lastLogin).toLocaleString():'Never'}</td><td>{person.id===user?.id?<span className="self-protected"><Shield size={14}/> Your account</span>:<div className="admin-actions"><select value={person.role} disabled={busy===person.id||!!person.disabledAt} onChange={e=>void changeRole(person,e.target.value as AtlasRole)} aria-label={`Role for ${person.email}`}>{ATLAS_ROLES.map(role=><option value={role} key={role}>{role}</option>)}</select><button className="delete-user" onClick={()=>{setSelected(person);setConfirmEmail('');setError('');}} aria-label={`Disable ${person.email}`}><Trash2 size={16}/></button></div>}</td></tr>)}</tbody></table>{!data?.users.length&&!isLoading&&<div className="empty-table">No users were found.</div>}</div></section>

    <section className="panel admin-users-panel">
      <div className="panel-heading"><div><span className="eyebrow">MERCHANT ONBOARDING</span><h2>Pending merchant applications</h2></div><span className="mini-tag">{merchants.length} pending</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Business</th><th>Country</th><th>Applicant</th><th>Decision reason</th><th>Actions</th></tr></thead><tbody>
      {merchants.map(merchant=><tr key={merchant._id}><td><b>{merchant.businessName}</b></td><td>{merchant.country}</td><td>{merchant.userId}</td><td><input value={merchantReasons[merchant._id]??''} onChange={e=>setMerchantReasons(v=>({...v,[merchant._id]:e.target.value}))} placeholder="Reason required" aria-label={`Decision reason for ${merchant.businessName}`}/></td><td><div className="admin-actions"><button className="button button-primary" disabled={!!busy} onClick={()=>void decideMerchant(merchant,'approved')}><Check size={14}/> Approve</button><button className="button button-outline" disabled={!!busy} onClick={()=>void decideMerchant(merchant,'rejected')}>Reject</button></div></td></tr>)}
      {!merchants.length&&<tr><td colSpan={5} className="empty-table">No pending merchant applications.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="panel admin-users-panel">
      <div className="panel-heading"><div><span className="eyebrow">CATALOG GOVERNANCE</span><h2>Listing moderation</h2></div><span className="mini-tag">{products.length} products</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>Merchant</th><th>Visibility</th><th>Reason</th><th>Action</th></tr></thead><tbody>
      {products.filter(product=>product.merchantId!==null).map(product=><tr key={product.id}><td><b>{product.name}</b><small>{product.sku} · {product.brand}</small></td><td>{product.merchantId}</td><td>{product.listingStatus}</td><td><input value={listingReasons[product.id]??''} onChange={e=>setListingReasons(v=>({...v,[product.id]:e.target.value}))} placeholder="Reason required" aria-label={`Moderation reason for ${product.sku}`}/></td><td><button className="button button-outline" disabled={!!busy||product.listingStatus==='archived'} onClick={()=>void setListingState(product,'archived')}>Archive</button>{product.listingStatus!=='published'&&<button className="button button-primary" disabled={!!busy} onClick={()=>void setListingState(product,'published')}>Publish</button>}</td></tr>)}
      {!products.some(product=>product.merchantId!==null)&&<tr><td colSpan={5} className="empty-table">No merchant listings submitted.</td></tr>}
      </tbody></table></div>
    </section>
    <ReferenceDataAdminSection/>
    {selected&&<div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="modal-warning"><AlertTriangle size={22}/></div><span className="eyebrow">TWO-STEP CONFIRMATION</span><h2 id="confirm-title">Disable this account?</h2><p>This disables <b>{selected.name}</b> and revokes its sessions. Orders, financial history and audit records are preserved.</p><label>Type the user's email to continue<input value={confirmEmail} onChange={e=>setConfirmEmail(e.target.value)} placeholder={selected.email}/></label><div className="modal-actions"><button className="button button-outline" onClick={()=>setSelected(null)}>Cancel</button><button className="button button-danger" disabled={confirmEmail.toLowerCase()!==selected.email.toLowerCase()||!!busy} onClick={()=>void remove()}>{busy?'Disabling…':'Confirm disable'}</button></div></section></div>}
    <div className="dashboard-inline-note"><UserCog size={17}/> Your own role and account-disable actions are disabled by policy. Every role change and account disable is recorded in the append-only audit log.</div>
  </div>;
}
