"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Sparkline from "@/components/Sparkline";
import SuburbTrendChart from "@/components/SuburbTrendChart";
import { SuburbTrend, api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

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
          <input
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            placeholder={t("trends.typeSuburb")}
            className="bg-paper border border-line rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:border-blue"
          />
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
                      <Sparkline values={data.points.map((p) => p.median_asking)} width={400} height={70} color="#2E7DF6" />
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
