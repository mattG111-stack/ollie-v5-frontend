const nzd = new Intl.NumberFormat("en-NZ", {
  style: "currency",
  currency: "NZD",
  maximumFractionDigits: 0,
});

// Property-scale money is rounded to the nearest $1,000. A valuation reading
// "$907,939" implies a precision the model does not have — median error is
// ~7.9%, so the last three digits are noise dressed up as accuracy.
// The floor keeps small figures (weekly rent, fees) exact.
const ROUND_ABOVE = 50_000;

export function toNearestThousand(v: number): number {
  return Math.abs(v) >= ROUND_ABOVE ? Math.round(v / 1000) * 1000 : v;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return nzd.format(toNearestThousand(v));
}

export function fmtMoneyShort(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

// How a listing with no asking price is described.
//
// Four listings in five are sold by auction, tender or negotiation and have no
// asking price — that is the market, not missing data. Showing a dash for them
// reads as "we don't know", which is wrong twice over: we do know, and the
// answer is more useful than a number would be. So say it.
//
// The number is preferred whenever there is one, and a dash is kept only for
// the genuine unknown — a listing whose method we have not been told.
const METHOD_KEY: Record<string, string> = {
  auction: "price.auction",
  tender: "price.tender",
  negotiation: "price.negotiation",
};

export function askingText(
  asking: number | null | undefined,
  listingType: string | null | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
  short = false,
): string {
  if (asking != null && Number.isFinite(asking)) {
    const money = short ? fmtMoneyShort(asking) : fmtMoney(asking);
    // "Enquiries over $699,000" is what the advertisement says, and the two
    // words are the whole difference between a price and a floor. Printing
    // "$699,000" alone turns a starting figure into an asking price — which is
    // the same fault as inventing one, arrived at by deleting words instead of
    // adding a number.
    return String(listingType || "").toLowerCase() === "guide"
      ? t("price.guide", { v: money })
      : money;
  }
  const key = METHOD_KEY[String(listingType || "").toLowerCase()];
  return key ? t(key) : "—";
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNumber(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function fmtArea(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 10_000) return `${(v / 10_000).toFixed(2)} ha`;
  return `${Math.round(v).toLocaleString()} m²`;
}

// Format a Unix epoch (seconds or ms, as number or numeric string) into "Mon YYYY".
// Falls back to parsing an ISO/date string; returns "—" if unusable.
export function fmtEpoch(v: string | number | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    const d = new Date(n < 1e12 ? n * 1000 : n);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("en-NZ", { month: "short", year: "numeric" });
  }
  const d2 = new Date(v as string);
  return isNaN(d2.getTime()) ? String(v) : d2.toLocaleDateString("en-NZ", { month: "short", year: "numeric" });
}

// Full NZ-style date: dd-mm-yyyy. Handles our epoch-seconds strings
// ("1097924400.0"), ISO dates ("2026-07-01"), and leaves a bare year untouched.
//
// A date is DAY-MONTH-YEAR here, always. "2009-08-04" in a map popup is not a
// date to a New Zealander, it is a serial number, and it was reaching the
// customer-facing map straight off the API.
export function fmtDayDate(v: string | number | null | undefined): string {
  if (v == null || v === "" || v === "—") return "—";
  const s = String(v).trim();
  if (/^\d{4}$/.test(s)) return s;                 // bare year — nothing to expand

  // A date-only ISO string is read by Date() as UTC MIDNIGHT, so anywhere west
  // of Greenwich it renders as the day before: "2009-08-04" viewed from Sydney
  // is fine and from Los Angeles is the 3rd. Split it rather than parse it —
  // there is no time in it to convert, so there is nothing to get wrong.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  let d: Date;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0 && !s.includes("-")) {
    d = new Date(n < 1e12 ? n * 1000 : n);         // epoch seconds or ms
  } else {
    d = new Date(s);                               // ISO / parseable string
  }
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
