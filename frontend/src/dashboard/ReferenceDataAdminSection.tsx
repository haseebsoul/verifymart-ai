import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

type Hub = {
  _id: string; code: string; name: string; x: number; y: number;
  latencyMs: number; status: 'online'|'warning'|'offline'|'retired'; queueDepth: number;
};
type Tariff = {
  _id: string; hsPrefix: string; country: 'US'|'UK'|'EU'|'AE'|'PK'|'SG';
  dutyRateBps: number; vatRateBps: number; vatIncludesCarrier: boolean; source: string;
};
const countries = ['US','UK','EU','AE','PK','SG'] as const;
const blankHub = { code:'HUB-', name:'', x:'0.5', y:'0.5', latencyMs:'0', status:'online' as Hub['status'], queueDepth:'0' };
const blankTariff = { hsPrefix:'', country:'PK' as Tariff['country'], dutyRateBps:'0', vatRateBps:'0', vatIncludesCarrier:false };

export function ReferenceDataAdminSection() {
  const client = useQueryClient();
  const { data: hubData, isLoading: hubsLoading, isError: hubsError } = useQuery({
    queryKey:['admin-hubs'],
    queryFn:()=>api<{hubs:Hub[]}>('/admin/hubs')
  });
  const { data: tariffData, isLoading: tariffsLoading, isError: tariffsError } = useQuery({
    queryKey:['admin-tariff-rules'],
    queryFn:()=>api<{rules:Tariff[]}>('/admin/tariff-rules')
  });
  const [hubForm,setHubForm]=useState(blankHub);
  const [editingHub,setEditingHub]=useState<Hub|null>(null);
  const [tariffForm,setTariffForm]=useState(blankTariff);
  const [editingTariff,setEditingTariff]=useState<Tariff|null>(null);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const hubs=hubData?.hubs??[];
  const tariffs=tariffData?.rules??[];
  const refresh=async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:['admin-hubs']}),
      client.invalidateQueries({queryKey:['admin-tariff-rules']}),
      client.invalidateQueries({queryKey:['hubs']}),
      client.invalidateQueries({queryKey:['tariffs']})
    ]);
  };
  const submitHub=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy('hub');setError('');setNotice('');
    const values={
      name:hubForm.name,x:Number(hubForm.x),y:Number(hubForm.y),
      latencyMs:Number(hubForm.latencyMs),status:hubForm.status,queueDepth:Number(hubForm.queueDepth)
    };
    try{
      if(editingHub){
        await api('/admin/hubs/'+encodeURIComponent(editingHub._id),{method:'PATCH',body:JSON.stringify(values)});
        setNotice(editingHub.code+' updated.');
      }else{
        await api('/admin/hubs',{method:'POST',body:JSON.stringify({...values,code:hubForm.code.toUpperCase()})});
        setNotice(hubForm.code.toUpperCase()+' created.');
      }
      setHubForm(blankHub);setEditingHub(null);await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Hub could not be saved.');}
    finally{setBusy('');}
  };
  const startHubEdit=(hub:Hub)=>{
    setEditingHub(hub);
    setHubForm({code:hub.code,name:hub.name,x:String(hub.x),y:String(hub.y),latencyMs:String(hub.latencyMs),status:hub.status,queueDepth:String(hub.queueDepth)});
  };
  const submitTariff=async(event:React.FormEvent)=>{
    event.preventDefault();setBusy('tariff');setError('');setNotice('');
    const values={
      hsPrefix:tariffForm.hsPrefix.toUpperCase(),country:tariffForm.country,
      dutyRateBps:Number(tariffForm.dutyRateBps),vatRateBps:Number(tariffForm.vatRateBps),
      vatIncludesCarrier:tariffForm.vatIncludesCarrier
    };
    try{
      if(editingTariff){
        await api('/admin/tariff-rules/'+encodeURIComponent(editingTariff._id),{method:'PATCH',body:JSON.stringify({
          dutyRateBps:values.dutyRateBps,vatRateBps:values.vatRateBps,vatIncludesCarrier:values.vatIncludesCarrier
        })});
        setNotice(editingTariff.country+' tariff '+(editingTariff.hsPrefix||'base')+' updated.');
      }else{
        await api('/admin/tariff-rules',{method:'POST',body:JSON.stringify(values)});
        setNotice('Tariff rule created.');
      }
      setTariffForm(blankTariff);setEditingTariff(null);await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Tariff rule could not be saved.');}
    finally{setBusy('');}
  };
  const removeTariff=async(rule:Tariff)=>{
    if(rule.hsPrefix===''){setError('The destination base rule is protected. Update it instead.');return;}
    if(!window.confirm('Delete the '+rule.country+' HS '+rule.hsPrefix+' tariff rule? Existing order quotes retain their stored amounts.'))return;
    setBusy(rule._id);setError('');setNotice('');
    try{
      await api('/admin/tariff-rules/'+encodeURIComponent(rule._id),{method:'DELETE'});
      setNotice('Tariff rule deleted.');await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Tariff rule could not be deleted.');}
    finally{setBusy('');}
  };

  return <section className="panel admin-users-panel">
    <div className="panel-heading"><div><span className="eyebrow">REFERENCE DATA / GOVERNANCE</span><h2>Hubs & tariff rules</h2></div><span className="mini-tag">Admin only · audited</span></div>
    {error&&<p className="form-error" role="alert">{error}</p>}{notice&&<p className="success-message" role="status">{notice}</p>}
    <h3>Operational hubs</h3>
    {hubsLoading?<p>Loading hubs…</p>:hubsError?<p className="form-error">Hub records could not be loaded.</p>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Code</th><th>Name</th><th>Coordinates</th><th>Latency</th><th>Queue</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {hubs.map(hub=><tr key={hub._id}><td><b>{hub.code}</b></td><td>{hub.name}</td><td>{hub.x.toFixed(3)}, {hub.y.toFixed(3)}</td><td>{hub.latencyMs} ms</td><td>{hub.queueDepth}</td><td>{hub.status}</td><td><button className="button button-outline" onClick={()=>startHubEdit(hub)}>Edit</button></td></tr>)}
      {!hubs.length&&<tr><td colSpan={7} className="empty-table">No hubs have been configured.</td></tr>}
    </tbody></table></div>}
    <form className="merchant-listing-form" onSubmit={submitHub}>
      <h4>{editingHub?'Edit hub '+editingHub.code:'Add operational hub'}</h4>
      {!editingHub&&<label>Hub code<input required pattern="HUB-[A-Za-z0-9-]+" maxLength={20} value={hubForm.code} onChange={e=>setHubForm(v=>({...v,code:e.target.value}))}/></label>}
      <label>Name<input required minLength={2} maxLength={100} value={hubForm.name} onChange={e=>setHubForm(v=>({...v,name:e.target.value}))}/></label>
      <label>Map X (0–1)<input required type="number" min="0" max="1" step="0.001" value={hubForm.x} onChange={e=>setHubForm(v=>({...v,x:e.target.value}))}/></label>
      <label>Map Y (0–1)<input required type="number" min="0" max="1" step="0.001" value={hubForm.y} onChange={e=>setHubForm(v=>({...v,y:e.target.value}))}/></label>
      <label>Latency (ms)<input required type="number" min="0" max="60000" value={hubForm.latencyMs} onChange={e=>setHubForm(v=>({...v,latencyMs:e.target.value}))}/></label>
      <label>Queue depth<input required type="number" min="0" max="100000" value={hubForm.queueDepth} onChange={e=>setHubForm(v=>({...v,queueDepth:e.target.value}))}/></label>
      <label>Status<select value={hubForm.status} onChange={e=>setHubForm(v=>({...v,status:e.target.value as Hub['status']}))}><option value="online">Online</option><option value="warning">Warning</option><option value="offline">Offline</option><option value="retired">Retired (preserve record)</option></select></label>
      <button className="button button-primary" disabled={busy==='hub'}>{busy==='hub'?'Saving…':editingHub?'Save hub':'Create hub'}</button>
      {editingHub&&<button type="button" className="button button-outline" onClick={()=>{setEditingHub(null);setHubForm(blankHub);}}>Cancel</button>}
    </form>
    <div className="dashboard-inline-note">Retire a hub instead of deleting it. Existing product and historical route references remain intact.</div>
    <hr/>
    <h3>Tariff rules</h3>
    {tariffsLoading?<p>Loading tariff rules…</p>:tariffsError?<p className="form-error">Tariff rules could not be loaded.</p>:<div className="table-scroll"><table className="data-table"><thead><tr><th>Country</th><th>HS prefix</th><th>Duty</th><th>VAT</th><th>Carrier in VAT base</th><th>Actions</th></tr></thead><tbody>
      {tariffs.map(rule=><tr key={rule._id}><td>{rule.country}</td><td>{rule.hsPrefix||'Base'}</td><td>{(rule.dutyRateBps/100).toFixed(2)}%</td><td>{(rule.vatRateBps/100).toFixed(2)}%</td><td>{rule.vatIncludesCarrier?'Yes':'No'}</td><td><div className="admin-actions"><button className="button button-outline" onClick={()=>{setEditingTariff(rule);setTariffForm({hsPrefix:rule.hsPrefix,country:rule.country,dutyRateBps:String(rule.dutyRateBps),vatRateBps:String(rule.vatRateBps),vatIncludesCarrier:rule.vatIncludesCarrier});}}>Edit</button>{rule.hsPrefix!==''&&<button className="button button-outline" disabled={busy===rule._id} onClick={()=>void removeTariff(rule)}>Delete</button>}</div></td></tr>)}
      {!tariffs.length&&<tr><td colSpan={6} className="empty-table">No tariff rules have been configured.</td></tr>}
    </tbody></table></div>}
    <form className="merchant-listing-form" onSubmit={submitTariff}>
      <h4>{editingTariff?'Edit tariff rule':'Add tariff rule'}</h4>
      {!editingTariff&&<><label>Destination country<select value={tariffForm.country} onChange={e=>setTariffForm(v=>({...v,country:e.target.value as Tariff['country']}))}>{countries.map(country=><option value={country} key={country}>{country}</option>)}</select></label><label>HS prefix (blank = base rule)<input maxLength={16} pattern="[A-Za-z0-9]*" value={tariffForm.hsPrefix} onChange={e=>setTariffForm(v=>({...v,hsPrefix:e.target.value}))}/></label></>}
      <label>Duty rate (basis points)<input required type="number" min="0" max="10000" value={tariffForm.dutyRateBps} onChange={e=>setTariffForm(v=>({...v,dutyRateBps:e.target.value}))}/></label>
      <label>VAT rate (basis points)<input required type="number" min="0" max="10000" value={tariffForm.vatRateBps} onChange={e=>setTariffForm(v=>({...v,vatRateBps:e.target.value}))}/></label>
      <label><input type="checkbox" checked={tariffForm.vatIncludesCarrier} onChange={e=>setTariffForm(v=>({...v,vatIncludesCarrier:e.target.checked}))}/> Include carrier in VAT base</label>
      <button className="button button-primary" disabled={busy==='tariff'}>{busy==='tariff'?'Saving…':editingTariff?'Save tariff rule':'Create tariff rule'}</button>
      {editingTariff&&<button type="button" className="button button-outline" onClick={()=>{setEditingTariff(null);setTariffForm(blankTariff);}}>Cancel</button>}
    </form>
    <div className="dashboard-inline-note">Rates are maintained as basis points. They remain estimates from the configured tariff data source, not official customs determinations. Base rules cannot be deleted.</div>
  </section>;
}
