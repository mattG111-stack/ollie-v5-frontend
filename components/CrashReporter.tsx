"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { APP_VERSION } from "@/lib/version";

/**
 * Sends crashes in the page to the bug log on their own.
 *
 * Every round of debugging this app has started with a console error pasted into
 * a chat. That only happens when someone notices, has devtools open, and thinks
 * to copy it — three conditions that mostly do not hold, so most crashes were
 * simply never known about. The page can send them itself, with the build it
 * happened on attached.
 *
 * Only the message, the stack and the page are sent. No form values, no request
 * bodies, nothing typed. The server counts repeats on one entry rather than
 * filing them again, so a component crashing in a render loop is one row.
 */
const MAX_PER_SESSION = 10;

export default function CrashReporter() {
  useEffect(() => {
    let sent = 0;
    // Same fault twice in one session is not two faults. The server dedupes
    // across sessions; this stops us posting the same thing on every re-render.
    const seen = new Set<string>();

    const send = (message: string, stack?: string) => {
      if (!message || sent >= MAX_PER_SESSION) return;
      const key = `${message}|${stack?.slice(0, 200) ?? ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      sent += 1;
      // Fire and forget. A crash reporter that can itself throw, or that blocks
      // whatever the page was doing, is worse than no crash reporter.
      api("/api/bugs/client", {
        method: "POST",
        body: JSON.stringify({
          message: message.slice(0, 500),
          stack: stack?.slice(0, 8000) ?? null,
          page: window.location.pathname,
          app_version: APP_VERSION,
        }),
      }).catch(() => {});
    };

    const onError = (e: ErrorEvent) => {
      send(e.message || String(e.error ?? "Unknown error"), e.error?.stack);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r: any = e.reason;
      // An API error already carries a readable message and is recorded
      // server-side anyway; sending it again would file the same fault twice.
      if (r && typeof r === "object" && "status" in r) return;
      send(r?.message ? `Unhandled promise rejection: ${r.message}` : "Unhandled promise rejection",
           r?.stack);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
