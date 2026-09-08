"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { mountStreet, streetChain } from "@/lib/basemap";
import { askingText, fmtDayDate, fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

/* Suburb map for the trends page: live for-sale AND recent sold houses on one
 * map, so you see the whole picture for a suburb at a glance. For-sale points
 * are coloured by the SAME signal palette as the main deal map (underpriced /
 * subdividable / other), so a colour means the same thing everywhere in the app.
 * Plain circle markers — a single suburb is a few dozen points, no clustering
 * needed. Free CARTO tiles, no key. */

type Pt = {
  id: number; lat: number; lng: number;
  address?: string | null; price?: number | null; listing_type?: string | null;
  sold_date?: string | null;
  underpriced?: boolean; subdividable?: boolean;
};
type Resp = { points: Pt[] };

// Mirrors MapView's palette so the legend reads consistently across the app.
const COLOR = {
  underpriced: "#1B2026",   // near-black — the strongest signal
  subdividable: "#FF6A00",  // vivid orange
  forSale: "#9AA6B6",       // pale grey — listed, no flag
  sold: "#C2CAD4",          // lightest — recent sales, context only
};

type Counts = { underpriced: number; subdividable: number; other: number; sold: number };
const ZERO: Counts = { underpriced: 0, subdividable: 0, other: 0, sold: 0 };

/* How far back the SOLD dots reach. Six months to start with.
 *
 * Every sale a suburb has ever recorded is 2,950 dots over Flat Bush: every
 * street solid grey, and the live listings you came to look at buried inside
 * it. Six months is what a buyer means by "what has been selling around here".
 * The rest are a click away for anyone who wants the longer view — 0 means no
 * limit, and it is deliberately last. */
const RANGES = [
  { months: 3, label: "3m" },
  { months: 6, label: "6m" },
  { months: 12, label: "1y" },
  { months: 24, label: "2y" },
  { months: 0, label: "All" },
] as const;
const DEFAULT_MONTHS = 6;

export default function SuburbTrendsMap({ suburb, height = "70vh" }: { suburb: string; height?: string }) {
  const { t } = useT();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [months, setMonths] = useState<number>(DEFAULT_MONTHS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { center: [-36.85, 174.76], zoom: 12, scrollWheelZoom: true });
      // Same base as every other map — see lib/basemap.ts for why it is no
      // longer CARTO.
      mountStreet(L, map, await streetChain());
      mapRef.current = map;
      setReady(true);
    })();
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, []);

  useEffect(() => {
    if (!ready || !suburb) return;
    const L = LRef.current, map = mapRef.current;
    let alive = true;
    (async () => {
      const q = encodeURIComponent(suburb);
      // months=0 means "all of it" — send no window rather than a zero the
      // backend would reject.
      const win = months > 0 ? `&sold_months=${months}` : "&sold_months=120";
      const [sale, sold] = await Promise.all([
        api<Resp>(`/api/properties/map?dataset=for_sale&suburb=${q}`).catch(() => ({ points: [] })),
        api<Resp>(`/api/properties/map?dataset=sold&suburb=${q}${win}`).catch(() => ({ points: [] })),
      ]);
      if (!alive) return;
      if (layerRef.current) map.removeLayer(layerRef.current);
      const group = L.layerGroup();
      const bounds: [number, number][] = [];
      const tally: Counts = { ...ZERO };

      const add = (pts: Pt[], isSold: boolean) => {
        for (const p of pts) {
          if (p.lat == null || p.lng == null) continue;
          // Colour by signal, strongest first — same precedence as the deal map.
          const color = isSold ? COLOR.sold
            : p.underpriced ? COLOR.underpriced
            : p.subdividable ? COLOR.subdividable
            : COLOR.forSale;
          if (isSold) tally.sold++;
          else if (p.underpriced) tally.underpriced++;
          else if (p.subdividable) tally.subdividable++;
          else tally.other++;

          const m = L.circleMarker([p.lat, p.lng], {
            // Flagged listings sit slightly larger so the opportunities read first.
            radius: isSold ? 5 : (p.underpriced || p.subdividable ? 8 : 6),
            color: "#fff", weight: 2, fillColor: color, fillOpacity: 1,
          });
          // A for-sale listing with no advertised price says how it sells
          // instead of "Asking —", and the label goes with the number.
          const priceBody = isSold
            ? `${t("map.sold")} ${p.price ? fmtMoneyShort(p.price) : "—"}`
            : p.price != null
              ? `${t("map.asking")} ${fmtMoneyShort(p.price)}`
              : askingText(null, p.listing_type, t, true);
          const priceLine = `${priceBody}${p.sold_date ? ` · ${fmtDayDate(p.sold_date)}` : ""}`;
          const tag = p.underpriced ? t("ptable.underpriced") : p.subdividable ? t("nav.subdividable") : "";
          m.bindPopup(
            `<div style="min-width:150px"><b>${p.address ?? ""}</b><br/>${priceLine}` +
            (tag ? `<br/><span style="font-size:11px;font-weight:700;color:${color}">${tag}</span>` : "") +
            (isSold ? "" : `<br/><a href="/property/${p.id}" style="display:inline-block;margin-top:6px;color:#2E353D;font-weight:700;font-size:12px;text-decoration:none">${t("map.viewProperty")} →</a>`) +
            `</div>`
          );
          group.addLayer(m);
          bounds.push([p.lat, p.lng]);
        }
      };
      add(sold.points, true);    // sold underneath — context
      add(sale.points, false);   // live listings on top
      group.addTo(map);
      layerRef.current = group;
      setCounts(tally);
      if (bounds.length) map.fitBounds(bounds as any, { padding: [30, 30], maxZoom: 15 });
    })();
    return () => { alive = false; };
  }, [ready, suburb, months, t]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={elRef} style={{ height, width: "100%", borderRadius: 12, overflow: "hidden", background: "#e8edf2" }} />
      {/* Key — TOP RIGHT, fully opaque with a real shadow so it reads over any
          tile. (It was 95%-white in a bottom corner, where the dots sat on
          whatever was underneath.) Top-left is Leaflet's zoom control. */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 500, background: "#fff",
        border: "1px solid #E4E9F0", borderRadius: 10, padding: "9px 12px", fontSize: 11.5,
        boxShadow: "0 4px 14px rgba(16,24,40,.18)",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <Row color={COLOR.underpriced} label={t("ptable.underpriced")} n={counts.underpriced} />
        <Row color={COLOR.subdividable} label={t("nav.subdividable")} n={counts.subdividable} />
        <Row color={COLOR.forSale} label={t("map.otherListing")} n={counts.other} />
        <Row color={COLOR.sold} label={t("map.soldSale")} n={counts.sold} />

        {/* The window the sold dots are drawn from. Sits under the sold row in
            the key, because that is the row it is about — a control in a corner
            of its own would be a second thing to find. */}
        <div style={{ display: "flex", gap: 3, marginTop: 2, paddingTop: 7,
                      borderTop: "1px solid #EEF1F6" }}>
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setMonths(r.months)}
              aria-pressed={months === r.months}
              title={r.months ? `Sales in the last ${r.months} months` : "Every sale on record"}
              style={{
                fontSize: 10.5, fontWeight: 700, padding: "3px 7px", borderRadius: 6,
                border: "1px solid " + (months === r.months ? "#2E353D" : "#E4E9F0"),
                background: months === r.months ? "#2E353D" : "#fff",
                color: months === r.months ? "#fff" : "#5A6B82",
                cursor: "pointer", lineHeight: 1.2,
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
      <span style={{
        width: 11, height: 11, borderRadius: "50%", background: color,
        border: "2px solid #fff", boxShadow: "0 0 0 1px #cbd5e1", flex: "none",
      }} />
      <span style={{ color: "#5A6B82" }}>{label} · <b style={{ color: "#14233A" }}>{n}</b></span>
    </span>
  );
}
