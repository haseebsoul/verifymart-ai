import { useState } from 'react';
import { BadgeCheck, Plus, ShieldAlert } from 'lucide-react';
import type { Product } from '@verifymart/shared';
import { money } from '../lib/format';
import { useCart } from '../context/cart';
export function ProductCard({product}:{product:Product}){
  const [imageFailed,setImageFailed]=useState(false);const add=useCart(s=>s.add);
  return <article className="product-card">
    <div className="product-image-wrap"><img src={imageFailed?'/product-fallback.svg':product.imageUrl} alt={product.name} loading="lazy" onError={()=>setImageFailed(true)}/>
      <span className={`status-badge ${product.status==='verified'?'verified':product.status==='low_stock'?'review':'critical'}`}>
        {product.status==='verified'?<BadgeCheck size={14}/>:<ShieldAlert size={14}/>} {product.status==='verified'?'Verified':product.status==='low_stock'?'Low stock':'Review'}
      </span>
    </div>
    <div className="product-card-body"><div className="product-meta"><span>{product.category}</span><span>{product.originHubId.replace('HUB-','')}</span></div>
      <h3>{product.name}</h3><p className="product-brand">{product.brand}</p>
      <div className="product-score"><span><b>{product.authenticityScore}</b> / 100 authenticity</span><span className="score-bar"><i style={{width:`${product.authenticityScore}%`}}/></span></div>
      <div className="product-card-bottom"><strong className="price">{money(product.priceUsd)}</strong><button className="button button-add" onClick={()=>add(product)} aria-label={`Add ${product.name} to cart`}><Plus size={16}/> Add</button></div>
    </div>
  </article>;
}
export function ProductGrid({products}:{products:Product[]}){return <div className="product-grid">{products.map(product=><ProductCard key={product.id} product={product}/>)}</div>;}
