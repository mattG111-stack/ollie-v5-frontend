"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { api } from "@/lib/api";
import { mountStreet, streetChain } from "@/lib/basemap";
import { fmtDayDate, fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

/**
 * Every geocoded listing on a map. Free CARTO Voyager tiles (no key), clustered
 * so 10k points stay smooth. Markers are coloured by signal — near-black
 * underpriced, orange subdividable — and honour the same filters as the list, so
 * map and table always describe the same population. `dataset="sold"` plots
 * recent sales.
 */

type MapPoint = {
  id: number; lat: number; lng: number;
  address?: string | null; suburb?: string | null;
  price?: number | null; est?: number | null; score?: number | null;
  beds?: number | null; underpriced?: boolean; subdividable?: boolean;
  sold_date?: string | null;
};
type MapResponse = { dataset: string; count: number; points: MapPoint[] };

// Markers sit over a light basemap, so each category needs its own clearly
// separable value: near-black for the signal that matters (underpriced), a
// vivid orange for subdividable, and pale greys for the de-emphasised rest.
// The "other" grey is deliberately much lighter than the underpriced charcoal —
// two dark tones next to each other were indistinguishable at marker size.
const COLOR = {
  underpriced: "#1B2026",   // near-black — the strongest signal, reads on any tile
  subdividable: "#FF6A00",  // vivid orange
  forSale: "#9AA6B6",       // pale grey for "other" (present but recessive)
  sold: "#C2CAD4",
};

export default function MapView({
  dataset,
  filters,
  height = "72vh",
}: {
  dataset: "for_sale" | "sold";
  filters: Record<string, string>;
  height?: string;
}) {
  const { t } = useT();
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState<number | null>(null);

  // Init the map once. Leaflet touches window, so it is imported lazily here
  // (never during SSR).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { center: [-36.85, 174.76], zoom: 11, scrollWheelZoom: true });
      // LINZ where a key is set, Esri otherwise — see lib/basemap.ts. Esri
      // serves place names as a second layer; LINZ bakes its own in. Markers
      // are added after this, so pins still sit above both.
      mountStreet(L, map, await streetChain());
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // (Re)load points whenever the dataset or filters change.
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;
    setLoading(true);

    const qs = new URLSearchParams({ dataset });
    for (const [k, v] of Object.entries(filters)) {
      if (v != null && v !== "") qs.set(k, String(v));
    }

    api<MapResponse>(`/api/properties/map?${qs.toString()}`)
      .then((d) => {
        if (clusterRef.current) { map.removeLayer(clusterRef.current); clusterRef.current = null; }
        const cluster = (L as any).markerClusterGroup({
          chunkedLoading: true,
          maxClusterRadius: 50,
          // Custom cluster icon: colour by the best opportunity INSIDE the cluster
          // (underpriced beats subdividable beats plain), with a white ring +
          // shadow so it pops against the map instead of leaflet's default
          // count-based green/orange (which blended into the parks and misled).
          iconCreateFunction: (c: any) => {
            const kids = c.getAllChildMarkers();
            let kind: "up" | "sub" | "plain" = "plain";
            for (const k of kids) {
              const cat = k.options?.category;
              if (cat === "up") { kind = "up"; break; }
              if (cat === "sub") kind = "sub";
            }
            const bg = kind === "up" ? COLOR.underpriced : kind === "sub" ? COLOR.subdividable : COLOR.forSale;
            const n = c.getChildCount();
            const size = n < 10 ? 32 : n < 50 ? 38 : 44;
            return L.divIcon({
              className: "",
              iconSize: [size, size],
              html:
                `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};` +
                `border:2.5px solid #fff;box-shadow:0 1px 5px rgba(15,23,42,.45);display:flex;` +
                `align-items:center;justify-content:center;color:#fff;font-weight:800;` +
                `font-size:${n < 100 ? 13 : 12}px;font-family:inherit">${n}</div>`,
            });
          },
        });
        const bounds: [number, number][] = [];
        for (const p of d.points) {
          const cat = p.underpriced ? "up" : p.subdividable ? "sub" : "plain";
          const color = p.underpriced ? COLOR.underpriced
            : p.subdividable ? COLOR.subdividable
            : dataset === "sold" ? COLOR.sold : COLOR.forSale;
          const marker = L.circleMarker([p.lat, p.lng], {
            radius: 8, color: "#fff", weight: 2.5, fillColor: color, fillOpacity: 1,
            // stashed so the cluster icon can colour by what's inside it
            ...( { category: cat } as any ),
          });
          marker.bindPopup(popupHtml(p, dataset, t));
          cluster.addLayer(marker);
          bounds.push([p.lat, p.lng]);
        }
        map.addLayer(cluster);
        clusterRef.current = cluster;
        // With no points there is nothing to fit, so the map simply stays where
        // it was — which is indistinguishable from the filter not working at
        // all. That is exactly how a broken suburb filter went unnoticed: pick a
        // suburb, nothing moves. Say it instead.
        // maxZoom 15 to match the suburb-trends map. It was 14 here, so
        // choosing a suburb refit the view a whole zoom level wider than the
        // same choice does on trends — reported as "the map doesn't move like
        // it does with suburb trends". Two maps answering the same question
        // should land in the same place.
        if (bounds.length) map.fitBounds(bounds as any, { padding: [30, 30], maxZoom: 15 });
        setCount(d.count);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ready, dataset, JSON.stringify(filters)]);

  return (
    <div className="relative rounded-card overflow-hidden border border-line shadow-soft">
      <div ref={elRef} style={{ height, width: "100%", background: "#e8edf2" }} />
      {/* count / loading pill — BOTTOM left. Top-left is Leaflet's zoom control
          (+/−), which this used to sit on top of. */}
      <div className="absolute bottom-3 left-3 z-[500] bg-white border border-line rounded-lg px-3 py-1.5 text-xs font-semibold flex items-center gap-2"
           style={{ boxShadow: "0 4px 14px rgba(16,24,40,.18)" }}>
        {loading && <span className="inline-block w-3 h-3 border-2 border-blue/30 border-t-blue rounded-full animate-spin" />}
        {count != null ? t("map.pointsShown", { n: count.toLocaleString() }) : loading ? t("map.loading") : ""}
      </div>
      {/* An empty result has to be stated. The map cannot move to nowhere, so
          without this the screen looks identical to a filter that did nothing. */}
      {!loading && count === 0 && (
        <div className="absolute inset-0 z-[400] flex items-center justify-center pointer-events-none">
          <div className="bg-white border border-line rounded-xl px-5 py-4 text-center max-w-sm pointer-events-auto"
               style={{ boxShadow: "0 8px 28px rgba(16,24,40,.22)" }}>
            <div className="font-semibold text-sm">Nothing matches these filters</div>
            <div className="text-xs text-muted mt-1">
              No listing in the current batch fits every filter at once, so there
              is nothing to show on the map. Clear one and try again.
            </div>
          </div>
        </div>
      )}
      {/* Key — top RIGHT. Fully opaque white with a real shadow (it used to be
          95% white in the bottom corner, so the dots sat on whatever tile was
          underneath and were easy to miss). Top-right keeps it clear of the
          zoom controls and the busiest part of an Auckland-wide view. */}
      <div className="absolute top-3 right-3 z-[500] bg-white border border-line rounded-lg px-3 py-2.5 text-[11.5px] flex flex-col gap-2"
           style={{ boxShadow: "0 4px 14px rgba(16,24,40,.18)" }}>
        {dataset === "for_sale" ? (
          <>
            <Legend color={COLOR.underpriced} label={t("ptable.underpriced")} />
            <Legend color={COLOR.subdividable} label={t("nav.subdividable")} />
            <Legend color={COLOR.forSale} label={t("map.otherListing")} />
          </>
        ) : (
          <Legend color={COLOR.sold} label={t("map.soldSale")} />
        )}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11.5px]">
      {/* white ring + hairline, exactly like the markers on the map */}
      <span
        style={{
          width: 11, height: 11, borderRadius: "50%", background: color,
          border: "2px solid #fff", boxShadow: "0 0 0 1px #CBD5E1",
          display: "inline-block", flex: "none",
        }}
      />
      <span className="text-muted whitespace-nowrap">{label}</span>
    </span>
  );
}

