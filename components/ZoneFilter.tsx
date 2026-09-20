"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { C, MONO } from "./apex";

/**
 * The zone a developer works in.
 *
 * Built from the live batch rather than from a hard-coded list of Auckland
 * Unitary Plan zones, for the same reason the suburb picker is: a list you
 * cannot type wrong, which doubles as the answer to "what is actually in here".
 * Each option carries how many sites in that zone can take another lot, because
 * that is the number somebody opening this list came for.
 *
 * Zones with nothing subdividable in them are still listed — an empty answer to
 * "what's in Single House?" is information, and a filter that silently omits
 * options reads as a broken filter.
 */
type ZoneOption = { zoning: string; live: number; can_subdivide: number };

// The plan's own names are long ("Residential - Mixed Housing Urban Zone") and
// three of them share a prefix, so a dropdown of the raw strings is a wall of
// "Residential - ". Trim what every option repeats; keep what tells them apart.
function short(zone: string): string {
  return zone.replace(/^Residential\s*-\s*/i, "").replace(/\s+Zone$/i, "");
}

export default function ZoneFilter({
  value, onChange, region = "Auckland", style,
}: {
  value: string;
  onChange: (v: string) => void;
  region?: string;
  /** The host page's own select styling, so this reads as one control row. */
  style?: React.CSSProperties;
}) {
  const { t } = useT();
  const [zones, setZones] = useState<ZoneOption[]>([]);

  useEffect(() => {
    api<ZoneOption[]>(`/api/properties/zones?region=${encodeURIComponent(region)}`)
      .then(setZones)
      .catch(() => setZones([]));
  }, [region]);

  // Nothing to choose between is not a filter — hide it rather than offer an
  // empty dropdown that looks broken.
  if (zones.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t("filter.zonePlaceholder")}
      style={style ?? {
        fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.mono,
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: "8px 10px", maxWidth: "100%",
      }}
    >
      <option value="">{t("filter.zonePlaceholder")}</option>
      {zones.map((z) => (
        <option key={z.zoning} value={z.zoning}>
          {short(z.zoning)} ({z.can_subdivide.toLocaleString()})
        </option>
      ))}
    </select>
  );
}
