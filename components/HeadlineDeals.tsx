"use client";

import Link from "next/link";
import { hiRes } from "@/lib/img";
import { useEffect, useState } from "react";
import { ConversionResponse, Headline, api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { C, MONO } from "./apex";

/**
 * The top of the dashboard: money on the table, then the single sharpest deal.
 *
 * Counts alone ("1,113 underpriced") say nothing about whether it is worth
 * opening. The dollar figures do. Headline is the 97 gems rather than all 1,113
 * — the gems clear the model's own median error and carry enough sold comps to
 * stand behind, so the smaller number is the honest one to lead with.
 */
export default function HeadlineDeals() {
  const { t } = useT();
  const [h, setH] = useState<Headline | null>(null);
  const [conv, setConv] = useState<ConversionResponse | null>(null);

  useEffect(() => {
    api<Headline>("/api/dashboards/headline").then(setH).catch(() => null);
    api<ConversionResponse>("/api/dashboards/conversion?limit=1").then(setConv).catch(() => null);
  }, []);

  if (!h) return null;
  const b = h.best;

  return (
    <>
      <div className="headline-grid">
        <Money
          eyebrow={t("hd.marginGems")}
          value={fmtMoneyShort(h.gems_margin_total)}
          hint={t("hd.gemsHint", { n: h.gems })}
          href="/underpriced"
          strong
        />
        <Money
          eyebrow={t("hd.subdivProfit")}
          value={fmtMoneyShort(h.subdivision_profit_total)}
          hint={t("hd.subdivHint", { n: h.subdividable })}
          href="/subdividable"
        />
        {conv && conv.count > 0 && (
          <Money
            eyebrow={t("hd.bedroomUplift")}
            value={fmtMoneyShort(conv.total_uplift)}
            hint={t("hd.bedroomHint", { n: conv.count, dp: conv.double_plays })}
            href="/add-a-room"
          />
        )}
        <Money
          eyebrow={t("hd.marginAll")}
          value={fmtMoneyShort(h.underpriced_margin_total)}
          hint={t("hd.marginHint", { n: (h.underpriced ?? 0).toLocaleString() })}
          href="/properties?underpriced=true"
          muted
        />
      </div>

      {b && (
        <Link
          href={`/property/${b.id}`}
          style={{
            display: "block",
            marginTop: 16,
            borderRadius: 22,
            overflow: "hidden",
            background: "linear-gradient(120deg,#16191F 0%,#16191F 62%,#2B2F37 100%)",
            color: "#F1ECDD",
            boxShadow: "0 24px 60px -24px rgba(0,0,0,.6)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(600px 300px at 84% 18%, rgba(200,206,214,.12), transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "15px 28px",
              borderBottom: "1px solid rgba(255,255,255,.09)",
              position: "relative",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".22em", color: "#C9CED6" }}>
              {t("hd.biggestGap")}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#7C8698", marginLeft: "auto" }}>
              {b.suburb}
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "22px 34px",
              padding: "26px 28px",
              position: "relative",
            }}
          >
            {b.image_url && (
              <div
                style={{
                  width: 132,
                  height: 100,
                  borderRadius: 12,
                  flexShrink: 0,
                  backgroundImage: `url(${hiRes(b.image_url, 132)})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            )}
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.08 }}>
                {b.address}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 26px", marginTop: 16 }}>
                <Stat label={t("hd.listPrice")} value={fmtMoneyShort(b.asking_price)} />
                <Stat label={t("hd.estValue")} value={fmtMoneyShort(b.fair_value)} bright />
                <Stat label={t("hd.bedsBaths")} value={`${b.beds ?? "—"} / ${b.baths ?? "—"}`} />
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: "#C9CED6" }}>
                {t("hd.belowValuation")}
              </div>
              <div
                className="tnum"
                style={{ fontSize: 54, fontWeight: 900, letterSpacing: "-.04em", lineHeight: 1, marginTop: 6, color: "#6EE7B7" }}
              >
                {fmtMoneyShort(b.margin_dollars)}
              </div>
              <div className="tnum" style={{ fontSize: 17, fontWeight: 700, marginTop: 2 }}>
                {b.margin == null ? "" : t("hd.margin", { pct: `${(b.margin * 100).toFixed(1)}%` })}
              </div>
            </div>
          </div>
        </Link>
      )}
    </>
  );
}

function Money({
  eyebrow, value, hint, href, strong, muted,
}: {
  eyebrow: string; value: string; hint: string; href: string; strong?: boolean; muted?: boolean;
}) {
  return (
    <Link
      href={href}
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 18,
        padding: "20px 24px",
        display: "block",
        color: "inherit",
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>
        {eyebrow}
      </div>
      <div
        className="tnum"
        style={{
          fontSize: strong ? 42 : 34,
          fontWeight: 900,
          letterSpacing: "-.03em",
          marginTop: 6,
          color: muted ? C.label : strong ? C.good : C.ink,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: C.faint, marginTop: 6, lineHeight: 1.45 }}>{hint}</div>
    </Link>
  );
}

function Stat({ label, value, bright }: { label: string; value: string; bright?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".14em", color: bright ? "#C9CED6" : "#7C8698" }}>
        {label}
      </div>
      <div className="tnum" style={{ fontSize: 19, fontWeight: bright ? 800 : 700, marginTop: 4, color: bright ? "#C9CED6" : undefined }}>
        {value}
      </div>
    </div>
  );
}
