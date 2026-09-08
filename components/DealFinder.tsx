"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ForSaleList, ForSaleRow, api, isPreview } from "@/lib/api";
import { askingText, fmtArea, fmtMoney, fmtMoneyShort } from "@/lib/format";
import PhotoStrip from "./PhotoStrip";
import SuburbFilter from "./SuburbFilter";
import ZoneFilter from "./ZoneFilter";
import { useT, useTypeLabel } from "@/lib/i18n";
import { C, MONO } from "./apex";

/**
 * Deal-finder page — headline, stat tiles, a hero "sharpest deal" banner and a
 * list of deal cards. Replaces the dense table on the three finder pages; the
 * full sortable table still lives on /properties where scanning many columns is
 * the point.
 *
 * The tiles come from /api/properties/summary with the SAME filters as the
 * rows, so the count above can never disagree with the list below.
 */

type Metric = "margin" | "lots";

interface Summary {
  total: number;
  median_margin: number | null;
  median_margin_dollars: number | null;
  median_lots: number | null;
  top_id: number | null;
}

interface Props {
  eyebrow?: string;
  title: string;
  blurb: string;
  filter: Record<string, string>;
  orderBy: string;
  /** Which number the hero and cards lead with. */
  metric?: Metric;
  /** Scale for the margin bars — the largest margin we expect to see. */
  metricMax?: number;
  children?: React.ReactNode;
}

/** Gallery for a listing, falling back to the single thumbnail. */
function photos(r: ForSaleRow): string[] {
  const list = (r.image_urls ?? "").split("\n").map((u) => u.trim()).filter(Boolean);
  return list.length ? list : r.image_url ? [r.image_url] : [];
}

const PAGE = 25;

// Area / beds / budget filters (shared shape with the All-properties table).
const DF_DISTRICTS = [
  "Auckland City", "North Shore City", "Waitakere City", "Manukau City",
  "Rodney", "Franklin", "Papakura", "Waiheke Island", "Hauraki Gulf Islands",
];
const DF_MAX_PRICES: { v: number; label: string }[] = [
  { v: 1_000_000, label: "$1M" },
  { v: 1_500_000, label: "$1.5M" },
  { v: 2_000_000, label: "$2M" },
  { v: 3_000_000, label: "$3M" },
  { v: 5_000_000, label: "$5M" },
];
const DF_SELECT: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 11,
  padding: "11px 13px",
  fontFamily: "inherit",
  fontSize: 14,
  color: "#5A6B82",
  cursor: "pointer",
  outline: "none",
};

