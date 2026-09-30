"use client";

/**
 * What went on the market since yesterday, before the weekly file reaches it.
 *
 * The weekly file is a snapshot: a home listed on Tuesday shows up in it the
 * following Monday. An underpriced listing is under offer inside a week, so six
 * days late is the difference between seeing it and reading about it.
 *
 * Nothing in this list is live. Each row is a listing scraped off someone
 * else's page, and the moment it becomes a row in the live batch it looks
 * exactly like data we stand behind — so it waits here until someone says so.
 *
 * The "no council record" mark is the one thing worth reading carefully. It
 * means that row arrived without a council valuation, so it prices from comps
 * alone.
 *
 * It used to mean more than that: no portal we asked carried the ZONING or the
 * title type, so every portal row read as "not subdividable" whatever its zone
 * or its size. OneRoof's fuller actor carries both, so a marked row is now just
 * a row missing a CV, not a row missing half the engine.
 */

import { Fragment } from "react";
import PortalPricingReview from "./PortalPricingReview";
import ListingEvidence from "./ListingEvidence";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fmtArea, fmtDayDate, fmtMoneyShort } from "@/lib/format";

type Listing = {
  id: number;
  source: string;
  url: string | null;
  address: string | null;
  suburb: string | null;
  property_type: string | null;
  price_numeric: number | null;
  price_display: string | null;
  cv_numeric: number | null;
  floor_area_m2: number | null;
  land_area_m2: number | null;
  beds: number | null;
  baths: number | null;
  carspaces: number | null;
  /** That portal's own valuation — never an input to ours, but the fastest
   *  sanity check there is before agreeing to publish a listing. */
  estimate: number | null;
  listed_date: string | null;
  image_url: string | null;
  photos?: string[];
  details?: Record<string, string | number | boolean | null>;
  has_council_data: boolean;
  /** Sold rows only: the sale price is far from what this suburb does. */
  price_flag?: string | null;
};

/* Two lists, one panel. They are the same shape and the same decision, and they
 * differ in cadence and in what is at stake: a wrong asking price costs one
 * listing, a wrong SALE price poisons a whole suburb's $/m² rate and sale/CV
 * ratio, which every valuation leans on. */
type Tab = "for_sale" | "sold";

type FillJob = {
  id: number; filename: string; status: string; stage: string | null;
  progress_pct: number | null; rows_total: number | null;
  rows_inserted: number | null; error_message: string | null;
};
const fillActive = (job: FillJob | null) => !!job && !["completed", "failed", "cancelled"].includes(job.status);

const SOURCE: Record<string, string> = {
  homes: "Homes",
  oneroof: "OneRoof",
  realestate: "realestate.co.nz",
  trademe: "Trade Me",
};