function popupHtml(p: MapPoint, dataset: "for_sale" | "sold", t: (k: string, v?: any) => string) {
  const money = (v?: number | null) => (v == null ? "—" : fmtMoneyShort(v));
  const line2 = [p.suburb, p.beds ? t("map.bedsN", { n: p.beds }) : null].filter(Boolean).join(" · ");
  const priceLabel = dataset === "sold" ? t("map.sold") : t("map.asking");
  const href = `/property/${p.id}`;
  const addr = escapeHtml(p.address || p.suburb || "");
  // For-sale points link to the property page: the address is a link AND there's
  // a full-width button, so the whole popup is an obvious way through to the house.
  const title = dataset === "for_sale"
    ? `<a href="${href}" style="font-weight:700;font-size:13px;color:#14233A;text-decoration:none">${addr}</a>`
    : `<span style="font-weight:700;font-size:13px">${addr}</span>`;
  return `
    <div style="min-width:180px;font-family:inherit">
      <div style="margin-bottom:2px">${title}</div>
      ${line2 ? `<div style="color:#667085;font-size:11px;margin-bottom:5px">${escapeHtml(line2)}</div>` : ""}
      <div style="font-size:12px">${priceLabel}: <b>${money(p.price)}</b></div>
      ${p.est != null ? `<div style="font-size:12px">${t("map.est")}: ${money(p.est)}</div>` : ""}
      ${p.score != null ? `<div style="font-size:12px">${t("map.buyScore")}: <b>${p.score.toFixed(0)}</b></div>` : ""}
      ${p.sold_date ? `<div style="color:#98a2b3;font-size:11px;margin-top:2px">${escapeHtml(fmtDayDate(p.sold_date))}</div>` : ""}
      ${dataset === "for_sale" ? `<a href="${href}" style="display:block;text-align:center;margin-top:8px;padding:6px 10px;background:#2E353D;color:#fff;font-weight:700;font-size:12px;border-radius:8px;text-decoration:none">${t("map.viewProperty")} →</a>` : ""}
    </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
