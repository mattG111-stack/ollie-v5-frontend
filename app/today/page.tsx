"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PersonalBrief from "@/components/PersonalBrief";
import TodayAskBar from "@/components/TodayAskBar";
import AppShell from "@/components/AppShell";
import { PriceMover, TodayBrief, api } from "@/lib/api";
import { fmtMoneyShort, fmtPct } from "@/lib/format";
import ValueAddDistricts from "@/components/ValueAddDistricts";
import MarketHistoryChart from "@/components/MarketHistoryChart";
import HeadlineDeals from "@/components/HeadlineDeals";
import { useT, useTypeLabel } from "@/lib/i18n";

export default function TodayPage() {
  const { t } = useT();
  return <AppShell><div className="px-4 sm:px-7 py-6">
    <header className="mb-5">
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">{new Date().toLocaleDateString("en-NZ", {timeZone:"Pacific/Auckland",day:"numeric",month:"long"})}</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">{t("nav.today")}</h1>
      <p className="text-sm text-muted mt-1">Your opportunities, saved searches and local market in one place.</p>
    </header>
    <TodayAskBar />
    <BriefContent />
  </div></AppShell>;
}

function BriefContent() {
  const { t } = useT();
  const [data, setData] = useState<TodayBrief | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<TodayBrief>("/api/dashboards/today")
      .then(setData)
      .catch((e) => setErr(e?.detail || e?.message || t("today.failedLoad")));
  }, []);

  return <>
    <PersonalBrief market={<AucklandMarketCard data={data} error={err} />} />
    <Inner data={data} />
  </>;
}

function AucklandMarketCard({data,error}: {data: TodayBrief | null; error: string | null}) {
  const {t} = useT();
  const pulse = data?.market_pulse;
  return <section aria-label="Auckland market" className="min-w-0 bg-white border border-line rounded-card p-5">
    <h3 className="font-semibold mb-2">Auckland market</h3>
    <p className="text-xs text-muted mb-4">Market-wide figures for listings currently available in Olie.</p>
    {error?<p role="alert" className="text-sm text-danger">{t("today.couldntLoad")} {error}</p>:!data?<p className="text-sm text-muted">{t("today.loading")}</p>:!pulse?<p className="text-sm text-muted">Market snapshot is not available yet.</p>:<>
          <div className="grid grid-cols-2 gap-4">
            <Kpi
              label={t("today.activeListings")}
              value={(pulse.total_listings ?? 0).toLocaleString()}
              delta={pulse.listings_change}
              deltaFmt={(d) => `${d > 0 ? "+" : ""}${d.toLocaleString()}`}
            />
            <Kpi
              label={t("today.medianAsking")}
              value={fmtMoneyShort(pulse.median_asking)}
              delta={pulse.median_asking_change_pct}
              deltaFmt={(d) => `${d > 0 ? "+" : ""}${(d * 100).toFixed(2)}%`}
            />
            <Kpi
              label={t("today.medianDom")}
              value={pulse.median_predicted_dom ? `${Math.round(pulse.median_predicted_dom)} ${t("today.days")}` : "—"}
            />
            <KpiLink
              href="/underpriced"
              label={t("today.underpriced")}
              color="#C9CED6"
              value={data.counts.underpriced.toLocaleString()}
              hint={t("today.belowValue")}
            />
            <KpiLink
              href="/subdividable"
              label={t("today.subdividable")}
              color="#565B63"
              value={data.counts.subdividable.toLocaleString()}
              hint={t("today.landOverZone")}
            />
          </div>

      <p className="text-xs text-muted mt-4">Compared with the previous market update</p>
      <Link href="/trends" className="inline-block text-sm text-blue underline mt-3">Explore suburb trends →</Link>
    </>}
  </section>;
}

