"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api, getToken } from "@/lib/api";
import AdPackAdmin from "@/components/AdPackAdmin";

/**
 * The referral programme, from the business side: who is promoting, what they
 * have brought in, and what is owed.
 *
 * The number that matters is "owed" — commissions recorded and not yet paid.
 * Everything else on this page exists to make that number checkable: which
 * promoter, which customer month, and whether it came from a real Stripe
 * payment or was entered by hand.
 */
type Promoter = {
  id: number;
  user_id: number;
  clicks: number;
  clicks_30d: number;
  visitors: number;
  click_to_signup: number | null;
  signup_to_paying: number | null;
  email: string;
  full_name: string | null;
  code: string;
  link: string;
  rate: number;
  active: boolean;
  payout_email: string | null;
  created_at: string | null;
  paying: number;
  trialing: number;
  signed_up: number;
  lapsed: number;
  total_referred: number;
  monthly_run_rate: number;
  earned_all_time: number;
  awaiting_payout: number;
};

type Summary = {
  promoters: number;
  active_promoters: number;
  referred_total: number;
  referred_paying: number;
  owed: number;
  paid_out: number;
  default_rate: number;
};

type Commission = {
  id: number;
  promoter_id: number;
  promoter_email: string | null;
  code: string | null;
  period: string;
  amount: number;
  source: string;
  created_at: string | null;
  paid_at: string | null;
  payout_ref: string | null;
};

