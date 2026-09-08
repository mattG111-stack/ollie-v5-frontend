"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import PromoterAds from "@/components/PromoterAds";
import PromoterKit from "@/components/PromoterKit";

/**
 * What a promoter sees: their link, and what it has earned.
 *
 * Built around one number — customers who are actually PAYING — because that is
 * the only one that earns anything. Signups and trials are shown too, but
 * clearly separated and never added into the total. A dashboard that counts a
 * trial as a sale is a dashboard that sets someone up to be disappointed on
 * payout day, and it is the promoter who will remember it, not us.
 *
 * There is deliberately nothing here identifying the customers. A promoter
 * needs to know how many they have and whether each is paying, not who they are.
 */
type Referral = {
  id: number;
  joined: string | null;
  state: "paying" | "trialing" | "signed_up" | "lapsed";
  months_paid: number;
  earned: number;
};

type Dashboard = {
  code: string;
  link: string;
  rate: number;
  active: boolean;
  clicks: number;
  clicks_30d: number;
  visitors: number;
  click_to_signup: number | null;
  signup_to_paying: number | null;
  paying: number;
  trialing: number;
  signed_up: number;
  lapsed: number;
  total_referred: number;
  monthly_run_rate: number;
  earned_all_time: number;
  awaiting_payout: number;
  referrals: Referral[];
};

const STATE: Record<Referral["state"], { label: string; colour: string; note: string }> = {
  paying:    { label: "Paying",   colour: "#0A8754", note: "earning every month" },
  trialing:  { label: "On trial", colour: "#B98700", note: "earns once their first payment goes through" },
  signed_up: { label: "Signed up", colour: "#7C8798", note: "has an account, has not paid" },
  lapsed:    { label: "Stopped",  colour: "#B42318", note: "paid before, not now" },
};

