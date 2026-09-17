/**
 * Where the sun is, for a given place and moment.
 *
 * Pure astronomy (NOAA solar-position algorithm) — deterministic, offline, no API
 * key and no per-call cost. Every listing already carries lat/lng, so this works
 * for any property in the country.
 *
 * Southern-hemisphere note, because it drives the whole feature: the sun tracks
 * through the NORTH here. On the shortest day in Auckland it peaks only ~30° above
 * the horizon, which is exactly why a north-facing aspect is worth paying for and
 * why anything to a property's south sits in shade all winter.
 */

export type SunPos = {
  /** Degrees above the horizon. Negative = below (night). */
  elevation: number;
  /** Compass bearing of the sun, degrees clockwise from true north. */
  azimuth: number;
};

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Days since the J2000.0 epoch. */
function julianDays(when: Date): number {
  return (when.getTime() - Date.UTC(2000, 0, 1, 12)) / 86400000;
}

/** Sun elevation + azimuth at a location and instant. */
export function sunPosition(lat: number, lon: number, when: Date): SunPos {
  const jd = julianDays(when);
  const g = rad((357.529 + 0.98560028 * jd) % 360);          // mean anomaly
  const q = (280.459 + 0.98564736 * jd) % 360;               // mean longitude
  const L = rad((q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360); // ecliptic longitude
  const e = rad(23.439 - 0.00000036 * jd);                   // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * jd) % 24;
  const lst = rad((gmst * 15 + lon) % 360);
  const ha = lst - ra;                                       // hour angle
  const la = rad(lat);

  const elevation = Math.asin(
    Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha),
  );
  const azimuth = Math.atan2(
    -Math.sin(ha) * Math.cos(dec),
    Math.cos(la) * Math.sin(dec) - Math.sin(la) * Math.cos(dec) * Math.cos(ha),
  );
  return { elevation: deg(elevation), azimuth: (deg(azimuth) + 360) % 360 };
}

/** The property's own timezone. Sun times must be the PROPERTY's local times —
 *  a buyer browsing from Sydney or Singapore still wants Auckland's sunrise. */
export const NZ_TZ = "Pacific/Auckland";

/** Minutes that `tz` is ahead of UTC at this instant (DST-aware). */
function tzOffsetMinutes(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** The UTC instant of local midnight for a calendar day in `tz`. Two passes so
 *  a DST transition on the day itself still resolves. */
function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  const naive = Date.UTC(y, m, d, 0, 0, 0, 0);
  let ms = naive;
  for (let i = 0; i < 2; i++) ms = naive - tzOffsetMinutes(new Date(ms), tz) * 60000;
  return new Date(ms);
}

/** Render an instant as HH:MM in the property's timezone. */
export function localTime(at: Date | null, tz: string = NZ_TZ): string {
  if (!at) return "—";
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(at);
}

/**
 * Minutes since midnight AT THE PROPERTY.
 *
 * The day slider runs sunrise -> sunset, so both ends have to be measured in the
 * same clock. Measuring them in the viewer's clock inverted the range for anyone
 * browsing from outside New Zealand — NZ sunrise lands on the previous UTC day,
 * so sunrise came out *after* sunset and the slider went dead.
 */
export function localMinutes(at: Date, tz: string = NZ_TZ): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
  }).formatToParts(at).reduce<Record<string, string>>((a, x) => (a[x.type] = x.value, a), {});
  return (+p.hour % 24) * 60 + +p.minute;
}

export type DaySun = {
  /** Local Date objects, or null on a day the sun never rises/sets. */
  sunrise: Date | null;
  sunset: Date | null;
  /** Compass bearing where the sun clears / meets the horizon. */
  sunriseAz: number | null;
  sunsetAz: number | null;
  /** Highest the sun gets, and when. */
  noonElevation: number;
  solarNoon: Date | null;
  /** Hours between sunrise and sunset. */
  daylightHours: number;
};

/**
 * Sunrise / sunset / solar noon for one calendar day AT THE PROPERTY.
 *
 * The scan is anchored to midnight in the property's timezone, not the viewer's.
 * Anchoring to the browser's midnight looked fine from New Zealand but broke
 * everywhere else: from UTC the window straddled two NZ days, so it reported the
 * NEXT morning's sunrise and no sunset at all.
 *
 * Scans at 1-minute steps — exact to ±1 min, and cheap because it runs once per
 * date change, not on every slider tick.
 */
export function daySun(lat: number, lon: number, day: Date, tz: string = NZ_TZ): DaySun {
  const start = zonedMidnight(day.getFullYear(), day.getMonth(), day.getDate(), tz);
  let sunrise: Date | null = null, sunset: Date | null = null;
  let sunriseAz: number | null = null, sunsetAz: number | null = null;
  let noonElevation = -90, solarNoon: Date | null = null;
  let prevEl: number | null = null;

  // Official sunrise/sunset is when the sun's UPPER LIMB touches the horizon,
  // which atmospheric refraction lifts into view early: the standard threshold is
  // -0.833° (34' refraction + 16' solar radius), not 0°. Using 0° put us ~6 min
  // behind NIWA's published times.
  const HORIZON = -0.833;

  for (let m = 0; m <= 24 * 60; m++) {
    const t = new Date(start.getTime() + m * 60000);
    const { elevation, azimuth } = sunPosition(lat, lon, t);
    if (elevation > noonElevation) { noonElevation = elevation; solarNoon = t; }
    if (prevEl !== null) {
      if (prevEl < HORIZON && elevation >= HORIZON && !sunrise) { sunrise = t; sunriseAz = azimuth; }
      if (prevEl >= HORIZON && elevation < HORIZON && sunrise && !sunset) { sunset = t; sunsetAz = azimuth; }
    }
    prevEl = elevation;
  }
  const daylightHours =
    sunrise && sunset ? (sunset.getTime() - sunrise.getTime()) / 3600000 : 0;
  return { sunrise, sunset, sunriseAz, sunsetAz, noonElevation, solarNoon, daylightHours };
}

/**
 * Shadow cast by something `height` metres tall, at this sun position.
 * Direction is the bearing the shadow points (opposite the sun); length grows as
 * the sun drops — which is why low winter sun throws such long shadows.
 * Returns null when the sun is below the horizon (no shadow to speak of).
 */
export function shadow(pos: SunPos, height = 3): { bearing: number; length: number } | null {
  if (pos.elevation <= 0.5) return null;              // at/below horizon: shadow is effectively infinite
  const length = height / Math.tan(rad(pos.elevation));
  return { bearing: (pos.azimuth + 180) % 360, length };
}

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** 47° → "NE" */
export function compass(bearing: number): string {
  return POINTS[Math.round(bearing / 22.5) % 16];
}

/** The three dates that actually matter when judging a property's sun. */
export function keyDates(year: number) {
  return {
    winter: new Date(year, 5, 21),   // 21 Jun — shortest day, worst-case sun
    equinox: new Date(year, 8, 21),  // 21 Sep — the average day
    summer: new Date(year, 11, 21),  // 21 Dec — longest day
  };
}
