"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, useT } from "@/lib/i18n";
import { ApexLogo } from "./ApexLogo";
import CrashReporter from "./CrashReporter";
import { C, MONO } from "./apex";

/**
 * Ollie shell — dark rail, sticky translucent header. Styled from the design
 * build; tokens live in `apex.tsx`.
 */

interface Nav {
  href: string;
  label: string;
  dot?: string;
}

const overview: Nav[] = [
  { href: "/ask", label: "nav.askApex" },
  { href: "/today", label: "nav.today" },
  { href: "/properties", label: "nav.allProperties" },
  { href: "/wishlists", label: "nav.wishlists" },
  { href: "/trends", label: "nav.suburbTrends" },
];

const finders: Nav[] = [
  { href: "/underpriced", label: "nav.underpriced", dot: "#C9CED6" },
  // NOTE: the no-price "Auctions" lane is disabled in the UI until its matching
  // backend is deployed (the current backend rejects that lane's request with a
  // 422). Its nav entry, route and component are removed. Restore from git once
  // the backend that serves it ships.
  // Cashflow positive is hidden, not deleted: nothing in Auckland clears at a
  // 30% deposit and 6.75% interest, so the page is always empty. The route
  // still works. Re-list it once it ranks by break-even deposit instead of
  // filtering on a flag that is never true.
  { href: "/subdividable", label: "nav.subdividable", dot: "#565B63" },
  // "Room to add a bedroom" hidden from the nav for now (route still works at
  // /add-a-room). Re-list when it's ready to show.
  // { href: "/add-a-room", label: "nav.roomToAdd", dot: "#7C828C" },
];

/** A promoter is not a customer: no subscription, no listings. Every link in
 *  the customer nav would 402 for them, so they get their own one-item rail
 *  rather than a page of doors that do not open. */
const promoterNav: Nav[] = [
  { href: "/promoter", label: "nav.myReferrals" },
];

const adminNav: Nav[] = [
  { href: "/admin/dashboard", label: "nav.adminDashboard" },
  { href: "/admin/pending", label: "nav.pendingUsers" },
  { href: "/admin/users", label: "nav.allUsers" },
  { href: "/admin/assistant", label: "nav.assistantKey" },
  { href: "/admin/maps", label: "nav.mapImagery" },
  { href: "/admin/data-probe", label: "nav.dataProbe" },
  { href: "/admin/promoters", label: "nav.promoters" },
  { href: "/admin/bugs", label: "nav.bugLog" },
  { href: "/admin/upload", label: "nav.weeklyUpload" },
  { href: "/admin/publish", label: "nav.reviewPublish" },
  { href: "/admin/compare", label: "nav.compareBatches" },
];

/** True when the viewport is narrow enough to swap the fixed rail for a drawer.
 *  Defaults to false on the server / first paint; corrects on mount. */
