"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Sparkline from "@/components/Sparkline";
import SuburbTrendChart from "@/components/SuburbTrendChart";
import SuburbTrendsMap from "@/components/SuburbTrendsMap";
import { SuburbTrend, api } from "@/lib/api";
import { fmtMoney, fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

type Effect = {
  key: string; dollars: number | null; days: number | null; note: string | null;
  /** How strictly the comparison was matched. Anything below like-for-like is
   *  measuring more than the room, so the figure carries a caveat. */
  basis?: string | null;
  /** Median floor-area gap between the two groups compared. Near zero means the
   *  room really was the only difference. */
  floor_gap_m2?: number | null;
  cells?: number | null;
};
type MethodResult = {
  method: string; sales: number; median_price: number | null;
  median_vs_cv: number | null; median_days: number | null;
};

type MonthPoint = {
  month: string; sales: number; median_days: number | null;
  sale_vs_cv: number | null; median_price: number | null;
};

type SuburbStats = {
  suburb: string; active_listings: number; median_asking: number | null;
  sold_count: number; median_sold: number | null; median_ppm2: number | null;
  sales_this_month: number; latest_month: string | null; current_month: string | null;
  monthly: MonthPoint[];
  median_days: number | null; sale_vs_cv: number | null; effects: Effect[];
  by_method: MethodResult[];
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
          <SuburbSearch value={suburb} onPick={setSuburb} placeholder={t("trends.typeSuburb")} />
          <span className="text-xs text-muted">{t("trends.orPick")}</span>
          {POPULAR_SUBURBS.map((s) => (
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
          {data.long_term_yearly_json || data.long_term_monthly_json ? (
            <SuburbTrendChart
              yearly={data.long_term_yearly_json}
              monthly={data.long_term_monthly_json}
              suburb={data.suburb}
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

function SuburbSearch({ value, onPick, placeholder }: { value: string; onPick: (s: string) => void; placeholder?: string }) {
  const [q, setQ] = useState(value);
  const [items, setItems] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value); }, [value]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); setOpen(false); return; }
    let alive = true;
    const h = setTimeout(() => {
      api<{ kind: string; label: string }[]>(`/api/properties/suggest?q=${encodeURIComponent(term)}`)
        .then((r) => {
          if (!alive) return;
          const subs = Array.from(new Set(r.filter((x) => x.kind === "suburb").map((x) => x.label)));
          setItems(subs); setOpen(subs.length > 0);
        })
        .catch(() => {});
    }, 150);
    return () => { alive = false; clearTimeout(h); };
  }, [q]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(s: string) { onPick(s); setQ(s); setOpen(false); }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (items[0]) pick(items[0]); else if (q.trim()) onPick(q.trim()); } if (e.key === "Escape") setOpen(false); }}
        placeholder={placeholder}
        className="bg-paper border border-line rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:border-blue"
      />
      {open && items.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 40, minWidth: 220, background: "#fff", border: "1px solid #E4E9F0", borderRadius: 10, boxShadow: "0 12px 30px -12px rgba(16,24,40,.28)", overflow: "hidden" }}>
          {items.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-paper"
              style={{ border: "none", background: "transparent", cursor: "pointer" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SuburbStatsPanel({ suburb, trend }: { suburb: string; trend?: number[] }) {
  const [s, setS] = useState<SuburbStats | null>(null);
  useEffect(() => {
    if (!suburb) return;
    let alive = true;
    api<SuburbStats>(`/api/properties/suburb-stats?suburb=${encodeURIComponent(suburb)}`)
      .then((r) => { if (alive) setS(r); })
      .catch(() => { if (alive) setS(null); });
    return () => { alive = false; };
  }, [suburb]);

  const money = (n: number | null | undefined) => (n == null ? "—" : fmtMoneyShort(n));
  const bed = s?.effects.find((e) => e.key === "bedroom");
  const bath = s?.effects.find((e) => e.key === "bathroom");

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5 flex flex-col">
      <div className="text-[11px] uppercase tracking-wider text-faint font-semibold">{suburb}</div>
      <div className="font-display text-3xl font-bold mt-0.5">{money(s?.median_sold ?? s?.median_asking)}</div>
      <div className="text-xs text-muted mt-0.5">
        {s ? `median ${s.median_sold != null ? "sold" : "asking"} · ${s.active_listings} live · ${s.sold_count} sold` : "…"}
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
        value={bed?.dollars != null ? `+${money(bed.dollars)}` : null} muted={bed?.note ?? "measuring…"}
        warn={isConfounded(bed)} />
      <MoveRow icon="＋🛁" name="Add a bathroom" note={basisNote(bath)}
        value={bath?.dollars != null ? `+${money(bath.dollars)}` : null}
        muted={bath?.note ?? "measuring…"}
        sub={bath?.days != null ? `sells ~${Math.abs(Math.round(bath.days))} days ${bath.days < 0 ? "faster" : "slower"}` : undefined}
        warn={isConfounded(bath)}
        last />
      <div className="text-[11px] text-faint mt-3">
        Measured from actual sales in this suburb, comparing homes of the same type,
        the same size and the same count of the other room — so the figure is the
        room, not the extra floor area that usually comes with it.
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

const SERIES = [
  { key: "sales", label: "Sales", better: "up" },
  { key: "median_days", label: "Days to sell", better: "down" },
  { key: "sale_vs_cv", label: "vs CV", better: "up" },
] as const;

/**
 * The three metrics over the last 13 months.
 *
 * Thirteen, not twelve, so the same month last year sits on the chart. This
 * market is seasonal enough that a 12-month window makes every December look
 * like a downturn, and "is it getting better or worse" is exactly the question
 * that gets answered wrong by comparing a quiet month to a busy one.
 */
function MarketDirection({ s }: { s: SuburbStats | null }) {
  const [metric, setMetric] = useState<(typeof SERIES)[number]["key"]>("sales");
  const pts = s?.monthly ?? [];
  const spec = SERIES.find((x) => x.key === metric)!;
  if (!s || pts.length < 3) return null;

  const raw = pts.map((p) => (metric === "sales" ? p.sales : p[metric]));
  const known = raw.map((v, i) => [i, v] as const).filter(([, v]) => v != null) as [number, number][];
  if (known.length < 3) return null;

  // The current month is only part-counted, so it must not drive the verdict:
  // three sales into August against twelve in a finished month reads as a
  // collapse every time, in a market that has not moved. It stays ON the chart —
  // it is real — but drawn as partial and left out of the comparison.
  const partialIdx = s.current_month ? pts.findIndex((p) => p.month === s.current_month) : -1;
  const settled = known.filter(([i]) => i !== partialIdx);

  const fmtV = (v: number) =>
    metric === "sales" ? String(Math.round(v))
      : metric === "median_days" ? `${Math.round(v)} days`
      : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

  // Direction is read off the last three COMPLETED months against the three
  // before them, not the two end points: a single quiet month is not a trend.
  const tail = settled.slice(-3).map(([, v]) => v);
  const prev = settled.slice(-6, -3).map(([, v]) => v);
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const delta = prev.length ? avg(tail) - avg(prev) : 0;
  const improving = spec.better === "up" ? delta > 0 : delta < 0;
  const flat = Math.abs(delta) < (metric === "sale_vs_cv" ? 0.002 : metric === "sales" ? 0.5 : 0.5);

  const W = 440, H = 92, PAD = 6;
  const vals = known.map(([, v]) => v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
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
  const last = known[known.length - 1];
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
                    <td className={`py-1.5 ${isBest ? "font-semibold" : ""}`}>
                      {isBest && <span className="text-under mr-1">●</span>}
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

/** What the row's sub-line should say about how the figure was measured. */
function basisNote(e?: Effect): string {
  if (!e || e.dollars == null) return "vs the typical home sold here";
  const gap = e.floor_gap_m2;
  switch (e.basis) {
    case "like-for-like":
      return `same type, same size, same other rooms${e.cells ? ` · ${e.cells} matched group${e.cells === 1 ? "" : "s"}` : ""}`;
    case "same size":
      return "same type and size — other rooms not matched";
    case "same type":
      return gap != null && Math.abs(gap) >= 10
        ? `not size-matched · those homes are ${Math.round(Math.abs(gap))} m² ${gap > 0 ? "bigger" : "smaller"}`
        : "same type only — size not matched";
    default:
      return gap != null && Math.abs(gap) >= 10
        ? `unadjusted · those homes are ${Math.round(Math.abs(gap))} m² ${gap > 0 ? "bigger" : "smaller"}`
        : "unadjusted — includes other differences";
  }
}

/** True when the comparison could not be size-matched, so the number is carrying
 *  the value of extra floor area as well as the room. Worth flagging rather than
 *  presenting with the same confidence as a matched read. */
function isConfounded(e?: Effect): boolean {
  if (!e || e.dollars == null) return false;
  if (e.basis === "like-for-like" || e.basis === "same size") return false;
  return (e.floor_gap_m2 ?? 0) >= 10;
}

function MoveRow({ icon, name, note, value, muted, sub, last, warn }: {
  icon: string; name: string; note: string; value: string | null; muted: string;
  sub?: string; last?: boolean; warn?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${last ? "" : "border-b border-line/60"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-lg bg-blue/10 text-blue flex items-center justify-center text-base flex-none">{icon}</span>
        <div className="min-w-0">
          <div className="font-medium text-sm">{name}</div>
          <div className={`text-xs truncate ${warn ? "text-danger" : "text-muted"}`}
               title={warn ? "Not size-matched — this figure includes the extra floor area, not just the room" : undefined}>
            {warn && "⚠ "}{note}
          </div>
        </div>
      </div>
      <div className="text-right flex-none">
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
