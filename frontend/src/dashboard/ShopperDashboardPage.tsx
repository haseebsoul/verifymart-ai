import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building2, PackageCheck, ShieldCheck } from 'lucide-react';
import { DESTINATIONS, DESTINATION_NAMES, type Destination } from '@verifymart/shared';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { money, relative } from '../lib/format';

type ShopperOrder = {
  id: string;
  receiptId: string;
  destination: Destination;
  total: number;
  state: string;
  createdAt: string;
  items: Array<{ productId: string; sku: string; name: string; quantity: number }>;
};

export function ShopperDashboardPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shopper-orders', user?.id],
    queryFn: () => api<{ orders: ShopperOrder[] }>('/orders'),
    enabled: Boolean(user)
  });
  const [businessName, setBusinessName] = useState('');
  const [country, setCountry] = useState<Destination>('PK');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const orders = data?.orders ?? [];

  const applyForMerchant = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/merchant/apply', {
        method: 'POST',
        body: JSON.stringify({ businessName, country })
      });
      setSubmitted(true);
      await refreshUser();
      navigate('/dashboard', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Merchant application could not be submitted.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-page-heading">
        <div>
          <span className="eyebrow">SHOPPER WORKSPACE</span>
          <h1>Your orders, <em>in view.</em></h1>
          <p>Review your checkout history, account details and merchant onboarding status.</p>
        </div>
        <Link className="button button-outline" to="/store">Browse catalog <ArrowRight size={16} /></Link>
      </div>

      <section className="account-profile panel">
        <div className="account-avatar">{user?.name.slice(0, 1).toUpperCase()}</div>
        <div>
          <span className="eyebrow">SIGNED-IN SHOPPER</span>
          <h2>{user?.name}</h2>
          <p>{user?.email}</p>
          <span className="role-chip">shopper</span>
        </div>
        <ShieldCheck className="account-verified" />
      </section>

      <section className="panel orders-panel">
        <div className="panel-heading">
          <div><span className="eyebrow">ORDER HISTORY</span><h2>Your checkouts</h2></div>
          <span className="mini-tag">{orders.length} orders</span>
        </div>
        {isLoading ? <div className="skeleton threat-skeleton" /> : isError ? (
          <div className="empty-state"><p>Order history could not be loaded.</p><button className="button button-outline" onClick={() => void refetch()}>Retry</button></div>
        ) : orders.length ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Order / receipt</th><th>Items</th><th>Destination</th><th>Total</th><th>Escrow state</th></tr></thead>
              <tbody>{orders.map(order => (
                <tr key={order.id}>
                  <td><b className="mono-cell">{order.id}</b><small>{relative(order.createdAt)} · {order.receiptId}</small></td>
                  <td>{order.items.map(item => `${item.sku} ×${item.quantity}`).join(', ')}</td>
                  <td>{DESTINATION_NAMES[order.destination]}</td>
                  <td><b>{money(order.total)}</b></td>
                  <td><span className={`order-state ${order.state}`}>{order.state.replace('_', ' ')}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state"><PackageCheck size={30} /><h3>No orders yet.</h3><p>Your completed simulated checkouts will appear here.</p><Link className="button button-primary" to="/store">Explore catalog</Link></div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">MERCHANT ONBOARDING</span><h2>Apply for a merchant workspace</h2></div><Building2 /></div>
        <p>Submit your business profile for administrator review. Pending merchants can prepare private draft listings but cannot publish stock.</p>
        {submitted && <p className="success-message">Application submitted. Your workspace will switch to merchant mode.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <form className="merchant-listing-form" onSubmit={applyForMerchant}>
          <label>Business name<input required minLength={2} maxLength={120} value={businessName} onChange={event => setBusinessName(event.target.value)} /></label>
          <label>Business country<select value={country} onChange={event => setCountry(event.target.value as Destination)}>{DESTINATIONS.map(code => <option key={code} value={code}>{DESTINATION_NAMES[code]}</option>)}</select></label>
          <button className="button button-primary" disabled={busy || submitted}>{busy ? 'Submitting…' : 'Submit merchant application'} <ArrowRight size={16} /></button>
        </form>
      </section>
      <div className="dashboard-inline-note">Escrow records are simulated only. No payment or funds transfer occurs.</div>
    </div>
  );
}
