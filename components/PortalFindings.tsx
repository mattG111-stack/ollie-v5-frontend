"use client";

/**
 * What the portals found, before any of it is written.
 *
 * Nothing in this list has changed a listing. A figure scraped off someone
 * else's page is a claim, and the person who has to defend a valuation should
 * see the number before it moves one.
 *
 * Grouped by property, because that is the unit a decision gets made in: five
 * sources answering about one house is one judgement, not five.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Finding = {
  id: number;
  property_id: number;
  address: string | null;
  suburb: string | null;
  source: string;
  field: string;
  kind: "fact" | "detail" | "estimate";
  value: number | string | null;
  current: number | string | null;
};

const SOURCE: Record<string, string> = {
  corelogic: "CoreLogic", homes: "homes.co.nz", oneroof: "OneRoof",
  trademe: "Trade Me", realestate: "realestate.co.nz",
};

const FIELD: Record<string, string> = {
  floor_area_m2: "Floor area", land_area_m2: "Land area", beds: "Bedrooms",
  baths: "Bathrooms", cars: "Car spaces", cv_numeric: "Council valuation",
  land_value_numeric: "Land value", improvement_value_numeric: "Improvement value",
  building_age: "Year built", property_type: "Property type", image_url: "Photo",
  tm_valuation: "Trade Me's estimate", homes_valuation: "homes.co.nz's estimate",
  realestate_valuation: "realestate.co.nz's estimate",
  third_party_valuation: "OneRoof's estimate", pv_estimate_mid: "CoreLogic's estimate",
};

const AREA = new Set(["floor_area_m2", "land_area_m2"]);
const MONEY = new Set([
  "cv_numeric", "land_value_numeric", "improvement_value_numeric",
  "tm_valuation", "homes_valuation", "realestate_valuation",
  "third_party_valuation", "pv_estimate_mid",
]);

function show(field: string, v: number | string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (MONEY.has(field)) return `$${Math.round(v).toLocaleString()}`;
    if (AREA.has(field)) return `${Math.round(v)} m²`;
    return String(v);
  }
  return String(v).length > 40 ? `${String(v).slice(0, 40)}…` : String(v);
}

export default function PortalFindings() {
  const [rows, setRows] = useState<Finding[]>([]);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const d = await api<{ pending: number; findings: Finding[] }>(
      "/api/admin/release/portals/findings").catch(() => null);
    if (!d) return;
    setRows(d.findings);
    setPending(d.pending);
    setChosen(new Set(d.findings.map((f) => f.id)));   // opt-out, not opt-in
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(approve: boolean, ids?: number[]) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ applied: number; rejected: number; skipped: number; reasons: string[] }>(
        "/api/admin/release/portals/decide",
        { method: "POST", body: JSON.stringify({ ids: ids ?? [...chosen], approve }) });
      setMsg(approve
        ? `Loaded ${r.applied}${r.skipped ? ` · ${r.skipped} skipped (${r.reasons.join("; ")})` : ""}`
        : `Discarded ${r.rejected}`);
      await load();
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (pending === 0 && rows.length === 0) return null;

  // One decision per property, not per field.
  const byProperty = new Map<number, Finding[]>();
  for (const f of rows) {
    const list = byProperty.get(f.property_id) || [];
    list.push(f);
    byProperty.set(f.property_id, list);
  }

  const toggle = (ids: number[]) => {
    const next = new Set(chosen);
    const allOn = ids.every((i) => next.has(i));
    for (const i of ids) (allOn ? next.delete(i) : next.add(i));
    setChosen(next);
  };

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4 mt-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-display font-semibold text-sm">
            The portals found {pending.toLocaleString()} thing{pending === 1 ? "" : "s"} — nothing is loaded yet
          </div>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            None of this has changed a listing. Tick what you want and load it; anything that
            changes what a property is worth is re-priced and re-checked against the margin floor
            on the way in. What you discard is remembered, so the same number is not offered again.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => decide(false)}
            disabled={busy || chosen.size === 0}
            className="px-3 py-2 text-sm font-semibold rounded-lg border border-line hover:bg-page disabled:opacity-40"
          >
            Discard ticked
          </button>
          <button
            onClick={() => decide(true)}
            disabled={busy || chosen.size === 0}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-40"
            style={{ background: "#0A8754" }}
          >
            {busy ? "Loading…" : `Load ${chosen.size} ticked`}
          </button>
        </div>
      </div>

      {msg && <div className="text-xs mt-3 text-muted">{msg}</div>}

      <div className="mt-4 grid gap-3">
        {[...byProperty.entries()].map(([pid, list]) => {
          const ids = list.map((f) => f.id);
          const on = ids.every((i) => chosen.has(i));
          return (
            <div key={pid} className="border border-line rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(ids)}
                className="w-full text-left px-3 py-2 bg-page flex items-center gap-2"
              >
                <input type="checkbox" readOnly checked={on} className="pointer-events-none" />
                <span className="text-sm font-semibold">
                  {list[0].address || `Listing ${pid}`}
                </span>
                <span className="text-xs text-muted">{list[0].suburb}</span>
              </button>
              <div className="divide-y divide-divider">
                {list.map((f) => (
                  <label key={f.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={chosen.has(f.id)}
                      onChange={() => toggle([f.id])}
                    />
                    <span className="w-40 shrink-0 text-muted text-xs">
                      {FIELD[f.field] || f.field}
                    </span>
                    <span className="w-32 shrink-0 text-xs text-faint">
                      {SOURCE[f.source] || f.source}
                    </span>
                    <span className="tnum font-semibold">{show(f.field, f.value)}</span>
                    {f.current !== null && f.current !== undefined && (
                      <span className="text-xs text-faint">
                        (we hold {show(f.field, f.current)})
                      </span>
                    )}
                    {f.kind === "estimate" && (
                      <span className="text-[10px] uppercase tracking-wider text-faint ml-auto">
                        their opinion · display only
                      </span>
                    )}
                    {f.kind === "fact" && (
                      <span className="text-[10px] uppercase tracking-wider ml-auto"
                        style={{ color: "#D4503E" }}>
                        re-prices this listing
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
