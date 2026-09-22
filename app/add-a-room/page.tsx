"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { ConversionResponse, api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { C, Card, MONO, Note } from "@/components/apex";
import { useT } from "@/lib/i18n";

/**
 * Houses that already hold the floor area for another bedroom, in districts
 * where a bedroom actually pays.
 *
 * Built from two measured facts that are useless separately: what a bedroom is
 * worth per district (size-controlled against sold comps) and how much floor
 * area a house of each bed count normally carries. Where a listing already has
 * the floor area of a house one bedroom larger, the space exists — it just is
 * not partitioned.
 */
export default function AddARoomPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { t } = useT();
  const [d, setD] = useState<ConversionResponse | null>(null);

  useEffect(() => {
    api<ConversionResponse>("/api/dashboards/conversion?limit=120").then(setD).catch(() => null);
  }, []);

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 1500, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".24em", color: C.accent, fontWeight: 600 }}>
            DEAL FINDER
          </div>
          <h1 style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-.035em", lineHeight: 1, marginTop: 12 }}>
            {t("room.title")}
          </h1>
          <p style={{ fontSize: 16, color: C.label, maxWidth: 680, marginTop: 14, lineHeight: 1.5 }}>{t("room.blurb")}</p>
        </div>
        {d && (
          <div style={{ display: "flex", gap: 10, textAlign: "right" }}>
            <Tile label={t("room.uplift")} value={fmtMoneyShort(d.total_uplift)} tone={C.good} />
            <Tile label={t("room.houses")} value={(d.count ?? 0).toLocaleString()} />
            <Tile label={t("room.alsoUnderpriced")} value={String(d.double_plays)} />
          </div>
        )}
      </div>

      <Note warn>{t("room.warn")}</Note>

      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {d?.rows.map((r, i) => (
          <Link
            key={r.id}
            href={`/property/${r.id}`}
            className="deal-card"
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: "16px 20px",
              color: "inherit",
              boxShadow: "0 1px 2px rgba(16,24,40,.04), 0 6px 16px -8px rgba(16,24,40,.18)",
            }}
          >
            <div className="deal-card__photo">
              <div
                style={{
                  width: "100%",
                  height: 132,
                  borderRadius: 12,
                  background: C.chipBg,
                  backgroundImage: r.image_url ? `url(${r.image_url})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className="tnum" style={{ fontFamily: MONO, fontSize: 11, color: C.mono }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>{r.address}</div>
              </div>
              <div style={{ fontSize: 13, color: "#6E7C90", marginTop: 5, marginLeft: 26 }}>
                {r.suburb} · {r.district}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11, marginLeft: 26 }}>
                <Chip>{r.beds} bd now</Chip>
                <Chip>{Math.round(r.floor_area_m2 ?? 0)} m² floor</Chip>
                <Chip>
                  {r.beds != null ? r.beds + 1 : "—"} bd typically {Math.round(r.typical_floor_next ?? 0)} m²
                </Chip>
                {r.is_underpriced && <Chip strong>also underpriced</Chip>}
              </div>
            </div>

            <div className="deal-card__figures">
              <Money label="LIST PRICE" value={fmtMoneyShort(r.asking_price)} />
              <Money label="EST. VALUE" value={fmtMoneyShort(r.fair_value)} />
              <Money label="AFTER THE ROOM" value={fmtMoneyShort((r.fair_value ?? 0) + r.uplift_dollars)} strong />
              <div className="deal-card__margin">
                <div className="tnum" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-.03em", color: C.good }}>
                  +{fmtMoneyShort(r.uplift_dollars)}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.mono, marginTop: 6 }}>
                  +{(r.uplift_pct * 100).toFixed(1)}% for a bedroom in {r.district?.replace(" City", "")}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 20px", minWidth: 110 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>{label}</div>
      <div className="tnum" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", marginTop: 4, color: tone }}>
        {value}
      </div>
    </div>
  );
}

function Chip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        color: strong ? "#fff" : C.label,
        background: strong ? C.accent : C.chipBg,
        borderRadius: 6,
        padding: "4px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Money({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="deal-card__money" style={{ minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".12em", color: C.mono }}>{label}</div>
      <div
        className="tnum"
        style={{
          fontSize: strong ? 20 : 17,
          fontWeight: strong ? 800 : 600,
          marginTop: 5,
          color: strong ? C.accent : C.ink,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}
