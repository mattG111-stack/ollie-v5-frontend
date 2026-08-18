"use client";

import AppShell from "@/components/AppShell";
import DealFinder from "@/components/DealFinder";
import { useT } from "@/lib/i18n";

export default function UnderpricedPage() {
  const { t } = useT();
  return (
    <AppShell>
      {/* Only deals the valuation can actually resolve: margin above the model's
          own error (~7.5% median) and backed by enough sold comps to trust.
          Biggest discount first — the point of the page is the margin. */}
      <DealFinder
        title={t("deal.underpricedTitle")}
        blurb={t("deal.underpricedBlurb")}
        filter={{ underpriced: "true", min_margin: "0.15", min_comps: "8" }}
        orderBy="margin"
        metric="margin"
        metricMax={0.35}
      />
    </AppShell>
  );
}
