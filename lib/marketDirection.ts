/**
 * Is this suburb's market getting better or worse? Answered in one place.
 *
 * This lived inside the trends page and has been fixed twice; both fixes are
 * still there and both are correct. It came back anyway, because nothing tested
 * it — a rule that is right in the file and wrong on the screen is worth
 * nothing, and the only difference between the two is a test. So it lives here
 * now, as a pure function with no React around it, and e2e/market-direction
 * .spec.ts pins every direction for every metric.
 *
 * THREE things have to be true at once.
 *
 * 1. DIRECTION is read through the metric, never off the pixels. Fewer days on
 *    market is a BETTER market, so a falling days-to-sell line is green and
 *    says "improving". For the other three, up is good.
 *
 * 2. The ARROW follows the NUMBER; the word and the colour say whether that
 *    number is good news. On days-to-sell those point opposite ways, and they
 *    are meant to: "▲ softening".
 *
 * 3. The number on screen and the word beside it must be about the SAME
 *    comparison. This is the one that produced
 *
 *        44 days in Jun 26   ▼ improving vs the 3 months before
 *
 *    and it is arithmetic, not wording. Every point the backend sends is
 *    ALREADY a three-month rolling median (MONTH_SMOOTHING = 3 in
 *    routers/properties.py: the point for June is the median of April, May and
 *    June). The page then averaged the last three POINTS and compared that to
 *    the average of the three before — two windows that share two months of
 *    sales, an average of averages, and neither of them the number printed
 *    above. Searched over random 12-month series, that disagrees with the
 *    honest comparison often and by a lot: one suburb showed a headline of 27
 *    days against 51 three months earlier — plainly improving — and the old
 *    rule called it softening on a delta of +2.6.
 *
 *    So the comparison is now the latest point against the point three months
 *    behind it. Those two pools do not overlap, they are exactly the three
 *    months and the three before, and the headline IS one side of the
 *    comparison — it cannot contradict the verdict any more.
 *
 * The window stays three months. One quiet month is not a trend, and in a
 * market this seasonal a single December makes everything look like a collapse.
 */

export type Direction = "up" | "down";

export type MetricSpec = {
  key: string;
  label: string;
  /** Which way this metric has to move for the market to be getting better. */
  better: Direction;
};

export const SERIES = [
  { key: "sale_vs_cv", label: "vs CV", better: "up" },
  { key: "median_price", label: "Median price", better: "up" },
  { key: "sales", label: "Sales", better: "up" },
  // The one that keeps getting this wrong. Fewer days = selling faster = better.
  { key: "median_days", label: "Days to sell", better: "down" },
] as const satisfies readonly MetricSpec[];

/** The keys, as a union, so a chart can index a MonthPoint with one. */
export type MetricKey = (typeof SERIES)[number]["key"];

/**
 * Months each point already pools, and therefore how far back the comparison
 * reaches. Must match MONTH_SMOOTHING in the backend's routers/properties.py —
 * a smaller number here compares overlapping pools, a larger one skips history.
 */
export const POOLED_MONTHS = 3;

export type Verdict = {
  /** The figure to show: the latest pooled point. Already a 3-month median. */
  value: number | null;
  /** Its index in the input, so the caller can name the month. */
  index: number;
  /** What it is compared against — the point POOLED_MONTHS behind it. */
  baseline: number | null;
  /** How many months back the baseline actually sits. */
  monthsBack: number;
  /** value − baseline. */
  delta: number;
  /** Is the market getting better? Read through the metric, not the sign. */
  improving: boolean;
  /** Too small a move to call either way. */
  flat: boolean;
  /** "▲" when the NUMBER rose, "▼" when it fell. Never mirrors `improving`. */
  arrow: "▲" | "▼";
  /** "improving" | "softening" | "holding steady". */
  word: string;
  /** Nothing to compare against. Show the chart, withhold the verdict. */
  thin: boolean;
};

/** How big a move has to be before it counts, in the metric's own units. */
function flatBar(metric: string, level: number): number {
  if (metric === "median_price") return 0.01 * Math.abs(level || 1);
  if (metric === "sale_vs_cv") return 0.002;         // 0.2 of a percentage point
  return 0.5;                                        // days, sales
}

const isNum = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);

/**
 * @param values  the metric by CALENDAR month, oldest first, one entry per
 *                month with null where a month was too thin to measure. The
 *                positions matter — this steps back three months, so a filtered
 *                array would step back three *readings* instead, which in a
 *                quiet suburb can be a year. The part-counted current month must
 *                already be nulled out: three sales into August against twelve
 *                in a finished month reads as a collapse in a market that has
 *                not moved.
 */
export function marketVerdict(
  values: (number | null)[],
  metric: string,
  pooledMonths: number = POOLED_MONTHS,
): Verdict {
  const spec = SERIES.find((s) => s.key === metric);
  const better: Direction = spec ? spec.better : "up";

  const empty: Verdict = {
    value: null, index: -1, baseline: null, monthsBack: 0, delta: 0,
    improving: false, flat: true, arrow: "▼", word: "holding steady", thin: true,
  };

  let i = -1;
  for (let k = values.length - 1; k >= 0; k--) {
    if (isNum(values[k])) { i = k; break; }
  }
  if (i < 0) return empty;
  const value = values[i] as number;

  // The nearest measured month at least `pooledMonths` behind, so the two pools
  // do not share any sales.
  let j = -1;
  for (let k = i - pooledMonths; k >= 0; k--) {
    if (isNum(values[k])) { j = k; break; }
  }
  if (j < 0) return { ...empty, value, index: i };

  const baseline = values[j] as number;
  const delta = value - baseline;
  const flat = Math.abs(delta) < flatBar(metric, value);
  // The whole point. "Went up" and "got better" are the same sentence for three
  // of these four metrics, which is exactly why the fourth keeps regressing.
  const improving = better === "up" ? delta > 0 : delta < 0;

  return {
    value,
    index: i,
    baseline,
    monthsBack: i - j,
    delta,
    improving,
    flat,
    arrow: delta > 0 ? "▲" : "▼",
    word: flat ? "holding steady" : improving ? "improving" : "softening",
    thin: false,
  };
}
