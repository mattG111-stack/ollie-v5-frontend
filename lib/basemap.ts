/**
 * The street basemap, in one place.
 *
 * Every map in the app drew CARTO Voyager, and the comment beside each copy
 * said "free, no API key". That stopped being true: CARTO now requires a key on
 * those tiles and stamps
 *
 *     API KEY REQUIRED — carto.com/basemaps/apikey
 *
 * diagonally across every tile it serves. Three components carried their own
 * copy of that URL, so it broke in three places at once and would have had to
 * be fixed in three — the same one-rule-many-callers trap that has bitten this
 * codebase before. It lives here now.
 *
 * Two sources, resolved by the server:
 *
 *   LINZ Basemaps  Toitū Te Whenua's own topographic map of New Zealand. Free
 *                  with the key an admin sets under Map imagery, better data
 *                  for this country than any world dataset, and sharp to zoom
 *                  22. Used whenever that key exists — whatever the AERIAL
 *                  provider is set to, because wanting Google photography over
 *                  a LINZ street map is a perfectly ordinary combination.
 *
 *   Esri           The keyless fallback. World Light Gray Canvas: free, no
 *                  sign-up, no quota, permitted with attribution, and quiet
 *                  enough that coloured markers read clearly over it. Esri
 *                  serves place names as a SEPARATE overlay, so this returns a
 *                  labels layer too; LINZ has its labels baked in and returns
 *                  none.
 *
 * The key reaches the browser because the browser is what fetches the tiles.
 * A LINZ key is domain-restrictable and free, and the same is already true of
 * the aerial key beside it.
 */

import { api } from "./api";

export interface StreetBasemap {
  url: string;
  /** Esri only — place names, drawn over the base. LINZ bakes its own in. */
  labels?: string;
  attribution: string;
  maxNativeZoom: number;
  maxZoom: number;
  provider: "linz" | "esri";
}

const ESRI: StreetBasemap = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  labels:
    "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  attribution: "Tiles &copy; Esri",
  // Real tiles stop at 16 and Leaflet upscales past it. Claiming more asks for
  // tiles that do not exist and paints grey squares when somebody zooms in.
  maxNativeZoom: 16,
  maxZoom: 19,
  provider: "esri",
};

function linz(key: string): StreetBasemap {
  return {
    url: `https://basemaps.linz.govt.nz/v1/tiles/topographic/EPSG:3857/{z}/{x}/{y}.webp?api=${encodeURIComponent(key)}`,
    attribution: "&copy; Toitū Te Whenua LINZ, CC BY 4.0",
    maxNativeZoom: 22,
    maxZoom: 22,
    provider: "linz",
  };
}

/** What every map falls back to before the config lands, and if it never does. */
export const STREET_FALLBACK = ESRI;

// One request per page load, shared by however many maps are on it — three of
// them ask, and three round trips for one answer is three chances to disagree.
let pending: Promise<StreetBasemap> | null = null;

export function streetBasemap(): Promise<StreetBasemap> {
  if (!pending) {
    pending = api<{ street_provider?: string; street_key?: string | null }>("/api/config/maps")
      .then((cfg) =>
        cfg.street_provider === "linz" && cfg.street_key
          ? linz(cfg.street_key)
          : ESRI,
      )
      // A map that will not draw is worse than a map drawn from the fallback,
      // so a failure here is never fatal.
      .catch(() => ESRI);
  }
  return pending;
}
