/** Olie.co.nz display identity. Export names retained for existing imports. */
export const APEX_RED = "#E4002B";

export function ApexMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    // Reuse the approved app artwork so the website and saved icon agree.
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/olie-teal-house.png" alt={title ?? "Olie.co.nz"}
         width={size} height={size}
         style={{ display: "block", flex: "none", borderRadius: size * 0.2 }} />
  );
}

export function ApexLogo({ size = 26, wordmark = true, title, tone = "auto" }: {
  size?: number; wordmark?: boolean; title?: string; tone?: "auto" | "inverse";
}) {
  if (!wordmark) return <ApexMark size={size} title={title} />;
  return (
    <span role="img" aria-label={title ?? "Olie.co.nz — Powered by Apex"}
          style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4,
                   width: size * 8.5, maxWidth: "100%", flex: "0 1 auto" }}>
      {/* Decorative children give the complete logo one accessible name. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/olie-teal-house.png" alt="" aria-hidden="true"
           width={72} height={72}
           style={{ display: "block", width: "23.5%", height: "auto", flex: "0 0 23.5%", borderRadius: size * 0.3 }} />
      {/* The remaining wordmark stays outlined SVG for sharp type. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/olie-logo${tone === "inverse" ? "-inverse" : ""}.svg?v=teal-2`}
           alt="" aria-hidden="true" width={380} height={120}
           style={{ display: "block", width: "calc(76.5% - " + size * 0.4 + "px)", height: "auto", minWidth: 0 }} />
    </span>
  );
}
