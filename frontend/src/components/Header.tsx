import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, LogOut, Menu, ShieldCheck, ShoppingBag, X } from 'lucide-react';
import { useCart } from '../context/cart';
import { useAuth } from '../context/AuthContext';

const roleTitles: Record<string, string> = {
  shopper: 'Shopper',
  merchant: 'Merchant',
  inventory_manager: 'Inventory Manager',
  operator: 'Operations Auditor',
  admin: 'System Administrator'
};

function workspacePath(role: string): string {
  const routes:Record<string,string>={shopper:'/dashboard/shopper',merchant:'/dashboard/merchant',inventory_manager:'/dashboard/inventory',operator:'/dashboard/operator',admin:'/dashboard/admin'};
  return routes[role]??'/dashboard';
}

export function Header() {
  const { items, setOpen } = useCart();
  const { user, logout } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [language,setLanguage]=useState<'EN'|'اردو'>('EN');
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const links: Array<[string, string]> = [
    ['How it works', '/#how-it-works'],
    ['Cost calculator', '/#calculator'],
    ['Catalog', '/#catalog'],
    ['Reliability', '/#reliability']
  ];

  return (
    <header className="site-header">
      <Link to="/" className="brand" aria-label="VerifyMart home">
        <span className="brand-mark"><ShieldCheck size={21} /></span>
        <span>VerifyMart <i>AI</i></span>
      </Link>
      <nav className={`main-nav ${mobile ? 'is-open' : ''}`} aria-label="Main navigation">
        {links.map(([label, href]) => (
          <a key={label} href={href} onClick={() => setMobile(false)}>{label}</a>
        ))}
      </nav>
      <div className="header-actions">
        <button className="language-toggle" type="button" aria-label="Display language selector" aria-pressed={language==='اردو'} onClick={()=>setLanguage(value=>value==='EN'?'اردو':'EN')}>{language}</button>
        {user && (
          <div className="header-user">
            <span className="header-user-name">{user.name}</span>
            <span className="header-role-pill">{roleTitles[user.role] ?? user.role}</span>
          </div>
        )}
        <button className="icon-button cart-trigger" onClick={() => setOpen(true)} aria-label={`Open cart, ${count} items`}>
          <ShoppingBag size={18} /><span>Cart</span>{count > 0 && <b>{count}</b>}
        </button>
        {user ? (
          <>
            <Link className="button button-small button-primary header-ops" to={workspacePath(user.role)}>
              Workspace <ArrowUpRight size={15} />
            </Link>
            <button className="button button-small button-outline header-signout" type="button" onClick={() => void logout()}>
              <LogOut size={14} /> Sign out
            </button>
          </>
        ) : (
          <>
            <Link className="button button-small button-outline header-signin" to="/login">Sign in</Link>
            <Link className="button button-small button-primary header-register" to="/register">Create account</Link>
          </>
        )}
        <button className="mobile-menu" onClick={() => setMobile(value => !value)} aria-label={mobile ? 'Close menu' : 'Open menu'}>
          {mobile ? <X /> : <Menu />}
        </button>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Link to="/" className="brand footer-brand">
            <span className="brand-mark"><ShieldCheck /></span>
            <span>VerifyMart <i>AI</i></span>
          </Link>
          <p>Proof at every handoff.<br />Clarity at every checkout.</p>
        </div>
        <div className="footer-links">
          <div><strong>Explore</strong><Link to="/store">Catalog</Link><Link to="/verify">Batch lookup</Link><Link to="/#calculator">Landed-cost estimate</Link></div>
          <div><strong>Workspaces</strong><Link to="/dashboard/shopper">Shopper</Link><Link to="/dashboard/merchant">Merchant</Link><Link to="/dashboard/inventory">Inventory manager</Link><Link to="/dashboard/operator">Operator</Link><Link to="/dashboard/admin">Administrator</Link></div>
          <div><strong>Platform</strong><Link to="/register">Supplier registration</Link><a href="/api/health" target="_blank" rel="noreferrer">API health</a></div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 VerifyMart AI · Atlas development environment</span>
        <span className="simulated-note"><span className="dot" /> Provenance, Pakistan tariff/FX estimates and escrow are simulated; no real funds or official customs determination.</span>
      </div>
    </footer>
  );
}
