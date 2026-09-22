"use client";

import { useT } from "@/lib/i18n";
import SuburbSelect, { SuburbDataset } from "./SuburbSelect";

/* The suburb control on the deal-finder filter bars and the properties table.
 *
 * This was a type-ahead text box. The old reasoning was that Auckland has
 * hundreds of suburbs so a list of them all would be unusable — but the list
 * that matters is not "every suburb in Auckland", it is "the suburbs in this
 * week's batch", which is a fraction of that and is the only set that can
 * return anything. So it is a dropdown now, matching every other suburb picker
 * in the app.
 *
 * The props are unchanged so the callers did not have to move; the styling is
 * kept close to the old box so the filter bars still line up. */

export default function SuburbFilter({
  value, onChange, region = "Auckland", width = 190, dataset = "for_sale",
  district = "",
}: {
  value: string; onChange: (v: string) => void; region?: string; width?: number;
  dataset?: SuburbDataset;
  /** The district currently filtered on, so only its suburbs are offered. */
  district?: string;
}) {
  const { t } = useT();
  return (
    <SuburbSelect
      value={value}
      onChange={onChange}
      region={region}
      dataset={dataset}
      district={district}
      width={width}
      allLabel={t("filter.suburbPlaceholder")}
      ariaLabel={t("filter.suburbPlaceholder")}
      className="apex-suburb-select"
    />
  );
}
