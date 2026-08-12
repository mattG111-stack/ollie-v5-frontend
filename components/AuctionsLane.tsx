"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type ForSaleList, type ForSaleRow } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT, useTypeLabel } from "@/lib/i18n";
import SuburbFilter from "./SuburbFilter";

/* Auctions lane — the no-price listings (auction / tender / by-negotiation).
 *
 * These have no real asking, so there is no "margin vs list price" to show. What
 * we CAN stand behind — all asking-free — is our estimate (fair_value, valued off
 * three agreeing signals), a comps-based BUY CEILING (0.95 × area value = the most
 * a disciplined buyer should bid), and the HEADROOM between them. Ranked by
 * headroom, biggest first. Deliberately its own lane so the asking-based deal
 * feeds stay clean. */

const BLUE = "#2563EB";

function photos(r: ForSaleRow): string[] {
  return (r.image_urls ?? "").split("\n").map((u) => u.trim()).filter(Boolean);
}

export default function AuctionsLane() {
  const { t } = useT();
  const typeLabel = useTypeLabel();
  const [rows, setRows] = useState<ForSaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [suburb, setSuburb] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams({
      auction: "true",
      order_by: "auction_headroom",
      order_dir: "desc",
      page_size: "120",
    });
    if (search.trim()) p.set("search", search.trim());
    if (suburb) p.set("suburb", suburb);
    return p.toString();
  }, [search, suburb]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<ForSaleList>(`/api/properties?${query}`)
      .then((d) => alive && (setRows(d.rows), setErr(null)))
      .catch((e) => alive && setErr(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [query]);

  const hero = rows[0];
  const rest = hero ? rows.slice(1) : rows;

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "24px 22px 60px" }}>
      <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: BLUE, fontWeight: 700 }}>
        {t("auc.kicker")}
      </div>
      <h1 style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1.02, marginTop: 10 }}>
        {t("auc.title")}
      </h1>
      <p style={{ fontSize: 15.5, color: "#5A6B82", maxWidth: 680, marginTop: 12, lineHeight: 1.5 }}>
        {t("auc.blurb")}
      </p>

      <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("auc.searchPlaceholder")}
          style={{ background: "#F4F6FA", border: "1px solid #E4E9F0", borderRadius: 10, padding: "10px 14px", fontSize: 14, width: "min(320px, 100%)" }}
        />
        <SuburbFilter value={suburb} onChange={setSuburb} width={200} />
      </div>

      {loading && <p style={{ marginTop: 26, color: "#6B7A90" }}>{t("auc.loading")}</p>}
      {err && <p style={{ marginTop: 26, color: "#DC2626" }}>{t("auc.error")}</p>}
      {!loading && !err && rows.length === 0 && (
        <p style={{ marginTop: 26, color: "#6B7A90" }}>{t("auc.empty")}</p>
      )}

      {hero && (
        <Link href={`/property/${hero.id}`} style={{ display: "block", marginTop: 24, textDecoration: "none", color: "inherit" }}>
          <div style={{ background: "linear-gradient(135deg,#0F1B2E,#1A2A44)", borderRadius: 18, padding: 26, color: "#fff", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            {photos(hero)[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos(hero)[0]} alt="" style={{ width: 132, height: 100, objectFit: "cover", borderRadius: 12, flex: "none" }} />
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, letterSpacing: ".12em", color: "#9DB2D4", textTransform: "uppercase" }}>
                ◆ {t("auc.biggestHeadroom")} · {[hero.suburb, hero.district].filter(Boolean).join(" · ")}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.02em", marginTop: 8 }}>{hero.address}</div>
              <div style={{ display: "flex", gap: "16px 26px", flexWrap: "wrap", marginTop: 18 }}>
                <HeroStat label={t("auc.estimate")} value={fmtMoneyShort(hero.fair_value)} />
                <HeroStat label={t("auc.buyCeiling")} value={fmtMoneyShort(hero.auction_ceiling)} bright />
                <HeroStat label={t("auc.method")} value={t(`auc.type.${(hero.listing_type || "negotiation")}`)} />
              </div>
            </div>
            <div style={{ textAlign: "right", minWidth: 150 }}>
              <div style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 10.5, letterSpacing: ".1em", color: "#9DB2D4", textTransform: "uppercase" }}>
                {t("auc.headroom")}
              </div>
              <div className="tnum" style={{ fontSize: 46, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 1, marginTop: 6, color: "#6EE7B7" }}>
                {fmtMoneyShort(hero.auction_headroom)}
              </div>
              <div style={{ fontSize: 12, color: "#9DB2D4", marginTop: 6 }}>{t("auc.headroomNote")}</div>
            </div>
          </div>
        </Link>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 16, marginTop: 22 }}>
        {rest.map((r) => (
          <AuctionCard key={r.id} r={r} t={t} typeLabel={typeLabel} />
        ))}
      </div>
    </div>
  );
}

function HeroStat({ label, value, bright }: { label: string; value: string; bright?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: ".06em", textTransform: "uppercase", color: "#9DB2D4", fontWeight: 700 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 20, fontWeight: 800, marginTop: 3, color: bright ? "#BFDBFE" : "#fff" }}>{value}</div>
    </div>
  );
}

function AuctionCard({ r, t, typeLabel }: { r: ForSaleRow; t: (k: string, v?: Record<string, string | number>) => string; typeLabel: (x: string | null | undefined) => string }) {
  const img = photos(r)[0];
  return (
    <Link href={`/property/${r.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ background: "#fff", border: "1px solid #E4E9F0", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.05)", height: "100%" }}>
        <div style={{ position: "relative", height: 150, background: "#EEF1F6" }}>
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <span style={{ position: "absolute", top: 10, left: 10, background: BLUE, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 7, letterSpacing: ".02em" }}>
            {t(`auc.type.${(r.listing_type || "negotiation")}`)}
          </span>
        </div>
        <div style={{ padding: "13px 15px 16px" }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{r.address}</div>
          <div style={{ fontSize: 12.5, color: "#6B7A90", marginTop: 2 }}>
            {[r.suburb, typeLabel(r.property_type)].filter(Boolean).join(" · ")}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 14 }}>
            <Cell label={t("auc.estimate")} value={fmtMoneyShort(r.fair_value)} />
            <Cell label={t("auc.buyCeiling")} value={fmtMoneyShort(r.auction_ceiling)} />
            <Cell label={t("auc.headroom")} value={fmtMoneyShort(r.auction_headroom)} tone="good" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, letterSpacing: ".05em", textTransform: "uppercase", color: "#9AA6B6", fontWeight: 700 }}>{label}</div>
      <div className="tnum" style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: tone === "good" ? "#16A34A" : "#14233A" }}>{value}</div>
    </div>
  );
}
