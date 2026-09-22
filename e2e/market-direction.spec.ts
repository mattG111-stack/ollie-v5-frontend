/**
 * "If the days to sell is going up it's red and bad — it's softening, not
 * improving."
 *
 * This bug has been fixed twice and come back twice. Both fixes are still in
 * the code and both are correct; what was missing was any test at all, so a
 * later edit could undo either one and every check would still pass. That is
 * the actual defect being repaired here.
 *
 * Two rules, and they are different rules:
 *
 *   1. DIRECTION is read through the metric. Fewer days on market is a better
 *      market, so a falling days-to-sell line is green and says "improving".
 *      For the other three, up is good. The arrow follows the NUMBER; the word
 *      and the colour say whether that number is good news. On days-to-sell
 *      those point opposite ways, and they are meant to.
 *
 *   2. The NUMBER and the WORD must be about the same comparison, and that is
 *      arithmetic rather than wording. Every point the backend sends is ALREADY
 *      a three-month rolling median (MONTH_SMOOTHING = 3). The page then
 *      averaged the last three POINTS against the three before — two windows
 *      sharing two months of sales, an average of averages, and neither of them
 *      the number printed above it. That is how
 *
 *          44 days in Jun 26   ▼ improving vs the 3 months before
 *
 *      happened. The comparison is now the latest point against the point three
 *      months behind it: no shared sales, and the headline is one side of it, so
 *      it cannot contradict the verdict.
 */
import { expect, test } from "@playwright/test";

import { POOLED_MONTHS, SERIES, marketVerdict } from "../lib/marketDirection";

const rising = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44];
const falling = [...rising].reverse();

// ---------------------------------------------------------------------------
// 1. Days to sell — the one that keeps regressing
// ---------------------------------------------------------------------------
test("days to sell going UP is softening, not improving", () => {
  const v = marketVerdict(rising, "median_days");
  expect(v.word).toBe("softening");
  expect(v.improving).toBe(false);
  expect(v.arrow).toBe("▲");
});

test("days to sell coming DOWN is improving", () => {
  const v = marketVerdict(falling, "median_days");
  expect(v.word).toBe("improving");
  expect(v.improving).toBe(true);
  expect(v.arrow).toBe("▼");
});

test("on days to sell the arrow and the verdict point opposite ways", () => {
  // The single sentence this whole file exists to protect. A rising number is
  // bad news here, so ▲ has to sit next to "softening" and never next to
  // "improving" — and the mirror case has to hold too.
  const up = marketVerdict(rising, "median_days");
  const down = marketVerdict(falling, "median_days");
  expect([up.arrow, up.word]).toEqual(["▲", "softening"]);
  expect([down.arrow, down.word]).toEqual(["▼", "improving"]);
});

// ---------------------------------------------------------------------------
// 2. The other three, where up is good — the reason the fourth keeps breaking
// ---------------------------------------------------------------------------
for (const key of ["sale_vs_cv", "median_price", "sales"]) {
  const scale = key === "sale_vs_cv" ? 0.01 : 1;
  test(`${key} going up is improving`, () => {
    const v = marketVerdict(rising.map((n) => n * scale), key);
    expect(v.word).toBe("improving");
    expect(v.arrow).toBe("▲");
  });

  test(`${key} going down is softening`, () => {
    const v = marketVerdict(falling.map((n) => n * scale), key);
    expect(v.word).toBe("softening");
    expect(v.arrow).toBe("▼");
  });
}

test("every metric declares which way is better", () => {
  // A new metric added without a `better` would silently inherit "up", which is
  // how days-to-sell would break again.
  for (const s of SERIES) {
    expect(["up", "down"]).toContain(s.better);
  }
  expect(SERIES.find((s) => s.key === "median_days")?.better).toBe("down");
});

// ---------------------------------------------------------------------------
// 3. The number and the word describe the same window
// ---------------------------------------------------------------------------
test("the headline is one side of the comparison, so it cannot contradict it", () => {
  // Every point the backend sends is already a 3-month median (MONTH_SMOOTHING
  // = 3), so the verdict compares the latest point with the point three months
  // behind it — no shared sales, and the number on screen is one of the two.
  const pooled = [76, 58, 46, 38, 38, 44, 33, 33, 33, 43, 33, 25];
  const v = marketVerdict(pooled, "median_days");

  expect(v.value).toBe(25);              // the headline
  expect(v.baseline).toBe(33);           // three months back
  expect(v.monthsBack).toBe(3);
  expect(v.word).toBe("improving");      // 25 days is faster than 33
});

