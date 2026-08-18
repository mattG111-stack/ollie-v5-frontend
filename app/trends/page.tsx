"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Sparkline from "@/components/Sparkline";
import SuburbTrendChart from "@/components/SuburbTrendChart";
import SuburbTrendsMap from "@/components/SuburbTrendsMap";
import SuburbSelect, { SuburbOption, useSuburbs } from "@/components/SuburbSelect";
import { SuburbTrend, api } from "@/lib/api";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

type Effect = {
  key: string; dollars: number | null; days: number | null; note: string | null;
  /** The 95% interval around `dollars`. Shown next to it, because on one
   *  suburb's sales this is tens of thousands wide and the point estimate on its
   *  own reads as far more exact than it is. */
  low?: number | null;
  high?: number | null;
  /** Sales the estimate was fitted on. */
  n_sales?: number | null;
  /** How it was measured — "regression" when a figure is published. */
  basis?: string | null;
};
type MethodResult = {
  method: string; sales: number; median_price: number | null;
  median_vs_cv: number | null; median_days: number | null;
};

type MonthPoint = {
  month: string; sales: number; median_days: number | null;
  sale_vs_cv: number | null; median_price: number | null;
};

type BedSeries = {
  beds: number;          // 1..6, where 6 means "6 or more"
  label: string;         // "3 bed" | "6+ bed"
  sales: number;         // sales in the window for this bedroom count
  points: MonthPoint[];
};

type SuburbStats = {
  suburb: string; active_listings: number; median_asking: number | null;
  sold_count: number; median_sold: number | null; median_ppm2: number | null;
  sales_this_month: number; latest_month: string | null; current_month: string | null;
  monthly: MonthPoint[];
  by_beds: BedSeries[];
  median_days: number | null; sale_vs_cv: number | null; effects: Effect[];
  by_method: MethodResult[];
  from_year: number | null; to_year: number | null; years_available: number[];
  auction_edge_pp: number | null;
  best_method: string | null;
  best_edge_pp: number | null;
  method_note: string | null;
};

const METHOD_LABEL: Record<string, string> = {
  auction: "Auction",
  negotiation: "By negotiation",
  tender: "Tender",
  deadline: "Deadline sale",
  fixed: "Asking price",
};

/** Fallback quick-picks, used only if the suburb list fails to load. The real
 *  chips come from the batch, ordered by how many sales are behind them. */
const POPULAR_SUBURBS = [
  "Remuera", "Mount Eden", "Mount Albert", "Ponsonby", "Devonport",
  "Takapuna", "Howick", "Henderson", "Papakura", "Manurewa",
  "Mangere", "Onehunga", "Glen Innes", "Mission Bay", "Greenlane",
];

