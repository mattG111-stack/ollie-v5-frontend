/**
 * Apex Property brand mark + wordmark.
 *
 * Lockup: APEX · house (white body, red door) · PROPERTY — matching the supplied
 * logo (white on dark). The mark's body renders in `currentColor` so it sits on
 * light or dark surfaces; the door is the brand red. Kept as an inline SVG so it's
 * crisp at any size. Swap in the exact artwork any time by dropping a file in
 * /public and pointing ApexMark at it.
 */

export const APEX_RED = "#E4002B";

export function ApexMark({ size = 28, title }: { size?: number; title?: string }) {
  const uid = "apex-mark";
  return (
    <svg
      width={size}
      height={(size * 78) / 96}
      viewBox="0 0 96 78"
      fill="none"
      role="img"
      aria-label={title ?? "Apex Property"}
      style={{ display: "block", flex: "none" }}
    >
      {/* house body (roof + walls) in currentColor, with the doorway masked out */}
      <mask id={uid} maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="78">
        <polygon points="48,2 94,40 78,40 78,76 18,76 18,40 2,40" fill="#fff" />
        <rect x="40" y="46" width="16" height="30" fill="#000" />
      </mask>
      <rect width="96" height="78" fill="currentColor" mask={`url(#${uid})`} />
      {/* the door, in brand red */}
      <rect x="40" y="46" width="16" height="30" fill={APEX_RED} />
    </svg>
  );
}

/** APEX · mark · PROPERTY horizontal lockup (primary). */
export function ApexLogo({
  size = 28,
  wordmark = true,
  wordSize,
}: {
  size?: number;
  wordmark?: boolean;
  wordSize?: number;
}) {
  if (!wordmark) return <ApexMark size={size} />;
  const fs = wordSize ?? size * 0.86;
  const word: React.CSSProperties = {
    fontFamily: "var(--font-space-grotesk), 'Space Grotesk', 'Archivo', sans-serif",
    fontWeight: 800,
    fontSize: fs,
    lineHeight: 1,
    color: "inherit",
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.34, color: "inherit" }}>
      <span style={{ ...word, letterSpacing: "0.02em" }}>APEX</span>
      <ApexMark size={size} />
      <span style={{ ...word, fontWeight: 600, letterSpacing: "0.18em" }}>PROPERTY</span>
    </span>
  );
}
