"use client";

/**
 * Schools for one address — in-zone first, then the closest others.
 *
 * The zone flag is the whole point. "In zone for Blockhouse Bay School and
 * Lynfield College" changes what a family will pay for a house, so it leads,
 * and the rest are there for context rather than as a wall of thirty names.
 */

import { useState } from "react";
import { C, Card, CardTitle, MONO } from "./apex";
import { School, fmtKm, parseSchools } from "@/lib/schools";
import { useT } from "@/lib/i18n";

/** How many out-of-zone schools to show before the "show all" toggle. */
const NEARBY_SHOWN = 5;

function SchoolRow({ s, zone, last }: { s: School; zone: boolean; last: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "9px 0",
        borderBottom: last ? "none" : `1px solid ${C.divider}`,
      }}
    >
      {zone && (
        <span
          aria-hidden
          style={{ color: C.good, fontSize: 13, fontWeight: 800, lineHeight: 1 }}
        >
          ✓
        </span>
      )}
      <span style={{ fontSize: 15, fontWeight: zone ? 700 : 500, flex: 1, minWidth: 0 }}>
        {s.name}
      </span>
      <span
        className="tnum"
        style={{ fontFamily: MONO, fontSize: 13, color: C.label, whiteSpace: "nowrap" }}
      >
        {fmtKm(s.km)}
      </span>
    </div>
  );
}

export default function SchoolsNearby({ raw }: { raw: string | null | undefined }) {
  const { t } = useT();
  const [all, setAll] = useState(false);

  const schools = parseSchools(raw);
  if (schools.length === 0) return null;

  const inZone = schools.filter((s) => s.inZone);
  const others = schools.filter((s) => !s.inZone);
  const shown = all ? others : others.slice(0, NEARBY_SHOWN);

  return (
    <Card style={{ marginTop: 24 }}>
      <CardTitle sub={inZone.length > 0 ? t("prop.schoolsSub") : t("prop.schoolsSubNone")}>
        {t("prop.schools")}
      </CardTitle>

      {inZone.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: C.good,
            }}
          >
            {t("prop.inZone")}
          </div>
          <div style={{ marginTop: 4 }}>
            {inZone.map((s, i) => (
              <SchoolRow key={s.slug || s.name} s={s} zone last={i === inZone.length - 1} />
            ))}
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div style={{ marginTop: inZone.length > 0 ? 18 : 14 }}>
          <div
            style={{
              fontSize: 11,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: C.faint,
            }}
          >
            {t("prop.alsoNearby")}
          </div>
          <div style={{ marginTop: 4 }}>
            {shown.map((s, i) => (
              <SchoolRow key={s.slug || s.name} s={s} zone={false} last={i === shown.length - 1} />
            ))}
          </div>
        </div>
      )}

      {others.length > NEARBY_SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            padding: 0,
            fontSize: 13,
            fontWeight: 700,
            color: C.ink,
            cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          {all ? t("prop.schoolsFewer") : t("prop.schoolsAll", { n: String(others.length) })}
        </button>
      )}
    </Card>
  );
}
