"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * The suburb picker, used everywhere a suburb is chosen.
 *
 * Every one of these used to be a free-text box backed by type-ahead. That
 * cannot tell apart three different failures — a typo, a spelling the feed does
 * not use ("Mt Eden" for "Mount Eden"), and a suburb genuinely absent from this
 * region's batch. All three gave an empty result with nothing to explain it.
 *
 * The list comes from the live batches, so every option has data behind it and
 * nothing can be typed wrong. The counts double as the answer to "is it worth
 * opening" before you open it.
 *
 * A native select on purpose: it types-to-jump on desktop, and on a phone it
 * opens the platform's own picker rather than a cramped custom menu.
 */
export type SuburbOption = { suburb: string; sold: number; live: number };

/**
 * One fetch per page load, shared by every picker on the page. Four filter bars
 * each fetching the same few hundred rows is three wasted round trips, and they
 * would land at different times so the dropdowns would populate raggedly.
 */
let CACHE: Promise<SuburbOption[]> | null = null;
export function loadSuburbs(region = "Auckland"): Promise<SuburbOption[]> {
  if (!CACHE) {
    CACHE = api<SuburbOption[]>(`/api/properties/suburbs?region=${encodeURIComponent(region)}`)
      .catch(() => {
        CACHE = null;        // let the next mount retry rather than caching a failure
        return [] as SuburbOption[];
      });
  }
  return CACHE;
}

export function useSuburbs(region = "Auckland") {
  const [options, setOptions] = useState<SuburbOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    loadSuburbs(region)
      .then((r) => { if (alive) setOptions(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [region]);
  return { options, loading };
}

export default function SuburbSelect({
  value,
  onChange,
  region = "Auckland",
  width,
  allLabel = "All suburbs",
  showCounts = true,
  className,
  ariaLabel = "Suburb",
}: {
  value: string;
  onChange: (v: string) => void;
  region?: string;
  width?: number | string;
  /** Text for the empty option. Pass null to drop it — use that where a suburb
   *  is required (a trend panel) rather than a filter (a deal list). */
  allLabel?: string | null;
  showCounts?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { options, loading } = useSuburbs(region);

  // The current value might not be in the list — a saved filter, a shared link,
  // or a batch that has moved on. Keep it selectable rather than silently
  // snapping to something the user did not choose.
  const known = !value || options.some((o) => o.suburb === value);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={width ? { width } : undefined}
      className={
        className ??
        "bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue disabled:opacity-60"
      }
      disabled={loading && options.length === 0 && !value}
    >
      {allLabel !== null && <option value="">{loading ? "Loading suburbs…" : allLabel}</option>}
      {!known && <option value={value}>{value}</option>}
      {allLabel === null && loading && options.length === 0 && (
        <option value={value}>Loading suburbs…</option>
      )}
      {options.map((o) => (
        <option key={o.suburb} value={o.suburb}>
          {o.suburb}
          {showCounts && o.sold ? ` — ${o.sold} sold` : ""}
          {showCounts && o.live ? `, ${o.live} live` : ""}
        </option>
      ))}
    </select>
  );
}
