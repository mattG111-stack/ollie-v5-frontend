"use client";

/**
 * Where did the deals go?
 *
 * A batch of two thousand listings becomes a deal count through nine separate
 * gates, and every one of them is defensible on its own. That is exactly the
 * problem: when the number at the end is wrong, nothing on the screen says
 * which gate to look at, so the argument becomes about the pricing engine —
 * which is usually the one part that worked.
 *
 * This shows the count after each gate, in the order they are applied, with the
 * reason each one exists. Read it top to bottom and the drop names itself.
 *
 * The line at the bottom is the one that matters. It counts listings that pass
 * every single test and are still not flagged as deals. That number should be
 * zero. Anything else means the flag on a row and the numbers on the same row
 * were written by different runs, and re-running the pricing will not fix it.
 */
import { useEffect, useState } from "react";
import { api, DealFunnel as Funnel } from "@/lib/api";

export default function DealFunnel({ batchId }: { batchId?: number | null }) {
  const [f, setF] = useState<Funnel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = batchId ? `?batch_id=${batchId}` : "";
    api<Funnel>(`/api/admin/release/deal-funnel${q}`)
      .then(setF)
      .catch((e) => setErr(e instanceof Error ? e.message : "could not load"));
  }, [batchId]);

  if (err) return <div className="text-[11px] text-muted">Deal breakdown unavailable: {err}</div>;
  if (!f) return null;
  if (!f.total) {
    return <div className="text-[11px] text-muted">No batch to break down yet.</div>;
  }

  const n = (x: number) => x.toLocaleString();
  const rows = [{ label: "listings in this load", kept: f.total, lost: 0, why: "" }, ...f.steps];
  const widest = Math.max(...rows.map((r) => r.kept), 1);

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-base font-bold">Where the deals went</h3>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] text-muted hover:text-ink underline underline-offset-2"
        >
          {open ? "hide the reasons" : "why each step drops rows"}
        </button>
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.map((r, i) => (
          <div key={i}>
            <div className="flex items-center gap-3">
              <div className="w-56 shrink-0 text-[11.5px] text-ink">{r.label}</div>
              <div className="flex-1 h-4 bg-[#F4F2EE] rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.max((r.kept / widest) * 100, r.kept > 0 ? 1.5 : 0)}%`,
                    background: i === rows.length - 1 ? "#D4503E" : "#2F5D50",
                  }}
                />
              </div>
              <div className="w-16 shrink-0 text-right font-display text-[13px] font-bold tnum">
                {n(r.kept)}
              </div>
              <div className="w-20 shrink-0 text-right text-[11px] text-faint tnum">
                {r.lost > 0 ? `−${n(r.lost)}` : ""}
              </div>
            </div>
            {open && r.why && (
              <div className="ml-56 pl-3 text-[10.5px] text-muted leading-snug mt-0.5 mb-1.5">
                {r.why}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* The disagreement. Loud when it exists, silent when it doesn't. */}
      {f.mismatch > 0 && (
        <div className="mt-5 border border-[#D4503E]/30 bg-[#D4503E]/5 rounded-card p-4">
          <div className="font-display text-sm font-bold" style={{ color: "#D4503E" }}>
            {n(f.mismatch)} {f.mismatch === 1 ? "listing passes" : "listings pass"} every
            test above and {f.mismatch === 1 ? "is" : "are"} still not showing as a deal
          </div>
          <p className="text-[11px] text-muted mt-1.5 leading-snug">
            The figures on these rows say the deal is there and the flag beside them says
            it isn&apos;t. That happens when the flag and the numbers are written by
            different runs — re-run pricing on this load and they should agree.
          </p>
          <ul className="mt-2.5 space-y-1">
            {f.mismatch_examples.map((x, i) => (
              <li key={i} className="text-[11px] text-ink tnum">{x}</li>
            ))}
          </ul>
        </div>
      )}

      {f.orphan_flags > 0 && (
        <p className="mt-3 text-[11px] text-muted">
          {n(f.orphan_flags)} {f.orphan_flags === 1 ? "listing is" : "listings are"} flagged
          as a deal but the stored figures no longer support it — re-run pricing to clear
          {f.orphan_flags === 1 ? " it" : " them"}.
        </p>
      )}

      {f.hold_reasons.length > 0 && (
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">
            Held back, by reason
          </div>
          <div className="mt-2 space-y-1">
            {f.hold_reasons.map(([reason, count]) => (
              <div key={reason} className="flex justify-between text-[11.5px]">
                <span className="text-muted">{reason}</span>
                <span className="tnum font-semibold">{n(count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
