"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { C, MONO } from "./apex";
import { compass, daySun, keyDates, localMinutes, localTime, shadow, sunPosition } from "@/lib/sun";
import { aerial, isStatic } from "@/lib/imagery";
import {
  XY, LL, along, edges, fallbackSection, footprint, hull, shadeFraction, toLL, toXY,
} from "@/lib/site";
import { api } from "@/lib/api";

/**
 * Sun & shade over the actual property — aerial imagery, looking straight down.
 *
 * The base is real satellite photography of the site. Over it: the legal boundary
 * in orange with every run dimensioned, the building, and the shadow it casts in
 * true metres. Play the day and the shade sweeps across the section exactly as it
 * moves on the date chosen.
 *
 * Two markers sit on the sun's arc — where it rises and where it sets — because
 * "which side gets the morning sun" is the question buyers actually ask, and in
 * the southern hemisphere the answer is never intuitive: the sun runs through the
 * NORTH here, rising in the north-east and setting in the north-west.
 *
 * All geometry is computed in local metres and converted to lat/lng only when a
 * ring is handed to Leaflet.
 */

const ZOOM = 20;                 // ~50 m top to bottom: the section and its neighbours
const PANEL_H = 440;
const SECTION_ORANGE = "#FF6A00";

type Preset = "winter" | "equinox" | "summer" | "today";

type ParcelResponse = {
  source: "linz" | "none";
  ring: [number, number][];
  area_m2: number | null;
  appellation: string | null;
};

