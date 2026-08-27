"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import DealFunnel from "@/components/DealFunnel";
import PortalFindings from "@/components/PortalFindings";
import RunLog from "@/components/RunLog";
import StagedReviewGrid from "@/components/StagedReviewGrid";
import { api, IngestJob, setPreview, StageStarted } from "@/lib/api";

type Staged = {
  has_staged: boolean;
  // "staged" while the batch is being worked on, "preview" once it is finished
  // and being checked. Decides which button this page offers.
  stage?: string | null;
  sold_batch_id: number | null;
  forsale_batch_id: number | null;
  sold_rows: number;
  sold_total?: number;
  forsale_rows: number;
  forsale_rejected: number;
  held_total: number;
  hold_reasons: Record<string, number>;
  pv_checked: number;
  /** Rows a lookup was ever wanted for — only listings missing a floor area,
   *  land area or CV are ever looked up, so this is the honest denominator. */
  pv_wanted?: number;
  pv_pending: number;
  uploaded_at: string | null;
};

type Held = {
  id: number; address: string | null; suburb: string | null; property_type: string | null;
  hold_reason: string | null; beds: number | null; baths: number | null;
  floor_area_m2: number | null; land_area_m2: number | null; cv_numeric: number | null;
  zoning: string | null; asking_price: number | null; pv_cv: number | null; pv_estimate_mid: number | null;
};

// Result of the per-listing enrich / re-price actions (matches ListingActionResult).
type ListingAction = {
  id: number; address: string | null; fair_value: number | null; asking_price: number | null;
  margin_dollars: number | null; cv_numeric: number | null; floor_area_m2: number | null;
  land_area_m2: number | null; is_held: boolean; hold_reason: string | null; pv_status: string | null;
};

const money = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(n);

