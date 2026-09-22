/**
 * Remembering which promoter sent someone here.
 *
 * The link is `/sign-up?ref=CODE`, but almost nobody signs up on the first
 * screen they land on. They read the homepage, open a listing, come back a day
 * later. If the code only existed in the URL of the page they first hit, every
 * one of those journeys would lose the attribution — and a promoter losing
 * credit for a customer they genuinely brought in is the fastest way to make
 * the whole programme not worth their time.
 *
 * So the code is captured from ANY page that carries it and kept in
 * localStorage until an account is actually created.
 *
 * It expires. A code that lived forever would credit a promoter for someone who
 * clicked their link in March and signed up in December after finding the site
 * some other way. Thirty days is a normal attribution window and is long enough
 * to cover a real "I'll think about it".
 */

const KEY = "apex_ref";
const VISITOR_KEY = "apex_visitor";
const WINDOW_DAYS = 30;

/**
 * A random id this browser made up for itself, so a promoter's click count can
 * tell one person from two.
 *
 * Nothing identifying: not derived from anything about the device or the
 * person, never sent anywhere except the click beacon, and useless for anything
 * other than de-duplicating a refresh. The server keeps no IP and no user agent
 * to pair it with.
 */
function visitorId(): string {
  try {
    let v = window.localStorage.getItem(VISITOR_KEY);
    if (!v) {
      v = (crypto?.randomUUID?.() ?? `v-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);
      window.localStorage.setItem(VISITOR_KEY, v);
    }
    return v;
  } catch {
    return "";
  }
}

type Stored = { code: string; at: number };

/** Strip it the same way the server does, so what is stored is what will match. */
function clean(raw: string | null): string {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 32);
}

/** Read ?ref= off the current URL and remember it. Safe to call on every page. */
export function captureRef(): void {
  if (typeof window === "undefined") return;
  const code = clean(new URLSearchParams(window.location.search).get("ref"));
  if (!code) return;

  // Tell the server the link was opened. Fire-and-forget on purpose: the
  // promoter's click count is not worth one millisecond of a stranger's page
  // load, and a counter that can fail visibly is worse than no counter.
  const visitor = visitorId();
  if (visitor) {
    try {
      fetch("/api/promoter/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, visitor }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      /* blocked, offline, or an extension ate it — nothing depends on this */
    }
  }

  try {
    // First one wins. Someone who arrives through one promoter's link and later
    // clicks another's belongs to the first — otherwise two promoters can bid
    // for the same signup by getting their link in front of them last.
    const existing = readRaw();
    if (existing) return;
    window.localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() } as Stored));
  } catch {
    /* private mode or a full quota — attribution is lost, signup is not */
  }
}

function readRaw(): Stored | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    if (!s?.code) return null;
    if (Date.now() - s.at > WINDOW_DAYS * 86_400_000) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

/** The remembered code, if there is a live one. Does not clear it — the signup
 *  may fail and be retried, and dropping it on the first attempt would lose the
 *  attribution to a mistyped password. */
export function currentRef(): string | null {
  if (typeof window === "undefined") return null;
  return readRaw()?.code ?? null;
}

/** Called once an account exists. The code has done its job. */
export function clearRef(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
