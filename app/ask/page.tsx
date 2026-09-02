"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import OllieHunt from "@/components/OllieHunt";
import OllieOrb, { OrbState } from "@/components/OllieOrb";
import {
  AskProgress, AskStarted, AssistantKeyStatus, AssistantQuota, Preferences, api,
} from "@/lib/api";
import { C, D, MONO } from "@/components/apex";
import { useT } from "@/lib/i18n";

/**
 * Ask anything — a full page rather than a floating panel.
 *
 * History lives in component state and is sent with each request; the API is
 * stateless, so the client owns the conversation. Answers carry the SQL the
 * model ran, shown behind a toggle, so any figure can be traced back to the
 * query that produced it instead of being taken on trust.
 */

interface Msg {
  role: "user" | "assistant";
  content: string;
  queries?: string[];
  tools?: string[];
  error?: boolean;
}

const SUGGESTIONS = [
  "What are the 5 biggest margins on the market right now?",
  "Which suburb has the most subdividable land?",
  "What's a bedroom worth in Manukau compared with the North Shore?",
  "Average asking price by district for 4-bedroom houses?",
  "Which suburbs sell fastest?",
  "Show me 3-bed houses under $900k with land over 600m²",
];

export default function AskPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { t } = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [keyStatus, setKeyStatus] = useState<AssistantKeyStatus | null>(null);
  // The daily allowance on the account-wide key. Shown before they ask, not
  // discovered when the box refuses them.
  const [quota, setQuota] = useState<AssistantQuota | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const typerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (typerRef.current) clearInterval(typerRef.current); }, []);
  // Which of Ollie's four faces to show. Driven by what is actually happening,
  // never guessed: he listens while the box has focus, works while a question
  // is in flight, and delivers for a moment when the answer lands.
  const [orb, setOrb] = useState<OrbState>("idle");
  // How much of the newest answer has been revealed. Ollie stays in "speaking"
  // for exactly as long as this is running, so the orb and the words are the
  // same event rather than an animation that happens to overlap some text.
  const [typed, setTyped] = useState<number | null>(null);
  // How far along the question in flight is. Null when nothing is being asked.
  // Ollie takes as long as he needs now, and a wait with no end in sight and
  // nothing moving is indistinguishable from a hang — so the corner counts.
  const [progress, setProgress] = useState<{ pct: number; phase: string | null } | null>(null);
  // False once this page is gone. The poll loop below has no attempt ceiling —
  // deliberately — so this is the only thing that ends it early, and without it
  // the loop outlives the component and keeps polling for the life of the tab.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  // What they're hunting. The first time someone opens Ollie he asks; every
  // fortnight after that he checks it still holds. Null while we're finding
  // out — the page shows nothing rather than flashing the wrong thing.
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  // Set when they've dealt with the questions in this visit, or reopened them
  // deliberately. Kept in component state rather than read back off `prefs`,
  // because the answer they've just given should stick for this visit even
  // while the server round-trip is in flight.
  const [huntOpen, setHuntOpen] = useState<boolean | null>(null);
  // How big Ollie can be here. A fixed size is right on a laptop and wider than
  // a phone, so the full size is a CEILING and the viewport decides below it.
  const [vw, setVw] = useState(1280);
  useEffect(() => {
    const sync = () => setVw(window.innerWidth);
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
  // 26px of page padding each side, and a little air beyond that.
  const room = Math.max(180, vw - 96);
  /**
   * Two columns on a desktop, one everywhere else.
   *
   * Stacked, Ollie sits above the conversation — so once you are two questions
   * in he is capped at 240px and pushed off the top of the screen, smallest and
   * furthest away at exactly the moment he is working and you are waiting. His
   * own column fixes that: he keeps his size, and he stays with you down a long
   * answer. Below this width there is not room for two columns worth having, so
   * phones and narrow laptops keep the stacked layout, which already works.
   */
  const split = vw >= 1000;
  /**
   * How big he is, and therefore how wide his column is.
   *
   * He only fills the middle of his own canvas — idle reaches about a third of
   * the way out — so the canvas has to be generous for the orb inside it to
   * read at any size at all. Half the row, capped at 640 so he does not become
   * a poster on an ultrawide.
   *
   * The floor is the reading column, not him: whatever is left after the gap
   * has to stay wide enough to read an answer in, so on a smaller desktop he
   * gives way rather than squeezing the answers into a gutter.
   */
  const READING_MIN = 420;
  const COL_GAP = 34;
  const orbSize = split
    ? Math.max(260, Math.min(640, Math.round(room * 0.50), room - COL_GAP - READING_MIN))
    : msgs.length
      ? Math.min(240, Math.round(room * 0.42))
      : Math.min(560, room);

  /**
   * The question that is still being worked on, if there is one.
   *
   * A question survives leaving the page — that is the whole point of it being
   * a job — but the conversation lives in component state, so without this the
   * answer to a question you walked away from is simply lost to you. It is
   * still on the server, and Ollie still learns from it, but you never see it.
   *
   * Session storage rather than local: it belongs to this tab and this sitting.
   * Every read and write is wrapped, because a browser set to block site data
   * throws on access rather than returning nothing.
   */
  function remember(id: number, question: string) {
    try { sessionStorage.setItem("apex:ask", JSON.stringify({ id, question })); } catch {}
  }
  function forget() {
    try { sessionStorage.removeItem("apex:ask"); } catch {}
  }

  // Pick a question back up on the way in.
  useEffect(() => {
    let parked: { id: number; question: string } | null = null;
    try {
      const raw = sessionStorage.getItem("apex:ask");
      if (raw) parked = JSON.parse(raw);
    } catch { parked = null; }
    if (!parked?.id || typeof parked.question !== "string") return;
    setMsgs([{ role: "user", content: parked.question }]);
    setBusy(true);
    setOrb("thinking");
    setProgress({ pct: 2, phase: "Catching up" });
    follow(parked.id).finally(() => {
      if (!aliveRef.current) return;
      setBusy(false);
      setProgress(null);
    });
    // Once, on the way in. `follow` is stable enough for this and re-running it
    // would start a second loop on the same question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api<AssistantKeyStatus>("/api/assistant/settings").then(setKeyStatus).catch(() => null);
    api<AssistantQuota>("/api/assistant/quota").then(setQuota).catch(() => null);
    api<Preferences>("/api/preferences")
      .then((p) => {
        setPrefs(p);
        setHuntOpen(p.state !== "current");
      })
      // A failure here must not lock anyone out of Ollie: if we cannot tell
      // whether to ask, we don't ask.
      .catch(() => setHuntOpen(false));
  }, []);

  /**
   * The conversation, newest exchange FIRST.
   *
   * Chronological order put the newest answer at the bottom of everything that
   * came before it, so the longer the session ran the further you scrolled to
   * read the thing you had just asked for. Newest-first means the answer is
   * always the next thing under the question box; the history is still there,
   * underneath, for anyone who wants it.
   *
   * Grouped into exchanges rather than reversed message by message — reversing
   * a flat list puts every answer ABOVE its own question.
   */
  const exchanges = (() => {
    const out: { q: Msg | null; a: Msg | null }[] = [];
    for (const m of msgs) {
      if (m.role === "user") out.push({ q: m, a: null });
      else if (out.length && out[out.length - 1].a === null) out[out.length - 1].a = m;
      else out.push({ q: null, a: m });
    }
    return out.reverse();
  })();
  /** Which answer the typewriter is currently revealing — the newest one. */
  const newestAnswer = msgs.length && msgs[msgs.length - 1].role === "assistant"
    ? msgs[msgs.length - 1]
    : null;

  // Bring the top of the conversation into view, not the bottom of it.
  useEffect(() => {
    if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [msgs.length]);

  /**
   * Ask, then wait for as long as it takes.
   *
   * The question is started as a JOB and polled — it is never answered inside
   * the request that asked it. That one change is what makes
   *
   *     "ollie does not time out till it answers it"
   *
   * true rather than aspirational: the POST returns in milliseconds, so there
   * is no long-held connection for a proxy to cut, and the thinking happens
   * server-side whether this tab is here or not. A hard question that wants
   * nine lookups and four minutes gets them.
   *
   * Polling stops when the server says the question is finished. There is no
   * attempt ceiling on purpose — a cap here would be the timeout coming back
   * in through a different door.
   */
  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    setOrb("thinking");
    // 2%, not 0: the question is genuinely on its way, and a counter that reads
    // zero for the first second reads as nothing having happened. The server
    // takes over from the first poll and starts at 4.
    setProgress({ pct: 2, phase: "Sending the question" });
    try {
      const { ask_id } = await api<AskStarted>("/api/assistant/ask", {
        method: "POST",
        body: JSON.stringify({ question: q, history: history.slice(-20) }),
      });
      // Park it, so leaving the page and coming back does not lose the answer
      // to a question that is still being worked on. Cleared when it lands.
      remember(ask_id, q);
      await follow(ask_id);
    } catch (e: any) {
      // 428 means no key configured — refresh status so the banner appears.
      if (e?.status === 428) {
        api<AssistantKeyStatus>("/api/assistant/settings").then(setKeyStatus).catch(() => null);
        api<AssistantQuota>("/api/assistant/quota").then(setQuota).catch(() => null);
      }
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: e?.detail || "Something went wrong.", error: true },
      ]);
      forget();
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  /**
   * Watch one question until the server says it is finished.
   *
   * There is no attempt ceiling on purpose — a cap here would be the timeout
   * coming back in through a different door. What ends the loop is the server
   * saying "done" or "failed", and the server itself releases a question whose
   * worker died, so there is no state this can spin on for ever.
   *
   * It DOES stop when the page goes away. Without that check the loop outlives
   * the component it belongs to: navigate off Ollie and it keeps polling for
   * the life of the tab, setting state on something that is no longer mounted.
   */
  async function follow(ask_id: number) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 900));
      if (!aliveRef.current) return;          // the page is gone; so is this loop
      // A poll that fails is a dropped packet or a redeploy, not an answer.
      // Keep waiting — the work is on the server and is unaffected by it.
      const s = await api<AskProgress>(`/api/assistant/ask/${ask_id}`).catch(() => null);
      if (!aliveRef.current) return;
      if (!s) continue;
      setProgress({ pct: s.progress_pct, phase: s.phase });
      if (s.status === "running") continue;

      forget();
      if (s.status === "failed") {
        setMsgs((m) => [
          ...m,
          { role: "assistant", content: s.error || "Something went wrong.", error: true },
        ]);
        return;
      }
      const answer = s.answer || "";
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: answer, queries: s.queries, tools: s.tools_used },
      ]);
      typeOut(answer.length);
      api<AssistantQuota>("/api/assistant/quota").then(setQuota).catch(() => null);
      return;
    }
  }

  /**
   * Reveal the answer a few characters at a time, and hold Ollie in "speaking"
   * until the last one lands.
   *
   * Not decoration: a long answer arriving as one block gives no sense that
   * anything was said, and a fixed 2.6-second flourish had the orb finish
   * delivering while three paragraphs were still sitting there unread. Tied to
   * the length, the two are one event.
   */
  function typeOut(len: number) {
    if (typerRef.current) clearInterval(typerRef.current);
    const still =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still || len <= 0) {
      setTyped(null);
      setOrb("speaking");
      setTimeout(() => setOrb("idle"), 1400);
      return;
    }
    setOrb("speaking");
    setTyped(0);
    // Fast enough not to be a wait — a long answer still finishes in a couple
    // of seconds — and stepped rather than per-character so it stays cheap.
    const step = Math.max(3, Math.ceil(len / 90));
    typerRef.current = setInterval(() => {
      setTyped((n) => {
        const next = (n ?? 0) + step;
        if (next >= len) {
          if (typerRef.current) clearInterval(typerRef.current);
          typerRef.current = null;
          setTyped(null);
          setOrb("idle");
          return null;
        }
        return next;
      });
    }, 22);
  }

  // keyStatus describes the user's OWN key only. With an account-wide key set,
  // they need no key of their own, so the "connect a key" card must not appear.
  const noKey = keyStatus && !keyStatus.configured && quota != null && !quota.configured;
  // A stored key that cannot be READ is a different problem from no key at all,
  // with a different owner: an admin re-enters it, and the customer does
  // nothing. Both used to read "Add an API key in Settings first", which sends
  // the wrong person to go and buy something they do not need.
  const keyUnreadable = noKey && quota?.key_state === "unreadable";

  return (
    <div
      style={{
        // Ollie's own page, in the app's OWN dark rather than a second one.
        // This was a blue-black, close enough to the rail to read as a mistake
        // and far enough to see. Tokens live in components/apex.tsx.
        background: `radial-gradient(120% 60% at 50% 0%, ${D.lift} 0%, ${D.ground} 46%, ${D.ground} 100%)`,
        minHeight: "100%",
        width: "100%",
        // There is no header on this page, so the page provides its own top
        // room rather than starting hard against the window edge.
        padding: "26px 24px 60px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* On a phone the counter is fixed in the page corner. On desktop it
          lives under Ollie instead — it is HIS state, not the page's, and
          beside him it reads as one object thinking rather than a download. */}
      {progress && !split && <Counting pct={progress.pct} phase={progress.phase} fixed />}

      {/*
        Two columns on a desktop, and they divide the page by JOB rather than by
        decoration: everything you DO is on the left under Ollie — his name, the
        box, what he is watching — and everything he GIVES BACK is on the right,
        newest at the top, read downwards. The eye goes left to ask and right to
        read, and neither half moves when the other fills up.
      */}
      <div
        style={
          split
            ? {
                width: "100%", maxWidth: 1440,
                display: "grid",
                // Sized to him rather than to a percentage: the column exists to
                // hold the orb, so it is exactly as wide as the orb is.
                gridTemplateColumns: `${orbSize}px minmax(0, 1fr)`,
                gap: COL_GAP, alignItems: "start",
              }
            : { width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }
        }
      >
        {/* ---- ask: Ollie, his name, the box ------------------------------ */}
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            width: "100%",
            // Sticky on desktop so he — and the box — stay with you down a long
            // answer. The page still scrolls as one thing; only this holds.
            position: split ? "sticky" : "static",
            top: split ? 4 : undefined,
            // The canvas carries dead space above the orb as well as below it,
            // so laid out honestly he starts well below the column beside him.
            // Pull the column up through that space so the two line up.
            marginTop: split
              ? -Math.round(orbSize * 0.12)
              : msgs.length ? 10 : "min(6vh, 44px)",
            marginBottom: !split && msgs.length ? -Math.round(orbSize * 0.17) : 0,
            transition: "margin-top .5s ease",
          }}
        >
          <OllieOrb state={orb} size={orbSize} />

          {/* His name. In the split it stays put, because the column would
              otherwise be an unlabelled graphic once a conversation starts. */}
          {(split || !msgs.length) && (
            <h1
              style={{
                fontSize: split ? 38 : 44, fontWeight: 900, letterSpacing: "-.04em",
                color: D.ink, textAlign: "center",
                // Idle fills only the middle of the canvas, so an honest layout
                // leaves a hundred empty pixels between him and his own name.
                margin: `${-Math.round(orbSize * 0.24)}px 0 0`,
              }}
            >
              {t("ask.title")}
            </h1>
          )}

          {/* The box, directly under him. It is a prompt, not a form: a full
              width bar with a chunky button competes with the thing the page is
              about, so stacked it stays narrow and grows on focus. In the split
              it fills his column, because the column is already the right
              width and a floating short bar under a 640px orb looks lost. */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            style={{
              width: "100%",
              maxWidth: split ? "none" : orb === "listening" || input.trim() ? 620 : 460,
              marginTop: split ? 22 : 24,
              display: "flex", gap: 6, alignItems: "center",
              background: D.panel,
              border: `1px solid ${orb === "listening" ? D.lineOn : D.line}`,
              borderRadius: 999,
              padding: "4px 4px 4px 6px",
              transition: "max-width .35s ease, border-color .3s ease, background .3s ease",
            }}
          >
            <input
              // A stable hook for the browser tests. Selecting this box by
              // "form input" or by placeholder picks up the header's search
              // field instead — it is first in the DOM and collapses to zero
              // width on a phone, so a test aiming at Ollie silently measured
              // something else and reported a bug that was its own.
              data-testid="ollie-ask"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                keyUnreadable ? t("ask.placeholderKeyUnreadable")
                : noKey ? t("ask.placeholderNoKey")
                : t("ask.placeholder")
              }
              disabled={!!noKey}
              onFocus={() => { if (!busy) setOrb("listening"); }}
              onBlur={() => { if (!busy && !input.trim()) setOrb("idle"); }}
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none",
                fontSize: 14.5, fontFamily: "inherit", padding: "10px 12px",
                background: "transparent", color: D.ink,
              }}
            />
            <button
              type="submit"
              aria-label={t("ask.send")}
              title={t("ask.send")}
              disabled={busy || !input.trim() || !!noKey}
              style={{
                width: 34, height: 34, flexShrink: 0, borderRadius: 999,
                border: "none", display: "flex", alignItems: "center",
                justifyContent: "center",
                cursor: busy || !input.trim() || noKey ? "default" : "pointer",
                background: busy || !input.trim() || noKey
                  ? "rgba(255,255,255,.09)" : D.accent,
                transition: "background .25s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M8 13.2V2.8M8 2.8L3.4 7.4M8 2.8l4.6 4.6"
                  stroke={busy || !input.trim() || noKey ? D.faint : "#0C1116"}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>

          {quota?.shared && quota.configured && quota.limit != null && (
            <div style={{ marginTop: 12, fontSize: 13,
                          color: quota.remaining === 0 ? "#FF9A6E" : D.faint }}>
              {quota.remaining === 0
                ? t("ask.quotaNone", { limit: quota.limit })
                : t("ask.quotaLeft", { n: quota.remaining ?? 0, limit: quota.limit })}
            </div>
          )}

          {/* Say what is wrong and who fixes it, rather than greying a box and
              leaving the reader to guess whether the product is broken. */}
          {noKey && (
            <p style={{ marginTop: 14, fontSize: 13, color: "#FF9A6E",
                        textAlign: split ? "left" : "center", lineHeight: 1.5,
                        maxWidth: 420 }}>
              {keyUnreadable ? t("ask.keyUnreadable") : t("ask.keyMissing")}
            </p>
          )}
          {noKey && !keyUnreadable && (
            <Link
              href="/settings"
              style={{
                marginTop: 16, fontSize: 13.5, color: D.accent, fontWeight: 700,
                borderBottom: `1px solid ${D.lineOn}`, paddingBottom: 1,
              }}
            >
              {t("ask.addKey")}
            </Link>
          )}

          {/* His state, under him — not a progress bar belonging to the page. */}
          {split && progress && (
            <div style={{ marginTop: 18 }}>
              <Counting pct={progress.pct} phase={progress.phase} />
            </div>
          )}

          {/* What he is watching for this person, and the way back into it. */}
          {prefs && prefs.state !== "unset" && (
            <button
              type="button"
              onClick={() => setHuntOpen(true)}
              style={{
                marginTop: split ? 20 : 26, background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit", fontSize: 12.5,
                color: D.faint, textAlign: "center", lineHeight: 1.5,
                maxWidth: split ? 380 : 620,
              }}
            >
              {[
                prefs.goals.length
                  ? prefs.goals.map((g) => t(`hunt.goal.${g}`)).join(" · ")
                  : t("checkin.anyGoal"),
                prefs.suburbs.length ? prefs.suburbs.join(", ") : t("checkin.anywhere"),
              ].join(" — ")}
              <span style={{ color: D.accent, fontWeight: 700 }}>  {t("hunt.change")}</span>
            </button>
          )}
        </div>

        {/* ---- what comes back -------------------------------------------- */}
        <div
          style={{
            display: "flex", flexDirection: "column",
            alignItems: split ? "stretch" : "center",
            width: "100%", minWidth: 0,
            marginTop: split ? 0 : 24,
          }}
        >
          {/* The hunt questions are CONTENT, not a gate. Rendered as the whole
              page they meant a new customer opened Ollie and met a form — no
              orb, no question box, nothing to ask with until they had answered
              or found the skip. They belong on this side, above whatever else
              is here, and never in place of the box. */}
          {huntOpen && prefs && (
            <div style={{ width: "100%", maxWidth: split ? "none" : 760,
                          marginBottom: 22 }}>
              <OllieHunt
                prefs={prefs}
                onDone={setPrefs}
                onDismiss={() => {
                  setHuntOpen(false);
                  api<Preferences>("/api/preferences").then(setPrefs).catch(() => null);
                }}
              />
            </div>
          )}

          {/* Nothing asked yet. These stand where the answers will, so the
              column is never an empty half-page — and they say what he is for
              better than a paragraph explaining him would. */}
          {msgs.length === 0 && !noKey && (
            <div style={{ width: "100%", maxWidth: split ? "none" : 720 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9,
                            justifyContent: split ? "flex-start" : "center" }}>
                {SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    onClick={() => send(sug)}
                    style={{
                      textAlign: "left", padding: "11px 15px", borderRadius: 13,
                      border: `1px solid ${D.line}`, background: D.panel,
                      fontSize: 13.5, cursor: "pointer", color: D.dim,
                      fontFamily: "inherit", lineHeight: 1.4,
                    }}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msgs.length > 0 && (
            <div style={{ width: "100%", maxWidth: split ? "none" : 760,
                          display: "flex", flexDirection: "column", gap: 22 }}>
              <div ref={endRef} />
              {exchanges.map((x, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 12,
                                      opacity: i === 0 ? 1 : 0.72 }}>
                  {x.q && <Bubble msg={x.q} />}
                  {x.a && (
                    <Bubble
                      msg={x.a}
                      typing={x.a === newestAnswer ? typed : null}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {msgs.length > 0 && (
            <button
              type="button"
              onClick={() => { setMsgs([]); setOrb("idle"); }}
              style={{
                marginTop: 22, background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, color: D.faint,
                borderBottom: `1px solid ${D.line}`, paddingBottom: 1,
                alignSelf: split ? "flex-start" : "center",
              }}
            >
              {t("ask.clear")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Bubble({ msg, typing }: { msg: Msg; typing?: number | null }) {
  const mine = msg.role === "user";

  if (mine) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "80%", background: "rgba(70,198,245,.12)",
            border: `1px solid rgba(70,198,245,.28)`, color: "#CFE6F6",
            padding: "12px 17px", borderRadius: "16px 16px 4px 16px",
            fontSize: 15.5, lineHeight: 1.5, fontWeight: 600,
          }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  // Only as much as has been spoken. A caret sits on the edge while it runs.
  const shown = typing == null ? msg.content : msg.content.slice(0, typing);
  const running = typing != null && typing < msg.content.length;

  return (
    <div
      style={{
        background: msg.error ? "rgba(212,80,62,.1)" : D.panelSolid,
        border: `1px solid ${msg.error ? "rgba(212,80,62,.4)" : D.line}`,
        borderRadius: "16px 16px 16px 4px",
        padding: "16px 19px",
      }}
    >
      <style>{`@keyframes ollieCaret{0%,45%{opacity:1}55%,100%{opacity:0}}`}</style>
      <div
        style={{
          fontSize: 15.5, lineHeight: 1.65, whiteSpace: "pre-wrap",
          color: msg.error ? "#FF9A6E" : D.ink,
        }}
      >
        {shown}
        {running && (
          <span
            style={{
              display: "inline-block", width: 8, height: 17, marginLeft: 2,
              transform: "translateY(3px)", background: D.accent,
              animation: "ollieCaret 1s steps(1) infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}


/**
 * The counter in the corner. 0-100%, while Ollie works.
 *
 * There is no deadline on an answer any more, which is the right trade — a
 * question that needs four minutes should take four minutes rather than be cut
 * off at fifty-five seconds and answered part-way. But an open-ended wait with
 * nothing moving is indistinguishable from a hang, and the honest fix for that
 * is to show the work rather than to cap it.
 *
 * The number is REAL. It comes from the server and rises as steps genuinely
 * complete — a pass of thinking, a lookup run, the answer being written — and
 * it reaches 100 only when the answer exists. It is not a bar timed to look
 * busy, so it can sit still, and the phase underneath says what it is sitting
 * on.
 *
 * Bottom-right, small, and out of the way: it is reassurance, not the subject
 * of the page. Ollie is.
 */
function Counting({ pct, phase, fixed }: {
  pct: number; phase: string | null; fixed?: boolean;
}) {
  const R = 13;
  const CIRC = 2 * Math.PI * R;
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div
      aria-live="polite"
      aria-label={`${safe}% — ${phase || "working"}`}
      style={{
        // Fixed in the page corner on a phone, where there is nowhere else for
        // it. On a desktop it is placed under Ollie instead and simply flows.
        ...(fixed
          ? { position: "fixed" as const, right: 18, bottom: 18, zIndex: 40 }
          : null),
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 13px 8px 9px", borderRadius: 999,
        background: "rgba(22,25,31,.82)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        border: `1px solid ${D.line}`,
        pointerEvents: "none",
      }}
    >
      <svg width={32} height={32} viewBox="0 0 32 32" style={{ display: "block" }}>
        <circle cx="16" cy="16" r={R} fill="none" stroke={D.line} strokeWidth="2.5" />
        <circle
          cx="16" cy="16" r={R} fill="none" stroke={D.accent} strokeWidth="2.5"
          strokeLinecap="round" strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - safe / 100)}
          transform="rotate(-90 16 16)"
          // Eased so a jump from one milestone to the next sweeps rather than
          // snaps. The NUMBER is never smoothed — only the ring.
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            fontFamily: MONO, fontSize: 13, fontWeight: 700, color: D.ink,
            lineHeight: 1, fontVariantNumeric: "tabular-nums",
          }}
        >
          {safe}%
        </span>
        {phase && (
          <span style={{ fontSize: 10.5, color: D.faint, lineHeight: 1.2 }}>
            {phase}
          </span>
        )}
      </div>
    </div>
  );
}
