"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

/**
 * Which of a promoter's ads is actually working.
 *
 * "You have four customers" is a nice number and an unusable one. The question
 * they have by week two is which post produced them, because that is the only
 * one that tells them what to make more of. Tagging a link answers it: the tag
 * rides along on the click and again on the signup, so a row here is a real
 * chain from one ad to one paying customer.
 *
 * Untagged traffic is shown as its own row rather than hidden, so these numbers
 * add up to the totals on the results tab. A breakdown that quietly disagrees
 * with the headline is worse than no breakdown.
 */
type Campaign = {
  campaign: string;
  clicks: number;
  signups: number;
  paying: number;
  earned: number;
  click_to_signup: number | null;
};

const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Same cleanup the server does, so the link you copy is the tag you get back. */
const cleanTag = (raw: string) =>
  raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export default function PromoterAds({ link }: { link: string }) {
  const [rows, setRows] = useState<Campaign[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<Campaign[]>("/api/promoter/campaigns"));
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not load your ads");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const clean = cleanTag(tag);
  const tagged = useMemo(() => (clean ? `${link}&c=${clean}` : link), [link, clean]);

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-white border border-line rounded-card shadow-soft p-5">
        <h2 className="font-display font-semibold text-sm">Make a link for one ad</h2>
        <div className="text-xs text-muted mt-0.5 mb-3">
          Give each post its own tag and you will see exactly which one brought
          the customers. Use a different tag per ad, not per platform, if you are
          running two on the same platform.
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1 min-w-[220px]">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              Name this ad
            </span>
            <input value={tag} onChange={(e) => setTag(e.target.value)}
                   placeholder="insta reel aug"
                   className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(tagged);
                setCopied(true); setTimeout(() => setCopied(false), 2200);
              } catch { /* the link is on screen and selectable */ }
            }}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ background: copied ? "#0A8754" : "#1F6FEB" }}
          >
            {copied ? "Copied" : "Copy this link"}
          </button>
        </div>
        <code className="block mt-3 text-sm font-mono bg-paper border border-line rounded-lg px-3 py-2.5 break-all">
          {tagged}
        </code>
        {clean && clean !== tag.trim().toLowerCase() && (
          <div className="text-xs text-faint mt-2">
            Tidied to <b className="font-mono">{clean}</b> — spaces and punctuation
            become dashes, so the same ad named twice does not split into two rows.
          </div>
        )}
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-line">
          <h2 className="font-display font-semibold text-sm">How each ad is doing</h2>
          <div className="text-xs text-muted">
            Sorted by paying customers — the only column that pays.
          </div>
        </div>
        {err && <div className="px-5 py-4 text-sm text-danger">{err}</div>}
        {!err && rows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted">
            Nothing yet. Tag a link above, use it in your next post, and it will
            appear here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
              <tr>
                <th className="text-left px-5 py-2.5">Ad</th>
                <th className="text-right px-5 py-2.5">Opens</th>
                <th className="text-right px-5 py-2.5">Signed up</th>
                <th className="text-right px-5 py-2.5">Conv.</th>
                <th className="text-right px-5 py-2.5">Paying</th>
                <th className="text-right px-5 py-2.5">Earned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.campaign || "(untagged)"} className="border-t border-line2">
                  <td className="px-5 py-2.5 font-mono text-xs">
                    {r.campaign || <span className="font-sans text-faint">untagged link</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted">{r.clicks}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{r.signups}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                    {r.click_to_signup == null ? "—" : `${r.click_to_signup}%`}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold"
                      style={{ color: r.paying ? "#0A8754" : undefined }}>{r.paying}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{money(r.earned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
