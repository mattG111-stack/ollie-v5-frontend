"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";

/* Suburb map for the trends page: live for-sale (blue) AND recent sold (grey)
 * houses on one map, so you see the whole picture for a suburb at a glance.
 * Plain circle markers (a single suburb is a few dozen points — no clustering
 * needed). Reuses the free OSM tiles + the app's marker styling. */

type Pt = { id: number; lat: number; lng: number; address?: string | null; price?: number | null; sold_date?: string | null };
type Resp = { points: Pt[] };

export default function SuburbTrendsMap({ suburb, height = "70vh" }: { suburb: string; height?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [counts, setCounts] = useState<{ sale: number; sold: number }>({ sale: 0, sold: 0 });

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
      const add = (pts: Pt[], color: string, isSold: boolean) => {
        for (const p of pts) {
          if (p.lat == null || p.lng == null) continue;
          const m = L.circleMarker([p.lat, p.lng], {
            radius: isSold ? 5 : 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1,
          });
          m.bindPopup(
            `<b>${p.address ?? ""}</b><br/>${isSold ? "Sold" : "Asking"} ` +
            `${p.price ? fmtMoneyShort(p.price) : "—"}${p.sold_date ? ` · ${p.sold_date}` : ""}`
          );
          group.addLayer(m);
          bounds.push([p.lat, p.lng]);
        }
      };
      add(sold.points, "#94A3B8", true);   // grey sold underneath
      add(sale.points, "#2563EB", false);  // blue for-sale on top
      group.addTo(map);
      layerRef.current = group;
      setCounts({ sale: sale.points.length, sold: sold.points.length });
      if (bounds.length) map.fitBounds(bounds as any, { padding: [30, 30], maxZoom: 15 });
    })();
    return () => { alive = false; };
  }, [ready, suburb]);

  return (
    <div style={{ position: "relative" }}>
      <div ref={elRef} style={{ height, width: "100%", borderRadius: 12, overflow: "hidden", background: "#e8edf2" }} />
      <div style={{
        position: "absolute", bottom: 12, left: 12, zIndex: 500, background: "rgba(255,255,255,.95)",
        border: "1px solid #E4E9F0", borderRadius: 10, padding: "8px 11px", fontSize: 12, boxShadow: "0 2px 8px rgba(16,24,40,.1)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#2563EB", border: "2px solid #fff", boxShadow: "0 0 0 1px #cbd5e1" }} />
          For sale · {counts.sale}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#94A3B8", border: "2px solid #fff", boxShadow: "0 0 0 1px #cbd5e1" }} />
          Sold (recent) · {counts.sold}
        </div>
      </div>
    </div>
  );
}
