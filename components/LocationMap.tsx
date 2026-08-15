"use client";

import { useEffect, useRef } from "react";
import { C, MONO } from "./apex";

/**
 * Location panel. Leaflet is loaded from CDN on demand rather than added as a
 * dependency — it is used on exactly one panel of one page, and bundling it
 * would put ~150kB into every route's shared chunk.
 */

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

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

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !ref.current || mapRef.current) return;
        const map = L.map(ref.current, {
          center: [lat, lng],
          zoom: 16,
          scrollWheelZoom: false,
          attributionControl: true,
        });
        mapRef.current = map;
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          attribution: "© OpenStreetMap © CARTO",
          maxZoom: 19,
        }).addTo(map);
        // A circle, not a pin: the coordinate is a geocode of the street
        // address, so showing a precise point would overstate what we know.
        L.circle([lat, lng], {
          radius: 90,
          color: "#333A43",
          weight: 2,
          fillColor: "#333A43",
          fillOpacity: 0.14,
        }).addTo(map);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [lat, lng]);

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
