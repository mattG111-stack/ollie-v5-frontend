import type { ForSaleRow } from "./api";

export type InsightRow = { id: number; property?: ForSaleRow };
export type PropertyInsight = {
  schemaVersion: 1;
  kind: "land_price_tradeoff" | "asking_estimate_gap";
  scope: { propertyIds: number[]; description: string };
  title: string;
  finding: string;
  relevance: string;
  metrics: { name: string; value: number; unit: "NZD" | "m²"; basis: "recorded" | "model-derived" }[];
  evidence: { propertyId: number; address: string; href: string; field: "asking_price" | "land_area_m2" | "fair_value"; value: number; unit: "NZD" | "m²"; basis: "recorded" | "model-estimate" }[];
  limitations: string[];
  nextAction: { label: string; href: string };
};
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const money = (v: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumSignificantDigits: 21 }).format(v);
// Avoid binary floating-point tails when subtracting imported decimal values.
const difference = (a: number, b: number) => Number((a - b).toPrecision(15));

/** Deterministic insight contract. No model-written claims or inferred buyer requirements. */
export function buildPropertyInsights(rows: InsightRow[]): PropertyInsight[] {
  if (!rows.length || rows.some(r => !Number.isSafeInteger(r.id) || r.id <= 0 || !r.property || r.property.off_market)) return [];
  const loaded = rows as { id: number; property: ForSaleRow }[];
  const names = loaded.map(r => (r.property.address || "").trim().toLowerCase().replace(/\s+/g, " "));
  if (names.some(n => !n) || new Set(names).size !== names.length || new Set(rows.map(r => r.id)).size !== rows.length) return [];
  const evidence = (r: typeof loaded[number], field: "asking_price" | "land_area_m2" | "fair_value"): PropertyInsight["evidence"][number] => ({
    propertyId: r.id, address: r.property.address!, href: `/property/${r.id}`, field, value: r.property[field]!,
    unit: field === "land_area_m2" ? "m²" : "NZD", basis: field === "fair_value" ? "model-estimate" : "recorded",
  });
  const scope = { propertyIds: rows.map(r => r.id), description: `Only these ${rows.length} linked record${rows.length === 1 ? "" : "s"}; not the whole market.` };
  const freshness = "The source listing dates and current availability have not been independently verified.";
  if (loaded.length === 1) {
    const r = loaded[0], p = r.property;
    if (!positive(p.asking_price) || !positive(p.fair_value)) return [];
    const gap = difference(p.fair_value, p.asking_price);
    return [{ schemaVersion: 1, kind: "asking_estimate_gap", scope,
      title: "The price gap to investigate",
      finding: gap === 0 ? "The recorded asking price equals the Apex estimate." : `${p.address} is asking ${money(Math.abs(gap))} ${gap > 0 ? "below" : "above"} the Apex estimate.`,
      relevance: "Use the gap to frame your evidence checks. It does not establish whether this is a good purchase.",
      metrics: [{ name: "Apex estimate minus asking", value: gap, unit: "NZD", basis: "model-derived" }],
      evidence: [evidence(r,"asking_price"),evidence(r,"fair_value")],
      limitations: ["The estimate is modelled; the difference excludes costs and is not profit.", positive(p.comps_used) ? `${p.comps_used} valuation comparables are recorded; similarity and dates still need review.` : "No usable valuation comparable count is recorded.", freshness],
      nextAction: { label: "Inspect this property's evidence", href: `/property/${r.id}` },
    }];
  }
  if (!loaded.every(r => positive(r.property.asking_price) && positive(r.property.land_area_m2))) return [];
  const min = Math.min(...loaded.map(r => r.property.asking_price!));
  const max = Math.max(...loaded.map(r => r.property.land_area_m2!));
  const cheapest = loaded.filter(r => r.property.asking_price === min);
  const largest = loaded.filter(r => r.property.land_area_m2 === max);
  if (cheapest.length !== 1 || largest.length !== 1 || cheapest[0].id === largest[0].id) return [];
  const low = cheapest[0], high = largest[0];
  const extraPrice = difference(high.property.asking_price!, low.property.asking_price!);
  const extraLand = difference(high.property.land_area_m2!, low.property.land_area_m2!);
  if (!positive(extraPrice) || !positive(extraLand)) return [];
  return [{ schemaVersion: 1, kind: "land_price_tradeoff", scope,
    title: "More land or a lower asking price?",
    finding: `${high.property.address} has ${extraLand.toLocaleString("en-NZ")} m² more recorded land and an asking price ${money(extraPrice)} higher than ${low.property.address}.`,
    relevance: "If land size matters to your search, this makes the extra asking price visible before you investigate.",
    metrics: [{ name:"Additional asking price",value:extraPrice,unit:"NZD",basis:"recorded" },{ name:"Additional recorded land",value:extraLand,unit:"m²",basis:"recorded" }],
    evidence: [evidence(low,"asking_price"),evidence(low,"land_area_m2"),evidence(high,"asking_price"),evidence(high,"land_area_m2")],
    limitations: ["Different homes also differ in condition, floor area, title and location. The price difference is not a valuation of the extra land.","Recorded land area does not establish usable land or development potential.",freshness],
    nextAction: { label:"Inspect the larger-land property",href:`/property/${high.id}` },
  }];
}