test("averaging the pooled points disagrees with the honest comparison", () => {
  // The arithmetic behind the screenshot. Averaging points[-3:] against
  // points[-6:-3] compares two windows that SHARE two months of sales, and
  // neither is the number printed above. This series is one of the cases that
  // found: a headline of 27 days against 51 three months earlier — plainly
  // improving — which the old rule called softening on a delta of +2.6.
  const pooled = [42, 42, 53, 49, 53, 34, 35, 35, 51, 57, 44, 27];
  const v = marketVerdict(pooled, "median_days");
  expect(v.value).toBe(27);
  expect(v.baseline).toBe(51);
  expect(v.word).toBe("improving");

  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const oldDelta = avg(pooled.slice(-3)) - avg(pooled.slice(-6, -3));
  expect(oldDelta).toBeGreaterThan(0);   // the old rule said softening
});

test("a spike in the newest month cannot flip the verdict on its own", () => {
  // The points are already 3-month medians, so one busy month moves the newest
  // point by a third of itself, not all of it. That smoothing lives in the
  // backend; what matters here is that the comparison reaches past it.
  const pooled = [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 40];
  const v = marketVerdict(pooled, "median_days");
  expect(v.value).toBe(40);
  expect(v.baseline).toBe(30);
  expect(v.word).toBe("softening");
});

// ---------------------------------------------------------------------------
// 4. Not calling it when there is nothing to call
// ---------------------------------------------------------------------------
test("a market that has not moved says so instead of picking a side", () => {
  const v = marketVerdict([30, 30, 30, 30, 30, 30, 30, 30], "median_days");
  expect(v.flat).toBe(true);
  expect(v.word).toBe("holding steady");
});

test("half a day is not a trend but ten days is", () => {
  expect(marketVerdict([30, 30, 30, 30.2, 30.3, 30.4], "median_days").flat).toBe(true);
  expect(marketVerdict([30, 30, 30, 40, 40, 40], "median_days").flat).toBe(false);
});

test("a price needs to move more than a rounding error", () => {
  // On a median price, half a dollar is not news; the bar scales with the level.
  const flat = marketVerdict([900_000, 900_000, 900_000, 903_000, 902_000, 901_000],
                             "median_price");
  expect(flat.flat).toBe(true);
  const real = marketVerdict([900_000, 900_000, 900_000, 990_000, 990_000, 990_000],
                             "median_price");
  expect(real.flat).toBe(false);
  expect(real.word).toBe("improving");
});

test("too few months withholds the verdict rather than inventing one", () => {
  expect(marketVerdict([], "median_days").thin).toBe(true);
  expect(marketVerdict([30], "median_days").thin).toBe(true);
  const one = marketVerdict([30, 40, 50], "median_days");
  expect(one.thin).toBe(true);              // nothing 3 months back to compare to
  expect(one.value).toBe(50);               // but the level is still known
});

test("months with no sales are skipped, not read as zero", () => {
  // A month too thin to measure arrives as null. Treating it as 0 days would
  // read as the fastest market in history.
  const v = marketVerdict([60, 60, 60, 55, null, 20], "median_days");
  expect(v.value).toBe(20);
  expect(v.baseline).toBe(60);              // the null is stepped over, not read
  expect(v.word).toBe("improving");
});

test("the comparison steps back three MONTHS, not three readings", () => {
  // In a quiet suburb the gaps are the difference between comparing to spring
  // and comparing to last year. A filtered list loses that.
  const v = marketVerdict([90, null, null, null, null, null, 30], "median_days");
  expect(v.value).toBe(30);
  expect(v.baseline).toBe(90);
  expect(v.monthsBack).toBe(6);             // and it says how far it reached
});

test("the pooling depth matches the backend that produced the points", () => {
  // POOLED_MONTHS must equal MONTH_SMOOTHING in routers/properties.py. Smaller
  // and the two pools share sales; larger and it skips history.
  expect(POOLED_MONTHS).toBe(3);
});

test("an unknown metric does not crash and does not guess", () => {
  const v = marketVerdict([1, 2, 3, 4, 5, 6], "not_a_metric");
  expect(v.word).toBe("improving");         // falls back to "up is good"
  expect(v.arrow).toBe("▲");
});
