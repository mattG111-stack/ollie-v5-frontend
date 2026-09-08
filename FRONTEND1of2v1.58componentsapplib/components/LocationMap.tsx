"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { C, MONO } from "./apex";
import { mountStreet, streetChain } from "@/lib/basemap";
import { aerialTilesAsync } from "@/lib/imagery";

/**
 * Location panel. Leaflet comes from the bundle, like the app's other two maps
 * — see loadLeaflet below for why it no longer comes from a CDN.
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


// The street basemap lives in lib/basemap.ts — LINZ where a key is set, Esri
// otherwise — so all three maps in the app move together. It was CARTO, which
// now requires a key and watermarks its tiles.

type View = "street" | "aerial";

/**
 * Leaflet, from the bundle.
 *
 * It used to be fetched from unpkg at runtime — a <script> and a <link> added
 * to the head on first render — while `leaflet` sat in package.json all along,
 * already installed and already built. So every customer's map depended on a
 * third party CDN answering: unpkg down, or blocked by a corporate network, and
 * the panel was an empty box. The two other maps in this app import it from the
 * bundle; only this one did not, which is exactly the kind of drift that
 * survives because the odd one out still works most days.
 *
 * The css import at the top of the file is the other half — without it Leaflet
 * renders a heap of unpositioned tiles rather than a map.
 */
async function loadLeaflet(): Promise<any> {
  return (await import("leaflet")).default;
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
  // True only when EVERY street source failed to draw a single tile. Grey with
  // a confident credit under it is the worst of both — it looks like a map that
  // is still loading, for ever.
  const [baseFailed, setBaseFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(async (L) => {
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
        // An ORDER, not a choice: the first source that actually draws a tile
        // is the one that stays. maxNativeZoom comes from the source, because
        // claiming more than a source has asks for tiles that do not exist and
        // paints grey squares at close zoom.
        mountStreet(L, map, await streetChain(), {
          // streetRef is what the street/aerial toggle shows and hides, so it
          // has to track the layer that is actually live — a fallback replaces
          // it, and a stale ref here is a toggle that stops working.
          holder: streetRef,
          onSettled: (b) => setBaseFailed(b === null),
        });
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

      {/* Every source refused. Say so: a blank grey rectangle with a confident
          credit under it reads as a map still loading, and it never will. The
          location itself is still drawn — the circle and the caption are ours,
          not the tile server's — so this says what is missing rather than
          pretending the whole panel is broken. */}
      {baseFailed && view === "street" && (
        <div
          style={{
            position: "absolute", inset: 0, zIndex: 400,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none", padding: 24,
          }}
        >
          <span
            style={{
              background: "rgba(14,27,46,.92)", color: C.darkText,
              borderRadius: 10, padding: "10px 14px", fontSize: 12.5,
              textAlign: "center", maxWidth: 320, lineHeight: 1.45,
            }}
          >
            The street map could not be loaded. Everything else on this page is
            unaffected.
          </span>
        </div>
      )}
    </div>
  );
}
