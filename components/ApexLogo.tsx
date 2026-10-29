/** Olie.co.nz display identity. Export names retained for existing imports. */
export const APEX_RED = "#E4002B";

export function ApexMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 104" fill="none"
         role="img" aria-label={title ?? "Olie.co.nz"} style={{ display: "block", flex: "none" }}>
      <path d="M50 5C23 5 7 24 7 51s16 46 43 46 43-19 43-46S77 5 50 5ZM50 30 72 49V77H28V49Z"
            fill="currentColor" fillRule="evenodd" />
      <rect x="44" y="57" width="12" height="20" rx="2" fill={APEX_RED} />
    </svg>
  );
}

export function ApexLogo({ size = 26, wordmark = true, title, tone = "auto" }: {
  size?: number; wordmark?: boolean; title?: string; tone?: "auto" | "inverse";
}) {
  if (!wordmark) return <ApexMark size={size} title={title} />;
  return (
    // The wordmark is outlined SVG: sharp at any size, with no font download.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/brand/olie-logo${tone === "inverse" ? "-inverse" : ""}.svg`}
         alt={title ?? "Olie.co.nz — Powered by Apex"} width={500} height={120}
         style={{ display: "block", width: size * 8.5, maxWidth: "100%", height: "auto", flex: "0 1 auto" }} />
  );
}
