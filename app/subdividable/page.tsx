"use client";

import AppShell from "@/components/AppShell";
import DealFinder from "@/components/DealFinder";
import { useT } from "@/lib/i18n";
import { Note } from "@/components/apex";

export default function SubdividablePage() {
  const { t } = useT();
  return (
    <AppShell>
      <DealFinder
        title={t("deal.subdividableTitle")}
        blurb={t("deal.subdividableBlurb")}
        filter={{ subdividable: "true" }}
        // Ranked by money, not by lot count. Four extra lots on a cheap section
        // can be worth less than one on an expensive one, so counting lots put
        // the wrong sites at the top of the page.
        orderBy="best_net_gain"
        metric="lots"
      >
        {/* maxWidth alone let this run 9px past a 390px screen: the cap is on
            the box, not on what the padding adds around it. */}
        <div style={{ maxWidth: 780, width: "100%" }}>
          <Note warn>
            ⚠ <strong>Screening only.</strong> Flags land that could support subdivision on lot size
            and zone. Overlays, services and council consent decide the real outcome — always verify
            with council.
          </Note>
        </div>
      </DealFinder>
    </AppShell>
  );
}
