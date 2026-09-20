/**
 * Where the aerial photo of a property comes from.
 *
 * The key is set by an admin at **Admin → Map imagery** and comes down from the
 * backend at page load. It used to be a NEXT_PUBLIC_ build variable, which meant
 * changing or rotating it required a rebuild and a full redeploy — and a key set
 * without also setting the provider name did nothing at all, which looks exactly
 * like a key that does not work. The env vars still work as a fallback so local
 * development needs no database, but the dashboard wins.
 *
 * Three sources, sharpest first:
 *
 *   google Two different Google products, in this order:
 *            1. Map Tiles API — real satellite TILES, streamed as you pan, at
 *               twice the screen's pixel density (scaleFactor2x). This is the
 *               sharp one, and the only sanctioned way to put Google aerial into
 *               a Leaflet map. It needs a session token: one POST per browser
 *               tab, cached for the rest of it.
 *            2. Maps Static API — one flat 640x640 image, used only if the
 *               session mint fails (API not enabled on the key, offline, a
 *               referrer restriction that does not cover this host). Soft on a
 *               retina screen and cannot be panned, which is why it is the
 *               fallback rather than the main path.
 *   linz   Toitū Te Whenua LINZ Basemaps. Free with a key, commonly 10-30 cm and
 *          flown more recently than the global sets. NZ only.
 *   esri   Last resort: free, no key, worldwide, and capped at zoom 19 — the
 *          blurriest of the three, and the only one that needs no setup.
 */

import { api } from "./api";

export type Provider = "google" | "linz" | "esri";

export type AerialTiles = {
  kind: "tiles";
  url: string;
  attribution: string;
  /** Deepest zoom the source actually has pixels for. Past this Leaflet upscales
   *  the last real tile rather than requesting a missing one and drawing a grey
   *  square. */
  maxNativeZoom: number;
  /** Deepest zoom the map will let you reach at all. */
  maxZoom: number;
  provider: Provider;
};

export type AerialStatic = {
  kind: "static";
  url: string;
  attribution: string;
  halfWidthM: number;
  halfHeightM: number;
  imgWidth: number;
  provider: Provider;
};

export type Aerial = AerialTiles | AerialStatic;

export type ImageryConfig = { provider: Provider; googleKey: string; linzKey: string };

// ── configuration ─────────────────────────────────────────────────────────────

const ENV_PROVIDER = (process.env.NEXT_PUBLIC_MAP_PROVIDER ?? "").trim().toLowerCase();
const ENV_GOOGLE = (process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "").trim();
const ENV_LINZ = (process.env.NEXT_PUBLIC_LINZ_API_KEY ?? "").trim();

/** Which source to use, given what is actually available. A named provider only
 *  wins if its key is there: naming one whose key is missing would turn the
 *  panel into a grey box, and falling through to something that works beats
 *  being right about the config. */
export function pickProvider(named: string, google: string, linz: string): Provider {
  const p = (named || "").trim().toLowerCase();
  if (p === "google" && google) return "google";
  if (p === "linz" && linz) return "linz";
  if (p === "esri") return "esri";
  if (google) return "google";
  if (linz) return "linz";
  return "esri";
}

function envConfig(): ImageryConfig {
  return {
    provider: pickProvider(ENV_PROVIDER, ENV_GOOGLE, ENV_LINZ),
    googleKey: ENV_GOOGLE,
    linzKey: ENV_LINZ,
  };
}

let configPromise: Promise<ImageryConfig> | null = null;

/**
 * The imagery settings, fetched once per page load and shared by every map.
 *
 * Falls back to the build-time env vars on any failure — including the 401/402
 * a signed-out or unsubscribed visitor gets, because the endpoint sits behind
 * the same paywall as the listings themselves. Those pages have no maps on them
 * anyway; what matters is that a failure here never blanks a map.
 */
export function imageryConfig(): Promise<ImageryConfig> {
  if (!configPromise) {
    configPromise = api<{ provider: string; google_key: string | null; linz_key: string | null }>(
      "/api/config/maps",
    )
      .then((r) => {
        const google = (r.google_key ?? "").trim() || ENV_GOOGLE;
        const linz = (r.linz_key ?? "").trim() || ENV_LINZ;
        return { provider: pickProvider(r.provider, google, linz), googleKey: google, linzKey: linz };
      })
      .catch(() => envConfig());
  }
  return configPromise;
}

/** Forget the cached settings, so the next map re-reads them. The admin page
 *  calls this after a save — otherwise the person who just pasted a key would
 *  have to hard-refresh to find out whether it worked. */
export function forgetImageryConfig(): void {
  configPromise = null;
  sessionPromise = null;
}

/** Ground metres covered by one pixel, at a latitude and Web Mercator zoom. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

// ── the sources ───────────────────────────────────────────────────────────────

/** Google caps a Static Maps request at 640 x 640 logical pixels. `scale=2`
 *  doubles the delivered resolution without widening the ground coverage, so
 *  this is what keeps a wide panel sharp rather than what limits it. */
const G_MAX = 640;

/** Google satellite has real pixels to about zoom 21 over New Zealand towns;
 *  past that it is enlargement, which the map still allows so you can look
 *  closely, it just stops asking for tiles that do not exist. */
const GOOGLE_MAX_NATIVE = 21;

