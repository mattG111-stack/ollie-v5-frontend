"use client";

import AppShell from "@/components/AppShell";
import DealFinder from "@/components/DealFinder";
import { Note } from "@/components/apex";

export default function CashflowPage() {
  return (
    <AppShell>
      <DealFinder
        title="Cashflow-positive properties"
        blurb="Positive weekly cashflow at our default assumptions — 30% deposit, 6.75% interest, 30-year term, 29% opex. Rent estimated from local rental comparables."
        filter={{ cashflow_positive: "true" }}
        orderBy="cash_on_cash"
        metric="margin"
      >
        <div style={{ maxWidth: 780 }}>
          <Note warn>
            ⚠ Auckland gross yields run 3–5%, but a 70% mortgage at 6.75% consumes ~4.4% of value
            per year before opex — so at these assumptions the list is usually empty. The break-even
            deposit on each property card shows what it would actually take.
          </Note>
        </div>
      </DealFinder>
    </AppShell>
  );
}
