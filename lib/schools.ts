/**
 * Schools attached to a property, out of the export's schools_json.
 *
 * The export carries around thirty schools per property with a zone flag and a
 * distance for each. In Auckland "is it in zone" is one of the first questions
 * a buyer with children asks, and it was sitting in the database unread.
 *
 * One row of the raw payload:
 *
 *   { "organizationName": "Blockhouse Bay School", "slug": "blockhouse-bay-school",
 *     "inZone": true, "hasZone": true, "geoRadius": "0.54km",
 *     "geoPoint": [174.702162, -36.924902] }
 *
 * Note geoPoint is [longitude, latitude] — that order, not the other one.
 */

export type School = {
  name: string;
  slug: string;
  /** Straight-line distance in km. Null when the payload did not carry one. */
  km: number | null;
  /** This address is inside the school's enrolment zone. */
  inZone: boolean;
  /** The school HAS a zone (so "not in zone" means something). */
  hasZone: boolean;
  lat: number | null;
  lng: number | null;
};

/** "0.54km" / "540m" / 0.54 → 0.54. Anything unreadable → null. */
function toKm(raw: unknown): number | null {
  if (typeof raw === "number" && isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const m = /([\d.]+)\s*(km|m)?/i.exec(raw.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return null;
  return m[2]?.toLowerCase() === "m" ? n / 1000 : n;
}

/**
 * Parsed schools, in the order a reader wants them: the ones this address is
 * in zone for first, then everything else by how close it is.
 *
 * Never throws — a malformed payload is simply no schools, because a panel
 * that fails to render is worse than a panel that isn't there.
 */
export function parseSchools(raw: string | null | undefined): School[] {
  if (!raw) return [];
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : data?.schools;
  if (!Array.isArray(list)) return [];

  const out: School[] = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const name = String(s.organizationName ?? s.name ?? "").trim();
    if (!name) continue;
    const point = Array.isArray(s.geoPoint) ? s.geoPoint : [];
    out.push({
      name,
      slug: String(s.slug ?? ""),
      km: toKm(s.geoRadius ?? s.distance),
      inZone: s.inZone === true,
      hasZone: s.hasZone !== false,
      lng: typeof point[0] === "number" ? point[0] : null,
      lat: typeof point[1] === "number" ? point[1] : null,
    });
  }

  // Same school twice (it happens across zone types) — keep the first.
  const seen = new Set<string>();
  const unique = out.filter((s) => {
    const key = s.slug || s.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => {
    if (a.inZone !== b.inZone) return a.inZone ? -1 : 1;
    if (a.km == null) return 1;
    if (b.km == null) return -1;
    return a.km - b.km;
  });
}

/** "0.54km" for the short ones, "2.2km" beyond that — two decimals of a
 *  straight-line distance is more precision than the number deserves. */
export function fmtKm(km: number | null): string {
  if (km == null) return "";
  return km < 1 ? `${km.toFixed(2)}km` : `${km.toFixed(1)}km`;
}
