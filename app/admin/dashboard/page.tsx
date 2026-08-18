"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import BuildVersions from "@/components/BuildVersions";
import { api } from "@/lib/api";

type Metrics = {
  users_total: number; users_active: number; users_new_30d: number;
  logins_7d: number; logins_30d: number; total_logins: number;
  users_signed_in_today: number; page_views_today: number; active_users_today: number;
  top_pages_7d: { path: string; views: number; users: number; median_seconds: number | null }[];
  top_users_30d: { email: string; minutes: number; views: number; days_active: number; last_seen: string | null }[];
  activity_days: number;
  signups_total: number; signups_7d: number; signups_30d: number;
  onboarding_email_verified: number; onboarding_phone_verified: number;
  onboarding_trialing: number; onboarding_paying: number;
  agent_contacts_total: number; agent_contacts_30d: number;
  billing_connected: boolean; paying_customers: number; mrr: number;
  income_this_month: number; currency: string; billing_error: string | null;
  sold_rows: number; sold_last_loaded: string | null;
  forsale_rows: number; forsale_last_loaded: string | null;
};

type PayingUserRow = {
  email: string | null; name: string | null; amount_monthly: number;
  currency: string; status: string; since: string | null;
  customer_id: string; app_user_id: number | null;
};
type PayingUsers = { connected: boolean; customers: PayingUserRow[] };

const money = (n: number, cur = "nzd") =>
  new Intl.NumberFormat("en-NZ", { style: "currency", currency: cur.toUpperCase(), maximumFractionDigits: 0 }).format(n);
