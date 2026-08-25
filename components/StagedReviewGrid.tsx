"use client";

import { useEffect, useMemo, useState } from "react";
import { api, StagedGrid, StagedGridRow } from "@/lib/api";
import { fmtArea, fmtDayDate, fmtMoney, fmtNumber, fmtPct } from "@/lib/format";

/* The staged review grid: the table beneath the filter chips that lets a batch
 * be inspected — and exported to Excel — before it ever goes live. That is the
 * whole point of staging.
 *
 * Four DISTINCT, separately-sortable deal figures (see the spec):
 *   Valuation             — what it's worth as-is. The standalone value.
 *   Margin $ / Margin %   — valuation − asking. The deal-finding sort for houses.
 *   Subdivision profit $  — what you clear after developing the lots.
 *   Subdivision profit %  — that profit as a return on total cost.
 * Sorting on $ finds the biggest jobs; sorting on % finds the best returns; the
 * two cannot be served by one sort. "vs CV %" descending is the data-quality
 * sort — the +216% / +433% / +547% cases surface at the top of one screen.
 */

type Kind = "money" | "pct" | "num" | "area" | "text" | "date";

interface Col {
  key: keyof StagedGridRow;
  label: string;
  kind: Kind;
  // A short note under the header for the columns whose meaning is easy to confuse.
  hint?: string;
}

// Order matches the spec's column list. Buy price sits next to Valuation so the
// two read as different numbers — "what it's worth" vs "what you can pay".
const COLS: Col[] = [
  { key: "address", label: "Address", kind: "text" },
  { key: "suburb", label: "Suburb", kind: "text" },
  { key: "asking_price", label: "Asking", kind: "money" },
  { key: "cv_numeric", label: "CV", kind: "money" },
  { key: "valuation", label: "Valuation", kind: "money", hint: "worth as-is" },
  { key: "buy_price", label: "Buy price", kind: "money", hint: "what you can pay" },
  { key: "vs_cv_pct", label: "vs CV %", kind: "pct", hint: "data-quality" },
  { key: "margin_dollars", label: "Margin $", kind: "money" },
  { key: "margin_pct", label: "Margin %", kind: "pct" },
  { key: "subdivision_profit", label: "Subdiv profit $", kind: "money" },
  { key: "subdivision_profit_pct", label: "Subdiv profit %", kind: "pct", hint: "return on cost" },
  { key: "gross_realisation", label: "Gross realisation", kind: "money" },
  { key: "development_cost", label: "Dev cost", kind: "money" },
  { key: "lots", label: "Lots", kind: "num" },
  { key: "buy_score", label: "Buy score", kind: "num" },
  { key: "last_sold_price", label: "Last sold", kind: "money" },
  { key: "last_sold_date", label: "Last sold date", kind: "date" },
  { key: "floor_area_m2", label: "Floor", kind: "area" },
  { key: "land_area_m2", label: "Land", kind: "area" },
  { key: "comps_used", label: "Comps", kind: "num" },
  { key: "confidence", label: "Confidence", kind: "text" },
];

const CHIPS: { key: string; label: string }[] = [
  { key: "all", label: "All rows" },
  { key: "held", label: "Held" },
  { key: "unpriced", label: "Unpriced" },
  { key: "not_enriched", label: "Not enriched" },
  { key: "corelogic_missed", label: "CoreLogic missed" },
];

function fmtCell(v: unknown, kind: Kind): string {
  if (v == null || v === "") return "—";
  switch (kind) {
    case "money":
      return fmtMoney(v as number);
    case "pct":
      return fmtPct(v as number);
    case "area":
      return fmtArea(v as number);
    case "num":
      return fmtNumber(v as number);
    case "date":
      return fmtDayDate(v as string);
    default:
      return String(v);
  }
}

// A stable comparator: nulls always sort last, whichever direction.
function cmp(a: unknown, b: unknown, dir: 1 | -1): number {
  const an = a == null, bn = b == null;
  if (an && bn) return 0;
  if (an) return 1;
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * dir;
  return String(a).localeCompare(String(b)) * dir;
}

