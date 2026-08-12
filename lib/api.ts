// Empty/unset NEXT_PUBLIC_API_BASE => "" => the browser calls /api on the SAME
// origin, which the next.config rewrite proxies to the local backend. This is
// what makes the app reachable through a single tunnel URL with no CORS. Set an
// absolute URL (e.g. http://localhost:8000) only if you want the browser to hit
// the backend directly instead of via the proxy.
// Hard-wired to same-origin: the browser ALWAYS calls /api on this site's own
// domain, and next.config.js proxies it to the backend server-side. This makes
// CORS structurally impossible — no NEXT_PUBLIC_API_BASE env var can flip it back
// to a cross-origin call. (Kept intentionally not-configurable after CORS/env
// churn made the direct-call mode a footgun.)
const API_BASE = "";

export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ollie_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("ollie_token", token);
  else localStorage.removeItem("ollie_token");
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    // Expired or invalid token — clear and bounce to sign-in instead of crashing the page.
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth/sign-in")) {
      setToken(null);
      if (!window.location.pathname.startsWith("/sign-in")) {
        window.location.href = "/sign-in";
      }
    }
    // Authenticated but no active subscription — route to onboarding/paywall.
    if (res.status === 402 && typeof window !== "undefined" && !window.location.pathname.startsWith("/onboarding")) {
      window.location.href = "/onboarding";
    }
    // HTTP/2 (Railway) sends an empty statusText, so fall back to the code — an
    // opaque "request failed" hid real 500s. Now the UI shows e.g. "HTTP 500".
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ---------- Typed shapes (kept loose for now) ----------
export interface Me {
  id: number;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected" | "deactivated";
  // self-serve onboarding state
  email_verified: boolean;
  phone_verified: boolean;
  subscription_status: string | null;
  trial_ends_at: string | null;
  has_access: boolean;
  next_step: "verify_email" | "verify_phone" | "add_card" | "done";
  llm_key_managed: boolean;
}

