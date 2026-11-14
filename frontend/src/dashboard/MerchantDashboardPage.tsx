import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { BadgeCheck,Building2,ClipboardList,PackagePlus,ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';

type MerchantProfile={_id:string;businessName:string;country:string;status:'pending'|'approved'|'rejected';trustScore:number;rejectionReason?:string};
type Listing={id:string;_id?:string;sku:string;name:string;brand:string;category:string;priceUsd?:number;stock:number;status:string;listingStatus:'draft'|'published'|'archived'};
type MerchantOrder={id:string;destination:string;total:number;state:string;createdAt:string;items:Array<{sku:string;name:string;quantity:number}>};
type Threat={id:string;type:string;sku:string;severity:string};

export function MerchantDashboardPage(){
  const client=useQueryClient();
  const {data:profileData,isLoading:profileLoading}=useQuery({queryKey:['merchant-me'],queryFn:()=>api<{merchant:MerchantProfile}>('/merchant/me')});
  const {data:listingsData}=useQuery({queryKey:['merchant-listings'],queryFn:()=>api<{products:Listing[]}>('/merchant/listings')});
  const {data:ordersData}=useQuery({queryKey:['orders'],queryFn:()=>api<{orders:MerchantOrder[]}>('/orders')});
  const {data:threatsData}=useQuery({queryKey:['threats'],queryFn:()=>api<{threats:Threat[]}>('/threats')});
  const [form,setForm]=useState({sku:'',batchReference:'',name:'',brand:'',category:'Audio and Studio',hsCode:'',priceUsd:'',stock:'0',reorderThreshold:'5',originHubCode:'HUB-KHI',slaHours:'48',imageUrl:''});
  const [busy,setBusy]=useState(false);const [feedback,setFeedback]=useState('');const [error,setError]=useState('');
  const merchant=profileData?.merchant;
  const listings=listingsData?.products??[];
  const orders=ordersData?.orders??[];
  const threats=threatsData?.threats??[];
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy(true);setError('');setFeedback('');
    try{
      await api('/merchant/listings',{method:'POST',body:JSON.stringify({
        sku:form.sku,batchReference:form.batchReference,name:form.name,brand:form.brand,
        category:form.category,hsCode:form.hsCode,priceCents:Math.round(Number(form.priceUsd)*100),
        stock:Number(form.stock),reorderThreshold:Number(form.reorderThreshold),
        originHubCode:form.originHubCode,slaHours:Number(form.slaHours),
        ...(form.imageUrl?{imageUrl:form.imageUrl}:{})
      })});
      setForm(v=>({...v,sku:'',batchReference:'',name:'',brand:'',hsCode:'',priceUsd:'',stock:'0',imageUrl:''}));
      setFeedback('Listing saved. It remains a private draft until an administrator approves the merchant application.');
      await client.invalidateQueries({queryKey:['merchant-listings']});
    }catch(e){setError(e instanceof Error?e.message:'Listing could not be created.');}
    finally{setBusy(false);}
  };
  if(profileLoading)return <div className="skeleton threat-skeleton"/>;
  return <div className="dashboard-page">
    <div className="dashboard-page-heading"><div><span className="eyebrow">MERCHANT WORKSPACE</span><h1>Your business, <em>in view.</em></h1><p>Manage your own listings, stock, purchases and product-level signals.</p></div><span className="mini-tag"><Building2 size={14}/> {merchant?.status??'Profile unavailable'}</span></div>
    {merchant?.status==='pending'&&<div className="dashboard-inline-note"><ShieldAlert size={17}/> Your merchant application is pending. New products are private drafts until an administrator approves the application.</div>}
    {merchant?.status==='rejected'&&<div className="form-error" role="alert">Application rejected: {merchant.rejectionReason??'Contact an administrator for the decision reason.'}</div>}
    <div className="kpi-grid">
      <article className="kpi-card"><div><span>Your listings</span><PackagePlus/></div><strong>{listings.length}</strong><small>{listings.filter(p=>p.listingStatus==='published').length} published · {listings.filter(p=>p.listingStatus==='draft').length} drafts</small></article>
      <article className="kpi-card"><div><span>Your purchases</span><ClipboardList/></div><strong>{orders.length}</strong><small>Orders containing your SKUs</small></article>
      <article className="kpi-card kpi-highlight"><div><span>Open SKU threats</span><ShieldAlert/></div><strong>{threats.length}</strong><small>Read-only visibility · no threat resolution permission</small></article>
    </div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">MERCHANT CATALOG</span><h2>Your listings</h2></div><span className="mini-tag">{listings.length} records</span></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>SKU</th><th>Listing state</th><th>Stock</th></tr></thead><tbody>{listings.map((item,i)=><tr key={item.id??item._id??i}><td><b>{item.name}</b><small>{item.brand} · {item.category}</small></td><td>{item.sku}</td><td><span className="order-state">{item.listingStatus}</span></td><td>{item.stock}</td></tr>)}{!listings.length&&<tr><td colSpan={4} className="empty-table">No merchant listings yet.</td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">LISTING SUBMISSION</span><h2>Create a product listing</h2></div><span className="mini-tag">Owned merchant records only</span></div>
      {feedback&&<p className="success-message">{feedback}</p>}{error&&<p className="form-error" role="alert">{error}</p>}
      <form className="merchant-listing-form" onSubmit={submit}>
        <label>SKU<input required minLength={3} value={form.sku} onChange={e=>setForm(v=>({...v,sku:e.target.value}))}/></label>
        <label>Batch reference<input required minLength={4} value={form.batchReference} onChange={e=>setForm(v=>({...v,batchReference:e.target.value}))}/></label>
        <label>Product name<input required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label>
        <label>Brand<input required value={form.brand} onChange={e=>setForm(v=>({...v,brand:e.target.value}))}/></label>
        <label>Category<select value={form.category} onChange={e=>setForm(v=>({...v,category:e.target.value}))}><option>Audio and Studio</option><option>Precision Horology</option><option>Edge Computing</option><option>Optics and Gear</option></select></label>
        <label>HS code<input required value={form.hsCode} onChange={e=>setForm(v=>({...v,hsCode:e.target.value}))}/></label>
        <label>Price (USD)<input required type="number" min="0.01" step="0.01" value={form.priceUsd} onChange={e=>setForm(v=>({...v,priceUsd:e.target.value}))}/></label>
        <label>Opening stock<input required type="number" min="0" step="1" value={form.stock} onChange={e=>setForm(v=>({...v,stock:e.target.value}))}/></label>
        <label>Reorder threshold<input required type="number" min="0" step="1" value={form.reorderThreshold} onChange={e=>setForm(v=>({...v,reorderThreshold:e.target.value}))}/></label>
        <label>Origin hub<select value={form.originHubCode} onChange={e=>setForm(v=>({...v,originHubCode:e.target.value}))}><option>HUB-NYC</option><option>HUB-ZRH</option><option>HUB-DXB</option><option>HUB-SIN</option><option>HUB-KHI</option></select></label>
        <label>Handling SLA (hours)<input required type="number" min="1" max="720" value={form.slaHours} onChange={e=>setForm(v=>({...v,slaHours:e.target.value}))}/></label>
        <label>Product image URL (optional)<input type="url" value={form.imageUrl} onChange={e=>setForm(v=>({...v,imageUrl:e.target.value}))}/></label>
        <button className="button button-primary" disabled={busy||merchant?.status==='rejected'}>{busy?'Saving…':'Save listing'} <PackagePlus size={16}/></button>
      </form>
    </section>
    <div className="dashboard-inline-note"><BadgeCheck size={17}/> Merchant-submitted hashes are application verification records only. They are not manufacturer attestations and do not prove authenticity.</div>
  </div>;
}