export default function SunMap({
  lat, lng, floorArea, landArea,
}: { lat: number; lng: number; floorArea?: number | null; landArea?: number | null }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const rafRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [preset, setPreset] = useState<Preset>("winter");
  const [t, setT] = useState<number | null>(null);
  const [h, setH] = useState(3.5);
  const [playing, setPlaying] = useState(false);
  const [parcel, setParcel] = useState<ParcelResponse | null>(null);

  // ---- the day ----
  const date = useMemo(() => {
    const y = new Date().getFullYear(); const k = keyDates(y);
    return preset === "today" ? new Date() : preset === "summer" ? k.summer
         : preset === "equinox" ? k.equinox : k.winter;
  }, [preset]);

  const day = useMemo(() => daySun(lat, lng, date), [lat, lng, date]);
  const riseMin = day.sunrise ? localMinutes(day.sunrise) : 7 * 60;
  const setMin = day.sunset ? localMinutes(day.sunset) : 18 * 60;
  const cur = Math.max(riseMin, Math.min(setMin, t ?? Math.round((riseMin + setMin) / 2)));
  const instant = useMemo(
    () => (day.sunrise ? new Date(day.sunrise.getTime() + (cur - riseMin) * 60000) : null),
    [day.sunrise, riseMin, cur],
  );

  const pos = instant ? sunPosition(lat, lng, instant) : null;
  const sh = pos ? shadow(pos, h) : null;
  const storeys = h <= 3.5 ? 1 : h <= 7 ? 2 : 3;

  // ---- the site, in local metres ----
  const house = useMemo<XY[]>(() => footprint(floorArea, storeys), [floorArea, storeys]);

  const section = useMemo<XY[] | null>(() => {
    if (parcel?.source === "linz" && parcel.ring.length >= 4) {
      const ring = parcel.ring.map(([la, lo]) => toXY(la, lo, lat, lng));
      // LINZ closes its rings; a duplicated last point would draw a zero-length edge
      // and put a "0.0 m" label on the plan.
      const [f] = ring, l = ring[ring.length - 1];
      if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.05) ring.pop();
      return ring;
    }
    return fallbackSection(landArea);
  }, [parcel, landArea, lat, lng]);

  const shade = useMemo<XY[] | null>(() => {
    if (!sh) return null;
    return hull([...house, ...house.map(p => along(p, sh.bearing, sh.length))]);
  }, [house, sh?.bearing, sh?.length]);

  const shadePct = useMemo(
    () => (section ? Math.round(shadeFraction(section, house, shade) * 100) : null),
    [section, house, shade],
  );

  // ---- the legal boundary ----
  useEffect(() => {
    let dead = false;
    api<ParcelResponse>(`/api/geo/parcel?lat=${lat}&lng=${lng}`)
      .then(p => { if (!dead) setParcel(p); })
      // A missing boundary is not an error worth showing — the panel is about the
      // sun, and it falls back to a box sized from the listing's land area.
      .catch(() => { if (!dead) setParcel({ source: "none", ring: [], area_m2: null, appellation: null }); });
    return () => { dead = true; };
  }, [lat, lng]);

  // ---- map init ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const panelW = elRef.current.clientWidth || 640;
      const photo = aerial(lat, lng, ZOOM, panelW / PANEL_H);

      const map = L.map(elRef.current, {
        center: [lat, lng], zoom: ZOOM, scrollWheelZoom: false,
        // A single flat image cannot be panned or zoomed into — there is no more
        // of it to reveal, so offering the controls would promise detail that
        // isn't there.
        zoomControl: !isStatic(photo),
        dragging: !isStatic(photo),
        zoomSnap: 0,
        attributionControl: true,
      });

      if (isStatic(photo)) {
        const sw = toLL([-photo.halfWidthM, -photo.halfHeightM], lat, lng);
        const ne = toLL([photo.halfWidthM, photo.halfHeightM], lat, lng);
        L.imageOverlay(photo.url, [sw, ne], { attribution: photo.attribution }).addTo(map);
        map.setView([lat, lng], ZOOM + Math.log2(panelW / photo.imgWidth));
      } else {
        L.tileLayer(photo.url, {
          attribution: photo.attribution, maxZoom: 22, maxNativeZoom: photo.maxNativeZoom,
        }).addTo(map);
      }

      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng]);

  // ---- redraw every overlay whenever the sun, the building or the site changes ----
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    const g = L.layerGroup();
    const ll = (p: XY) => toLL(p, lat, lng);

    // ── the shade, with the footprint punched out ────────────────────────────
    // Seen from above the roof is the one surface in full sun; filling straight
    // over the hull hid the house under its own shadow, and the photo with it.
    if (shade) {
      L.polygon([shade.map(ll), house.map(ll)], {
        color: "#0B1524", weight: 0, fillColor: "#0B1524", fillOpacity: 0.52,
        interactive: false,
      }).addTo(g);
    }

    // ── the site: tinted, outlined, dimensioned ──────────────────────────────
    if (section) {
      L.polygon(section.map(ll), {
        color: SECTION_ORANGE, weight: 2.6, opacity: 0.98,
        fillColor: "#FF8C28", fillOpacity: 0.16, interactive: false,
      }).addTo(g);

      for (const e of edges(section)) {
        if (e.metres < 1.5) continue;                 // don't label a survey nib
        const at = ll([e.mid[0] + e.outward[0] * 1.6, e.mid[1] + e.outward[1] * 1.6]);
        L.marker(at, {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div style="transform:translate(-50%,-50%) rotate(${e.angle}deg);
                     font:700 11px system-ui,sans-serif;color:#FFB27A;white-space:nowrap;
                     text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000">${e.metres.toFixed(1)} m</div>`,
            iconSize: [0, 0],
          }),
        }).addTo(g);
      }
    }

    // ── the building ─────────────────────────────────────────────────────────
    L.polygon(house.map(ll), {
      color: "#FFFFFF", weight: 1.6, opacity: 0.95, fill: false, interactive: false,
    }).addTo(g);

    // ── the sun's run for the day, and where it rises and sets ───────────────
    if (day.sunriseAz != null && day.sunsetAz != null) {
      const reach = section
        ? Math.max(...section.map(p => Math.hypot(p[0], p[1]))) + 4
        : 22;

      // The arc from sunrise round to sunset, always through the north.
      const arc: LL[] = [];
      const from = day.sunriseAz, to = day.sunsetAz;
      const span = ((from - to) + 360) % 360;          // sweeps westward through N
      for (let i = 0; i <= 48; i++) arc.push(ll(along([0, 0], from - (span * i) / 48, reach)));
      L.polyline(arc, {
        color: "#FFFFFF", weight: 1.4, opacity: 0.5, dashArray: "5 6", interactive: false,
      }).addTo(g);

      const mark = (az: number, label: string, time: string | null) => {
        const at = along([0, 0], az, reach);
        L.polyline([ll([0, 0]), ll(at)], {
          color: "#FFD66E", weight: 1.3, opacity: 0.42, dashArray: "3 5", interactive: false,
        }).addTo(g);
        L.circleMarker(ll(at), {
          radius: 6, color: "rgba(0,0,0,.55)", weight: 1.6,
          fillColor: "#FFD66E", fillOpacity: 1, interactive: false,
        }).addTo(g);
        // Label pulled INSIDE the arc — outside, it ran off the panel on one side
        // and under the readout on the other.
        L.marker(ll(along([0, 0], az, Math.max(4, reach - 5))), {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div style="transform:translate(-50%,-50%);text-align:center;white-space:nowrap;
                     text-shadow:0 0 3px #000,0 0 3px #000,0 0 4px #000">
                     <div style="font:800 9.5px ${MONO};letter-spacing:.1em;color:#FFD66E">${label}</div>
                     <div style="font:700 13px system-ui,sans-serif;color:#fff">${time ?? "—"}</div>
                   </div>`,
            iconSize: [0, 0],
          }),
        }).addTo(g);
      };
      mark(day.sunriseAz, "MORNING SUN", localTime(day.sunrise));
      mark(day.sunsetAz, "AFTERNOON SUN", localTime(day.sunset));
    }

    // ── where the light is coming from right now ─────────────────────────────
    if (pos && pos.elevation > 0) {
      const reach = section ? Math.max(...section.map(p => Math.hypot(p[0], p[1]))) : 18;
      L.polyline([ll([0, 0]), ll(along([0, 0], pos.azimuth, reach))], {
        color: "#FFC53D", weight: 2.2, opacity: 0.9, interactive: false,
      }).addTo(g);
    }

    g.addTo(map);
    layerRef.current = g;
  }, [ready, shade, section, house, day, pos?.azimuth, pos?.elevation, lat, lng]);

  // ---- play the day ----
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      // ~2 minutes of daylight per frame at 60fps, but paced off real elapsed
      // time so a slow frame doesn't slow the day down with it.
      const advance = ((now - last) / 16.7) * 2.2;
      last = now;
      setT(prev => {
        const next = (prev ?? riseMin) + advance;
        return next > setMin ? riseMin : next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, riseMin, setMin]);

  const sourceNote = parcel?.source === "linz"
    ? `Boundary from LINZ${parcel.appellation ? ` · ${parcel.appellation}` : ""}`
    : section ? "Boundary approximated from the listing's land area" : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {([["winter", "Shortest day"], ["equinox", "Equinox"], ["summer", "Longest day"], ["today", "Today"]] as [Preset, string][])
          .map(([k, label]) => (
            <button key={k} onClick={() => { setPreset(k); setT(null); }}
              aria-pressed={preset === k}
              style={{
                fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${preset === k ? C.accent : C.border}`,
                background: preset === k ? C.accent : C.card,
                color: preset === k ? "#fff" : C.label,
              }}>{label}</button>
          ))}
        <button onClick={() => setPlaying(p => !p)}
          style={{
            marginLeft: "auto", fontSize: 12.5, fontWeight: 700, padding: "7px 14px",
            borderRadius: 9, cursor: "pointer", border: "1px solid #D89B10",
            background: "#F0B429", color: "#2B2100",
          }}>{playing ? "❚❚ Pause" : "▶ Play the day"}</button>
      </div>

      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div ref={elRef} style={{ height: PANEL_H, width: "100%", background: "#2a2f36" }} />

        <div style={{
          position: "absolute", top: 12, right: 12, zIndex: 500, background: "#fff",
          border: `1px solid ${C.border}`, borderRadius: 11, padding: "10px 13px",
          boxShadow: "0 4px 16px rgba(16,24,40,.28)", minWidth: 158,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".1em", color: C.mono }}>AT THIS TIME</div>
          <div className="tnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", marginTop: 1 }}>
            {instant ? localTime(instant) : "—"}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: C.label, lineHeight: 1.6 }}>
            <b style={{ color: C.ink }}>Sun</b> {pos && pos.elevation > 0 ? `${compass(pos.azimuth)} · ${pos.elevation.toFixed(0)}° up` : "—"}<br />
            <b style={{ color: C.ink }}>Shadow</b> {sh ? `${sh.length.toFixed(1)} m ${compass(sh.bearing)}` : "—"}
          </div>
          {shadePct != null && (
            <div style={{
              marginTop: 8, paddingTop: 7, borderTop: `1px solid ${C.divider}`,
              display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".1em", color: C.mono }}>SECTION IN SHADE</span>
              <b className="tnum" style={{ fontSize: 19, fontWeight: 800 }}>{shadePct}%</b>
            </div>
          )}
        </div>

        {/* Top-left: Google burns its wordmark into the bottom-left of a static
            image and covering it breaches their terms; Leaflet's attribution
            holds the bottom-right. */}
        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 500, background: "rgba(255,255,255,.96)",
          border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 11px", fontSize: 11.5,
          display: "flex", gap: 13, boxShadow: "0 3px 12px rgba(16,24,40,.22)",
        }}>
          <Key color="rgba(11,21,36,.52)" label="Shade" />
          <Key color="#FFFFFF" label="House" outline />
          <Key color={SECTION_ORANGE} label="Section" outline />
        </div>

        <Compass />
      </div>

      <input type="range" min={riseMin} max={setMin} value={cur}
             onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
             style={{ width: "100%", marginTop: 14, accentColor: "#F0B429", cursor: "ew-resize" }}
             aria-label="Time of day" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: C.faint, gap: 12 }}>
        <span>{localTime(day.sunrise)} sunrise</span>
        <span className="tnum" style={{ color: C.label, fontWeight: 700 }}>
          {day.daylightHours.toFixed(1)} h daylight · sun peaks {day.noonElevation.toFixed(0)}°
        </span>
        <span>sunset {localTime(day.sunset)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 14, flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", color: C.mono }}>BUILDING HEIGHT</span>
        <input type="range" min={2} max={12} step={0.5} value={h}
               onChange={(e) => setH(Number(e.target.value))}
               style={{ flex: "1 1 150px", accentColor: C.accent }} />
        <span className="tnum" style={{ fontWeight: 800, fontSize: 14 }}>{h} m</span>
        <span style={{ fontSize: 11.5, color: C.faint }}>
          {storeys === 1 ? "single storey" : storeys === 2 ? "two storey" : "three storey"}
        </span>
      </div>

      {sourceNote && (
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>{sourceNote}</div>
      )}
    </div>
  );
}