export default function TrendsPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { t } = useT();
  const [suburb, setSuburb] = useState("Remuera");
  const [data, setData] = useState<SuburbTrend | null>(null);
  const [loading, setLoading] = useState(false);
  const { options, loading: optsLoading } = useSuburbs();

  // Land on a suburb that exists. Defaulting to a hard-coded "Remuera" that is
  // not in the batch opens the page on an empty panel and reads as the app
  // being broken.
  useEffect(() => {
    if (options.length && !options.some((o) => o.suburb === "Remuera") && suburb === "Remuera") {
      setSuburb([...options].sort((a, b) => b.sold - a.sold)[0].suburb);
    }
  }, [options, suburb]);

  // The quick-pick chips, taken from the data rather than a hard-coded list —
  // the busiest suburbs in the batch are the ones worth one click.
  const quick = [...options].sort((a, b) => b.sold - a.sold).slice(0, 12);

  useEffect(() => {
    setLoading(true);
    api<SuburbTrend>(`/api/dashboards/suburb-trend?suburb=${encodeURIComponent(suburb)}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [suburb]);

  return (
    <div className="px-7 py-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">{t("trends.title")}</h1>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          {t("trends.intro", {
            a: t("trends.introA"),
            b: t("trends.introB"),
          })}
        </p>
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-faint font-semibold mr-2">{t("trends.suburb")}</span>
          <SuburbSelect value={suburb} onChange={setSuburb} allLabel={null} width={256} />
          <span className="text-xs text-muted">{t("trends.orPick")}</span>
          {(quick.length ? quick.map((o) => o.suburb) : POPULAR_SUBURBS).map((s) => (
            <button
              key={s}
              onClick={() => setSuburb(s)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                s === suburb
                  ? "bg-blue text-white border-blue"
                  : "bg-paper border-line text-muted hover:border-blue"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Map (for-sale + sold houses) + what moves value */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div className="bg-white border border-line rounded-card shadow-soft p-3">
          <SuburbTrendsMap suburb={suburb} />
        </div>
        <SuburbStatsPanel
          suburb={suburb}
          trend={data?.points?.map((p) => p.median_asking).filter((v): v is number => v != null)}
        />
      </div>

      {loading && <div className="text-sm text-muted">{t("trends.loading")}</div>}

      {!loading && data && (
        <>
          {/* Top KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <Kpi label={t("trends.currentAsking")} value={fmtMoneyShort(data.median_asking_current)} />
            <Kpi label={t("trends.liveListings")} value={data.listing_count?.toLocaleString() ?? "—"} />
            <Kpi label={t("trends.snapshotsSoFar")} value={String(data.points.length)} />
          </div>

          {/* Long-term history chart */}
          {/* Our own sales when we have them — they are this suburb's actual
              transactions and they move when the sold data does. The scraped
              portal series is the fallback. */}
          {data.sold_yearly_json || data.long_term_yearly_json ? (
            <SuburbTrendChart
              yearly={data.sold_yearly_json ?? data.long_term_yearly_json}
              suburb={data.suburb}
              source={data.trend_source}
            />
          ) : (
            <div className="bg-white border border-line rounded-card shadow-soft p-6 text-sm text-muted">
              {t("trends.noLongTerm", { suburb: data.suburb })}
            </div>
          )}

          {/* Our weekly batch view */}
          {data.points.length > 0 && (
            <div className="bg-white border border-line rounded-card shadow-soft p-5 mt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display font-semibold text-sm">{t("trends.weeklySnapshots")}</h3>
                  <div className="text-xs text-muted">
                    {t("trends.medianAcross", { suburb: data.suburb })}
                  </div>
                </div>
                <span className="text-xs text-faint">
                  {data.points.length === 1 ? t("trends.snapshotN", { n: data.points.length }) : t("trends.snapshotNPlural", { n: data.points.length })}
                </span>
              </div>

              {data.points.length > 1 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">{t("trends.medianAsking")}</div>
                      <Sparkline values={data.points.map((p) => p.median_asking)} width={400} height={70} color="#2E353D" />
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">{t("trends.medianEstimate")}</div>
                      <Sparkline values={data.points.map((p) => p.median_market_value)} width={400} height={70} color="#0A8754" />
                    </div>
                  </div>
                  <table className="w-full text-sm mt-3">
                    <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
                      <tr>
                        <th className="text-left px-3 py-2">{t("trends.snapshot")}</th>
                        <th className="text-right px-3 py-2">{t("trends.medianAsking")}</th>
                        <th className="text-right px-3 py-2">{t("trends.medianEstimate")}</th>
                        <th className="text-right px-3 py-2">{t("trends.listings")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.points.map((pt) => (
                        <tr key={pt.batch_id} className="border-t border-line2">
                          <td className="px-3 py-2">{pt.batch_date}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoneyShort(pt.median_asking)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoneyShort(pt.median_market_value)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{(pt.listing_count ?? 0).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <div className="text-sm text-muted">
                  {t("trends.onlyOne")}
                </div>
              )}
            </div>
          )}

          {data.sample_property_id && (
            <div className="text-xs text-muted mt-4 text-right">
              {t("trends.sampleUsed")}{" "}
              <Link href={`/property/${data.sample_property_id}`} className="text-blue hover:text-blue-dark">
                #{data.sample_property_id}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className="font-display text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function SuburbStatsPanel({ suburb, trend }: { suburb: string; trend?: number[] }) {
  const [s, setS] = useState<SuburbStats | null>(null);
  // How many years back from the newest one to include. null = whatever the
  // server defaults to (the newest year present), which is what the first load
  // asks for — the year list is not known until a reply arrives.
  const [span, setSpan] = useState<number | null>(null);
  // Held separately from `s` so the picker keeps its full list of years while a
  // narrow window is selected; taking them from the current reply would shrink
  // the options to the years already chosen and there would be no way back out.
  const [years, setYears] = useState<number[]>([]);

  useEffect(() => {
    if (!suburb) return;
    let alive = true;
    const q = new URLSearchParams({ suburb });
    if (span != null && years.length) {
      q.set("to_year", String(years[0]));
      q.set("from_year", String(years[0] - span + 1));
    }
    api<SuburbStats>(`/api/properties/suburb-stats?${q}`)
      .then((r) => {
        if (!alive) return;
        setS(r);
        if (r.years_available?.length) {
          setYears((prev) => (r.years_available.length > prev.length ? r.years_available : prev));
        }
      })
      .catch(() => { if (alive) setS(null); });
    return () => { alive = false; };
  }, [suburb, span, years.length]);

  // Reset to the default window when the suburb changes — a span that made
  // sense in a suburb with ten years of sales is misleading in one with two.
  useEffect(() => { setSpan(null); setYears([]); }, [suburb]);

  const money = (n: number | null | undefined) => (n == null ? "—" : fmtMoneyShort(n));
  /** Signed, so a room the sales say SUBTRACTS value reads as a subtraction
   *  rather than as "+-$40k". */
  const signedMoney = (n: number | null | undefined) =>
    n == null ? "—" : `${n >= 0 ? "+" : "−"}${fmtMoneyShort(Math.abs(n))}`;
  const bed = s?.effects.find((e) => e.key === "bedroom");
  const bath = s?.effects.find((e) => e.key === "bathroom");

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5 flex flex-col">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{suburb}</div>
        {years.length > 1 && (
          <select
            aria-label="Years of sales to include"
            className="text-xs border border-line rounded px-2 py-1 bg-white"
            style={{ fontSize: 16 }}   /* under 16px iOS zooms the page on focus */
            value={span == null ? "" : String(span)}
            onChange={(e) => setSpan(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">{years[0]} only</option>
            {[2, 3, 5, 10].map((n) => {
              const first = years[0] - n + 1;
              // Only offer a span the data can actually fill, so the panel can
              // never claim a range wider than the sales behind it.
              if (first < years[years.length - 1]) return null;
              return <option key={n} value={n}>{first}–{years[0]}</option>;
            })}
            <option value={years[0] - years[years.length - 1] + 1}>
              All years ({years[years.length - 1]}–{years[0]})
            </option>
          </select>
        )}
      </div>
      <div className="font-display text-3xl font-bold mt-0.5">{money(s?.median_sold ?? s?.median_asking)}</div>
      <div className="text-xs text-muted mt-0.5">
        {s
          ? `median ${s.median_sold != null ? "sold" : "asking"} · ${s.active_listings} live · `
            + `${s.sold_count} sold `
            + (s.from_year && s.to_year
                ? (s.from_year === s.to_year ? `in ${s.to_year}` : `${s.from_year}–${s.to_year}`)
                : "")
          : "…"}
      </div>

      <div className="grid grid-cols-3 gap-2.5 mt-4">
        <StatTile
          k="Sales this month"
          v={s ? String(s.sales_this_month) : "—"}
          sub={monthLabel(s)}
        />
        <StatTile k="Median days to sell" v={s?.median_days != null ? String(Math.round(s.median_days)) : "—"} />
        <StatTile k="Sale vs CV" v={s?.sale_vs_cv != null ? `${s.sale_vs_cv >= 0 ? "+" : ""}${(s.sale_vs_cv * 100).toFixed(1)}%` : "—"}
          color={s?.sale_vs_cv != null ? (s.sale_vs_cv >= 0 ? "#16A34A" : "#DC2626") : undefined} />
      </div>

      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mt-5 mb-1">What moves value here</div>
      <MoveRow icon="＋🛏" name="Add a bedroom" note={basisNote(bed)}
        value={bed?.dollars != null ? signedMoney(bed.dollars) : null} muted={bed?.note ?? "measuring…"}
        warn={isConfounded(bed)} />
      <MoveRow icon="＋🛁" name="Add a bathroom" note={basisNote(bath)}
        value={bath?.dollars != null ? signedMoney(bath.dollars) : null}
        muted={bath?.note ?? "measuring…"}
        sub={bath?.days != null ? `sells ~${Math.abs(Math.round(bath.days))} days ${bath.days < 0 ? "faster" : "slower"}` : undefined}
        warn={isConfounded(bath)}
        last />
      <div className="text-[11px] text-faint mt-3">
        Fitted across every sale in this suburb, holding floor area and land area
        constant — so the figure is the room, not the bigger house and bigger
        section that usually come with it. The range is where the sales actually
        put it; where they can&rsquo;t separate the room from the house, this says
        so instead of showing a number.
      </div>

      <MarketDirection s={s} />

      <SalesMethod s={s} />

      {trend && trend.filter((v) => v != null && v > 0).length >= 2 && (
        <div className="mt-4 pt-4 border-t border-line/60">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">Median asking · recent snapshots</div>
          <Sparkline values={trend} width={440} height={64} color="#2E353D" />
        </div>
      )}
    </div>
  );
}

/** "so far in August", or a warning when the feed has not caught up yet. */
function monthLabel(s: SuburbStats | null): string {
  if (!s?.current_month) return "so far";
  const name = new Date(`${s.current_month}-01T00:00:00`)
    .toLocaleDateString("en-NZ", { month: "long" });
  if (s.latest_month && s.latest_month < s.current_month) return `so far in ${name} · feed lags`;
  return `so far in ${name}`;
}

// "vs CV" leads because it is the only one of these that can actually show a
// suburb's direction.
//
// Measured on generated sales for a mixed-stock suburb, both smoothed over three
// months: a median price line swung 74% in a market held deliberately FLAT and
// 89% in one rising 19% a year — it cannot tell those two apart, because what
// moves a suburb median month to month is which homes happened to sell. The
// same suburb measured against CV moved 9pp flat and 15-20pp rising, which is
// the real drift. Every sale is compared to its own valuation, so the mix
// cancels out.
const SERIES = [
  { key: "sale_vs_cv", label: "vs CV", better: "up" },
  { key: "median_price", label: "Median price", better: "up" },
  { key: "sales", label: "Sales", better: "up" },
  { key: "median_days", label: "Days to sell", better: "down" },
] as const;

/** A bedroom count needs this many months on the chart before it is offered.
 *  Two dots is not a trend, and the backend already withholds any month with
 *  fewer than three sales in the band. */
const MIN_BED_MONTHS = 3;

/**
 * The three metrics over the last 13 months.
 *
 * Thirteen, not twelve, so the same month last year sits on the chart. This
 * market is seasonal enough that a 12-month window makes every December look
 * like a downturn, and "is it getting better or worse" is exactly the question
 * that gets answered wrong by comparing a quiet month to a busy one.
 */
function MarketDirection({ s }: { s: SuburbStats | null }) {
  const [metric, setMetric] = useState<(typeof SERIES)[number]["key"]>("sale_vs_cv");
  // null = every home in the suburb; a number = that bedroom count only.
  const [beds, setBeds] = useState<number | null>(null);

  // Only offer a bedroom count that actually has a line to draw. The backend
  // withholds a month with fewer than three sales in the band, so a count can
  // exist in the data and still be too thin to chart — offering it would hand
  // back an empty panel.
  const bands = (s?.by_beds ?? []).filter(
    (b) => b.points.filter((p) => p.median_price != null).length >= MIN_BED_MONTHS,
  );
  const picked = beds == null ? null : bands.find((b) => b.beds === beds) ?? null;
  const pts = picked ? picked.points : s?.monthly ?? [];
  const spec = SERIES.find((x) => x.key === metric)!;
  if (!s || (s.monthly ?? []).length < 3) return null;

  const raw = pts.map((p) => (metric === "sales" ? p.sales : p[metric]));
  const known = raw.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as [number, number][];
  // Not enough of THIS metric for THIS bedroom count — 5-bed homes may sell
  // often enough to price but not often enough to time. Say so in place of the
  // chart and keep the buttons on screen; unmounting the panel would take the
  // controls away with it and strand whoever just pressed one.
  const thin = known.length < 3;

  // The current month is only part-counted, so it must not drive the verdict:
  // three sales into August against twelve in a finished month reads as a
  // collapse every time, in a market that has not moved. It stays ON the chart —
  // it is real — but drawn as partial and left out of the comparison.
  const partialIdx = s.current_month ? pts.findIndex((p) => p.month === s.current_month) : -1;
  const settled = known.filter(([i]) => i !== partialIdx);

  const fmtV = (v: number) =>
    metric === "median_price" ? fmtMoneyShort(v)
      : metric === "sales" ? String(Math.round(v))
      : metric === "median_days" ? `${Math.round(v)} days`
      : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  // Direction is read off the last three COMPLETED months against the three
  // before them, not the two end points: a single quiet month is not a trend.
  const tail = settled.slice(-3).map(([, v]) => v);
  const prev = settled.slice(-6, -3).map(([, v]) => v);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const delta = prev.length ? avg(tail) - avg(prev) : 0;
  const improving = spec.better === "up" ? delta > 0 : delta < 0;
  // "Flat" has to be scaled to the metric. On a median price, half a dollar is
  // not the bar — a 1% drift across three months is noise in a suburb this size.
  const flat = metric === "median_price"
    ? Math.abs(delta) < 0.01 * Math.abs(avg(tail) || 1)
    : Math.abs(delta) < (metric === "sale_vs_cv" ? 0.002 : 0.5);

  const W = 440, H = 92, PAD = 6;
  const vals = known.map(([, v]) => v);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const span = hi - lo || 1;
  const x = (i: number) => PAD + (i / Math.max(1, pts.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);
  const pathOf = (ps: [number, number][]) =>
    ps.map(([i, v], n) => `${n ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  // Solid through the completed months; the run into a part-counted month is
  // dashed, so an incomplete figure never reads as a finished one.
  const hasPartial = partialIdx >= 0 && known.some(([i]) => i === partialIdx);
  const solid = pathOf(hasPartial ? known.slice(0, -1) : known);
  const dashed = hasPartial ? pathOf(known.slice(-2)) : "";
  const last = known[known.length - 1] ?? [0, 0];
  const zeroY = metric === "sale_vs_cv" && lo < 0 && hi > 0 ? y(0) : null;

  return (
    <div className="mt-4 pt-4 border-t border-line/60">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">
          Where the market is heading
        </div>
        <div className="flex gap-1">
          {SERIES.map((x2) => (
            <button key={x2.key} onClick={() => setMetric(x2.key)}
              className={`text-[11px] px-2 py-1 rounded-md font-semibold ${
                metric === x2.key ? "bg-blue text-white" : "text-muted hover:bg-paper"}`}>
              {x2.label}
            </button>
          ))}
        </div>
      </div>

      {/* A suburb median is a mix. A 2-bed unit and a 5-bed villa share a
          postcode and nothing else, so the blended line moves whenever the MIX
          moves, even when neither market did. These pick one out. */}
      {bands.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          <span className="text-[10px] uppercase tracking-wider text-faint font-semibold mr-1">
            Bedrooms
          </span>
          <button onClick={() => setBeds(null)}
            className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${
              beds == null ? "bg-ink text-white border-ink"
                : "border-line text-muted hover:border-blue"}`}>
            All
          </button>
          {bands.map((b) => (
            <button key={b.beds} onClick={() => setBeds(b.beds)}
              title={`${b.sales} sales in the last ${s.monthly.length} months`}
              className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${
                beds === b.beds ? "bg-ink text-white border-ink"
                  : "border-line text-muted hover:border-blue"}`}>
              {b.label.replace(" bed", "")}
            </button>
          ))}
        </div>
      )}

      {thin ? (
        <div className="text-xs text-muted py-6">
          Not enough {picked ? `${picked.label} ` : ""}sales to chart {spec.label.toLowerCase()}
          {picked ? " for this size" : ""}. Try another measure or bedroom count.
        </div>
      ) : (
      <>
      <div className="flex items-baseline gap-2">
        <div className="font-display text-2xl font-bold tabular-nums">{fmtV(last[1])}</div>
        <div className={`text-xs font-semibold ${
          flat ? "text-faint" : improving ? "text-under" : "text-danger"}`}>
          {flat ? "holding steady"
            : `${improving ? "▲" : "▼"} ${improving ? "improving" : "softening"} vs the 3 months before`}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="mt-1 overflow-visible"
           role="img" aria-label={`${spec.label} by month`}>
        {zeroY != null && (
          <line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="#E1E7EF" strokeDasharray="3 3" />
        )}
        <path d={solid} fill="none" stroke={flat ? "#7A8698" : improving ? "#0A8754" : "#D4503E"}
              strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {dashed && (
          <path d={dashed} fill="none" stroke="#7A8698" strokeWidth="2" strokeDasharray="4 4"
                strokeLinejoin="round" strokeLinecap="round" />
        )}
        <circle cx={x(last[0])} cy={y(last[1])} r="3.5"
                fill={hasPartial ? "#fff" : flat ? "#7A8698" : improving ? "#0A8754" : "#D4503E"}
                stroke={hasPartial ? "#7A8698" : "none"} strokeWidth="2" />
      </svg>

      <div className="flex justify-between text-[11px] text-faint">
        <span>{monthShort(pts[0].month)}</span>
        <span>{monthShort(pts[pts.length - 1].month)}{hasPartial && " · part month"}</span>
      </div>
      <div className="text-[11px] text-faint mt-1">
        {spec.label} ·{" "}
        {picked
          ? `${picked.label} homes only · ${picked.sales} sales`
          : "every home sold here"}
        {picked && ". A month with fewer than three sales of this size is left off the line."}
      </div>
      </>
      )}
    </div>
  );
}

