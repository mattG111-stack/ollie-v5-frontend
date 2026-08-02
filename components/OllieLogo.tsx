/**
 * Ollie brand mark + wordmark (Brand Guidelines v1.0).
 *
 * The mark is a house in one weight with the door left open — the doorway runs
 * through the base line so the outline never closes. Monochrome: it renders in
 * `currentColor`, so it's Ink on light surfaces and White on dark ones, with no
 * brand colour. Reconstructed as an SVG (with a mask for the open interior) so
 * it's crisp at any size and truly transparent inside.
 */

export function OllieMark({ size = 26, title }: { size?: number; title?: string }) {
  // viewBox 96 x 91 — the house pentagon with an open doorway punched out.
  const uid = "ollie-mark";
  return (
    <svg
      width={size}
      height={(size * 91) / 96}
      viewBox="0 0 96 91"
      fill="none"
      role="img"
      aria-label={title ?? "Ollie"}
      style={{ display: "block", flex: "none" }}
    >
      <mask id={uid} maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="91">
        {/* house body (visible) → inner cut-out (hole) → door frame (visible) → doorway (hole) */}
        <polygon points="48,0 96,36.4 96,91 0,91 0,36.4" fill="#fff" />
        <polygon points="48,8 91,39.2 91,86 5,86 5,39.2" fill="#000" />
        <rect x="32" y="51" width="32" height="40" fill="#fff" />
        <rect x="37" y="56" width="22" height="35" fill="#000" />
      </mask>
      <rect width="96" height="91" fill="currentColor" mask={`url(#${uid})`} />
    </svg>
  );
}

/** Mark + "ollie" wordmark, horizontal lockup (the primary lockup). */
export function OllieLogo({
  size = 26,
  wordmark = true,
  wordSize,
}: {
  size?: number;
  wordmark?: boolean;
  wordSize?: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.42, color: "inherit" }}>
      <OllieMark size={size} />
      {wordmark && (
        <span
          style={{
            fontFamily: "var(--font-space-grotesk), 'Space Grotesk', 'Archivo', sans-serif",
            fontWeight: 700,
            fontSize: wordSize ?? size * 0.92,
            letterSpacing: "-0.05em",
            lineHeight: 0.9,
            color: "inherit",
          }}
        >
          ollie
        </span>
      )}
    </span>
  );
}
