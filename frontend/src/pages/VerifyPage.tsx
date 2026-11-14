import { useEffect,useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight,BadgeCheck,Copy,Factory,MapPin,PackageCheck,Search,ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { shortDate } from '../lib/format';

type AtlasVerifyResult = {
  query: string;
  found: boolean;
  simulated: true;
  recordType: 'product' | 'order' | 'not_found';
  authenticityNote: string;
  authenticityScore?: number;
  product?: {
    id: string; sku: string; name: string; brand: string;
    authenticityScore: number; batchHash: string; hsCode: string;
  };
  certificate?: { factory: string; batchHash: string; hsCode: string; issuedAt: string };
  timeline?: Array<{ id: string; stage: string; hubId: string; occurredAt: string; hash: string }>;
  order?: {
    id: string; state: string; destination: string; createdAt: string;
    totalUsd: number; items: Array<{ productId: string; sku: string; name: string; quantity: number }>;
  };
};

export function VerifyPage(){
  const [params]=useSearchParams();
  const [query,setQuery]=useState(params.get('query')??'');
  const [result,setResult]=useState<AtlasVerifyResult|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);

  const search=async(value:string)=>{
    if(!value.trim())return;
    setLoading(true);setError('');setResult(null);
    try{setResult(await api<AtlasVerifyResult>(`/verify/${encodeURIComponent(value.trim())}`));}
    catch(e){setError(e instanceof Error?e.message:'Record not found.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{
    const value=params.get('query');
    if(value){setQuery(value);void search(value);}
  },[params]);

  return <main className="verify-page">
    <section className="verify-hero">
      <span className="eyebrow">OPEN PROVENANCE PORTAL</span>
      <h1>Every item has<br/><em>a story. Check it.</em></h1>
      <p>Search a product SKU, batch hash or order receipt. No account is needed.</p>
      <form className="verify-search" onSubmit={e=>{e.preventDefault();void search(query);}}>
        <Search size={21}/>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Enter SKU, batch hash or order ID" aria-label="Verification query"/>
        <button className="button button-primary" disabled={loading}>{loading?'Checking…':'Verify record'} <ArrowRight size={16}/></button>
      </form>
      <div className="verify-samples"><span>SAMPLE RECORDS</span>{['AUD-001','HOR-004','EDG-009','OPT-013'].map(v=><button key={v} onClick={()=>{setQuery(v);void search(v);}}>{v}</button>)}</div>
      <div className="simulated-banner"><ShieldAlert size={15}/> Demonstration dataset · hashes are generated from application data, not a manufacturer ledger.</div>
    </section>

    {error&&<section className="verify-error" role="alert"><ShieldAlert size={22}/><div><b>Nothing found for that code.</b><p>{error}</p></div></section>}

    {result?.product&&result.certificate&&result.timeline&&<section className="verification-result">
      <div className="result-header">
        <div><span className="eyebrow">APPLICATION VERIFICATION RECORD</span><h2>{result.product.name}</h2><p>{result.product.brand} · {result.product.sku}</p></div>
        <div className="auth-score"><strong>{result.authenticityScore??result.product.authenticityScore}</strong><span>/ 100</span><small>ILLUSTRATIVE SCORE</small></div>
      </div>
      <div className="certificate-grid">
        <div><span>RECORD SOURCE</span><b>{result.certificate.factory}</b><Factory size={17}/></div>
        <div><span>BATCH HASH</span><b className="hash-value">{result.certificate.batchHash.slice(0,18)}…</b><button className="plain-icon" onClick={()=>void navigator.clipboard.writeText(result.certificate!.batchHash)} aria-label="Copy batch hash"><Copy size={15}/></button></div>
        <div><span>HS CODE</span><b>{result.certificate.hsCode}</b><PackageCheck size={17}/></div>
        <div><span>FIRST EVENT</span><b>{shortDate(result.certificate.issuedAt)}</b><BadgeCheck size={17}/></div>
      </div>
      <div className="timeline-heading"><span className="eyebrow">RECORDED EVENTS</span><span>{result.timeline.length} checkpoints</span></div>
      <div className="provenance-timeline">{result.timeline.map((event,index)=><div className="timeline-event" key={event.id}>
        <div className="timeline-marker">{index+1}</div><div><h3>{event.stage}</h3><p><MapPin size={14}/>{event.hubId} <span>·</span> {shortDate(event.occurredAt)}</p><code>{event.hash.slice(0,28)}…</code></div><span className="timeline-check">✓</span>
      </div>)}</div>
      <div className="simulated-banner"><ShieldAlert size={15}/> Simulated provenance · hashes and events are not manufacturer-signed proof and do not guarantee real-world authenticity.</div>
    </section>}

    {result?.order&&<section className="verification-result">
      <div className="result-header"><div><span className="eyebrow">ORDER VERIFICATION RECORD</span><h2>{result.order.id}</h2><p>Destination: {result.order.destination} · Created {shortDate(result.order.createdAt)}</p></div><div className="auth-score"><strong>{result.order.state.replace('_',' ')}</strong><small>ESCROW STATE · SIMULATED</small></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Item</th><th>SKU</th><th>Quantity</th></tr></thead><tbody>{result.order.items.map(item=><tr key={item.productId}><td>{item.name}</td><td>{item.sku}</td><td>{item.quantity}</td></tr>)}</tbody></table></div>
      <p className="quote-total">Recorded order total: <b>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(result.order.totalUsd)}</b></p>
      <div className="simulated-banner"><ShieldAlert size={15}/> Order and escrow records are application records only. No payment or funds transfer occurred.</div>
    </section>}
  </main>;
}
