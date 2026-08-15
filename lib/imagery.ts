/**
 * Where the aerial photo of a property comes from.
 *
 * Three providers, picked with one env var, because the right answer depends on
 * what the account has rather than on anything in the code:
 *
 *   esri   (default) free, no key, worldwide. Resolution over New Zealand
 *          suburbs is decent but not always current.
 *   linz   Toitū Te Whenua LINZ Basemaps. Free with a key, and the best
 *          imagery available for New Zealand — commonly 10-30 cm, flown far
 *          more recently than the global sets. NZ only.
 *   google Maps Static API. One image request per property view, so it is the
 *          cheapest Google product for this panel by a wide margin and the
 *          only one that does not need a per-session token dance.
 *
 * Tiled providers stream as you pan. Google returns a single flat image, so it
 * is placed as an overlay across a known lat/lng box and the map is pinned to
 * it — which is fine here, because this panel only ever looks at one section.
 */

export type Aerial =
  | { kind: "tiles"; url: string; attribution: string; maxNativeZoom: number }
  | { kind: "static"; url: string; attribution: string; halfWidthM: number; halfHeightM: number; imgWidth: number };

const PROVIDER = (process.env.NEXT_PUBLIC_MAP_PROVIDER ?? "esri").trim().toLowerCase();
const GOOGLE_KEY = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "").trim();
const LINZ_KEY = (process.env.NEXT_PUBLIC_LINZ_API_KEY ?? "").trim();

/** Ground metres covered by one pixel, at a latitude and Web Mercator zoom. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Google caps a Static Maps request at 640 x 640 logical pixels. `scale=2`
 *  doubles the delivered resolution without widening the ground coverage, so
 *  this is what keeps a wide panel sharp rather than what limits it. */
const G_MAX = 640;

export function aerial(lat: number, lng: number, zoom: number, aspect: number): Aerial {
  if (PROVIDER === "google" && GOOGLE_KEY) {
    const w = G_MAX, h = Math.round(G_MAX / aspect);
    const mpp = metresPerPixel(lat, zoom);
    const q = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: String(zoom),
      size: `${w}x${h}`,
      scale: "2",
      maptype: "satellite",
      format: "jpg",
      key: GOOGLE_KEY,
    });
    return {
      kind: "static",
      url: `https://maps.googleapis.com/maps/api/staticmap?${q}`,
      // The Google wordmark is burned into the bottom-left of the image and
      // must stay visible — nothing in the panel may cover that corner.
      attribution: "Imagery &copy; Google",
      halfWidthM: (w / 2) * mpp,
      halfHeightM: (h / 2) * mpp,
      imgWidth: w,
    };
  }

  if (PROVIDER === "linz" && LINZ_KEY) {
    return {
      kind: "tiles",
      url: `https://basemaps.linz.govt.nz/v1/tiles/aerial/EPSG:3857/{z}/{x}/{y}.webp?api=${LINZ_KEY}`,
      attribution: "Imagery &copy; Toitū Te Whenua LINZ, CC BY 4.0",
      maxNativeZoom: 22,
    };
  }

  return {
    kind: "tiles",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri",
    maxNativeZoom: 19,
  };
}

/** True when the panel is showing a single fixed image rather than live tiles. */
export const isStatic = (a: Aerial): a is Extract<Aerial, { kind: "static" }> => a.kind === "static";
