"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import Sparkline from "@/components/Sparkline";
import SuburbTrendChart from "@/components/SuburbTrendChart";
import SuburbTrendsMap from "@/components/SuburbTrendsMap";
import { SuburbTrend, api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

type Effect = { key: string; dollars: number | null; days: number | null; note: string | null };
type SuburbStats = {
  suburb: string; active_listings: number; median_asking: number | null;
  sold_count: number; median_sold: number | null; median_ppm2: number | null;
  median_days: number | null; sale_vs_cv: number | null; effects: Effect[];
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
        <StatTile k="$ / m² floor" v={money(s?.median_ppm2)} />
        <StatTile k="Median days to sell" v={s?.median_days != null ? String(Math.round(s.median_days)) : "—"} />
        <StatTile k="Sale vs CV" v={s?.sale_vs_cv != null ? `${s.sale_vs_cv >= 0 ? "+" : ""}${(s.sale_vs_cv * 100).toFixed(1)}%` : "—"}
          color={s?.sale_vs_cv != null ? (s.sale_vs_cv >= 0 ? "#16A34A" : "#DC2626") : undefined} />
      </div>

      <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mt-5 mb-1">What moves value here</div>
      <MoveRow icon="＋🛏" name="Add a bedroom" note="vs the typical home sold here"
        value={bed?.dollars != null ? `+${money(bed.dollars)}` : null} muted={bed?.note ?? "measuring…"} />
      <MoveRow icon="＋🛁" name="Add a bathroom" note="marginal value + time on market"
        value={bath?.dollars != null ? `+${money(bath.dollars)}` : null}
        muted={bath?.note ?? "measuring…"}
        sub={bath?.days != null ? `sells ~${Math.abs(Math.round(bath.days))} days ${bath.days < 0 ? "faster" : "slower"}` : undefined}
        last />
      <div className="text-[11px] text-faint mt-3">Effects are measured from actual sales in this suburb — shown only when there are enough to be meaningful.</div>

      {trend && trend.filter((v) => v != null && v > 0).length >= 2 && (
        <div className="mt-4 pt-4 border-t border-line/60">
          <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-2">Median asking · recent snapshots</div>
          <Sparkline values={trend} width={440} height={64} color="#2E353D" />
        </div>
      )}
    </div>
  );
}

function StatTile({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="border border-line rounded-xl px-3 py-2.5">
      <div className="text-[9.5px] uppercase tracking-wider text-faint font-semibold">{k}</div>
      <div className="font-display text-lg font-bold mt-1" style={color ? { color } : undefined}>{v}</div>
    </div>
  );
}

function MoveRow({ icon, name, note, value, muted, sub, last }: {
  icon: string; name: string; note: string; value: string | null; muted: string; sub?: string; last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${last ? "" : "border-b border-line/60"}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-9 h-9 rounded-lg bg-blue/10 text-blue flex items-center justify-center text-base flex-none">{icon}</span>
        <div className="min-w-0">
          <div className="font-medium text-sm">{name}</div>
          <div className="text-xs text-muted truncate">{note}</div>
        </div>
      </div>
      <div className="text-right flex-none">
        {value ? (
          <>
            <div className="font-bold text-base" style={{ color: "#16A34A" }}>{value}</div>
            {sub && <div className="text-xs text-muted">{sub}</div>}
          </>
        ) : (
          <div className="text-xs text-faint">{muted}</div>
        )}
      </div>
    </div>
  );
}