function Key({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.label }}>
      <span style={{
        width: 13, height: 13, borderRadius: 3, flexShrink: 0,
        background: outline ? "transparent" : color,
        border: outline ? `2px solid ${color}` : "1px solid rgba(0,0,0,.2)",
        boxShadow: outline && color === "#FFFFFF" ? "0 0 0 1px rgba(0,0,0,.3)" : undefined,
      }} />
      {label}
    </span>
  );
}

/** N / E / S / W. The whole feature turns on which way north is, and in New
 *  Zealand that is the direction the sun comes from — so it gets the accent. */
function Compass() {
  return (
    <div style={{
      position: "absolute", right: 14, bottom: 30, zIndex: 500, width: 76, height: 76,
      borderRadius: "50%", background: "rgba(16,24,38,.55)", border: "1px solid rgba(255,255,255,.5)",
      color: "rgba(255,255,255,.92)", fontSize: 11, fontWeight: 800, pointerEvents: "none",
    }} aria-hidden="true">
      <svg viewBox="0 0 76 76" width="76" height="76">
        {[[38, 10, 38, 28], [66, 38, 50, 38], [38, 66, 38, 48], [10, 38, 26, 38]].map((d, i) => (
          <line key={i} x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]} stroke="rgba(255,255,255,.9)" strokeWidth="1.8" />
        ))}
        <polygon points="38,6 32,19 44,19" fill="#FFC53D" />
        <text x="38" y="17" textAnchor="middle" fontSize="11" fontWeight="800" fill="#FFC53D"
              stroke="rgba(0,0,0,.65)" strokeWidth="2.6" paintOrder="stroke">N</text>
        <text x="63" y="42" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff"
              stroke="rgba(0,0,0,.65)" strokeWidth="2.6" paintOrder="stroke">E</text>
        <text x="38" y="70" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff"
              stroke="rgba(0,0,0,.65)" strokeWidth="2.6" paintOrder="stroke">S</text>
        <text x="13" y="42" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff"
              stroke="rgba(0,0,0,.65)" strokeWidth="2.6" paintOrder="stroke">W</text>
      </svg>
    </div>
  );
}
