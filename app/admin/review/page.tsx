"use client";

/**
 * Look at the deals, with the photos, before anybody else does.
 *
 *   "some of the stuff we're not getting right cause the CVs aren't right on
 *    some of these properties so we're pricing them all wrong because they
 *    might have just been subdivided and houses put on them, so that's why if I
 *    look at the listings with the photos I can filter through them really
 *    quickly and see if it's a deal or not before it goes live"
 *
 * The failure this exists to catch cannot be caught by any rule we have. A
 * section is subdivided, a house goes up, and the council record still
 * describes what was there before — so the valuation is anchored to a CV that
 * is about a different property. Every downstream number is then confidently
 * wrong, and the margin looks best exactly where the CV is most stale, which
 * puts those listings at the TOP of the deal list.
 *
 * A person looking at one photo settles it in a second. So this is built for
 * that second: the picture large, and beside it only the numbers that expose a
 * stale council record —
 *
 *   the CV broken into land + improvements, because a new house on an old
 *   record shows improvements at zero or at the value of a house that is no
 *   longer there;
 *
 *   the CV per m² of floor, which collapses when the record is valuing dirt and
 *   the listing is a building;
 *
 *   the date the council last valued it, which is the whole question when a
 *   property has changed since.
 *
 * Ordered worst-first: biggest margin at the top, because that is both what
 * goes in front of customers first and where a wrong CV does the most damage.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import AppShell from "@/components/AppShell";
import PhotoStrip from "@/components/PhotoStrip";
import { ForSaleList, ForSaleRow, api, isPreview, setPreview } from "@/lib/api";
import { fmtArea, fmtDayDate, fmtMoney } from "@/lib/format";

const PAGE = 60;

function photos(r: ForSaleRow): string[] {
  return (r.image_urls ?? "").split("\n").map((u) => u.trim()).filter(Boolean);
}

/** CV per m² of floor — the number that gives a stale record away. */
function cvPerFloor(r: ForSaleRow): number | null {
  if (!r.cv_numeric || !r.floor_area_m2 || r.floor_area_m2 <= 0) return null;
  return r.cv_numeric / r.floor_area_m2;
}

