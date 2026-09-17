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

/**
 * How many tile failures, with nothing having drawn, before giving up on a
 * source. A couple of stray errors are normal at the edge of coverage; a source
 * that is actually broken — wrong key, wrong URL, host unreachable — loads
 * NOTHING, and that is the discriminator. Not "some tiles failed", but "no tile
 * has ever succeeded".
 */
const GIVE_UP_AFTER = 4;

/**
 * Put the street map on a Leaflet map, and keep it there.
 *
 * THE BUG THIS EXISTS FOR. The source was picked once, from config, and trusted.
 * If the LINZ key was wrong — or the URL shape was wrong, or the host was
 * unreachable — every tile 403'd and the map was a blank grey rectangle with a
 * LINZ credit under it. A confident credit for tiles that never arrived.
 *
 * Choosing a source is not the same as it working, and the only place that
 * difference is observable is the browser doing the fetching. So the config
 * gives an ORDER, not an answer, and the first source that actually draws
 * something is the one that stays. A wrong key now costs a slightly plainer map
 * instead of no map.
 *
 * `onSettled` reports which source won, so a page can say so rather than
 * leaving somebody looking at a grey box wondering whether it is still loading.
 */
export function mountStreet(
  L: any, map: any, chain: StreetBasemap[],
  opts: {
    /** Kept pointing at the LIVE layer, so a caller that shows and hides the
     *  street map still has the right object after a fallback swapped it. */
    holder?: { current: any };
    onSettled?: (base: StreetBasemap | null) => void;
  } = {},
): void {
  const { holder, onSettled } = opts;
  let i = 0;

  const use = (n: number) => {
    const base = chain[n];
    if (!base) {                    // every source failed — say so, once
      onSettled?.(null);
      return;
    }
    let ok = false, bad = 0;
    const layers: any[] = [];

    const street = L.tileLayer(base.url, {
      attribution: base.attribution,
      maxNativeZoom: base.maxNativeZoom,
      maxZoom: Math.max(base.maxZoom, 22),
    });
    street.on("tileload", () => {
      if (ok) return;
      ok = true;                    // it works; stop watching for failure
      onSettled?.(base);
    });
    street.on("tileerror", () => {
      if (ok || n !== i) return;    // already drawing, or already moved on
      if (++bad < GIVE_UP_AFTER) return;
      i = n + 1;
      for (const l of layers) { try { map.removeLayer(l); } catch {} }
      if (holder) holder.current = null;
      use(i);
    });
    street.addTo(map);
    layers.push(street);
    if (holder) holder.current = street;

    // Esri serves place names separately; LINZ bakes its own in. A labels
    // layer that fails is not worth changing source over — the base is the map.
    if (base.labels) {
      const names = L.tileLayer(base.labels, {
        maxNativeZoom: base.maxNativeZoom,
        maxZoom: Math.max(base.maxZoom, 22),
      }).addTo(map);
      layers.push(names);
    }
  };

  use(0);
}

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

/**
 * The sources to try, best first.
 *
 * An ORDER rather than a choice. Config can say which source is preferred but
 * it cannot know whether that source will answer — only the browser fetching
 * the tiles finds that out, so the decision belongs there. LINZ is preferred
 * when a key exists because it is the best map of this country there is; Esri
 * is always last because it needs no key and therefore cannot be misconfigured.
 */
export async function streetChain(): Promise<StreetBasemap[]> {
  const first = await streetBasemap();
  return first.provider === "esri" ? [ESRI] : [first, ESRI];
}
