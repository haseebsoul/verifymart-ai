import { useEffect,useMemo,useState } from 'react';
import { Link,useNavigate } from 'react-router-dom';
import { ArrowRight,Check,Copy,Minus,Plus,ShoppingBag,Trash2,X } from 'lucide-react';
import { DESTINATIONS,DESTINATION_NAMES,type DutyQuote } from '@verifymart/shared';
import { useCart } from '../context/cart';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { money } from '../lib/format';
export function CartDrawer(){
  const {items,destination,open,setOpen,setDestination,setQty,remove,clear}=useCart();const {user}=useAuth();const navigate=useNavigate();
  const [quote,setQuote]=useState<DutyQuote|null>(null);const [loadingQuote,setLoadingQuote]=useState(false);const [submitting,setSubmitting]=useState(false);const [error,setError]=useState('');const [receipt,setReceipt]=useState('');
  const signature=useMemo(()=>JSON.stringify({destinationCountry:destination,items:items.map(i=>({productId:i.product.id,quantity:i.quantity}))}),[destination,items]);
  useEffect(()=>{if(!open||!items.length){setQuote(null);return;}let active=true;setLoadingQuote(true);const timer=window.setTimeout(()=>{void api<DutyQuote>('/duty/calculate',{method:'POST',body:signature}).then(q=>{if(active)setQuote(q);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Quote could not be calculated.');}).finally(()=>{if(active)setLoadingQuote(false);});},300);return()=>{active=false;window.clearTimeout(timer);};},[open,signature,items.length]);
  const checkout=async()=>{if(!user){setOpen(false);navigate('/login?next=/store');return;}setSubmitting(true);setError('');try{const key=crypto.randomUUID();const result=await api<{orderId:string;escrowReceiptId:string;total:number}>('/orders/checkout',{method:'POST',headers:{'Idempotency-Key':key},body:signature});setReceipt(result.escrowReceiptId);clear();}catch(e){setError(e instanceof Error?e.message:'Checkout failed.');}finally{setSubmitting(false);}};
  const copy=async()=>{await navigator.clipboard.writeText(receipt);};
  if(!open)return null;
  return <div className="drawer-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}><aside className="cart-drawer" role="dialog" aria-modal="true" aria-label="Shopping cart">
    <div className="drawer-heading"><div><span className="eyebrow">Your selection</span><h2>Shopping bag <span>({items.reduce((s,i)=>s+i.quantity,0)})</span></h2></div><button className="icon-button" onClick={()=>setOpen(false)} aria-label="Close cart"><X/></button></div>
    {receipt?<div className="receipt-state"><span className="receipt-icon"><Check size={28}/></span><span className="eyebrow">Escrow initialized · simulated</span><h3>Order secured.</h3><p>Your checkout created a held escrow record. No payment was collected.</p><div className="receipt-code"><span>{receipt}</span><button onClick={()=>void copy()} aria-label="Copy receipt"><Copy size={16}/></button></div><button className="button button-primary w-full" onClick={()=>{setReceipt('');setOpen(false);navigate(`/verify?query=${encodeURIComponent(receipt)}`);}}>Verify order <ArrowRight size={17}/></button></div>:items.length===0?<div className="cart-empty"><ShoppingBag size={36}/><h3>Your bag is empty</h3><p>Add a verified item to get an itemized landed-cost estimate.</p><Link className="button button-primary" to="/store" onClick={()=>setOpen(false)}>Explore catalog</Link></div>:<>
      <div className="cart-lines">{items.map(item=><div className="cart-line" key={item.product.id}><img src={item.product.imageUrl} alt=""/><div className="cart-line-info"><strong>{item.product.name}</strong><span>{item.product.sku} · {money(item.product.priceUsd)}</span><div className="quantity-control"><button onClick={()=>setQty(item.product.id,item.quantity-1)} aria-label="Decrease quantity"><Minus size={13}/></button><b>{item.quantity}</b><button onClick={()=>setQty(item.product.id,item.quantity+1)} aria-label="Increase quantity"><Plus size={13}/></button></div></div><button className="icon-button remove-line" onClick={()=>remove(item.product.id)} aria-label={`Remove ${item.product.name}`}><Trash2 size={16}/></button></div>)}</div>
      <div className="cart-calculation"><label htmlFor="destination">Delivery destination</label><select id="destination" value={destination} onChange={e=>setDestination(e.target.value as typeof destination)}>{DESTINATIONS.map(code=><option key={code} value={code}>{DESTINATION_NAMES[code]}</option>)}</select>
        <div className="quote-list"><div><span>Product value</span><b>{quote?money(quote.subtotal):'—'}</b></div><div><span>Import duty</span><b>{quote?money(quote.duty):'—'}</b></div><div><span>VAT / tax</span><b>{quote?money(quote.vat):'—'}</b></div><div><span>Carrier fee</span><b>{quote?money(quote.carrierFee):'—'}</b></div><div className="quote-total"><span>Estimated landed total</span><b>{loadingQuote?'Calculating…':quote?money(quote.total):'—'}</b></div></div>
        <p className="estimate-note">Estimate only · source: seed-tariff-v1 · rates are not legally authoritative.</p>
      </div>
      {error&&<p role="alert" className="form-error">{error}</p>}
      <div className="drawer-actions"><button className="button button-primary w-full" disabled={loadingQuote||!quote||submitting} onClick={()=>void checkout()}>{submitting?'Securing order…':user?'Create simulated escrow':'Sign in to continue'} <ArrowRight size={17}/></button><button className="text-link" onClick={()=>setOpen(false)}>Continue shopping</button></div>
    </>}
  </aside></div>;
}
