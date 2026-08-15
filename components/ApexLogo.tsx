/**
 * Apex Property brand lockup — APEX · house (red door) · PROPERTY.
 *
 * The APEX letterforms are hand-drawn as SVG paths rather than set in a font,
 * because the brand mark uses custom geometry no typeface matches: the "A" is an
 * open chevron with no crossbar, the "E" is three free-standing bars with no
 * stem, and the "X" is a pure diagonal cross. PROPERTY is a wide-tracked
 * geometric sans, which a font does reproduce faithfully.
 *
 * Everything except the door renders in `currentColor`, so the lockup is white
 * on the dark rail and near-black on light surfaces, exactly like the artwork.
 */

export const APEX_RED = "#E4002B";

/** Just the house glyph — used where a compact mark is needed (favicon, tight headers). */
export function ApexMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={(size * 118) / 100}
      height={size}
      viewBox="0 0 118 100"
      fill="none"
      role="img"
      aria-label={title ?? "Apex Property"}
      style={{ display: "block", flex: "none" }}
    >
      <HouseGlyph />
    </svg>
  );
}

/** The house: roof + body + chimney, with the door knocked out and filled red. */
function HouseGlyph() {
  return (
    <>
      {/* body + roof + chimney in one shape, door punched out via mask */}
      <mask id="apex-house" maskUnits="userSpaceOnUse" x="0" y="0" width="118" height="100">
        <path
          d="M59 4 L118 52 L100 52 L100 100 L18 100 L18 52 L0 52 Z"
          fill="#fff"
        />
        {/* chimney, right-hand side of the roof */}
        <rect x="83" y="16" width="13" height="26" fill="#fff" />
        {/* doorway knocked out of the body */}
        <rect x="43" y="62" width="24" height="38" fill="#000" />
      </mask>
      <rect width="118" height="100" fill="currentColor" mask="url(#apex-house)" />
      {/* the door itself, in brand red */}
      <rect x="43" y="62" width="24" height="38" fill={APEX_RED} />
    </>
  );
}

/**
 * Full horizontal lockup. `size` is the cap height in px; everything scales from it.
 */
export function ApexLogo({
  size = 26,
  wordmark = true,
  title,
}: {
  size?: number;
  wordmark?: boolean;
  title?: string;
}) {
  if (!wordmark) return <ApexMark size={size} title={title} />;

  // Drawn on a 0–120 cap-height grid: APEX 0–470, house 505–623, PROPERTY 660–1480.
  const VB_W = 1480, VB_H = 120;
  return (
    <svg
      width={(size * VB_W) / VB_H}
      height={size}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      fill="none"
      role="img"
      aria-label={title ?? "Apex Property"}
      style={{ display: "block", flex: "none", color: "inherit" }}
    >
      {/* ---- A : open chevron, no crossbar ---- */}
      <path d="M0 120 L55 0 L72 0 L127 120 L107 120 L63 24 L20 120 Z" fill="currentColor" />

      {/* ---- P : straight stem, squared bowl ---- */}
      <path
        d="M148 0 H213 A31 31 0 0 1 213 62 H164 V120 H148 Z
           M164 16 V46 H211 A15 15 0 0 0 211 16 Z"
        fill="currentColor"
        fillRule="evenodd"
      />

      {/* ---- E : three free-standing bars, no stem ---- */}
      <rect x="240" y="0" width="112" height="17" fill="currentColor" />
      <rect x="240" y="52" width="95" height="17" fill="currentColor" />
      <rect x="240" y="103" width="112" height="17" fill="currentColor" />

      {/* ---- X : pure diagonal cross ---- */}
      <path d="M366 0 H388 L470 120 H448 Z" fill="currentColor" />
      <path d="M448 0 H470 L388 120 H366 Z" fill="currentColor" />

      {/* ---- house ---- */}
      <g transform="translate(505,10) scale(1)">
        <mask id="apex-house-lockup" maskUnits="userSpaceOnUse" x="0" y="0" width="118" height="100">
          <path d="M59 4 L118 52 L100 52 L100 100 L18 100 L18 52 L0 52 Z" fill="#fff" />
          <rect x="83" y="16" width="13" height="26" fill="#fff" />
          <rect x="43" y="62" width="24" height="38" fill="#000" />
        </mask>
        <rect width="118" height="100" fill="currentColor" mask="url(#apex-house-lockup)" />
        <rect x="43" y="62" width="24" height="38" fill={APEX_RED} />
      </g>

      {/* ---- PROPERTY : wide-tracked geometric sans ---- */}
      <text
        x="660"
        y="97"
        fill="currentColor"
        style={{
          fontFamily: "var(--font-space-grotesk), 'Space Grotesk', 'Archivo', Helvetica, sans-serif",
          fontSize: 104,
          fontWeight: 500,
          letterSpacing: 22,
        }}
      >
        PROPERTY
      </text>
    </svg>
  );
}
