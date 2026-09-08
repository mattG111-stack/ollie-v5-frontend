"use client";

import { useEffect, useState } from "react";
import { DistrictValueAdd, api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { C, Card, CardTitle, MONO, Note } from "./apex";

/**
 * Renovation uplift per district — every district on screen at once.
 *
 * Drawn with plain CSS rather than Recharts. Two attempts with <BarChart
 * layout="vertical"> misrendered: `barSize` scaled the VALUE axis (bars came out
 * 14x too short, matching barSize exactly), and switching to `maxBarSize` with
 * nulls in the series dropped every bar. For seven rows of two numbers a div
 * with a percentage width is predictable and has no version risk.
 *
 * Each comparison is size-controlled AND holds the other room count constant:
 * the bathroom bar compares 1-bath against 2-bath houses with the SAME bedrooms
 * and floor area, otherwise it quietly measures bedrooms as well.
 *
 * Pool is off by default and muted when shown. It survives every control we
 * have — size, bedrooms, land — so it measures the calibre of house that has a
 * pool, not the pool, and must not sit beside the two real estimates as an equal.
 */

// Clean solid fills — emerald for the bedroom uplift (money-positive), a calm
// slate for the bathroom, muted grey for pool. Solid reads more premium here
// than a glossy gradient.
const STYLE = {
  bedroom: { swatch: "#0E9E6E", bar: "#0E9E6E" },
  bathroom: { swatch: "#64748B", bar: "#64748B" },
  pool: { swatch: "#CBD5E1", bar: "#CBD5E1" },
} as const;

export default function ValueAddDistricts() {
  const { t } = useT();
  const [rows, setRows] = useState<DistrictValueAdd[] | null>(null);
  const [showPool, setShowPool] = useState(false);

  useEffect(() => {
    api<DistrictValueAdd[]>("/api/dashboards/value-add-by-district")
      .then(setRows)
      .catch(() => null);
  }, []);

  if (!rows || rows.length === 0) return null;

  const series: { key: "bedroom" | "bathroom" | "pool"; cellKey: "bedroom_cells" | "bathroom_cells" | "pool_cells"; label: string; swatch: string; bar: string }[] = [
    { key: "bedroom", cellKey: "bedroom_cells", label: t("vad.bedroom"), ...STYLE.bedroom },
    { key: "bathroom", cellKey: "bathroom_cells", label: t("vad.bathroom"), ...STYLE.bathroom },
    ...(showPool
      ? ([{ key: "pool", cellKey: "pool_cells", label: t("vad.poolShort"), ...STYLE.pool }] as const)
      : []),
  ];

  // Scale to the largest visible value so the longest bar fills the track.
  const max = Math.max(
    ...rows.flatMap((r) => series.map((s) => (r[s.key] ?? 0) * 100)),
    1,
  );

  return (
    <Card style={{ marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
  <CardTitle sub={t("vad.sub")}>{t("vad.title")}</CardTitle>
        <button
          onClick={() => setShowPool((v) => !v)}
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 600,
            background: showPool ? C.accent : C.chipBg,
            color: showPool ? "#fff" : "#6E7C90",
            border: `1px solid ${showPool ? C.accent : C.border}`,
            borderRadius: 8,
            padding: "7px 12px",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {showPool ? t("vad.hidePool") : t("vad.showPool")}
        </button>
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap" }}>
        {series.map((s) => (
          <span
            key={s.key}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.label }}
          >
            <span style={{ width: 11, height: 11, borderRadius: 3, background: s.swatch }} />
            {s.label}
            {s.key === "pool" && ` — ${t("vad.poolSuffix")}`}
          </span>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {rows.map((r, i) => (
          <div
            key={r.district}
            style={{
              display: "grid",
              gridTemplateColumns: "112px minmax(0,1fr)",
              gap: 14,
              alignItems: "center",
              padding: "11px 0",
              borderBottom: i === rows.length - 1 ? undefined : `1px solid ${C.divider}`,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.district.replace(" City", "")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {series.map((s) => {
                const pct = r[s.key];
                const cells = r[s.cellKey];
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div
                      style={{
                        flex: 1,
                        height: 16,
                        background: C.chipBg,
                        borderRadius: 9,
                        overflow: "hidden",
                        minWidth: 0,
                        boxShadow: "inset 0 1px 2px rgba(20,35,58,.06)",
                      }}
                    >
                      {pct != null && pct > 0 && (
                        <div
                          title={`${s.label}: ${(pct * 100).toFixed(1)}% from ${cells} comparisons`}
                          style={{
                            // Floor at 3% so a small-but-real uplift still shows a sliver.
                            width: `${Math.max((pct * 100) / max * 100, 3)}%`,
                            height: "100%",
                            background: s.bar,
                            borderRadius: 8,
                            transition: "width .7s cubic-bezier(.2,.8,.2,1)",
                          }}
                        />
                      )}
                    </div>
                    <span
                      className="tnum"
                      style={{
                        width: 54,
                        flexShrink: 0,
                        textAlign: "right",
                        fontSize: 13.5,
                        fontWeight: 800,
                        letterSpacing: "-.01em",
                        color: pct == null ? C.faint : (pct ?? 0) <= 0 ? C.faint : s.key === "pool" ? C.label : C.ink,
                      }}
                    >
                      {pct == null ? "—" : `${pct > 0 ? "+" : ""}${(pct * 100).toFixed(1)}%`}
                    </span>
                    <span
                      style={{
                        width: 30,
                        flexShrink: 0,
                        fontFamily: MONO,
                        fontSize: 10,
                        color: C.mono,
                        textAlign: "right",
                      }}
                      title={`${cells} matched comparisons`}
                    >
                      {cells}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Note>{t("vad.note")}</Note>
    </Card>
  );
}