const money = (n: number) => `$${n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PromotersAdminPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [rows, setRows] = useState<Promoter[]>([]);
  const [sum, setSum] = useState<Summary | null>(null);
  const [comms, setComms] = useState<Commission[]>([]);
  const [unpaidOnly, setUnpaidOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // new promoter
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [rate, setRate] = useState<string>("");

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      api<Promoter[]>("/api/admin/promoters"),
      api<Summary>("/api/admin/promoters/summary"),
    ]);
    setRows(p); setSum(s);
    if (!rate) setRate(String(s.default_rate));
    setComms(await api<Commission[]>(
      `/api/admin/promoters/commissions?unpaid_only=${unpaidOnly}`));
  }, [unpaidOnly, rate]);

  useEffect(() => { load().catch((e) => setErr(e?.detail || e?.message || null)); }, [load]);

  async function run(fn: () => Promise<string>, ) {
    setBusy(true); setErr(null); setOk(null);
    try {
      setOk(await fn());
      await load();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "That did not work");
    } finally { setBusy(false); }
  }

  const create = () => run(async () => {
    const body: Record<string, unknown> = { email: email.trim() };
    if (name.trim()) body.full_name = name.trim();
    if (password) body.password = password;
    if (code.trim()) body.code = code.trim();
    if (rate) body.rate = Number(rate);
    const r = await api<Promoter>("/api/admin/promoters", { method: "POST", body: JSON.stringify(body) });
    setEmail(""); setName(""); setPassword(""); setCode("");
    return `${r.email} added — their link is ${r.link}`;
  });

  const patch = (id: number, body: Record<string, unknown>, msg: string) =>
    run(async () => {
      await api(`/api/admin/promoters/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      return msg;
    });

  const payout = (period: string) => run(async () => {
    const ref = window.prompt(`Payment reference for ${period} (optional)`) ?? undefined;
    const r = await api<{ marked: number; total: number }>("/api/admin/promoters/payouts", {
      method: "POST", body: JSON.stringify({ period, payout_ref: ref || null }),
    });
    return `Marked ${r.marked} commission${r.marked === 1 ? "" : "s"} paid, ${money(r.total)}.`;
  });

  async function downloadCsv() {
    // Same-origin fetch with the bearer token, because the browser will not put
    // an Authorization header on a plain link and the endpoint is admin-only.
    const res = await fetch("/api/admin/promoters/export.csv", {
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "commissions.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const periods = Array.from(new Set(comms.filter((c) => !c.paid_at).map((c) => c.period))).sort().reverse();

  return (
    <div className="px-7 py-6 max-w-6xl">
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · REFERRALS</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">Promoters &amp; commissions</h1>
      <p className="text-sm text-muted mt-1 mb-5">
        Influencers earn per month per paying customer they bring in. Commission
        is recorded when a customer&apos;s invoice is <b>paid</b> — never for a
        signup, and never for a trial.
      </p>

      {ok && <div className="mb-4 text-sm" style={{ color: "#067647" }}>{ok}</div>}
      {err && <div className="mb-4 text-sm text-danger">{err}</div>}

      {sum && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <Stat label="Owed" value={money(sum.owed)} accent="#B42318" note="recorded, not yet paid" />
          <Stat label="Paid out" value={money(sum.paid_out)} />
          <Stat label="Referred customers paying" value={`${sum.referred_paying} / ${sum.referred_total}`} />
          <Stat label="Promoters" value={`${sum.active_promoters} / ${sum.promoters}`} note="active / total" />
        </div>
      )}

      {/* ── add a promoter ───────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <h2 className="font-display font-semibold text-sm mb-3">Add a promoter</h2>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <Input label="Email (their login)" value={email} onChange={setEmail} placeholder="name@example.com" />
          <Input label="Name" value={name} onChange={setName} />
          <Input label="Password" value={password} onChange={setPassword} type="password" />
          <Input label="Code (optional)" value={code} onChange={setCode} placeholder="auto" mono />
          <Input label="$ / month" value={rate} onChange={setRate} type="number" />
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={create}
            disabled={busy || !email.trim() || password.length < 8}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: "#0A8754" }}
          >
            {busy ? "Working…" : "Add promoter"}
          </button>
          {sum && (
            <button
              onClick={() => run(async () => {
                await api("/api/admin/promoters/rate", { method: "PUT", body: JSON.stringify({ rate: Number(rate) }) });
                return `New promoters will be signed at ${money(Number(rate))} a month.`;
              })}
              disabled={busy || !rate}
              className="px-3 py-2 text-sm border border-line rounded-lg hover:border-blue disabled:opacity-50"
            >
              Set {money(Number(rate || 0))} as the default rate
            </button>
          )}
        </div>
        <div className="text-xs text-faint mt-3 leading-relaxed">
          A promoter needs their own login — an address that is already a customer
          account is refused, because that account is one of the paying customers
          promoters are meant to be recruiting. Changing the default rate only
          affects promoters signed after the change; existing ones keep the rate
          they agreed to.
        </div>
      </div>

      <AdPackAdmin />

      {/* ── promoters ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-line">
          <h2 className="font-display font-semibold text-sm">Promoters</h2>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted">No promoters yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
                <tr>
                  <th className="text-left px-5 py-2.5">Promoter</th>
                  <th className="text-left px-5 py-2.5">Code</th>
                  <th className="text-right px-5 py-2.5">Rate</th>
                  <th className="text-right px-5 py-2.5">Opens</th>
                  <th className="text-right px-5 py-2.5">Conv.</th>
                  <th className="text-right px-5 py-2.5">Paying</th>
                  <th className="text-right px-5 py-2.5">Trial</th>
                  <th className="text-right px-5 py-2.5">Total</th>
                  <th className="text-right px-5 py-2.5">Per month</th>
                  <th className="text-right px-5 py-2.5">Owed</th>
                  <th className="text-right px-5 py-2.5">Link</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-line2">
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{p.full_name || p.email}</div>
                      <div className="text-xs text-faint">{p.email}</div>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs">
                      {p.code}
                      {!p.active && <span className="ml-2 text-danger font-sans">paused</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{money(p.rate)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                      {p.visitors}
                      {p.clicks_30d ? <div className="text-[10px] text-faint">{p.clicks_30d} in 30d</div> : null}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                      {p.click_to_signup == null ? "—" : `${p.click_to_signup}%`}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold"
                        style={{ color: p.paying ? "#0A8754" : undefined }}>{p.paying}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">{p.trialing}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-muted">{p.total_referred}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{money(p.monthly_run_rate)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{money(p.awaiting_payout)}</td>
                    <td className="px-5 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => navigator.clipboard?.writeText(p.link)}
                              className="text-blue hover:underline text-xs">copy</button>
                      <button
                        onClick={() => patch(p.id, { active: !p.active },
                          p.active ? "Link paused." : "Link live again.")}
                        disabled={busy}
                        className="ml-3 text-xs hover:underline"
                        style={{ color: p.active ? "#B42318" : "#0A8754" }}
                      >
                        {p.active ? "pause" : "resume"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── commissions ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex flex-wrap items-center gap-3">
          <div className="flex-1">
            <h2 className="font-display font-semibold text-sm">Commissions</h2>
            <div className="text-xs text-muted">
              One row per customer per month they paid.
            </div>
          </div>
          <label className="text-xs text-muted flex items-center gap-1.5">
            <input type="checkbox" checked={unpaidOnly} onChange={(e) => setUnpaidOnly(e.target.checked)} />
            unpaid only
          </label>
          <button onClick={downloadCsv}
                  className="px-3 py-1.5 text-xs border border-line rounded-lg hover:border-blue">
            Export CSV
          </button>
        </div>

        {periods.length > 0 && (
          <div className="px-5 py-3 border-b border-line flex flex-wrap items-center gap-2">
            <span className="text-xs text-faint">Mark a month paid:</span>
            {periods.map((p) => (
              <button key={p} onClick={() => payout(p)} disabled={busy}
                      className="px-2.5 py-1 text-xs border border-line rounded-lg hover:border-blue disabled:opacity-50">
                {p}
              </button>
            ))}
          </div>
        )}

        {comms.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted">
            {unpaidOnly ? "Nothing outstanding." : "No commissions recorded yet."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
              <tr>
                <th className="text-left px-5 py-2.5">Month</th>
                <th className="text-left px-5 py-2.5">Promoter</th>
                <th className="text-left px-5 py-2.5">Source</th>
                <th className="text-right px-5 py-2.5">Amount</th>
                <th className="text-left px-5 py-2.5">Paid</th>
              </tr>
            </thead>
            <tbody>
              {comms.slice(0, 300).map((c) => (
                <tr key={c.id} className="border-t border-line2">
                  <td className="px-5 py-2.5 tabular-nums">{c.period}</td>
                  <td className="px-5 py-2.5">
                    {c.promoter_email}<span className="text-xs text-faint font-mono ml-2">{c.code}</span>
                  </td>
                  <td className="px-5 py-2.5 text-xs" style={{ color: c.source === "manual" ? "#B98700" : "#7C8798" }}>
                    {c.source === "manual" ? "entered by hand" : "paid invoice"}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-semibold">{money(c.amount)}</td>
                  <td className="px-5 py-2.5 text-xs text-muted">
                    {c.paid_at
                      ? `${new Date(c.paid_at).toLocaleDateString("en-NZ")}${c.payout_ref ? ` · ${c.payout_ref}` : ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, note, accent }: {
  label: string; value: string; note?: string; accent?: string;
}) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft px-4 py-3.5">
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1" style={{ color: accent }}>{value}</div>
      {note && <div className="text-[11px] text-faint mt-1">{note}</div>}
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}