function monthShort(m: string): string {
  return new Date(`${m}-01T00:00:00`).toLocaleDateString("en-NZ", { month: "short", year: "2-digit" });
}

/**
 * Which way of selling does best in this suburb.
 *
 * Ranked on sale price against CV, NOT on sale price. Ranking on price would
 * only reveal which method the biggest houses use — in testing, auctions showed
 * a $510k higher median while actually achieving 6 points LESS against CV than
 * private treaty. CV is the one benchmark every sale here shares.
 */
function SalesMethod({ s }: { s: SuburbStats | null }) {
  const rows = s?.by_method ?? [];
  if (!s) return null;

  const best = s.best_method ? METHOD_LABEL[s.best_method] ?? s.best_method : null;
  const pct = (v: number | null | undefined) =>
    v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  return (
    <div className="mt-4 pt-4 border-t border-line/60">
      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">
        Best way to sell here
      </div>

      {best ? (
        <div className="text-sm">
          <span className="font-semibold">{best}</span>
          {s.best_edge_pp != null && s.best_edge_pp >= 0.1 ? (
            <span className="text-muted">
              {" "}achieves <span className="font-semibold text-text">
                {s.best_edge_pp.toFixed(1)} points
              </span>{" "}more against CV than the next best method
            </span>
          ) : (
            <span className="text-muted"> comes out ahead, but only just</span>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted">{s.method_note ?? "Not enough sales to judge"}</div>
      )}

      {rows.length > 0 && (
        <div className="mt-2.5 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-faint">
                <th className="text-left font-medium py-1">Method</th>
                <th className="text-right font-medium py-1">Sales</th>
                <th className="text-right font-medium py-1">vs CV</th>
                <th className="text-right font-medium py-1">Median</th>
                <th className="text-right font-medium py-1">Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const isBest = m.method === s.best_method;
                const thin = m.sales < 5;
                return (
                  <tr key={m.method} className="border-t border-line/50">
                    {/* No marker beside the winning row. The sentence above
                        already names it, the row is already bold and its figure
                        is already green — a filled coloured dot was a fourth
                        way of saying the same thing, and it reads as a status
                        light rather than as a ranking. */}
                    <td className={`py-1.5 ${isBest ? "font-semibold" : ""}`}>
                      {METHOD_LABEL[m.method] ?? m.method}
                    </td>
                    <td className="text-right tabular-nums text-muted">
                      {m.sales}{thin && <span className="text-faint" title="too few to judge"> *</span>}
                    </td>
                    <td className={`text-right tabular-nums font-semibold ${
                      m.median_vs_cv == null ? "text-faint"
                        : m.median_vs_cv >= 0 ? "text-under" : "text-danger"}`}>
                      {pct(m.median_vs_cv)}
                    </td>
                    <td className="text-right tabular-nums text-muted">
                      {m.median_price != null ? fmtMoneyShort(m.median_price) : "—"}
                    </td>
                    <td className="text-right tabular-nums text-muted">
                      {m.median_days != null ? Math.round(m.median_days) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="text-[11px] text-faint mt-2">
            Ranked on price against CV, not on price — CV is the only benchmark every
            sale here shares. Rows marked * have too few sales to judge and are shown
            for context only.
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ k, v, color, sub }: { k: string; v: string; color?: string; sub?: string }) {
  return (
    <div className="border border-line rounded-xl px-3 py-2.5">
      <div className="text-[9.5px] uppercase tracking-wider text-faint font-semibold">{k}</div>
      <div className="font-display text-lg font-bold mt-1" style={color ? { color } : undefined}>{v}</div>
      {sub && <div className="text-[10px] text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

/** The row's sub-line: the range the figure actually sits in, and the sample it
 *  came from. The range is the point of it — a single number invites the reader
 *  to treat "+$55k" as a fact about their house, when what the sales support is
 *  "somewhere around $20k to $90k". */
function basisNote(e?: Effect): string {
  if (!e || e.dollars == null) return "from the sales in this suburb";
  const parts: string[] = [];
  if (e.low != null && e.high != null) {
    parts.push(`likely ${fmtMoneyShort(e.low)}–${fmtMoneyShort(e.high)}`);
  }
  if (e.n_sales) parts.push(`${e.n_sales} sales`);
  return parts.join(" · ") || "from the sales in this suburb";
}

/** True when the interval is so wide that the headline number should not be
 *  leaned on — the sales point in a direction but not to an amount. */
function isConfounded(e?: Effect): boolean {
  if (!e || e.dollars == null || e.low == null || e.high == null) return false;
  return (e.high - e.low) / 2 > Math.abs(e.dollars) * 0.75;
}

function MoveRow({ icon, name, note, value, muted, sub, last, warn }: {
  icon: string; name: string; note: string; value: string | null; muted: string;
  sub?: string; last?: boolean; warn?: boolean;
}) {
  // Stacks below 640px. Side by side inside this card there is about 276px to
  // share, and the value column is flex-none — so it took its ~139px and the
  // text absorbed the entire shortfall, collapsing to its longest word and
  // printing "Add a bedroom" one word per line down the card. Measured: the
  // name went from 77px over two lines to 150px on one.
  return (
    <div className={`flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 ${last ? "" : "border-b border-line/60"}`}>
      <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
        <span className="w-9 h-9 rounded-lg bg-blue/10 text-blue flex items-center justify-center text-base flex-none">{icon}</span>
        <div className="min-w-0">
          <div className="font-medium text-sm">{name}</div>
          <div className={`text-xs truncate ${warn ? "text-danger" : "text-muted"}`}
               title={warn ? "Not size-matched — this figure includes the extra floor area, not just the room" : undefined}>
            {warn && "⚠ "}{note}
          </div>
        </div>
      </div>
      {/* Indented to the text above it on a phone, so the row still reads as
          one item rather than two stacked ones. */}
      <div className="text-left ml-12 sm:ml-0 sm:text-right sm:flex-none">
        {value ? (
          <>
            <div className="font-bold text-base" style={{ color: warn ? "#7A8698" : "#16A34A" }}>{value}</div>
            {sub && <div className="text-xs text-muted">{sub}</div>}
          </>
        ) : (
          <div className="text-xs text-faint">{muted}</div>
        )}
      </div>
    </div>
  );
}
