"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { C, MONO } from "./apex";
import { compass, daySun, keyDates, localMinutes, localTime, shadow, sunPosition } from "@/lib/sun";
import { aerialAsync, isStatic } from "@/lib/imagery";
import {
  Rect, XY, along, derivedSubject, edges, fallbackSection, rectCorners, rotFromHandle,
  shadeFractionOf, shadowOf, sizeFromCorner, toLL, toXY,
} from "@/lib/site";
import { api } from "@/lib/api";

/**
 * Sun & shade over the actual property — aerial imagery, looking straight down.
 *
 * EVERY building casts, not just this one. The shade that decides whether a
 * property is cold in winter is almost never its own: it is the two-storey place
 * on the northern boundary. Nothing in the listing data describes a neighbour's
 * building, so neighbours are placed by hand — that is what the editor is for.
 *
 * The subject dwelling is editable for the same reason. Its footprint is derived
 * from floor area and lands as a rectangle on the pin, which rarely sits squarely
 * on the roof in the photo; since the shadow is cast FROM that rectangle, a
 * footprint in the wrong place puts the shade in the wrong place.
 *
 * All geometry is in local metres, converted to lat/lng only when a ring is
 * handed to Leaflet.
 */

const ZOOM = 20;
const PANEL_H = 460;
const SECTION_ORANGE = "#FF6A00";
const SHADE_PANE = "apexShade";

type Preset = "winter" | "equinox" | "summer" | "today";
type ParcelResponse = { source: string; ring: [number, number][]; area_m2: number | null; appellation: string | null };
type ApiBuilding = {
  is_subject: boolean; east_m: number; north_m: number; width_m: number;
  depth_m: number; rot_deg: number; height_m: number; label: string | null;
};

const toApi = (b: Rect): ApiBuilding => ({
  is_subject: !!b.isSubject, east_m: b.east, north_m: b.north, width_m: b.w,
  depth_m: b.d, rot_deg: b.rot, height_m: b.height, label: b.label ?? null,
});
const fromApi = (b: ApiBuilding): Rect => ({
  east: b.east_m, north: b.north_m, w: b.width_m, d: b.depth_m,
  rot: b.rot_deg, height: b.height_m, isSubject: b.is_subject, label: b.label,
});

