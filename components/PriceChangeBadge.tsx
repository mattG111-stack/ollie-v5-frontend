import type { AskingPriceChange } from "@/lib/api";

export default function PriceChangeBadge({change}: {change?: AskingPriceChange | null}) {
  if (!change) return null;
  const {previous_price: before, current_price: now, change_dollars: delta} = change;
  const date = new Date(change.recorded_at);
  if (![before, now, delta, change.change_pct].every(Number.isFinite) || before <= 0 || now <= 0 ||
      delta === 0 || Math.abs(now - before - delta) > 0.01 ||
      Math.abs((now / before - 1) * 100 - change.change_pct) > 0.02 ||
      Math.abs(change.change_pct) > 50 || !Number.isFinite(date.getTime())) return null;
  const money = (n: number) => new Intl.NumberFormat("en-NZ", {
    style: "currency", currency: "NZD", maximumFractionDigits: 0,
  }).format(n);
  return <div aria-label="Recorded asking-price change" style={{marginTop: 10, fontSize: 13, lineHeight: 1.5}}>
    <strong>{delta < 0 ? "Price reduced" : "Price increased"} {money(Math.abs(delta))} ({Math.abs(change.change_pct).toFixed(1)}%)</strong>
    <div style={{fontSize: 11, opacity: .8}}>Previously {money(before)} · recorded {date.toLocaleDateString("en-NZ", {
      day: "numeric", month: "short", year: "numeric", timeZone: "Pacific/Auckland",
    })}</div>
  </div>;
}