function googleStatic(
  key: string, lat: number, lng: number, zoom: number, aspect: number,
): AerialStatic {
  const w = G_MAX, h = Math.round(G_MAX / aspect);
  const mpp = metresPerPixel(lat, zoom);
  const q = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: String(zoom),
    size: `${w}x${h}`,
    scale: "2",
    maptype: "satellite",
    format: "jpg",
    key,
  });
  return {
    kind: "static",
    url: `https://maps.googleapis.com/maps/api/staticmap?${q}`,
    // The Google wordmark is burned into the bottom-left of the image and must
    // stay visible — nothing in the panel may cover that corner.
    attribution: "Imagery &copy; Google",
    halfWidthM: (w / 2) * mpp,
    halfHeightM: (h / 2) * mpp,
    imgWidth: w,
    provider: "google",
  };
}

function googleTiles(key: string, session: string): AerialTiles {
  return {
    kind: "tiles",
    url: `https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(session)}&key=${encodeURIComponent(key)}`,
    attribution: "Imagery &copy; Google",
    maxNativeZoom: GOOGLE_MAX_NATIVE,
    maxZoom: 22,
    provider: "google",
  };
}

function linzTiles(key: string): AerialTiles {
  return {
    kind: "tiles",
    url: `https://basemaps.linz.govt.nz/v1/tiles/aerial/EPSG:3857/{z}/{x}/{y}.webp?api=${key}`,
    attribution: "Imagery &copy; Toitū Te Whenua LINZ, CC BY 4.0",
    maxNativeZoom: 22,
    maxZoom: 22,
    provider: "linz",
  };
}

function esriTiles(): AerialTiles {
  return {
    kind: "tiles",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri",
    maxNativeZoom: 19,
    maxZoom: 22,
    provider: "esri",
  };
}

// ── the Google tile session ───────────────────────────────────────────────────
//
// Tiles are not fetchable with the key alone: Google wants a session token that
// pins the map type and the pixel scale. It is valid for two weeks, so it is
// minted once and kept for the tab — a token per property view would be a
// pointless round trip in front of every map.

const SESSION_STORE_KEY = "apex.gmaps.session.v1";
const SESSION_TIMEOUT_MS = 4000;

type StoredSession = { session: string; expiry: number; key: string };

/** Last four characters of the key, so a session minted under a key an admin has
 *  since replaced is not reused against the new one. */
const keyTag = (key: string) => key.slice(-4);

function readStoredSession(key: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    // Two minutes of headroom: a token that expires mid-pan would blank the
    // tiles with no error anyone could act on.
    if (s?.session && s.key === keyTag(key) && s.expiry - 120 > Date.now() / 1000) return s.session;
  } catch {
    /* private mode, quota, or a shape from an older build — mint a new one */
  }
  return null;
}

function storeSession(key: string, session: string, expiry: number): void {
  try {
    window.sessionStorage.setItem(
      SESSION_STORE_KEY, JSON.stringify({ session, expiry, key: keyTag(key) }));
  } catch {
    /* not being able to cache it costs one extra POST, nothing more */
  }
}

let sessionPromise: Promise<string | null> | null = null;

/** The Google tile session token, or null if one cannot be had. Never throws:
 *  every failure here means "fall back", not "no map". */
export function googleSession(key: string): Promise<string | null> {
  if (typeof window === "undefined" || !key) return Promise.resolve(null);
  if (sessionPromise) return sessionPromise;

  const cached = readStoredSession(key);
  if (cached) {
    sessionPromise = Promise.resolve(cached);
    return sessionPromise;
  }

  sessionPromise = (async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), SESSION_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // scaleFactor2x + highDpi is the sharpness: the tile covers the same
          // ground, it just arrives with four times the pixels, which is what a
          // retina screen wants and what the static image cannot give.
          body: JSON.stringify({
            mapType: "satellite",
            language: "en-NZ",
            region: "NZ",
            scale: "scaleFactor2x",
            highDpi: true,
          }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { session?: string; expiry?: string | number };
      const token = (body.session ?? "").trim();
      if (!token) return null;
      const expiry = Number(body.expiry) || Math.floor(Date.now() / 1000) + 3600;
      storeSession(key, token, expiry);
      return token;
    } catch {
      // Timed out, offline, API not enabled, or the key's referrer restriction
      // does not cover this host. All of them mean the same thing here.
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  return sessionPromise;
}

// ── what the panels call ──────────────────────────────────────────────────────

/**
 * The sharpest imagery this deployment can get for one property.
 *
 * Google resolves to tiles when a session can be minted and to the flat static
 * image when it cannot. Falls through the whole chain rather than failing: a
 * soft photo beats a grey rectangle.
 */
export async function aerialAsync(
  lat: number, lng: number, zoom: number, aspect: number,
): Promise<Aerial> {
  const cfg = await imageryConfig();
  if (cfg.provider === "google") {
    const session = await googleSession(cfg.googleKey);
    return session ? googleTiles(cfg.googleKey, session)
                   : googleStatic(cfg.googleKey, lat, lng, zoom, aspect);
  }
  if (cfg.provider === "linz") return linzTiles(cfg.linzKey);
  return esriTiles();
}

/**
 * A TILED aerial layer, for panels that must pan and zoom.
 *
 * Same order of preference, but the Google static image is never returned: a
 * flat photo pinned to one box cannot be panned, and a location map that refuses
 * to move is worse than a slightly softer one that does. If the Google session
 * cannot be minted this drops to LINZ or Esri rather than to Static Maps.
 */
export async function aerialTilesAsync(): Promise<AerialTiles> {
  const cfg = await imageryConfig();
  if (cfg.provider === "google") {
    const session = await googleSession(cfg.googleKey);
    if (session) return googleTiles(cfg.googleKey, session);
  }
  if (cfg.linzKey) return linzTiles(cfg.linzKey);
  return esriTiles();
}

/** True when the panel is showing a single fixed image rather than live tiles. */
export const isStatic = (a: Aerial): a is AerialStatic => a.kind === "static";
