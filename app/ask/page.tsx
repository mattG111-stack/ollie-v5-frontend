"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import OllieHunt from "@/components/OllieHunt";
import OllieOrb, { OrbState } from "@/components/OllieOrb";
import {
  AssistantAnswer, AssistantKeyStatus, AssistantQuota, Preferences, api,
} from "@/lib/api";
import { C, Card, MONO, Note } from "@/components/apex";
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
  // What they're hunting. The first time someone opens Ollie he asks; every
  // fortnight after that he checks it still holds. Null while we're finding
  // out — the page shows nothing rather than flashing the wrong thing.
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  // Set when they've dealt with the questions in this visit, or reopened them
  // deliberately. Kept in component state rather than read back off `prefs`,
  // because the answer they've just given should stick for this visit even
  // while the server round-trip is in flight.
  const [huntOpen, setHuntOpen] = useState<boolean | null>(null);

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

  useEffect(() => {
    if (msgs.length) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    setOrb("thinking");
    try {
      const r = await api<AssistantAnswer>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ question: q, history: history.slice(-20) }),
      });
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: r.answer, queries: r.queries, tools: r.tools_used },
      ]);
      typeOut(r.answer.length);
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
    } finally {
      setBusy(false);
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

  return (
    <div
      style={{
        // Ollie's own page, not a card on somebody else's. The dark is the
        // point: a cyan orb composited additively onto light grey is a smudge,
        // and boxing it made the page a box inside a box.
        background: "radial-gradient(120% 60% at 50% 0%, #12203A 0%, #0A1120 42%, #070B14 100%)",
        minHeight: "100%",
        width: "100%",
        padding: "0 24px 60px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {huntOpen && prefs ? (
        <div style={{ width: "100%", maxWidth: 760, marginTop: 34 }}>
          <OllieHunt
            prefs={prefs}
            onDone={setPrefs}
            onDismiss={() => {
              setHuntOpen(false);
              api<Preferences>("/api/preferences").then(setPrefs).catch(() => null);
            }}
          />
        </div>
      ) : (
        <>
          {/* Him, centred, with his name under him. Nothing else competing. */}
          <div
            style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              // Shrinks once there is a conversation, so the answers get the room.
              marginTop: msgs.length ? 14 : "min(6vh, 44px)",
              transition: "margin-top .5s ease",
            }}
          >
            <OllieOrb state={orb} size={msgs.length ? 156 : 338} />
            {!msgs.length && (
              <>
                <h1
                  style={{
                    fontSize: 44, fontWeight: 900, letterSpacing: "-.04em",
                    color: "#FFFFFF", textAlign: "center",
                    // Pulled up into the canvas. Idle only fills the middle of
                    // its box, so laid out honestly the title sits a hundred
                    // pixels below him with nothing in between.
                    margin: "-60px 0 0",
                  }}
                >
                  {t("ask.title")}
                </h1>
                {/* Nothing under the name. A paragraph explaining what he is
                    reads as a brochure, and the question box below already says
                    what to do. Only the working state gets a word. */}
                {busy && (
                  <p
                    style={{
                      fontSize: 15, color: "#7E9AC0", lineHeight: 1.5,
                      margin: "12px 0 0", textAlign: "center",
                    }}
                  >
                    {t("ask.thinking")}
                  </p>
                )}
              </>
            )}
          </div>

          {/* The question box, directly under him — and deliberately small.
              It is a prompt, not a form: a full-width bar with a chunky button
              competes with the thing the page is actually about. It widens and
              lights up on focus, so it grows into the task rather than
              announcing itself before there is a task. */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            style={{
              width: "100%",
              maxWidth: orb === "listening" || input.trim() ? 620 : 460,
              marginTop: 24,
              display: "flex", gap: 6, alignItems: "center",
              background: "rgba(16,28,49,.5)",
              border: `1px solid ${orb === "listening" ? "rgba(70,198,245,.5)" : "rgba(126,154,192,.18)"}`,
              borderRadius: 999,
              padding: "4px 4px 4px 6px",
              transition: "max-width .35s ease, border-color .3s ease, background .3s ease",
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={noKey ? t("ask.placeholderNoKey") : t("ask.placeholder")}
              disabled={!!noKey}
              onFocus={() => { if (!busy) setOrb("listening"); }}
              onBlur={() => { if (!busy && !input.trim()) setOrb("idle"); }}
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none",
                fontSize: 14.5, fontFamily: "inherit", padding: "10px 12px",
                background: "transparent", color: "#E8EDF5",
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
                  ? "rgba(126,154,192,.14)" : "#46C6F5",
                transition: "background .25s ease",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M8 13.2V2.8M8 2.8L3.4 7.4M8 2.8l4.6 4.6"
                  stroke={busy || !input.trim() || noKey ? "#55708F" : "#06121F"}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>

          {quota?.shared && quota.configured && quota.limit != null && (
            <div style={{ marginTop: 12, fontSize: 13, color: quota.remaining === 0 ? "#FF9A6E" : "#55708F" }}>
              {quota.remaining === 0
                ? t("ask.quotaNone", { limit: quota.limit })
                : t("ask.quotaLeft", { n: quota.remaining ?? 0, limit: quota.limit })}
            </div>
          )}

          {noKey && (
            <Link
              href="/settings"
              style={{
                marginTop: 16, fontSize: 13.5, color: "#46C6F5", fontWeight: 700,
                borderBottom: "1px solid rgba(70,198,245,.45)", paddingBottom: 1,
              }}
            >
              {t("ask.addKey")}
            </Link>
          )}

          {msgs.length === 0 && !noKey && (
            <div style={{ width: "100%", maxWidth: 720, marginTop: 30 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 9, justifyContent: "center" }}>
                {SUGGESTIONS.map((sug) => (
                  <button
                    key={sug}
                    onClick={() => send(sug)}
                    style={{
                      textAlign: "left", padding: "11px 15px", borderRadius: 13,
                      border: "1px solid rgba(126,154,192,.2)", background: "rgba(16,28,49,.5)",
                      fontSize: 13.5, cursor: "pointer", color: "#B9C8DC",
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
            <div style={{ width: "100%", maxWidth: 760, marginTop: 26,
                          display: "flex", flexDirection: "column", gap: 16 }}>
              {msgs.map((m, i) => (
                <Bubble key={i} msg={m} typing={i === msgs.length - 1 ? typed : null} />
              ))}
            </div>
          )}

          <div ref={endRef} />

          {msgs.length > 0 && (
            <button
              type="button"
              onClick={() => { setMsgs([]); setOrb("idle"); }}
              style={{
                marginTop: 22, background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, color: "#55708F",
                borderBottom: "1px solid rgba(85,112,143,.45)", paddingBottom: 1,
              }}
            >
              {t("ask.clear")}
            </button>
          )}

          {/* What he's watching for this person, and the way back into it. */}
          {prefs && prefs.state !== "unset" && (
            <button
              type="button"
              onClick={() => setHuntOpen(true)}
              style={{
                marginTop: 26, background: "none", border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12.5, color: "#55708F", textAlign: "center",
                lineHeight: 1.5, maxWidth: 620,
              }}
            >
              {[
                prefs.goals.length
                  ? prefs.goals.map((g) => t(`hunt.goal.${g}`)).join(" · ")
                  : t("checkin.anyGoal"),
                prefs.suburbs.length ? prefs.suburbs.join(", ") : t("checkin.anywhere"),
              ].join(" — ")}
              <span style={{ color: "#46C6F5", fontWeight: 700 }}>  {t("hunt.change")}</span>
            </button>
          )}

        </>
      )}
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
            maxWidth: "80%", background: "rgba(70,198,245,.13)",
            border: "1px solid rgba(70,198,245,.3)", color: "#CFE6F6",
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
        background: msg.error ? "rgba(212,80,62,.1)" : "rgba(16,28,49,.55)",
        border: `1px solid ${msg.error ? "rgba(212,80,62,.4)" : "rgba(126,154,192,.2)"}`,
        borderRadius: "16px 16px 16px 4px",
        padding: "16px 19px",
      }}
    >
      <style>{`@keyframes ollieCaret{0%,45%{opacity:1}55%,100%{opacity:0}}`}</style>
      <div
        style={{
          fontSize: 15.5, lineHeight: 1.65, whiteSpace: "pre-wrap",
          color: msg.error ? "#FF9A6E" : "#DCE7F3",
        }}
      >
        {shown}
        {running && (
          <span
            style={{
              display: "inline-block", width: 8, height: 17, marginLeft: 2,
              transform: "translateY(3px)", background: "#46C6F5",
              animation: "ollieCaret 1s steps(1) infinite",
            }}
          />
        )}
      </div>
    </div>
  );
}
