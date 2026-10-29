"use client";
import { HistoryResponse } from "@/lib/api";

const money = (n: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(n);
const change = (n: number, base: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + money(Math.abs(n)) + " (" + (n > 0 ? "+" : "") + (100 * n / base).toFixed(1) + "%)";

export default function AskingPriceHistory({ history }: { history: HistoryResponse | null }) {
  const points = [...(history?.asking_observations ?? [])].sort((a,b) => a.recorded_at.localeCompare(b.recorded_at));
  const priced = points.filter(p => typeof p.asking_price === "number" && Number.isFinite(p.asking_price) && p.asking_price > 0);
  const first = priced[0]?.asking_price;
  const last = priced[priced.length-1]?.asking_price;
  const needsReview = priced.some((p,i) => i > 0 && Math.abs(p.asking_price / priced[i-1].asking_price - 1) > .5);
  return <section aria-label="Asking price history" style={{marginTop:20}}>
    <h3>Asking price over time</h3>
    <p>Approved advertised prices, retained across uploads. Dates show when Apex received the price, not the exact date the seller changed it. Apex valuations and estimated buy prices are separate.</p>
    {needsReview ? <p>Large recorded differences need review before an overall price change can be stated.</p> : first != null && last != null && priced.length > 1 && <p><strong>Total recorded movement: {change(last-first,first)}</strong></p>}
    {points.length ? <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
      <thead><tr><th>Recorded date</th><th>Asking price</th><th>Change from previous record</th></tr></thead>
      <tbody>{points.map((p,i) => {
        const value=p.asking_price;
        const prev=points[i-1]?.asking_price;
        const valid=typeof value==="number" && Number.isFinite(value) && value>0;
        const prior=typeof prev==="number" && Number.isFinite(prev) && prev>0;
        const date = new Date(p.recorded_at);
        const rowKey = `${date.getTime()}-${i}`;
        const recordedDate = Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-NZ", {
          day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland",
        }) : "Date unavailable";
        return <tr key={rowKey}>
          <td style={{padding:"10px 0"}}>{recordedDate}</td>
          <td>{valid ? money(value!) : "Not recorded"}</td>
          <td>{!i ? "First record" : valid && prior ? value===prev ? "Unchanged" : Math.abs(value! / prev! - 1) > .5 ? "Large difference — needs review" : change(value!-prev!,prev!) : "Not comparable"}</td>
        </tr>;
      })}</tbody>
    </table></div> : <p>No recorded asking-price history available.</p>}
    {priced.length===1 && <p>One asking price recorded; no change can be calculated yet.</p>}
  </section>;
}
