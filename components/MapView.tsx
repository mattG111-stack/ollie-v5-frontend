"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

/**
 * Every geocoded listing on a map. Free OpenStreetMap tiles (no key), clustered
 * so 10k points stay smooth. Markers are coloured by signal — green underpriced,
 * grey subdividable — and honour the same filters as the list, so map and table
 * always describe the same population. `dataset="sold"` plots recent sales.
 */

type MapPoint = {
  id: number; lat: number; lng: number;
  address?: string | null; suburb?: string | null;
  price?: number | null; est?: number | null; score?: number | null;
  beds?: number | null; underpriced?: boolean; subdividable?: boolean;
  sold_date?: string | null;
};
type MapResponse = { dataset: string; count: number; points: MapPoint[] };

const COLOR = {
  underpriced: "#0A8754",
  subdividable: "#FF6A00",
  forSale: "#33455E",
  sold: "#8894A6",
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
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
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
        const cluster = (L as any).markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
        const bounds: [number, number][] = [];
        for (const p of d.points) {
          const color = p.underpriced ? COLOR.underpriced
            : p.subdividable ? COLOR.subdividable
            : dataset === "sold" ? COLOR.sold : COLOR.forSale;
          const marker = L.circleMarker([p.lat, p.lng], {
            radius: 6, color: "#fff", weight: 1.2, fillColor: color, fillOpacity: 0.9,
          });
          marker.bindPopup(popupHtml(p, dataset, t));
          cluster.addLayer(marker);
          bounds.push([p.lat, p.lng]);
        }
        map.addLayer(cluster);
        clusterRef.current = cluster;
        if (bounds.length) map.fitBounds(bounds as any, { padding: [30, 30], maxZoom: 14 });
        setCount(d.count);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ready, dataset, JSON.stringify(filters)]);

  return (
    <div className="relative rounded-card overflow-hidden border border-line shadow-soft">
      <div ref={elRef} style={{ height, width: "100%", background: "#e8edf2" }} />
      {/* count / loading pill */}
      <div className="absolute top-3 left-3 z-[500] bg-white/95 border border-line rounded-lg px-3 py-1.5 text-xs font-semibold shadow-soft flex items-center gap-2">
        {loading && <span className="inline-block w-3 h-3 border-2 border-blue/30 border-t-blue rounded-full animate-spin" />}
        {count != null ? t("map.pointsShown", { n: count.toLocaleString() }) : loading ? t("map.loading") : ""}
      </div>
      {/* legend */}
      <div className="absolute bottom-3 left-3 z-[500] bg-white/95 border border-line rounded-lg px-3 py-2 text-[11px] shadow-soft flex flex-col gap-1">
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
    <div className="flex items-center gap-1.5">
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block" }} />
      <span className="text-muted">{label}</span>
    </div>
  );
}

function popupHtml(p: MapPoint, dataset: "for_sale" | "sold", t: (k: string, v?: any) => string) {
  const money = (v?: number | null) => (v == null ? "—" : fmtMoneyShort(v));
  const line2 = [p.suburb, p.beds ? t("map.bedsN", { n: p.beds }) : null].filter(Boolean).join(" · ");
  const priceLabel = dataset === "sold" ? t("map.sold") : t("map.asking");
  return `
    <div style="min-width:170px;font-family:inherit">
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">${escapeHtml(p.address || p.suburb || "")}</div>
      ${line2 ? `<div style="color:#667085;font-size:11px;margin-bottom:5px">${escapeHtml(line2)}</div>` : ""}
      <div style="font-size:12px">${priceLabel}: <b>${money(p.price)}</b></div>
      ${p.est != null ? `<div style="font-size:12px">${t("map.est")}: ${money(p.est)}</div>` : ""}
      ${p.score != null ? `<div style="font-size:12px">${t("map.buyScore")}: <b>${p.score.toFixed(0)}</b></div>` : ""}
      ${p.sold_date ? `<div style="color:#98a2b3;font-size:11px;margin-top:2px">${escapeHtml(p.sold_date)}</div>` : ""}
      ${dataset === "for_sale" ? `<a href="/property/${p.id}" style="display:inline-block;margin-top:6px;color:#2E7DF6;font-weight:600;font-size:12px">${t("map.viewProperty")}</a>` : ""}
    </div>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
