import { Link,NavLink,useNavigate } from 'react-router-dom';
import { ArrowUpRight, Menu, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '../context/cart';
export function Header(){
  const {items,setOpen}=useCart();const [mobile,setMobile]=useState(false);const count=items.reduce((s,i)=>s+i.quantity,0);
  const links=[['How it works','#how-it-works'],['Verified store','/store'],['Batch lookup','/verify'],['Landed duty','#calculator']];
  return <header className="site-header">
    <Link to="/" className="brand" aria-label="VerifyMart home"><span className="brand-mark"><ShieldCheck size={21}/></span><span>VerifyMart <i>AI</i></span></Link>
    <nav className={`main-nav ${mobile?'is-open':''}`} aria-label="Main navigation">
      {links.map(([label,path])=> (path ?? '').startsWith('#') ? <a key={label} href={path} onClick={()=>setMobile(false)}>{label}</a> : <NavLink key={label} to={path ?? '/'} onClick={()=>setMobile(false)}>{label}</NavLink>)}
    </nav>
    <div className="header-actions">
      <button className="icon-button cart-trigger" onClick={()=>setOpen(true)} aria-label={`Open cart, ${count} items`}><ShoppingBag size={18}/><span>Cart</span>{count>0&&<b>{count}</b>}</button>
      <Link className="button button-small button-outline header-signin" to="/login">Sign in</Link>
      <Link className="button button-small header-ops" to="/dashboard">Ops console <ArrowUpRight size={15}/></Link>
      <button className="mobile-menu" onClick={()=>setMobile(v=>!v)} aria-label={mobile?'Close menu':'Open menu'}>{mobile?<X/>:<Menu/>}</button>
    </div>
  </header>;
}
export function SiteFooter(){
  return <footer className="site-footer"><div className="footer-top"><div><Link to="/" className="brand footer-brand"><span className="brand-mark"><ShieldCheck/></span><span>VerifyMart <i>AI</i></span></Link><p>Proof at every handoff.<br/>Clarity at every checkout.</p></div><div className="footer-links"><div><strong>Explore</strong><Link to="/store">Verified store</Link><Link to="/verify">Batch lookup</Link></div><div><strong>Platform</strong><Link to="/login">Merchant access</Link><Link to="/dashboard">Operations</Link></div><div><strong>Engineering</strong><a href="/api/health" target="_blank" rel="noreferrer">API health</a><a href="/api/openapi.json" target="_blank" rel="noreferrer">API contract</a></div></div></div><div className="footer-bottom"><span>© 2026 VerifyMart AI · Prototype v1.0</span><span className="simulated-note"><span className="dot"/> Simulated provenance, tariff estimates and escrow. No real money moves.</span></div></footer>;
}