export interface ForSaleRow {
  id: number;
  address: string | null;
  suburb: string | null;
  district: string | null;
  region: string | null;
  property_type: string | null;
  type_of_title: string | null;
  zoning: string | null;
  land_slope_contour: string | null;
  beds: number | null;
  baths: number | null;
  cars: number | null;
  floor_area_m2: number | null;
  land_area_m2: number | null;
  cv_numeric: number | null;
  land_value_numeric: number | null;
  improvement_value_numeric: number | null;
  asking_price: number | null;
  market_value: number | null;
  predicted_list: number | null;
  predicted_days: number | null;
  comps_used: number | null;
  confidence: string | null;
  pred_vs_cv: number | null;
  pred_vs_listing: number | null;
  // v4 production AVM
  listing_type: string | null;     // fixed | auction | tender | negotiation | unknown
  pricing_path: string | null;     // asking | v35 | insufficient
  range_low: number | null;        // honest band low end
  range_high: number | null;       // honest band high end
  subdivision_premium: number | null;
  fair_value: number | null;       // independent CV-bounded hedonic fair value
  margin: number | null;           // (fair_value/asking - 1); positive = potential deal
  is_premium: boolean | null;      // ultra-prime: priced off listing, no model valuation
  is_auction: boolean | null;      // no-price listing valued off agreeing signals (Auctions lane)
  auction_ceiling: number | null;  // walk-away price: 0.95 × area_value (server-computed)
  auction_headroom: number | null; // estimate − ceiling (server-computed)
  buy_price: number | null;        // acquisition buy price (0.95 × MIN(asking, area value))
  area_value: number | null;       // comp-derived area value
  comp_tier: number | null;        // 1-6 cascade tier; null = v4 fallback
  comps_matched: number | null;
  sections: number | null;         // subdivision: number of sections
  dwellings: number | null;        // sections × max dwellings per lot
  section_rate: number | null;     // $/m² used
  section_value_method: string | null; // bare_section_sales | council_land_value | fallback
  gross_sales: number | null;
  subdivision_profit: number | null;
  // v3.5/v3.8 legacy diagnostics (only populated on v3.5 fallback path)
  pred_v35: number | null;
  pred_v38: number | null;
  z_weight: number | null;
  beta_tier: string | null;
  cv_anchor: number | null;
  cv_ratio_tier: string | null;
  correction_used: string | null;
  min_lot_m2: number | null;
  max_addl_lots: number | null;
  total_subdivided_value: number | null;
  uplift_vs_asking: number | null;
  est_weekly_rent: number | null;
  est_gross_yield: number | null;
  annual_cashflow: number | null;
  cash_on_cash: number | null;
  breakeven_deposit_pct: number | null;
  // What we think it will transact at (expected_sale) + its confidence band.
  expected_sale: number | null;
  expected_sale_path: string | null;
  expected_sale_band: number | null;
  opportunity_score: number | null;
  opportunity_score_pct: number | null;
  best_strategy: string | null;
  best_net_gain: number | null;
  is_underpriced: boolean;
  is_cashflow_positive: boolean;
  is_subdividable: boolean;
  url: string | null;
  image_url: string | null;
  image_count: number | null;
  image_urls: string | null;
  latitude: number | null;
  longitude: number | null;
  listing_date: string | null;
  days_on_market: number | null;
  // Scraper fields
  key_facts: string | null;
  key_time_on_market: string | null;
  estate_description: string | null;
  council_valuation_summary: string | null;
  property_trend: string | null;
  last_updated: string | null;
  // Third-party reference valuation
  third_party_valuation: number | null;
  third_party_valuation_high: number | null;
  third_party_valuation_low: number | null;
  valuation_last_date: string | null;
  // CV change
  valuation_rateable_change_pct: number | null;
  valuation_land_change_pct: number | null;
  valuation_improvement_change_pct: number | null;
  // Last sale
  valuation_last_sold_value: number | null;
  valuation_last_sold_date: string | null;
  sold_listing_date: string | null;
  sold_listing_price_label: string | null;
  // Trend JSONs (raw strings; parse client-side)
  valuation_trend_yearly_json: string | null;
  valuation_trend_monthly_json: string | null;
  sale_history_json: string | null;
  cv_history_json: string | null;
  schools_json: string | null;
  // Agents
  agent1_name: string | null;
  agent1_phone: string | null;
  agent1_email: string | null;
  agent1_job_title: string | null;
  agent1_company_name: string | null;
  agent2_name: string | null;
  agent2_phone: string | null;
  agent2_email: string | null;
  agent2_job_title: string | null;
  agent2_company_name: string | null;
  company_name: string | null;
  // Features
  building_age: string | null;
  has_swimming_pool: boolean | null;
  is_new_construction: boolean | null;
  is_coastal_waterfront: boolean | null;
  storey_count: number | null;
  parking_covered: number | null;
  parking_other: number | null;
  other_features: string | null;
  description: string | null;
  listing_title: string | null;
  listing_published_date: string | null;
}

export interface ForSaleList {
  total: number;
  page: number;
  page_size: number;
  rows: ForSaleRow[];
}

export interface SoldRow {
  id: number;
  address: string | null;
  suburb: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  floor_area_m2: number | null;
  land_area_m2: number | null;
  cv_numeric: number | null;
  sale_price: number | null;
  sold_date: string | null;
  sale_method: string | null;
  days_on_market: number | null;
  url: string | null;
}

export interface SoldList {
  total: number;
  page: number;
  page_size: number;
  rows: SoldRow[];
}

export interface PriceMover {
  id: number | null;
  slug_id: string | null;
  address: string | null;
  suburb: string | null;
  asking_was: number | null;
  asking_now: number | null;
  change_pct: number | null;
}

export interface MarketPulse {
  total_listings: number;
  median_asking: number | null;
  median_predicted_dom: number | null;
  listings_change: number | null;
  median_asking_change_pct: number | null;
}

export interface WeekChanges {
  new_listings: number;
  removed_listings: number;
  still_on_market: number;
}

