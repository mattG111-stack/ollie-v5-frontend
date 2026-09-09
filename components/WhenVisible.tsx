"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Renders its children only once they have been scrolled near.
 *
 * For panels that cost money to draw. Aerial imagery is billed per request, and
 * a panel mounted on page load bills for every listing anyone opens — including
 * the ones where they glanced at the price and left, which is most of them.
 * Gated on visibility, the request follows the person who actually looked.
 *
 * `margin` starts the load slightly before the panel reaches the viewport, so
 * scrolling down to it finds it already there rather than watching it appear.
 *
 * Once shown, it stays shown: unmounting a map that scrolled back off screen
 * would re-fetch every tile the moment it scrolled on again, which is the
 * opposite of the point.
 */
export default function WhenVisible({
  children,
  minHeight = 460,
  margin = "300px",
  placeholder,
}: {
  children: React.ReactNode;
  /** Reserve the panel's height so the page does not jump when it loads. */
  minHeight?: number;
  margin?: string;
  placeholder?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    // No IntersectionObserver (old browser, a test environment) means showing it
    // rather than hiding it forever — failing closed here would delete the panel.
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setShown(true); },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, margin]);

  if (shown) return <>{children}</>;
  return (
    <div ref={ref} style={{ minHeight }} aria-busy="true">
      {placeholder}
    </div>
  );
}
