"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import AppShell, { useIsMobile } from "@/components/AppShell";
import Sparkline from "@/components/Sparkline";
import SaleHistoryChart from "@/components/SaleHistoryChart";
import SuburbTrendChart from "@/components/SuburbTrendChart";
import SubdivisionCalc from "@/components/SubdivisionCalc";
import DomTrendChart from "@/components/DomTrendChart";
import LocationMap from "@/components/LocationMap";
import PhotoStrip from "@/components/PhotoStrip";
import BuyersAgent from "@/components/BuyersAgent";
import ValueAdd from "@/components/ValueAdd";
import { C, Card, CardTitle, Eyebrow, HeroChip, MONO, Note, Row, SpecTile } from "@/components/apex";
import { ComparableSale, ComparablesResponse, ForSaleRow, HistoryResponse, api } from "@/lib/api";
import { fmtArea, fmtDayDate, fmtEpoch, fmtMoney, fmtMoneyShort, fmtPct } from "@/lib/format";
import { translatePropertyType } from "@/lib/translations";
import { hiRes } from "@/lib/img";
import { useT } from "@/lib/i18n";
import WhenVisible from "@/components/WhenVisible";

// Leaflet reaches for `window` as it loads, so the sun map has to stay off the server.
const SunMap = dynamic(() => import("@/components/SunMap"), { ssr: false });

/** Every photo for a listing, falling back to the single thumbnail.
 *  Accepts null because it is called before the loading guard — the lightbox
 *  keyboard effect needs the count and hooks cannot sit after an early return. */
function photos(p: ForSaleRow | null): string[] {
  if (!p) return [];
  const list = (p.image_urls ?? "").split("\n").map((u) => u.trim()).filter(Boolean);
  return list.length ? list : p.image_url ? [p.image_url] : [];
}

// Let a long ".co.nz" domain wrap so the TLD drops onto its own line inside a
// narrow tile (e.g. propertyvalue.co.nz → "propertyvalue" / ".co.nz").
function wrapDomain(label: string): React.ReactNode {
  const i = label.toLowerCase().lastIndexOf(".co.nz");
  if (i > 0) return (<>{label.slice(0, i)}<wbr />{label.slice(i)}</>);
  return label;
}

// Format a cross-check value for display: areas as m², CV as money, the rest raw.
function pvFmt(field: string, v: number | string | null): string {
  if (v == null) return "—";
  if (field === "land_area_m2" || field === "floor_area_m2") return `${v} m²`;
  if (field === "cv") return typeof v === "number" ? fmtMoneyShort(v) : String(v);
  return String(v);
}

export default function PropertyDetailPage({ params }: { params: { id: string } }) {
  return (
    <AppShell>
      <Inner id={params.id} />
    </AppShell>
  );
}