export default function NewListings({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<Listing[]>([]);
  const [offset, setOffset] = useState(0);
  const pageSize = readOnly ? 20 : 200;
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startingFill, setStartingFill] = useState(false);
  const [fillJob, setFillJob] = useState<FillJob | null>(null);
  const [progressOffline, setProgressOffline] = useState(false);
  const fillJobRef = useRef<FillJob | null>(null);
  const filling = startingFill || fillActive(fillJob);

  async function fillGaps() {
    setStartingFill(true);
    try {
      const { job_id } = await api<{ job_id: number }>(
        `/api/admin/release/listings/fill?kind=${tab}`, { method: "POST" });
      const job: FillJob = { id: job_id, filename: "filling", status: "pending",
        stage: "Starting", progress_pct: 0, rows_total: null,
        rows_inserted: 0, error_message: null };
      fillJobRef.current = job;
      setFillJob(job);
      setProgressOffline(false);
      setMsg(null);
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Could not start it");
    } finally { setStartingFill(false); }
  }

  const [msg, setMsg] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<Tab>("for_sale");
  const [deleted, setDeleted] = useState<{ids:number[];decided_at:string}|null>(null);

  async function selectAll() {
    setBusy(true);
    try {
      const r = await api<{ids:number[]}>(`/api/admin/release/listings/selection?kind=${tab}`);
      setChosen(new Set(r.ids));
      setMsg(`${r.ids.length} unuploaded ${tab === "sold" ? "sold records" : "listings"} selected across all pages.`);
    } catch(e:any) { setMsg(e?.detail || e?.message || "Could not select listings"); }
    finally { setBusy(false); }
  }

  async function deleteSelected() {
    if (!chosen.size || !confirm(`Delete ${chosen.size} selected unuploaded records from this queue? Uploaded and published listings are protected. You can undo this deletion here.`)) return;
    setBusy(true);
    try {
      const r = await api<{ids:number[];decided_at:string}>("/api/admin/release/listings/delete-selected",
        {method:"POST",body:JSON.stringify({kind:tab,ids:[...chosen]})});
      setDeleted(r.ids.length ? r : null);
      setMsg(`Deleted ${r.ids.length} from the queue. Any records already uploaded were skipped.`);
      setOffset(0); await load();
    } catch(e:any) { setMsg(e?.detail || e?.message || "Delete failed"); }
    finally { setBusy(false); }
  }

  async function undoDelete() {
    if (!deleted) return;
    setBusy(true);
    try {
      const r = await api<{restored:number}>("/api/admin/release/listings/undo-delete",
        {method:"POST",body:JSON.stringify(deleted)});
      setDeleted(null); setMsg(`Restored ${r.restored} records.`); await load();
    } catch(e:any) { setMsg(e?.detail || e?.message || "Undo failed"); }
    finally { setBusy(false); }
  }

  const load = useCallback(async () => {
    const path = tab === "sold" ? "sold" : "new";
    const d = await api<{ pending: number; listings: Listing[] }>(
      `/api/admin/release/listings/${path}?limit=${pageSize}&offset=${offset}`).catch((e) => { setMsg(e?.detail || e?.message || "Could not load listings"); return null; });
    if (!d) return;
    setRows(d.listings);
    setPending(d.pending);
    // Opt-out rather than opt-in: the common case is "these all look right".
    // A flagged sale is the exception — it starts unticked, because the whole
    // point of the flag is that somebody should look before it goes in.
    setChosen(new Set());
  }, [tab, pageSize, offset]);

  useEffect(() => { load(); }, [load]);

  // Reconnect after navigation. This view never controls the worker lifetime.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const previous = fillJobRef.current;
      try {
        const job = fillActive(previous)
          ? await api<FillJob>(`/api/admin/jobs/${previous!.id}`)
          : (await api<FillJob[]>("/api/admin/jobs?limit=100")).find(j => j.filename === "filling") ?? null;
        if (cancelled) return;
        // Do not replace a just-started job with an older discovery response.
        if (job && (!fillJobRef.current || job.id >= fillJobRef.current.id)) {
          fillJobRef.current = job;
          setFillJob(job);
          if (fillActive(previous) && !fillActive(job)) await load();
        }
        if (!cancelled) setProgressOffline(false);
      } catch {
        if (!cancelled) setProgressOffline(true);
      } finally {
        if (!cancelled) timer = setTimeout(poll, fillActive(fillJobRef.current) ? 3000 : 15000);
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [load]);

  /* Start the sweep, then POLL. It cannot be awaited in one request: an Apify
   * actor takes tens of seconds to a few minutes and the sweep asks two of
   * them, so holding the request open gets it cut off by the proxy and the
   * browser sees a 500 with no body — which is exactly what the first press of
   * this button did. The server answers with a job id immediately and the work
   * happens behind it. */
  async function sweep() {
    setBusy(true);
    setMsg("Asking the portals… this takes a minute or two.");
    try {
      const path = tab === "sold" ? "sweep-sold" : "sweep";
      const { job_id } = await api<{ job_id: number }>(
        `/api/admin/release/listings/${path}`, { method: "POST" });

      // Every 3s for up to 10 minutes. An actor run has no useful upper bound
      // and giving up early would report a failure for a sweep that worked.
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const job = await api<{ status: string; stage: string | null;
                               rows_inserted: number | null;
                               error_message: string | null }>(
          `/api/admin/jobs/${job_id}`).catch(() => null);
        if (!job) continue;
        if (job.status === "completed") {
          const n = job.rows_inserted ?? 0;
          setMsg(n ? `${n} new to review · ${job.stage ?? ""}`
                   : `Nothing new since the last check · ${job.stage ?? ""}`);
          await load();
          return;
        }
        if (job.status === "failed") {
          setMsg(job.error_message || "The sweep failed");
          return;
        }
      }
      setMsg("Still running — check the job list.");
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Could not check");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approve: boolean, ids?: number[]) {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ applied: number; rejected: number; skipped: number; reasons: string[] }>(
        "/api/admin/release/listings/decide",
        { method: "POST", body: JSON.stringify({ ids: ids ?? [...chosen], approve }) });
      setMsg(approve
        ? `Added ${r.applied}${r.skipped ? ` · ${r.skipped} skipped (${r.reasons.join("; ")})` : ""}`
        : `Discarded ${r.rejected}`);
      await load();
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: number) =>
    setChosen((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const sold = tab === "sold";

  const fillPercent = fillJob?.status === "completed" ? 100
    : Math.max(0, Math.min(99, fillJob?.progress_pct ?? 0));
  const checked = fillJob?.stage?.match(/filling ([\d,]+)\/([\d,]+)/i);
  const fillLabel = fillJob?.status === "completed" ? "Missing details check complete"
    : fillJob?.status === "failed" ? "Missing details check failed"
    : fillJob?.status === "cancelled" ? "Missing details check stopped"
    : "Filling missing details";

  return (
    <section className="mt-8 border border-line rounded-xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-lg font-bold">
          {sold ? "Sold records needing review" : "Collected listings awaiting review"}
        </h2>
        <span className="text-xs text-muted">
          {sold
            ? "Validated sales save automatically; unresolved records remain here"
            : "Photos and property details from retained source records"}
        </span>
        <div className="flex gap-1">
          {(["for_sale", "sold"] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => { setTab(k); setOffset(0); }}
              className={`text-[11px] px-2.5 py-1 rounded-md font-semibold ${
                tab === k ? "bg-[#1c1f23] text-white" : "text-muted hover:bg-paper"}`}
            >
              {k === "sold" ? "Sold" : "For sale"}
            </button>
          ))}
        </div>
        {!readOnly && <button
          onClick={sweep}
          disabled={busy}
          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-blue disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check now"}
        </button>}
      </div>

      {msg && <div className="text-xs text-muted mt-2">{msg}</div>}

      {fillJob && <div className="mt-4 rounded-xl border border-line bg-paper p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-semibold">{fillLabel}</span>
          <span className="text-2xl font-bold tabular-nums">{fillPercent}%</span>
        </div>
        <div role="progressbar" aria-label="Missing details check progress"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={fillPercent}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full bg-[#1c1f23] transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${fillPercent}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted" aria-live="polite">
          <span>{checked ? `${checked[1]} of ${checked[2]} listings checked`
            : fillJob.status === "completed" ? fillJob.stage || "Finished"
            : fillJob.stage || "Waiting to start"}</span>
          <span>{(fillJob.rows_inserted ?? 0).toLocaleString()} fields filled</span>
        </div>
        {fillJob.error_message && <p className="mt-2 text-xs text-danger">{fillJob.error_message}</p>}
        <p className="mt-2 text-xs text-muted">{progressOffline
          ? "Connection interrupted — showing the last confirmed progress. Retrying automatically."
          : "Progress measures listings checked. Details unavailable from the source can remain blank."}</p>
      </div>}

      {!sold && !readOnly && <PortalPricingReview ids={[...chosen]} onPriced={load} />}

      {!readOnly && deleted && <button className="mt-3 text-xs border border-line rounded px-3 py-2" disabled={busy} onClick={undoDelete}>Undo last deletion ({deleted.ids.length})</button>}
      {pending === 0 ? (
        <div className="text-xs text-muted mt-4">
          Nothing waiting. {sold
            ? "Sales are swept once a week — a week-old sale is still a comp."
            : "This runs once a day on its own."}{" "}
          “Check now” asks the portals immediately.
        </div>
      ) : (
        <>
          {readOnly ? <p className="text-xs text-muted mt-4">Showing {rows.length} of {pending} awaiting review. <a className="underline" href="/admin/upload">Open review controls</a></p> : <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-xs text-muted">
              {chosen.size} selected
              {pending > rows.length ? ` · ${pending} waiting in total` : ""}
            </span>
            <button className="text-xs border border-line rounded px-3 py-2" disabled={busy} onClick={() => setChosen(new Set(rows.filter(l => !l.price_flag).map(l => l.id)))}>Select this page</button>
            <button className="text-xs border border-line rounded px-3 py-2" disabled={busy || !chosen.size} onClick={() => setChosen(new Set())}>Clear selection</button>
            <button className="text-xs border border-line rounded px-3 py-2" disabled={busy} onClick={selectAll}>Select all unuploaded ({pending})</button>
            <button className="text-xs border border-line rounded px-3 py-2 disabled:opacity-50" disabled={busy || !chosen.size} onClick={deleteSelected}>Delete selected ({chosen.size})</button>
            {/* A portal advertises a listing; it does not publish a council
                record. Without a CV a listing cannot be valued at all, so
                approving one marked "no council record" was approving it into
                a hold. This asks the council record about the rows on screen
                BEFORE the decision — it fills blanks only, never the asking
                price, and approves nothing. */}
            {!sold && (
              <button
                onClick={fillGaps}
                disabled={busy || filling || !rows.length}
                className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-line hover:bg-[#F7F5F2] disabled:opacity-50"
                title="Looks up the council record for these listings and fills what the portal did not carry. Approves nothing."
              >
                {filling ? "Filling…" : "Fill the missing details"}
              </button>
            )}
            {sold && <button
              onClick={() => decide(true)}
              disabled={busy || !chosen.size}
              className={`${sold ? "ml-auto " : ""}text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1c1f23] text-white disabled:opacity-50`}
            >
              Add {chosen.size} to sold records
            </button>}
            <button
              onClick={() => decide(false)}
              disabled={busy || !chosen.size}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-danger disabled:opacity-50"
            >
              Discard
            </button>
          </div>}

          <div className="flex items-center gap-3 mt-3 text-xs">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))} className="border rounded px-3 py-2 disabled:opacity-40">Previous page</button>
            <span>{offset + 1}–{offset + rows.length} of {pending}</span>
            <button disabled={offset + rows.length >= pending} onClick={() => setOffset(offset + pageSize)} className="border rounded px-3 py-2 disabled:opacity-40">Next page</button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-2 w-8" />
                  <th className="py-2 pr-3">Address</th>
                  <th className="py-2 pr-3">Suburb</th>
                  <th className="py-2 pr-3 text-right">{sold ? "Sold" : "Asking"}</th>
                  <th className="py-2 pr-3 text-right">CV</th>
                  <th className="py-2 pr-3 text-right">Floor</th>
                  <th className="py-2 pr-3 text-right">Land</th>
                  <th className="py-2 pr-3 text-right">Bed</th>
                  <th className="py-2 pr-3 text-right">Bath</th>
                  <th className="py-2 pr-3 text-right">Cars</th>
                  {/* Theirs, labelled as theirs. */}
                  <th className="py-2 pr-3 text-right">They say</th>
                  <th className="py-2 pr-3">{sold ? "Sold on" : "Listed"}</th>
                  <th className="py-2 pr-3">From</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <Fragment key={l.id}><tr className="border-b border-line/60 hover:bg-[#FAFAFA]">
                    <td className="py-1.5 pr-2">
                      {!readOnly && <input
                        type="checkbox"
                        checked={chosen.has(l.id)}
                        onChange={() => toggle(l.id)}
                        aria-label={`Select ${l.address ?? "listing"}`}
                      />}
                    </td>
                    <td className="py-1.5 pr-3">
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noreferrer"
                           className="text-blue hover:underline">
                          {l.address ?? "—"}
                        </a>
                      ) : (l.address ?? "—")}
                      {l.price_flag && (
                        // A sale price nowhere near what this suburb does. Not
                        // a rejection — an exceptional sale is often real — but
                        // a wrong one poisons the suburb's $/m² rate and its
                        // sale/CV ratio for every valuation that leans on them.
                        <div className="text-[10.5px] font-semibold text-danger mt-0.5">
                          ⚠ {l.price_flag}
                        </div>
                      )}
                      {!l.has_council_data && (
                        // Stated per row, because it is the difference between
                        // "not subdividable" and "we have not been told its zone".
                        <span className="ml-2 text-[10px] font-semibold text-danger"
                              title="No council valuation on this listing, so it prices from comparable sales alone.">
                          no council record
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3">{l.suburb ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right tnum">
                      {l.price_numeric ? fmtMoneyShort(l.price_numeric)
                        : <span className="text-muted">{l.price_display ?? "—"}</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-right tnum">
                      {l.cv_numeric ? fmtMoneyShort(l.cv_numeric) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right tnum">{fmtArea(l.floor_area_m2)}</td>
                    <td className="py-1.5 pr-3 text-right tnum">{fmtArea(l.land_area_m2)}</td>
                    <td className="py-1.5 pr-3 text-right tnum">{l.beds ?? "—"}</td>
                    {/* Scraped and stored all along, and never shown — the
                        question was "where is the rest of the info", and some
                        of it was already here. */}
                    <td className="py-1.5 pr-3 text-right tnum">{l.baths ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right tnum">{l.carspaces ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-right tnum text-muted">
                      {l.estimate ? fmtMoneyShort(l.estimate) : "—"}
                    </td>
                    <td className="py-1.5 pr-3">{fmtDayDate(l.listed_date)}</td>
                    {/* The link was being sent and never used, so there was no
                        way to go and look at the house you are deciding on. */}
                    <td className="py-1.5 pr-3 text-muted">
                      {l.url ? (
                        <a href={l.url} target="_blank" rel="noopener noreferrer"
                           className="underline underline-offset-2 hover:text-ink">
                          {SOURCE[l.source] ?? l.source}
                        </a>
                      ) : (SOURCE[l.source] ?? l.source)}
                    </td>
                  </tr><tr><td colSpan={13} className="pb-3"><ListingEvidence listing={l} /></td></tr></Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