export default function DealFinder({
  eyebrow,
  title,
  blurb,
  filter,
  orderBy,
  metric = "margin",
  metricMax = 0.35,
  children,
}: Props) {
  const { t } = useT();
  const conf = (raw: string | null | undefined) =>
    raw?.toLowerCase() === "high" ? t("deal.confHigh")
      : raw?.toLowerCase() === "medium" ? t("deal.confMedium")
      : raw?.toLowerCase() === "low" ? t("deal.confLow")
      : (raw ?? "");
  const [rows, setRows] = useState<ForSaleRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hero, setHero] = useState<ForSaleRow | null>(null);
  // Seeded from the incoming filter, so a list arrived at with an area or a
  // budget already applied SHOWS that area and budget in its controls. Without
  // this the page reads "Suburb: all" over a list of one suburb, and the only
  // way to widen it is to guess that the filter exists.
  const [search, setSearch] = useState(filter.search ?? "");
  const [district, setDistrict] = useState(filter.district ?? "");
  const [suburb, setSuburb] = useState(filter.suburb ?? "");
  const [minBeds, setMinBeds] = useState(filter.min_beds ?? "");
  const [maxPrice, setMaxPrice] = useState(filter.max_price ?? "");
  const [zoning, setZoning] = useState(filter.zoning ?? "");
  const [shown, setShown] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const qs = useMemo(() => {
    // The five keys with a control on this page are OWNED by that control. If
    // they were merged from `filter` as well, seeding a control from an
    // incoming filter would make it impossible to clear: emptying the select
    // would fall back to the filter value and the list would not move — a
    // control that looks alive and does nothing.
    const {
      search: _s, district: _d, suburb: _sb, min_beds: _mb, max_price: _mp,
      zoning: _z,
      ...rest
    } = filter;
    const base: Record<string, string> = { ...rest, order_by: orderBy, order_dir: "desc" };
    if (search.trim()) base.search = search.trim();
    if (district) base.district = district;
    if (suburb) base.suburb = suburb;
    if (minBeds) base.min_beds = minBeds;
    if (maxPrice) base.max_price = maxPrice;
    if (zoning) base.zoning = zoning;
    return base;
  }, [filter, orderBy, search, district, suburb, minBeds, maxPrice, zoning]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setLoading(true);
    setShown(PAGE);
    const listQ = new URLSearchParams({ ...qs, page: "1", page_size: "200" });
    const sumQ = new URLSearchParams(qs);
    Promise.all([
      api<ForSaleList>(`/api/properties?${listQ}`),
      api<Summary>(`/api/properties/summary?${sumQ}`),
    ])
      .then(([list, sum]) => {
        setRows(list.rows);
        setSummary(sum);
        setHero(list.rows.find((r) => r.id === sum.top_id) ?? list.rows[0] ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [qs]);

  // Preview lets you judge a listing where you can actually see it — the photo,
  // the valuation next to the asking price, the margin. Finding one wrong here
  // and then having to remember its address and go and look for it on the admin
  // grid is how a bad listing survives a review, so the two decisions are on
  // the card.
  const [preview, setPreviewOn] = useState(false);
  useEffect(() => setPreviewOn(isPreview()), []);
  // Rows acted on, dropped from the list immediately. Refetching the whole page
  // after each one would lose your scroll position and your place in the list,
  // and the list is long.
  const [gone, setGone] = useState<Set<number>>(new Set());
  const drop = (id: number) => setGone((g) => new Set(g).add(id));

  const rest = rows.filter((r) => r.id !== hero?.id && !gone.has(r.id));

  // Acting on the hero promotes the next best row into its place, so the page
  // never sits with an empty headline while the list underneath is full.
  function afterHero() {
    if (!hero) return;
    drop(hero.id);
    setHero(rest[0] ?? null);
  }

  async function heroHide() {
    if (!hero) return;
    try {
      await api(`/api/admin/listings/${hero.id}/hold?reason=${encodeURIComponent("Hidden by admin")}`,
                { method: "POST" });
      afterHero();
    } catch { /* left in place; the row is still there to try again */ }
  }

  async function heroRemove() {
    if (!hero) return;
    if (!window.confirm(
      `Remove ${hero.address || "this listing"} from the batch?\n\n` +
      "It will be taken out of the totals and will not go live. " +
      "Loading the file again brings it back."
    )) return;
    try {
      await api(`/api/admin/listings/${hero.id}`, { method: "DELETE" });
      afterHero();
    } catch { /* left in place */ }
  }

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 1500, width: "100%" }}>
      {/* ── Header + tiles ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        {/* minWidth:0, or this column refuses to shrink below its longest word.
            "Subdividable" set at 52px is about 370px wide, which is more than a
            390px phone has once the page padding is off — the page ran 9px past
            the screen, and with html/body clipping overflow those 9px were cut
            rather than scrollable. The size scales with the viewport now. */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".24em", color: C.accent, fontWeight: 600 }}>
            {eyebrow ?? t("deal.finder")}
          </div>
          <h1 style={{ fontSize: "clamp(30px, 8.5vw, 52px)", fontWeight: 900,
                       letterSpacing: "-.035em", lineHeight: 1, marginTop: 12 }}>
            {title}
          </h1>
          <p style={{ fontSize: 16, color: C.label, maxWidth: 640, marginTop: 14, lineHeight: 1.5 }}>{blurb}</p>
        </div>
        <div style={{ display: "flex", gap: 10, textAlign: "right" }}>
          <Tile label={t("deal.listings")} value={summary ? (summary.total ?? 0).toLocaleString() : "—"} />
          {metric === "lots" ? (
            <Tile
              label={t("deal.medianLots")}
              value={summary?.median_lots != null ? `+${summary.median_lots.toFixed(0)}` : "—"}
            />
          ) : (
            <Tile
              label={t("deal.medianMargin")}
              value={summary?.median_margin != null ? `+${(summary.median_margin * 100).toFixed(1)}%` : "—"}
              tone={C.good}
            />
          )}
        </div>
      </div>

      {children}

      {/* ── Hero: the single sharpest deal ── */}
      {hero && (
        <section
          style={{
            marginTop: 30,
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
              background: "radial-gradient(600px 300px at 82% 20%, rgba(200,206,214,.12), transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "16px 30px",
              borderBottom: "1px solid rgba(255,255,255,.09)",
              position: "relative",
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: ".22em", color: "#C9CED6" }}>
              ◆ {metric === "lots" ? t("deal.largestSite") : t("deal.sharpestDeal")}
            </span>
            {/* The top card renders separately from the rest, so without this
                the one listing you are most likely to want rid of — the deal
                the page is leading with — is the one you cannot act on. */}
            {preview && (
              <span
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                style={{ display: "flex", gap: 6 }}
              >
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); heroHide(); }}
                  title="Keep this listing off the live site"
                  style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px",
                           borderRadius: 6, border: "1px solid rgba(255,255,255,.35)",
                           background: "transparent", color: "#E7EAEE" }}
                >Hide</button>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); heroRemove(); }}
                  title="Not a real listing — take it out of the batch entirely"
                  style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px",
                           borderRadius: 6, border: "1px solid rgba(255,255,255,.35)",
                           background: "transparent", color: "#FDA29B" }}
                >Remove</button>
              </span>
            )}
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#7C8698", marginLeft: "auto" }}>
              {[hero.suburb, hero.district].filter(Boolean).join(" · ")}
            </span>
          </div>

          <Link
            href={`/property/${hero.id}`}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "24px 30px",
              padding: 30,
              position: "relative",
              color: "inherit",
            }}
          >
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.05, maxWidth: 420 }}>
                {hero.address}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                {[
                  hero.beds != null ? t("deal.bd", { n: hero.beds }) : null,
                  hero.baths != null ? t("deal.ba", { n: hero.baths }) : null,
                  hero.land_area_m2 ? t("deal.landChip", { v: fmtArea(hero.land_area_m2) }) : null,
                  hero.floor_area_m2 ? t("deal.floorChip", { n: Math.round(hero.floor_area_m2) }) : null,
                ]
                  .filter(Boolean)
                  .map((chip) => (
                    <span
                      key={chip as string}
                      style={{
                        fontFamily: MONO,
                        fontSize: 12,
                        background: "rgba(255,255,255,.08)",
                        border: "1px solid rgba(255,255,255,.14)",
                        borderRadius: 8,
                        padding: "6px 11px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {chip}
                    </span>
                  ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 26px", marginTop: 26 }}>
                <HeroStat label={t("deal.listPrice")} value={askingText(hero.asking_price, hero.listing_type, t, true)} />
                <HeroStat label={t("deal.buyPrice")} value={fmtMoneyShort(hero.buy_price)} bright />
                <HeroStat label={t("deal.estValue")} value={fmtMoneyShort(hero.fair_value)} />
              </div>
            </div>

            <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: "#C9CED6" }}>
                {metric === "lots" ? t("deal.additionalLots") : t("deal.marginVsList")}
              </div>
              <div
                className="tnum"
                style={{ fontSize: 64, fontWeight: 900, letterSpacing: "-.04em", lineHeight: 1, marginTop: 8, color: "#6EE7B7" }}
              >
                {metric === "lots"
                  ? `+${hero.max_addl_lots?.toFixed(0) ?? "—"}`
                  : hero.margin != null
                  ? `+${(hero.margin * 100).toFixed(1)}%`
                  : "—"}
              </div>
              <div className="tnum" style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                {metric === "lots"
                  ? hero.best_net_gain != null
                    ? `${fmtMoneyShort(hero.best_net_gain)} ${t("deal.netGain")}`
                    : ""
                  : hero.fair_value != null && hero.asking_price != null
                  ? `${fmtMoneyShort(hero.fair_value - hero.asking_price)} ${t("deal.belowValue")}`
                  : ""}
              </div>
              <Bar
                pct={
                  metric === "lots"
                    ? Math.min((hero.max_addl_lots ?? 0) / 8, 1)
                    : Math.min((hero.margin ?? 0) / metricMax, 1)
                }
                mounted={mounted}
                dark
              />
              <div style={{ fontSize: 12.5, color: "#8A94A6", marginTop: 10, lineHeight: 1.5 }}>
                {hero.confidence ? t("deal.confLine", { conf: conf(hero.confidence) }) : ""}
                {hero.comps_used ? t("deal.compSales", { n: hero.comps_used }) : ""}
                {hero.range_low != null && hero.range_high != null
                  ? t("deal.likelyRange", { lo: fmtMoneyShort(hero.range_low), hi: fmtMoneyShort(hero.range_high) })
                  : ""}
              </div>
            </div>

            <div
              style={{
                flex: "0 0 150px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <Ring value={hero.opportunity_score_pct ?? 0} size={132} mounted={mounted} />
              {hero.can_subdivide && hero.max_addl_lots ? (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 12,
                    fontWeight: 600,
                    background: "rgba(120,125,133,.20)",
                    color: "#C9CED6",
                    border: "1px solid rgba(120,125,133,.5)",
                    borderRadius: 9,
                    padding: "7px 13px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {t("deal.subdividesInto", { n: hero.max_addl_lots.toFixed(0) })}
                </span>
              ) : null}
            </div>
          </Link>
        </section>
      )}

      {/* ── Filter row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 30, flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 11,
            padding: "11px 15px",
            minWidth: 280,
          }}
        >
          <span style={{ width: 14, height: 14, border: "2px solid #8894A6", borderRadius: "50%", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("deal.filterPlaceholder")}
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 14,
              width: "100%",
            }}
          />
        </div>
        <select
          value={district}
          onChange={(e) => {
            setDistrict(e.target.value);
            // A suburb chosen under the old district is almost never inside
            // the new one, and keeping it leaves two filters that cannot both
            // be satisfied — an empty result with nothing saying why.
            setSuburb("");
          }}
          style={DF_SELECT}
        >
          <option value="">{t("ptable.allAreas")}</option>
          {DF_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <SuburbFilter value={suburb} onChange={setSuburb} district={district} />
        <select value={minBeds} onChange={(e) => setMinBeds(e.target.value)} style={DF_SELECT}>
          <option value="">{t("ptable.anyBeds")}</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={String(n)}>{t("ptable.bedsPlus", { n })}</option>)}
        </select>
        <select value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} style={DF_SELECT}>
          <option value="">{t("ptable.anyPrice")}</option>
          {DF_MAX_PRICES.map((p) => (
            <option key={p.v} value={String(p.v)}>{t("ptable.underPrice", { v: p.label })}</option>
          ))}
        </select>
        {/* Only where it is the question being asked. On the underpriced or
            cashflow pages a zone filter is clutter; on a hunt for development
            land it is the first thing you reach for. */}
        {filter.subdividable === "true" && (
          <ZoneFilter value={zoning} onChange={setZoning} style={DF_SELECT} />
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.faint }}>
            {metric === "lots" ? t("deal.sortedByLots") : t("deal.sortedByMargin")}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 12.5, color: C.faint }}>
            {loading ? t("deal.loading") : `${summary?.total.toLocaleString() ?? 0} ${t("deal.listings").toLowerCase()}`}
          </span>
        </div>
      </div>

      {/* ── Deal cards ── */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        {rest.slice(0, shown).map((r, i) => (
          <DealCard key={r.id} r={r} rank={i + 2} metric={metric} metricMax={metricMax} mounted={mounted}
                    preview={preview} onGone={drop} />
        ))}
        {!loading && rest.length === 0 && (
          <div style={{ color: C.label, fontSize: 15, padding: "30px 0" }}>
            {t("deal.noMatch")}
          </div>
        )}
      </div>

      {rest.length > shown && (
        <div style={{ textAlign: "center", marginTop: 26 }}>
          <button
            onClick={() => setShown((n) => n + PAGE)}
            style={{
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              background: C.card,
              color: "#33455E",
              border: `1px solid ${C.border}`,
              borderRadius: 11,
              padding: "13px 28px",
            }}
          >
            {t("deal.loadMore", { total: summary?.total.toLocaleString() ?? "" })}
          </button>
        </div>
      )}
    </div>
  );
}

