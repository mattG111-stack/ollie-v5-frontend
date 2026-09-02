"use client";

/**
 * Ollie, as a living thing.
 *
 * Four states, one continuous object. The particles never reset between them —
 * each one holds its own identity (an angle and a distance) and every state is
 * a different rule for where that identity belongs. Changing state re-aims the
 * particles and they travel; nothing pops, nothing restarts. That travelling IS
 * the effect, and it is why this is a canvas rather than four looping GIFs.
 *
 *   idle       barely there, drifting. He is present, not demanding.
 *   listening  opens into a slow spiral — the shape of taking something in.
 *   thinking   pulls tight and speeds up, orbits crossing. Visibly working.
 *   speaking   throws straight rays out from a bright core. Delivery.
 *
 * Colour is our own, not the gold in the reference: white-cyan at the core,
 * #46C6F5 through the body, #3DDC97 at the edges. Radius drives the hue, so the
 * green only appears where the orb reaches out — the spiral and the rays are
 * green-tipped, the idle drift is a small cyan ember.
 *
 * Two things this must not do. It must not spin a phone's battery down when
 * nobody is looking, so it stops when the tab is hidden or it scrolls out of
 * view. And it must not move at all for someone who has asked the system for
 * reduced motion — they get a still frame of the same orb, correctly coloured.
 */

import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

/** Filaments, not dots — so the count has to be high and each one faint. */
const PARTICLES = 1100;
/** Spiral arms in "listening". */
const ARMS = 5;
/** Discrete spokes in "speaking". Particles snap to these angles, which is the
 *  whole reason the rays read as rays instead of a fuzzy ball. */
const SPOKES = 90;
/** How far back along its own path each particle is smeared. This one number is
 *  the difference between a dot cloud and the silky look of the reference. */
const TRAIL = 0.085;

interface Look {
  /** Where the cloud reaches, as a fraction of the radius. */
  spread: number;
  /** How fast the whole figure turns. */
  spin: number;
  /** Core glow size, as a fraction of the radius. */
  core: number;
  /** Overall brightness, 0-1. */
  glow: number;
  /** Filament width in pixels at the reference size. */
  line: number;
  /** Trail multiplier — long streaks read as speed. */
  trail: number;
  /** Per-filament opacity multiplier.
   *
   *  A shape that reaches further has almost all of its particles far from the
   *  centre, and the alpha falls off with distance — so "speaking" came out a
   *  third as bright as "thinking" purely because it is bigger. This puts the
   *  brightness back under the control of the state rather than its size. */
  ink: number;
}

const LOOKS: Record<OrbState, Look> = {
  idle:      { spread: 0.32, spin: 0.34, core: 0.055, glow: 0.72, line: 0.80, trail: 1.1, ink: 1.35 },
  listening: { spread: 0.86, spin: 0.26, core: 0.075, glow: 1.00, line: 0.80, trail: 1.0, ink: 1.45 },
  thinking:  { spread: 0.44, spin: 1.30, core: 0.070, glow: 0.95, line: 0.75, trail: 1.5, ink: 1.05 },
  speaking:  { spread: 0.96, spin: 0.03, core: 0.125, glow: 1.00, line: 0.85, trail: 1.4, ink: 2.10 },
};

/** Cyan at the middle, green at the rim — the hue is a function of distance. */
function tint(u: number): [number, number, number] {
  if (u < 0.34) {
    const k = u / 0.34;                        // white-cyan -> cyan
    return [232 - 162 * k, 252 - 54 * k, 255 - 10 * k];
  }
  // Green only in the last third. Turning at the halfway mark washed the whole
  // outer half green and lost the cyan the brand actually reads as.
  const k = Math.max(0, (u - 0.5) / 0.5);
  return [70 - 9 * k, 198 + 22 * k, 245 - 94 * k];
}

interface P {
  /** The particle's own identity — fixed for its whole life. */
  a: number;      // angle seed, 0..2pi
  u: number;      // distance seed, 0..1
  arm: number;    // which spiral arm it belongs to
  spoke: number;  // which ray it belongs to
  jit: number;    // scatter within its arm/spoke
  wob: number;
  x: number;
  y: number;
  on: boolean;
}

/**
 * Where a particle belongs, in this state, at this moment. Unit circle.
 *
 * Each state is a different rule over the SAME two seeds, which is what lets a
 * particle travel from one shape to the next instead of being replaced.
 */
