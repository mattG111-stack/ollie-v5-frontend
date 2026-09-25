import { buildPropertyInsights } from "../lib/ollie-insights";
import type { ForSaleRow } from "../lib/api";

export type EvidenceRow = { id: number; property?: ForSaleRow };
const positive = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const money = (v: number | null | undefined) => positive(v) ? new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumSignificantDigits: 21 }).format(v) : "Not recorded";
const area = (v: number | null | undefined) => positive(v) ? `${v.toLocaleString("en-NZ")} m²` : "Not recorded";

export function decisionFacts(rows: EvidenceRow[]) {
  const loaded = rows.filter((r): r is EvidenceRow & { property: ForSaleRow } => !!r.property);
  const names = loaded.map(r => (r.property.address || "").trim().toLowerCase().replace(/\s+/g, " "));
  const distinct = names.every(Boolean) && new Set(names).size === names.length;
  // Never announce a winner when another record or its measurement is missing.
  const complete = loaded.length === rows.length && loaded.length > 1 && distinct && loaded.every(r => !r.property.off_market);
  const canPrice = complete && loaded.every(r => positive(r.property.asking_price));
  const canLand = complete && loaded.every(r => positive(r.property.land_area_m2));
  const canDiscount = canPrice && loaded.every(r => positive(r.property.fair_value));
  const discount = (p: ForSaleRow) => (p.fair_value! - p.asking_price!) / p.fair_value!;
  return loaded.map(({ id, property: p }) => {
    const badges: string[] = [];
    const rank = (values: number[], value: number, min: boolean, label: string) => {
      const best = min ? Math.min(...values) : Math.max(...values);
      if (value === best) badges.push(`${values.filter(v => v === best).length > 1 ? "Joint " : ""}${label}`);
    };
    if (canPrice) rank(loaded.map(r => r.property.asking_price!), p.asking_price!, true, "lowest asking price");
    if (canLand) rank(loaded.map(r => r.property.land_area_m2!), p.land_area_m2!, false, "most land");
    if (canDiscount && discount(p) > 0) rank(loaded.map(r => discount(r.property)), discount(p), false, "largest estimated discount");
    const checks: string[] = [];
    if (p.off_market) checks.push("Marked off market — confirm availability before pursuing it.");
    if (!distinct) checks.push("Missing or repeated addresses prevent a reliable ranking; check record identities and conflicts.");
    if (!positive(p.asking_price)) checks.push("Confirm the advertised price or sale method before applying your budget.");
    if (!positive(p.land_area_m2)) checks.push("Confirm land area; the record cannot support a land-size decision.");
    if (!positive(p.fair_value)) checks.push("No usable Apex estimate is recorded; inspect comparable sales directly.");
    if (!positive(p.comps_used)) checks.push("Valuation comparable count is not recorded; inspect the supporting sales.");
    else checks.push(`Review the ${p.comps_used} valuation comparables for dates, similarity and any outliers.`);
    return { id, property: p, badges, checks };
  });
}

export function comparisonTakeaway(rows: EvidenceRow[]) {
  return buildPropertyInsights(rows).find(insight => insight.kind === "land_price_tradeoff")?.finding ?? null;
}

export function investigationQuestion(id: number, answer: string) {
  const ids = [...new Set([...answer.matchAll(/\]\(\/property\/(\d+)\)/g)].map(m => Number(m[1])).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 4);
  return `Investigate only Apex property ID ${id}, selected from the latest shortlist (IDs ${ids.join(", ")}). Keep my existing area, budget, bedroom and property filters; do not introduce other properties. Recheck its current record. Explain why its recorded facts may fit my brief and the trade-offs, then show supporting sold evidence with dates and sample sizes. Separate facts, estimates, record conflicts and unknowns. Do not infer condition, consent, seller motivation or guaranteed profit. End with the most useful next check. If earlier filters are missing, ask me to confirm them rather than guessing.`;
}

