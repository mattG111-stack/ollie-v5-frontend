"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ForSaleList, ForSaleRow, api } from "@/lib/api";
import { fmtMoneyShort, fmtNumber, fmtPct } from "@/lib/format";
import { useT, useTypeLabel } from "@/lib/i18n";

// Leaflet touches window on import, so the map is client-only (no SSR).
const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface Props {
  initialFilter?: Record<string, string>;
  showFilters?: boolean;
  pageSize?: number;
  /** Default sort column. Deal-finder pages lead with their own signal rather
   *  than the blended buy score — biggest discount first on Underpriced. */
  initialOrderBy?: string;
}

const CATEGORIES = ["House", "Townhouse", "Apartment", "Unit", "Section", "Lifestyle"];
const CAT_KEY: Record<string, string> = { House: "ptable.house", Townhouse: "ptable.townhouse", Apartment: "ptable.apartment", Unit: "ptable.unit", Section: "ptable.section", Lifestyle: "ptable.lifestyle" };
// Auckland's legacy districts (as stored on each listing). Place names stay in
// English, like suburbs.
const DISTRICTS = [
  "Auckland City", "North Shore City", "Waitakere City", "Manukau City",
  "Rodney", "Franklin", "Papakura", "Waiheke Island", "Hauraki Gulf Islands",
];
const BEDS = [1, 2, 3, 4, 5];
const MAX_PRICES: { v: number; label: string }[] = [
  { v: 1_000_000, label: "$1M" },
  { v: 1_500_000, label: "$1.5M" },
  { v: 2_000_000, label: "$2M" },
  { v: 3_000_000, label: "$3M" },
  { v: 5_000_000, label: "$5M" },
];

const SORT_OPTIONS = [
  { key: "opportunity_score_pct", label: "Score" },
  { key: "margin_dollars", label: "Margin $" },
  { key: "margin", label: "Margin %" },
  { key: "asking_price", label: "List price" },
  { key: "buy_price", label: "Est. buy price" },
  { key: "fair_value", label: "Est. value" },
  { key: "cash_on_cash", label: "Yield" },
  { key: "max_addl_lots", label: "Lots" },
  { key: "predicted_days", label: "Days" },
];

