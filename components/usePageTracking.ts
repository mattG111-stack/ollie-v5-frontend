"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { api, getToken } from "@/lib/api";

/**
 * Report which page is open and how long it stayed open.
 *
 * One send per visit, on LEAVING the page, so each report carries its own dwell
 * time and the server never has to match a start against an end.
 *
 * Three things this is careful about, each of which has bitten this app before:
 *
 *  - it never blocks or breaks a page. Every call is fire-and-forget with
 *    `background: true`, which keeps a 401 or 402 away from the paywall routing.
 *    A background poll hitting a paywalled endpoint is exactly what made the
 *    promoter dashboard unusable for five builds.
 *  - it sends nothing when signed out. There is no one to attribute it to, and
 *    an unauthenticated POST would just 401 on every navigation.
 *  - closing the tab still counts. A normal fetch is cancelled when the page
 *    goes away, so the last page of every session — often the interesting one —
 *    would be missing. sendBeacon survives it.
 */
export default function usePageTracking() {
  const pathname = usePathname();
  const since = useRef<number>(Date.now());
  const current = useRef<string | null>(null);

  useEffect(() => {
    const send = (path: string, seconds: number, beacon: boolean) => {
      if (!path || !getToken()) return;
      const body = JSON.stringify({ path, seconds });
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        // Blob rather than a bare string: without an explicit JSON type the
        // browser sends text/plain and FastAPI rejects the body.
        navigator.sendBeacon("/api/activity/page", new Blob([body], { type: "application/json" }));
        return;
      }
      api(
        "/api/activity/page",
        { method: "POST", body, headers: { "Content-Type": "application/json" } },
        { background: true },   // keeps a 401/402 away from the paywall routing
      ).catch(() => {});
    };

    // Leaving the previous page: report it, then start timing this one.
    if (current.current && current.current !== pathname) {
      send(current.current, (Date.now() - since.current) / 1000, false);
    }
    current.current = pathname;
    since.current = Date.now();

    // pagehide covers closing, reloading and navigating away, including the
    // Safari back-forward cache where unload never fires at all.
    const flush = () => {
      if (current.current) {
        send(current.current, (Date.now() - since.current) / 1000, true);
        since.current = Date.now();
      }
    };
    const onHidden = () => { if (document.visibilityState === "hidden") flush(); };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [pathname]);
}
