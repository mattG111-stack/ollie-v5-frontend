"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type ForSaleRow } from "../lib/api";

export function propertyIds(answer: string): number[] {
  return [...new Set([...answer.matchAll(/\]\(\/property\/(\d+)\)/g)].map(m => Number(m[1])).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 4);
}
export function priceComparison(asking: number | null, estimate: number | null) {
  if (asking == null || estimate == null || !Number.isFinite(asking) || !Number.isFinite(estimate) || asking <= 0 || estimate <= 0) return null;
  const gap = estimate - asking;
  return { gap, uplift: gap / asking * 100, discount: gap / estimate * 100 };
}
const money = (n: number | null | undefined) => n != null && Number.isFinite(n) && n > 0 ? new Intl.NumberFormat("en-NZ", {style:"currency",currency:"NZD",maximumFractionDigits:0}).format(n) : "Not recorded";

export default function OllieEvidence({ answer }: { answer: string }) {
  const key = propertyIds(answer).join(",");
  const [rows, setRows] = useState<Array<{id:number; property?:ForSaleRow}>>([]);
  const [loading,setLoading]=useState(false);
  const [checked,setChecked]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(() => {
    let active=true;
    setRows([]); setChecked("");
    if (!key) {setLoading(false); return;}
    setLoading(true);
    Promise.all(key.split(",").map(async id => {
      try {return {id:Number(id), property:await api<ForSaleRow>(`/api/properties/${id}`)};}
      catch {return {id:Number(id)};}
    })).then(result => {if(active) {setRows(result); setLoading(false);setChecked(new Date().toLocaleTimeString("en-NZ",{hour:"2-digit",minute:"2-digit"}));}});
    return () => {active=false;};
  },[key,answer,retry]);
  if (!key) return null;
  const loaded=rows.filter(row=>row.property).length;
  const failed=rows.length-loaded;
  return <section aria-label="Property facts from Apex records" style={{ border:"1px solid #43566a",borderRadius:16,padding:16,background:"#142231",color:"#edf5ff" }}>
    <h3 style={{margin:"0 0 6px",fontSize:18}}>Compare the recorded facts</h3>
    <p style={{fontSize:12,color:"#b4c6d8",margin:"0 0 14px"}}>{checked ? `${loaded} of ${rows.length} linked records loaded. Checked at ${checked}.` : 'Checking linked Apex property records.'} This check time is not the age of the listing. Up to four linked properties.</p>
    {loading && <p role="status">Loading property evidence…</p>}
    {!loading && failed>0 && <button type="button" onClick={()=>setRetry(n=>n+1)} style={{marginBottom:12,padding:"8px 12px",borderRadius:8,border:"1px solid #9adeff",color:"#9adeff",background:"transparent",cursor:"pointer"}}>Retry property evidence</button>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(min(100%, 230px), 1fr))",gap:12}}>
    {rows.map(({id,property:p}) => {
      if (!p) return <p key={id} role="status">Property {id} could not be checked. <Link href={`/property/${id}`}>Open its record</Link></p>;
      const comparison=priceComparison(p.asking_price,p.fair_value);
      const facts=[['Asking price',money(p.asking_price)],['Apex estimate',money(p.fair_value)],['Recorded type',p.property_type || 'Not recorded'],['Recorded title',p.type_of_title || 'Not recorded'],['Bedrooms / bathrooms',`${p.beds ?? '—'} / ${p.baths ?? '—'}`],['Valuation comparables',p.comps_used == null ? 'Not recorded' : String(p.comps_used)]];
      return <article key={id} style={{background:"#1b2c3e",padding:14,borderRadius:12,border:"1px solid #344c63"}}>
        <Link href={`/property/${id}`} style={{fontSize:16,fontWeight:700,color:"#9adeff"}}>{p.address || `Property ${id}`}</Link>
        <p style={{margin:"5px 0 12px",fontSize:13,color:"#b4c6d8"}}>{p.suburb || 'Suburb not recorded'}{p.off_market ? ' · Off market' : ''}</p>
        <dl style={{margin:0}}>{facts.map(([name,value])=><div key={name} style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:13,padding:"5px 0"}}><dt style={{color:"#b4c6d8"}}>{name}</dt><dd style={{margin:0,textAlign:"right"}}>{value}</dd></div>)}</dl>
        {p.asking_basis && p.asking_basis !== 'advertised' && <p style={{fontSize:12}}>Price basis: {p.asking_basis}</p>}
        {comparison && <p style={{fontSize:13,borderTop:"1px solid #344c63",paddingTop:10}}>{comparison.discount >= 0 ? `${comparison.discount.toFixed(1)}% below` : `${Math.abs(comparison.discount).toFixed(1)}% above`} Apex estimate · {comparison.uplift.toFixed(1)}% value uplift over asking.</p>}
        <p style={{fontSize:12,color:"#b4c6d8"}}>Condition and reasons for pricing are not verified here. An estimated value gap is not profit.</p>
        <Link href={`/property/${id}`} style={{fontSize:13,color:"#9adeff"}}>View property and sold evidence →</Link>
      </article>;
    })}
    </div>
  </section>;
}