export function useIsMobile(maxWidth = 900) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [maxWidth]);
  return isMobile;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading, signOut } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);

  // A promoter has no subscription and never will: they are not buying the
  // product, they are selling it. The paywall is not their next step, so they
  // are routed to their own dashboard rather than to a card form.
  const isPromoter = me?.role === "promoter";

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace("/sign-in");
    else if (isPromoter) {
      if (!pathname.startsWith("/promoter")) router.replace("/promoter");
    }
    // Authenticated but hasn't finished onboarding / has no live subscription —
    // send them to the paywall instead of flashing the app then bouncing on 402.
    else if (!me.has_access) router.replace("/onboarding");
  }, [loading, me, router, isPromoter, pathname]);

  // Close the drawer on navigation and whenever we grow back to desktop.
  useEffect(() => { setNavOpen(false); }, [pathname]);
  useEffect(() => { if (!isMobile) setNavOpen(false); }, [isMobile]);

  if (loading || !me || (!me.has_access && !isPromoter)) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: C.label, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  const initials = (me.full_name || me.email).slice(0, 2).toUpperCase();

  return (
    <div style={{ display: "flex", minHeight: "100vh", width: "100%", background: C.page }}>
      {/* Crashes in the page file themselves — see components/CrashReporter. */}
      <CrashReporter />
      {/* Dim + dismiss the drawer on mobile */}
      {isMobile && navOpen && (
        <div
          onClick={() => setNavOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,18,22,.55)", zIndex: 40 }}
        />
      )}
      <aside
        style={{
          width: 264,
          background: C.dark,
          color: "#EFE9DA",
          display: "flex",
          flexDirection: "column",
          padding: "26px 20px",
          height: "100vh",
          top: 0,
          ...(isMobile
            ? {
                position: "fixed",
                left: 0,
                zIndex: 50,
                transform: navOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform .25s ease",
                boxShadow: navOpen ? "0 0 44px rgba(0,0,0,.45)" : "none",
              }
            : { flex: "0 0 264px", position: "sticky" }),
        }}
      >
        <Link href="/today" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px 4px", color: "#EFE9DA" }}>
          {/* The rail is dark, so it takes the white artwork. Every other
              placement sits on bg-paper and uses the standard lockup. */}
          <ApexLogo size={20} tone="inverse" />
        </Link>

        <nav style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 26, flex: 1, overflowY: "auto" }}>
          {me.role === "promoter" ? (
            <NavGroup label={t("nav.promoter")} items={promoterNav} pathname={pathname} t={t} />
          ) : (
            <>
              <NavGroup label={t("nav.overview")} items={overview} pathname={pathname} t={t} />
              <NavGroup label={t("nav.dealFinders")} items={finders} pathname={pathname} t={t} />
            </>
          )}
          {me.role === "admin" && <NavGroup label={t("nav.admin")} items={adminNav} pathname={pathname} small t={t} />}
        </nav>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            padding: "14px 8px 0",
            borderTop: "1px solid rgba(255,255,255,.07)",
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: C.accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: 13,
              color: "#fff",
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: "#EFE9DA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {me.full_name || me.email}
            </div>
            <div style={{ fontSize: 11, color: "#767690", textTransform: "capitalize" }}>{me.role}</div>
          </div>
          <button
            onClick={signOut}
            style={{ fontSize: 11.5, color: "#767690", background: "none", border: "none", cursor: "pointer" }}
          >
            {t("nav.signOut")}
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar initials={initials} onMenu={() => setNavOpen(true)} showMenu={isMobile}
                pollMatches={!isPromoter} />
        {children}
      </main>
    </div>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  small,
  t,
}: {
  label: string;
  items: Nav[];
  pathname: string | null;
  small?: boolean;
  t: (k: string) => string;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".2em",
          color: "#6A6A82",
          padding: "0 12px 10px",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {items.map((it) => (
          <NavItem key={it.href} item={it} active={pathname === it.href} small={small} t={t} />
        ))}
      </div>
    </div>
  );
}

function NavItem({ item, active, small, t }: { item: Nav; active: boolean; small?: boolean; t: (k: string) => string }) {
  return (
    <Link
      href={item.href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: active ? "11px 12px" : "9px 12px",
        borderRadius: 10,
        fontWeight: active ? 700 : 500,
        fontSize: small ? 13.5 : 14.5,
        color: active ? "#FFFFFF" : small ? "#8A8AA8" : "#B0B0C8",
        background: active ? "linear-gradient(90deg,#333A43,#1B2026)" : undefined,
        boxShadow: active ? "0 4px 14px rgba(120,125,133,.4)" : undefined,
      }}
    >
      <span>{t(item.label)}</span>
      {item.dot && (
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: item.dot, flexShrink: 0 }} />
      )}
    </Link>
  );
}