export default function AdminReviewPage() {
  const [rows, setRows] = useState<ForSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<number | null>(null);
  const [on, setOn] = useState(false);

  useEffect(() => setOn(isPreview()), []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      // Deals first: the ones that would go in front of customers, and the ones
      // a wrong CV flatters most.
      // The parameter names are the endpoint's own: order_by / order_dir /
      // page_size, not sort / dir / limit. Sent wrong they do not error — the
      // defaults quietly take over, and this page came up smallest-margin-first,
      // which is the exact opposite of what it is for.
      const q = new URLSearchParams({
        region: "Auckland", underpriced: "true", min_comps: "1",
        order_by: "margin", order_dir: "desc", page_size: String(PAGE),
      });
      const list = await api<ForSaleList>(`/api/properties?${q}`);
      setRows(list.rows);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not load the listings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(r: ForSaleRow, kind: "hide" | "remove") {
    if (kind === "remove" && !window.confirm(
      `Remove ${r.address || "this listing"} from the batch?\n\n` +
      "It will be taken out of the totals and will not go live. " +
      "Loading the file again brings it back."
    )) return;
    setBusy(r.id);
    try {
      if (kind === "hide") {
        await api(`/api/admin/listings/${r.id}/hold?reason=${encodeURIComponent("Hidden by admin")}`,
                  { method: "POST" });
      } else {
        await api(`/api/admin/listings/${r.id}`, { method: "DELETE" });
      }
      setGone((g) => new Set(g).add(r.id));
    } catch (e: any) {
      setErr(e?.detail || e?.message || "That did not work");
    } finally {
      setBusy(null);
    }
  }

  const live = useMemo(() => rows.filter((r) => !gone.has(r.id)), [rows, gone]);

  return (
    <AppShell>
      <div className="px-4 sm:px-7 py-6">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-xl font-semibold">Check the deals</h1>
          <span className="text-sm text-muted">
            Biggest margin first — what customers would see at the top of the list
          </span>
          {!on && (
            <button
              onClick={() => { setPreview(true); window.location.reload(); }}
              className="ml-auto px-3 py-1.5 text-sm font-semibold rounded-lg text-white"
              style={{ background: "#B45309" }}
            >
              Switch to the batch waiting to go live
            </button>
          )}
        </div>

        <p className="text-xs text-faint mt-2 max-w-3xl">
          A council valuation set before a section was subdivided and built on
          describes a property that no longer exists — and the margin looks
          biggest exactly where the record is most out of date. The council
          figures are broken open on each card so a photo settles it: improvements
          at zero under a finished house, or a CV per m² that belongs to bare land.
        </p>

        {err && <div className="mt-4 text-sm" style={{ color: "#B42318" }}>{err}</div>}
        {loading && <div className="mt-6 text-sm text-muted">Loading…</div>}
        {!loading && live.length === 0 && (
          <div className="mt-6 text-sm text-muted">
            Nothing to check — no listing in this batch is flagged as a deal.
          </div>
        )}

        <div className="mt-5 grid gap-4"
             style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
          {live.map((r) => {
            const pf = cvPerFloor(r);
            const iv = r.improvement_value_numeric;
            // The signature of a record that predates the building.
            const noImprovements = r.cv_numeric != null && (iv == null || iv <= 0);
            return (
              <div key={r.id} className="rounded-2xl border border-line overflow-hidden bg-white">
                <PhotoStrip urls={photos(r)} height={200} />

                <div className="p-3">
                  <div className="font-semibold leading-snug">{r.address}</div>
                  <div className="text-xs text-muted">
                    {[r.suburb, r.property_type].filter(Boolean).join(" · ")}
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2 text-[13px]">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Asking</div>
                      <div className="tnum font-semibold">{fmtMoney(r.asking_price)}</div>
                      {r.asking_basis && r.asking_basis !== "advertised" && (
                        <div className="text-[10px]" style={{ color: "#B45309" }}>{r.asking_basis}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Valued</div>
                      <div className="tnum font-semibold">{fmtMoney(r.fair_value)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-faint">Margin</div>
                      <div className="tnum font-semibold" style={{ color: "#0A8754" }}>
                        {r.margin != null ? `${(r.margin * 100).toFixed(1)}%` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* The council record, opened up. This is the part that is wrong
                      on a subdivided section, and it is invisible everywhere else. */}
                  <div className="mt-2 rounded-lg p-2 text-[12px]"
                       style={{ background: noImprovements ? "#FEF3C7" : "#F8FAFC" }}>
                    <div className="flex justify-between">
                      <span className="text-faint">Council valuation</span>
                      <span className="tnum">{fmtMoney(r.cv_numeric)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-faint">— land</span>
                      <span className="tnum">{fmtMoney(r.land_value_numeric)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-faint">— improvements</span>
                      <span className="tnum" style={noImprovements ? { color: "#B45309", fontWeight: 700 } : undefined}>
                        {noImprovements ? "none recorded" : fmtMoney(iv)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-faint">— per m² of floor</span>
                      <span className="tnum">{pf ? `$${Math.round(pf).toLocaleString()}` : "—"}</span>
                    </div>
                    {r.valuation_last_date && (
                      <div className="flex justify-between">
                        <span className="text-faint">— valued</span>
                        <span className="tnum">{fmtDayDate(r.valuation_last_date)}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
                    <span>{fmtArea(r.floor_area_m2)} floor</span>
                    <span>{fmtArea(r.land_area_m2)} land</span>
                    <span>{r.beds ?? "—"} bed</span>
                    <span>{r.baths ?? "—"} bath</span>
                    <span>{r.comps_used ?? 0} comps</span>
                    <span>{r.confidence ?? "—"}</span>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <a
                      href={`/property/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 text-[12px] border border-line rounded hover:border-blue"
                    >Open</a>
                    <button
                      onClick={() => act(r, "hide")}
                      disabled={busy === r.id}
                      className="px-2 py-1 text-[12px] border border-line rounded hover:border-amber-600 hover:text-amber-700 disabled:opacity-40"
                      title="Keep it off the live site — it stays in the batch"
                    >Hide</button>
                    <button
                      onClick={() => act(r, "remove")}
                      disabled={busy === r.id}
                      className="px-2 py-1 text-[12px] border rounded disabled:opacity-40"
                      style={{ borderColor: "#B42318", color: "#B42318" }}
                      title="Not a real listing — take it out of the batch entirely"
                    >Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
