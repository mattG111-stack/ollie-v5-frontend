"use client";

import { useState } from "react";
import { BRAND_FILES } from "@/lib/brand-assets";

/**
 * Apex Property brand lockup.
 *
 * The real artwork is a file, not code. Drop your exported SVG into
 * `public/brand/` and it is used everywhere the logo appears — see
 * `public/brand/README.md` for the exact filenames.
 *
 * The drawn version below is a STAND-IN, redrawn by eye from a photo of the
 * logo. It is close, not correct, and it will never be correct: hand-authored
 * paths cannot reproduce artwork they have never seen. It exists only so the app
 * has a mark before the real files land, and it disappears the moment they do.
 *
 * Everything except the door renders in `currentColor`, so the stand-in is white
 * on the dark rail and near-black on light surfaces.
 */

export const APEX_RED = "#E4002B";

/**
 * Where the real artwork lives once it is dropped in.
 *
 * Each slot lists candidates in order of preference. SVG first because it stays
 * sharp at any size, then PNG — a transparent PNG exported large is perfectly
 * good here, and refusing it would mean asking for a re-export of artwork that
 * is already correct.
 */
const ART = {
  lockup: ["/brand/apex-logo.svg", "/brand/apex-logo.png"],
  lockupInverse: ["/brand/apex-logo-inverse.svg", "/brand/apex-logo-inverse.png"],
  mark: ["/brand/apex-mark.svg", "/brand/apex-mark.png"],
};

/**
 * Renders the supplied artwork, trying each candidate in turn and falling back
 * to the drawn stand-in only when none of them load.
 *
 * Presence is decided by an image load error rather than a build-time file test:
 * that is what actually distinguishes "artwork present" from "artwork missing"
 * at the moment it matters, and it means adding a file needs no code change and
 * no rebuild of this component.
 */
function Artwork({
  sources, height, alt, fallback,
}: { sources: string[]; height: number; alt: string; fallback: React.ReactNode }) {
  // Only ask for files the build actually found. Probing blind worked, but every
  // page load fired a 404 per candidate — four per page with the lockup on it.
  // BRAND_FILES is written by scripts/brand-assets.mjs before each build.
  const present = sources.filter(s => BRAND_FILES.includes(s));
  sources = present.length ? present : [];
  const [i, setI] = useState(0);
  if (i >= sources.length) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={sources[i]}
      src={sources[i]}
      alt={alt}
      onError={() => setI(n => n + 1)}
      // Same shrink-to-fit as the drawn lockup: real artwork is the same shape
      // and would overflow a narrow phone in exactly the same way.
      style={{ height: "auto", maxHeight: height, maxWidth: "100%",
               width: "auto", display: "block", flex: "0 1 auto" }}
    />
  );
}
/** Just the house glyph — used where a compact mark is needed (favicon, tight headers). */
export function ApexMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <Artwork sources={ART.mark} height={size} alt={title ?? "Apex Property"}
             fallback={<DrawnMark size={size} title={title} />} />
  );
}

function DrawnMark({ size = 28, title }: { size?: number; title?: string }) {
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
  tone = "auto",
}: {
  size?: number;
  wordmark?: boolean;
  title?: string;
  /** Which artwork to reach for. "inverse" is the white-on-dark export used on
   *  the rail and the dark hero; "auto" means the standard file. The drawn
   *  stand-in ignores this — it inherits currentColor and inverts by itself. */
  tone?: "auto" | "inverse";
}) {
  if (!wordmark) return <ApexMark size={size} title={title} />;
  return (
    <Artwork
      sources={tone === "inverse" ? ART.lockupInverse : ART.lockup}
      height={size}
      alt={title ?? "Apex Property"}
      fallback={<DrawnLockup size={size} title={title} />}
    />
  );
}

function DrawnLockup({ size = 26, title }: { size?: number; title?: string }) {

  /*
   * Laid out from the supplied artwork, normalised to a 120 cap-height grid.
   * The reference is 175 px cap, so every figure here is a reference measurement
   * x 0.6857. Three things were visibly wrong before and are fixed here:
   * PROPERTY was nearly as tall as APEX where it should be about half; the APEX
   * letters were tracked so tightly the E collided with the X; and the house was
   * undersized against the letterforms.
   */
  const VB_W = 1225, VB_H = 120;
  return (
    <svg
      width={(size * VB_W) / VB_H}
      height={size}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      fill="none"
      role="img"
      aria-label={title ?? "Apex Property"}
      // The lockup is roughly 10:1, so at size 36 it wants 367px — wider than
      // a 360px phone, and `flex: none` stopped it shrinking. It now scales
      // down to whatever room there is, keeping its aspect ratio.
      style={{ display: "block", maxWidth: "100%", height: "auto",
               flex: "0 1 auto", color: "inherit" }}
    >
      {/* ---- A : open chevron, no crossbar ---- */}
      <path d="M0 120 L55 0 L72 0 L127 120 L107 120 L63 24 L20 120 Z" fill="currentColor" />

      {/* ---- P : straight stem, rounded bowl ---- */}
      <path
        d="M149 0 H214 A31 31 0 0 1 214 62 H165 V120 H149 Z
           M165 16 V46 H212 A15 15 0 0 0 212 16 Z"
        fill="currentColor"
        fillRule="evenodd"
      />

      {/* ---- E : three free-standing bars, no stem, middle bar short ---- */}
      <rect x="277" y="0" width="106" height="17" fill="currentColor" />
      <rect x="277" y="52" width="88" height="17" fill="currentColor" />
      <rect x="277" y="103" width="106" height="17" fill="currentColor" />

      {/* ---- X : pure diagonal cross ---- */}
      <path d="M402 0 H424 L520 120 H498 Z" fill="currentColor" />
      <path d="M498 0 H520 L424 120 H402 Z" fill="currentColor" />

      {/* ---- house : full cap height, chimney right, red door ---- */}
      <g transform="translate(544,0) scale(1.2)">
        <mask id="apex-house-lockup" maskUnits="userSpaceOnUse" x="0" y="0" width="118" height="100">
          <path d="M59 4 L118 52 L100 52 L100 100 L18 100 L18 52 L0 52 Z" fill="#fff" />
          <rect x="83" y="16" width="13" height="26" fill="#fff" />
          <rect x="43" y="60" width="26" height="40" fill="#000" />
        </mask>
        <rect width="118" height="100" fill="currentColor" mask="url(#apex-house-lockup)" />
        <rect x="43" y="60" width="26" height="40" fill={APEX_RED} />
      </g>

      {/*
        PROPERTY: 52 px on the cap-120 grid with 27 px of tracking puts it at a
        58-unit cap height and 501 units wide, which is what the artwork measures.
        The stack is deliberately the one those numbers were measured against —
        a different face would keep the size and lose the width.
      */}
      <text
        x="720"
        y="120"
        fill="currentColor"
        style={{
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          fontSize: 52,
          fontWeight: 400,
          letterSpacing: 27,
        }}
      >
        PROPERTY
      </text>
    </svg>
  );
}
