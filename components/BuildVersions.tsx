"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { APP_VERSION, BUILT_AT } from "@/lib/version";

/**
 * Which build is actually running — this page's, and the API's.
 *
 * Both are shown because they deploy separately and drift. That drift has been
 * invisible and expensive: a fix can be written, tested and shipped while the
 * backend serving it is days old, and every symptom then reads as a new bug
 * rather than an old one that was fixed but never deployed. This panel makes the
 * question answerable in five seconds, from the screen, without taking anyone's
 * word for it.
 *
 * A mismatch is called out loudly rather than left for the reader to compare two
 * numbers and notice — that is exactly the comparison people skip.
 */
type ApiVersion = { version: string; built_at: string };

export default function BuildVersions() {
  const [api_, setApi] = useState<ApiVersion | null>(null);
  const [failed, setFailed] = useState(false);
  // The diagnostics payload, fetched on demand. Behind a button because it is
  // for when something is wrong, and inline because asking someone to visit a
  // raw API URL while they are already annoyed is a step that does not happen.
  const [diag, setDiag] = useState<string | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);

  async function runDiagnostics() {
    setDiagBusy(true);
    try {
      setDiag(JSON.stringify(await api<unknown>("/api/admin/diagnostics"), null, 2));
    } catch (e: any) {
      setDiag(`Diagnostics failed: ${e?.detail || e?.message || e}`);
    } finally {
      setDiagBusy(false);
    }
  }

  useEffect(() => {
    api<ApiVersion>("/api/version")
      .then(setApi)
      .catch(() => setFailed(true));
  }, []);

  const mismatch = api_ != null && api_.version !== APP_VERSION;

  return (
    <div
      className="bg-white border rounded-card shadow-soft px-5 py-4 mb-5"
      style={{ borderColor: mismatch ? "#F0B429" : undefined }}
    >
      <div className="flex items-center gap-6 flex-wrap">
        <Pill label="This app" value={`v${APP_VERSION}`} sub={BUILT_AT} />
        <Pill
          label="API"
          value={failed ? "unreachable" : api_ ? `v${api_.version}` : "…"}
          sub={failed ? "no answer from /api/version" : api_?.built_at ?? ""}
          bad={failed || mismatch}
        />
        {mismatch && (
          <div className="text-sm" style={{ color: "#B54708" }}>
            <strong>These do not match.</strong> The API is running a different
            build from this page — deploy the other half before treating anything
            here as a new bug.
          </div>
        )}
        {failed && (
          <div className="text-sm text-danger">
            The API did not answer. Either it is down, or it is running a build
            from before /api/version existed — which is itself the answer.
          </div>
        )}
        {!mismatch && !failed && api_ && (
          <div className="text-sm text-muted">
            Both halves are on the same build.
          </div>
        )}
        <button
          onClick={runDiagnostics}
          disabled={diagBusy}
          className="ml-auto text-xs px-2.5 py-1.5 border border-line rounded-md hover:border-blue disabled:opacity-50"
        >
          {diagBusy ? "Checking…" : diag ? "Re-check" : "Diagnostics"}
        </button>
      </div>

      {diag && (
        <>
          <pre className="mt-3 text-[11px] leading-relaxed bg-paper border border-line rounded-lg p-3 overflow-x-auto whitespace-pre">
            {diag}
          </pre>
          <div className="text-[11px] text-faint mt-2">
            Which tables the models expect that the database lacks, whether this
            server can hash a password, and the real error behind each admin
            feature. Table names and row counts only — no row contents, no
            credentials, never the database URL. Safe to screenshot.
          </div>
        </>
      )}
    </div>
  );
}

function Pill({ label, value, sub, bad }: {
  label: string; value: string; sub?: string; bad?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div
        className="font-display text-xl font-bold tabular-nums"
        style={bad ? { color: "#B54708" } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}
