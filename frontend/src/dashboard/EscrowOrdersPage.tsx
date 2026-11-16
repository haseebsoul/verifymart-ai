import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type OrderRow = {
  id: string; receiptId: string; destination: string; subtotal: number; duty: number;
  vat: number; carrierFee: number; total: number; state: 'held'|'released'|'refunded'|'on_hold';
  holdReason: string|null; createdAt: string; items: Array<{sku:string;name:string;quantity:number}>;
};
export function EscrowOrdersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({ queryKey: ['escrow-orders'], queryFn: () => api<{orders:OrderRow[]}>('/orders') });
  const [reasons, setReasons] = useState<Record<string,string>>({});
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState('');
  const act = async (order: OrderRow, action: 'release'|'hold'|'restore'|'refund') => {
    if ((action === 'hold' || action === 'restore' || action === 'refund') && (reasons[order.id]?.trim().length ?? 0) < 4) {
      setFeedback('Enter a reason of at least four characters for this transition.');
      return;
    }
    setBusy(order.id); setFeedback('');
    try {
      await api(`/orders/${order.id}/${action}`, {
        method: 'POST',
        ...(action === 'hold' || action === 'restore' || action === 'refund'
          ? { body: JSON.stringify({reason: reasons[order.id].trim()}) } : {})
      });
      setFeedback(`Order ${order.id} moved to the requested state.`);
      await queryClient.invalidateQueries({ queryKey: ['escrow-orders'] });
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : 'Escrow state change failed.');
    } finally { setBusy(''); }
  };
  return <div className="dashboard-page">
    <div className="dashboard-page-heading"><div><span className="eyebrow">ESCROW CONTROL / ORDERS</span><h1>Order <em>state review.</em></h1><p>State changes are persisted and audit-recorded. No payment or funds movement occurs in this prototype.</p></div></div>
    {feedback && <p className="form-error" role="status">{feedback}</p>}
    {error && <p className="form-error" role="alert">{error instanceof Error ? error.message : 'Could not load orders.'}</p>}
    <section className="panel">
      {isLoading ? <p>Loading Atlas orders…</p> : !data?.orders.length ? <p className="empty-table">No orders are recorded yet.</p> : <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Order / receipt</th><th>Items</th><th>Total</th><th>State</th><th>Reason / action</th></tr></thead>
        <tbody>{data.orders.map(order => <tr key={order.id}>
          <td><b>{order.id}</b><small>{order.receiptId} · {new Date(order.createdAt).toLocaleString()}</small></td>
          <td>{order.items.map(item => `${item.sku} × ${item.quantity}`).join(', ')}</td>
          <td>${order.total.toFixed(2)} {order.destination}</td>
          <td><span className={`order-state ${order.state}`}>{order.state.replace('_',' ')}</span>{order.holdReason && <small>{order.holdReason}</small>}</td>
          <td><input value={reasons[order.id]??''} onChange={e=>setReasons(v=>({...v,[order.id]:e.target.value}))} placeholder="Reason for hold / restore / refund" aria-label={`Reason for ${order.id}`}/>
            <div className="admin-actions">
              {order.state==='held' && <><button className="button button-primary" disabled={!!busy} onClick={()=>void act(order,'release')}>Release</button><button className="button button-outline" disabled={!!busy} onClick={()=>void act(order,'hold')}>Hold</button></>}
              {order.state==='on_hold' && <button className="button button-outline" disabled={!!busy} onClick={()=>void act(order,'restore')}>Return to held</button>}
              {user?.role==='admin' && (order.state==='held'||order.state==='on_hold') && <button className="button button-danger" disabled={!!busy} onClick={()=>void act(order,'refund')}>Refund</button>}
            </div>
          </td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <div className="dashboard-inline-note">An order on hold must be returned to <b>held</b> before it can be released. Refunded and released orders are terminal states.</div>
  </div>;
}