function target(p: P, s: OrbState, t: number): [number, number] {
  const L = LOOKS[s];
  let r: number;
  let th: number;

  if (s === "idle") {
    // Two sines at different rates, so the drift never repeats visibly.
    r = p.u * L.spread + Math.sin(t * 0.8 + p.wob * 6.3) * 0.03
        + Math.sin(t * 0.31 + p.a * 2.2) * 0.02;
    th = p.a + t * L.spin + p.u * 2.2 + Math.sin(t * 0.47 + p.wob * 4.1) * 0.22;
  } else if (s === "listening") {
    // A logarithmic spiral, which is the shape a galaxy actually makes: the
    // angle grows with the LOG of the radius. Winding it linearly instead gives
    // arms that curl too tightly at the rim and read as a spring.
    r = 0.06 + p.u * (L.spread - 0.06);
    const wind = 2.9 * Math.log(r / 0.06);
    th = p.arm * ((Math.PI * 2) / ARMS) + wind + t * L.spin + p.jit * 0.42;
  } else if (s === "thinking") {
    // Orbits at different tilts crossing each other — a ball of yarn. The
    // second sine is what stops them settling into neat concentric rings.
    // No inner floor worth the name: with one, every thread stays outside the
    // same radius and the result is a ring with a hole in it, which reads as a
    // portal rather than as thought.
    r = 0.02 + p.u * (L.spread - 0.02) + Math.sin(t * 2.2 + p.a * 3.1) * 0.05;
    th = p.a * 2.4 + t * L.spin + Math.sin(p.u * 6.2 + t * 1.4) * 1.15;
  } else {
    // Rays. The angle SNAPS to one of SPOKES fixed directions, so hundreds of
    // particles line up along the same few lines and read as spokes. Left
    // continuous, this is just a bright fog — which is exactly what it was.
    const step = (Math.PI * 2) / SPOKES;
    th = Math.round(p.a / step) * step + t * L.spin + p.jit * 0.0025;
    // A brightness wave running outward is what makes it look like delivery
    // rather than a static starburst.
    r = 0.09 + p.u * (L.spread - 0.09) + Math.sin(t * 2.4 - p.u * 5.5) * 0.03;
  }
  return [Math.cos(th) * r, Math.sin(th) * r];
}

