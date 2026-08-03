"use client";

import { useId, useMemo } from "react";
import { fmtMoneyShort } from "@/lib/format";

/* Price-over-time (X = when, Y = price) for a single property, hand-rendered as
 * SVG so we get the full editorial treatment recharts can't: a gradient area
 * under the sale journey, a "Today" guideline, and leader-line callouts fanned
 * out to the right so the three "now" markers never overlap.
 *
 *   • Past sales   the property's recorded sales, connected (slate)
 *   • Our value    what we independently think it's worth (fair_value, green)
 *   • Asking       the listed price (red)
 *   • Sell estimate what we think it'll transact at (expected_sale, charcoal),
 *                   with its confidence band (expected_sale_band)
 *
 * Colours are the property page's own palette (components/apex.tsx).
 */

export interface SalePoint {
  date: string;
  price: number;
  method?: string;
}

// apex.tsx palette.
const C = {
  slate: "#5A6B82",  // past sales
  green: "#22C55E",  // our value (good)
  greenInk: "#15803D",
  red: "#EF4444",    // asking (danger)
  char: "#333A43",   // sell estimate (accent)
  faint: "#7A8698",
  line: "#E1E7EF",
  ink: "#14233A",
  surface: "#FFFFFF",
};

/** Parse our mixed date encodings (epoch seconds string, ISO, or bare year) → ms. */
function toT(v: string | number | null | undefined): number | null {
  if (v == null || v === "" || v === "—") return null;
  const s = String(v);
  if (/^\d{4}$/.test(s)) return new Date(Number(s), 0, 1).getTime();
  const n = Number(v);
  if (Number.isFinite(n) && n > 0 && !s.includes("-")) return n < 1e12 ? n * 1000 : n;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

interface Props {
  sales: SalePoint[];
  asking: number | null;
  askingDate?: string | number | null;
  ourValue?: number | null;
  expectedSale?: number | null;
  expectedBand?: number | null;
  height?: number;
}

interface Marker {
  key: string;
  y: number;
  color: string;
  valColor: string;
  label: string;
  value: number;
  r: number;
  sub?: string | null;
}

export default function SaleHistoryChart({
  sales, asking, askingDate, ourValue, expectedSale, expectedBand, height = 300,
}: Props) {
  const uid = "shc" + useId().replace(/[^a-zA-Z0-9]/g, "");

  const pts = useMemo(
    () =>
      sales
        .map((s) => ({ t: toT(s.date), price: s.price }))
        .filter((s): s is { t: number; price: number } => s.t != null && s.price > 0)
        .sort((a, b) => a.t - b.t),
    [sales]
  );

  const tNow = useMemo(() => toT(askingDate) ?? Date.now(), [askingDate]);

  const layout = useMemo(() => {
    if (!pts.length) return null;
    const VB_W = 760, x0 = 56, xNow = 521, yTop = 42, yBot = 250;

    const band = expectedBand && expectedBand > 0 ? expectedBand : 0;
    const expLo = expectedSale ? expectedSale * (1 - band) : null;
    const expHi = expectedSale ? expectedSale * (1 + band) : null;

    const times = [...pts.map((p) => p.t), tNow];
    const tMin = Math.min(...times);
    const tMax = Math.max(...times);
    const tSpan = tMax - tMin || 1;
    const xOf = (t: number) => x0 + ((t - tMin) / tSpan) * (xNow - x0);

    const prices = [
      ...pts.map((p) => p.price),
      asking, ourValue, expectedSale, expLo, expHi,
    ].filter((v): v is number => v != null && v > 0);
    let pMin = Math.min(...prices);
    let pMax = Math.max(...prices);
    const padP = (pMax - pMin) * 0.16 || pMax * 0.1;
    pMin = Math.max(0, pMin - padP);
    pMax = pMax + padP;
    const yOf = (p: number) => yBot - ((p - pMin) / (pMax - pMin)) * (yBot - yTop);

    const ticks = [1, 2, 3].map((i) => pMin + ((pMax - pMin) * i) / 4);

    const markers: Marker[] = [];
    if (ourValue && ourValue > 0)
      markers.push({ key: "our", y: yOf(ourValue), color: C.green, valColor: C.greenInk, label: "OUR VALUE", value: ourValue, r: 5.5 });
    if (asking && asking > 0)
      markers.push({ key: "ask", y: yOf(asking), color: C.red, valColor: C.red, label: "ASKING", value: asking, r: 6.5 });
    if (expectedSale && expectedSale > 0)
      markers.push({
        key: "sell", y: yOf(expectedSale), color: C.char, valColor: C.char, label: "SELL ESTIMATE", value: expectedSale, r: 5.5,
        sub: band > 0 && expLo && expHi ? `±${Math.round(band * 100)}%  ·  ${fmtMoneyShort(expLo)}–${fmtMoneyShort(expHi)}` : null,
      });

    // Callout placement: keep true order, push down so labels never overlap.
    const minGap = 38;
    const cy: Record<string, number> = {};
    let prev = -Infinity;
    [...markers].sort((a, b) => a.y - b.y).forEach((m) => {
      const y = Math.max(m.y, prev + minGap);
      cy[m.key] = y;
      prev = y;
    });

    const linePts = pts.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(" ");
    const first = pts[0], last = pts[pts.length - 1];
    const areaD =
      `M${xOf(first.t).toFixed(1)},${yOf(first.price).toFixed(1)} ` +
      pts.slice(1).map((p) => `L${xOf(p.t).toFixed(1)},${yOf(p.price).toFixed(1)}`).join(" ") +
      ` L${xOf(last.t).toFixed(1)},${yBot} L${xOf(first.t).toFixed(1)},${yBot} Z`;

    const bandRect = band && expLo && expHi
      ? { x: xNow - 10, y: yOf(expHi), h: yOf(expLo) - yOf(expHi) }
      : null;

    // X labels: one per sale (its year) + Today.
    const years = pts.map((p) => ({ x: xOf(p.t), label: String(new Date(p.t).getFullYear()) }));

    return {
      VB_W, x0, xNow, yTop, yBot, xOf, yOf, ticks, markers, cy,
      linePts, areaD, bandRect, years,
      lastX: xOf(last.t), lastY: yOf(last.price), askY: asking ? yOf(asking) : null,
      saleLabels: pts.map((p) => ({ x: xOf(p.t), y: yOf(p.price), price: p.price })),
    };
  }, [pts, tNow, asking, ourValue, expectedSale, expectedBand]);

  if (!layout) return null;
  const L = layout;
  const VB_H = 300;

  return (
    <div style={{ width: "100%" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (prefers-reduced-motion: no-preference){
          .${uid} .an-area{opacity:0;animation:${uid}f .9s ease-out .45s forwards}
          .${uid} .an-line{stroke-dasharray:1600;stroke-dashoffset:1600;animation:${uid}d 1.15s ease-out .1s forwards}
          .${uid} .an-proj{opacity:0;animation:${uid}f .6s ease-out 1.15s forwards}
          .${uid} .an-pop{opacity:0;transform:scale(.3);transform-box:fill-box;transform-origin:center;animation:${uid}p .55s cubic-bezier(.2,.9,.3,1.35) forwards}
          .${uid} .an-cue{opacity:0;animation:${uid}f .55s ease-out forwards}
          .${uid} .d0{animation-delay:.9s}.${uid} .d1{animation-delay:1.03s}.${uid} .d2{animation-delay:1.16s}
        }
        @keyframes ${uid}d{to{stroke-dashoffset:0}}
        @keyframes ${uid}f{to{opacity:1}}
        @keyframes ${uid}p{to{opacity:1;transform:scale(1)}}
      `}} />
      <div style={{ width: "100%", height, overflowX: "auto" }} aria-label="Price over time: past sales, our value, asking and expected sell price">
        <svg className={uid} viewBox={`0 0 ${L.VB_W} ${VB_H}`} width="100%" style={{ display: "block", maxWidth: "100%", height: "auto" }} role="img">
          <defs>
            <linearGradient id={`${uid}area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C.slate} stopOpacity="0.20" />
              <stop offset="1" stopColor={C.slate} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines + y labels */}
          {L.ticks.map((tk, i) => (
            <g key={i}>
              <line x1={L.x0} y1={L.yOf(tk)} x2={L.xNow + 40} y2={L.yOf(tk)} stroke={C.line} strokeWidth="1" />
              <text x={L.x0 - 8} y={L.yOf(tk) + 3.5} fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="10" fill={C.faint} textAnchor="end">{fmtMoneyShort(tk)}</text>
            </g>
          ))}
          {/* x labels */}
          {L.years.map((y, i) => (
            <text key={i} x={y.x} y={L.yBot + 18} fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="10" fill={C.faint} textAnchor="middle">{y.label}</text>
          ))}

          {/* area under the journey */}
          <path className="an-area" d={L.areaD} fill={`url(#${uid}area)`} />

          {/* today guide */}
          <line x1={L.xNow} y1={L.yTop + 4} x2={L.xNow} y2={L.yBot + 2} stroke={C.faint} strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
          <text x={L.xNow} y={L.yTop - 4} fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="9" letterSpacing="1" fill={C.faint} textAnchor="middle" fontWeight="700">TODAY</text>

          {/* sale journey + projection to asking */}
          <polyline className="an-line" points={L.linePts} fill="none" stroke={C.slate} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          {L.askY != null && (
            <line className="an-proj" x1={L.lastX} y1={L.lastY} x2={L.xNow} y2={L.askY} stroke={C.slate} strokeWidth="1.6" strokeDasharray="4 4" opacity="0.55" />
          )}

          {/* past-sale points + value labels */}
          <g className="an-cue d0" fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="10.5" fill={C.slate} textAnchor="middle">
            {L.saleLabels.map((s, i) => <text key={i} x={s.x} y={s.y - 11}>{fmtMoneyShort(s.price)}</text>)}
          </g>
          <g className="an-cue d0">
            {L.saleLabels.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r="4.6" fill={C.slate} stroke={C.surface} strokeWidth="1.4" />)}
          </g>

          {/* sell-estimate band */}
          {L.bandRect && (
            <rect className="an-cue d2" x={L.bandRect.x} y={L.bandRect.y} width="20" height={Math.max(L.bandRect.h, 2)} rx="4" fill={C.char} opacity="0.14" />
          )}

          {/* leader lines + markers + callouts */}
          {L.markers.map((m, i) => {
            const cy = L.cy[m.key];
            return (
              <g key={m.key}>
                <path className="an-cue d2" d={`M${(L.xNow + m.r + 1).toFixed(1)},${m.y.toFixed(1)} L545,${cy.toFixed(1)}`} stroke={m.color} strokeWidth="1.2" fill="none" opacity="0.5" />
                <g className={`an-pop d${i}`}>
                  <circle cx={L.xNow} cy={m.y} r={m.r + 5.5} fill={m.color} opacity="0.16" />
                  <circle cx={L.xNow} cy={m.y} r={m.r} fill={m.color} stroke={C.surface} strokeWidth={m.r > 6 ? 2 : 1.8} />
                </g>
                <g className={`an-cue d${i}`}>
                  <circle cx="549" cy={cy} r="3" fill={m.color} />
                  <text x="557" y={cy - 3} fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="8.5" letterSpacing=".6" fill={C.faint}>{m.label}</text>
                  <text x="557" y={cy + 12} fontFamily="inherit" fontSize="14.5" fontWeight="800" fill={m.valColor} style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoneyShort(m.value)}</text>
                  {m.sub && <text x="557" y={cy + 25} fontFamily="'IBM Plex Mono', ui-monospace, monospace" fontSize="9" fill={C.faint} style={{ fontVariantNumeric: "tabular-nums" }}>{m.sub}</text>}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
