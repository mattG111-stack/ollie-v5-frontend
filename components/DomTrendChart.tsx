"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

/**
 * How long homes are taking to sell in an area, month by month.
 *
 * A single average hides the direction of travel: 40 days reads as reassuring
 * if last quarter was 60, and as a warning if it was 25. Date on x, days on y.
 *
 * Months with few sales are returned but flagged is_thin — a median over two
 * sales is noise. Those render as hollow points and are excluded from the
 * headline comparison, so the chart cannot imply a trend the data has not
 * earned.
 */

type Point = {
  period: string;
  median_days: number | null;   // null = no sales that month → a gap in the line
  sales: number;
  region_median_days: number | null;
  is_thin: boolean;
};

type Trend = {
  suburb: string | null;
  points: Point[];
  current_median_days: number | null;
  prior_median_days: number | null;
  change_days: number | null;
  region_median_days: number | null;
  total_sales: number;
};

const C = {
  line: "#33455E", region: "#B0B0C8", grid: "#EDF1F6",
  label: "#5A6B82", faint: "#7A8698", good: "#22C55E", bad: "#EF4444",
};

const fmtPeriod = (p: string) => {
  const [y, m] = p.split("-");
  return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m]} ${y.slice(2)}`;
};

export default function DomTrendChart({
  suburb,
  months = 72,
}: {
  suburb?: string | null;
  months?: number;
}) {
  const { t } = useT();
  const [d, setD] = useState<Trend | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ months: String(months) });
    if (suburb) qs.set("suburb", suburb);
    api<Trend>(`/api/dashboards/dom-trend?${qs}`)
      .then(setD)
      .catch((e) => setErr(e?.detail || e?.message || t("dom.couldNot")));
  }, [suburb, months]);

  if (err) return <div className="text-xs text-danger">{err}</div>;
  if (!d) return <div className="text-xs text-muted">{t("dom.loading")}</div>;
  if (d.points.length < 2)
    return <div className="text-xs text-muted">{t("dom.notEnough")}</div>;

  const chg = d.change_days;
  // Fewer days = selling faster = a strengthening market.
  const faster = chg != null && chg < 0;
  const data = d.points.map((p) => ({ ...p, label: fmtPeriod(p.period) }));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-1">
        <div>
          <span className="font-display text-2xl font-bold">
            {d.current_median_days != null ? `${Math.round(d.current_median_days)} ${t("dom.daysUnit")}` : "—"}
          </span>
          <span className="text-xs text-muted ml-2">
            {d.suburb ? t("dom.medianToSellIn", { suburb: d.suburb }) : t("dom.medianToSellAk")}
          </span>
        </div>
        {chg != null && (
          <div className="text-xs" style={{ color: faster ? C.good : C.bad }}>
            {faster ? "▼" : "▲"} {Math.abs(chg).toFixed(0)} {t("dom.daysUnit")}{" "}
            {faster ? t("dom.faster") : t("dom.slower")}
          </div>
        )}
      </div>
      <div className="text-[11px] text-faint mb-3">
        {t("dom.salesCount", { n: (d.total_sales ?? 0).toLocaleString() })}
        {d.region_median_days != null && d.suburb
          ? ` · ${t("dom.akMedianDays", { n: Math.round(d.region_median_days) })}`
          : ""}
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 6, right: 10, bottom: 4, left: -18 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: C.faint }}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            minTickGap={12}
          />
          <YAxis
            tick={{ fontSize: 11, fill: C.faint }}
            tickLine={false}
            axisLine={false}
            width={46}
            label={{ value: t("dom.daysUnit"), angle: -90, position: "insideLeft",
                     style: { fontSize: 10, fill: C.faint }, offset: 26 }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #E1E7EF" }}
            formatter={(v, name, item: any) => [
              `${v} ${t("dom.daysUnit")}${item?.payload?.is_thin ? `  (${t("dom.onlySales", { n: item.payload.sales })})` : ""}`,
              name === "median_days" ? (d.suburb ?? t("dom.auckland")) : t("dom.auckland"),
            ]}
          />
          {d.region_median_days != null && (
            <ReferenceLine
              y={d.region_median_days}
              stroke={C.region}
              strokeDasharray="4 4"
              label={{ value: t("dom.aucklandAvg"), position: "right",
                       style: { fontSize: 10, fill: C.faint } }}
            />
          )}
          {d.suburb && (
            <Line type="monotone" dataKey="region_median_days" stroke={C.region}
                  strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
          )}
          <Line
            type="monotone"
            dataKey="median_days"
            stroke={C.line}
            strokeWidth={2.5}
            connectNulls={false}
            dot={(props: any) => {
              const { cx, cy, payload, index } = props;
              // No sale that month → no dot; the line breaks over the gap.
              if (payload.median_days == null || cx == null || cy == null) {
                return <g key={index} />;
              }
              // Hollow dot where the month is too thin to trust.
              return (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={payload.is_thin ? 3 : 4}
                  fill={payload.is_thin ? "#fff" : C.line}
                  stroke={C.line}
                  strokeWidth={payload.is_thin ? 1.5 : 0}
                />
              );
            }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="text-[11px] text-faint mt-1">
        {t("dom.hollowNote")}
      </div>
    </div>
  );
}
