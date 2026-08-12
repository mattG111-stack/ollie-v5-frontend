"use client";

import { useState } from "react";
import { C } from "./apex";

/**
 * Listing photos with prev/next. Arrows only appear on hover and only when
 * there is more than one shot, so a single-photo listing looks identical to
 * before.
 *
 * Rendered inside a card that is itself a link, so every control stops
 * propagation — clicking "next" must not open the property.
 */
export default function PhotoStrip({
  urls,
  height,
  radius = 12,
}: {
  urls: string[];
  height: number;
  radius?: number;
}) {
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const many = urls.length > 1;

  function step(e: React.MouseEvent, by: number) {
    e.preventDefault();
    e.stopPropagation();
    setI((n) => (n + by + urls.length) % urls.length);
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: radius,
        overflow: "hidden",
        background: C.chipBg,
      }}
    >
      {urls[i] && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urls[i]}
          alt=""
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}

      {many && hover && (
        <>
          <Arrow side="left" onClick={(e) => step(e, -1)} />
          <Arrow side="right" onClick={(e) => step(e, 1)} />
        </>
      )}

      {many && (
        <div
          style={{
            position: "absolute",
            right: 6,
            bottom: 6,
            background: "rgba(14,27,46,.82)",
            color: "#F1ECDD",
            borderRadius: 6,
            padding: "2px 7px",
            fontSize: 10.5,
            fontVariantNumeric: "tabular-nums",
            pointerEvents: "none",
          }}
        >
          {i + 1}/{urls.length}
        </div>
      )}
    </div>
  );
}

function Arrow({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      style={{
        position: "absolute",
        [side]: 6,
        top: "50%",
        transform: "translateY(-50%)",
        width: 26,
        height: 26,
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        background: "rgba(14,27,46,.72)",
        color: "#fff",
        fontSize: 14,
        lineHeight: 1,
        display: "grid",
        placeItems: "center",
      }}
    >
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
