"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n";
import { useIsMobile } from "./AppShell";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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
  /** The year in progress: a real median, but drawn from part of a year. */
  partial: boolean;
  through_month: number | null;
}

interface Props {
  yearly?: string | null;
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
        partial: Boolean(p.partial),
        through_month: p.through_month != null ? Number(p.through_month) : null,
      }))
      .filter((p: YearlyPoint) => p.year && p.median > 0)
      .sort((a: YearlyPoint, b: YearlyPoint) => a.year - b.year);
  } catch {
    return [];
  }
}

const nzdShort = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(2)}M` : `$${(v / 1_000).toFixed(0)}k`;

const MONTHS = ["January", "February", "March", "April", "May", "June",
                "July", "August", "September", "October", "November", "December"];

const UP = "#0A8754";
const DOWN = "#D4503E";
const FLAT = "#5A6B85";
/** Thirty years of history is history, not news. It is drawn in ink; only the
 *  step into the year in progress carries a colour, so red or green on this
 *  chart means one thing and means it about now. */
const INK = "#2E353D";

export default function SuburbTrendChart({ yearly, suburb }: Props) {
  const isMobile = useIsMobile();
  const { t } = useT();
  const yearlyData = useMemo(() => parseYearly(yearly), [yearly]);

  // Monthly is gone. A suburb sells a handful of homes a month, so the monthly
  // line moved on which homes happened to sell rather than on the market, and
  // a chart that swings 30% between two points reads as a system that does not
  // know what it is doing. Years hold enough sales to be a median.
  if (yearlyData.length < 2) return null;

  const last = yearlyData[yearlyData.length - 1];
  const prev = yearlyData[yearlyData.length - 2];
  // The one thing this chart is for: is this year above last year or below it.
  const dir = last.median > prev.median ? 1 : last.median < prev.median ? -1 : 0;
  const colour = dir > 0 ? UP : dir < 0 ? DOWN : FLAT;

  // A dashed final step when the last point is the year in progress, so the
  // predictor is visibly a different kind of point from the finished years.
  // The backend flags it from the newest sale it holds; a backend that has not
  // been redeployed yet sends no flag, so the calendar answers instead — the
  // current year is by definition not finished.
  const partialTail = last.partial || last.year >= new Date().getFullYear();
  const rows = yearlyData.map((p, i) => {
    const isTail = partialTail && i === yearlyData.length - 1;
    return {
      label: String(p.year),
      median: p.median,
      count: p.count,
      change: p.change_pct,
      partial: p.partial,
      through_month: p.through_month,
      // Two overlaid lines: the finished years solid, the step into the year
      // in progress dashed. They share the last firm point so there is no gap.
      firm: isTail ? null : p.median,
      soFar: partialTail && i >= yearlyData.length - 2 ? p.median : null,
    };
  });

  const fillId = "trendFillInk";

  // Anchored at zero, a 5% year is a flat line and the reader has only the
  // colour to go on. Padded around the data instead — enough to see the shape,
  // not so little that a 1% wobble fills the panel.
  const meds = yearlyData.map((p) => p.median);
  const lo = Math.min(...meds);
  const hi = Math.max(...meds);
  const pad = Math.max((hi - lo) * 0.35, hi * 0.04);
  const domain: [number, number] = [Math.max(0, lo - pad), hi + pad];

  // The dashed line starts on the last finished year, which the solid line has
  // already marked. Drawing both put two dots on one point, and the hollow one
  // read as a data point of its own.
  const tailDot = (props: any) => {
    const { cx, cy, index, key } = props;
    if (index !== rows.length - 1 || cx == null || cy == null) {
      return <g key={key ?? `tail-${index}`} />;
    }
    return (
      <circle key={key ?? `tail-${index}`} cx={cx} cy={cy} r={4.5}
              fill="#fff" stroke={colour} strokeWidth={2} />
    );
  };

  const changeLabel = `${last.change_pct > 0 ? "+" : ""}${last.change_pct.toFixed(1)}%`;
  const throughMonth =
    last.through_month && MONTHS[last.through_month - 1]
      ? MONTHS[last.through_month - 1]
      : null;

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5 mt-5">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-3">
        <h3 className="font-display font-semibold text-sm min-w-0">
          {t("strend.title", { suburb: suburb ?? "" })}
        </h3>
        <div
          className="inline-flex items-baseline gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
          style={{ color: colour, background: `${colour}14` }}
        >
          <span aria-hidden>{dir > 0 ? "▲" : dir < 0 ? "▼" : "■"}</span>
          <span>{changeLabel}</span>
          <span className="font-normal opacity-80">
            {t("strend.vsYear", { year: String(prev.year) })}
          </span>
        </div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 10, right: 24, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INK} stopOpacity={0.16} />
                <stop offset="100%" stopColor={INK} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#EEF2F8" vertical={false} />
            {/* Let the chart drop labels that would collide rather than
                deciding a count up front. minTickGap is the width each label is
                guaranteed; preserveStartEnd keeps the first and last, which are
                the two a reader actually looks for. */}
            <XAxis
              dataKey="label"
              tick={{ fill: "#8A98AD", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#E4EAF2" }}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 34 : 24}
            />
            <YAxis
              tick={{ fill: "#8A98AD", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#E4EAF2" }}
              tickFormatter={nzdShort}
              domain={domain}
              width={56}
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ stroke: INK, strokeWidth: 1, strokeDasharray: "3 3" }}
            />
            <Area
              type="linear"
              dataKey="median"
              stroke="none"
              fill={`url(#${fillId})`}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="firm"
              stroke={INK}
              strokeWidth={2.5}
              dot={{ r: 3, fill: INK, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: INK, stroke: "#fff", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            {partialTail && (
              <Line
                type="linear"
                dataKey="soFar"
                stroke={colour}
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={tailDot}
                activeDot={{ r: 6, fill: colour, stroke: "#fff", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[11px] text-faint mt-2">
        {/* A fact about the market, not an account of how the chart is built:
            what this year has done so far, and how much it rests on. */}
        {!partialTail
          ? t("strend.source")
          : throughMonth
            ? t("strend.soFarTo", {
                year: String(last.year),
                n: last.count.toLocaleString(),
                month: throughMonth,
              })
            : t("strend.soFarPlain", {
                year: String(last.year),
                n: last.count.toLocaleString(),
              })}
      </div>
    </div>
  );
}

function TrendTooltip({ active, payload }: any) {
  const { t } = useT();
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload as {
    label: string; median: number; count: number; change: number;
    partial?: boolean; through_month?: number | null;
  };
  const changeColor = p.change > 0 ? UP : p.change < 0 ? DOWN : FLAT;
  const month = p.through_month && MONTHS[p.through_month - 1];
  return (
    <div className="bg-white border border-line rounded-lg shadow-soft px-3 py-2 text-xs min-w-[150px]">
      <div className="font-display font-semibold text-sm">
        {p.label}
        {p.partial && (
          <span className="ml-1.5 font-sans font-normal text-[11px] text-muted">
            {month ? t("strend.through", { month }) : t("strend.soFar")}
          </span>
        )}
      </div>
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
