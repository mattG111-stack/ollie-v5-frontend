"use client";
import { HistoryResponse } from "@/lib/api";

const money = (n: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(n);
const change = (n: number, base: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n)) + " (" + (n > 0 ? "+" : "") + (100 * n / base).toFixed(1) + "%)";

export default function AskingPriceHistory({ history }: { history: HistoryResponse | null }) {
  const points = [...(history?.points ?? [])].sort((a,b) => a.batch_date.localeCompare(b.batch_date) || a.batch_id-b.batch_id);
  const priced = points.filter(p => typeof p.asking_price === "number" && Number.isFinite(p.asking_price) && p.asking_price > 0);
  const first = priced[0]?.asking_price;
  const last = priced[priced.length-1]?.asking_price;
  return <section aria-label="Asking price history" style={{marginTop:20}}>
    <h3>Asking price over time</h3>
    <p>Dates show when Apex recorded each uploaded price, not the exact date the seller changed it.</p>
    {first != null && last != null && priced.length > 1 && <p><strong>Total recorded movement: {change(last-first,first)}</strong></p>}
    {points.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
      <thead><tr><th>Recorded date</th><th>Asking price</th><th>Change from previous record</th></tr></thead>
      <tbody>{points.map((p,i) => {
        const value=p.asking_price;
        const prev=points[i-1]?.asking_price;
        const valid=typeof value==="number" && Number.isFinite(value) && value>0;
        const prior=typeof prev==="number" && Number.isFinite(prev) && prev>0;
        return <tr key={p.batch_id}>
          <td style={{padding:"10px 0"}}>{p.batch_date || "Date unavailable"}</td>
          <td>{valid ? money(value!) : "Not recorded"}</td>
          <td>{!i ? "First record" : valid && prior ? value===prev ? "Unchanged" : change(value!-prev!,prev!) : "Not comparable"}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p>No recorded asking-price history available.</p>}
    {priced.length===1 && <p>One asking price recorded; no change can be calculated yet.</p>}
  </section>;
}
