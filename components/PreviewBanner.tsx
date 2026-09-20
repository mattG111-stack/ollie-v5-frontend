"use client";

/**
 * A bar across the top of every page while preview is on.
 *
 * The point of preview is to walk the site as a customer would, which means
 * every page looks exactly like the real thing — and that is precisely why this
 * has to be impossible to miss. Someone who forgets which mode they are in will
 * read a valuation off an unpublished batch and act on it, or worse, sign off
 * the live site after checking a page that was never live.
 *
 * So: fixed to the top, a colour nothing else on the site uses, and it says what
 * customers are seeing instead — not merely that preview is on.
 *
 * It also carries the two decisions, because a property page is where you make
 * them. Judging a listing means looking at it: the photos, the valuation beside
 * the asking price, the comps underneath. Finding it wrong and then having to
 * remember its address, go back to the admin grid and search for it is how a bad
 * listing survives a review. The controls live here rather than in the page
 * because they belong to preview, not to the property.
 */
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { api, isPreview, setPreview } from "@/lib/api";

export default function PreviewBanner() {
  // Read on the client only. sessionStorage does not exist during the server
  // render, and guessing would flash the bar on for every visitor.
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const path = usePathname();

  useEffect(() => setOn(isPreview()), []);

  if (!on) return null;

  // /property/123 → "123". The banner knows nothing else about the page.
  const id = path?.match(/^\/property\/(\d+)/)?.[1] ?? null;

  function leave() {
    setPreview(false);
    // A full reload rather than a state change: every panel on this page was
    // fetched with preview=1 and has to be fetched again without it.
    window.location.reload();
  }

  async function hide() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/api/admin/listings/${id}/hold?reason=${encodeURIComponent("Hidden by admin")}`,
                { method: "POST" });
      setDone("Hidden — it will not go live");
    } catch (e: any) {
      setDone(e?.detail || e?.message || "Could not hide it");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!id) return;
    if (!window.confirm(
      "Remove this listing from the batch?\n\n" +
      "It will be taken out of the totals and will not go live. " +
      "Loading the file again brings it back."
    )) return;
    setBusy(true);
    try {
      await api(`/api/admin/listings/${id}`, { method: "DELETE" });
      setDone("Removed from the batch");
    } catch (e: any) {
      setDone(e?.detail || e?.message || "Could not remove it");
    } finally { setBusy(false); }
  }

  return (
    <div
      className="fixed top-0 inset-x-0 z-[100] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-[13px] font-semibold text-white"
      style={{ background: "#B45309" }}
    >
      <span>
        Preview — this is the batch waiting to go live. Customers are still
        seeing the current data.
      </span>

      {id && !done && (
        <>
          <button
            onClick={hide}
            disabled={busy}
            className="px-2 py-0.5 rounded border border-white/50 hover:bg-white/15 disabled:opacity-50"
            title="Keep this listing off the live site — it stays in the batch and can be released later"
          >Hide this one</button>
          <button
            onClick={remove}
            disabled={busy}
            className="px-2 py-0.5 rounded border border-white/50 hover:bg-white/15 disabled:opacity-50"
            title="Not a real listing — take it out of the batch entirely"
          >Remove it</button>
        </>
      )}
      {done && <span className="font-normal">{done}</span>}

      <button
        onClick={leave}
        className="px-2 py-0.5 rounded border border-white/50 hover:bg-white/15"
      >Leave preview</button>
    </div>
  );
}
