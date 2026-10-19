"use client";
import { useState } from "react";
import { api } from "@/lib/api";

type Queue = {batch_id:number;corelogic_job_id:number;scope_total:number;observed:number;remaining:number;source_review_count:number;source_reviews:{property_id:number;address:string;issues:string;source_url:string}[];listings:{id:number;address:string;suburb:string;source_url:string|null;property_type:string|null;missing:string[]}[]};
export default function BrowserEnrichment({batchId}:{batchId:number|null}) {
  const [queue,setQueue]=useState<Queue|null>(null);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
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
      setMessage(`${result.filled} missing facts saved. ${result.results.filter(r=>r.status==='review').length} listings need source review. Updated facts were repriced; nothing was published.`);
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
      {queue.source_review_count>0&&<div className="mt-2 text-sm"><p>{queue.source_review_count} held for source review:</p><ul>{queue.source_reviews.map(r=><li key={r.property_id}>{r.address} · {r.issues} · <a className="text-blue" href={r.source_url} target="_blank" rel="noreferrer">View source ↗</a></li>)}</ul></div>}
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
