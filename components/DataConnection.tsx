"use client";

/**
 * The Apify connection, set here rather than only in Railway.
 *
 * The pulling-in-listings feature shipped needing an environment variable and a
 * redeploy before it would do anything, which is not a feature, it is homework.
 * The token goes in here, gets checked against Apify before it is stored, and
 * the sweeps run from it.
 *
 * Two things this panel is careful about:
 *
 *   It never shows the token back. Only the last four, which is enough to
 *   recognise which one is saved and no use to anyone who should not have it.
 *
 *   It says WHERE the token came from. An environment variable wins over one
 *   typed here — a value in Railway is what a deploy is reproducible from — so
 *   changing the wrong one and seeing nothing happen is a real afternoon, and
 *   the form locks itself when the environment holds it.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Status = {
  configured: boolean;
  source: "environment" | "panel" | null;
  last_four: string | null;
  ok: boolean | null;
  message: string | null;
  locked: boolean;
};

export default function DataConnection() {
  const [st, setSt] = useState<Status | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (test = false) => {
    const d = await api<Status>(
      `/api/admin/release/apify${test ? "?test=true" : ""}`).catch(() => null);
    if (d) setSt(d);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setBusy(true);
    try {
      const d = await api<Status>("/api/admin/release/apify",
        { method: "POST", body: JSON.stringify({ token }) });
      setSt(d);
      if (d.ok) setToken("");        // saved; nothing left to hold in a field
    } catch (e: any) {
      setSt((s) => ({ ...(s ?? { configured: false, source: null, last_four: null, locked: false }),
                      ok: false, message: e?.detail || e?.message || "Could not save" }));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try { await load(true); } finally { setBusy(false); }
  }

  const good = st?.ok === true;
  const bad = st?.ok === false;

  return (
    <section className="mt-8 border border-line rounded-xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-lg font-bold">Data connection</h2>
        <span className="text-xs text-muted">
          Needed to pull new listings and recent sales from the portals
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs font-semibold">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: good ? "#0A8754" : bad ? "#D4503E" : "#C3CAD5" }}
          />
          {st?.configured
            ? `Connected${st.last_four ? ` · ····${st.last_four}` : ""}`
            : "Not connected"}
        </span>
      </div>

      {st?.message && (
        <div className={`text-xs mt-2 ${bad ? "text-danger" : "text-muted"}`}>
          {st.message}
        </div>
      )}

      {st?.locked ? (
        <div className="text-xs text-muted mt-3">
          Set by the <b>APIFY_TOKEN</b> environment variable, which wins over
          anything entered here. Change it where it is deployed, or clear it
          there to manage the token from this page.
        </div>
      ) : (
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={st?.configured ? "Enter a new token to replace it" : "apify_api_…"}
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-[260px] text-sm border border-line rounded-lg px-3 py-2"
          />
          <button
            onClick={save}
            disabled={busy || !token.trim()}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-ink text-white disabled:opacity-50"
          >
            {busy ? "Checking…" : "Save and test"}
          </button>
          {st?.configured && (
            <button
              onClick={test}
              disabled={busy}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-line hover:border-blue disabled:opacity-50"
            >
              Test
            </button>
          )}
        </div>
      )}

      <div className="text-[11px] text-muted mt-3 leading-relaxed">
        Get a token at <b>apify.com → Settings → Integrations → Personal API
        token</b>. It is checked before it is saved, and stored encrypted — this
        page can never show it back to you, only the last four digits.
        {" "}Nothing runs on its own until <b>PORTALS_DAILY</b> is switched on;
        until then the sweeps only run when you press a button.
      </div>
    </section>
  );
}