const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PromoterPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"results" | "ads" | "kit">("results");

  const load = useCallback(async () => {
    try {
      setD(await api<Dashboard>("/api/promoter/dashboard"));
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not load your dashboard");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function copy() {
    if (!d) return;
    try {
      await navigator.clipboard.writeText(d.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard blocked (an insecure origin, or a browser that asks). The
      // link is on screen and selectable, so this is a missing convenience
      // rather than a missing feature — saying nothing is better than an error.
    }
  }

  if (err) {
    return (
      <div className="px-7 py-6 max-w-3xl">
        <h1 className="font-display text-2xl font-semibold">Referrals</h1>
        <div className="mt-4 text-sm text-danger">{err}</div>
      </div>
    );
  }
  if (!d) return <div className="px-7 py-6 text-sm text-muted">Loading…</div>;

  return (
    <div className="px-7 py-6 max-w-5xl">
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">PROMOTER</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">Your referrals</h1>
      <p className="text-sm text-muted mt-1 mb-5">
        You earn <b>{money(d.rate)} per month</b> for every customer you bring in,
        for as long as they keep paying.
      </p>

      {!d.active && (
        <div className="mb-5 text-sm rounded-card border px-4 py-3"
             style={{ background: "#FFF6E5", borderColor: "#F0C674", color: "#6B4E00" }}>
          Your link is paused, so new signups through it are not being counted.
          Customers you have already brought in keep earning. Get in touch if this
          is unexpected.
        </div>
      )}

      {/* ── the two numbers they came to see ─────────────────────────────── */}
      {/* Above the link, the funnel and everything else. A promoter opens this
          page to answer two questions — how much am I making, and off how many
          people — and every second they spend hunting for that is a second
          spent wondering whether the answer is being hidden. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-white border border-line rounded-card shadow-soft px-6 py-5">
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
            Your income
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-semibold tabular-nums" style={{ color: "#0A8754" }}>
              {money(d.monthly_run_rate)}
            </span>
            <span className="text-sm text-muted">a month</span>
          </div>
          <div className="text-xs text-faint mt-2 leading-relaxed">
            {money(d.earned_all_time)} earned all time
            {d.awaiting_payout > 0 && <> · <b>{money(d.awaiting_payout)}</b> awaiting payout</>}
          </div>
        </div>

        <div className="bg-white border border-line rounded-card shadow-soft px-6 py-5">
          <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
            Paying customers
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-semibold tabular-nums">{d.paying}</span>
            <span className="text-sm text-muted">
              at {money(d.rate)} each
            </span>
          </div>
          <div className="text-xs text-faint mt-2 leading-relaxed">
            {d.trialing > 0
              ? <>{d.trialing} more on trial — <b>they earn nothing until their first payment</b></>
              : d.total_referred > 0
                ? <>{d.total_referred} signed up in total</>
                : <>Share your link below to get started</>}
          </div>
        </div>
      </div>

      {/* ── the link ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Your link</div>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <code className="flex-1 min-w-[260px] text-sm font-mono bg-paper border border-line rounded-lg px-3 py-2.5 break-all">
            {d.link}
          </code>
          <button
            onClick={copy}
            className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg"
            style={{ background: copied ? "#0A8754" : "#1F6FEB" }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="text-xs text-faint mt-2.5 leading-relaxed">
          Anyone who opens this link and creates an account is counted as yours —
          even if they look around for a few days first, and even if they land on
          a different page. Your code is <b className="font-mono">{d.code}</b>.
        </div>
      </div>

      {/* ── tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 border-b border-line">
        {([["results", "Results"], ["ads", "My ads"], ["kit", "Media pack"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
                  className="px-4 py-2 text-sm font-semibold -mb-px border-b-2"
                  style={{ borderColor: tab === k ? "#1F6FEB" : "transparent",
                           color: tab === k ? "#1F6FEB" : "#7C8798" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "ads" && <PromoterAds link={d.link} />}
      {tab === "kit" && <PromoterKit link={d.link} />}

      {tab === "results" && <>
      {/* ── the funnel ───────────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-3">
          How your link is doing
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <Step label="Opened your link" value={d.visitors}
                note={d.clicks_30d ? `${d.clicks_30d} in the last 30 days` : "people, not page loads"} />
          <Arrow pct={d.click_to_signup} />
          <Step label="Created an account" value={d.total_referred} />
          <Arrow pct={d.signup_to_paying} />
          <Step label="Paying" value={d.paying} accent="#0A8754"
                note={`${money(d.monthly_run_rate)} a month`} />
        </div>
        <div className="text-xs text-faint mt-3 leading-relaxed">
          Link opens count people rather than page loads — refreshing does not add
          to it. It is a guide, not an exact figure: browsers that block scripts
          are not counted, and one person on a phone and a laptop counts twice.
          The other two numbers are exact.
        </div>
      </div>

      {/* ── the numbers ──────────────────────────────────────────────────── */}
      {/* ── the list ─────────────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-line">
          <h2 className="font-display font-semibold text-sm">
            Everyone who signed up through your link
          </h2>
          <div className="text-xs text-muted">
            {d.total_referred} total · {d.paying} paying · {d.trialing} on trial ·{" "}
            {d.signed_up} signed up but not paying · {d.lapsed} stopped
          </div>
        </div>
        {d.referrals.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted">
            Nobody has signed up through your link yet. Share it and they will
            appear here as they join.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
              <tr>
                <th className="text-left px-5 py-2.5">Joined</th>
                <th className="text-left px-5 py-2.5">Status</th>
                <th className="text-right px-5 py-2.5">Months paid</th>
                <th className="text-right px-5 py-2.5">Earned</th>
              </tr>
            </thead>
            <tbody>
              {d.referrals.map((r) => {
                const s = STATE[r.state];
                return (
                  <tr key={r.id} className="border-t border-line2">
                    <td className="px-5 py-2.5 text-muted">
                      {r.joined ? new Date(r.joined).toLocaleDateString("en-NZ",
                        { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: s.colour }} />
                        <b>{s.label}</b>
                        <span className="text-xs text-faint">{s.note}</span>
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{r.months_paid}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">
                      {money(r.earned)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-faint mt-4 leading-relaxed max-w-2xl">
        A customer earns you {money(d.rate)} for each month they actually pay. The
        free trial earns nothing — it becomes earning the day their first payment
        goes through, and stops if they cancel. Customer names and email addresses
        are not shown here.
      </div>
      </>}
    </div>
  );
}

/** One stage of the funnel. */
function Step({ label, value, note, accent }: {
  label: string; value: number; note?: string; accent?: string;
}) {
  return (
    <div className="flex-1 min-w-[150px] bg-paper border border-line rounded-lg px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5" style={{ color: accent }}>
        {value.toLocaleString("en-NZ")}
      </div>
      {note && <div className="text-[11px] text-faint mt-0.5 leading-snug">{note}</div>}
    </div>
  );
}

/** The conversion between two stages. Shows a dash, not 0%, when nothing has
 *  happened yet — those are different things and a promoter reading "0%" on a
 *  link nobody has opened would draw the wrong conclusion from it. */
function Arrow({ pct }: { pct: number | null }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 min-w-[54px]">
      <div className="text-sm font-semibold tabular-nums">
        {pct == null ? <span className="text-faint">—</span> : `${pct}%`}
      </div>
      <div className="text-faint text-lg leading-none">→</div>
    </div>
  );
}
