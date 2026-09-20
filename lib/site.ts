/**
 * The site itself: its boundary, its building, and how much of it is in shade.
 *
 * Everything here works in LOCAL METRES — east and north of the property pin —
 * and converts to lat/lng only at the edge, when handing rings to Leaflet. Mixing
 * the two is how you end up with a shadow that is the right length and the wrong
 * shape, because a degree of longitude is 80 cm shorter than a degree of latitude
 * at Auckland's latitude and the error grows with distance from the pin.
 */

export type LL = [number, number];      // [lat, lng]
export type XY = [number, number];      // [east, north] metres from the pin

const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

export const toXY = (lat: number, lng: number, oLat: number, oLng: number): XY =>
  [(lng - oLng) * mPerDegLng(oLat), (lat - oLat) * M_PER_DEG_LAT];

export const toLL = ([e, n]: XY, oLat: number, oLng: number): LL =>
  [oLat + n / M_PER_DEG_LAT, oLng + e / mPerDegLng(oLat)];

/** Move `metres` from a point along a compass bearing (degrees from true north). */
export function along([e, n]: XY, bearing: number, metres: number): XY {
  const b = (bearing * Math.PI) / 180;
  return [e + Math.sin(b) * metres, n + Math.cos(b) * metres];
}

/** Shoelace area in m². */
export function area(poly: XY[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a / 2);
}

/** Ray-cast point-in-polygon. Works for any ring, including concave ones. */
export function inside([x, y]: XY, poly: XY[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Monotone-chain convex hull. */
export function hull(pts: XY[]): XY[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: XY, a: XY, b: XY) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: XY[] = [], up: XY[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  lo.pop(); up.pop();
  return lo.concat(up);
}

/** A building: centre offset from the pin, footprint size, rotation, height.
 *  This is what the editor manipulates and what the API stores. */
export type Rect = {
  east: number; north: number; w: number; d: number; rot: number; height: number;
  isSubject?: boolean; label?: string | null;
};

/** The four corners of a building, in local metres.
 *  `rot` turns the building clockwise from north, which is how a compass reads
 *  and how the editor's rotate handle behaves. */
export function rectCorners(r: Rect): XY[] {
  const a = (r.rot * Math.PI) / 180;
  const dn: XY = [Math.sin(a), Math.cos(a)];          // depth axis: north at rot 0
  const wd: XY = [Math.cos(a), -Math.sin(a)];         // width axis: east at rot 0
  const c: XY = [r.east, r.north];
  return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sw, sd]) => [
    c[0] + (sw * r.w / 2) * wd[0] + (sd * r.d / 2) * dn[0],
    c[1] + (sw * r.w / 2) * wd[1] + (sd * r.d / 2) * dn[1],
  ] as XY);
}

/** Read a dragged point back into width/depth, respecting the rotation. */
export function sizeFromCorner(r: Rect, pt: XY): { w: number; d: number } {
  const a = (r.rot * Math.PI) / 180;
  const dx = pt[0] - r.east, dy = pt[1] - r.north;
  const w = Math.abs(dx * Math.cos(a) + dy * -Math.sin(a)) * 2;
  const d = Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) * 2;
  return { w: Math.max(2, Math.min(120, w)), d: Math.max(2, Math.min(120, d)) };
}

/** Bearing from a building's centre to a dragged point — the rotate handle. */
export function rotFromHandle(r: Rect, pt: XY): number {
  const deg = (Math.atan2(pt[0] - r.east, pt[1] - r.north) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** The subject dwelling, sized from floor area when nobody has traced it.
 *  A rectangle on the pin: the best guess available without a building-outline
 *  layer, and the reason the editor exists. */
export function derivedSubject(
  floorArea: number | null | undefined, storeys: number, height: number,
): Rect {
  const foot = Math.max(45, (floorArea && floorArea > 0 ? floorArea : 150) / storeys);
  const w = Math.sqrt(foot * 1.3), d = foot / w;       // slightly wider than deep
  return { east: 0, north: 0, w, d, rot: 0, height, isSubject: true };
}

/** Backwards-compatible corner list for a derived subject dwelling. */
export function footprint(floorArea: number | null | undefined, storeys: number): XY[] {
  return rectCorners(derivedSubject(floorArea, storeys, 3.5));
}

/** The shadow a building throws: its corners, plus those corners pushed along
 *  the shadow bearing, hulled. Null when the sun is too low to mean anything. */
export function shadowOf(r: Rect, bearing: number, perMetre: number): XY[] | null {
  if (!(perMetre > 0)) return null;
  const len = r.height * perMetre;
  const c = rectCorners(r);
  return hull([...c, ...c.map(p => along(p, bearing, len))]);
}

/** A square section of `landArea` m² centred on the pin — the stand-in when LINZ
 *  has no parcel for this point. Deliberately a plain square: a made-up irregular
 *  shape would read as surveyed when it isn't. */
export function fallbackSection(landArea: number | null | undefined): XY[] | null {
  if (!landArea || landArea <= 0) return null;
  const h = Math.sqrt(landArea) / 2;
  return [[-h, h], [h, h], [h, -h], [-h, -h]];
}

/**
 * Open ground inside the section that is in shade, as a percentage.
 *
 * Sampled on a lattice rather than clipped polygon-against-polygon. Real parcels
 * are routinely concave — L-shaped, or notched for a right-of-way — and a convex
 * clipper returns a confident wrong answer on exactly those. The house's own
 * footprint is excluded from both sides of the ratio: it isn't yard, and counting
 * it would report a permanent floor of shade that no amount of sun removes.
 */
export function shadeFraction(section: XY[], house: XY[], shade: XY[] | null, step = 0.5): number {
  return shadeFractionOf(section, house ? [house] : [], shade ? [shade] : [], step);
}

/**
 * Open ground inside the section shaded by ANY building, as a fraction.
 *
 * The shade that decides whether a property is cold is usually the neighbour's,
 * not its own, so every building casts and the answer is their union. Sampling
 * gives the union for free — a point is either in some shadow or it is not —
 * where unioning the polygons themselves would need a clipping library and would
 * still have to handle the concave results.
 *
 * Ground under any building is excluded from both sides of the ratio: it isn't
 * yard, and counting it would report a permanent floor of shade.
 */
export function shadeFractionOf(
  section: XY[], buildings: XY[][], shadows: XY[][], step = 0.5,
): number {
  if (!shadows.length || section.length < 3) return 0;
  const xs = section.map(p => p[0]), ys = section.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  let open = 0, dark = 0;
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      const pt: XY = [x, y];
      if (!inside(pt, section)) continue;
      if (buildings.some(b => inside(pt, b))) continue;
      open++;
      if (shadows.some(sdw => inside(pt, sdw))) dark++;
    }
  }
  return open ? dark / open : 0;
}

/** Each boundary run as a midpoint, a length in metres, and the angle to draw it
 *  at — enough for a title-plan style dimension label on every edge. */
export function edges(poly: XY[]): { mid: XY; metres: number; angle: number; outward: XY }[] {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // Screen y grows downward while north grows up, so the angle is negated to
    // match what the label will actually be rotated by in the DOM.
    let angle = -Math.atan2(b[1] - a[1], b[0] - a[0]) * (180 / Math.PI);
    if (angle > 90 || angle < -90) angle += 180;         // keep text upright
    const ox = mid[0] - cx, oy = mid[1] - cy;
    const len = Math.hypot(ox, oy) || 1;
    return {
      mid,
      metres: Math.hypot(b[0] - a[0], b[1] - a[1]),
      angle,
      outward: [ox / len, oy / len],
    };
  });
}
