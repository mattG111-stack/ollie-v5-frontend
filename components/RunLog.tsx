"use client";

/**
 * What happened to this load, and why.
 *
 * The four stages have always made these decisions — rows rejected at import,
 * addresses the provider could not reach, deals suppressed because the price
 * was a search price — and then thrown the reasons away. What survived was a
 * total, and a total cannot be argued with or acted on: "11,773 rejected" and
 * "2,141 looked up, 0 filled" both describe several completely different
 * situations that need opposite responses.
 *
 * So the stages now write their reasons down as they go, and this reads them
 * back in the order they happened — which is the order that explains them, since
 * a rejection at load is why a suburb is thin at pricing.
 *
 * The download is the same record as a workbook, with every listing and the
 * decisions attached to it, for the questions that need sorting and filtering
 * rather than reading.
 */
import { useEffect, useState } from "react";
import { api, apiRaw, RunEvent } from "@/lib/api";

const STAGE_LABEL: Record<string, string> = {
  load: "Loaded", enrich: "Looked up", price: "Priced",
  publish: "Published", portals: "Searched",
};

export default function RunLog() {
  const [rows, setRows] = useState<RunEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<RunEvent[]>("/api/admin/release/run-log")
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : "could not load"));
  }, []);

  async function download() {
    setBusy(true);
    try {
      const res = await apiRaw("/api/admin/release/run-log.xlsx");
      const blob = await res.blob();
      // The filename the server chose names the load and the day it was
      // uploaded, so the file still means something a week later in a folder
      // of six others.
      const cd = res.headers.get("content-disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "apex-load.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "download failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold">What happened to this load</h3>
          <p className="text-[11px] text-muted mt-0.5">
            Every decision the load, lookup, pricing and publish steps made, in the
            order they made them.
          </p>
        </div>
        <button
          onClick={download}
          disabled={busy}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-md border border-line
                     hover:bg-[#F7F5F2] disabled:opacity-50"
        >
          {busy ? "Building…" : "Download full record (Excel)"}
        </button>
      </div>

      {err && <div className="mt-3 text-[11px] text-muted">Couldn&apos;t load the log: {err}</div>}

      {rows && rows.length === 0 && (
        <p className="mt-4 text-[11.5px] text-muted">
          Nothing recorded for the live load yet — it was loaded before this log
          existed. The next load will fill it in.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div className="mt-4 space-y-2">
          {rows.map((e, i) => (
            <div
              key={i}
              className="flex gap-3 items-baseline border-b border-line/60 pb-2 last:border-0"
            >
              <div className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-faint font-semibold">
                {STAGE_LABEL[e.stage] || e.stage}
              </div>
              <div className="flex-1 text-[11.5px] leading-snug text-ink">
                {e.level !== "info" && (
                  <span
                    className="font-semibold mr-1.5"
                    style={{ color: e.level === "error" ? "#D4503E" : "#B8860B" }}
                  >
                    {e.level === "error" ? "Failed —" : "Check —"}
                  </span>
                )}
                {e.detail || e.event}
                {e.address && <span className="text-muted"> · {e.address}</span>}
              </div>
              <div className="w-24 shrink-0 text-right text-[10.5px] text-faint tnum">
                {new Date(e.at).toLocaleDateString("en-NZ", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
