"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { ApiFailure, api, getToken, recentApiFailures } from "@/lib/api";
import { APP_VERSION } from "@/lib/version";

/**
 * The bug log.
 *
 * A report written in prose loses the two facts that decide how long a fault
 * takes to fix: which build it happened on, and what the server actually said.
 * "Creating users doesn't work" and "v1.3, POST /api/admin/users returned 503:
 * cannot hash passwords" are the same sentence to write and a day apart to act
 * on — so the form captures both rather than asking for them.
 */
type ApiErr = { at?: string | null; path?: string | null; status?: number | null; detail?: string | null };

type Bug = {
  id: number;
  created_at: string;
  reported_by_email: string | null;
  title: string;
  detail: string | null;
  page: string | null;
  severity: string;
  status: string;
  resolution: string | null;
  resolved_at: string | null;
  app_version: string | null;
  api_version: string | null;
  user_agent: string | null;
  api_errors: ApiErr[];
  /** "manual" = someone filed it. "server" / "browser" = it filed itself. */
  source: string;
  /** How many times this same fault has been seen. */
  occurrences: number;
  last_seen_at: string | null;
};

const SEVERITIES = ["blocker", "high", "normal", "low"];
const STATUSES = ["open", "fixed", "wontfix"];

export default function BugsPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [rows, setRows] = useState<Bug[]>([]);
  const [filter, setFilter] = useState<string>("open");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [severity, setSeverity] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [failures, setFailures] = useState<ApiFailure[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    const q = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
    setRows(await api<Bug[]>(`/api/admin/bugs${q}`));
  }, [filter]);

  useEffect(() => { load().catch(() => setRows([])); }, [load]);

  // Refreshed when the form opens rather than on a timer, so what you see
  // attached is what was failing at the moment you decided to report it.
  useEffect(() => { setFailures(recentApiFailures()); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setOk(null);
    try {
      await api("/api/bugs", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          detail: detail.trim() || null,
          page: typeof window !== "undefined" ? window.location.pathname : null,
          severity,
          app_version: APP_VERSION,
          api_errors: recentApiFailures().slice(0, 10),
        }),
      });
      setTitle(""); setDetail(""); setSeverity("normal");
      setOk("Logged, with the build numbers and recent errors attached.");
      await load();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not save the report");
    } finally { setBusy(false); }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setErr(null);
    try {
      await api(`/api/admin/bugs/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not update");
    }
  }

  async function remove(b: Bug) {
    if (!window.confirm(`Delete "${b.title}"?`)) return;
    try {
      await api(`/api/admin/bugs/${b.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not delete");
    }
  }

  // The export is an authenticated GET, so it cannot be a plain link — the
  // browser would send it without the token and get a 401 file.
  async function downloadCsv() {
    setErr(null);
    try {
      const res = await fetch("/api/admin/bugs/export.csv", {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "apex-bugs.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(`Could not download the CSV: ${e?.message ?? e}`);
    }
  }

  const openCount = rows.filter((r) => r.status === "open").length;

  return (
    <div className="px-7 py-6">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · BUGS</div>
          <h1 className="font-display text-2xl font-semibold mt-1.5">Bug log</h1>
          <p className="text-sm text-muted mt-1">
            {rows.length} shown{filter === "all" ? "" : ` · ${openCount} open`}. Build numbers and
            recent server errors are attached automatically. Rows marked
            <span className="text-[10px] font-bold" style={{ color: "#B54708" }}> AUTO </span>
            filed themselves — a server error or a crash in the page — with no
            one having to notice them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
          >
            <option value="open">Open</option>
            <option value="fixed">Fixed</option>
            <option value="wontfix">Won&rsquo;t fix</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={downloadCsv}
            className="px-3 py-2 text-sm border border-line rounded-lg hover:border-blue"
          >
            Download CSV
          </button>
        </div>
      </div>

      <form onSubmit={submit} className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
          <label className="block sm:col-span-4">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">What went wrong</span>
            <input
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Cannot create users from the admin panel"
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Severity</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            >
              {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy || title.trim().length < 3}
              className="w-full px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ background: "#0A8754" }}
            >
              {busy ? "Saving…" : "Log it"}
            </button>
          </div>
          <label className="block sm:col-span-6">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              What you did, and what you expected (optional)
            </span>
            <textarea
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </label>
        </div>

        {ok && <div className="text-sm mt-3" style={{ color: "#067647" }}>{ok}</div>}
        {err && <div className="text-sm text-danger mt-3">{err}</div>}

        <div className="text-[11px] text-faint mt-3">
          Attached automatically: app v{APP_VERSION}, the API&rsquo;s own version, this page, your
          browser, and the last {failures.length || 0} failed request{failures.length === 1 ? "" : "s"}
          {failures.length > 0 && (
            <> — most recently <code className="text-danger">{failures[0].status} {failures[0].path}</code></>
          )}
          . Request bodies are never captured, so nothing you typed into a form can end up here.
        </div>
      </form>

      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted">Nothing logged{filter === "all" ? "" : ` as ${filter}`}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
              <tr>
                <th className="text-left px-4 py-3">When</th>
                <th className="text-left px-4 py-3">Bug</th>
                <th className="text-left px-4 py-3">Seen</th>
                <th className="text-left px-4 py-3">Build</th>
                <th className="text-left px-4 py-3">Severity</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <BugRow
                  key={b.id}
                  b={b}
                  open={expanded === b.id}
                  onToggle={() => setExpanded(expanded === b.id ? null : b.id)}
                  onPatch={patch}
                  onDelete={remove}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BugRow({ b, open, onToggle, onPatch, onDelete }: {
  b: Bug; open: boolean; onToggle: () => void;
  onPatch: (id: number, body: Record<string, unknown>) => void;
  onDelete: (b: Bug) => void;
}) {
  const [res, setRes] = useState(b.resolution ?? "");
  // A build mismatch is worth calling out on its own: it means the two halves
  // were not the same code when this happened, which changes what the report
  // even means.
  const mismatch = b.app_version && b.api_version && b.app_version !== b.api_version;

  return (
    <>
      <tr className="border-t border-line2 align-top">
        <td className="px-4 py-3 text-muted whitespace-nowrap">
          {new Date(b.created_at).toLocaleString("en-NZ", { dateStyle: "short", timeStyle: "short" })}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {b.source !== "manual" && (
              <span
                className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                style={{ background: "#FEF0C7", color: "#B54708" }}
                title="Filed automatically — nobody had to notice or report this"
              >
                auto
              </span>
            )}
            <button onClick={onToggle} className="text-left font-medium hover:text-blue">
              {b.title}
            </button>
          </div>
          <div className="text-xs text-faint">
            {b.reported_by_email}{b.page ? ` · ${b.page}` : ""}
            {b.api_errors.length > 0 && ` · ${b.api_errors.length} error${b.api_errors.length === 1 ? "" : "s"}`}
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs tabular-nums font-semibold">{b.occurrences}×</span>
          {b.last_seen_at && (
            <div className="text-[10px] text-faint">
              last {new Date(b.last_seen_at).toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-xs whitespace-nowrap">
          <span className={mismatch ? "text-danger font-semibold" : "text-muted"}>
            app {b.app_version ?? "—"} / api {b.api_version ?? "—"}
          </span>
          {mismatch && <div className="text-[10px] text-danger">halves differed</div>}
        </td>
        <td className="px-4 py-3">
          <select
            value={b.severity}
            onChange={(e) => onPatch(b.id, { severity: e.target.value })}
            className="bg-white border border-line rounded-md px-2 py-1 text-xs"
          >
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
        <td className="px-4 py-3">
          <select
            value={b.status}
            onChange={(e) => onPatch(b.id, { status: e.target.value })}
            className="bg-white border border-line rounded-md px-2 py-1 text-xs"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <button onClick={onToggle} className="px-2.5 py-1.5 text-xs border border-line rounded-md hover:border-blue mr-1.5">
            {open ? "Hide" : "Details"}
          </button>
          <button onClick={() => onDelete(b)} className="px-2.5 py-1.5 text-xs border border-danger/40 text-danger rounded-md hover:border-danger">
            Delete
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-line2 bg-paper/60">
          <td colSpan={7} className="px-4 py-4">
            {b.detail && <p className="text-sm whitespace-pre-wrap mb-3">{b.detail}</p>}
            {b.api_errors.length > 0 && (
              <>
                <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">
                  What the server said
                </div>
                <pre className="text-[11px] bg-white border border-line rounded-lg p-3 overflow-x-auto mb-3">
                  {b.api_errors.map((e) => `${e.status ?? "?"}  ${e.path ?? "?"}\n     ${e.detail ?? ""}`).join("\n")}
                </pre>
              </>
            )}
            <div className="text-[11px] text-faint mb-3">{b.user_agent}</div>
            <div className="flex items-end gap-2">
              <label className="block flex-1">
                <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
                  What was found / done
                </span>
                <input
                  value={res}
                  onChange={(e) => setRes(e.target.value)}
                  className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
                />
              </label>
              <button
                onClick={() => onPatch(b.id, { resolution: res })}
                className="px-3 py-2 text-sm border border-line rounded-lg hover:border-blue"
              >
                Save note
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
