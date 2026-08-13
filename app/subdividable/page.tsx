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
        orderBy="max_addl_lots"
        metric="lots"
      >
        <div style={{ maxWidth: 780 }}>
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