export default function PropertiesTable({
  initialFilter = {},
  showFilters = true,
  pageSize = 50,
  initialOrderBy = "opportunity_score_pct",
}: Props) {
  const { t } = useT();
  const [filters, setFilters] = useState<Record<string, string>>(initialFilter);
  const [orderBy, setOrderBy] = useState<string>(initialOrderBy);
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ForSaleList | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const [mapDataset, setMapDataset] = useState<"for_sale" | "sold">("for_sale");

  useEffect(() => {
    if (view === "map") return;   // the map fetches its own points
    setLoading(true);
    const qs = new URLSearchParams({
      ...filters,
      order_by: orderBy,
      order_dir: orderDir,
      page: String(page),
      page_size: String(pageSize),
    });
    api<ForSaleList>(`/api/properties?${qs.toString()}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filters, orderBy, orderDir, page, pageSize, view]);

  function setFilter(k: string, v: string | null) {
    setFilters((prev) => {
      const next = { ...prev };
      if (v == null || v === "") delete next[k];
      else next[k] = v;
      return next;
    });
    setPage(1);
  }

  function toggleSort(key: string) {
    if (orderBy === key) {
      setOrderDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setOrderBy(key);
      setOrderDir("desc");
    }
  }

  const pageCount = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <>
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <div className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-2 text-sm">
            <span className="text-faint text-xs">🔍</span>
            <input
              placeholder={t("ptable.filter")}
              value={filters.search ?? ""}
              onChange={(e) => setFilter("search", e.target.value)}
              className="bg-transparent outline-none border-0 w-56"
            />
          </div>
          <select
            value={filters.category ?? ""}
            onChange={(e) => setFilter("category", e.target.value || null)}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-muted outline-none focus:border-blue cursor-pointer"
          >
            <option value="">{t("ptable.allTypes")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(CAT_KEY[c] ?? c)}
              </option>
            ))}
          </select>
          <select
            value={filters.district ?? ""}
            onChange={(e) => setFilter("district", e.target.value || null)}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-muted outline-none focus:border-blue cursor-pointer"
          >
            <option value="">{t("ptable.allAreas")}</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={filters.min_beds ?? ""}
            onChange={(e) => setFilter("min_beds", e.target.value || null)}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-muted outline-none focus:border-blue cursor-pointer"
          >
            <option value="">{t("ptable.anyBeds")}</option>
            {BEDS.map((n) => (
              <option key={n} value={String(n)}>{t("ptable.bedsPlus", { n })}</option>
            ))}
          </select>
          <select
            value={filters.max_price ?? ""}
            onChange={(e) => setFilter("max_price", e.target.value || null)}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm text-muted outline-none focus:border-blue cursor-pointer"
          >
            <option value="">{t("ptable.anyPrice")}</option>
            {MAX_PRICES.map((p) => (
              <option key={p.v} value={String(p.v)}>{t("ptable.underPrice", { v: p.label })}</option>
            ))}
          </select>
          <FilterChip
            active={filters.underpriced === "true"}
            onClick={() => setFilter("underpriced", filters.underpriced === "true" ? null : "true")}
            color="#0A8754"
          >
            {t("ptable.underpriced")}
          </FilterChip>
          <FilterChip
            active={filters.cashflow_positive === "true"}
            onClick={() =>
              setFilter("cashflow_positive", filters.cashflow_positive === "true" ? null : "true")
            }
            color="#0E8C8C"
          >
            {t("ptable.cashflowPlus")}
          </FilterChip>
          <FilterChip
            active={filters.subdividable === "true"}
            onClick={() => setFilter("subdividable", filters.subdividable === "true" ? null : "true")}
            color="#FF6A00"
          >
            {t("nav.subdividable")}
          </FilterChip>
          <FilterChip
            active={filters.min_score === "70"}
            onClick={() => setFilter("min_score", filters.min_score === "70" ? null : "70")}
            color="#2E7DF6"
          >
            {t("ptable.score70")}
          </FilterChip>
          {Object.keys(filters).length > 0 && (
            <button
              onClick={() => {
                setFilters({});
                setPage(1);
              }}
              className="text-xs text-muted hover:text-text underline ml-2"
            >
              {t("ptable.clear")}
            </button>
          )}
          <div className="flex-1" />
          {/* For-sale / Sold — only meaningful on the map */}
          {view === "map" && (
            <div className="flex items-center bg-white border border-line rounded-lg overflow-hidden text-sm mr-1">
              <ViewTab active={mapDataset === "for_sale"} onClick={() => setMapDataset("for_sale")}>
                {t("map.forSale")}
              </ViewTab>
              <ViewTab active={mapDataset === "sold"} onClick={() => setMapDataset("sold")}>
                {t("map.soldInArea")}
              </ViewTab>
            </div>
          )}
          {/* List / Map view toggle */}
          <div className="flex items-center bg-white border border-line rounded-lg overflow-hidden text-sm">
            <ViewTab active={view === "list"} onClick={() => setView("list")}>{t("map.listView")}</ViewTab>
            <ViewTab active={view === "map"} onClick={() => setView("map")}>{t("map.mapView")}</ViewTab>
          </div>
          {view === "list" && (
            <span className="text-xs text-muted flex items-center gap-1.5 ml-1">
              {loading && (
                <span className="inline-block w-3 h-3 border-2 border-blue/30 border-t-blue rounded-full animate-spin" />
              )}
              {data ? t("ptable.listingsN", { n: (data.total ?? 0).toLocaleString() }) : loading ? t("ptable.loading") : ""}
            </span>
          )}
        </div>
      )}

      {view === "map" && (
        <MapView dataset={mapDataset} filters={filters} />
      )}

      {view === "list" && (
      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden relative">
        {/* Indeterminate progress bar — visible while a request is in flight */}
        {loading && (
          <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden z-10">
            <div className="h-full w-1/3 bg-blue animate-loaderbar" />
          </div>
        )}
        <div className="overflow-x-auto">
          <table
            className={`w-full text-sm transition-opacity duration-150 ${loading ? "opacity-60" : "opacity-100"}`}
            aria-busy={loading}
          >
            <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
              <tr>
                <Th>{t("ptable.property")}</Th>
                <Th align="right">{t("ptable.bd")}</Th>
                <Th align="right">{t("ptable.ba")}</Th>
                <Th align="right">{t("ptable.land")}</Th>
                <Th align="right">{t("ptable.floor")}</Th>
                <Th align="right">{t("ptable.listPrice")}</Th>
                <SortableTh
                  active={orderBy === "buy_price"}
                  dir={orderBy === "buy_price" ? orderDir : null}
                  onClick={() => toggleSort("buy_price")}
                  align="right"
                >
                  {t("ptable.buyPrice")}
                </SortableTh>
                <SortableTh
                  active={orderBy === "fair_value"}
                  dir={orderBy === "fair_value" ? orderDir : null}
                  onClick={() => toggleSort("fair_value")}
                  align="right"
                >
                  {t("ptable.estValue")}
                </SortableTh>
                <SortableTh
                  active={orderBy === "margin_dollars"}
                  dir={orderBy === "margin_dollars" ? orderDir : null}
                  onClick={() => toggleSort("margin_dollars")}
                  align="right"
                >
                  {t("ptable.marginD")}
                </SortableTh>
                <SortableTh
                  active={orderBy === "margin"}
                  dir={orderBy === "margin" ? orderDir : null}
                  onClick={() => toggleSort("margin")}
                  align="right"
                >
                  {t("ptable.marginPct")}
                </SortableTh>
                <SortableTh
                  active={orderBy === "cash_on_cash"}
                  dir={orderBy === "cash_on_cash" ? orderDir : null}
                  onClick={() => toggleSort("cash_on_cash")}
                  align="right"
                >
                  {t("ptable.yield")}
                </SortableTh>
                <SortableTh
                  active={orderBy === "max_addl_lots"}
                  dir={orderBy === "max_addl_lots" ? orderDir : null}
                  onClick={() => toggleSort("max_addl_lots")}
                  align="right"
                >
                  {t("ptable.lots")}
                </SortableTh>
                <SortableTh
                  active={orderBy === "days_on_market"}
                  dir={orderBy === "days_on_market" ? orderDir : null}
                  onClick={() => toggleSort("days_on_market")}
                  align="right"
                >
                  {t("ptable.onMkt")}
                </SortableTh>
                <SortableTh
                  active={orderBy === "opportunity_score_pct"}
                  dir={orderBy === "opportunity_score_pct" ? orderDir : null}
                  onClick={() => toggleSort("opportunity_score_pct")}
                  align="right"
                >
                  {t("ptable.score")}
                </SortableTh>
                <Th>{t("ptable.flags")}</Th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <PropertyRow key={r.id} row={r} />
              ))}
              {data?.rows.length === 0 && (
                <tr>
                  <td colSpan={16} className="text-center text-muted py-12 text-sm">
                    {t("ptable.noMatch")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-line2 px-4 py-2.5 flex items-center justify-between text-xs text-muted">
          <span>
            {t("ptable.pageOf", { page: page, total: pageCount.toLocaleString() })}
            {data ? ` · ${t("ptable.listingsN", { n: (data.total ?? 0).toLocaleString() })}` : ""}
          </span>
          <div className="flex gap-1.5">
            <PageBtn disabled={page <= 1} onClick={() => setPage(1)}>
              {t("ptable.first")}
            </PageBtn>
            <PageBtn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("ptable.prev")}
            </PageBtn>
            <PageBtn disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
              {t("ptable.next")}
            </PageBtn>
            <PageBtn disabled={page >= pageCount} onClick={() => setPage(pageCount)}>
              {t("ptable.last")}
            </PageBtn>
          </div>
        </div>
      </div>
      )}
    </>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 font-medium transition-colors ${active ? "bg-blue text-white" : "text-muted hover:bg-paper"}`}
    >
      {children}
    </button>
  );
}

function PropertyRow({ row: r }: { row: ForSaleRow }) {
  const { t } = useT();
  const typeLabel = useTypeLabel();
  // Margin = how far the independent fair value sits above (or below) asking.
  // Positive (green) = fair value exceeds asking → potential deal.
  // Shown as a dollar difference (headline) + percentage (context).
  const margin = r.margin;
  const marginDollars =
    r.fair_value != null && r.asking_price != null ? r.fair_value - r.asking_price : null;
  const marginColor =
    margin == null ? "text-faint" : margin >= 0.05 ? "text-under font-semibold" : margin <= -0.05 ? "text-danger" : "text-text";
  return (
    <tr
      className="border-t border-line2 hover:bg-paper/50 cursor-pointer"
      onClick={(e) => {
        // Whole row opens the property. Ignore clicks that landed on a real
        // link or control so those keep their own behaviour.
        const el = e.target as HTMLElement;
        if (el.closest("a,button,input,select")) return;
        window.location.href = `/property/${r.id}`;
      }}
    >
      <td className="px-3 py-2.5">
        <Link href={`/property/${r.id}`} className="font-display font-semibold hover:text-blue">
          {r.address}
        </Link>
        <div className="text-[11px] text-faint">
          {r.suburb} · {typeLabel(r.property_type)}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.beds ?? "—"}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.baths ?? "—"}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
        {r.land_area_m2 ? (r.land_area_m2 >= 10000 ? `${(r.land_area_m2 / 10000).toFixed(1)} ha` : `${Math.round(r.land_area_m2)} m²`) : "—"}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
        {r.floor_area_m2 ? `${Math.round(r.floor_area_m2)} m²` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoneyShort(r.asking_price)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-under">{fmtMoneyShort(r.buy_price)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {r.is_premium ? <span className="text-faint text-xs">{t("ptable.premium")}</span> : fmtMoneyShort(r.fair_value)}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${marginColor}`}>
        {marginDollars != null
          ? `${marginDollars > 0 ? "+" : marginDollars < 0 ? "−" : ""}${fmtMoneyShort(Math.abs(marginDollars))}`
          : "—"}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${marginColor}`}>
        {margin != null ? `${margin > 0 ? "+" : ""}${fmtPct(margin, 1)}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(r.est_gross_yield, 1)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.max_addl_lots ?? "—"}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">
        {r.days_on_market != null ? (
          <span className={r.days_on_market > 90 ? "text-danger" : ""}>{Math.round(r.days_on_market)}d</span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <ScorePill v={r.opportunity_score_pct} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1 flex-wrap">
          {r.pricing_path === "asking" && <Chip color="#2E7DF6">{t("ptable.listed")}</Chip>}
          {r.is_underpriced && <Chip color="#0A8754">{t("ptable.underpriced")}</Chip>}
          {r.is_cashflow_positive && <Chip color="#0E8C8C">{t("ptable.cashflow")}</Chip>}
          {r.is_subdividable && <Chip color="#FF6A00">{t("ptable.subdiv")}</Chip>}
        </div>
      </td>
    </tr>
  );
}

function ScorePill({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-faint">—</span>;
  let bg = "#8A98AD";
  if (v >= 80) bg = "#0A8754";
  else if (v >= 60) bg = "#0E9AA0";
  else if (v >= 40) bg = "#5A6B85";
  return (
    <span
      className="inline-block text-white text-xs font-display font-bold rounded-md px-2 py-0.5 tabular-nums"
      style={{ background: bg, minWidth: 32 }}
    >
      {v.toFixed(0)}
    </span>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: `${color}18`, color }}
    >
      {children}
    </span>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <th className={`px-3 py-2.5 text-left ${align === "right" ? "text-right" : ""}`}>{children}</th>;
}

function SortableTh({
  children,
  active,
  dir,
  onClick,
  align,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: "asc" | "desc" | null;
  onClick: () => void;
  align?: "right";
}) {
  return (
    <th className={`px-3 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 ${active ? "text-blue" : ""} hover:text-text`}
      >
        {children}
        <span className="text-[8px]">{active ? (dir === "desc" ? "▼" : "▲") : "▾"}</span>
      </button>
    </th>
  );
}

function FilterChip({
  children,
  active,
  onClick,
  color,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
        active ? "text-white border-transparent" : "bg-white text-muted border-line hover:border-blue"
      }`}
      style={active ? { background: color } : undefined}
    >
      {children}
    </button>
  );
}

function PageBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 rounded border border-line bg-white hover:border-blue disabled:opacity-40 disabled:hover:border-line"
    >
      {children}
    </button>
  );
}
