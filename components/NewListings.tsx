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
 * The "no council record" mark is the one thing worth reading carefully. No
 * portal publishes zoning or title, so an approved row prices normally and
 * reads as not subdividable until the weekly file catches up. That is a missing
 * input, not a verdict about the property.
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

  async function sweep() {
    setBusy(true); setMsg(null);
    try {
      const path = tab === "sold" ? "sweep-sold" : "sweep";
      const r = await api<Record<string, { found: number; new: number; skipped: number }>>(
        `/api/admin/release/listings/${path}`, { method: "POST" });
      const found = Object.values(r).reduce((n, v) => n + v.new, 0);
      setMsg(found ? `${found} new to review` : "Nothing new since the last check");
      await load();
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
            <button
              onClick={() => decide(true)}
              disabled={busy || !chosen.size}
              className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg bg-ink text-white disabled:opacity-50"
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
                              title="No council valuation on this listing. It will price from comps and cannot be assessed for subdivision until the weekly file catches up.">
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
                    <td className="py-1.5 pr-3">{fmtDayDate(l.listed_date)}</td>
                    <td className="py-1.5 pr-3 text-muted">{SOURCE[l.source] ?? l.source}</td>
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
