"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { AssistantAnswer, AssistantKeyStatus, api } from "@/lib/api";
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
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api<AssistantKeyStatus>("/api/assistant/settings").then(setKeyStatus).catch(() => null);
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
      }
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: e?.detail || "Something went wrong.", error: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const noKey = keyStatus && !keyStatus.configured;

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
          <p style={{ fontSize: 16, color: C.label, maxWidth: 640, marginTop: 14, lineHeight: 1.5 }}>
            Any question about the data, in plain English. Every figure comes from a live query
            against your listings and sold records — never from the model&rsquo;s memory.
          </p>
        </div>
        {keyStatus?.configured && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "14px 20px" }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>
              {t("ask.provider")}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
              {keyStatus.provider === "openai" ? "OpenAI" : "Claude"}
            </div>
          </div>
        )}
      </div>

      {noKey && (
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

      {msgs.length === 0 && !noKey && (
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
        <div style={{ fontFamily: MONO, fontSize: 12.5, color: C.mono, marginTop: 18 }}>
          {t("ask.querying")}
        </div>
      )}
      <div ref={endRef} />

      {/* Sticky composer — the page scrolls, the input stays reachable. */}
      <div
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
  const { t, lang } = useT();
  const [showSql, setShowSql] = useState(false);
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

      {!!msg.queries?.length && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.divider}` }}>
          <button
            onClick={() => setShowSql((v) => !v)}
            style={{
              fontFamily: MONO, fontSize: 10.5, letterSpacing: ".12em",
              color: C.mono, background: "none", border: "none",
              cursor: "pointer", padding: 0,
            }}
          >
            {lang === "zh" ? (showSql ? "▾ " : "▸ ") : ""}
            {t(showSql ? "ask.hideQueries" : "ask.showQueries", { n: msg.queries.length })}
            {lang === "en" ? (showSql ? " ▾" : " ▸") : ""}
          </button>
          {showSql && (
            <pre
              style={{
                marginTop: 10, padding: "14px 16px", background: C.dark,
                color: "#C9CED6", borderRadius: 12, fontSize: 11.5,
                fontFamily: MONO, overflowX: "auto", whiteSpace: "pre-wrap", lineHeight: 1.5,
              }}
            >
              {msg.queries.join("\n\n")}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
