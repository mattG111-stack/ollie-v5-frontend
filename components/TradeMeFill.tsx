"use client";

/**
 * Trade Me sales export — fills gaps in what we already hold.
 *
 * Deliberately not part of the three-file weekly import above it. This adds no
 * property and creates no batch: rows are matched to ours on address and only
 * ever fill a field we are missing. It is a different operation with a
 * different risk, so it gets its own panel and its own button.
 *
 * "Check first" runs the same match and reports what WOULD change without
 * writing anything, because the honest answer to "will this help" is a number,
 * not a promise.
 */

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

type FillResult = {
  rows_seen: number;
  matched: number;
  unmatched: number;
  valuations: number;
  filled: Record<string, number>;
  conflicts: string[];
  note: string;
  dry_run: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  floor_area_m2: "Floor area",
  land_area_m2: "Land area",
  cv_numeric: "Council valuation",
  land_value_numeric: "Land value",
  improvement_value_numeric: "Improvement value",
  latitude: "Latitude",
  longitude: "Longitude",
  type_of_title: "Ownership type",
  property_type: "Property type",
  image_url: "Photo",
  sale_price: "Sale price",
  sold_date: "Sale date",
};

export default function TradeMeFill() {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "apply">("");
  const [res, setRes] = useState<FillResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(dryRun ? "check" : "apply");
    setErr(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const out = await api<FillResult>(
        `/api/admin/trademe-fill?dry_run=${dryRun}`, { method: "POST", body: form });
      setRes(out);
      if (!dryRun) setFile(null);
    } catch (e: any) {
      setErr(e?.detail || e?.message || t("adm.uploadFailed"));
    } finally {
      setBusy("");
    }
  }

  const rows = res ? Object.entries(res.filled).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-sm">{t("adm.tmTitle")}</h2>
          <p className="text-xs text-muted mt-1 max-w-xl">{t("adm.tmSub")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={input}
            type="file"
            accept=".csv"
            // The three weekly drops on this page render the same input. Named
            // so a test — or anyone reading the DOM — can tell them apart.
            data-testid="trademe-csv"
            className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="border border-line hover:bg-page px-3 py-2 rounded-lg text-sm font-semibold"
          >
            {file ? file.name : t("adm.tmChoose")}
          </button>
          <button
            type="button"
            onClick={() => run(true)}
            disabled={!file || busy !== ""}
            className="border border-line hover:bg-page disabled:opacity-40 px-3 py-2 rounded-lg text-sm font-semibold"
          >
            {busy === "check" ? t("adm.tmChecking") : t("adm.tmCheck")}
          </button>
          <button
            type="button"
            onClick={() => run(false)}
            disabled={!file || busy !== ""}
            className="bg-blue text-white hover:bg-blue-dark disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-semibold"
          >
            {busy === "apply" ? t("adm.tmFilling") : t("adm.tmFill")}
          </button>
        </div>
      </div>

      {err && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3 mt-4">
          {err}
        </div>
      )}

      {res && (
        <div className="mt-4 border-t border-divider pt-4">
          <div className="text-sm font-semibold mb-2">
            {res.dry_run ? t("adm.tmWouldFill") : t("adm.tmFilled")}
          </div>
          <div className="text-xs text-muted mb-3">
            {t("adm.tmMatched", {
              matched: res.matched.toLocaleString(),
              seen: res.rows_seen.toLocaleString(),
              unmatched: res.unmatched.toLocaleString(),
            })}
          </div>

          {rows.length === 0 ? (
            <div className="text-sm text-muted">{t("adm.tmNothing")}</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {rows.map(([field, n]) => (
                <div key={field} className="bg-page rounded-lg px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                    {FIELD_LABELS[field] || field}
                  </div>
                  <div className="tnum font-semibold">{n.toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}

          {res.valuations > 0 && (
            <div className="text-xs text-muted mt-3">
              {t("adm.tmValuations", { n: res.valuations.toLocaleString() })}
            </div>
          )}

          {res.conflicts.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-semibold mb-1">{t("adm.tmConflicts")}</div>
              <div className="text-xs text-muted mb-2">{t("adm.tmConflictsSub")}</div>
              <div className="bg-page rounded-lg p-3 max-h-40 overflow-y-auto">
                {res.conflicts.map((c, i) => (
                  <div key={i} className="text-xs tnum">{c}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
