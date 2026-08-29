"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import OllieHunt from "@/components/OllieHunt";
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
    try {
      const r = await api<AssistantAnswer>("/api/assistant", {
        method: "POST",
        body: JSON.stringify({ question: q, history: history.slice(-20) }),
      });
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: r.answer, queries: r.queries, tools: r.tools_used },
      ]);
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

  // keyStatus describes the user's OWN key only. With an account-wide key set,
  // they need no key of their own, so the "connect a key" card must not appear.
  const noKey = keyStatus && !keyStatus.configured && quota != null && !quota.configured;

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 1100, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: ".24em", color: C.accent, fontWeight: 600 }}>
            {t("ask.eyebrow")}
          </div>
          <h1 style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-.035em", lineHeight: 1, marginTop: 12 }}>
            {t("ask.title")}
          </h1>
          {/* Was hard-coded English, so it was the one line on this page that
              could not translate — and it described our plumbing (a "live
              query", "the model's memory") rather than what the reader gets. */}
          <p style={{ fontSize: 16, color: C.label, maxWidth: 640, marginTop: 14, lineHeight: 1.5 }}>
            {t("ask.intro")}
          </p>
        </div>
      </div>

      {quota?.shared && quota.configured && quota.limit != null && (
        <div style={{ marginTop: 20, fontSize: 13, color: quota.remaining === 0 ? C.danger : C.label }}>
          {quota.remaining === 0
            ? t("ask.quotaNone", { limit: quota.limit })
            : t("ask.quotaLeft", { n: quota.remaining ?? 0, limit: quota.limit })}
        </div>
      )}

      {/* Not while Ollie is asking. Two calls to action on one screen means the
          customer answers neither, and "connect a key" alongside "what are you
          hunting?" reads as though the questions were a setup chore. */}
      {noKey && !huntOpen && (
        <Card style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 340px", minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{t("ask.connectTitle")}</div>
              <div style={{ fontSize: 14, color: C.label, marginTop: 6, lineHeight: 1.5 }}>
{t("ask.connectBody")}
              </div>
            </div>
            <Link
              href="/settings"
              style={{
                background: C.accent, color: "#fff", borderRadius: 11,
                padding: "13px 22px", fontWeight: 700, fontSize: 14, whiteSpace: "nowrap",
              }}
            >
              {t("ask.addKey")}
            </Link>
          </div>
        </Card>
      )}

      {/* Ollie asks first. Not a signup wizard, not a settings page — the
          questions live here, in the conversation, the first time someone
          opens him and every fortnight after that. */}
      {huntOpen && prefs && (
        <div style={{ marginTop: 26 }}>
          <OllieHunt
            prefs={prefs}
            onDone={setPrefs}
            onDismiss={() => {
              setHuntOpen(false);
              // Re-read, so the strip below reflects what was actually stored
              // rather than what we hoped was.
              api<Preferences>("/api/preferences").then(setPrefs).catch(() => null);
            }}
          />
        </div>
      )}

      {/* What he's holding on to, and the way back in. Without this, "we saved
          your preferences" is a claim the customer has no way to check. */}
      {!huntOpen && prefs && prefs.state !== "unset" && (
        <div
          style={{
            marginTop: 22, display: "flex", alignItems: "center", gap: 12,
            flexWrap: "wrap", background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 14, padding: "13px 18px",
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>
            {t("hunt.fromNow")}
          </span>
          <span style={{ flex: "1 1 280px", minWidth: 0, fontSize: 14, color: C.ink, fontWeight: 600 }}>
            {[
              prefs.goals.length
                ? prefs.goals.map((g) => t(`hunt.goal.${g}`)).join(" · ")
                : t("checkin.anyGoal"),
              prefs.suburbs.length ? prefs.suburbs.join(", ") : t("checkin.anywhere"),
            ].join(" — ")}
          </span>
          <button
            type="button"
            onClick={() => setHuntOpen(true)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 13.5, fontWeight: 700,
              color: C.ink, borderBottom: `1.5px solid ${C.ink}`, padding: "0 0 1px",
            }}
          >
            {t("hunt.change")}
          </button>
        </div>
      )}

      {msgs.length === 0 && !noKey && !huntOpen && (
        <div style={{ marginTop: 26 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>
            {t("ask.tryThese")}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
              gap: 10,
              marginTop: 12,
            }}
          >
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                style={{
                  textAlign: "left", padding: "15px 18px", borderRadius: 14,
                  border: `1px solid ${C.border}`, background: C.card,
                  fontSize: 14.5, cursor: "pointer", color: C.ink, fontFamily: "inherit",
                  lineHeight: 1.45,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {msgs.length > 0 && (
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 18 }}>
          {msgs.map((m, i) => (
            <Bubble key={i} msg={m} />
          ))}
        </div>
      )}

      {busy && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10 }}>
          <style>{`@keyframes ollieThink{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}`}</style>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
            padding: "10px 16px",
          }}>
            <span style={{ display: "inline-flex", gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} style={{
                  width: 7, height: 7, borderRadius: "50%", background: C.accent,
                  animation: `ollieThink 1.2s ${i * 0.18}s infinite ease-in-out`,
                }} />
              ))}
            </span>
            <span style={{ fontSize: 13.5, color: C.label, fontWeight: 600 }}>{t("ask.thinking")}</span>
          </div>
        </div>
      )}
      <div ref={endRef} />

      {/* Sticky composer — the page scrolls, the input stays reachable. Stood
          down while Ollie is asking: a sticky bar floats OVER the questions,
          covering the last answer and the Skip link underneath it. */}
      <div
        hidden={!!huntOpen}
        style={{
          position: "sticky", bottom: 20, marginTop: 28,
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: 12,
          boxShadow: "0 18px 40px -22px rgba(16,24,40,.4)",
        }}
      >
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={noKey ? t("ask.placeholderNoKey") : t("ask.placeholder")}
            disabled={!!noKey}
            style={{
              flex: 1, minWidth: 0, border: "none", outline: "none",
              fontSize: 16, fontFamily: "inherit", padding: "12px 14px", background: "transparent",
            }}
          />
          {msgs.length > 0 && (
            <button
              type="button"
              onClick={() => setMsgs([])}
              style={{
                background: "none", border: "none", color: C.faint,
                fontSize: 13, cursor: "pointer", padding: "0 8px",
              }}
            >
              {t("ask.clear")}
            </button>
          )}
          <button
            type="submit"
            disabled={busy || !input.trim() || !!noKey}
            style={{
              padding: "13px 26px", borderRadius: 11, border: "none",
              fontWeight: 700, fontSize: 15,
              cursor: busy || !input.trim() || noKey ? "not-allowed" : "pointer",
              background: busy || !input.trim() || noKey ? C.border : C.accent,
              color: busy || !input.trim() || noKey ? C.faint : "#fff",
            }}
          >
            {t("ask.send")}
          </button>
        </form>
      </div>

      <Note>
{t("ask.audit")}
      </Note>
    </div>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const mine = msg.role === "user";

  if (mine) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "80%", background: C.accent, color: "#fff",
            padding: "13px 18px", borderRadius: 16, fontSize: 15.5,
            lineHeight: 1.5, fontWeight: 500,
          }}
        >
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <Card style={{ background: msg.error ? "#FEF2F2" : C.card, borderColor: msg.error ? "#FECACA" : C.border }}>
      <div
        style={{
          fontSize: 15.5, lineHeight: 1.6, whiteSpace: "pre-wrap",
          color: msg.error ? C.danger : C.ink,
        }}
      >
        {msg.content}
      </div>
    </Card>
  );
}
