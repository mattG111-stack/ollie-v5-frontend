"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

/**
 * The account-wide key for Ask Ollie.
 *
 * The assistant used to require every person to go and obtain their own Claude
 * or OpenAI key before it would answer anything, which is a wall in front of the
 * feature for anyone who is not technical. One key, set here once, serves
 * everybody — with a daily cap per user so a single enthusiastic afternoon
 * cannot run up the bill.
 */
type KeyStatus = {
  configured: boolean;
  provider: string | null;
  key_last_four: string | null;
  updated_at: string | null;
  daily_limit: number;
  /** Which workspace an identity-linked key acts in. Not a secret — it names a
   *  workspace, it does not open one — so the server returns it and this page
   *  shows what is set rather than asking blind. */
  workspace_id: string | null;
  detail: string;
};

type UsageRow = { user_id: number | null; email: string | null; used_today: number; total: number };

interface QuestionRow {
  id: number;
  at: string;
  email: string | null;
  name: string | null;
  question: string;
  answer: string | null;
  ok: boolean;
  tools: string[];
}

interface FailureRow {
  id: number;
  at: string;
  email: string | null;
  question: string;
  error: string | null;
}

export default function AssistantAdminPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [s, setS] = useState<KeyStatus | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [provider, setProvider] = useState("anthropic");
  const [key, setKey] = useState("");
  const [limit, setLimit] = useState(20);
  const [workspace, setWorkspace] = useState("");
  const [fails, setFails] = useState<FailureRow[]>([]);
  const [asked, setAsked] = useState<QuestionRow[]>([]);
  const [qSearch, setQSearch] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<KeyStatus>("/api/admin/assistant/key");
    setS(r);
    setLimit(r.daily_limit);
    setWorkspace(r.workspace_id ?? "");
    if (r.provider) setProvider(r.provider);
    api<UsageRow[]>("/api/admin/assistant/usage").then(setUsage).catch(() => setUsage([]));
    // Why a question failed, in the words the server recorded. Without this the
    // only thing a report could carry was "HTTP 500".
    api<FailureRow[]>("/api/assistant/failures").then(setFails).catch(() => setFails([]));
    api<QuestionRow[]>("/api/assistant/questions?limit=200")
      .then(setAsked).catch(() => setAsked([]));
  }, []);

  useEffect(() => { load().catch(() => setS(null)); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setOk(null);
    try {
      // The server makes a live call before saving, so this can take a moment
      // and can come back with a real reason — a typo caught here is a typo
      // that never becomes "the assistant is broken for everyone".
      const r = await api<KeyStatus>("/api/admin/assistant/key", {
        method: "PUT",
        // The workspace travels WITH the key. A newer Anthropic key is tied to
        // an identity rather than standing alone, and the API refuses it —
        // "anthropic-workspace-id is required when authenticating with an
        // identity-linked API key". The server verifies the key with a live
        // call before storing it, so leaving this out of the request meant the
        // save failed on that check and the key could never be entered at all.
        body: JSON.stringify({
          provider,
          api_key: key.trim(),
          daily_limit: limit,
          workspace_id: workspace.trim() || null,
        }),
      });
      setS(r); setKey(""); setOk("Key saved and verified.");
      await load();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not save the key");
    } finally { setBusy(false); }
  }

  async function saveLimit() {
    setBusy(true); setErr(null); setOk(null);
    try {
      const r = await api<KeyStatus>("/api/admin/assistant/limit", {
        method: "PUT", body: JSON.stringify({ daily_limit: limit }),
      });
      setS(r); setOk(`Daily limit set to ${r.daily_limit} per user.`);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not save the limit");
    } finally { setBusy(false); }
  }

  async function clearKey() {
    if (!window.confirm("Remove the account key? Ask Ollie stops working for everyone who has not added their own key.")) return;
    setBusy(true); setErr(null); setOk(null);
    try {
      setS(await api<KeyStatus>("/api/admin/assistant/key", { method: "DELETE" }));
      setOk("Key removed.");
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not remove the key");
    } finally { setBusy(false); }
  }

  return (
    <div className="px-7 py-6 max-w-4xl">
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · ASSISTANT</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">Ask Ollie — API key</h1>
      <p className="text-sm text-muted mt-1 mb-5">
        One key for the whole account. Everyone who has not added their own key in
        Settings uses this one, capped per person per day so the bill stays
        predictable.
      </p>

      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: s?.configured ? "#0A8754" : "#C9CED6" }}
          />
          <span className="text-sm font-semibold">
            {s?.configured ? `Connected — ${s.provider}` : "Not connected"}
          </span>
          {s?.key_last_four && (
            <span className="text-xs text-faint font-mono">···{s.key_last_four}</span>
          )}
        </div>
        <div className="text-sm text-muted">{s?.detail ?? "Loading…"}</div>

        {ok && <div className="mt-3 text-sm" style={{ color: "#067647" }}>{ok}</div>}
        {err && <div className="mt-3 text-sm text-danger">{err}</div>}

        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            >
              <option value="anthropic">Claude (Anthropic)</option>
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              API key{s?.configured ? " (replace)" : ""}
            </span>
            <input
              type="password"
              required
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={provider === "anthropic" ? "sk-ant-…" : "sk-…"}
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              Workspace ID{s?.workspace_id ? "" : " (newer keys only)"}
            </span>
            <input
              type="text"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="wrkspc_…"
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue"
            />
            <span className="mt-1 block text-[11px] text-faint">
              Only needed if Anthropic refuses the key with
              “anthropic-workspace-id is required”. Find it in the Anthropic
              console URL when your workspace is open. Leave blank for an older key.
            </span>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Questions / user / day</span>
            <input
              type="number"
              min={0}
              max={1000}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </label>
          <div className="sm:col-span-4 flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || key.trim().length < 10}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ background: "#0A8754" }}
            >
              {busy ? "Checking the key…" : "Save key"}
            </button>
            <button
              type="button"
              onClick={saveLimit}
              disabled={busy}
              className="px-3 py-2 text-sm border border-line rounded-lg hover:border-blue disabled:opacity-50"
            >
              Save limit only
            </button>
            {s?.configured && (
              <button
                type="button"
                onClick={clearKey}
                disabled={busy}
                className="px-3 py-2 text-sm border border-danger/40 text-danger rounded-lg hover:border-danger disabled:opacity-50 ml-auto"
              >
                Remove key
              </button>
            )}
          </div>
        </form>

        <div className="text-xs text-faint mt-3 leading-relaxed">
          The key is verified with a live call before it is saved, and stored
          encrypted — it is never sent back to the browser, only its last four
          characters. Set the limit to 0 to switch the shared key off without
          deleting it. A user who adds their own key in Settings uses that
          instead and is not capped.
        </div>
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <div className="px-5 py-3 border-b border-line">
          <h2 className="font-display font-semibold text-sm">Who is asking</h2>
          <div className="text-xs text-muted">
            Answers given today against the daily allowance, and all time.
          </div>
        </div>
        {usage.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted">No questions asked yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
              <tr>
                <th className="text-left px-5 py-2.5">User</th>
                <th className="text-right px-5 py-2.5">Today</th>
                <th className="text-right px-5 py-2.5">All time</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.user_id ?? "anon"} className="border-t border-line2">
                  <td className="px-5 py-2.5">{u.email ?? "(deleted account)"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    <span className={s && u.used_today >= s.daily_limit ? "text-danger font-semibold" : ""}>
                      {u.used_today}
                    </span>
                    {s ? <span className="text-faint"> / {s.daily_limit}</span> : null}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted">{u.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── who is asking what ── */}
      <div className="bg-white border border-line rounded-card shadow-soft mt-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-end justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-semibold text-sm">Who is asking what</h2>
            <p className="text-xs text-muted mt-1">
              Every question put to Ollie, newest first. Admin only — what someone
              asks says what they are looking at, and that is theirs.
            </p>
          </div>
          <input
            value={qSearch}
            onChange={(e) => setQSearch(e.target.value)}
            placeholder="Search questions, answers or people…"
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm w-full sm:w-72 min-w-0 focus:outline-none focus:border-blue"
          />
        </div>
        {(() => {
          const needle = qSearch.trim().toLowerCase();
          const shown = needle
            ? asked.filter((r) =>
                `${r.question} ${r.answer ?? ""} ${r.email ?? ""} ${r.name ?? ""}`
                  .toLowerCase().includes(needle))
            : asked;
          if (!asked.length) {
            return <div className="px-5 py-4 text-sm text-muted">No questions asked yet.</div>;
          }
          if (!shown.length) {
            return <div className="px-5 py-4 text-sm text-muted">Nothing matches “{qSearch}”.</div>;
          }
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
                  <tr>
                    <th className="text-left px-5 py-2.5">When</th>
                    <th className="text-left px-5 py-2.5">Who</th>
                    <th className="text-left px-5 py-2.5">Question</th>
                    <th className="text-left px-5 py-2.5">Answered</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      className="border-t border-line2 align-top cursor-pointer hover:bg-paper"
                    >
                      <td className="px-5 py-2.5 whitespace-nowrap text-muted">
                        {r.at ? new Date(r.at).toLocaleString("en-NZ") : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-muted">
                        {r.name ?? r.email ?? "—"}
                        {r.name && r.email && (
                          <div className="text-[11px] text-faint">{r.email}</div>
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        {r.question}
                        {open === r.id && r.answer && (
                          <div className="mt-2 text-[12.5px] text-muted whitespace-pre-wrap border-l-2 border-line pl-3">
                            {r.answer}
                          </div>
                        )}
                        {open !== r.id && r.answer && (
                          <div className="text-[11px] text-faint mt-0.5">tap to read the answer</div>
                        )}
                      </td>
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        {r.ok
                          ? <span className="text-under font-semibold">yes</span>
                          : <span className="text-danger font-semibold">failed</span>}
                        {r.tools.length > 0 && (
                          <div className="text-[11px] text-faint">{r.tools.join(", ")}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      {/* ── what actually went wrong ── */}
      <div className="bg-white border border-line rounded-card shadow-soft mt-5 overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h2 className="font-display font-semibold text-sm">Questions that failed</h2>
          <p className="text-xs text-muted mt-1">
            The reason each one failed, as the server recorded it. A bug report can
            only ever say &ldquo;HTTP 500&rdquo;; this says which error, on which question.
          </p>
        </div>
        {fails.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted">
            Nothing has failed since this build went live.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
                <tr>
                  <th className="text-left px-5 py-2.5">When</th>
                  <th className="text-left px-5 py-2.5">Who</th>
                  <th className="text-left px-5 py-2.5">Question</th>
                  <th className="text-left px-5 py-2.5">What went wrong</th>
                </tr>
              </thead>
              <tbody>
                {fails.map((f) => (
                  <tr key={f.id} className="border-t border-line2 align-top">
                    <td className="px-5 py-2.5 whitespace-nowrap text-muted">
                      {f.at ? new Date(f.at).toLocaleString("en-NZ") : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-muted">{f.email ?? "—"}</td>
                    <td className="px-5 py-2.5">{f.question}</td>
                    <td className="px-5 py-2.5 font-mono text-[11.5px] text-danger break-words">
                      {f.error ?? "(nothing recorded)"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