function Inner({data}: {data: TodayBrief | null}) {
  const {t} = useT();
  const typeLabel = useTypeLabel();
  if (!data) return null;

  const pulse = data.market_pulse;
  const changes = data.week_changes;

  return (
    <div>
      <header className="mb-4"><h2 className="font-display text-xl font-semibold">Market opportunities</h2><p className="text-sm text-muted">Market-wide figures for listings currently available in Olie.</p></header>

      {/* MONEY ON THE TABLE — leads the page. Counts alone don't say whether
          it is worth opening; the dollar figures do. */}
      <div className="mb-5">
        <HeadlineDeals />
      </div>

      {pulse && <section aria-label="Market history" className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <h2 className="font-display font-semibold text-sm mb-3">Market history</h2>
        <MarketHistoryChart />
      </section>}

      {/* WEEK CHANGES + PRICE MOVERS */}
      {changes && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <Link
            href="/properties"
            className="bg-white border border-line rounded-card shadow-soft p-5 hover:shadow-lg transition-shadow"
          >
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">New in the latest market update</div>
            <div className="font-display text-3xl font-bold tnum">+{(changes.new_listings ?? 0).toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">
              {t("today.newSub", { removed: (changes.removed_listings ?? 0).toLocaleString(), still: (changes.still_on_market ?? 0).toLocaleString() })}
            </div>
            <div className="text-xs text-blue mt-3">View listings →</div>
          </Link>

          <Link
            href="/properties"
            className="bg-white border border-line rounded-card shadow-soft p-5 hover:shadow-lg transition-shadow"
          >
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">{t("today.medianAskingChange")}</div>
            <div
              className="font-display text-3xl font-bold tnum"
              style={{
                // Neutral at zero. Colouring a 0.00% move red read as a crash.
                color: !pulse?.median_asking_change_pct
                  ? undefined
                  : pulse.median_asking_change_pct > 0
                  ? "#EF4444"
                  : "#176B57",
              }}
            >
              {pulse?.median_asking_change_pct == null ? "—" : `${pulse.median_asking_change_pct > 0 ? "+" : ""}${(pulse.median_asking_change_pct * 100).toFixed(2)}%`}
            </div>
            <div className="text-xs text-muted mt-1">Matched listings in the last two market updates.</div>
            <div className="text-xs text-blue mt-3">View listings →</div>
          </Link>

          <div className="bg-white border border-line rounded-card shadow-soft p-5">
            <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">Data updates</div>
            <div className="font-display text-3xl font-bold">Market updates</div>
            <div className="text-xs text-muted mt-1">Changes appear as new market data is added.</div>
            <div className="text-xs text-muted mt-3">
              {t("today.snapshotSub", { n: (data.counts.total_for_sale ?? 0).toLocaleString() })}
            </div>
          </div>
        </div>
      )}

      {/* Renovation uplift — full width; the bars need room to breathe. */}
      <div className="mb-5">
        <ValueAddDistricts />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* BIGGEST DROPS */}
        {data.biggest_drops.length > 0 && (
          <MoverList
            title={t("today.biggestDrops")}
            color="#176B57"
            tone="drop"
            rows={data.biggest_drops}
          />
        )}
        {/* BIGGEST RISES */}
        {data.biggest_rises.length > 0 && (
          <MoverList
            title={t("today.biggestRises")}
            color="#D4503E"
            tone="rise"
            rows={data.biggest_rises}
          />
        )}
      </div>

      {/* TOP SIGNALS */}
      <div className="bg-white border border-line rounded-card shadow-soft p-5">
        <h2 className="font-display font-semibold text-base mb-3">{t("today.topSignals")}</h2>
        <div className="grid gap-3">
          {data.top_signals.map((s) => (
            <Link
              key={s.id}
              href={`/property/${s.id}`}
              className="border border-line rounded-xl p-4 hover:shadow-soft transition-shadow flex gap-4 items-center"
              style={{ borderLeftWidth: 4, borderLeftColor: signalColor(s) }}
            >
              <div className="flex-1">
                <div className="font-display font-semibold">{s.address}</div>
                <div className="text-xs text-muted mt-0.5">
                  {s.suburb} · {typeLabel(s.property_type)}
                </div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {s.is_underpriced && <Chip color="#C9CED6">{t("today.underpriced")}</Chip>}
                  {s.is_subdividable && <Chip color="#565B63">{t("today.subdividable")}</Chip>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-xl">{s.opportunity_score_pct?.toFixed(0) ?? "—"}</div>
                <div className="text-[10px] uppercase tracking-wide text-faint">{t("today.buyScore")}</div>
                <div className="text-xs text-muted mt-1">
                  {t("today.asking")} <span className="text-text font-medium">{fmtMoneyShort(s.asking_price)}</span> · {t("today.est")}{" "}
                  <span className="text-text font-medium">{fmtMoneyShort(s.market_value)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  deltaFmt,
  tone,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaFmt?: (d: number) => string;
  tone?: "bad-when-zero";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-display text-2xl font-bold mt-1 tnum">{value}</div>
      {delta != null && deltaFmt && (
        <div
          className="text-xs mt-0.5 tnum"
          style={{ color: delta > 0 ? "#176B57" : delta < 0 ? "#EF4444" : undefined }}
        >
          {deltaFmt(delta)}
        </div>
      )}
    </div>
  );
}

// A KPI cell that lives inside the market-pulse strip but links out to its
// deal-finder page. Matches Kpi's type scale so the counts read as part of the
// same row; the colour dot keeps each opportunity's identity, and the hover
// affordance signals it's clickable (plain Kpi cells aren't).
function KpiLink({
  href, label, color, value, hint,
}: { href: string; label: string; color: string; value: string; hint: string }) {
  return (
    <Link href={href} className="group block -m-1 p-1 rounded-lg hover:bg-paper transition-colors">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-faint font-semibold">
        <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
        {label}
      </div>
      <div className="font-display text-2xl font-bold mt-1 tnum group-hover:text-blue transition-colors">{value}</div>
      <div className="text-xs text-muted mt-0.5">{hint}</div>
    </Link>
  );
}

function MoverList({
  title, color, tone, rows,
}: { title: string; color: string; tone: "drop" | "rise"; rows: PriceMover[] }) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5">
      <h3 className="font-display font-semibold text-sm mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <Link
            key={i}
            href={r.id ? `/property/${r.id}` : "#"}
            className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-paper transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-display font-semibold truncate">{r.address}</div>
              <div className="text-[11px] text-faint">{r.suburb}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-muted">
                {fmtMoneyShort(r.asking_was)} → {fmtMoneyShort(r.asking_now)}
              </div>
              <div
                className="text-sm font-display font-bold tabular-nums"
                style={{ color: tone === "rise" ? "#EF4444" : "#176B57" }}
              >
                {r.change_pct == null
                  ? "—"
                  : `${tone === "drop" ? "" : "+"}${(r.change_pct * 100).toFixed(1)}%`}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md"
      style={{ background: `${color}15`, color }}
    >
      {children}
    </span>
  );
}

function signalColor(s: { is_underpriced: boolean; is_cashflow_positive: boolean; is_subdividable: boolean }) {
  if (s.is_subdividable) return "#565B63";
  if (s.is_underpriced) return "#333A43";
  return "#8894A6";
}
