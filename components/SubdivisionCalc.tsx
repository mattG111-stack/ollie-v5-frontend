"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toNearestThousand } from "@/lib/format";
import { useT } from "@/lib/i18n";

/**
 * Subdivision feasibility — styled to the Apex design (white card, 18px radius,
 * two-column label/value rows), with every assumption editable in place.
 *
 * Strategy: keep the existing house, subdivide the surplus land, resell the
 * house on its reduced lot. The house is valued from its parts — buildings plus
 * the land it retains — because land and a house on land are not worth the same
 * per m². Costing it at "buy price − refurb" would sell the same land twice.
 *
 * Recalculation is SERVER-SIDE (POST /subdivision-scenario) so the profit
 * formula lives in exactly one place and this panel cannot drift from what the
 * batch ingest computes. Edits are per-session and never persisted.
 */

const C = {
  card: "#FFFFFF",
  border: "#E1E7EF",
  divider: "#EDF1F6",
  label: "#5A6B82",
  faint: "#7A8698",
  text: "#14233A",
  danger: "#EF4444",
  good: "#22C55E",
  editBg: "#EEF2F7",
} as const;

type Scenario = {
  sections: number | null;
  max_addl_lots: number | null;
  section_rate: number | null;
  house_resale: number | null;
  retained_land_m2: number | null;
  improvement_value: number | null;
  raw_land_rate: number | null;
  market_ratio: number | null;
  new_sections_value: number | null;
  gross_sales: number | null;
  services_cost: number | null;
  selling_cost: number | null;
  acquisition_cost: number | null;
  incidentals_cost: number | null;
  demolition_cost: number | null;
  holding_cost: number | null;
  holding_years: number | null;
  contingency_cost: number | null;
  gst_cost: number | null;
  buy_price: number | null;
  subdivision_profit: number | null;
  is_profitable: boolean;
  implausible_vs_value?: boolean;
  has_house: boolean;
  full_subdivision: boolean;
  best_strategy: string | null;
  is_terrace: boolean;
  dwellings: number | null;
  defaults: Record<string, number | null>;
};

type FieldKey =
  | "lots"
  | "buy_price"
  | "improvement_value"
  | "raw_land_rate"
  | "section_rate"
  | "market_ratio"
  | "build_rate"
  | "house_resale_pct"
  | "refurb_allowance"
  | "services_per_section"
  | "selling_pct"
  | "acquisition_pct"
  | "incidentals_per_section"
  | "holding_rate"
  | "holding_years"
  | "contingency_rate"
  | "gst_rate";

type Field = { key: FieldKey; label: string; pct?: boolean; suffix?: string };

const LEFT: Field[] = [
  // First, because it is the one figure here that is about the SITE rather than
  // about costs — and the one the model is least able to see. The count comes
  // from land area over the zone minimum less a road allowance, which knows
  // nothing about a corner section, an existing right of way, a boundary that
  // already suits three, or a consent already granted. Profit is close to
  // linear in it, so the model being one lot low understates the deal by about
  // a third, and it is low far more often than high.
  { key: "lots", label: "subcalc.lots" },
  { key: "buy_price", label: "subcalc.buyPrice" },
  { key: "improvement_value", label: "subcalc.buildingsWorth" },
  { key: "build_rate", label: "subcalc.buildRate", suffix: "/m²" },
  { key: "raw_land_rate", label: "subcalc.rawLandRate", suffix: "/m²" },
  { key: "section_rate", label: "subcalc.sectionRate", suffix: "/m²" },
  { key: "market_ratio", label: "subcalc.councilMarket", pct: true },
  { key: "house_resale_pct", label: "subcalc.houseResells", pct: true },
];
const RIGHT: Field[] = [
  { key: "refurb_allowance", label: "subcalc.subdivRefurb" },
  { key: "services_per_section", label: "subcalc.feesPerSection" },
  { key: "selling_pct", label: "subcalc.realEstateCost", pct: true },
  { key: "acquisition_pct", label: "subcalc.acquisitionCost", pct: true },
  { key: "holding_rate", label: "subcalc.holdingRate", pct: true },
  { key: "holding_years", label: "subcalc.holdingYears", suffix: "yr" },
  { key: "contingency_rate", label: "subcalc.contingencyRate", pct: true },
  { key: "gst_rate", label: "subcalc.gstRate", pct: true },
  { key: "incidentals_per_section", label: "subcalc.incidentalsPerSection" },
];
const FIELDS = [...LEFT, ...RIGHT];

