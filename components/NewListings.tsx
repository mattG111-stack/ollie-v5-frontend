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

import { useCallback, useEffect, useState } from "react";
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
  has_council_data: boolean;
  /** Sold rows only: the sale price is far from what this suburb does. */
  price_flag?: string | null;
};

/* Two lists, one panel. They are the same shape and the same decision, and they
 * differ in cadence and in what is at stake: a wrong asking price costs one
 * listing, a wrong SALE price poisons a whole suburb's $/m² rate and sale/CV
 * ratio, which every valuation leans on. */
type Tab = "for_sale" | "sold";

const SOURCE: Record<string, string> = {
  oneroof: "OneRoof",
  realestate: "realestate.co.nz",
  trademe: "Trade Me",
};

export default function NewListings() {
  const [rows, setRows] = useState<Listing[]>([]);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [filling, setFilling] = useState(false);

  /* Fill the gaps. Starts a JOB and watches it — it does not do the work.
   *
   * This asked the server for the lot in one request: up to 400 listings, one
   * real council lookup each. That takes minutes, the gateway closes the
   * connection long before it returns, and the browser reports "HTTP 500 with
   * no response body". It reads as a crash and was only ever a hang-up.
   *
   * Chunking made each request survivable but still needed somebody sitting
   * here with the tab open. Now the server answers immediately and the work
   * runs behind it to the end — two thousand listings at a second each is half
   * an hour, and that is fine, because nothing is waiting on it. Close the tab
   * and it keeps going; come back and the job list has the result. */
  async function fillGaps() {
    setFilling(true);
    setMsg("Looking up the gaps… this runs in the background.");
    try {
      const { job_id } = await api<{ job_id: number }>(
        `/api/admin/release/listings/fill?kind=${tab}`, { method: "POST" });

      // Every 3s for up to an hour. Watching is a convenience, not the
      // mechanism — giving up here stops the WATCHING, never the work.
      for (let i = 0; i < 1200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const job = await api<{ status: string; stage: string | null;
                               progress_pct: number | null;
                               rows_total: number | null;
                               rows_inserted: number | null;
                               error_message: string | null }>(
          `/api/admin/jobs/${job_id}`).catch(() => null);
        if (!job) continue;
        if (job.status === "completed") {
          setMsg(job.stage || "Done");
          await load();
          return;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          // Say what got done before it stopped. Whatever was filled is
          // committed and stays filled — a re-run only looks at what is still
          // blank, so pressing again carries on rather than starting over.
          const done = job.rows_inserted ? ` (${job.rows_inserted} filled first)` : "";
          setMsg((job.error_message || "Stopped") + done);
          await load();
          return;
        }
        if (job.stage) setMsg(`${job.stage}…`);
      }
      setMsg("Still going — it will finish on its own. Check the job list.");
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Could not start it");
    } finally {
      setFilling(false);
    }
  }

  const [msg, setMsg] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<Tab>("for_sale");

  const load = useCallback(async () => {
    const path = tab === "sold" ? "sold" : "new";
    const d = await api<{ pending: number; listings: Listing[] }>(
      `/api/admin/release/listings/${path}`).catch(() => null);
    if (!d) return;
    setRows(d.listings);
    setPending(d.pending);
    // Opt-out rather than opt-in: the common case is "these all look right".
    // A flagged sale is the exception — it starts unticked, because the whole
    // point of the flag is that somebody should look before it goes in.
    setChosen(new Set(d.listings.filter((l) => !l.price_flag).map((l) => l.id)));
  }, [tab]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <section className="mt-8 border border-line rounded-xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-lg font-bold">
          {sold ? "Recently sold" : "New on the market"}
        </h2>
        <span className="text-xs text-muted">
          {sold
            ? "Sales the portals have and our sold files do not"
            : "Listed in the last day, and not in this week\u2019s file yet"}
        </span>
        <div className="flex gap-1">
          {(["for_sale", "sold"] as Tab[]).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`text-[11px] px-2.5 py-1 rounded-md font-semibold ${
                tab === k ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}
            >
              {k === "sold" ? "Sold" : "For sale"}
            </button>
          ))}
        </div>
        <button
          onClick={sweep}
          disabled={busy}
          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-blue disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check now"}
        </button>
      </div>

      {msg && <div className="text-xs text-muted mt-2">{msg}</div>}

      {pending === 0 ? (
        <div className="text-xs text-muted mt-4">
          Nothing waiting. {sold
            ? "Sales are swept once a week — a week-old sale is still a comp."
            : "This runs once a day on its own."}{" "}
          “Check now” asks the portals immediately.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <span className="text-xs text-muted">
              {chosen.size} of {rows.length} selected
              {pending > rows.length ? ` · ${pending} waiting in total` : ""}
            </span>
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
            <button
              onClick={() => decide(true)}
              disabled={busy || !chosen.size}
              className={`${sold ? "ml-auto " : ""}text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink text-white disabled:opacity-50`}
            >
              Add {chosen.size} to the {sold ? "sold records" : "live list"}
            </button>
            <button
              onClick={() => decide(false)}
              disabled={busy || !chosen.size}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-danger disabled:opacity-50"
            >
              Discard
            </button>
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
                  <tr key={l.id} className="border-b border-line/60 hover:bg-[#FAFAFA]">
                    <td className="py-1.5 pr-2">
                      <input
                        type="checkbox"
                        checked={chosen.has(l.id)}
                        onChange={() => toggle(l.id)}
                        aria-label={`Select ${l.address ?? "listing"}`}
                      />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