export interface TodayBrief {
  counts: {
    underpriced: number;
    cashflow_positive: number;
    subdividable: number;
    total_for_sale: number;
  };
  top_signals: Array<{
    id: number;
    address: string | null;
    suburb: string | null;
    property_type: string | null;
    asking_price: number | null;
    market_value: number | null;
    opportunity_score_pct: number | null;
    is_underpriced: boolean;
    is_cashflow_positive: boolean;
    is_subdividable: boolean;
  }>;
  market_pulse: MarketPulse | null;
  week_changes: WeekChanges | null;
  biggest_drops: PriceMover[];
  biggest_rises: PriceMover[];
}

export interface PendingUser {
  id: number;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: string;
  status: string;
}

export interface ImportBatch {
  id: number;
  batch_type: string;
  region: string;
  filename: string;
  rows_total: number;
  rows_inserted: number;
  rows_rejected: number;
  is_active: boolean;
  uploaded_by_id: number | null;
  created_at: string;
}

export interface IngestJob {
  id: number;
  batch_type: string;
  filename: string;
  file_size_bytes: number;
  status: "pending" | "running" | "completed" | "failed";
  progress_pct: number;
  stage: string | null;
  rows_total: number | null;
  rows_inserted: number | null;
  rows_rejected: number | null;
  // Durable enrich progress — filled vs missed is a meaningful distinction
  // (CoreLogic returns nothing for many addresses; that's normal, not a failure).
  rows_filled: number | null;
  rows_missed: number | null;
  result_json: string | null;   // structured stage result (e.g. the publish result dict)
  error_message: string | null;
  audit_warnings: string | null;  // JSON-encoded array of {code, severity, message, sample_addresses, count}
  batch_id: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ---- Staged review grid ----
// The four DISTINCT profit figures (valuation, margin, subdivision profit $,
// subdivision profit %) plus the inputs behind them — never collapsed into one.
export interface StagedGridRow {
  id: number;
  address: string | null;
  suburb: string | null;
  property_type: string | null;
  asking_price: number | null;
  cv_numeric: number | null;
  valuation: number | null;            // what it's worth (anchor-guarded fair_value)
  buy_price: number | null;            // what you can pay (≤ asking) — a separate number
  vs_cv_pct: number | null;            // valuation / CV − 1 (data-quality sort)
  margin_dollars: number | null;       // valuation − asking
  margin_pct: number | null;
  subdivision_profit: number | null;   // $ cleared after developing the lots
  subdivision_profit_pct: number | null; // return on total development cost
  gross_realisation: number | null;    // the lots' sale total
  development_cost: number | null;     // the inputs behind the profit
  lots: number | null;
  buy_score: number | null;
  last_sold_price: number | null;     // CoreLogic's last sale, else the scraper's
  last_sold_date: string | null;
  floor_area_m2: number | null;
  land_area_m2: number | null;
  comps_used: number | null;
  confidence: string | null;
  is_subdividable: boolean | null;
  best_strategy: string | null;
  is_held: boolean | null;
  hold_reason: string | null;
  pv_checked: boolean;
}

export interface StagedGrid {
  batch_id: number | null;
  total: number;
  filtered: number;
  counts: Record<string, number>;
  rows: StagedGridRow[];
}

export interface StageStarted {
  job_id: number;
  batch_id: number;
  stage: string;
}

export interface HistoryPoint {
  batch_id: number;
  batch_date: string;
  is_active: boolean;
  asking_price: number | null;
  market_value: number | null;
  opportunity_score_pct: number | null;
  est_weekly_rent: number | null;
  pred_vs_listing: number | null;
}

export interface HistoryResponse {
  slug_id: string | null;
  address: string | null;
  suburb: string | null;
  points: HistoryPoint[];
}

export interface ComparableSale {
  id: number;
  address: string | null;
  suburb: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  floor_area_m2: number | null;
  land_area_m2: number | null;
  sale_price: number | null;
  sold_date: string | null;
  sale_method: string | null;
  url: string | null;
  image_url: string | null;
  cv_numeric: number | null;
  type_of_title: string | null;
  beds_delta: number | null;
  floor_pct_delta: number | null;
}

export interface MethodShare {
  method: string;
  count: number;
  median_vs_cv: number | null;
  is_thin: boolean;
}

export interface ComparablesResponse {
  subject_id: number;
  suburb: string | null;
  matched_using: Record<string, any>;
  median_sale_price: number | null;
  comps: ComparableSale[];
  /** What these sales actually did against council CV. Positive = sold above CV. */
  median_sale_vs_cv: number | null;
  mean_sale_vs_cv: number | null;
  mean_sale_price: number | null;
  sale_vs_cv_low: number | null;
  sale_vs_cv_high: number | null;
  subject_ask_vs_cv: number | null;
  median_days_on_market: number | null;
  mean_days_on_market: number | null;
  comps_with_dom: number;
  method_mix: MethodShare[];
  suburb_method_mix: MethodShare[];
  method_gap_pts: number | null;
  value_if_auction: number | null;
  value_if_negotiation: number | null;
  method_gap_is_thin: boolean;
  comps_with_cv: number;
}

export interface TrendPoint {
  batch_id: number;
  batch_date: string;
  median_asking: number | null;
  median_market_value: number | null;
  listing_count: number;
}

export interface SuburbTrend {
  suburb: string;
  region: string;
  points: TrendPoint[];
  long_term_yearly_json: string | null;
  long_term_monthly_json: string | null;
  sample_property_id: number | null;
  listing_count: number | null;
  median_asking_current: number | null;
}

export interface BatchSummary {
  id: number;
  batch_type: string;
  region: string;
  created_at: string;
  is_active: boolean;
  rows_inserted: number;
}

export interface BatchMover {
  slug_id: string;
  address: string | null;
  suburb: string | null;
  asking_a: number | null;
  asking_b: number | null;
  change_pct: number | null;
}

export interface BatchCompare {
  batch_a: number;
  batch_b: number;
  rows_added: number;
  rows_removed: number;
  rows_in_both: number;
  median_asking_change_pct: number | null;
  median_market_value_change_pct: number | null;
  biggest_price_drop: BatchMover[];
  biggest_price_rise: BatchMover[];
}

export interface Uplift {
  label: string;
  pct: number | null;
  dollars: number | null;
  cells: number;
  scope: string;
  is_thin: boolean;
  caveat: string | null;
  is_association: boolean;
}

export interface ValueAddResponse {
  subject_id: number;
  options: Uplift[];
}

export interface DistrictValueAdd {
  district: string;
  bedroom: number | null;
  bedroom_cells: number;
  bathroom: number | null;
  bathroom_cells: number;
  pool: number | null;
  pool_cells: number;
}

export interface HeadlineDeal {
  id: number;
  address: string | null;
  suburb: string | null;
  asking_price: number | null;
  fair_value: number | null;
  margin: number | null;
  margin_dollars: number | null;
  beds: number | null;
  baths: number | null;
  image_url: string | null;
}

export interface Headline {
  gems: number;
  gems_margin_total: number | null;
  underpriced: number;
  underpriced_margin_total: number | null;
  subdividable: number;
  subdivision_profit_total: number | null;
  best: HeadlineDeal | null;
}

export interface ConversionRow {
  id: number;
  address: string | null;
  suburb: string | null;
  district: string | null;
  beds: number | null;
  floor_area_m2: number | null;
  typical_floor_next: number | null;
  asking_price: number | null;
  fair_value: number | null;
  uplift_pct: number;
  uplift_dollars: number;
  is_underpriced: boolean;
  margin: number | null;
  image_url: string | null;
}

export interface ConversionResponse {
  count: number;
  total_uplift: number;
  median_uplift: number | null;
  double_plays: number;
  rows: ConversionRow[];
}

export interface AssistantKeyStatus {
  configured: boolean;
  provider: string | null;
  key_last_four: string | null;
  updated_at: string | null;
  detail: string;
}

export interface AssistantAnswer {
  answer: string;
  tools_used: string[];
  iterations: number;
  queries: string[];
}
