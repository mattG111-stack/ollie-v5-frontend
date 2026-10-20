"use client";
import { useState } from "react";
import { api } from "@/lib/api";

type Report = { batch_id: number | null; batch_status: string; total_rows: number; matched_properties: number;
 median_difference_pct: number | null; median_absolute_difference_pct: number | null; over_20_pct: number;
 oldest_observation: string | null; newest_observation: string | null; excluded: Record<string,number>; note: string;
 rows: {id:number;address:string;suburb:string;apex:number;hougarden:number;observed_date:string;difference_pct:number;source_url:string;held:boolean}[] };
const money = (n:number) => n.toLocaleString("en-NZ", {style:"currency",currency:"NZD",maximumFractionDigits:0});
const pct = (n:number|null) => n == null ? "—" : `${n.toFixed(1)}%`;
export default function HouGardenBenchmark() {
 const [report,setReport]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 async function load() { setBusy(true);setError(null);try {setReport(await api<Report>("/api/admin/release/hougarden-benchmark"));} catch {setError("Comparison could not load. Try again.");} finally {setBusy(false);} }
 return <section className="bg-white border border-line rounded-card p-5 mt-4" aria-label="HouGarden benchmark">
 <div className="flex justify-between items-center gap-3"><h2 className="font-semibold">Apex and HouGarden comparison</h2><button className="border border-line rounded px-3 py-2 text-sm" disabled={busy} onClick={load}>{busy?"Loading…":report?"Refresh comparison":"Compare saved estimates"}</button></div>
 <p className="text-sm text-muted mt-2">Exact properties with a saved HouGarden estimate, original source evidence and an observation date. A comparison of estimates, not confirmed sale prices.</p>
 {error&&<p role="alert" className="text-red-700 mt-2">{error}</p>}
 {report&&<><p className="text-sm mt-3">Batch {report.batch_id??"—"} · {report.batch_status} · {report.matched_properties} matched properties from {report.total_rows} rows</p>
 <div className="grid sm:grid-cols-3 gap-3 mt-3"><div>Median Apex difference<br/><strong>{pct(report.median_difference_pct)}</strong></div><div>Median absolute gap<br/><strong>{pct(report.median_absolute_difference_pct)}</strong></div><div>More than 20% apart<br/><strong>{report.over_20_pct??0}</strong></div></div>
 {report.oldest_observation&&<p className="text-xs text-muted mt-3">Source records received: {report.oldest_observation} to {report.newest_observation}</p>}
 <p className="text-xs text-muted mt-2">Excluded: {Object.entries(report.excluded).map(([k,v])=>`${k.replaceAll("_"," ")}: ${v}`).join(" · ")}</p>
 {!report.matched_properties&&<p className="text-sm mt-3">No dated, verified matches available in this batch.</p>}
 {!!report.rows.length&&<div className="overflow-x-auto mt-4"><table className="w-full text-sm text-left"><thead><tr><th>Property</th><th>Apex</th><th>HouGarden</th><th>Difference</th><th>Record received</th></tr></thead><tbody>{report.rows.map(r=><tr key={r.id} className="border-t border-line"><td className="py-2 pr-3"><a href={r.source_url} target="_blank" rel="noreferrer" className="text-blue">{r.address}, {r.suburb}</a>{r.held&&<span className="block text-xs text-muted">Held from customer feed</span>}</td><td className="pr-3">{money(r.apex)}</td><td className="pr-3">{money(r.hougarden)}</td><td>{pct(r.difference_pct)}</td><td>{r.observed_date}</td></tr>)}</tbody></table></div>}
 <p className="text-xs text-muted mt-3">{report.note}</p></>}
 </section>;
}
