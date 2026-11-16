import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { api } from '../lib/api';

type Adjustment = {id:string;productId:string;sku:string;productName:string;actorId:string;actorRole:string;delta:number;reason:string;at:string};
export function InventoryAdjustmentsPage() {
  const {data,isLoading,error}=useQuery({queryKey:['inventory-adjustments'],queryFn:()=>api<{adjustments:Adjustment[]}>('/inventory/adjustments')});
  return <div className="dashboard-page">
    <div className="dashboard-page-heading"><div><span className="eyebrow">INVENTORY / ADJUSTMENT HISTORY</span><h1>Stock <em>ledger.</em></h1><p>Every stock movement is attributed to an actor and recorded with its reason.</p></div><span className="mini-tag"><ClipboardList size={15}/> Immutable entries</span></div>
    {error&&<p className="form-error" role="alert">{error instanceof Error?error.message:'Could not load stock history.'}</p>}
    <section className="panel inventory-panel"><div className="table-scroll"><table className="data-table"><thead><tr><th>Product</th><th>Change</th><th>Actor</th><th>Reason</th><th>Recorded</th></tr></thead><tbody>
      {data?.adjustments.map(item=><tr key={item.id}><td><b>{item.productName}</b><small>{item.sku} · {item.productId}</small></td><td>{item.delta>0?'+':''}{item.delta}</td><td>{item.actorRole}<small>{item.actorId}</small></td><td>{item.reason}</td><td>{new Date(item.at).toLocaleString()}</td></tr>)}
      {!isLoading&&!data?.adjustments.length&&<tr><td colSpan={5} className="empty-table">No inventory adjustments recorded yet.</td></tr>}
    </tbody></table></div></section>
  </div>;
}
