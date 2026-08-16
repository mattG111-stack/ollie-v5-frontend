"use client";

import { useEffect, useState } from "react";
import { ValueAddResponse, api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { C, Card, CardTitle, Eyebrow, MONO, Note } from "./apex";

/** Translate the backend-generated label/scope/caveat strings client-side.
 *  The API has no notion of the viewer's language, so the fixed grammar of
 *  these strings is re-expressed here rather than duplicating i18n server-side. */
function useValueAddText() {
  const { t } = useT();
  const label = (raw: string) => {
    const bed = raw.match(/^Add a (\d+)\w+ bedroom$/);
    if (bed) return t("va.addBedroom", { n: bed[1] });
    const bath = raw.match(/^Add a (\d+)\w+ bathroom$/);
    if (bath) return t("va.addBathroom", { n: bath[1] });
    if (raw === "Houses here with a pool sell for") return t("va.poolLabel");
    return raw;
  };
  const scope = (raw: string) =>
    raw === "suburb" ? t("va.scopeSuburb")
      : raw === "district" ? t("va.scopeDistrict")
      : raw === "auckland" ? t("va.scopeAuckland")
      : raw;
  const caveat = (raw: string | null | undefined) => {
    if (!raw) return raw;
    if (raw.startsWith("Measured at 0% Auckland-wide")) return t("va.caveatBathroom");
    if (raw.startsWith("This is the gap between houses that have a pool")) return t("va.caveatPool");
    return raw;
  };
  return { t, label, scope, caveat };
}

/**
 * What a renovation adds, from size-controlled sold comparisons.
 *
 * The uplifts are measured against houses of the SAME floor area, which is the
 * whole point: comparing 3-bed and 4-bed sale prices unadjusted gives +24.9%,
 * but that is mostly "4-bed houses are bigger". Size-controlled it is +6.2%.
 */
export default function ValueAdd({ propertyId }: { propertyId: number }) {
  const { t, label, scope, caveat } = useValueAddText();
  const [data, setData] = useState<ValueAddResponse | null>(null);

  useEffect(() => {
    api<ValueAddResponse>(`/api/properties/${propertyId}/value-add`)
      .then(setData)
      .catch(() => null);
  }, [propertyId]);

  if (!data || data.options.length === 0) return null;

  return (
    <Card style={{ marginTop: 24 }}>
      <CardTitle sub={t("va.sub")}>{t("va.title")}</CardTitle>

      <div style={{ marginTop: 18 }}>
        {data.options.map((o, i) => (
          <div
            key={o.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 20,
              padding: "15px 0",
              borderBottom: i === data.options.length - 1 ? undefined : `1px solid ${C.divider}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: o.is_association ? C.label : undefined }}>
                {label(o.label)}
              </div>
              {o.is_association && (
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: C.faint, marginTop: 3 }}>
                  {t("va.observedGap")}
                </div>
              )}
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.mono, marginTop: 4 }}>
                {o.cells === 1
                  ? t("va.comparisonN", { n: o.cells, scope: scope(o.scope) })
                  : t("va.comparisonNPlural", { n: o.cells, scope: scope(o.scope) })}
                {o.is_thin ? t("va.tooFew") : ""}
              </div>
              {o.caveat && (
                <div style={{ fontSize: 12, color: C.faint, marginTop: 6, maxWidth: 460, lineHeight: 1.45 }}>
                  {caveat(o.caveat)}
                </div>
              )}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              {/* A feature that measures at zero or a loss adds no value — a
                  bedroom you'd never add, or a pool that doesn't lift the price
                  here — so say so plainly rather than show a negative figure. */}
              {o.pct != null && o.pct <= 0 ? (
                <div style={{ fontSize: 14, fontWeight: 700, color: C.faint, maxWidth: 130, lineHeight: 1.3 }}>
                  {t("va.noValueAdd")}
                </div>
              ) : (
                <>
                  <div
                    className="tnum"
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      letterSpacing: "-.02em",
                      color: o.is_association
                        ? C.label
                        : o.is_thin
                        ? C.faint
                        : (o.pct ?? 0) > 0.01
                        ? C.good
                        : C.label,
                    }}
                  >
                    {o.pct == null ? "—" : `${o.pct > 0 ? "+" : ""}${(o.pct * 100).toFixed(1)}%`}
                  </div>
                  {o.dollars != null && (
                    <div className="tnum" style={{ fontSize: 13, color: C.label, marginTop: 2 }}>
                      {o.dollars > 0 ? "+" : ""}
                      {fmtMoneyShort(o.dollars)}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Note>{t("va.note")}</Note>
    </Card>
  );
}