function toCsv(rows: StagedGridRow[]): string {
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = COLS.map((c) => c.label).join(",");
  const body = rows
    .map((r) => COLS.map((c) => esc(r[c.key])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

export default function StagedReviewGrid({ region = "Auckland" }: { region?: string }) {
  const [filter, setFilter] = useState("all");
  // Default sort: margin descending — the deal-finding sort for houses.
  const [sortKey, setSortKey] = useState<keyof StagedGridRow>("margin_dollars");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [data, setData] = useState<StagedGrid | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api<StagedGrid>(`/api/admin/release/rows?region=${encodeURIComponent(region)}&filter=${filter}`)
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setData(null); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [region, filter, reloadKey]);

  // Per-row manual actions for excluded/held listings: pull fresh CoreLogic data,
  // or re-value on current numbers (which lifts the hold if it now clears the
  // margin floor). Result is shown inline; the grid reloads so the row updates.
  async function rowEnrich(id: number) {
    setRowBusy(id); setRowMsg({ id, text: "Enriching from CoreLogic…" });
    try {
      const r = await api<{ pv_status: string | null; cv_numeric: number | null; floor_area_m2: number | null; land_area_m2: number | null }>(
        `/api/admin/listings/${id}/enrich`, { method: "POST" });
      setRowMsg({ id, text: r.pv_status === "blocked" ? "CoreLogic blocked — retry shortly"
        : r.pv_status === "ok" ? `Filled: CV ${fmtMoney(r.cv_numeric)} · floor ${r.floor_area_m2 ?? "—"} · land ${r.land_area_m2 ?? "—"}. Now re-price.`
        : "No CoreLogic record for this address" });
      setReloadKey((k) => k + 1);
    } catch (e: any) { setRowMsg({ id, text: `Enrich failed: ${e?.detail || e?.message || "error"}` }); }
    finally { setRowBusy(null); }
  }
  async function rowReprice(id: number) {
    setRowBusy(id); setRowMsg({ id, text: "Re-pricing…" });
    try {
      const r = await api<{ fair_value: number | null; margin_dollars: number | null; is_held: boolean }>(
        `/api/admin/listings/${id}/reprice?region=${encodeURIComponent(region)}`, { method: "POST" });
      setRowMsg({ id, text: `Value ${fmtMoney(r.fair_value)} · margin ${fmtMoney(r.margin_dollars)} — ${r.is_held ? "still held" : "clears the floor → in feed"}` });
      setReloadKey((k) => k + 1);
    } catch (e: any) { setRowMsg({ id, text: `Re-price failed: ${e?.detail || e?.message || "error"}` }); }
    finally { setRowBusy(null); }
  }
  // Force a held row live regardless of margin (clears the hold). Re-price already
  // un-holds automatically when a row clears the floor; this is the manual override
  // for one you want live anyway.
  async function rowPublish(id: number) {
    setRowBusy(id); setRowMsg({ id, text: "Publishing live…" });
    try {
      await api(`/api/admin/listings/${id}/publish`, { method: "POST" });
      setRowMsg({ id, text: "Published — now live in the feed" });
      setReloadKey((k) => k + 1);
    } catch (e: any) { setRowMsg({ id, text: `Publish failed: ${e?.detail || e?.message || "error"}` }); }
    finally { setRowBusy(null); }
  }

  const sorted = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => cmp(a[sortKey], b[sortKey], dir));
  }, [data, sortKey, dir]);

  function onSort(key: keyof StagedGridRow) {
    if (key === sortKey) setDir((d) => (d === -1 ? 1 : -1));
    else { setSortKey(key); setDir(-1); }
  }

  function downloadCsv() {
    const blob = new Blob([toCsv(sorted)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apex_staged_${filter}_${data?.batch_id ?? "batch"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const counts = data?.counts ?? {};

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="font-display font-semibold text-sm">Staged rows — inspect before publish</h2>
        <button
          onClick={downloadCsv}
          disabled={!sorted.length}
          className="px-3 py-1.5 text-xs font-semibold border border-line rounded-md hover:border-blue disabled:opacity-40"
        >
          Download CSV ({sorted.length.toLocaleString()})
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {CHIPS.map((c) => {
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                active
                  ? "bg-blue text-white border-blue"
                  : "bg-white text-muted border-line hover:border-blue"
              }`}
            >
              {c.label}
              <span className={`ml-1.5 tnum ${active ? "opacity-90" : "text-faint"}`}>
                {(counts[c.key] ?? 0).toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm tnum">
            <thead>
              <tr className="border-b border-line bg-[#FafafA]">
                {COLS.map((c) => {
                  const active = c.key === sortKey;
                  return (
                    <th
                      key={c.key}
                      onClick={() => onSort(c.key)}
                      className={`px-3 py-2 text-left whitespace-nowrap cursor-pointer select-none font-semibold ${
                        c.kind === "text" || c.kind === "date" ? "" : "text-right"
                      } ${active ? "text-blue" : "text-muted hover:text-text"}`}
                      title={c.hint}
                    >
                      <span className={c.kind === "text" ? "" : "inline-flex items-center justify-end gap-1"}>
                        {c.label}
                        {active ? (dir === -1 ? " ↓" : " ↑") : ""}
                      </span>
                      {c.hint && (
                        <span className="block text-[9px] font-normal text-faint uppercase tracking-wide">{c.hint}</span>
                      )}
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-left whitespace-nowrap font-semibold text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className={`border-b border-line/60 hover:bg-[#FAFAFA] ${r.is_held ? "bg-[#FEF6F4]" : ""}`}>
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={`px-3 py-1.5 whitespace-nowrap ${c.kind === "text" || c.kind === "date" ? "" : "text-right"}`}
                    >
                      {c.key === "address" && r.is_held ? (
                        <span title={r.hold_reason ?? "Held"}>
                          <span className="text-danger mr-1">⚠</span>
                          {fmtCell(r[c.key], c.kind)}
                        </span>
                      ) : (
                        fmtCell(r[c.key], c.kind)
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => rowEnrich(r.id)}
                        disabled={rowBusy === r.id}
                        className="px-2 py-1 text-[11px] border border-line rounded hover:border-blue disabled:opacity-40"
                        title="Fill blank floor / land / CV from CoreLogic"
                      >Enrich</button>
                      <button
                        onClick={() => rowReprice(r.id)}
                        disabled={rowBusy === r.id}
                        className="px-2 py-1 text-[11px] border border-line rounded hover:border-blue disabled:opacity-40"
                        title="Re-value on current numbers; lifts the hold if it clears the margin floor"
                      >Re-price</button>
                      {r.is_held && (
                        <button
                          onClick={() => rowPublish(r.id)}
                          disabled={rowBusy === r.id}
                          className="px-2 py-1 text-[11px] font-semibold text-white rounded disabled:opacity-40"
                          style={{ background: "#0A8754" }}
                          title="Force this held listing live now (clears the hold regardless of margin)"
                        >Publish</button>
                      )}
                    </div>
                    {rowMsg?.id === r.id && (
                      <div className="text-[10px] text-muted mt-1 max-w-[240px] whitespace-normal">{rowMsg.text}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div className="px-3 py-4 text-xs text-muted">Loading…</div>}
        {!loading && !sorted.length && (
          <div className="px-3 py-6 text-xs text-muted">No rows match this filter.</div>
        )}
      </div>
    </div>
  );
}