function DealCard({
  r,
  rank,
  metric,
  metricMax,
  mounted,
  preview = false,
  onGone,
}: {
  r: ForSaleRow;
  rank: number;
  metric: Metric;
  metricMax: number;
  mounted: boolean;
  preview?: boolean;
  onGone?: (id: number) => void;
}) {
  const { t } = useT();
  const typeLabel = useTypeLabel();
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  // The whole card is a link to the property. A button inside it has to stop
  // the click before it becomes a navigation, or acting on a row would send you
  // to the page for the row you were trying to get rid of.
  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function hide(e: React.MouseEvent) {
    stop(e);
    setBusy(true);
    try {
      await api(`/api/admin/listings/${r.id}/hold?reason=${encodeURIComponent("Hidden by admin")}`,
                { method: "POST" });
      onGone?.(r.id);
    } catch { setBusy(false); }
  }

  async function remove(e: React.MouseEvent) {
    stop(e);
    if (!window.confirm(
      `Remove ${r.address || "this listing"} from the batch?\n\n` +
      "It will be taken out of the totals and will not go live. " +
      "Loading the file again brings it back."
    )) return;
    setBusy(true);
    try {
      await api(`/api/admin/listings/${r.id}`, { method: "DELETE" });
      onGone?.(r.id);
    } catch { setBusy(false); }
  }
  const score = r.opportunity_score_pct ?? 0;
  const scoreColor = score >= 95 ? C.accent : C.mono;
  const marginPct = r.margin != null ? r.margin * 100 : null;
  const gap =
    r.fair_value != null && r.asking_price != null ? r.fair_value - r.asking_price : null;
  // Colour off the real number, and stay neutral when there isn't one — a null
  // margin defaulting to 0 rendered "no data" and "loss" as green.
  const signal = marginPct ?? (gap != null ? gap : null);
  const marginColor = signal == null ? C.faint : signal >= 0 ? C.good : C.danger;
  const lots = r.max_addl_lots ?? null;
  const leadLots = metric === "lots";

  return (
    <Link
      href={`/property/${r.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="deal-card"
      style={{
        background: C.card,
        border: `1px solid ${hover ? C.ink : C.border}`,
        borderRadius: 16,
        padding: "16px 20px",
        color: "inherit",
        position: "relative",
        boxShadow: hover
          ? "0 14px 34px -14px rgba(16,24,40,.28)"
          : "0 1px 2px rgba(16,24,40,.04), 0 6px 16px -8px rgba(16,24,40,.18)",
        transform: hover ? "translateY(-2px)" : undefined,
        transition: "border-color .15s, box-shadow .15s, transform .15s",
      }}
    >
      {/* Preview only. Positioned over the card rather than in the flow so the
          customer layout is byte-identical when preview is off. */}
      {preview && (
        <div
          onClick={stop}
          style={{ position: "absolute", top: 8, right: 8, zIndex: 2,
                   display: "flex", gap: 6 }}
        >
          <button
            onClick={hide}
            disabled={busy}
            title="Keep this listing off the live site — it stays in the batch and can be released later"
            style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px",
                     borderRadius: 6, border: `1px solid ${C.border}`,
                     background: "#fff", color: C.ink, opacity: busy ? .5 : 1 }}
          >Hide</button>
          <button
            onClick={remove}
            disabled={busy}
            title="Not a real listing — take it out of the batch entirely"
            style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px",
                     borderRadius: 6, border: "1px solid #B42318",
                     background: "#fff", color: "#B42318", opacity: busy ? .5 : 1 }}
          >Remove</button>
        </div>
      )}

      <div className="deal-card__photo">
        <PhotoStrip urls={photos(r)} height={132} />
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="tnum" style={{ fontFamily: MONO, fontSize: 11, color: C.mono }}>
            {String(rank).padStart(2, "0")}
          </span>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.15 }}>{r.address}</div>
        </div>
        <div style={{ fontSize: 13, color: "#6E7C90", marginTop: 5, marginLeft: 26 }}>
          {r.suburb} · {typeLabel(r.property_type)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 11, marginLeft: 26 }}>
          {[
            r.beds != null ? t("deal.bd", { n: r.beds }) : null,
            r.baths != null ? t("deal.ba", { n: r.baths }) : null,
            r.land_area_m2 ? fmtArea(r.land_area_m2) : null,
            r.floor_area_m2 ? t("deal.floorM2", { n: Math.round(r.floor_area_m2) }) : null,
          ]
            .filter(Boolean)
            .map((chip) => (
              <span
                key={chip as string}
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.label,
                  background: C.chipBg,
                  borderRadius: 6,
                  padding: "4px 8px",
                  whiteSpace: "nowrap",
                }}
              >
                {chip}
              </span>
            ))}
        </div>
      </div>

      {/* One container, not four grid tracks: list / estimate / buy / margin
          must reflow as a unit, or a narrow window wraps the margin onto its own
          row and leaves a dead band through the middle of the card. */}
      <div className="deal-card__figures">
        <Money label={t("deal.listPrice")} value={askingText(r.asking_price, r.listing_type, t, true)} muted strike />
        <Money label={t("deal.estValue")} value={fmtMoneyShort(r.fair_value)} />
        <Money label={t("deal.buyPrice")} value={fmtMoneyShort(r.buy_price)} strong />

      <div className="deal-card__margin" style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <div
              className="tnum"
              style={{
                fontSize: 30,
                fontWeight: 900,
                letterSpacing: "-.03em",
                color: leadLots ? C.accent : marginColor,
              }}
            >
              {leadLots
                ? lots != null
                  ? `+${lots.toFixed(0)}`
                  : "—"
                : marginPct != null
                ? `${marginPct > 0 ? "+" : ""}${marginPct.toFixed(1)}%`
                : "—"}
            </div>
            <div
              className="tnum"
              style={{ fontSize: 15, fontWeight: 700, color: leadLots ? C.accent : marginColor }}
            >
              {leadLots
                ? r.best_net_gain != null
                  ? t("deal.gain", { v: fmtMoneyShort(r.best_net_gain) })
                  : ""
                : gap != null
                ? `${gap >= 0 ? "+" : "−"}${fmtMoneyShort(Math.abs(gap))}`
                : ""}
            </div>
          </div>
          <Bar
            pct={
              leadLots
                ? Math.min((lots ?? 0) / 8, 1)
                : Math.min(Math.max((r.margin ?? 0) / metricMax, 0), 1)
            }
            mounted={mounted}
          />
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.mono, marginTop: 7 }}>
            {r.days_on_market != null ? t("deal.dOnMarket", { n: Math.round(r.days_on_market) }) : t("deal.newListing")}
            {r.est_gross_yield != null ? t("deal.yieldMeta", { v: (r.est_gross_yield * 100).toFixed(1) }) : ""}
          </div>
        </div>
      </div>

      <div className="deal-card__pills">
          {!leadLots && r.can_subdivide && r.max_addl_lots ? (
            <Pill>{t("deal.lotsPill", { n: r.max_addl_lots.toFixed(0) })}</Pill>
          ) : null}
          {r.is_underpriced && <Pill>{t("deal.underpriced")}</Pill>}
        </div>

    </Link>
  );
}

function Money({
  label,
  value,
  strong,
  muted,
  strike,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  strike?: boolean;
}) {
  return (
    <div className="deal-card__money" style={{ minWidth: 0 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".12em", color: C.mono }}>
        {label}
      </div>
      <div
        className="tnum"
        style={{
          fontSize: strong ? 21 : 17,
          fontWeight: strong ? 800 : 600,
          letterSpacing: "-.02em",
          marginTop: 5,
          color: strong ? C.accent : muted ? "#6E7C90" : C.ink,
          textDecoration: strike ? "line-through" : undefined,
          textDecorationColor: "#B8C2CF",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: "14px 20px",
        minWidth: 110,
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>{label}</div>
      <div className="tnum" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", marginTop: 4, color: tone }}>
        {value}
      </div>
    </div>
  );
}

function HeroStat({ label, value, bright }: { label: string; value: string; bright?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: bright ? "#C9CED6" : "#7C8698" }}>
        {label}
      </div>
      <div
        className="tnum"
        style={{ fontSize: 22, fontWeight: bright ? 800 : 700, marginTop: 5, color: bright ? "#C9CED6" : undefined }}
      >
        {value}
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        alignSelf: "flex-start",
        background: "#EDEFF2",
        color: C.accent,
        border: "1px solid #DDE1E7",
        borderRadius: 8,
        padding: "5px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Bar({ pct, mounted, dark }: { pct: number; mounted: boolean; dark?: boolean }) {
  return (
    <div
      style={{
        height: dark ? 9 : 8,
        borderRadius: 99,
        background: dark ? "rgba(255,255,255,.12)" : "#E7ECF2",
        marginTop: dark ? 18 : 11,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${(mounted ? pct : 0) * 100}%`,
          height: "100%",
          background: dark ? "linear-gradient(90deg,#7C828C,#C9CED6)" : "linear-gradient(90deg,#333A43,#7C828C)",
          borderRadius: 99,
          transition: "width 1s cubic-bezier(.2,.8,.2,1)",
        }}
      />
    </div>
  );
}

