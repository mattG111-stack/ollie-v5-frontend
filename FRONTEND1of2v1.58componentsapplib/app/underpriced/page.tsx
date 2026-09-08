"use client";

import AppShell from "@/components/AppShell";
import DealFinder from "@/components/DealFinder";
import { useT } from "@/lib/i18n";

/**
 * The bar a listing has to clear to be called a find.
 *
 * These two numbers decide what the page shows, and they were set at 15% and 8
 * comps against no measurement. On a full Auckland load that is not a quality
 * bar, it is a wall: 126 listings clear the deal rule, 17 of them clear 15%,
 * and 9 of those also have 8 sold comps. The page read "9 underpriced houses in
 * Auckland", which is not a believable sentence about a city of 1.7 million
 * people, and it was wrong — the other 117 were real and were being hidden.
 *
 * Measured across that load, the margin on a genuine find runs:
 *
 *     median 9.0%   75th 12.9%   90th 16.1%   max 23.8%
 *
 * so a 15% floor keeps the top eighth of the distribution and throws away the
 * rest of the market.
 *
 * MIN_MARGIN is now the model's own median error. That is the honest floor and
 * the reason is exact: below its own error the model cannot tell a 6% discount
 * from a rounding error, so anything under this line is noise being sold as a
 * find. Above it, the margin is larger than the mistake we are capable of
 * making.
 *
 * MIN_COMPS is two real sales behind the number. Not a strong evidence bar, and
 * deliberately so — the evidence question is already answered upstream by
 * `confidence`, which the deal rule requires to be medium or high. Doubling it
 * up here only re-litigated a decision already made with better information: at
 * this margin, 8 comps costs 18 listings that the pricing engine had already
 * said it was confident about. Listings with 0 or 1 comp are still excluded.
 *
 * At 7.5% and 2 comps this page shows 62 listings carrying $8.0M of margin.
 */
const MIN_MARGIN = 0.075;
const MIN_COMPS = 2;

export default function UnderpricedPage() {
  const { t } = useT();
  return (
    <AppShell>
      <DealFinder
        title={t("deal.underpricedTitle")}
        blurb={t("deal.underpricedBlurb")}
        filter={{
          underpriced: "true",
          min_margin: String(MIN_MARGIN),
          min_comps: String(MIN_COMPS),
        }}
        // Ranked by MONEY, not by percentage — the same rule the subdividable
        // page already used. A 24% margin on a $600k unit is $144k; an 12%
        // margin on a $3M home is $360k, and sorting on the percentage puts the
        // smaller one first. The number you act on is the dollars.
        orderBy="margin_dollars"
        metric="margin"
        // The real ceiling, measured: the best margin in a full Auckland load is
        // ~24%. A 35% scale drew every genuine find as a stub two-thirds short of
        // the end of its bar.
        metricMax={0.25}
      />
    </AppShell>
  );
}
