"use client";

import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface YearlyPoint {
  year: number;
  median: number;
  count: number;
  change_pct: number;
}

interface MonthlyPoint {
  time?: number;
  month: string; // "May,2026"
  median: number;
  count: number;
  change: number;
}

interface Props {
  yearly?: string | null;
  monthly?: string | null;
  suburb?: string | null;
}

function parseYearly(raw: string | null | undefined): YearlyPoint[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const points = data.points || [];
    return points
      .map((p: any) => ({
        year: Number(p.year),
        median: Number(p.median),
        count: Number(p.count || 0),
        change_pct: Number(p.change_pct ?? p.change ?? 0),
      }))
      .filter((p: YearlyPoint) => p.year && p.median > 0)
      .sort((a: YearlyPoint, b: YearlyPoint) => a.year - b.year);
  } catch {
    return [];
  }
}

function parseMonthly(raw: string | null | undefined): MonthlyPoint[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const points = data.points || [];
    return points
      .map((p: any) => ({
        time: Number(p.time || 0),
        month: String(p.month || ""),
        median: Number(p.median),
        count: Number(p.count || 0),
        change: Number(p.change ?? p.change_pct ?? 0),
      }))
      .filter((p: MonthlyPoint) => p.month && p.median > 0)
      .sort((a: MonthlyPoint, b: MonthlyPoint) => (a.time || 0) - (b.time || 0));
  } catch {
    return [];
  }
}

const nzdShort = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${(v / 1_000).toFixed(0)}k`;

export default function SuburbTrendChart({ yearly, monthly, suburb }: Props) {
  const { t } = useT();
  const yearlyData = useMemo(() => parseYearly(yearly), [yearly]);
  const monthlyData = useMemo(() => parseMonthly(monthly), [monthly]);

  // Yearly first: the monthly series is noisy enough that the direction of the
  // market is hard to read, which is what this chart is for.
  const defaultMode: "yearly" | "monthly" =
    yearlyData.length > 1 ? "yearly" : "monthly";
  const [mode, setMode] = useState<"yearly" | "monthly">(defaultMode);

  const data = mode === "yearly"
    ? yearlyData.map((p) => ({ label: String(p.year), median: p.median, count: p.count, change: p.change_pct }))
    : monthlyData.map((p) => ({ label: p.month, median: p.median, count: p.count, change: p.change }));

  if (data.length === 0) return null;

  const hasYearly = yearlyData.length > 1;
  const hasMonthly = monthlyData.length > 1;

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5 mt-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <h3 className="font-display font-semibold text-sm">
          {t("strend.title", { suburb: suburb ?? "" })}
        </h3>
        <div className="inline-flex bg-paper border border-line rounded-lg p-1">
          {hasYearly && (
            <button
              onClick={() => setMode("yearly")}
              className={`text-xs font-semibold px-3 py-1 rounded ${
                mode === "yearly" ? "bg-blue text-white" : "text-muted hover:text-text"
              }`}
            >
              {t("strend.yearly", { n: yearlyData.length })}
            </button>
          )}
          {hasMonthly && (
            <button
              onClick={() => setMode("monthly")}
              className={`text-xs font-semibold px-3 py-1 rounded ${
                mode === "monthly" ? "bg-blue text-white" : "text-muted hover:text-text"
              }`}
            >
              {t("strend.monthly", { n: monthlyData.length })}
            </button>
          )}
        </div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2E7DF6" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#2E7DF6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#EEF2F8" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#8A98AD", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#E4EAF2" }}
              interval={mode === "monthly" && data.length > 12 ? Math.floor(data.length / 8) : 0}
            />
            <YAxis
              tick={{ fill: "#8A98AD", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#E4EAF2" }}
              tickFormatter={nzdShort}
              width={56}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#2E7DF6", strokeWidth: 1, strokeDasharray: "3 3" }} />
            <Area
              type="monotone"
              dataKey="median"
              stroke="#2E7DF6"
              strokeWidth={2.5}
              fill="url(#trendFill)"
              dot={{ r: 3, fill: "#2E7DF6", strokeWidth: 0 }}
              activeDot={{ r: 6, fill: "#2E7DF6", stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[11px] text-faint mt-2">
        {t("strend.source")}
      </div>
    </div>
  );
}

function TrendTooltip({ active, payload }: any) {
  const { t } = useT();
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload as { label: string; median: number; count: number; change: number };
  const changeColor = p.change > 0 ? "#0A8754" : p.change < 0 ? "#D4503E" : "#5A6B85";
  return (
    <div className="bg-white border border-line rounded-lg shadow-soft px-3 py-2 text-xs min-w-[150px]">
      <div className="font-display font-semibold text-sm">{p.label}</div>
      <div className="mt-1 flex justify-between gap-3">
        <span className="text-muted">{t("strend.medianSale")}</span>
        <span className="font-display font-bold text-text">{nzdShort(p.median)}</span>
      </div>
      <div className="flex justify-between gap-3">
        <span className="text-muted">{t("strend.sales")}</span>
        <span className="font-medium">{(p.count ?? 0).toLocaleString()}</span>
      </div>
      {p.change !== 0 && (
        <div className="flex justify-between gap-3">
          <span className="text-muted">{t("strend.change")}</span>
          <span className="font-semibold" style={{ color: changeColor }}>
            {p.change > 0 ? "+" : ""}
            {p.change.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
