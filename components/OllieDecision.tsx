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

export function investigationQuestion(id: number, answer: string) {
  const ids = [...new Set([...answer.matchAll(/\]\(\/property\/(\d+)\)/g)].map(m => Number(m[1])).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 4);
  return `Investigate only Apex property ID ${id}, selected from the latest shortlist (IDs ${ids.join(", ")}). Keep my existing area, budget, bedroom and property filters; do not introduce other properties. Recheck its current record. Explain why its recorded facts may fit my brief and the trade-offs, then show supporting sold evidence with dates and sample sizes. Separate facts, estimates, record conflicts and unknowns. Do not infer condition, consent, seller motivation or guaranteed profit. End with the most useful next check. If earlier filters are missing, ask me to confirm them rather than guessing.`;
}

export default function OllieDecision({ rows, answer, onAsk, disabled = false }: { rows: EvidenceRow[]; answer: string; onAsk?: (question: string, label?: string) => void; disabled?: boolean }) {
  const facts = decisionFacts(rows);
  if (!facts.length) return null;
  const values = facts.flatMap(r => [r.property.asking_price, r.property.fair_value]).filter(positive);
  const maximum = Math.max(1, ...values);
  return <section aria-label="Shortlist decision guide" style={{margin:"16px 0",borderRadius:14,background:"#101d2a",padding:16}}>
    <h3 style={{margin:"0 0 6px",fontSize:20}}>{facts.length > 1 ? "What stands out" : "Check this property"}</h3>
    <p style={{margin:"0 0 16px",fontSize:13,color:"#b4c6d8",lineHeight:1.5}}>{facts.length > 1 ? "Compare this shortlist, then choose what to investigate. Highlights describe recorded differences, not an overall recommendation." : "Check the recorded asking price against the Apex estimate, then review the supporting evidence."}</p>
    <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12,marginBottom:14}}><span style={{color:"#9adeff"}}>● Asking price</span><span style={{color:"#debeff"}}>● Apex estimate</span></div>
    {facts.map(({id,property:p,badges,checks}) => <article key={id} style={{padding:"16px 0",borderTop:"1px solid #344c63"}}>
      <a href={`/property/${id}`} style={{color:"#eef6ff",fontSize:16,fontWeight:700}}>{p.address || `Property ${id}`}</a>
      <p style={{margin:"5px 0 10px",fontSize:12,color:"#b4c6d8"}}>Land: {area(p.land_area_m2)} · Floor: {area(p.floor_area_m2)}</p>
      {!!badges.length && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{badges.map(badge=><span key={badge} style={{fontSize:11,border:"1px solid #456a80",borderRadius:6,padding:"4px 7px",color:"#bde8ff"}}>{badge} · in this shortlist</span>)}</div>}
      <div aria-label={`Price comparison for ${p.address || id}`}>
        {([{label:"Asking price",value:p.asking_price,color:"#79cefa"},{label:"Apex estimate",value:p.fair_value,color:"#c4a0e8"}]).map(item=><div key={item.label} style={{margin:"8px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:13,marginBottom:5}}><span>{item.label}</span><strong>{money(item.value)}</strong></div>
          {positive(item.value) && <div aria-hidden="true" style={{height:7,borderRadius:4,background:"#23374a"}}><div style={{width:`${item.value / maximum * 100}%`,height:"100%",borderRadius:4,background:item.color}} /></div>}
        </div>)}
      </div>
      <p style={{fontSize:13,lineHeight:1.6,color:"#cfdae5",margin:"12px 0 8px"}}><strong>Next check: </strong>{checks[0]}</p>
      {checks.length > 1 && <details style={{fontSize:12,color:"#b4c6d8",marginBottom:10}}><summary style={{cursor:"pointer"}}>Other checks ({checks.length - 1})</summary><ul>{checks.slice(1).map(check=><li key={check} style={{marginTop:6}}>{check}</li>)}</ul></details>}
      {onAsk && <button type="button" disabled={disabled} onClick={()=>onAsk(investigationQuestion(id,answer),`Investigate ${p.address || `property ${id}`}`)} style={{padding:"9px 12px",borderRadius:9,border:"1px solid #5284a0",background:"#193b50",color:"#e5f5ff",fontFamily:"inherit",cursor:disabled?"default":"pointer",opacity:disabled?.5:1}}>Investigate this property →</button>}
    </article>)}
    <p style={{fontSize:12,color:"#b4c6d8",lineHeight:1.5,marginBottom:0}}>Bars share the same zero baseline and price scale. Estimates are not sale prices or profit. Condition and feasibility still need checking.{onAsk ? " Investigating a property sends one question using your normal allowance; this comparison itself is free." : ""}</p>
  </section>;
}
