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
      </div>
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