function Inner({ id }: { id: string }) {
  const { t } = useT();
  // Backend returns English category strings; re-express them in the active language.
  const method = (raw: string) =>
    raw === "Auction" ? t("prop.methodAuction")
      : raw === "Price by Negotiation" ? t("prop.methodNegotiation")
      : raw === "Tender" ? t("prop.methodTender")
      : raw === "Unknown" ? t("prop.methodUnknown")
      : raw;
  const conf = (raw: string | null | undefined) =>
    raw?.toLowerCase() === "high" ? t("prop.confHigh")
      : raw?.toLowerCase() === "medium" ? t("prop.confMedium")
      : raw?.toLowerCase() === "low" ? t("prop.confLow")
      : (raw ?? "");
  const strategy = (raw: string | null | undefined) => {
    if (raw === "Retain house + sell new sections") return t("prop.retainHouseStrategy");
    const m = raw?.match(/^Subdivide into (\d+) sections$/);
    if (m) return t("prop.subdivideInto", { n: m[1] });
    return raw ?? "—";
  };
  const typeLabel = (raw: string | null | undefined) => {
    const en = translatePropertyType(raw);
    const map: Record<string, string> = {
      House: "ptable.house", Townhouse: "ptable.townhouse", Apartment: "ptable.apartment",
      Unit: "ptable.unit", Section: "ptable.section", Lifestyle: "ptable.lifestyle",
    };
    const k = map[en];
    return k ? t(k) : en;
  };
  const isMobile = useIsMobile();
  const [p, setP] = useState<ForSaleRow | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [comps, setComps] = useState<ComparablesResponse | null>(null);
  const [ext, setExt] = useState<{ homes_valuation: number | null; homes_valuation_low: number | null; homes_valuation_high: number | null; homes_cv: number | null; homes_url: string | null; realestate_valuation: number | null; realestate_valuation_low: number | null; realestate_valuation_high: number | null; realestate_url: string | null; pv_estimate_low: number | null; pv_estimate_high: number | null; pv_estimate_mid: number | null; pv_cv: number | null; pv_zoning: string | null; pv_url: string | null; pv_last_sale_price: number | null; pv_last_sale_date: string | null; pv_discrepancies: { field: string; ours: number | string | null; theirs: number | string | null; severity: string }[]; pv_gaps: { field: string; theirs: number | string | null }[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // null = closed, otherwise the index being viewed.
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    api<ForSaleRow>(`/api/properties/${id}`)
      .then(setP)
      .catch((e) => setErr(e?.detail || e?.message || t("prop.notFound")));
    api<HistoryResponse>(`/api/properties/${id}/history`).then(setHistory).catch(() => null);
    api<ComparablesResponse>(`/api/properties/${id}/comparables`).then(setComps).catch(() => null);
    // On-demand third-party estimate (homes.co.nz) — fetched lazily, may be slow
    // on the first view; cached server-side after that. Never blocks the page.
    api<typeof ext>(`/api/properties/${id}/external-estimates`).then(setExt).catch(() => null);
  }, [id]);

  const shots = photos(p);

  useEffect(() => {
    if (lightbox == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i == null ? i : (i + 1) % shots.length));
      if (e.key === "ArrowLeft")
        setLightbox((i) => (i == null ? i : (i - 1 + shots.length) % shots.length));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightbox, shots.length]);

  if (err) return <div style={{ padding: 40, color: C.danger, fontSize: 14 }}>{err}</div>;
  if (!p) return <div style={{ padding: 40, color: C.label, fontSize: 14 }}>Loading…</div>;

  const score = p.opportunity_score_pct ?? 0;
  // Our valuation vs CV. Deliberately NOT market_value — that is asking x 0.95,
  // so using it showed "asking vs CV" while labelled as our estimate.
  const vsCv = p.cv_numeric && p.fair_value ? p.fair_value / p.cv_numeric - 1 : null;
  const headline = p.is_premium ? p.buy_price : p.fair_value;
  const bannerSub = [p.suburb, p.district].filter(Boolean).join(" · ");

  return (
    <div style={{ padding: isMobile ? "20px 16px 48px" : "34px 40px 60px", maxWidth: 1500, width: "100%" }}>
      <Link
        href="/properties"
        style={{ fontFamily: MONO, fontSize: 13, color: C.label, fontWeight: 600 }}
      >
        {t("prop.backToAll")}
      </Link>

      {/* ───────── HERO ───────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: shots.length ? "1.35fr 1fr" : "1fr",
          gap: 16,
          marginTop: 18,
          alignItems: "stretch",
        }}
      >
        <section
          style={{
            borderRadius: 22,
            overflow: "hidden",
            background: "linear-gradient(120deg,#16191F 0%,#16191F 62%,#2B2F37 100%)",
            color: C.darkText,
            boxShadow: "0 24px 60px -24px rgba(0,0,0,.6)",
            position: "relative",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(650px 320px at 85% 10%, rgba(200,206,214,.10), transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              padding: "30px 32px 24px",
              position: "relative",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 20,
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: 38,
                  fontWeight: 900,
                  letterSpacing: "-.035em",
                  lineHeight: 1.03,
                  maxWidth: 640,
                }}
              >
                {p.address}
              </h1>
              <div style={{ fontSize: 15, color: "#8A94A6", marginTop: 10 }}>{bannerSub}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                <HeroChip>{t("prop.askingChip", { v: fmtMoney(p.asking_price) })}</HeroChip>
                <HeroChip>{t("prop.cvChip", { v: fmtMoney(p.cv_numeric) })}</HeroChip>
                {p.confidence && (
                  <HeroChip tone="good">
                    {t("prop.confidenceSuffix", { conf: conf(p.confidence), n: p.comps_used ?? 0 })}
                  </HeroChip>
                )}
              </div>
            </div>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(255,255,255,.1)",
                border: "1px solid rgba(255,255,255,.16)",
                borderRadius: 9,
                padding: "8px 14px",
                whiteSpace: "nowrap",
              }}
            >
              {typeLabel(p.property_type)}
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))",
              borderTop: "1px solid rgba(255,255,255,.1)",
              position: "relative",
              background: C.dark,
              marginTop: "auto",
            }}
          >
            <div style={{ padding: "24px 30px", borderRight: "1px solid rgba(255,255,255,.1)" }}>
              <Eyebrow dark>{p.is_premium ? t("prop.buyPrice") : t("prop.ourValuation")}</Eyebrow>
              <div
                className="tnum"
                style={{
                  fontSize: 38,
                  fontWeight: 900,
                  letterSpacing: "-.03em",
                  color: "#C9CED6",
                  marginTop: 8,
                }}
              >
                {fmtMoneyShort(headline)}
              </div>
              <div
                className="tnum"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  marginTop: 4,
                  color: p.is_premium ? "#8A94A6" : (vsCv ?? 0) >= 0 ? C.good : C.danger,
                }}
              >
                {p.is_premium
                  ? t("prop.premiumOffListing")
                  : vsCv != null
                  ? `${vsCv > 0 ? "+" : ""}${(vsCv * 100).toFixed(1)}% ${t("prop.vsCvSuffix")}`
                  : "—"}
              </div>
            </div>

            <div style={{ padding: "24px 30px", borderRight: "1px solid rgba(255,255,255,.1)" }}>
              <Eyebrow dark>{t("prop.subdivision")}</Eyebrow>
              <div
                className="tnum"
                style={{
                  fontSize: p.is_subdividable && p.max_addl_lots ? 38 : 26,
                  fontWeight: 900,
                  letterSpacing: "-.03em",
                  color: "#C9CED6",
                  marginTop: 8,
                }}
              >
                {p.is_subdividable && p.max_addl_lots
                  ? t("prop.lots", { n: p.max_addl_lots.toFixed(0) })
                  : t("prop.notFlagged")}
              </div>
              <div style={{ fontSize: 13, color: "#8A94A6", marginTop: 4 }}>
                {p.zoning?.replace("Residential - ", "") || t("prop.zoneUnknown")}
              </div>
            </div>

            <div style={{ padding: "24px 30px", minWidth: 0 }}>
              <Eyebrow dark>{t("prop.buyScore")}</Eyebrow>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
                <ScoreRing value={score} />
                <div style={{ fontSize: 13, fontWeight: 700, color: "#C9CED6", lineHeight: 1.35 }}>
                  {p.is_underpriced && <div>{t("prop.belowValue")}</div>}
                  {p.is_cashflow_positive && <div>{t("prop.cashflowPositive")}</div>}
                  {p.is_subdividable && <div>{t("prop.subdivUpside")}</div>}
                  {!p.is_underpriced && !p.is_cashflow_positive && !p.is_subdividable && (
                    <div style={{ color: "#7C8698", fontWeight: 600 }}>{t("prop.noFlags")}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {shots.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div
              onClick={() => setLightbox(0)}
              style={{ flex: 1, minHeight: 230, cursor: "zoom-in" }}
              title={t("prop.clickFullSize")}
            >
              <PhotoStrip urls={shots} height={230} radius={16} />
            </div>
            {/* Three thumbnails, the last badged with whatever is left over. */}
            {shots.length > 1 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, height: 104 }}>
                {shots.slice(1, 4).map((u, i) => {
                  const idx = i + 1;
                  const more = i === 2 && shots.length > 4 ? shots.length - 4 : 0;
                  return (
                    <div
                      key={u}
                      onClick={() => setLightbox(idx)}
                      style={{
                        position: "relative",
                        borderRadius: 12,
                        overflow: "hidden",
                        background: C.chipBg,
                        cursor: "zoom-in",
                        backgroundImage: `url(${hiRes(u, 260)})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {more > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            background: "rgba(14,27,46,.62)",
                            color: "#F1ECDD",
                            display: "grid",
                            placeItems: "center",
                            fontWeight: 800,
                            fontSize: 18,
                          }}
                        >
                          +{more}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ───────── KEY SPECS ───────── */}
      <div style={{ marginTop: 30 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>{t("prop.keySpecs")}</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6,1fr)",
            gap: 12,
            marginTop: 16,
          }}
        >
          <SpecTile label={t("prop.beds")} value={p.beds ?? "—"} />
          <SpecTile label={t("prop.baths")} value={p.baths ?? "—"} />
          <SpecTile label={t("prop.cars")} value={p.cars ?? "—"} />
          <SpecTile
            label={t("prop.floor")}
            value={p.floor_area_m2 ? `${Math.round(p.floor_area_m2)} m²` : "—"}
          />
          <SpecTile label={t("prop.land")} value={fmtArea(p.land_area_m2)} />
          <SpecTile
            label={t("prop.predDom")}
            value={p.predicted_days ? t("prop.dShort", { n: Math.round(p.predicted_days) }) : "—"}
          />
        </div>
      </div>

      {/* ───────── PRICING + CASHFLOW ───────── */}
      {/* alignItems:start — the default stretch forced both cards to the height
          of the taller one, so the shorter cashflow card carried a block of dead
          space. Each sizes to its own content instead. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 24,
          alignItems: "start",
        }}
      >
        {/* Left column: the numbers, then the action you take on them. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <Card>
          <CardTitle>{t("prop.pricingAnalysis")}</CardTitle>
          <div style={{ marginTop: 16 }}>
            <Row label={t("prop.listPrice")} value={fmtMoney(p.asking_price)} />
            <Row
              label={t("prop.buyPriceRow")}
              value={p.buy_price != null ? fmtMoney(p.buy_price) : "—"}
              strong
            />
            <Row
              label={t("prop.ourValuationRow")}
              value={
                p.is_premium
                  ? t("prop.premiumPriced")
                  : p.fair_value != null
                  ? fmtMoney(p.fair_value)
                  : "—"
              }
            />
            <Row
              label={t("prop.councilCv")}
              value={p.cv_numeric != null ? fmtMoney(p.cv_numeric) : "—"}
            />
            <Row
              label={t("prop.predictedDays")}
              value={p.predicted_days ? t("prop.daysUnit", { n: Math.round(p.predicted_days) }) : "—"}
            />
            <Row
              label={t("prop.marginVsBuy")}
              value={
                p.fair_value != null && p.buy_price != null && p.buy_price > 0
                  ? (() => {
                      const m = p.fair_value / p.buy_price - 1;
                      return `${m > 0 ? "+" : "−"}${fmtMoneyShort(
                        Math.abs(p.fair_value - p.buy_price),
                      )} (${m > 0 ? "+" : ""}${(m * 100).toFixed(1)}%)`;
                    })()
                  : "—"
              }
              strong
              tone={
                p.fair_value != null && p.buy_price != null && p.buy_price > 0
                  ? (p.fair_value / p.buy_price - 1 >= 0.05
                      ? "good"
                      : p.fair_value / p.buy_price - 1 <= -0.05
                      ? "bad"
                      : undefined)
                  : undefined
              }
            />
            <Row label={t("prop.confidence")} value={<span style={{ textTransform: "capitalize" }}>{conf(p.confidence) || "—"}</span>} last />
          </div>

          {p.buy_price != null && !p.is_premium && (
            <Note>
              {t("prop.buyPriceBasedOn", {
                basis:
                  p.comp_tier != null && p.comps_matched
                    ? (p.comps_matched === 1
                        ? t("prop.compsNearby", { n: p.comps_matched })
                        : t("prop.compsNearbyPlural", { n: p.comps_matched }))
                    : t("prop.noComps"),
              })}
              {p.range_low != null && p.range_high != null
                ? t("prop.likelyRange", { lo: fmtMoneyShort(p.range_low), hi: fmtMoneyShort(p.range_high) })
                : ""}
              .
            </Note>
          )}

          {/* Compare estimates — every source's view side by side. Hougarden
              (= OneRoof, same AVM per domain knowledge) is shown only when
              genuinely independent: the scrape echoes the asking price ~58% of
              the time. homes.co.nz, realestate.co.nz and Trade Me are SEPARATE
              sources (different companies, own estimates) and each slots in here
              once matched. Context only — never an input to any signal. */}
          {(() => {
            const OUTLIER = 0.40;   // a provider this far from our estimate is flagged
            const hgIndependent =
              p.third_party_valuation != null && p.asking_price != null &&
              Math.abs(p.third_party_valuation - p.asking_price) >= 1;
            type Tile = { label: string; value: number; sub?: string; ollie?: boolean; provider?: boolean; outlier?: number; pending?: boolean; logo?: string };
            const tiles: Tile[] = [];
            if (p.asking_price != null) tiles.push({ label: t("prop.srcAsking"), value: p.asking_price });
            if (!p.is_premium && p.fair_value != null)
              tiles.push({ label: t("prop.srcApex"), value: p.fair_value, ollie: true });
            if (hgIndependent)
              tiles.push({
                label: t("prop.srcHougarden"), value: p.third_party_valuation!, provider: true,
                logo: "/logos/oneroof.png",
                sub: p.third_party_valuation_low != null && p.third_party_valuation_high != null
                  ? `${fmtMoneyShort(p.third_party_valuation_low)}–${fmtMoneyShort(p.third_party_valuation_high)}`
                  : undefined,
              });
            if (ext?.homes_valuation != null)
              tiles.push({
                label: t("prop.srcHomes"), value: ext.homes_valuation, provider: true,
                logo: "/logos/homes.png",
                sub: ext.homes_valuation_low != null && ext.homes_valuation_high != null
                  ? `${fmtMoneyShort(ext.homes_valuation_low)}–${fmtMoneyShort(ext.homes_valuation_high)}`
                  : undefined,
              });
            // CoreLogic (propertyvalue.co.nz) AVM — shown as a comparison estimate.
            if (ext?.pv_estimate_mid != null)
              tiles.push({
                label: t("prop.srcPropertyValue"), value: ext.pv_estimate_mid, provider: true,
                logo: "/logos/propertyvalue.png",
                sub: ext.pv_estimate_low != null && ext.pv_estimate_high != null
                  ? `${fmtMoneyShort(ext.pv_estimate_low)}–${fmtMoneyShort(ext.pv_estimate_high)}`
                  : undefined,
              });
            // realestate.co.nz — slot reserved. Shows the figure once a source is
            // wired in; a muted placeholder holds its place until then.
            if (ext?.realestate_valuation != null)
              tiles.push({
                label: t("prop.srcRealestate"), value: ext.realestate_valuation, provider: true,
                logo: "/logos/realestate.png",
                sub: ext.realestate_valuation_low != null && ext.realestate_valuation_high != null
                  ? `${fmtMoneyShort(ext.realestate_valuation_low)}–${fmtMoneyShort(ext.realestate_valuation_high)}`
                  : undefined,
              });
            else
              tiles.push({ label: t("prop.srcRealestate"), value: 0, pending: true, logo: "/logos/realestate.png" });
            // Trade Me — reserved slot, same as realestate.
            tiles.push({ label: t("prop.srcTrademe"), value: 0, pending: true, logo: "/logos/trademe.png" });
            // CoreLogic (propertyvalue.co.nz) is surfaced as a comparison estimate
            // above AND used internally to fill gaps / sanity-check our data. The
            // other external sources are Trade Me, realestate.co.nz and homes.
            if (p.cv_numeric != null) tiles.push({ label: t("prop.srcCouncil"), value: p.cv_numeric });
            if (tiles.filter((x) => !x.pending).length < 2) return null;
            // Flag any provider whose figure is miles from ours — usually a sign
            // they're on stale council data. Ollie is the reference.
            const ollieVal = tiles.find((x) => x.ollie)?.value;
            if (ollieVal)
              for (const x of tiles)
                if (x.provider) {
                  const d = x.value / ollieVal - 1;
                  if (Math.abs(d) >= OUTLIER) x.outlier = d;
                }
            const outliers = tiles.filter((x) => x.outlier != null);
            const vals = tiles.filter((x) => !x.pending).map((x) => x.value);
            return (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.divider}` }}>
                <Eyebrow>{t("prop.compareTitle")}</Eyebrow>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 10, marginTop: 12 }}>
                  {tiles.map((x) => (
                    <div key={x.label} style={{
                      background: x.pending ? "transparent" : C.chipBg,
                      border: `1px ${x.pending ? "dashed" : "solid"} ${x.ollie ? C.good : C.border}`,
                      borderRadius: 12, padding: "10px 12px", minHeight: 96,
                      display: "flex", flexDirection: "column",
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 5, minHeight: 16 }}>
                        {x.logo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={x.logo} alt="" width={16} height={16} style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }} />
                        )}
                        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".06em", color: C.mono, textTransform: "uppercase", lineHeight: 1.35, overflowWrap: "break-word", minWidth: 0 }}>
                          {wrapDomain(x.label)}
                        </span>
                      </div>
                      <div className="tnum" style={{ fontSize: 18, fontWeight: 800, marginTop: 5, color: x.ollie ? C.good : C.ink }}>
                        {x.pending
                          ? <span style={{ fontSize: 12, fontWeight: 600, color: C.faint }}>{t("prop.srcPending")}</span>
                          : fmtMoneyShort(x.value)}
                      </div>
                      {/* One reserved line so every tile is the same height. */}
                      <div style={{ fontSize: 10, marginTop: "auto", paddingTop: 5, minHeight: 14, color: x.outlier != null ? "#B4791F" : C.faint }}>
                        {x.outlier != null
                          ? t(x.outlier < 0 ? "prop.outlierBelow" : "prop.outlierAbove", { pct: Math.abs(x.outlier * 100).toFixed(0) })
                          : (x.sub || "")}
                      </div>
                    </div>
                  ))}
                </div>
                {outliers.length > 0 ? (
                  <Note>
                    {t("prop.outlierNote", { name: outliers.map((o) => o.label).join(", ") })}
                    {/* Say WHY: homes tracks its own CV, so a gap usually means a
                        stale/different council value. Spell it out when we can. */}
                    {outliers.some((o) => o.label === t("prop.srcHomes")) &&
                      ext?.homes_cv != null && p.cv_numeric != null &&
                      Math.abs(ext.homes_cv - p.cv_numeric) > 0.1 * p.cv_numeric
                      ? " " + t("prop.outlierWhyCv", {
                          theirs: fmtMoneyShort(ext.homes_cv),
                          ours: fmtMoneyShort(p.cv_numeric),
                        })
                      : ""}
                  </Note>
                ) : (
                  <Note>{t("prop.compareSpread", { lo: fmtMoneyShort(Math.min(...vals)), hi: fmtMoneyShort(Math.max(...vals)) })} {t("prop.contextNote")}</Note>
                )}
                {/* CoreLogic (propertyvalue.co.nz) cross-check and gap-fill data is
                    used internally only and is intentionally not surfaced here. */}
              </div>
            );
          })()}
        </Card>
        </div>

        {/* Cashflow and features share the right column. Pricing analysis is
            much taller, so on its own the cashflow card left a column of blank
            space beside it. The map went here first and was worse — at 522px it
            is taller than the whole pricing card, so it flipped a 102px gap into
            a 436px one. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <Card>
          <CardTitle>{t("prop.cashflow")}</CardTitle>
          <div style={{ marginTop: 16 }}>
            <Row
              label={t("prop.weeklyRent")}
              value={p.est_weekly_rent ? `$${Math.round(p.est_weekly_rent).toLocaleString()} /wk` : "—"}
            />
            <Row label={t("prop.grossYield")} value={fmtPct(p.est_gross_yield)} />
            <Row
              label={t("prop.annualCashflow")}
              value={fmtMoney(p.annual_cashflow)}
              strong
              tone={(p.annual_cashflow ?? 0) >= 0 ? "good" : "bad"}
            />
            <Row
              label={t("prop.cashOnCash")}
              value={fmtPct(p.cash_on_cash)}
              tone={(p.cash_on_cash ?? 0) >= 0 ? "good" : "bad"}
            />
            <Row
              label={t("prop.breakeven")}
              value={p.breakeven_deposit_pct != null ? fmtPct(p.breakeven_deposit_pct) : "—"}
              last
            />
          </div>
          <Note>{t("prop.cashflowNote")}</Note>
        </Card>

      {(p.has_swimming_pool ||
        p.is_new_construction ||
        p.is_coastal_waterfront ||
        p.storey_count ||
        p.parking_covered ||
        p.building_age ||
        p.other_features) && (
        <Card>
          <CardTitle>{t("prop.features")}</CardTitle>
          {/* Single column: this card now lives in the half-width right column,
              so two sub-columns left ~140px each and wrapped values like
              "Residential - Mixed Housing Suburban Zone" onto three lines. */}
          <div style={{ marginTop: 12 }}>
            {[
              // Year built arrives as "1978.0" — a float that reads as a bug.
              p.building_age && [t("prop.yearBuilt"), String(p.building_age).replace(/\.0+$/, "")],
              p.storey_count && [t("prop.storeys"), String(p.storey_count)],
              p.parking_covered != null && [t("prop.coveredParking"), String(p.parking_covered)],
              p.has_swimming_pool && [t("prop.swimmingPool"), t("prop.yes")],
              p.is_new_construction && [t("prop.newConstruction"), t("prop.yes")],
              p.is_coastal_waterfront && [t("prop.coastalWaterfront"), t("prop.yes")],
              p.land_slope_contour && [t("prop.landContour"), p.land_slope_contour],
              p.type_of_title && [t("prop.titleType"), p.type_of_title.slice(0, 60)],
              // "Residential - " prefixes every residential zone and eats a
              // whole line in this narrow column. The hero strips it too.
              p.zoning && [t("prop.zoning"), p.zoning.replace("Residential - ", "")],
            ]
              .filter(Boolean)
              .map((row, i, arr) => {
                const [label, value] = row as [string, string];
                return <Row key={i} label={label} value={value} last={i === arr.length - 1} />;
              })}
          </div>
          {p.other_features && <Note>{p.other_features}</Note>}
        </Card>
      )}
          {/* Buyer's-agent CTA lives here, in the right column, to fill the gap
              left beside the taller pricing card on the left. */}
          <BuyersAgent
            propertyId={p.id}
            address={p.address}
            suburb={p.suburb}
            askingPrice={p.asking_price}
            buyPrice={p.buy_price}
          />
        </div>
      </div>

      {/* ───────── SUBDIVISION ───────── */}
      {(p.sections != null && p.sections >= 2) || p.max_addl_lots ? (
        <Card style={{ marginTop: 24 }}>
          <CardTitle>{t("prop.subdivFeasibility")}</CardTitle>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 40px", marginTop: 12 }}
          >
            <div>
              <Row label={t("prop.zone")} value={p.zoning ?? "—"} />
              <Row
                label={t("prop.minLot")}
                value={p.min_lot_m2 ? `${(p.min_lot_m2 ?? 0).toLocaleString()} m²` : "—"}
              />
              <Row
                label={t("prop.additionalLots")}
                value={p.max_addl_lots != null ? p.max_addl_lots.toFixed(0) : "—"}
                last
              />
            </div>
            <div>
              <Row label={t("prop.totalSubdiv")} value={fmtMoney(p.total_subdivided_value)} />
              <Row label={t("prop.bestStrategy")} value={strategy(p.best_strategy)} strong />
              <Row
                label={t("prop.bestNetGain")}
                value={fmtMoney(p.best_net_gain)}
                strong
                tone={(p.best_net_gain ?? 0) > 0 ? "good" : "bad"}
                last
              />
            </div>
          </div>
          <Note warn>{t("prop.subdivWarn")}</Note>

          {/* Shown for any site that splits into 2+ sections, not only the
              already-profitable ones — a developer's own numbers are most
              useful on the marginal cases the defaults reject. */}
          {p.sections != null && p.sections >= 2 && (
            <div style={{ marginTop: 22, paddingTop: 20, borderTop: `1px solid ${C.divider}` }}>
              <SubdivisionCalc propertyId={p.id} zone={p.zoning} minLot={p.min_lot_m2} />
            </div>
          )}
        </Card>
      ) : null}

      {/* ───────── VALUE ADD ───────── */}
      <ValueAdd propertyId={p.id} />

      {/* ───────── LOCATION ───────── */}
      {p.latitude != null && p.longitude != null && (
        <Card style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
            <CardTitle sub={bannerSub}>{t("prop.location")}</CardTitle>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                fontWeight: 600,
                background: C.chipBg,
                color: "#6E7C90",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "6px 11px",
                whiteSpace: "nowrap",
              }}
            >
              {t("prop.approxLocation")}
            </span>
          </div>
          <LocationMap
            lat={p.latitude}
            lng={p.longitude}
            caption={t("prop.parcelCaption", { suburb: p.suburb ?? "—", area: fmtArea(p.land_area_m2) })}
          />
          <Note>{t("prop.locationNote")}</Note>
        </Card>
      )}

      {/* ───────── SUN & SHADE ───────── */}
      {p.latitude != null && p.longitude != null && (
        <Card style={{ marginTop: 24 }}>
          <CardTitle sub={t("sun.blurb")}>{t("sun.title")}</CardTitle>
          <div style={{ marginTop: 18 }}>
            {/* Aerial imagery is billed per request. Mounted on page load it
                would bill for every listing anyone opens, including the ones
                they glanced at and left — so it waits until someone scrolls
                down to it. */}
            <WhenVisible minHeight={560} placeholder={<MapPlaceholder />}>
              <SunMap propertyId={p.id} lat={p.latitude} lng={p.longitude}
                floorArea={p.floor_area_m2} landArea={p.land_area_m2} />
            </WhenVisible>
          </div>
          <Note>{t("sun.note")}</Note>
        </Card>
      )}
      {/* ───────── RECENT SALES ───────── */}
      {comps && comps.comps.length > 0 && (
        <Card style={{ marginTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
            <CardTitle sub={t("prop.recentSalesSub", { n: comps.comps.length })}>
              {t("prop.recentSalesIn", { suburb: comps.suburb ?? "" })}
            </CardTitle>
            <div style={{ display: "flex", gap: 26, flexShrink: 0, textAlign: "right" }}>
              {comps.median_sale_price != null && (
                <div>
                  <Eyebrow>{t("prop.medianSale")}</Eyebrow>
                  <div
                    className="tnum"
                    style={{ fontSize: 26, fontWeight: 800, color: C.accent, marginTop: 4 }}
                  >
                    {fmtMoneyShort(comps.median_sale_price)}
                  </div>
                </div>
              )}
              {comps.mean_sale_price != null && (
                <div>
                  <Eyebrow>{t("prop.averageSale")}</Eyebrow>
                  <div
                    className="tnum"
                    style={{ fontSize: 26, fontWeight: 800, color: C.accent, marginTop: 4 }}
                  >
                    {fmtMoneyShort(comps.mean_sale_price)}
                  </div>
                </div>
              )}
              {/* The number the whole valuation method rests on: what these sales
                  did against their council valuation. */}
              {comps.mean_sale_vs_cv != null && (
                <div>
                  <Eyebrow>{t("prop.averageVsCv")}</Eyebrow>
                  <div
                    className="tnum"
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      marginTop: 4,
                      color: comps.mean_sale_vs_cv >= 0 ? C.good : C.danger,
                    }}
                  >
                    {comps.mean_sale_vs_cv > 0 ? "+" : ""}
                    {(comps.mean_sale_vs_cv * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 720 }}>
              <div style={COMP_GRID_HEAD}>
                <span>{t("prop.address")}</span>
                <span>{t("prop.colBd")}</span>
                <span>{t("prop.colBa")}</span>
                <span>{t("prop.colCv")}</span>
                <span>{t("prop.soldFor")}</span>
                <span>{t("prop.vsCvCol")}</span>
              </div>
              {comps.comps.map((c) => (
                <CompRow key={c.id} c={c} />
              ))}
            </div>
          </div>

          {comps.median_sale_vs_cv != null && (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.divider}` }}>
              <Row
                label={t("prop.medianSaleVsCv", { n: comps.comps_with_cv })}
                value={`${comps.median_sale_vs_cv > 0 ? "+" : ""}${(
                  comps.median_sale_vs_cv * 100
                ).toFixed(1)}%`}
                strong
                tone={comps.median_sale_vs_cv >= 0 ? "good" : "bad"}
              />
              {comps.subject_ask_vs_cv != null && (
                <Row
                  label={t("prop.askingVsCv")}
                  value={`${comps.subject_ask_vs_cv > 0 ? "+" : ""}${(
                    comps.subject_ask_vs_cv * 100
                  ).toFixed(1)}%`}
                  strong
                  tone={
                    comps.median_sale_vs_cv != null &&
                    comps.subject_ask_vs_cv < comps.median_sale_vs_cv
                      ? "good"
                      : undefined
                  }
                />
              )}
              {comps.median_days_on_market != null && (
                <Row
                  label={t("prop.daysToSellMedian", { n: comps.comps_with_dom })}
                  value={t("prop.daysUnit", { n: Math.round(comps.median_days_on_market) })}
                  last
                />
              )}

              {/* The sale-method analysis (auction vs negotiation vs CV) was
                  removed — it's expert nuance that reads as noise to a non-analyst.
                  The page leads with a single plain estimate and buy price instead. */}
            </div>
          )}

          <Note>
            {comps.matched_using?.title && comps.matched_using.title !== "mixed"
              ? t("prop.matchedTitle", { title: comps.matched_using.title })
              : comps.matched_using?.title === "mixed"
              ? t("prop.mixedTitle")
              : ""}
            {t("prop.verifiedRecords")}
          </Note>
        </Card>
      )}

      {/* ───────── MARKET VELOCITY ───────── */}
      <Card style={{ marginTop: 24 }}>
        <CardTitle sub={t("prop.velocitySub")}>
          {t("prop.howFastSelling", { suburb: p.suburb ?? "" })}
        </CardTitle>
        <div style={{ marginTop: 16 }}>
          <DomTrendChart suburb={p.suburb} />
        </div>
      </Card>

      {/* ───────── PRICE HISTORY ───────── */}
      {/* Show whenever there's anything to plot — recorded sales OR just the
          current markers (our value / asking / sell estimate). */}
      {(p.valuation_last_sold_value || parseSaleHistory(p.sale_history_json).length > 0
        || p.asking_price || p.fair_value || p.expected_sale) && (
        <Card style={{ marginTop: 24 }}>
          <CardTitle>{t("prop.pastSales")}</CardTitle>
          {/* Price-over-time: past sales plotted against when they sold, with
              today's our value, asking and expected sell price on the same
              timeline. Falls back to the single last-sold point, or to the
              current markers alone when there's no recorded sale. */}
          {(() => {
            const hist = parseSaleHistory(p.sale_history_json);
            const hasSale = hist.length > 0 || p.valuation_last_sold_value != null;
            // A time chart with no sales in it is just markers jammed on today's
            // line over an empty grid. When there's no recorded sale, show a clean
            // side-by-side of the current estimates instead of an empty timeline.
            if (!hasSale) {
              return (
                <EstimatesCompare
                  ourValue={p.fair_value}
                  asking={p.asking_price}
                  sellEstimate={p.expected_sale}
                  band={p.expected_sale_band}
                />
              );
            }
            const chartSales = hist.length > 0
              ? hist
              : [{ date: p.valuation_last_sold_date || "", price: p.valuation_last_sold_value!, method: "" }];
            return (
              <div style={{ marginTop: 12 }}>
                <SaleHistoryChart
                  sales={chartSales}
                  asking={p.asking_price}
                  askingDate={p.listing_date}
                  ourValue={p.fair_value}
                  expectedSale={p.expected_sale}
                  expectedBand={p.expected_sale_band}
                />
              </div>
            );
          })()}
          {parseSaleHistory(p.sale_history_json).length > 0 ? (
            <div style={{ marginTop: 12 }}>
              {parseSaleHistory(p.sale_history_json).map((s, i, arr) => (
                <Row
                  key={i}
                  label={`${fmtDayDate(s.date)}${s.method ? ` · ${s.method}` : ""}`}
                  value={fmtMoney(s.price)}
                  last={i === arr.length - 1}
                />
              ))}
            </div>
          ) : p.valuation_last_sold_value != null ? (
            <div style={{ marginTop: 12, fontSize: 15 }}>
              {t("prop.lastSoldFor")}{" "}
              <span className="tnum" style={{ fontWeight: 800 }}>
                {fmtMoney(p.valuation_last_sold_value)}
              </span>
              {p.valuation_last_sold_date && (
                <span style={{ color: C.label }}>{t("prop.onDate", { date: fmtDayDate(p.valuation_last_sold_date) })}</span>
              )}
            </div>
          ) : p.valuation_last_sold_date ? (
            // Date on record but no price — don't render "sold for —".
            <div style={{ marginTop: 12, fontSize: 15, color: C.label }}>
              {t("prop.lastSoldNoPrice", { date: fmtDayDate(p.valuation_last_sold_date) })}
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 14, color: C.label }}>
              {t("prop.noRecordedSales")}
            </div>
          )}
        </Card>
      )}

      {/* ───────── CV MOVEMENT ───────── */}
      {(p.valuation_rateable_change_pct != null || p.valuation_land_change_pct != null) && (
        <Card style={{ marginTop: 24 }}>
          <CardTitle>{t("prop.cvMoved")}</CardTitle>
          <div style={{ marginTop: 12 }}>
            <Row
              label={t("prop.totalCvChange")}
              value={
                p.valuation_rateable_change_pct != null
                  ? fmtPct(p.valuation_rateable_change_pct / 100)
                  : "—"
              }
              tone={(p.valuation_rateable_change_pct ?? 0) >= 0 ? "good" : "bad"}
            />
            <Row
              label={t("prop.landChange")}
              value={
                p.valuation_land_change_pct != null ? fmtPct(p.valuation_land_change_pct / 100) : "—"
              }
            />
            <Row
              label={t("prop.improvementsChange")}
              value={
                p.valuation_improvement_change_pct != null
                  ? fmtPct(p.valuation_improvement_change_pct / 100)
                  : "—"
              }
              last
            />
          </div>
        </Card>
      )}

      {/* ───────── WEEKLY SNAPSHOTS ───────── */}
      <Card style={{ marginTop: 24 }}>
        <CardTitle>{t("prop.weeklySnapshots")}</CardTitle>
        {history && history.points.length > 1 ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, margin: "18px 0 8px" }}>
              <div>
                <Eyebrow>{t("prop.askingPrice")}</Eyebrow>
                <Sparkline
                  values={history.points.map((pt) => pt.asking_price)}
                  width={300}
                  height={60}
                  color={C.accent}
                />
              </div>
              <div>
                <Eyebrow>{t("prop.ourEstValue")}</Eyebrow>
                <Sparkline
                  values={history.points.map((pt) => pt.market_value)}
                  width={300}
                  height={60}
                  color={C.good}
                />
              </div>
            </div>
            {history.points.map((pt, i) => (
              <Row
                key={pt.batch_id}
                label={`${pt.batch_date}${pt.is_active ? t("prop.snapshotActive") : ""}`}
                value={t("prop.snapshotValue", {
                  ask: fmtMoneyShort(pt.asking_price),
                  est: fmtMoneyShort(pt.market_value),
                  score: pt.opportunity_score_pct?.toFixed(0) ?? "—",
                })}
                last={i === history.points.length - 1}
              />
            ))}
          </>
        ) : (
          <Note>
            This listing only appears in the current week&rsquo;s snapshot. Once a future upload also
            contains this same listing (matched by slug), week-over-week price changes will appear
            here.
          </Note>
        )}
      </Card>

      {/* ───────── SUBURB TREND ───────── */}
      <SuburbTrendChart
        yearly={p.valuation_trend_yearly_json}
        monthly={p.valuation_trend_monthly_json}
        suburb={p.suburb}
      />

      {/* ───────── LIGHTBOX ───────── */}
      {lightbox != null && shots[lightbox] && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0,0,0,.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            cursor: "zoom-out",
            overflow: "hidden",
          }}
        >
          {/* Sized against the VIEWPORT, not the container. With the old grid +
              maxHeight:100%, the auto-sized row grew to fit a tall photo and the
              percentage resolved against that already-too-tall row, so portrait
              images overflowed the screen. Explicit vw/vh (minus the padding)
              can't do that. Full-resolution source here — this is the one place
              the photo is meant to be big. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hiRes(shots[lightbox], 1200)}
            alt={p.address ?? "Property"}
            style={{
              maxWidth: "calc(100vw - 48px)",
              maxHeight: "calc(100vh - 48px)",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              borderRadius: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {shots.length > 1 && (
            <>
              <LightboxArrow
                side="left"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((i) => (i == null ? i : (i - 1 + shots.length) % shots.length));
                }}
              />
              <LightboxArrow
                side="right"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((i) => (i == null ? i : (i + 1) % shots.length));
                }}
              />
              <div
                className="tnum"
                style={{
                  position: "absolute",
                  bottom: 22,
                  left: "50%",
                  transform: "translateX(-50%)",
                  color: "#F1ECDD",
                  fontFamily: MONO,
                  fontSize: 13,
                }}
              >
                {lightbox + 1} / {shots.length} · ← → to browse
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const COMP_COLS = "2.2fr 0.6fr 0.6fr 0.9fr 1fr 1fr";

const COMP_GRID_HEAD: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: COMP_COLS,
  gap: 14,
  padding: "16px 0 10px",
  borderBottom: `1px solid ${C.divider}`,
  fontFamily: MONO,
  fontSize: 10.5,
  letterSpacing: ".1em",
  color: C.mono,
};

function CompRow({ c }: { c: ComparableSale }) {
  const vs = c.cv_numeric && c.sale_price ? c.sale_price / c.cv_numeric - 1 : null;
  // How it sold belongs on the row: auctions clear ~4 points higher against CV
  // than private treaty, so the method changes how to read the number beside it.
  const method = c.sale_method?.split("-")[1]?.trim() ?? c.sale_method?.trim() ?? null;
  const meta = [
    c.floor_area_m2 ? `${Math.round(c.floor_area_m2)} m²` : null,
    c.land_area_m2
      ? c.land_area_m2 >= 10000
        ? `${(c.land_area_m2 / 10000).toFixed(1)} ha`
        : `${Math.round(c.land_area_m2)} m²`
      : null,
    c.type_of_title,
    method,
    c.sold_date,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COMP_COLS,
        gap: 14,
        padding: "16px 0",
        borderBottom: `1px solid ${C.divider}`,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        {c.url ? (
          <a
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}
          >
            {c.address ?? "—"}
          </a>
        ) : (
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25 }}>{c.address ?? "—"}</div>
        )}
        <div style={{ fontFamily: MONO, fontSize: 11, color: C.mono, marginTop: 4 }}>{meta}</div>
      </div>
      <span className="tnum" style={{ fontSize: 15 }}>
        {c.beds ?? "—"}
      </span>
      <span className="tnum" style={{ fontSize: 15 }}>
        {c.baths ?? "—"}
      </span>
      <span className="tnum" style={{ fontSize: 15, color: C.label }}>
        {fmtMoneyShort(c.cv_numeric)}
      </span>
      <span className="tnum" style={{ fontSize: 16, fontWeight: 800 }}>
        {fmtMoneyShort(c.sale_price)}
      </span>
      <span
        className="tnum"
        style={{ fontSize: 15, fontWeight: 700, color: vs == null ? C.label : vs >= 0 ? C.good : C.danger }}
      >
        {vs == null ? "—" : `${vs > 0 ? "+" : ""}${(vs * 100).toFixed(1)}%`}
      </span>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        position: "relative",
        width: 58,
        height: 58,
        flex: "0 0 58px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `conic-gradient(#C9CED6 ${pct}%, rgba(255,255,255,.12) 0)`,
        }}
      />
      <div style={{ position: "absolute", inset: 6, borderRadius: "50%", background: C.dark }} />
      <span className="tnum" style={{ position: "relative", fontSize: 22, fontWeight: 900, color: "#C9CED6" }}>
        {pct.toFixed(0)}
      </span>
    </div>
  );
}

function parseSaleHistory(raw: string | null): Array<{ date: string; price: number; method: string }> {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : data.points || data.sales || [];
    return list
      .map((s: any) => ({
        date: s.date || s.sold_date || s.year || "—",
        price: Number(s.price || s.sale_price || s.value || 0),
        method: s.method || s.sale_method || "",
      }))
      .filter((s: any) => s.price > 0);
  } catch {
    return [];
  }
}

/* Shown in place of the sale-history timeline when a property has NO recorded
 * sale — a time chart with no time-series is just markers piled on "today".
 * A horizontal value ladder puts the current estimates on one axis so their
 * relative positions (and the deal gap) read at a glance. */
function EstimatesCompare({
  ourValue, asking, sellEstimate, band,
}: {
  ourValue: number | null; asking: number | null; sellEstimate: number | null; band: number | null;
}) {
  const b = band && band > 0 ? band : 0;
  const items = ([
    ourValue && ourValue > 0 ? { key: "our", label: "OUR VALUE", value: ourValue, color: "#22C55E", ink: "#15803D", big: true } : null,
    asking && asking > 0 ? { key: "ask", label: "ASKING", value: asking, color: "#EF4444", ink: "#EF4444" } : null,
    sellEstimate && sellEstimate > 0
      ? { key: "sell", label: "SELL EST.", value: sellEstimate, color: "#333A43", ink: "#333A43",
          lo: b ? sellEstimate * (1 - b) : null, hi: b ? sellEstimate * (1 + b) : null }
      : null,
  ].filter(Boolean)) as Array<{ key: string; label: string; value: number; color: string; ink: string; big?: boolean; lo?: number | null; hi?: number | null }>;

  if (items.length === 0) return null;

  // Domain across all points + any band edges, padded.
  const vals = items.flatMap((i) => (i.lo && i.hi ? [i.value, i.lo, i.hi] : [i.value]));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { lo *= 0.92; hi *= 1.08; }
  const pad = (hi - lo) * 0.18;
  lo -= pad; hi += pad;
  const xOf = (v: number) => ((v - lo) / (hi - lo)) * 100;

  // De-collide labels: sort by position, flip a caption below when it crowds the last.
  const slot: Record<string, "above" | "below"> = {};
  let prevX = -Infinity, prevSlot: "above" | "below" = "above";
  for (const it of [...items].sort((a, b2) => a.value - b2.value)) {
    const xi = xOf(it.value);
    const s: "above" | "below" = xi - prevX < 18 ? (prevSlot === "above" ? "below" : "above") : "above";
    slot[it.key] = s; prevX = xi; prevSlot = s;
  }

  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const clamp = (x: number) => Math.max(3, Math.min(97, x));

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 13, color: C.label, marginBottom: 4 }}>
        No sale on record — where the current estimates sit relative to each other.
      </div>
      <div style={{ position: "relative", height: 150 }}>
        {/* axis */}
        <div style={{ position: "absolute", left: 0, right: 0, top: 86, height: 2, background: "#EEF2F7" }} />
        {/* ticks */}
        {ticks.map((tk, i) => (
          <div key={i}>
            <div style={{ position: "absolute", top: 80, left: `${clamp(xOf(tk))}%`, width: 2, height: 14, background: "#E6EBF2", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", top: 100, left: `${clamp(xOf(tk))}%`, transform: "translateX(-50%)", fontFamily: MONO, fontSize: 10, color: C.mono }}>
              {fmtMoneyShort(tk)}
            </div>
          </div>
        ))}
        {/* sell-estimate band */}
        {items.map((it) =>
          it.lo && it.hi ? (
            <div key={`b${it.key}`} style={{
              position: "absolute", top: 80, left: `${clamp(xOf(it.lo))}%`,
              width: `${Math.max(2, clamp(xOf(it.hi)) - clamp(xOf(it.lo)))}%`,
              height: 14, background: "rgba(51,58,67,.12)", borderRadius: 7,
            }} />
          ) : null
        )}
        {/* points + captions */}
        {items.map((it) => {
          const x = clamp(xOf(it.value));
          const r = it.big ? 16 : 14;
          const above = slot[it.key] === "above";
          return (
            <div key={it.key}>
              <div style={{
                position: "absolute", top: 87, left: `${x}%`, width: r, height: r, borderRadius: "50%",
                background: it.color, border: "2.5px solid #fff", boxShadow: "0 1px 3px rgba(16,24,40,.28)",
                transform: "translate(-50%,-50%)",
              }} />
              <div style={{
                position: "absolute", left: `${x}%`, transform: "translateX(-50%)", textAlign: "center",
                whiteSpace: "nowrap", top: above ? 32 : 108,
              }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".06em", color: C.mono }}>{it.label}</div>
                <div className="tnum" style={{ fontWeight: 800, fontSize: 15, color: it.ink }}>{fmtMoneyShort(it.value)}</div>
                {it.lo && it.hi && (
                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.mono, marginTop: 1 }}>
                    ±{Math.round(b * 100)}% · {fmtMoneyShort(it.lo)}–{fmtMoneyShort(it.hi)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LightboxArrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      style={{
        position: "absolute",
        [side]: 24,
        top: "50%",
        transform: "translateY(-50%)",
        width: 46,
        height: 46,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        background: "rgba(255,255,255,.14)",
        color: "#fff",
        fontSize: 24,
        lineHeight: 1,
        display: "grid",
        placeItems: "center",
      }}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}

/** Stands in for the sun map until it is scrolled to, holding its height so the
 *  page does not jump when the real panel replaces it. */
function MapPlaceholder() {
  return (
    <div
      style={{
        height: 460,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        background: "#EEF2F7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: C.faint,
        fontSize: 13,
      }}
    >
      Loading the aerial…
    </div>
  );
}