function Ring({
  value,
  size,
  light,
  color,
  mounted,
  showLabel = true,
}: {
  value: number;
  size: number;
  light?: boolean;
  color?: string;
  mounted: boolean;
  showLabel?: boolean;
}) {
  const { t } = useT();
  const pct = Math.max(0, Math.min(100, value));
  const fill = color ?? "#C9CED6";
  const track = light ? "#E7ECF2" : "rgba(255,255,255,.12)";
  const inset = size > 100 ? 11 : light ? 5 : 6;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
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
          background: `conic-gradient(${fill} ${(mounted ? pct : 0) * 3.6}deg, ${track} 0deg)`,
          transition: "background 1s cubic-bezier(.2,.8,.2,1)",
        }}
      />
      <div style={{ position: "absolute", inset, borderRadius: "50%", background: light ? "#FFFFFF" : C.dark }} />
      <div style={{ position: "relative", textAlign: "center" }}>
        <div
          className="tnum"
          style={{
            fontSize: size > 100 ? 44 : 21,
            fontWeight: 900,
            letterSpacing: "-.03em",
            lineHeight: 1,
            color: light ? fill : "#C9CED6",
          }}
        >
          {pct.toFixed(0)}
        </div>
        {showLabel && (
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".16em", color: "#7C8698", marginTop: 3 }}>
            {t("deal.buyScore")}
          </div>
        )}
      </div>
    </div>
  );
}