export default function AdminPublishPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [s, setS] = useState<Staged | null>(null);
  const [held, setHeld] = useState<Held[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [stageJob, setStageJob] = useState<IngestJob | null>(null);
  const [stageMsg, setStageMsg] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  // Count of listings the last re-price run actually re-valued — shown as a
  // number in the dashboard so a re-price gives visible confirmation it ran,
  // instead of the button doing nothing on screen.
  const [lastPriced, setLastPriced] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const st = await api<Staged>("/api/admin/release/staged").catch(() => null);
    setS(st);
    if (st?.has_staged) setHeld(await api<Held[]>("/api/admin/release/held").catch(() => []));
    else setHeld([]);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // Kick off an operator stage (enrich / price) and poll its durable progress
  // until it reaches a terminal state — the progress lives in the DB, so it
  // survives a refresh mid-run.
  async function runStage(stage: "enrich" | "price" | "portals") {
    if (starting) return;                      // block double-clicks that stack workers
    setStarting(stage);
    setStageMsg(`Starting ${stage}…`);
    try {
      const started = await api<StageStarted>(`/api/admin/release/${stage}`, { method: "POST" });
      setStageMsg(`${stage === "enrich" ? "Enrich" : stage === "portals" ? "Portal lookup" : "Re-price"} running in the background — you can leave this page.`);
      if (pollRef.current) clearInterval(pollRef.current);
      const poll = async () => {
        const job = await api<IngestJob>(`/api/admin/jobs/${started.job_id}`).catch(() => null);
        if (!job) return;
        setStageJob(job);
        if (job.status === "completed" || job.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          // A completed re-price reports how many listings it re-valued
          // (rows_inserted). Surface it as a number so the button visibly did
          // something, even when the resulting prices look similar.
          if (stage === "price" && job.status === "completed") {
            setLastPriced(job.rows_inserted ?? job.rows_total ?? 0);
          }
          await load();
        }
      };
      await poll();
      pollRef.current = setInterval(poll, 2000);
    } catch (e: any) {
      // Surface the reason right here — a 404 means the new backend isn't deployed;
      // a 409 means it's already running.
      setStageMsg(`${stage} couldn't start: ${e?.detail || e?.message || "request failed"}`);
    } finally {
      setStarting(null);
    }
  }

  async function resetAll() {
    if (!confirm("Delete ALL batches, listings and ingest jobs and take everything back to zero? User accounts and billing are kept. This cannot be undone.")) return;
    setStageMsg("Resetting…");
    try {
      const r = await api<{ batches_deleted: number; for_sale_deleted: number }>(
        "/api/admin/reset-all?confirm=RESET", { method: "POST" });
      setStageJob(null);
      setStageMsg(`Reset done — ${r.batches_deleted} batch(es) and ${r.for_sale_deleted.toLocaleString()} for-sale rows removed. Everything is back to zero.`);
      await load();
    } catch (e: any) {
      setStageMsg(`Reset failed: ${e?.detail || e?.message || "request failed"}`);
    }
  }

  // Finish the batch and move it to preview. Deliberately NOT a confirm: it
  // changes nothing a customer sees, and a dialog in front of a harmless step
  // teaches people to click through the one in front of the harmful step.
  async function sendToPreview() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ count: number }>("/api/admin/release/preview", { method: "POST" });
      setMsg(`Moved ${r.count} batch(es) to preview. The site is still showing the previous load \u2014 check the rows below, remove anything that is not real, then go live.`);
      await load();
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Could not move to preview");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!s) return;
    if (!confirm(
      `Go live with this release?\n\n` +
      `It replaces what customers see now. ${s.held_total} flagged row(s) stay hidden.`
    )) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ count: number; held_back: number }>("/api/admin/release/publish", { method: "POST" });
      setMsg(`Published ${r.count} batch(es) live. ${r.held_back} row(s) held back.`);
      await load();
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <div className="px-4 sm:px-7 py-6 text-muted text-sm">Loading…</div>;

  if (!s.has_staged) {
    return (
      <div className="px-4 sm:px-7 py-6">
        <Header />
        <div className="bg-white border border-line rounded-card shadow-soft p-6 mt-4">
          <div className="font-display font-semibold">Nothing staged</div>
          <p className="text-sm text-muted mt-1">
            Upload this week&rsquo;s sold + for-sale CSVs on the{" "}
            <a href="/admin/upload" className="text-blue">Upload page</a>. They land here staged (not live) for review, then you publish.
          </p>
          {msg && <div className="text-sm mt-3" style={{ color: "#0A8754" }}>{msg}</div>}

          {/* Reset stays reachable even with nothing staged — after a publish
              there's no staged batch, but the published data still needs to be
              clearable back to zero. */}
          <div className="mt-5 pt-4 border-t border-line">
            <button
              onClick={resetAll}
              className="px-3 py-1.5 text-xs font-semibold rounded-md border border-danger text-danger hover:bg-[#FEF6F4]"
            >
              Reset all data (back to zero)
            </button>
            <span className="text-[11px] text-faint ml-2">Deletes every batch, listing and job — including published data. Keeps users &amp; billing.</span>
            {stageMsg && <div className="text-xs mt-2 text-muted">{stageMsg}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-7 py-6">
      <Header />

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
        <Stat label="For-sale rows" value={(s.forsale_rows ?? 0).toLocaleString()} />
        {/* "Sold rows" counted only the STAGED sold batch, so uploading a
            for-sale file on its own showed 0 — which reads as "the sold data is
            gone" when it means "there is no sold file in this upload". Sold
            data accumulates across published batches by design: a batch is a
            delivery, not the dataset. The total is what the tile is really
            being asked, so the total is what it leads with. */}
        <Stat
          label={s.sold_rows ? "Sold rows (this upload)" : "Sold comps on file"}
          value={(s.sold_rows || s.sold_total || 0).toLocaleString()}
          sub={s.sold_rows && s.sold_total
            ? `${s.sold_total.toLocaleString()} on file in total`
            : (!s.sold_rows ? "no sold file in this upload" : undefined)}
        />
        <Stat label="Rejected at load" value={(s.forsale_rejected ?? 0).toLocaleString()} />
        <Stat label="Held for review" value={(s.held_total ?? 0).toLocaleString()} accent={s.held_total > 0} />
        {/* Against every row in the batch, a complete run reads as a 4% one:
            only the listings missing a floor area, a land area or a CV are ever
            looked up. The denominator is how many were WANTED, and the whole
            batch is the footnote. */}
        <Stat
          label="CoreLogic enriched"
          value={`${s.pv_checked}/${s.pv_wanted || s.forsale_rows}`}
          sub={
            s.pv_wanted
              ? `${s.pv_wanted.toLocaleString()} of ${s.forsale_rows.toLocaleString()} listings were missing something a lookup can fill`
              : undefined
          }
        />
      </div>

      {Object.keys(s.hold_reasons).length > 0 && (
        <div className="mt-3 text-sm text-muted">
          Held reasons:{" "}
          {Object.entries(s.hold_reasons).map(([r, n], i) => (
            <span key={r}>{i > 0 ? " · " : ""}<strong className="text-text">{n}</strong> {r}</span>
          ))}
        </div>
      )}

      {/* Stages — enrich then re-price, each re-runnable, before publishing */}
      <div className="bg-white border border-line rounded-card shadow-soft p-4 mt-5">
        <div className="font-display font-semibold text-sm">Stages</div>
        <p className="text-xs text-muted mt-1">
          Loaded rows are priced on what the scrape carried. <strong>Enrich</strong> fills blank
          floor / land / CV from CoreLogic (re-run to resume if it stops), then <strong>Re-price</strong>{" "}
          re-values the batch on the filled numbers. <strong>Ask the portals</strong> then looks up
          the deals on Trade Me, OneRoof, realestate.co.nz, homes.co.nz and CoreLogic — filling any
          field still blank and recording what each of them says the place is worth. All run in the
          background — this page can be closed and reopened.
        </p>
        {/* Prominent re-run pricing action — re-values every staged listing on
            the current pipeline. Red so it's unmistakable, and it shows the
            listing count up front plus a repriced count once it finishes. */}
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <button
            onClick={() => runStage("price")}
            disabled={starting === "price" || (stageJob?.stage === "price" && stageJob?.status === "running")}
            className="px-5 py-3 text-sm font-bold text-white rounded-lg shadow-soft disabled:opacity-60"
            style={{ background: "#D4503E" }}
          >
            {starting === "price" || (stageJob?.stage === "price" && stageJob?.status === "running")
              ? "Re-running pricing…"
              : `↻ Re-run pricing on all ${(s.forsale_rows ?? 0).toLocaleString()} listings`}
          </button>
          {lastPriced != null && !(stageJob?.stage === "price" && stageJob?.status === "running") && (
            <span className="font-display text-lg font-bold" style={{ color: "#0A8754" }}>
              ✓ {lastPriced.toLocaleString()} listings repriced
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-3">
          <StageButton label="Enrich (CoreLogic)"
            running={starting === "enrich" || (stageJob?.stage === "enrich" && stageJob?.status === "running")}
            onClick={() => runStage("enrich")} />
          {/* Runs AFTER pricing, over the keepers only — a weekly file is
              thousands of listings and a few dozen survive the margin floor, so
              the lookups are spent on those. Re-runnable; a property asked
              about in the last fortnight is skipped. */}
          <StageButton label="Ask the portals"
            running={starting === "portals" || (stageJob?.stage === "portals" && stageJob?.status === "running")}
            onClick={() => runStage("portals")} />
          {stageJob && <StageProgress job={stageJob} />}
        </div>
        <PortalSources />
      </div>

      {/* What the portals found — nothing written until it is ticked and loaded. */}
      <PortalFindings />

      <div className="hidden">
        {stageMsg && <div className="text-xs mt-2 text-muted">{stageMsg}</div>}
        <div className="mt-4 pt-3 border-t border-line">
          <button
            onClick={resetAll}
            className="px-3 py-1.5 text-xs font-semibold rounded-md border border-danger text-danger hover:bg-[#FEF6F4]"
          >
            Reset all data (back to zero)
          </button>
          <span className="text-[11px] text-faint ml-2">Deletes every batch, listing and job. Keeps users &amp; billing.</span>
        </div>
      </div>

      {/* Why the deal count is the number it is — step by step, with the
          disagreements called out. Sits above the grid because it is the
          question asked first: "there is no way that is all of them". */}
      <div className="mt-6">
        <DealFunnel />
      </div>

      {/* The record of the run itself, and the workbook that carries all of it
          plus every listing with its decisions attached. */}
      <div className="mt-6">
        <RunLog />
      </div>

      {/* Review grid — inspect the batch before it goes live */}
      <StagedReviewGrid />

      {/* One button, for the step you are actually on. Showing both would make
          the harmless one and the irreversible one look like a pair. */}
      <div className="mt-6 flex items-center gap-3">
        {s.stage === "preview" ? (
          <button
            onClick={publish}
            disabled={busy}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: "#0A8754" }}
          >
            {busy ? "Going live…" : `Go live — hold back ${s.held_total} flagged`}
          </button>
        ) : (
          <button
            onClick={sendToPreview}
            disabled={busy}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: "#1D4ED8" }}
          >
            {busy ? "Preparing…" : "Finish and preview"}
          </button>
        )}
        {s.stage === "preview" && (
          <button
            onClick={() => {
              setPreview(true);
              // Straight to the customer view. The whole point is to look at
              // the pages, not at another admin screen.
              window.location.href = "/properties";
            }}
            className="px-4 py-2.5 text-sm font-semibold rounded-lg border border-line hover:border-blue"
          >
            View it as a customer
          </button>
        )}
        {msg && <span className="text-sm" style={{ color: "#0A8754" }}>{msg}</span>}
      </div>
      <p className="text-xs text-faint mt-2">
        {s.stage === "preview"
          ? `This replaces what customers see now. The ${s.held_total} flagged row(s) below stay hidden — fix each and publish it individually.`
          : "Nothing customers see changes yet. Preview holds the finished batch so you can look through the rows and remove anything that is not a real listing, while the site keeps showing the previous load."}
      </p>

      {/* Held rows */}
      {held.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display font-semibold text-sm mb-3">Held rows — fix &amp; publish</h2>
          <div className="flex flex-col gap-3">
            {held.map((h) => <HeldCard key={h.id} row={h} onChange={load} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function HeldCard({ row, onChange }: { row: Held; onChange: () => void }) {
  const [f, setF] = useState({
    beds: row.beds ?? "", baths: row.baths ?? "", floor_area_m2: row.floor_area_m2 ?? "",
    land_area_m2: row.land_area_m2 ?? "", cv_numeric: row.cv_numeric ?? "", zoning: row.zoning ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [actMsg, setActMsg] = useState<string | null>(null);

  const num = (v: string | number) => (v === "" ? null : Number(v));

  async function save() {
    setBusy(true);
    try {
      await api(`/api/admin/listings/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          beds: num(f.beds), baths: num(f.baths), floor_area_m2: num(f.floor_area_m2),
          land_area_m2: num(f.land_area_m2), cv_numeric: num(f.cv_numeric),
          zoning: f.zoning === "" ? null : f.zoning,
        }),
      });
    } finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true);
    try {
      await save();
      await api(`/api/admin/listings/${row.id}/publish`, { method: "POST" });
      onChange();
    } finally { setBusy(false); }
  }
  async function enrich() {
    setBusy(true); setActMsg("Enriching from CoreLogic…");
    try {
      const r = await api<ListingAction>(`/api/admin/listings/${row.id}/enrich`, { method: "POST" });
      setActMsg(r.pv_status === "blocked"
        ? "CoreLogic blocked this lookup — try again shortly."
        : r.pv_status === "ok"
        ? `CoreLogic filled: CV ${money(r.cv_numeric)} · floor ${r.floor_area_m2 ?? "—"} · land ${r.land_area_m2 ?? "—"}. Re-price to re-value.`
        : "CoreLogic had no record for this address.");
      onChange();
    } catch (e: any) { setActMsg(`Enrich failed: ${e?.detail || e?.message || "error"}`); }
    finally { setBusy(false); }
  }
  async function reprice() {
    setBusy(true); setActMsg("Re-pricing…");
    try {
      const r = await api<ListingAction>(`/api/admin/listings/${row.id}/reprice`, { method: "POST" });
      setActMsg(`Re-priced: value ${money(r.fair_value)} · margin ${money(r.margin_dollars)} — ${r.is_held ? "still held (below the margin floor)" : "clears the floor → back in the live feed"}.`);
      onChange();
    } catch (e: any) { setActMsg(`Re-price failed: ${e?.detail || e?.message || "error"}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{row.address || "—"}{row.suburb ? `, ${row.suburb}` : ""}</div>
          <div className="text-xs text-danger font-medium mt-0.5">⚠ {row.hold_reason}</div>
          <div className="text-[11px] text-faint mt-0.5">
            CoreLogic: CV {money(row.pv_cv)} · AVM {money(row.pv_estimate_mid)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
        <MiniField label="Beds" value={f.beds} onChange={(v) => setF({ ...f, beds: v })} />
        <MiniField label="Baths" value={f.baths} onChange={(v) => setF({ ...f, baths: v })} />
        <MiniField label="Floor m²" value={f.floor_area_m2} onChange={(v) => setF({ ...f, floor_area_m2: v })} />
        <MiniField label="Land m²" value={f.land_area_m2} onChange={(v) => setF({ ...f, land_area_m2: v })} />
        <MiniField label="CV" value={f.cv_numeric} onChange={(v) => setF({ ...f, cv_numeric: v })} />
        <MiniField label="Zoning" value={f.zoning} onChange={(v) => setF({ ...f, zoning: v })} text />
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button onClick={save} disabled={busy} className="px-3 py-1.5 text-xs border border-line rounded-md hover:border-blue disabled:opacity-50">Save</button>
        <button onClick={enrich} disabled={busy} className="px-3 py-1.5 text-xs border border-line rounded-md hover:border-blue disabled:opacity-50">Enrich (CoreLogic)</button>
        <button onClick={reprice} disabled={busy} className="px-3 py-1.5 text-xs border border-line rounded-md hover:border-blue disabled:opacity-50">Re-price</button>
        <button onClick={publish} disabled={busy} className="px-3 py-1.5 text-xs font-semibold text-white rounded-md disabled:opacity-50" style={{ background: "#0A8754" }}>Save &amp; publish this row</button>
      </div>
      {actMsg && <div className="text-[11px] text-muted mt-2">{actMsg}</div>}
    </div>
  );
}

function MiniField({ label, value, onChange, text }: { label: string; value: string | number; onChange: (v: string) => void; text?: boolean }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      <input
        value={value}
        inputMode={text ? undefined : "decimal"}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 bg-white border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-blue"
      />
    </label>
  );
}

function StageButton({ label, running, onClick }: { label: string; running?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={running}
      className="px-4 py-2 text-sm font-semibold border border-line rounded-lg hover:border-blue disabled:opacity-50"
    >
      {running ? `${label}…` : label}
    </button>
  );
}

function StageProgress({ job }: { job: IngestJob }) {
  const stage = job.stage ?? job.batch_type;
  const done = job.status === "completed";
  const failed = job.status === "failed";
  const color = failed ? "#D4503E" : done ? "#0A8754" : "#2E353D";
  // A finished enrich writes its own breakdown into `stage` — how many were
  // filled, refused, genuinely not held by the provider, and never reached.
  // That is four separate outcomes and they need four separate responses, so it
  // is the summary worth showing.
  //
  // The generic counters below then repeated two of them, and the page read
  // "35 filled · 0 blocked · 0 not found · 54 unreachable: done · 147/147
  // looked up · 35 filled · 54 missed" — the same run described twice, the
  // second time less usefully, with "missed" restating "unreachable" as though
  // the addresses were the problem. When the stage carries the breakdown, the
  // only thing worth adding to it is how many were asked about.
  const hasBreakdown = /\bfilled\b/.test(stage);
  const looked =
    job.rows_inserted != null
      ? `${(job.rows_inserted ?? 0).toLocaleString()}/${(job.rows_total ?? 0).toLocaleString()} looked up`
      : "";
  const genericBits =
    job.rows_inserted != null
      ? (job.rows_filled != null ? ` · ${job.rows_filled.toLocaleString()} filled` : "") +
        (job.rows_missed != null ? ` · ${job.rows_missed.toLocaleString()} missed` : "")
      : "";
  return (
    <span className="text-xs" style={{ color }}>
      {hasBreakdown
        ? `${looked ? looked + " · " : ""}${stage}`
        : `${stage}: ${failed ? "failed" : done ? "done" : `${job.progress_pct}%`}${
            looked ? " · " + looked : ""
          }${genericBits}`}
      {failed && job.error_message ? ` — ${job.error_message.split("\n")[0]}` : ""}
    </span>
  );
}

function Header() {
  return (
    <>
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · WEEKLY PUBLISH</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">Review &amp; publish</h1>
      <p className="text-sm text-muted mt-1">Staged data isn&rsquo;t live yet. Review the flags, then publish — flagged rows are held back to fix.</p>
    </>
  );
}

function Stat({ label, value, accent, sub }: {
  label: string; value: string; accent?: boolean; sub?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-display text-2xl font-bold mt-1 tnum" style={accent ? { color: "#D4503E" } : undefined}>{value}</div>
      {/* A zero with no explanation reads as data loss. */}
      {sub && <div className="text-[10.5px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

/**
 * Which portals can answer right now.
 *
 * Trade Me, OneRoof and realestate.co.nz render their figures in the browser,
 * so they are reached through Apify and need a token. Without one the button
 * still works — it asks the two that can be read directly — and saying so here
 * is the difference between "those three found nothing" and "those three were
 * never asked".
 */
function PortalSources() {
  const [st, setSt] = useState<{ sources: string[]; needs_browser: string[]; browser_ready: boolean } | null>(null);
  useEffect(() => {
    api<typeof st>("/api/admin/release/portals/status").then(setSt).catch(() => null);
  }, []);
  if (!st) return null;
  const NAMES: Record<string, string> = {
    corelogic: "CoreLogic", homes: "homes.co.nz", oneroof: "OneRoof",
    trademe: "Trade Me", realestate: "realestate.co.nz",
  };
  return (
    <div className="text-[11px] text-faint mt-2">
      Asking: {st.sources.map((x) => NAMES[x] || x).join(" · ")}
      {!st.browser_ready && (
        <span className="text-muted">
          {" "}— {st.needs_browser.map((x) => NAMES[x] || x).join(", ")} need an APIFY_TOKEN
          (they render their figures in the browser); set one and they join the run.
        </span>
      )}
    </div>
  );
}