export default function SunMap({
  propertyId, lat, lng, floorArea, landArea,
}: {
  propertyId?: number | null;
  lat: number; lng: number; floorArea?: number | null; landArea?: number | null;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  const handleRef = useRef<any>(null);
  const rafRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [preset, setPreset] = useState<Preset>("winter");
  const [t, setT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [parcel, setParcel] = useState<ParcelResponse | null>(null);

  const [buildings, setBuildings] = useState<Rect[]>([]);
  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Live copy the drag handlers mutate. Going through React state on every
  // mousemove would rebuild the markers mid-drag and drop the pointer.
  const liveRef = useRef<Rect[]>([]);
  useEffect(() => { liveRef.current = buildings; }, [buildings]);

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
    [day.sunrise, riseMin, cur]);
  const pos = instant ? sunPosition(lat, lng, instant) : null;
  // Shadow length per metre of height, so every building shares one sun.
  const perMetre = pos ? (shadow(pos, 1)?.length ?? 0) : 0;
  const shBearing = pos ? shadow(pos, 1)?.bearing ?? null : null;

  const section = useMemo<XY[] | null>(() => {
    if (parcel?.source === "linz" && parcel.ring.length >= 4) {
      const ring = parcel.ring.map(([la, lo]) => toXY(la, lo, lat, lng));
      const [f] = ring, l = ring[ring.length - 1];
      if (Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.05) ring.pop();
      return ring;
    }
    return fallbackSection(landArea);
  }, [parcel, landArea, lat, lng]);

  const shadows = useMemo(
    () => (shBearing == null ? []
      : buildings.map(b => shadowOf(b, shBearing, perMetre)).filter(Boolean) as XY[][]),
    [buildings, shBearing, perMetre]);

  const shadePct = useMemo(() => {
    if (!section || !shadows.length) return null;
    return Math.round(shadeFractionOf(section, buildings.map(rectCorners), shadows) * 100);
  }, [section, buildings, shadows]);

  // ---- load boundary + buildings ----
  useEffect(() => {
    let dead = false;
    api<ParcelResponse>(`/api/geo/parcel?lat=${lat}&lng=${lng}`)
      .then(p => { if (!dead) setParcel(p); })
      .catch(() => { if (!dead) setParcel({ source: "none", ring: [], area_m2: null, appellation: null }); });
    return () => { dead = true; };
  }, [lat, lng]);

  useEffect(() => {
    let dead = false;
    const seed = () => [derivedSubject(floorArea, 1, 3.5)];
    if (!propertyId) { setBuildings(seed()); return; }
    api<{ buildings: ApiBuilding[] }>(`/api/geo/buildings/${propertyId}`)
      .then(r => { if (!dead) setBuildings(r.buildings.length ? r.buildings.map(fromApi) : seed()); })
      .catch(() => { if (!dead) setBuildings(seed()); });
    return () => { dead = true; };
  }, [propertyId, floorArea]);

  // ---- map init ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const panelW = elRef.current.clientWidth || 640;
      // Resolving the imagery can touch the network (Google mints a tile
      // session once per tab), so re-check the escape hatches after it: a
      // property page closed during that await would otherwise build a map
      // into a detached element and leak it.
      const photo = await aerialAsync(lat, lng, ZOOM, panelW / PANEL_H);
      if (cancelled || !elRef.current || mapRef.current) return;

      const map = L.map(elRef.current, {
        center: [lat, lng], zoom: ZOOM, scrollWheelZoom: false,
        zoomControl: !isStatic(photo), dragging: !isStatic(photo), zoomSnap: 0,
      });

      // Shadows live in their own pane, drawn opaque, with the transparency
      // applied to the PANE. Drawing each shadow semi-transparent would darken
      // wherever two overlapped, so two neighbours would read as deeper shade
      // than one — union, not sum.
      const pane = map.createPane(SHADE_PANE);
      if (pane) {
        pane.style.opacity = "0.52";
        pane.style.zIndex = "410";
      }

      if (isStatic(photo)) {
        const sw = toLL([-photo.halfWidthM, -photo.halfHeightM], lat, lng);
        const ne = toLL([photo.halfWidthM, photo.halfHeightM], lat, lng);
        L.imageOverlay(photo.url, [sw, ne], { attribution: photo.attribution }).addTo(map);
        map.setView([lat, lng], ZOOM + Math.log2(panelW / photo.imgWidth));
      } else {
        L.tileLayer(photo.url, {
          attribution: photo.attribution,
          maxZoom: photo.maxZoom,
          maxNativeZoom: photo.maxNativeZoom,
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

  // ---- draw everything (reads live refs so a drag can call it directly) ----
  const draw = useCallback(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (overlayRef.current) { map.removeLayer(overlayRef.current); overlayRef.current = null; }
    const g = L.layerGroup();
    const ll = (p: XY) => toLL(p, lat, lng);
    const bs = liveRef.current;

    // ── shade, one polygon per caster, own roof punched out ──────────────────
    if (shBearing != null && perMetre > 0) {
      for (const b of bs) {
        const sdw = shadowOf(b, shBearing, perMetre);
        if (!sdw) continue;
        L.polygon([sdw.map(ll), rectCorners(b).map(ll)], {
          pane: SHADE_PANE, color: "#0B1524", weight: 0,
          fillColor: "#0B1524", fillOpacity: 1, interactive: false,
        }).addTo(g);
      }
    }

    // ── the site ─────────────────────────────────────────────────────────────
    if (section) {
      L.polygon(section.map(ll), {
        color: SECTION_ORANGE, weight: 2.6, opacity: 0.98,
        fillColor: "#FF8C28", fillOpacity: 0.14, interactive: false,
      }).addTo(g);
      for (const e of edges(section)) {
        if (e.metres < 1.5) continue;
        L.marker(ll([e.mid[0] + e.outward[0] * 1.6, e.mid[1] + e.outward[1] * 1.6]), {
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

    // ── the buildings ────────────────────────────────────────────────────────
    bs.forEach((b, i) => {
      const isSel = editing && i === selected;
      L.polygon(rectCorners(b).map(ll), {
        color: b.isSubject ? "#FFFFFF" : "#8FD3FF",
        weight: isSel ? 3 : 1.8,
        opacity: isSel ? 1 : 0.9,
        dashArray: b.isSubject ? undefined : "5 4",
        fill: editing, fillColor: isSel ? "#8FD3FF" : "#000", fillOpacity: isSel ? 0.18 : 0,
        interactive: editing,
      }).on("click", () => { if (editing) setSelected(i); }).addTo(g);

      if (editing) {
        L.marker(ll([b.east, b.north]), {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div style="transform:translate(-50%,-50%);font:800 10px ${MONO};
                     color:${isSel ? "#0B1524" : "#fff"};background:${isSel ? "#8FD3FF" : "rgba(11,21,36,.7)"};
                     border-radius:5px;padding:2px 6px;white-space:nowrap">
                     ${b.isSubject ? "THIS HOUSE" : `NEIGHBOUR ${i}`} · ${b.height.toFixed(1)}m</div>`,
            iconSize: [0, 0],
          }),
        }).addTo(g);
      }
    });

    // ── sunrise / sunset bearings ────────────────────────────────────────────
    if (day.sunriseAz != null && day.sunsetAz != null) {
      const reach = section ? Math.max(...section.map(p => Math.hypot(p[0], p[1]))) + 4 : 22;
      const arc: [number, number][] = [];
      const span = ((day.sunriseAz - day.sunsetAz) + 360) % 360;
      for (let i = 0; i <= 48; i++) arc.push(ll(along([0, 0], day.sunriseAz - (span * i) / 48, reach)));
      L.polyline(arc, { color: "#fff", weight: 1.4, opacity: 0.45, dashArray: "5 6", interactive: false }).addTo(g);
      for (const [az, label, time] of [
        [day.sunriseAz, "MORNING SUN", localTime(day.sunrise)],
        [day.sunsetAz, "AFTERNOON SUN", localTime(day.sunset)],
      ] as [number, string, string][]) {
        L.circleMarker(ll(along([0, 0], az, reach)), {
          radius: 6, color: "rgba(0,0,0,.55)", weight: 1.6,
          fillColor: "#FFD66E", fillOpacity: 1, interactive: false,
        }).addTo(g);
        L.marker(ll(along([0, 0], az, Math.max(4, reach - 5))), {
          interactive: false,
          icon: L.divIcon({
            className: "",
            html: `<div style="transform:translate(-50%,-50%);text-align:center;white-space:nowrap;
                     text-shadow:0 0 3px #000,0 0 3px #000,0 0 4px #000">
                     <div style="font:800 9.5px ${MONO};letter-spacing:.1em;color:#FFD66E">${label}</div>
                     <div style="font:700 13px system-ui,sans-serif;color:#fff">${time}</div></div>`,
            iconSize: [0, 0],
          }),
        }).addTo(g);
      }
    }

    if (pos && pos.elevation > 0 && section) {
      const reach = Math.max(...section.map(p => Math.hypot(p[0], p[1])));
      L.polyline([ll([0, 0]), ll(along([0, 0], pos.azimuth, reach))], {
        color: "#FFC53D", weight: 2.2, opacity: 0.9, interactive: false,
      }).addTo(g);
    }

    g.addTo(map);
    overlayRef.current = g;
  }, [ready, section, shBearing, perMetre, day, pos?.azimuth, pos?.elevation, lat, lng, editing, selected]);

  useEffect(() => { draw(); }, [draw, buildings]);

  // ---- drag handles for the selected building ----
  useEffect(() => {
    if (!ready) return;
    const L = LRef.current, map = mapRef.current;
    if (handleRef.current) { map.removeLayer(handleRef.current); handleRef.current = null; }
    if (!editing) return;
    const b = liveRef.current[selected];
    if (!b) return;

    const g = L.layerGroup();
    const ll = (p: XY) => toLL(p, lat, lng);
    const xy = (e: any): XY => toXY(e.latlng.lat, e.latlng.lng, lat, lng);
    const commit = () => { setBuildings([...liveRef.current]); setDirty(true); };

    const knob = (at: XY, colour: string, title: string, onDrag: (p: XY) => void) => {
      const m = L.marker(ll(at), {
        draggable: true, keyboard: false, title,
        icon: L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${colour};
                   border:2px solid #0B1524;box-shadow:0 1px 4px rgba(0,0,0,.6);cursor:grab"></div>`,
          iconSize: [16, 16], iconAnchor: [8, 8],
        }),
      });
      m.on("drag", (e: any) => { onDrag(xy(e.target)); draw(); });
      m.on("dragend", commit);
      m.addTo(g);
      return m;
    };

    // move · resize · rotate
    knob([b.east, b.north], "#8FD3FF", "Drag to move", p => { b.east = p[0]; b.north = p[1]; });
    knob(rectCorners(b)[1], "#FFD66E", "Drag to resize", p => {
      const { w, d } = sizeFromCorner(b, p); b.w = w; b.d = d;
    });
    const handleAt = along([b.east, b.north], b.rot, b.d / 2 + 3.5);
    knob(handleAt, "#FF6A00", "Drag to turn", p => { b.rot = rotFromHandle(b, p); });

    g.addTo(map);
    handleRef.current = g;
  }, [ready, editing, selected, buildings, lat, lng, draw]);

  // ---- play the day ----
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const step = (now: number) => {
      const advance = ((now - last) / 16.7) * 2.2;
      last = now;
      setT(prev => { const next = (prev ?? riseMin) + advance; return next > setMin ? riseMin : next; });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, riseMin, setMin]);

  // ---- editor actions ----
  const addNeighbour = () => {
    // Placed on the northern boundary by default, because that is the one that
    // matters here: in New Zealand the sun is in the north, so a building to the
    // north is the one that takes your light.
    const north = section ? Math.max(...section.map(p => p[1])) + 6 : 14;
    const next: Rect = { east: 0, north, w: 12, d: 8, rot: 0, height: 6.5, isSubject: false };
    const arr = [...liveRef.current, next];
    setBuildings(arr); setSelected(arr.length - 1); setDirty(true); setEditing(true);
  };
  const removeSelected = () => {
    const arr = liveRef.current.filter((_, i) => i !== selected);
    setBuildings(arr.length ? arr : [derivedSubject(floorArea, 1, 3.5)]);
    setSelected(0); setDirty(true);
  };
  const setHeight = (h: number) => {
    const arr = liveRef.current.map((b, i) => (i === selected ? { ...b, height: h } : b));
    setBuildings(arr); setDirty(true);
  };
  const save = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      await api(`/api/geo/buildings/${propertyId}`, {
        method: "PUT",
        body: JSON.stringify({ buildings: liveRef.current.map(toApi) }),
      });
      setDirty(false);
    } finally { setSaving(false); }
  };
  const reset = () => {
    setBuildings([derivedSubject(floorArea, 1, 3.5)]); setSelected(0); setDirty(true);
  };

  const sel = buildings[selected];
  const sourceNote = parcel?.source === "linz"
    ? `Boundary from LINZ${parcel.appellation ? ` · ${parcel.appellation}` : ""}`
    : section ? "Boundary approximated from the listing's land area" : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {([["winter", "Shortest day"], ["equinox", "Equinox"], ["summer", "Longest day"], ["today", "Today"]] as [Preset, string][])
          .map(([k, label]) => (
            <button key={k} onClick={() => { setPreset(k); setT(null); }} aria-pressed={preset === k}
              style={btn(preset === k)}>{label}</button>
          ))}
        <button onClick={() => setPlaying(p => !p)}
          style={{ ...btn(false), marginLeft: "auto", background: "#F0B429", borderColor: "#D89B10", color: "#2B2100" }}>
          {playing ? "❚❚ Pause" : "▶ Play the day"}
        </button>
      </div>

      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div ref={elRef} style={{ height: PANEL_H, width: "100%", background: "#2a2f36" }} />

        <div style={{
          position: "absolute", top: 12, right: 12, zIndex: 500, background: "#fff",
          border: `1px solid ${C.border}`, borderRadius: 11, padding: "10px 13px",
          boxShadow: "0 4px 16px rgba(16,24,40,.28)", minWidth: 162,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".1em", color: C.mono }}>AT THIS TIME</div>
          <div className="tnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>
            {instant ? localTime(instant) : "—"}
          </div>
          <div style={{ marginTop: 7, fontSize: 12, color: C.label, lineHeight: 1.6 }}>
            <b style={{ color: C.ink }}>Sun</b> {pos && pos.elevation > 0 ? `${compass(pos.azimuth)} · ${pos.elevation.toFixed(0)}° up` : "—"}<br />
            <b style={{ color: C.ink }}>Casting</b> {buildings.length} building{buildings.length === 1 ? "" : "s"}
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

        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 500, background: "rgba(255,255,255,.96)",
          border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 11px", fontSize: 11.5,
          display: "flex", gap: 13, boxShadow: "0 3px 12px rgba(16,24,40,.22)", flexWrap: "wrap", maxWidth: 320,
        }}>
          <Key color="rgba(11,21,36,.52)" label="Shade" />
          <Key color="#FFFFFF" label="This house" outline />
          <Key color="#8FD3FF" label="Neighbour" outline />
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

      {/* ── editor ─────────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 14, border: `1px solid ${editing ? "#8FD3FF" : C.border}`, borderRadius: 12,
        padding: "12px 14px", background: editing ? "#F4FBFF" : C.card,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setEditing(e => !e)} style={btn(editing)}>
            {editing ? "Done adjusting" : "Adjust buildings"}
          </button>
          {editing && <>
            <button onClick={addNeighbour} style={btn(false)}>+ Add a neighbour</button>
            <button onClick={removeSelected} disabled={buildings.length <= 1}
              style={{ ...btn(false), opacity: buildings.length <= 1 ? 0.45 : 1 }}>Remove selected</button>
            <button onClick={reset} style={btn(false)}>Reset</button>
            {propertyId != null && (
              <button onClick={save} disabled={!dirty || saving}
                style={{ ...btn(false), marginLeft: "auto", background: dirty ? "#22C55E" : C.card,
                         borderColor: dirty ? "#16A34A" : C.border, color: dirty ? "#fff" : C.faint }}>
                {saving ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
            )}
          </>}
        </div>

        {editing ? (
          <>
            <div style={{ fontSize: 12.5, color: C.label, marginTop: 10, lineHeight: 1.6 }}>
              Drag the <b style={{ color: "#2F86B8" }}>blue</b> dot to move a building,
              the <b style={{ color: "#B98700" }}>yellow</b> one to resize it, and
              the <b style={{ color: SECTION_ORANGE }}>orange</b> one to turn it. Click any outline to select it.
              <br />
              <b>Add the neighbours to the north</b> — in New Zealand the sun tracks through
              the north, so those are the buildings that take this property's light.
            </div>
            {sel && (
              <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 12, flexWrap: "wrap" }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: ".1em", color: C.mono }}>
                  {sel.isSubject ? "THIS HOUSE" : `NEIGHBOUR ${selected}`} HEIGHT
                </span>
                <input type="range" min={2} max={20} step={0.5} value={sel.height}
                       onChange={(e) => setHeight(Number(e.target.value))}
                       style={{ flex: "1 1 160px", accentColor: C.accent }}
                       aria-label="Building height in metres" />
                <span className="tnum" style={{ fontWeight: 800, fontSize: 14 }}>{sel.height} m</span>
                <span style={{ fontSize: 11.5, color: C.faint }}>
                  {sel.height <= 3.5 ? "single storey" : sel.height <= 7 ? "two storey"
                    : sel.height <= 10.5 ? "three storey" : "apartment block"}
                  {" · "}{(sel.w * sel.d).toFixed(0)} m² footprint
                </span>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: C.label, marginTop: 8 }}>
            Only this property's own building is casting. The shade that matters most is
            usually the neighbour's — <b>Adjust buildings</b> to place them.
          </div>
        )}
      </div>

      {sourceNote && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 8 }}>{sourceNote}</div>}
    </div>
  );
}

const btn = (on: boolean): React.CSSProperties => ({
  fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 9, cursor: "pointer",
  border: `1px solid ${on ? C.accent : C.border}`,
  background: on ? C.accent : C.card, color: on ? "#fff" : C.label,
});

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

/** N / E / S / W. In New Zealand north is where the sun is, so it gets the accent. */
function Compass() {
  return (
    <div style={{ position: "absolute", right: 14, bottom: 30, zIndex: 500, pointerEvents: "none" }} aria-hidden="true">
      <svg viewBox="0 0 76 76" width="76" height="76">
        <circle cx="38" cy="38" r="37" fill="rgba(16,24,38,.55)" stroke="rgba(255,255,255,.5)" />
        {[[38, 12, 38, 28], [64, 38, 50, 38], [38, 64, 38, 48], [12, 38, 26, 38]].map((d, i) => (
          <line key={i} x1={d[0]} y1={d[1]} x2={d[2]} y2={d[3]} stroke="rgba(255,255,255,.9)" strokeWidth="1.8" />
        ))}
        <polygon points="38,7 32,20 44,20" fill="#FFC53D" />
        {([["N", 38, 18, "#FFC53D"], ["E", 62, 42, "#fff"], ["S", 38, 71, "#fff"], ["W", 14, 42, "#fff"]] as const)
          .map(([ch, x, y, fill]) => (
            <text key={ch} x={x} y={y} textAnchor="middle" fontSize="11" fontWeight="800" fill={fill}
                  stroke="rgba(0,0,0,.65)" strokeWidth="2.6" paintOrder="stroke">{ch}</text>
          ))}
      </svg>
    </div>
  );
}
