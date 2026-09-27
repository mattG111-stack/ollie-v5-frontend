"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtMoney } from "@/lib/format";
type Row = {id:number;address:string;suburb:string;asking:number|null;value:number|null;held:boolean;reason:string|null;removed:boolean;floor:number|null;land:number|null;image_url?:string|null};
type Review = {publish_enabled:boolean;rows:Row[]};
type Job = {id:number;filename:string;status:string;stage:string|null;progress_pct:number|null;error_message:string|null};
const active = (j:Job|null)=>!!j && ['pending','running'].includes(j.status);
export default function PortalPricingReview({ids,onPriced}:{ids:number[];onPriced:()=>void}) {
  const [review,setReview]=useState<Review|null>(null);
  const [job,setJob]=useState<Job|null>(null);
  const [view,setView]=useState(false);
  const [filter,setFilter]=useState<'all'|'ready'|'held'|'removed'>('all');
  const [page,setPage]=useState(0);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [selected,setSelected]=useState<Set<number>>(new Set());
  const load=useCallback(async()=>{
    const r=await api<Review>('/api/admin/release/portal-review');setReview(r);
    setSelected(s=>new Set([...s].filter(id=>r.rows.some(x=>x.id===id&&!x.removed&&!x.held))));
  },[]);
  useEffect(()=>{let disposed=false;let timer:ReturnType<typeof setTimeout>;
    async function poll(){try{
      const jobs=await api<Job[]>('/api/admin/jobs?limit=100');
      const j=jobs.find(x=>x.filename==='portal pricing')??null;
      if(disposed)return;setJob(j);await load();
    }catch{if(!disposed)setMessage('Could not refresh pricing status. Retrying…');}
    finally{if(!disposed)timer=setTimeout(poll,5000);}}
    poll();return()=>{disposed=true;clearTimeout(timer);};
  },[load]);
  useEffect(()=>{if(job?.status==='completed'){onPriced();setView(true);}},[job?.id,job?.status,onPriced]);
  async function price(priceIds=ids){setBusy(true);setMessage('');try{
    const r=await api<{job_id:number}>('/api/admin/release/portal-review/price',{method:'POST',body:JSON.stringify({ids:priceIds})});
    setJob({id:r.job_id,filename:'portal pricing',status:'pending',stage:'Starting pricing',progress_pct:0,error_message:null});
  }catch(e:any){setMessage(e?.detail||e?.message||'Could not start pricing');}finally{setBusy(false);}}
  async function remove(id:number,removed:boolean){setBusy(true);try{
    await api(`/api/admin/release/portal-review/${id}/remove?removed=${removed}`,{method:'POST'});await load();
  }catch(e:any){setMessage(e?.detail||e?.message||'Could not update review');}finally{setBusy(false);}}
  async function live(){setBusy(true);try{
    const r=await api<{published:number}>('/api/admin/release/portal-review/live',{method:'POST',body:JSON.stringify({ids:[...selected]})});
    setMessage(`${r.published} listings are now live.`);setSelected(new Set());await load();
  }catch(e:any){setMessage(e?.detail||e?.message||'Could not publish');}finally{setBusy(false);}}
  const rows=review?.rows??[];
  const ready=rows.filter(r=>!r.removed&&!r.held);
  const held=rows.filter(r=>!r.removed&&r.held);
  const filtered=rows.filter(r=>filter==='removed'?r.removed:!r.removed&&(filter==='all'||(filter==='ready'?!r.held:r.held)));
  const lastPage=Math.max(0,Math.ceil(filtered.length/20)-1);
  const currentPage=Math.min(page,lastPage);
  const visible=filtered.slice(currentPage*20,currentPage*20+20);
  const button='rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-40';
  return <section className="mt-4 rounded-xl border border-line bg-white p-4">
    <h3 className="font-bold text-lg">Run pricing → View → Live</h3>
    <p className="mt-1 text-sm text-muted">Select listings in the downloaded list below and run pricing. Open View to review the results, then select ready listings and press Live.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      <button className={`${button} bg-[#1c1f23] text-white`} disabled={busy||active(job)||!ids.length} onClick={()=>price()}>1. Run pricing{active(job)?'…':''}</button>
      <button className={button} disabled={!review?.rows.length} onClick={()=>setView(!view)}>2. View ({review?.rows.filter(r=>!r.removed).length??0})</button>
      <button className={`${button} bg-[#1c1f23] text-white`} disabled={busy||active(job)||!review?.publish_enabled||!selected.size} onClick={live}>3. Live{selected.size?` (${selected.size})`:''}</button>
    </div>
    {review&&<p className="mt-3 text-sm" role="status">{ready.length} ready to publish · {held.length} need attention · {rows.filter(r=>r.removed).length} deleted from review</p>}
    {!ids.length&&!active(job)&&<p className="mt-2 text-sm text-muted">Choose at least one downloaded listing below to start pricing. Existing drafts can be repriced from View.</p>}
    {job&&<div className="mt-3 text-sm" role="status"><div>{job.stage} · {job.progress_pct??0}%</div>
      <progress aria-label="Pricing progress" className="w-full mt-1" value={job.progress_pct??0} max={100}/>
      {job.error_message&&<p>{job.error_message}</p>}</div>}
    {review&&!review.publish_enabled&&<p className="mt-3 text-sm text-[#785000]">Live is currently blocked while the outstanding pricing validation is resolved. You can price and review privately.</p>}
    {message&&<p className="mt-2 text-sm" role="status">{message}</p>}
    {view&&<div className="mt-4">
      <p className="text-sm text-muted mb-3">Tick the priced listings you want live. Delete removes a listing from this review; Undo restores it. Held listings cannot go live.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-sm">Show <select aria-label="Review filter" className="rounded border border-line p-2" value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(0);}}>
          <option value="all">All current drafts ({ready.length+held.length})</option><option value="ready">Ready ({ready.length})</option><option value="held">Need attention ({held.length})</option><option value="removed">Deleted ({rows.filter(r=>r.removed).length})</option>
        </select></label>
        <button className={button} disabled={busy||active(job)||!ready.length} onClick={()=>{setSelected(new Set(ready.slice(0,200).map(r=>r.id)));setFilter('ready');setPage(0);}}>Select ready listings (up to 200)</button>
        {!!selected.size&&<button className={button} onClick={()=>setSelected(new Set())}>Clear selection</button>}
      </div>
      {filtered.length===0&&<p className="my-3 text-sm">{filter==='ready'?'No listings are ready yet. Choose Need attention to see the reason for each hold.':'No listings in this view.'}</p>}
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Live</th><th className="text-left">Property</th><th>Asking</th><th>Valuation</th><th>Review</th></tr></thead>
        <tbody>{visible.map(r=><tr key={r.id} className={`border-t border-line ${r.removed?'opacity-50':''}`}>
          <td><input aria-label={`Select ${r.address} for Live`} type="checkbox" disabled={r.removed||r.held||!r.value||busy||active(job)} checked={selected.has(r.id)} onChange={e=>setSelected(s=>{const n=new Set(s);e.target.checked?n.add(r.id):n.delete(r.id);return n;})}/></td>
          <td className="p-3">{r.image_url&&<img src={r.image_url} alt={`Photo of ${r.address}`} loading="lazy" className="mb-2 h-20 w-28 rounded object-cover"/>}{r.address}<div className="text-xs text-muted">{r.suburb} · Floor {r.floor??'—'} m² · Land {r.land??'—'} m²</div>{r.reason&&<div className="text-xs text-[#785000]">{r.reason}</div>}</td>
          <td className="p-2 whitespace-nowrap">{fmtMoney(r.asking)}</td><td className="p-2 whitespace-nowrap">{fmtMoney(r.value)}</td>
          <td>{!r.removed&&<button className={button} disabled={busy||active(job)} onClick={()=>price([r.id])}>Run pricing again</button>}<button className={button} disabled={busy||active(job)} onClick={()=>remove(r.id,!r.removed)}>{r.removed?'Undo delete':'Delete'}</button></td>
        </tr>)}</tbody></table></div>
      {filtered.length>20&&<div className="mt-3 flex items-center gap-3"><button className={button} disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><span>Page {currentPage+1} of {lastPage+1}</span><button className={button} disabled={currentPage===lastPage} onClick={()=>setPage(currentPage+1)}>Next</button></div>}
    </div>}
  </section>;
}