// Accepts "12,000", "$12000", "12k", "1.5m", "95", "95%", "0.95".
function parseNum(raw: string, pct: boolean): number | null | undefined {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return undefined; // blank = use default
  const m = s.match(/^(\d*\.?\d+)(k|m|%)?$/);
  if (!m) return null; // invalid
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1_000;
  else if (m[2] === "m") n *= 1_000_000;
  // Percent fields accept "95", "95%" or "0.95". Values >= 2 can only be a
  // percentage; below that, treat as a fraction so 1.03 stays 103% and does not
  // silently become 1.03%.
  if (pct && (m[2] === "%" || n >= 2)) n = n / 100;
  return n;
}

const money = (v: number | null | undefined) =>
  v == null ? "—" : `${v < 0 ? "−" : ""}$${toNearestThousand(Math.round(Math.abs(v))).toLocaleString()}`;

export default function SubdivisionCalc({
  propertyId,
  zone,
  minLot,
}: {
  propertyId: number;
  zone?: string | null;
  minLot?: number | null;
}) {
  const { t } = useT();
  const [edits, setEdits] = useState<Partial<Record<FieldKey, string>>>({});
  const [mode, setMode] = useState<"retain" | "full">("retain");
  const [data, setData] = useState<Scenario | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(
    async (body: Record<string, number | boolean>) => {
      setBusy(true);
      try {
        const r = await api<Scenario>(`/api/properties/${propertyId}/subdivision-scenario`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        setData(r);
        setErr(null);
      } catch (e: any) {
        setErr(e?.detail || e?.message || t("subcalc.couldNot"));
      } finally {
        setBusy(false);
      }
    },
    [propertyId, t],
  );

  // Assemble the request from the current edits plus the retain/demolish mode.
  const assemble = useCallback((m: "retain" | "full", next: Partial<Record<FieldKey, string>>) => {
    const b: Record<string, number | boolean> = { full_subdivision: m === "full" };
    for (const f of FIELDS) {
      const raw = next[f.key];
      if (raw === undefined) continue;
      const v = parseNum(raw, !!f.pct);
      if (v !== null && v !== undefined) b[f.key] = v;
    }
    return b;
  }, []);

  useEffect(() => {
    void run(assemble("retain", {}));
  }, [run, assemble]);

  const invalid = FIELDS.filter((f) => {
    const raw = edits[f.key];
    return raw !== undefined && parseNum(raw, !!f.pct) === null;
  }).map((f) => f.key);

  function onEdit(key: FieldKey, value: string) {
    const next = { ...edits, [key]: value };
    setEdits(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void run(assemble(mode, next));
    }, 300);
  }

  function chooseMode(m: "retain" | "full") {
    if (m === mode) return;
    setMode(m);
    if (timer.current) clearTimeout(timer.current);
    void run(assemble(m, edits));
  }

  function reset() {
    setMode("retain");
    setEdits({});
    if (timer.current) clearTimeout(timer.current);
    void run(assemble("retain", {}));
  }

  if (err && !data)
    return (
      <Card>
        <div style={{ color: C.danger, fontSize: 15 }}>{err}</div>
      </Card>
    );
  if (!data)
    return (
      <Card>
        <div style={{ color: C.label, fontSize: 15 }}>{t("subcalc.loading")}</div>
      </Card>
    );

  const touched = Object.values(edits).some((v) => v !== undefined && v !== "");
  const profit = data.subdivision_profit;
  // No retained house => bare land subdivided whole: hide the house line and
  // show every lot as a section.
  const isBare = data.house_resale == null && data.retained_land_m2 == null;
  const shown = (f: Field) => {
    if (edits[f.key] !== undefined) return edits[f.key] as string;
    const v = data.defaults[f.key];
    if (v == null) return "";
    return f.pct ? String(Math.round(v * 1000) / 10) : String(Math.round(v));
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em" }}>
          {t("subcalc.title")}
        </div>
        {touched && (
          <button
            type="button"
            onClick={reset}
            style={{
              fontSize: 13,
              color: C.label,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {t("subcalc.reset")}
          </button>
        )}
      </div>

      {/* Retain vs demolish — only when there is a house to keep. */}
      {data.has_house && (
        <div style={{ display: "inline-flex", gap: 4, marginTop: 14, background: C.editBg,
                      border: `1px solid ${C.border}`, borderRadius: 10, padding: 3 }}>
          {(["retain", "full"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                aria-pressed={active}
                style={{
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                  border: "none", borderRadius: 8, padding: "7px 14px",
                  background: active ? C.text : "transparent",
                  color: active ? "#fff" : C.label,
                }}
              >
                {m === "retain" ? t("subcalc.modeRetain") : t("subcalc.modeDemolish")}
              </button>
            );
          })}
        </div>
      )}

      {/* Reality check. The modelled sections come out worth far more than the
          whole site is selling for, which means the section rate is wrong for
          this land — so we do NOT publish the figures at all. Printing a
          "$3M profit" under a caveat is worse than printing nothing: the number
          is what people remember, and it isn't one we can defend. Say plainly
          that we can't price it and stop. */}
      {data.implausible_vs_value && (
        <div
          style={{
            marginTop: 14,
            background: C.editBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "16px 18px",
            fontSize: 13.5,
            color: C.label,
            lineHeight: 1.55,
          }}
        >
          <div style={{ fontWeight: 800, color: C.text, marginBottom: 4 }}>
            {t("subcalc.noEstimateTitle")}
          </div>
          {t("subcalc.noEstimateBody")}
        </div>
      )}

      {/* Everything below is the numeric feasibility model — hidden entirely
          when the sanity check failed, so no indefensible figure is ever shown. */}
      {!data.implausible_vs_value && (<>
      {/* Feasibility summary — the design's field set */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "0 40px", marginTop: 12 }}>
        <div>
          <Row label={t("subcalc.zone")} value={zone ? zone.replace("Residential - ", "") : "—"} />
          <Row label={t("subcalc.minLot")} value={minLot ? `${Math.round(minLot)} m²` : "—"} />
          <Row label={t("subcalc.additionalLots")} value={data.max_addl_lots?.toString() ?? "—"} last />
        </div>
        <div>
          <Row label={t("subcalc.totalSubdivided")} value={money(data.gross_sales)} />
          <Row
            label={t("subcalc.bestStrategy")}
            value={
              data.is_terrace
                // Terrace build-and-sell — label it as a BUILD, not a section split.
                ? t(data.has_house ? "subcalc.terraceDemolishValue" : "subcalc.terraceBuildValue", { n: data.dwellings ?? data.sections ?? 0 })
                : !data.full_subdivision
                ? t("subcalc.bestStrategyValue")
                : data.has_house
                ? t("subcalc.demolishStrategyValue", { n: data.sections ?? 0 })
                : t("subcalc.subdivideStrategyValue", { n: data.sections ?? 0 })
            }
          />
          <Row
            label={t("subcalc.bestNetGain")}
            value={money(profit)}
            color={profit == null ? undefined : profit > 0 ? C.good : C.danger}
            strong
            last
          />
        </div>
      </div>

      {/* Workings */}
      <div style={{ marginTop: 20, borderTop: `1px solid ${C.divider}`, paddingTop: 4 }}>
        {!isBare && (
          <Row
            label={t("subcalc.houseOnRetained", { land: data.retained_land_m2 != null ? `${Math.round(data.retained_land_m2)} m²` : t("subcalc.land") })}
            value={money(data.house_resale)}
          />
        )}
        {data.is_terrace ? (
          // Terrace build-and-sell: revenue is N terraces SOLD, not bare sections.
          <Row
            label={t("subcalc.terracesSold", {
              n: data.dwellings ?? data.sections ?? 0,
              each: money(
                data.gross_sales && (data.dwellings ?? data.sections)
                  ? Math.round(data.gross_sales / (data.dwellings ?? data.sections)!)
                  : null
              ),
            })}
            value={money(data.gross_sales)}
          />
        ) : (
          <Row
            label={t("subcalc.newSections", { n: (isBare ? data.sections : data.max_addl_lots) ?? 0, rate: data.section_rate ? ` @ $${Math.round(data.section_rate).toLocaleString()}/m²` : "" })}
            value={money(data.new_sections_value)}
          />
        )}
        <Row
          label={
            t("subcalc.grossSales") +
            (data.gross_sales && (data.dwellings ?? data.sections)
              ? data.is_terrace
                ? ` · ${data.dwellings ?? data.sections} terraces sold`
                : ` · ${data.sections} sections sold`
              : "")
          }
          value={money(data.gross_sales)}
          caption={data.is_terrace ? "what you sell the finished terraces for" : "what you sell the finished sections for"}
          strong
        />
        <Row label={t("subcalc.lessPurchase")} value={money(data.buy_price != null ? -data.buy_price : null)} caption="buying the site" />
        {/* For a terrace build, this line is mostly BUILD cost — split it out so it's
            not hidden inside "consent + services" (services = N × $50k, build = rest). */}
        <Row
          label={data.is_terrace ? t("subcalc.lessBuildServices") : t("subcalc.lessConsent")}
          value={money(data.services_cost != null ? -data.services_cost : null)}
          caption={
            data.is_terrace
              ? `build ${money((data.services_cost ?? 0) - (data.dwellings ?? data.sections ?? 0) * 50000)} + consent/civils ${money((data.dwellings ?? data.sections ?? 0) * 50000)}`
              : "earthworks, roads, 3-waters, power & consent per new lot"
          }
        />
        <Row
          label={t("subcalc.lessRealEstate")}
          value={money(data.selling_cost != null ? -data.selling_cost : null)}
          caption={
            data.selling_cost && data.gross_sales
              ? `agent commission + marketing · ${Math.round((data.selling_cost / data.gross_sales) * 100)}% of sales`
              : "agent commission + marketing"
          }
        />
        <Row
          label={t("subcalc.lessAcquisition")}
          value={money(data.acquisition_cost != null ? -data.acquisition_cost : null)}
          caption={
            data.acquisition_cost && data.buy_price
              ? `legal + finance to buy · ${Math.round((data.acquisition_cost / data.buy_price) * 100)}% of purchase`
              : "legal + finance to buy the site"
          }
        />
        {!!data.incidentals_cost && (
          <Row label={t("subcalc.lessIncidentals")} value={money(-data.incidentals_cost)} caption="extra costs you've added" />
        )}
        {!!data.demolition_cost && (
          <Row label={t("subcalc.lessDemolition")} value={money(-data.demolition_cost)} caption="knock down the existing house + site prep" />
        )}
        {!!data.holding_cost && (
          <Row label={t("subcalc.lessHolding", { years: data.holding_years ?? 1 })} value={money(-data.holding_cost)} caption={`interest on money tied up while you build & sell (${data.holding_years ?? 1} yr)`} />
        )}
        {!!data.contingency_cost && (
          <Row label={t("subcalc.lessContingency")} value={money(-data.contingency_cost)} caption="buffer for cost overruns" />
        )}
        {!!data.gst_cost && (
          <Row label={t("subcalc.lessGst")} value={money(-data.gst_cost)} caption="GST on the development profit · 15%" />
        )}
        <Row
          label={t("subcalc.netGain")}
          value={money(profit)}
          color={profit == null ? undefined : profit > 0 ? C.good : C.danger}
          strong
          last
        />
      </div>

      {/* Editable assumptions */}
      <details style={{ marginTop: 18, borderTop: `1px solid ${C.divider}`, paddingTop: 16 }}>
        <summary style={{ fontSize: 14, color: C.label, cursor: "pointer", userSelect: "none" }}>
          {t("subcalc.adjust")}{touched ? t("subcalc.edited") : ""}
          {busy && <span style={{ color: C.faint }}>{t("subcalc.updating")}</span>}
        </summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "0 40px", marginTop: 10 }}>
          {[LEFT, RIGHT].map((col, ci) => (
            <div key={ci}>
              {col.map((f, i) => (
                <EditRow
                  key={f.key}
                  field={f}
                  value={shown(f)}
                  invalid={invalid.includes(f.key)}
                  edited={edits[f.key] !== undefined && edits[f.key] !== ""}
                  onChange={(v) => onEdit(f.key, v)}
                  last={i === col.length - 1}
                />
              ))}
            </div>
          ))}
        </div>
        {invalid.length > 0 && (
          <div style={{ color: C.danger, fontSize: 12.5, marginTop: 10 }}>
            {t("subcalc.enterNumber")}
          </div>
        )}
        <div style={{ fontSize: 12.5, color: C.faint, marginTop: 14, lineHeight: 1.5 }}>
          {t("subcalc.notSaved")}
        </div>
      </details>
      </>)}
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: "26px 28px",
        marginTop: 24,
        color: C.text,
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  color,
  strong,
  last,
  caption,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
  last?: boolean;
  caption?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: caption ? "flex-start" : "center",
        gap: 16,
        padding: "13px 0",
        borderBottom: last ? "none" : `1px solid ${C.divider}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 15, color: C.label }}>{label}</span>
        {caption && (
          <div style={{ fontSize: 11.5, color: "#8A94A6", marginTop: 3, lineHeight: 1.35 }}>
            {caption}
          </div>
        )}
      </div>
      <span
        className="tnum"
        style={{ fontSize: 15, fontWeight: strong ? 700 : 600, textAlign: "right", color, whiteSpace: "nowrap" }}
      >
        {value}
      </span>
    </div>
  );
}

function EditRow({
  field,
  value,
  invalid,
  edited,
  onChange,
  last,
}: {
  field: Field;
  value: string;
  invalid: boolean;
  edited: boolean;
  onChange: (v: string) => void;
  last?: boolean;
}) {
  const { t } = useT();
  return (
    <label
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "9px 0",
        borderBottom: last ? "none" : `1px solid ${C.divider}`,
      }}
    >
      <span style={{ fontSize: 15, color: C.label }}>{t(field.label)}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
          aria-label={t(field.label)}
          className="tnum"
          style={{
            width: 108,
            textAlign: "right",
            fontSize: 15,
            fontWeight: 600,
            fontFamily: "inherit",
            color: invalid ? C.danger : C.text,
            background: edited ? C.editBg : "transparent",
            border: `1px solid ${invalid ? C.danger : "transparent"}`,
            borderRadius: 8,
            padding: "4px 8px",
            outline: "none",
          }}
        />
        <span style={{ fontSize: 13, color: C.faint, width: 24 }}>
          {field.pct ? "%" : field.suffix ?? ""}
        </span>
      </span>
    </label>
  );
}