function TopBar({ initials, onMenu, showMenu, pollMatches = true }: {
  initials: string; onMenu?: () => void; showMenu?: boolean;
  /** Off for promoters. Wish lists sit behind the paywall, so their poll comes
   *  back 402 — and a 402 used to bounce the promoter to the onboarding page
   *  a second after their own dashboard finished loading. */
  pollMatches?: boolean;
}) {
  const router = useRouter();
  const { t, lang, setLang } = useT();
  const [q, setQ] = useState("");
  const [langOpen, setLangOpen] = useState(false);
  const [newMatches, setNewMatches] = useState(0);
  const currentLang = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  // ── Predictive search ──────────────────────────────────────────────
  type Sug = { kind: string; label: string; sub: string | null; id: number | null };
  const [sugg, setSugg] = useState<Sug[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setSugg([]); setOpen(false); return; }
    let alive = true;
    const h = setTimeout(() => {
      api<Sug[]>(`/api/properties/suggest?q=${encodeURIComponent(term)}`)
        .then((r) => { if (alive) { setSugg(r); setOpen(r.length > 0); setActive(-1); } })
        .catch(() => { if (alive) { setSugg([]); setOpen(false); } });
    }, 150);
    return () => { alive = false; clearTimeout(h); };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(s: Sug) {
    setOpen(false); setQ("");
    if (s.kind === "address" && s.id != null) router.push(`/property/${s.id}`);
    else router.push(`/properties?search=${encodeURIComponent(s.label)}`);
  }
  function onSearchKey(e: React.KeyboardEvent) {
    if (!open || sugg.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, sugg.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
    else if (e.key === "Escape") setOpen(false);
  }

  // Wish-list match alerts — poll the badge count.
  //
  // Marked `background`, so a failure here never navigates. This poll runs every
  // minute behind whatever the user is reading; letting it redirect meant an
  // expired token threw them to the sign-in page mid-sentence, and a promoter's
  // 402 threw them to the paywall a second after their dashboard loaded.
  useEffect(() => {
    if (!pollMatches) return;
    let alive = true;
    let id: ReturnType<typeof setInterval> | undefined;

    const fetchN = () =>
      api<{ total_new: number }>("/api/wishlists/notifications", {}, { background: true })
        .then((r) => { if (alive) setNewMatches(r.total_new); })
        .catch((e: any) => {
          // STOP on an auth failure. Making the poll `background` fixed it
          // throwing people to the sign-in page mid-sentence, and introduced a
          // quieter fault: an expired token now produced a 401 every sixty
          // seconds, forever, where before there was one 401 and a bounce.
          // Neither 401 nor 402 is going to resolve itself on a timer, and a
          // request that cannot succeed should not keep being made — it is
          // noise in the log for us and wasted battery for them.
          if (e?.status === 401 || e?.status === 402) {
            if (id) clearInterval(id);
            id = undefined;
          }
        });

    fetchN();
    id = setInterval(fetchN, 60_000);
    return () => { alive = false; if (id) clearInterval(id); };
  }, [pollMatches]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (open && active >= 0 && active < sugg.length) { go(sugg[active]); return; }
    const term = q.trim();
    if (!term) return;
    setOpen(false);
    router.push(`/properties?search=${encodeURIComponent(term)}`);
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: showMenu ? 10 : 18,
        padding: showMenu ? "14px 16px" : "20px 40px",
        borderBottom: `1px solid ${C.border}`,
        background: "rgba(219,224,232,.85)",
        backdropFilter: "blur(8px)",
        position: "sticky",
        top: 0,
        zIndex: 5,
      }}
    >
      {showMenu && (
        <button
          type="button"
          onClick={onMenu}
          // Was labelled "Overview" — the nav GROUP heading. A hamburger that
          // announces itself as "Overview" to a screen reader is a button
          // nobody using one can find, and it is the only way to navigate the
          // app on a phone.
          aria-label={t("nav.openMenu")}
          style={{
            flexShrink: 0, width: 42, height: 42, borderRadius: 11,
            border: `1px solid ${C.border}`, background: C.card, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 2 }} />
          <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 2 }} />
          <span style={{ width: 18, height: 2, background: C.ink, borderRadius: 2 }} />
        </button>
      )}
      <div ref={searchRef} style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <form
        onSubmit={submit}
        onKeyDown={onSearchKey}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 13,
          padding: "13px 18px",
          boxShadow: "0 1px 0 rgba(255,255,255,.6) inset",
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            border: "2px solid #8894A6",
            borderRadius: "50%",
            display: "inline-block",
            flexShrink: 0,
          }}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (sugg.length) setOpen(true); }}
          placeholder={t("top.search")}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 15,
            color: C.ink,
            width: "100%",
          }}
        />
        {!showMenu && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: C.mono,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: "2px 7px",
              flexShrink: 0,
            }}
          >
            ↵
          </span>
        )}
      </form>

      {/* Predictive results dropdown */}
      {open && sugg.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
            boxShadow: "0 14px 34px -12px rgba(16,24,40,.32)", overflow: "hidden",
            maxHeight: 380, overflowY: "auto",
          }}
        >
          {sugg.map((s, i) => (
            <button
              key={`${s.kind}-${s.id ?? s.label}-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); go(s); }}
              style={{
                display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left",
                padding: "10px 14px", border: "none", cursor: "pointer",
                borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                background: i === active ? "#EEF3FA" : "transparent",
              }}
            >
              <span style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: ".05em", textTransform: "uppercase",
                color: s.kind === "suburb" ? "#2E353D" : "#8894A6", width: 52, flexShrink: 0,
              }}>
                {s.kind === "suburb" ? "Suburb" : "Address"}
              </span>
              <span style={{ minWidth: 0, overflow: "hidden" }}>
                <span style={{
                  display: "block", fontSize: 14, color: C.ink, fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>{s.label}</span>
                {s.sub && <span style={{ fontSize: 12, color: C.mono }}>{s.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      </div>

      {/* Region pill hidden on mobile — it doesn't fit the narrow header and the
          app is single-region for now. */}
      {!showMenu && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 11,
            padding: "9px 15px",
            fontWeight: 700,
            fontSize: 14,
            color: C.ink,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.accent }} />
          {t("top.region")}
        </div>
      )}

      {/* Wish-list alerts */}
      <Link
        href="/wishlists"
        aria-label={t("nav.wishlists")}
        title={t("nav.wishlists")}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 42,
          height: 42,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          color: "#5A6B82",
          flexShrink: 0,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {newMatches > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 19,
              height: 19,
              padding: "0 4px",
              background: "#22C55E",
              color: "#fff",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #DBE0E8",
            }}
          >
            {newMatches > 99 ? "99+" : newMatches}
          </span>
        )}
      </Link>

      {/* Language switcher — shows the current language; click to change.
          Hidden on mobile to fit the narrow header (also reachable in Settings). */}
      <div style={{ position: "relative", display: showMenu ? "none" : "block" }}>
        <button
          onClick={() => setLangOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={langOpen}
          aria-label={t("settings.language")}
          title={t("settings.language")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            color: langOpen ? C.accent : "#5A6B82",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        {langOpen && (
          <>
            <div onClick={() => setLangOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
            <div
              role="menu"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                zIndex: 21,
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                boxShadow: "0 12px 30px -12px rgba(16,24,40,.28)",
                overflow: "hidden",
                minWidth: 180,
                paddingBottom: 4,
              }}
            >
              <div
                style={{
                  padding: "10px 14px 6px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#8894A6",
                }}
              >
                {t("settings.language")}
              </div>
              {LANGUAGES.map((l) => {
                const active = l.code === lang;
                return (
                  <button
                    key={l.code}
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setLang(l.code);
                      setLangOpen(false);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 13.5,
                      fontWeight: 600,
                      background: active ? C.accent : "transparent",
                      color: active ? "#fff" : "#41505F",
                    }}
                  >
                    <span style={{ width: 20, fontSize: 15 }}>{l.short}</span>
                    <span>{l.label}</span>
                  </button>
                );
              })}
              <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0" }} />
              <button
                role="menuitem"
                onClick={() => {
                  setLangOpen(false);
                  router.push("/settings");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 14px",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13.5,
                  fontWeight: 600,
                  background: "transparent",
                  color: "#41505F",
                }}
              >
                <span style={{ width: 20, textAlign: "center", fontSize: 14 }}>⚙</span>
                <span>{t("settings.title")}</span>
              </button>
            </div>
          </>
        )}
      </div>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: C.accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 14,
          color: "#fff",
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
    </header>
  );
}
