"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

/* Suburb map for the trends page: live for-sale AND recent sold houses on one
 * map, so you see the whole picture for a suburb at a glance. For-sale points
 * are coloured by the SAME signal palette as the main deal map (underpriced /
 * subdividable / other), so a colour means the same thing everywhere in the app.
 * Plain circle markers — a single suburb is a few dozen points, no clustering
 * needed. Free CARTO tiles, no key. */

type Pt = {
  id: number; lat: number; lng: number;
  address?: string | null; price?: number | null; sold_date?: string | null;
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

export default function SuburbTrendsMap({ suburb, height = "70vh" }: { suburb: string; height?: string }) {
  const { t } = useT();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<Counts>(ZERO);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { center: [-36.85, 174.76], zoom: 12, scrollWheelZoom: true });
      // CARTO Voyager — same clean basemap as the deal map and the detail page.
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 20,
      }).addTo(map);
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
      const [sale, sold] = await Promise.all([
        api<Resp>(`/api/properties/map?dataset=for_sale&suburb=${q}`).catch(() => ({ points: [] })),
        api<Resp>(`/api/properties/map?dataset=sold&suburb=${q}`).catch(() => ({ points: [] })),
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
          const priceLine = `${isSold ? t("map.sold") : t("map.asking")} ${p.price ? fmtMoneyShort(p.price) : "—"}${p.sold_date ? ` · ${p.sold_date}` : ""}`;
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
  }, [ready, suburb, t]);

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
