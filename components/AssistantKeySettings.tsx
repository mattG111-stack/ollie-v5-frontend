"use client";

import { useEffect, useState } from "react";
import { AssistantKeyStatus, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { C, Card, CardTitle, MONO, Note } from "./apex";
import { useT } from "@/lib/i18n";

/**
 * Bring-your-own-key panel for the Settings page.
 *
 * The key is validated with a live call before it is stored, so a typo fails
 * here rather than on the user's first question. It is never sent back to the
 * browser after saving — the server returns only the last four characters.
 */
export default function AssistantKeySettings() {
  const { t } = useT();
  const { me } = useAuth();
  const [status, setStatus] = useState<AssistantKeyStatus | null>(null);
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = () =>
    api<AssistantKeyStatus>("/api/assistant/settings")
      .then((s) => {
        setStatus(s);
        if (s.provider === "openai" || s.provider === "anthropic") setProvider(s.provider);
      })
      .catch(() => null);

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const s = await api<AssistantKeyStatus>("/api/assistant/settings", {
        method: "PUT",
        body: JSON.stringify({ provider, api_key: key.trim() }),
      });
      setStatus(s);
      setKey("");
      setSaved(s.detail);
    } catch (e: any) {
      setError(e?.detail || e?.message || "Could not save that key.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      setStatus(await api<AssistantKeyStatus>("/api/assistant/settings", { method: "DELETE" }));
    } catch (e: any) {
      setError(e?.detail || "Could not remove the key.");
    } finally {
      setBusy(false);
    }
  }

  // Admin-provisioned key: the tester gets a working assistant but never sees or
  // manages the key. Show a simple "enabled" note in place of the whole panel.
  if (me?.llm_key_managed) {
    return (
      <Card style={{ marginTop: 20 }}>
        <CardTitle sub={t("settings.assistantSub")}>{t("settings.assistant")}</CardTitle>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18, padding: "12px 16px", background: C.chipBg, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.good }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>{t("settings.assistantManaged")}</span>
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 20 }}>
      <CardTitle sub={t("settings.assistantSub")}>{t("settings.assistant")}</CardTitle>

      {status?.configured && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 18,
            padding: "12px 16px",
            background: C.chipBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.good }} />
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            {t("settings.connectedTo", { provider: status.provider === "openai" ? "OpenAI" : "Claude" })}
          </span>
          <span className="tnum" style={{ fontFamily: MONO, fontSize: 12, color: C.faint }}>
            {t("settings.keyEnding", { four: status.key_last_four ?? "" })}
          </span>
          <button
            onClick={remove}
            disabled={busy}
            style={{
              marginLeft: "auto",
              fontSize: 12.5,
              color: C.danger,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {t("settings.remove")}
          </button>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>
          {t("settings.providerLabel")}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {(["anthropic", "openai"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              style={{
                flex: "0 0 auto",
                padding: "10px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                background: provider === p ? C.accent : C.card,
                color: provider === p ? "#fff" : "#33455E",
                border: `1px solid ${provider === p ? C.accent : C.border}`,
              }}
            >
              {p === "anthropic" ? "Claude" : "OpenAI"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: ".14em", color: C.faint }}>
          {status?.configured ? t("settings.replaceKey") : t("settings.apiKey")}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: "1 1 320px",
              minWidth: 0,
              fontFamily: MONO,
              fontSize: 14,
              padding: "12px 15px",
              border: `1px solid ${C.border}`,
              borderRadius: 11,
              outline: "none",
              background: C.card,
            }}
          />
          <button
            onClick={save}
            disabled={busy || key.trim().length < 10}
            style={{
              padding: "12px 22px",
              borderRadius: 11,
              border: "none",
              fontWeight: 700,
              fontSize: 14,
              cursor: busy || key.trim().length < 10 ? "not-allowed" : "pointer",
              background: busy || key.trim().length < 10 ? C.border : C.accent,
              color: busy || key.trim().length < 10 ? C.faint : "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? t("settings.checking") : t("settings.saveKey")}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 14, fontSize: 13.5, color: C.danger, fontWeight: 600 }}>{error}</div>
      )}
      {saved && (
        <div style={{ marginTop: 14, fontSize: 13.5, color: C.good, fontWeight: 600 }}>{saved}</div>
      )}

      <Note>{t("settings.keyNote")}</Note>
    </Card>
  );
}
