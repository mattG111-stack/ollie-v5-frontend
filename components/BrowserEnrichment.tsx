"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { fmtDayDate } from "@/lib/format";

const fieldLabels:Record<string,string>={property_type:"Property type",sale_method:"Sale method",floor_area_m2:"Floor area (m²)",land_area_m2:"Land area (m²)",cv_numeric:"Council valuation",beds:"Bedrooms",baths:"Bathrooms",cars:"Parking spaces"};
type SourceReview = {finding_id:number;property_id:number;address:string;issues:string;source_url:string;previous:Record<string,unknown>;proposed:Record<string,unknown>;evidence:string;observed_at:string};
type Queue = {batch_id:number;corelogic_job_id:number;scope_total:number;observed:number;remaining:number;source_review_count:number;source_reviews:SourceReview[];listings:{id:number;address:string;suburb:string;source_url:string|null;property_type:string|null;missing:string[]}[]};
export default function BrowserEnrichment({batchId,onChanged}:{batchId:number|null;onChanged?:()=>void}) {
  const [queue,setQueue]=useState<Queue|null>(null);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [review,setReview]=useState<SourceReview|null>(null);
  async function applyCorrection(){
    if(!review||!batchId)return;
    setBusy(true);setError("");
    try {
      const r=await api<{status:string;changed:string[];held:boolean;hold_reason:string|null}>("/api/admin/release/browser-enrichment/review",{method:"POST",body:JSON.stringify({batch_id:batchId,finding_id:review.finding_id})});
      setMessage(r.status==="already_applied"?"This correction was already saved.":`${r.changed.length} reviewed facts corrected and repriced. ${r.held?`Still held: ${r.hold_reason}`:"Ready for the normal publication checks."} Nothing was published.`);
      if(r.status==="applied")onChanged?.();
      setReview(null);setQueue(await api<Queue>(`/api/admin/release/browser-enrichment?batch_id=${batchId}`));
    } catch(e:any){setError(e.detail||e.message||"Could not apply the reviewed correction");}
    finally{setBusy(false);}
  }
  async function load(){
    if(!batchId)return;
    setBusy(true);setError("");
    try{setQueue(await api<Queue>(`/api/admin/release/browser-enrichment?batch_id=${batchId}`));}
    catch(e:any){setError(e.detail||e.message||"Could not load browser queue");}
    finally{setBusy(false);}
  }
  async function save(){
    setBusy(true);setError("");setMessage("");
    try{
      const observations=JSON.parse(input);
      if(!Array.isArray(observations)||!observations.length||observations.length>10)throw Error("Supply 1–10 browser observations");
      const result=await api<{filled:number;results:{property_id:number;status:string;filled:number;conflicts:string[]}[]}>("/api/admin/release/browser-enrichment",{method:"POST",body:JSON.stringify({batch_id:batchId,observations})});
      setMessage(`${result.filled} missing facts saved. ${result.results.filter(r=>r.status==='review').length} listings need source review. ${result.filled?'Updated facts were repriced.':'No facts changed, so no repricing was needed.'} Nothing was published.`);
      if(result.filled||result.results.some(r=>r.status==="review"))onChanged?.();
      setInput("");
      setQueue(await api<Queue>(`/api/admin/release/browser-enrichment?batch_id=${batchId}`));
    }catch(e:any){setError((e.detail||e.message||"Save failed")+". Earlier saved rows are retained; retrying the same observations is safe.");}
    finally{setBusy(false);}
  }
  return <section className="mt-4 border border-line rounded-xl p-4" aria-label="Browser enrichment">
    <h3 className="font-semibold">Enrich through the browser</h3>
    <p className="text-sm text-muted mt-1">Use the same browser method as Sourcing when the server connection fails. Only listings from this batch’s saved CoreLogic run are included. Saved rows are skipped on the next pass.</p>
    <p className="text-xs text-muted mt-1">Collection needs the laptop awake, online and Codex running. This button prepares the queue; it does not start a server scraper.</p>
    <button className="border border-line rounded-xl px-4 py-2 mt-3" disabled={busy||!batchId} onClick={load}>{busy?'Working…':'Load browser enrichment queue'}</button>
    {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}
    {message&&<p role="status" className="mt-2">{message}</p>}
    {queue&&<><p className="mt-3 text-sm font-semibold">Batch #{queue.batch_id} · {queue.observed}/{queue.scope_total} checked through the browser · {queue.remaining} remaining</p>
      {queue.source_review_count>0&&<div className="mt-2 text-sm"><p>{queue.source_review_count} held for source review:</p><ul>{queue.source_reviews.map(r=><li key={r.property_id}>{r.address} · {r.issues} · <a className="text-blue" href={r.source_url} target="_blank" rel="noreferrer">View source ↗</a> <button disabled={busy} onClick={()=>setReview(r)} className="underline ml-2">Review correction</button></li>)}</ul></div>}
      {review&&<div role="region" aria-label="Review source correction" className="mt-3 border border-line rounded-xl p-3"><h4 className="font-semibold">Review {review.address}</h4><p className="text-xs text-muted">Source observed {fmtDayDate(review.observed_at)}. This changes only the staged copy, retains the previous facts and reruns pricing.</p><table className="w-full text-sm mt-2"><thead><tr><th>Field</th><th>Saved</th><th>Source</th></tr></thead><tbody>{Object.entries(review.proposed).map(([key,value])=><tr key={key}><td>{fieldLabels[key]||key}</td><td>{String(review.previous[key]??"Missing")}</td><td>{String(value)}</td></tr>)}</tbody></table><pre className="text-xs whitespace-pre-wrap max-h-64 overflow-auto mt-2">{review.evidence}</pre><button disabled={busy} onClick={applyCorrection} className="border border-line rounded-xl px-4 py-2 mt-2">Apply reviewed source facts & reprice</button><button disabled={busy} onClick={()=>setReview(null)} className="px-4 py-2">Cancel</button></div>}
      <ul className="text-sm mt-2 space-y-1">{queue.listings.map(p=><li key={p.id}>#{p.id} · {p.address}, {p.suburb} · Missing: {p.missing.join(', ')||'sales history / source check'}{p.source_url&&/^https:\/\//.test(p.source_url)&&<a className="ml-2 text-blue" href={p.source_url} target="_blank" rel="noreferrer">Original listing ↗</a>}</li>)}</ul>
      <details className="mt-3"><summary className="cursor-pointer text-sm">Browser collector handoff</summary>
        <pre id="property-browser-queue" className="text-xs overflow-auto max-h-60 mt-2">{JSON.stringify(queue,null,2)}</pre>
        <label className="block text-sm mt-3" htmlFor="property-browser-observations">Browser observations</label>
        <textarea id="property-browser-observations" value={input} onChange={e=>setInput(e.target.value)} className="w-full border border-line rounded-lg p-2 mt-1 font-mono text-xs" rows={6}/>
        <p className="text-xs text-muted mt-1">Visible Trade Me facts only, with exact address, listing URL, observation time and a quote for each fact. Conflicts retain their evidence for review.</p>
        <button disabled={busy||!input.trim()} onClick={save} className="border border-line rounded-xl px-4 py-2 mt-2">Save browser observations</button>
      </details>
    </>}
  </section>;
}