export default function OllieDecision({ rows, answer, onAsk, disabled = false }: { rows: EvidenceRow[]; answer: string; onAsk?: (question: string, label?: string) => void; disabled?: boolean }) {
  const facts = decisionFacts(rows);
  if (!facts.length) return null;
  const insights = buildPropertyInsights(rows);
  const values = facts.flatMap(r => [r.property.asking_price, r.property.fair_value]).filter(positive);
  const maximum = Math.max(1, ...values);
  return <section aria-label="Shortlist decision guide" style={{margin:"12px 0"}}>
    {!insights.length && <h3 style={{margin:"0 0 12px",fontSize:20}}>{facts.length > 1 ? "Compare your shortlist" : "Check this property"}</h3>}
    {insights.map(insight => <aside key={insight.kind} aria-label={insight.kind === "land_price_tradeoff" ? "Shortlist trade-off" : "Property insight"} style={{padding:"4px 0 16px",marginBottom:8,borderBottom:"1px solid #E5E7EB"}}>
      <h3 style={{margin:"0 0 10px",fontSize:21,lineHeight:1.3,color:"#26292D"}}>{insight.title}</h3>
      <p style={{margin:"6px 0",fontSize:15,lineHeight:1.6,color:"#26292D"}}>{insight.finding}</p>
      <details style={{fontSize:12,color:"#4E535A",margin:"12px 0"}}><summary style={{cursor:"pointer"}}>Evidence & limits · {insight.evidence.length} source values</summary>
        <p>{insight.relevance}</p>
        <p>{insight.scope.description}</p>
        <ul style={{paddingLeft:18}}>{insight.evidence.map(e => <li key={`${e.propertyId}-${e.field}`} style={{margin:"8px 0"}}><a href={e.href} style={{color:"#245EA8"}}>{e.address}</a>: {e.field === "asking_price" ? "asking price" : e.field === "fair_value" ? "Apex estimate" : "recorded land"} {e.unit === "NZD" ? money(e.value) : area(e.value)}</li>)}</ul>
        <ul style={{paddingLeft:18}}>{insight.limitations.map(limit => <li key={limit} style={{margin:"8px 0"}}>{limit}</li>)}</ul>
      </details>
      <a href={insight.nextAction.href} style={{display:"inline-block",color:"#245EA8",fontSize:13,fontWeight:700}}>{insight.nextAction.label} →</a>
    </aside>)}
    <details open={insights.length === 0}><summary style={{cursor:"pointer",fontSize:14,color:"#245EA8",padding:"10px 0",fontWeight:700}}>Compare prices & property details ({facts.length})</summary>
    <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,marginBottom:14}}><span style={{color:"#245EA8"}}>● Asking price</span><span style={{color:"#606D80"}}>● Apex estimate</span></div>
    {facts.map(({id,property:p,badges,checks}) => <article key={id} style={{padding:"20px 0",borderTop:"1px solid #DEDFE1"}}>
      <a href={`/property/${id}`} style={{color:"#26292D",fontSize:16,fontWeight:700}}>{p.address || `Property ${id}`}</a>
      <p style={{margin:"5px 0 10px",fontSize:12,color:"#595E65"}}>Land: {area(p.land_area_m2)} · Floor: {area(p.floor_area_m2)}</p>
      {!!badges.length && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{badges.map(badge=><span key={badge} style={{fontSize:11,border:"1px solid #E0E5EC",background:"#F5F7FA",borderRadius:6,padding:"4px 7px",color:"#49566A"}}>{badge} · in this shortlist</span>)}</div>}
      <div aria-label={`Price comparison for ${p.address || id}`}>
        {([{label:"Asking price",value:p.asking_price,color:"#245EA8"},{label:"Apex estimate",value:p.fair_value,color:"#606D80"}]).map(item=><div key={item.label} style={{margin:"8px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:13,marginBottom:7,fontVariantNumeric:"tabular-nums"}}><span>{item.label}</span><strong>{money(item.value)}</strong></div>
          {positive(item.value) && <div aria-hidden="true" style={{height:6,borderRadius:4,background:"#E6E8EB"}}><div style={{width:`${item.value / maximum * 100}%`,height:"100%",borderRadius:4,background:item.color}} /></div>}
        </div>)}
      </div>
      <p style={{fontSize:13,lineHeight:1.6,color:"#4E535A",margin:"12px 0 8px"}}><strong>Next check: </strong>{checks[0]}</p>
      {checks.length > 1 && <details style={{fontSize:12,color:"#595E65",marginBottom:10}}><summary style={{cursor:"pointer"}}>Other checks ({checks.length - 1})</summary><ul>{checks.slice(1).map(check=><li key={check} style={{marginTop:6}}>{check}</li>)}</ul></details>}
      {onAsk && <button type="button" disabled={disabled} onClick={()=>onAsk(investigationQuestion(id,answer),`Investigate ${p.address || `property ${id}`}`)} style={{padding:"9px 12px",borderRadius:9,border:"1px solid #C5C8CE",background:"#EFF0F2",color:"#26292D",fontFamily:"inherit",cursor:disabled?"default":"pointer",opacity:disabled?.5:1}}>Investigate this property →</button>}
    </article>)}
    <p style={{fontSize:12,color:"#595E65",lineHeight:1.5}}>Bars share the same zero baseline and price scale.{onAsk ? " Investigating uses one question; viewing this comparison is free." : ""}</p>
    </details>
    <p style={{fontSize:12,color:"#595E65",lineHeight:1.5,marginBottom:0}}>Estimates are not sale prices or profit. Condition and feasibility need checking.</p>
  </section>;
}
