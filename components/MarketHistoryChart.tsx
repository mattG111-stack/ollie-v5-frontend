"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

/* Market pulse over time — the pulse tiles answer "right now", this answers
 * "which way is it moving". A price line (left axis, $) with a count as bars
 * behind it (right axis). Plain inline SVG — no chart library, so it costs
 * nothing to load and matches the app's type scale.
 *
 * The server decides which history it can draw and says so in `basis`:
 *   listings — median asking week by week, plus our own valuation alongside it
 *   sales    — median sale price month by month, going back years
 * Either way the shape is identical, so only the labels change here. */

type Point = {
  batch_id: number;
  batch_date: string;
  label?: string;
  listing_count: number;
  median_asking: number | null;
  median_value: number | null;
  median_days_to_sell: number | null;
  underpriced: number;
};
type History = { region: string; points: Point[]; basis?: string };

const INK = "#1B2026";      // median asking — the primary line
const VALUE = "#8894A6";    // our valuation — secondary line
const BAR = "#E6EAF0";      // listing-count bars, behind everything

export default function MarketHistoryChart({ region = "Auckland", height = 210 }: { region?: string; height?: number }) {
  const { t } = useT();
  const [pts, setPts] = useState<Point[] | null>(null);
  const [basis, setBasis] = useState<string>("listings");
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    api<History>(`/api/dashboards/market-history?region=${encodeURIComponent(region)}`)
      .then((d) => {
        if (!alive) return;
        setPts(d.points);
        setBasis(d.basis || "listings");
      })
      .catch(() => alive && setPts([]));
    return () => { alive = false; };
  }, [region]);

  const geom = useMemo(() => {
    if (!pts || pts.length < 2) return null;
    const W = 1000, H = 300, padL = 8, padR = 8, padT = 16, padB = 26;
    const vals = pts.flatMap((p) => [p.median_asking, p.median_value].filter((v): v is number => v != null));
    if (!vals.length) return null;
    // Pad the value axis by 8% so the lines never touch the frame.
    const lo = Math.min(...vals) * 0.92, hi = Math.max(...vals) * 1.08;
    const maxCount = Math.max(...pts.map((p) => p.listing_count), 1);
    const x = (i: number) => padL + (i * (W - padL - padR)) / (pts.length - 1);
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
    const line = (key: "median_asking" | "median_value") =>
      pts.map((p, i) => (p[key] == null ? null : `${i === 0 ? "M" : "L"}${x(i)},${y(p[key]!)}`))
        .filter(Boolean).join(" ");
    return { W, H, padB, x, y, maxCount, askPath: line("median_asking"), valPath: line("median_value") };
  }, [pts]);

  if (pts && pts.length < 2) {
    return (
      <div style={{ fontSize: 12.5, color: "#7A8698", padding: "18px 0" }}>
        {t("today.historyThin")}
      </div>
    );
  }
  if (!pts || !geom) {
    return <div style={{ height, background: "#F6F8FB", borderRadius: 12 }} />;
  }

  const sales = basis === "sales";
  const priceLabel = sales ? t("today.medianSold") : t("today.medianAsking");
  const countLabel = sales ? t("today.salesPerMonth") : t("today.activeListings");
  const at = (p: Point) => p.label || p.batch_date;

  const shown = hover != null ? pts[hover] : pts[pts.length - 1];
  const first = pts[0];
  const pctMove =
    first.median_asking && shown.median_asking
      ? shown.median_asking / first.median_asking - 1
      : null;

  return (
    <div>
      {/* readout — the hovered (or latest) snapshot */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 18, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "#9AA6B6", fontWeight: 700 }}>
            {priceLabel} · {at(shown)}
          </div>
          <div className="tnum" style={{ fontSize: 24, fontWeight: 800, marginTop: 2 }}>
            {fmtMoneyShort(shown.median_asking)}
          </div>
        </div>
        {pctMove != null && (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: pctMove >= 0 ? "#16A34A" : "#D4503E" }}>
            {pctMove >= 0 ? "+" : ""}{(pctMove * 100).toFixed(1)}%{" "}
            {sales ? t("today.sinceWhen", { when: at(first) }) : t("today.sinceFirst")}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 14, fontSize: 11.5, color: "#5A6B82" }}>
          <Key color={INK} label={priceLabel} />
          {/* Nothing to compare a settled sale against, so no second line. */}
          {!sales && <Key color={VALUE} label={t("today.ourEstimate")} />}
          <Key color="#C9D2DD" label={countLabel} square />
        </div>
      </div>

      <svg viewBox={`0 0 ${geom.W} ${geom.H}`} preserveAspectRatio="none"
           style={{ width: "100%", height, display: "block", overflow: "visible" }}
           onMouseLeave={() => setHover(null)}>
        {/* listing-count bars (right axis, behind the lines) */}
        {pts.map((p, i) => {
          const bw = Math.max(6, (geom.W / pts.length) * 0.45);
          const bh = (p.listing_count / geom.maxCount) * (geom.H - geom.padB - 40);
          return (
            <rect key={`b${i}`} x={geom.x(i) - bw / 2} y={geom.H - geom.padB - bh}
                  width={bw} height={bh} fill={BAR} rx={2} />
          );
        })}
        {/* our valuation, then median asking on top */}
        <path d={geom.valPath} fill="none" stroke={VALUE} strokeWidth={2.5} strokeDasharray="6 5"
              strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={geom.askPath} fill="none" stroke={INK} strokeWidth={3}
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {/* point markers + invisible hover targets */}
        {pts.map((p, i) =>
          // Years of months is a lot of dots. Past a dozen points the line
          // carries the shape and only the hovered point needs a marker.
          p.median_asking == null || (pts.length > 14 && hover !== i) ? null : (
            <circle key={`d${i}`} cx={geom.x(i)} cy={geom.y(p.median_asking)}
                    r={hover === i ? 6 : 4} fill="#fff" stroke={INK} strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke" />
          )
        )}
        {pts.map((_, i) => (
          <rect key={`h${i}`} x={geom.x(i) - geom.W / pts.length / 2} y={0}
                width={geom.W / pts.length} height={geom.H} fill="transparent"
                onMouseEnter={() => setHover(i)} style={{ cursor: "crosshair" }} />
        ))}
      </svg>

      {/* x axis — first / middle / last snapshot dates */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#9AA6B6", marginTop: 4 }}>
        <span>{at(pts[0])}</span>
        {pts.length > 2 && <span>{at(pts[Math.floor(pts.length / 2)])}</span>}
        <span>{at(pts[pts.length - 1])}</span>
      </div>
    </div>
  );
}

function Key({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: square ? 10 : 3, borderRadius: square ? 2 : 2, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