export default function OllieOrb({
  state = "idle",
  size = 300,
  caption,
}: {
  state?: OrbState;
  size?: number;
  caption?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Read inside the animation loop rather than captured, so a state change does
  // not tear down and rebuild the loop — which would reset every particle and
  // produce exactly the pop this design exists to avoid.
  const stateRef = useRef<OrbState>(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    // Aliased to a definitely-non-null const: the narrowing from the guard
    // above does not survive into the animation closure below.
    const ctx: CanvasRenderingContext2D = maybeCtx;

    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const ps: P[] = [];
    for (let i = 0; i < PARTICLES; i++) {
      ps.push({
        a: Math.random() * Math.PI * 2,
        // sqrt keeps the cloud evenly dense instead of piling up at the centre.
        u: Math.sqrt(Math.random()),
        arm: i % ARMS,
        spoke: i % SPOKES,
        // Gaussian-ish, so an arm has a soft edge rather than a hard one.
        jit: (Math.random() + Math.random() + Math.random() - 1.5) / 1.5,
        wob: Math.random(),
        x: 0,
        y: 0,
        on: false,
      });
    }

    const mid = size / 2;
    const R0 = size * 0.42;
    let raf = 0;
    let running = true;
    let t = 0;

    function frame() {
      if (!running) return;
      const s = stateRef.current;
      const L = LOOKS[s];
      t += still ? 0 : 1 / 60;
      // He breathes. A few percent, slowly — enough that the eye reads a living
      // thing rather than a rendered still.
      const R = still ? R0 : R0 * (1 + Math.sin(t * 0.85) * 0.035);

      ctx.clearRect(0, 0, size, size);

      // The core. Small and hot — the reference gets its drama from a tiny
      // white centre against a lot of black, not from a big soft ball.
      const cr = R * L.core * (1 + (still ? 0 : Math.sin(t * 1.9) * 0.07));
      const halo = ctx.createRadialGradient(mid, mid, 0, mid, mid, cr * 7);
      halo.addColorStop(0, `rgba(240,253,255,${0.98 * L.glow})`);
      halo.addColorStop(0.08, `rgba(150,232,255,${0.72 * L.glow})`);
      halo.addColorStop(0.26, `rgba(70,198,245,${0.26 * L.glow})`);
      halo.addColorStop(0.6, `rgba(61,220,151,${0.07 * L.glow})`);
      halo.addColorStop(1, "rgba(61,220,151,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(mid, mid, cr * 7, 0, Math.PI * 2);
      ctx.fill();

      // Drawn additively as SHORT LINES along each particle's own path, not as
      // dots. A dot cloud reads as scattered confetti; a smear along the
      // direction of travel reads as a filament, and where filaments overlap
      // the additive blend builds the bright spine of an arm by itself. That is
      // the whole difference between this and the first attempt.
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      const scale = size / 300;
      for (const p of ps) {
        const [tx, ty] = target(p, s, t);
        if (!p.on) {
          p.x = tx;
          p.y = ty;
          p.on = true;
        } else if (!still) {
          // Ease toward where this state wants it. The lag IS the morph.
          p.x += (tx - p.x) * 0.05;
          p.y += (ty - p.y) * 0.05;
        } else {
          p.x = tx;
          p.y = ty;
        }

        // The tail: where this particle was a moment ago under the same rule.
        // Taken from the shape function rather than the previous frame, so a
        // particle still travelling between states trails along the path it is
        // heading for instead of the one it came from.
        const [bx, by] = target(p, s, t - TRAIL * L.trail);
        const d = Math.hypot(p.x, p.y);
        const u = Math.min(1, d / Math.max(0.001, L.spread));
        const [cr_, cg_, cb_] = tint(u);
        // Faint per filament — the density does the work, not the opacity.
        // Shimmer: each filament brightens and dims on its own clock, so the
        // cloud never sits still even when the shape has settled. Without it a
        // slow state like idle reads as a static image of an orb.
        const shim = 0.72 + 0.28 * Math.sin(t * 2.4 + p.wob * 13.0);
        const alpha = L.glow * L.ink * shim * (0.10 + 0.46 * (1 - u) ** 1.35);

        ctx.strokeStyle = `rgba(${cr_ | 0},${cg_ | 0},${cb_ | 0},${alpha})`;
        ctx.lineWidth = L.line * (0.6 + (1 - u) * 0.85) * scale;
        ctx.beginPath();
        ctx.moveTo(mid + (p.x + (p.x - bx)) * R, mid + (p.y + (p.y - by)) * R);
        ctx.lineTo(mid + bx * R, mid + by * R);
        ctx.stroke();

        // A brighter head on the inner particles, so the middle has sparkle
        // rather than being an even wash.
        if (u < 0.55) {
          ctx.fillStyle = `rgba(${cr_ | 0},${cg_ | 0},${cb_ | 0},${alpha * 1.5})`;
          ctx.beginPath();
          ctx.arc(mid + p.x * R, mid + p.y * R, 0.55 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";

      if (!still) raf = requestAnimationFrame(frame);
    }

    frame();

    // Off-screen or in a hidden tab, this is a battery drain and nothing else.
    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        frame();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) {
          running = false;
          cancelAnimationFrame(raf);
        } else if (!running && !document.hidden) {
          running = true;
          frame();
        }
      });
      io.observe(canvas);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      io?.disconnect();
    };
  }, [size]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        // Decorative, and DELIBERATELY inert. The name and the question box are
        // pulled up into this canvas by negative margins, so it overlaps them
        // by design — 70px of a 640px canvas sits over the box on a desktop. A
        // canvas that accepts pointer events there IS a question box you cannot
        // click, which reads as the whole page being locked.
        style={{ width: size, height: size, display: "block", pointerEvents: "none" }}
        aria-hidden
      />
      {caption && (
        <div
          style={{
            fontSize: 14.5,
            letterSpacing: ".02em",
            color: "rgba(200,226,240,.72)",
            fontWeight: 500,
          }}
        >
          {caption}
        </div>
      )}
      {/* The state in words, for anyone who cannot see the orb. */}
      <span
        role="status"
        aria-live="polite"
        style={{
          position: "absolute", width: 1, height: 1, overflow: "hidden",
          clip: "rect(0 0 0 0)", whiteSpace: "nowrap",
        }}
      >
        {state}
      </span>
    </div>
  );
}