const when = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function AdminDashboardPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<PayingUsers | null>(null);

  // Window for the two activity tables only. Everything else on this page keeps
  // its fixed period, so the headline numbers stay comparable between visits.
  const [days, setDays] = useState(7);

  useEffect(() => {
    api<Metrics>(`/api/admin/metrics?days=${days}`)
      .then(setM)
      .catch((e) => setErr(e?.detail || e?.message || "Failed to load"));
  }, [days]);

  useEffect(() => {
    api<PayingUsers>("/api/admin/paying-users").then(setPay).catch(() => null);
  }, []);

  if (err) return <div className="px-4 sm:px-7 py-6 text-danger text-sm">{err}</div>;
  // The build panel renders even while the metrics are loading, and even if they
  // fail. When the API is the thing that is broken, "which build is the API
  // running" is the question you most need answered — and a dashboard that
  // refuses to draw until the API answers is no use at that exact moment.
  if (!m)
    return (
      <div className="px-4 sm:px-7 py-6">
        <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · OPERATIONS</div>
        <h1 className="font-display text-2xl font-semibold mt-1.5 mb-5">Business &amp; data dashboard</h1>
        <BuildVersions />
        <div className="text-muted text-sm">Loading…</div>
      </div>
    );

  return (
    <div className="px-4 sm:px-7 py-6">
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · OPERATIONS</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5 mb-5">Business &amp; data dashboard</h1>

      <BuildVersions />

      {/* REVENUE */}
      <Section title="Revenue">
        {m.billing_connected ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Monthly recurring revenue" value={money(m.mrr, m.currency)} accent />
            <Stat label="Income this month" value={money(m.income_this_month, m.currency)} />
            <Stat label="Paying customers" value={(m.paying_customers ?? 0).toLocaleString()} />
          </div>
        ) : (
          <div className="bg-white border border-line rounded-card shadow-soft p-5">
            <div className="font-display font-semibold">Stripe not connected</div>
            <div className="text-sm text-muted mt-1">
              Add <code className="text-xs bg-paper px-1 rounded">STRIPE_SECRET_KEY</code> to the backend env and revenue,
              income and paying-customer counts appear here automatically.
              {m.billing_error ? <span className="text-danger"> ({m.billing_error})</span> : null}
            </div>
          </div>
        )}
      </Section>

      {/* PAYING CUSTOMERS */}
      {pay?.connected && (
        <Section title="Paying customers">
          {pay.customers.length === 0 ? (
            <div className="bg-white border border-line rounded-card shadow-soft p-5 text-sm text-muted">
              No active subscribers yet.
            </div>
          ) : (
            <div className="bg-white border border-line rounded-card shadow-soft overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
                  <tr>
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-right px-4 py-3">Monthly</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Since</th>
                    <th className="text-left px-4 py-3">App account</th>
                  </tr>
                </thead>
                <tbody>
                  {pay.customers.map((c) => (
                    <tr key={c.customer_id} className="border-t border-line2">
                      <td className="px-4 py-3 font-medium">{c.name || "—"}</td>
                      <td className="px-4 py-3 text-muted">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-right tnum">{money(c.amount_monthly, c.currency)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium" style={{ color: c.status === "active" ? "#0A8754" : undefined }}>
                          ● {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{when(c.since)}</td>
                      <td className="px-4 py-3">
                        {c.app_user_id ? (
                          <a href="/admin/users" className="text-blue text-xs">#{c.app_user_id}</a>
                        ) : (
                          <span className="text-faint text-xs">not linked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* SIGN-UPS + ONBOARDING FUNNEL */}
      <Section title="Sign-ups & onboarding">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
          <Stat label="Sign-ups (all time)" value={(m.signups_total ?? 0).toLocaleString()} accent />
          <Stat label="Sign-ups (7d)" value={(m.signups_7d ?? 0).toLocaleString()} />
          <Stat label="Sign-ups (30d)" value={(m.signups_30d ?? 0).toLocaleString()} />
          <Stat label="Email verified" value={(m.onboarding_email_verified ?? 0).toLocaleString()} />
          <Stat label="Phone verified" value={(m.onboarding_phone_verified ?? 0).toLocaleString()} />
          <Stat label="On trial" value={(m.onboarding_trialing ?? 0).toLocaleString()} />
          <Stat label="Paying" value={(m.onboarding_paying ?? 0).toLocaleString()} accent />
        </div>
        <p className="text-xs text-faint mt-2">
          Funnel: sign-up → email → phone → card → trial → paying. Counts are self-serve accounts.
        </p>
      </Section>

      {/* PEOPLE */}
      <Section title="Users & activity">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Stat label="Total users" value={(m.users_total ?? 0).toLocaleString()} />
          <Stat label="Active (approved)" value={(m.users_active ?? 0).toLocaleString()} />
          <Stat label="New (30d)" value={(m.users_new_30d ?? 0).toLocaleString()} />
          <Stat label="Logged in (7d)" value={(m.logins_7d ?? 0).toLocaleString()} />
          <Stat label="Logged in (30d)" value={(m.logins_30d ?? 0).toLocaleString()} />
          <Stat label="Total logins" value={(m.total_logins ?? 0).toLocaleString()} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
          <Stat label="Signed in today" value={(m.users_signed_in_today ?? 0).toLocaleString()} accent />
          <Stat label="Active today" value={(m.active_users_today ?? 0).toLocaleString()} />
          <Stat label="Pages viewed today" value={(m.page_views_today ?? 0).toLocaleString()} />
        </div>
      </Section>

      {/* WHAT PEOPLE ACTUALLY USE */}
      <div className="flex items-center justify-between gap-3 flex-wrap mt-6 mb-1">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">
          Activity window
        </div>
        <select
          aria-label="Activity window in days"
          className="border border-line rounded px-2 py-1 bg-white"
          style={{ fontSize: 16 }}   /* under 16px iOS zooms the page on focus */
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={1}>Today</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      <Section title={`Features used (${windowLabel(m.activity_days ?? days)})`}>
        {(m.top_pages_7d?.length ?? 0) === 0 ? (
          <div className="bg-white border border-line rounded-card shadow-soft p-5 text-sm text-muted">
            Nothing recorded yet. Page use is measured from this build onwards, so
            this fills in as people browse — an empty table here means no data
            collected yet, not no usage.
          </div>
        ) : (
          <div className="bg-white border border-line rounded-card shadow-soft p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-faint">
                  <th className="text-left font-semibold pb-2">Page</th>
                  <th className="text-right font-semibold pb-2">Views</th>
                  <th className="text-right font-semibold pb-2">People</th>
                  <th className="text-right font-semibold pb-2">Typical time</th>
                </tr>
              </thead>
              <tbody>
                {m.top_pages_7d.map((p) => (
                  <tr key={p.path} className="border-t border-line/60">
                    <td className="py-1.5 font-mono text-xs">{p.path}</td>
                    <td className="py-1.5 text-right">{p.views.toLocaleString()}</td>
                    <td className="py-1.5 text-right">{p.users.toLocaleString()}</td>
                    <td className="py-1.5 text-right">
                      {p.median_seconds == null ? "—" : fmtDwell(p.median_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11px] text-faint mt-3">
              Typical time is the median, not the average — one tab left open would
              otherwise make a page look absorbing when nobody reads it. Property
              pages are counted as one page; which listing was opened is not stored.
            </div>
          </div>
        )}
      </Section>

      {(m.top_users_30d?.length ?? 0) > 0 && (
        <Section title={`Most active users (${windowLabel(m.activity_days ?? days)})`}>
          <div className="bg-white border border-line rounded-card shadow-soft p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-faint">
                  <th className="text-left font-semibold pb-2">User</th>
                  <th className="text-right font-semibold pb-2">Time on platform</th>
                  <th className="text-right font-semibold pb-2">Days active</th>
                  <th className="text-right font-semibold pb-2">Pages</th>
                  <th className="text-right font-semibold pb-2">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {m.top_users_30d.map((u) => (
                  <tr key={u.email} className="border-t border-line/60">
                    <td className="py-1.5">{u.email}</td>
                    <td className="py-1.5 text-right font-semibold">
                      {u.minutes >= 60
                        ? `${Math.floor(u.minutes / 60)}h ${String(Math.round(u.minutes % 60)).padStart(2, "0")}m`
                        : `${u.minutes.toFixed(0)}m`}
                    </td>
                    <td className="py-1.5 text-right">{(u.days_active ?? 0).toLocaleString()}</td>
                    <td className="py-1.5 text-right">{u.views.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-muted">
                      {u.last_seen ? new Date(u.last_seen).toLocaleDateString("en-NZ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[11px] text-faint mt-3">
              A floor, not an exact figure: a page counts its time when the visitor
              moves on, so the last page before someone closes the tab contributes
              nothing.
            </div>
          </div>
        </Section>
      )}

      {/* ENGAGEMENT */}
      <Section title="Buyer's-agent enquiries">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="Contacts (all time)" value={(m.agent_contacts_total ?? 0).toLocaleString()} accent />
          <Stat label="Contacts (30d)" value={(m.agent_contacts_30d ?? 0).toLocaleString()} />
        </div>
      </Section>

      {/* DATA PIPELINE */}
      <Section title="Data pipeline">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white border border-line rounded-card shadow-soft p-5">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Sold comps database (accumulates)</div>
            <div className="font-display text-3xl font-bold mt-1 tnum">{(m.sold_rows ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">Last load: {when(m.sold_last_loaded)}</div>
          </div>
          <div className="bg-white border border-line rounded-card shadow-soft p-5">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">Live for-sale listings (current week)</div>
            <div className="font-display text-3xl font-bold mt-1 tnum">{(m.forsale_rows ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">Last load: {when(m.forsale_last_loaded)}</div>
          </div>
        </div>
        <a href="/admin/upload" className="inline-block text-xs text-blue mt-3">Load this week's data →</a>
      </Section>
    </div>
  );
}

/** The window, phrased the way the heading needs it. */
function windowLabel(days: number): string {
  if (days <= 1) return "today";
  return `last ${days} days`;
}


/** "45s", "2m 10s", "1h 04m" — seconds alone stop being readable past a minute. */
function fmtDwell(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="font-display font-semibold text-sm mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-display text-2xl font-bold mt-1 tnum" style={accent ? { color: "#0A8754" } : undefined}>{value}</div>
    </div>
  );
}
