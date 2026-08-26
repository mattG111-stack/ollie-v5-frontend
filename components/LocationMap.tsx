"use client";

import { useEffect, useRef, useState } from "react";
import { C, MONO } from "./apex";
import { aerialTilesAsync } from "@/lib/imagery";

/**
 * Location panel. Leaflet is loaded from CDN on demand rather than added as a
 * dependency — it is used on exactly one panel of one page, and bundling it
 * would put ~150kB into every route's shared chunk.
 *
 * Two views. The street map answers "where is this" — which road, which shops,
 * how far to the motorway. The aerial answers everything the street map cannot:
 * how big the section really is, whether the neighbour's roof is twice the size
 * of this one, where the trees are, whether the back half is flat. That is the
 * view people actually want when they open a listing, so it is one click away
 * rather than a different site.
 *
 * The aerial source is whichever is sharpest for this deployment — Google
 * satellite tiles when a key is configured, otherwise LINZ, otherwise Esri.
 * See lib/imagery.ts.
 */

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

const STREET_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const STREET_ATTR = "© OpenStreetMap © CARTO";

type View = "street" | "aerial";

function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).L));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = LEAFLET_JS;
    s.onload = () => resolve((window as any).L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export default function LocationMap({
  lat,
  lng,
  caption,
}: {
  lat: number;
  lng: number;
  caption: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const streetRef = useRef<any>(null);
  const aerialRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("street");

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current || mapRef.current) return;
        LRef.current = L;
        const map = L.map(ref.current, {
          center: [lat, lng],
          zoom: 16,
          scrollWheelZoom: false,
          attributionControl: true,
          // The aerial has real pixels well past the street map's 19, and the
          // map's own ceiling would otherwise cap it there.
          maxZoom: 22,
        });
        mapRef.current = map;
        streetRef.current = L.tileLayer(STREET_URL, {
          attribution: STREET_ATTR,
          maxNativeZoom: 19,
          maxZoom: 22,
        }).addTo(map);
        // A circle, not a pin: the coordinate is a geocode of the street
        // address, so showing a precise point would overstate what we know.
        circleRef.current = L.circle([lat, lng], {
          radius: 90,
          color: "#333A43",
          weight: 2,
          fillColor: "#333A43",
          fillOpacity: 0.14,
        }).addTo(map);
        setReady(true);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      streetRef.current = null;
      aerialRef.current = null;
      circleRef.current = null;
      setReady(false);
    };
  }, [lat, lng]);

  // ---- swap the base layer ----
  useEffect(() => {
    if (!ready) return;
    let dead = false;
    const L = LRef.current, map = mapRef.current;

    // Dark ink disappears against a dark aerial. Same circle, readable on both.
    circleRef.current?.setStyle(
      view === "aerial"
        ? { color: "#FFFFFF", fillColor: "#FFFFFF", fillOpacity: 0.1, weight: 2.4 }
        : { color: "#333A43", fillColor: "#333A43", fillOpacity: 0.14, weight: 2 },
    );

    if (view === "street") {
      if (aerialRef.current) map.removeLayer(aerialRef.current);
      if (streetRef.current && !map.hasLayer(streetRef.current)) streetRef.current.addTo(map);
      return;
    }

    (async () => {
      const photo = await aerialTilesAsync();
      if (dead || !mapRef.current) return;
      if (!aerialRef.current) {
        aerialRef.current = L.tileLayer(photo.url, {
          attribution: photo.attribution,
          maxZoom: photo.maxZoom,
          maxNativeZoom: photo.maxNativeZoom,
        });
      }
      aerialRef.current.addTo(map);
      // Street last, so the aerial is already painted underneath when it goes —
      // removing it first would flash the empty grey background.
      if (streetRef.current) map.removeLayer(streetRef.current);
    })();

    return () => { dead = true; };
  }, [ready, view]);

  return (
    <div
      style={{
        position: "relative",
        height: 360,
        borderRadius: 14,
        overflow: "hidden",
        marginTop: 16,
        border: "1px solid #D6DEE9",
        background: "#E8EDF3",
      }}
    >
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />

      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 500,
          display: "flex",
          background: "rgba(255,255,255,.96)",
          border: "1px solid #D6DEE9",
          borderRadius: 9,
          overflow: "hidden",
          boxShadow: "0 3px 12px rgba(16,24,40,.22)",
        }}
      >
        {(["street", "aerial"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            aria-pressed={view === v}
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: ".08em",
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "7px 12px",
              border: "none",
              cursor: "pointer",
              background: view === v ? C.accent : "transparent",
              color: view === v ? "#fff" : "#6E7C90",
            }}
          >
            {v === "street" ? "Street" : "Aerial"}
          </button>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          zIndex: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(14,27,46,.92)",
          color: C.darkText,
          borderRadius: 10,
          padding: "9px 13px",
          pointerEvents: "none",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9CED6" }} />
        <span className="tnum" style={{ fontFamily: MONO, fontSize: 12 }}>
          {caption}
        </span>
      </div>
    </div>
  );
}
