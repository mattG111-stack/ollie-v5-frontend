"use client";

/**
 * Staged ingest — load / enrich / price / publish.
 *
 * Every number on this page comes from the backend on each poll. Nothing about a
 * stage's progress is held in component state, so a refresh, a closed tab, or a
 * dropped network changes nothing about what you see when you come back.
 *
 * The "last seen" figure is computed against `server_time` from the same
 * response rather than the browser clock, so a machine with a skewed clock
 * doesn't report a healthy job as dead.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { api, ApiError } from "@/lib/api";
import { fmtMoney, fmtNumber } from "@/lib/format";

type StageName = "load" | "enrich" | "price" | "publish";

interface StageState {
  stage: StageName;
  status: "not_started" | "pending" | "running" | "completed" | "failed" | "cancelled";
  job_id: number | null;
  progress_pct: number;
  rows_processed: number;
  rows_total: number | null;
  rows_filled: number;
  rows_missed: number;
  rows_skipped: number;
  detail: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  heartbeat_at: string | null;
  can_run: boolean;
  blocked_reason: string | null;
}

interface EnrichCoverage {
  total: number;
  pending: number;
  filled: number;
  missed: number;
  skipped: number;
  complete: boolean;
  pct_done: number;
}

interface BatchStages {
  batch_id: number;
  filename: string;
  batch_type: string;
  region: string;
  batch_status: string;
  is_active: boolean;
  rows_total: number;
  rows_inserted: number;
  rows_rejected: number;
  created_at: string;
  note: string | null;
  stages: StageState[];
  enrich_coverage: EnrichCoverage;
  unpriced_rows: number;
  held_rows: number;
  server_time: string;
}

interface BatchSummary {
  id: number;
  batch_type: string;
  filename: string;
  region: string;
  status: string;
  is_active: boolean;
  rows_total: number;
  rows_inserted: number;
  rows_rejected: number;
  created_at: string;
}

interface Row {
  id: number;
  address: string | null;
  suburb: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  floor_area_m2: number | null;
  land_area_m2: number | null;
  cv_numeric: number | null;
  asking_price: number | null;
  fair_value: number | null;
  market_value: number | null;
  margin: number | null;
  confidence: string | null;
  enrich_status: "pending" | "filled" | "missed" | "skipped";
  enrich_cells_filled: number;
  priced_at: string | null;
  is_held: boolean;
  hold_reason: string | null;
}

const STAGE_LABEL: Record<StageName, string> = {
  load: "Load",
  enrich: "Enrich",
  price: "Price",
  publish: "Publish",
};

const STAGE_BLURB: Record<StageName, string> = {
  load: "Read the CSV into staged rows. No lookups, no valuations.",
  enrich: "Fill blank floor, land and CV from CoreLogic. Resumable.",
  price: "Run the valuation pipeline over the staged rows.",
  publish: "Push this batch live.",
};

function secondsSince(then: string | null, now: string): number | null {
  if (!then) return null;
  const d = (new Date(now).getTime() - new Date(then).getTime()) / 1000;
  return Number.isFinite(d) ? Math.max(0, Math.round(d)) : null;
}

function ago(secs: number | null): string {
  if (secs === null) return "—";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m ago`;
}

function duration(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  const s = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function StagesPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [batchId, setBatchId] = useState<number | null>(null);
  const [data, setData] = useState<BatchStages | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "held" | "unpriced" | "pending" | "missed">("all");
  const [busy, setBusy] = useState<StageName | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBatches = useCallback(async () => {
    const b = await api<BatchSummary[]>("/api/admin/stages/batches?batch_type=for_sale&limit=25");
    setBatches(b);
    setBatchId((cur) => cur ?? (b.length ? b[0].id : null));
  }, []);

  const poll = useCallback(async (id: number) => {
    try {
      setData(await api<BatchStages>(`/api/admin/stages/${id}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
    }
  }, []);

  const loadRows = useCallback(async (id: number, f: typeof filter) => {
    const qs =
      f === "held" ? "?held_only=true"
      : f === "unpriced" ? "?unpriced_only=true"
      : f === "pending" ? "?enrich_status=pending"
      : f === "missed" ? "?enrich_status=missed"
      : "";
    setRows(await api<Row[]>(`/api/admin/stages/${id}/rows${qs}${qs ? "&" : "?"}limit=200`));
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  useEffect(() => {
    if (batchId === null) return;
    poll(batchId);
    loadRows(batchId, filter);
  }, [batchId, filter, poll, loadRows]);

  // Poll fast while something is running, slowly otherwise. The interval is the
  // only thing that changes — the data itself is authoritative either way.
  const running = data?.stages.some((s) => s.status === "running" || s.status === "pending") ?? false;
  useEffect(() => {
    if (batchId === null) return;
    const ms = running ? 2000 : 10000;
    const t = setInterval(() => {
      poll(batchId);
      if (!running) loadRows(batchId, filter);
    }, ms);
    return () => clearInterval(t);
  }, [batchId, running, filter, poll, loadRows]);

  // When a run finishes, refresh the grid so the new columns appear.
  const prevRunning = useRef(running);
  useEffect(() => {
    if (prevRunning.current && !running && batchId !== null) {
      loadRows(batchId, filter);
      loadBatches();
    }
    prevRunning.current = running;
  }, [running, batchId, filter, loadRows, loadBatches]);

  async function runStage(stage: StageName) {
    if (batchId === null) return;
    setBusy(stage);
    setError(null);
    try {
      await api(`/api/admin/stages/${batchId}/${stage}`, { method: "POST" });
      await poll(batchId);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(jobId: number) {
    setBusy("cancel");
    try {
      await api(`/api/admin/stages/jobs/${jobId}/cancel`, { method: "POST" });
      if (batchId !== null) await poll(batchId);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteBatch(id: number) {
    const b = batches.find((x) => x.id === id);
    if (!confirm(
      `Delete batch #${id} (${b?.filename ?? ""})?\n\n` +
      `This removes the batch, its ${b?.rows_inserted.toLocaleString() ?? ""} listings ` +
      `and its job history. It cannot be undone.`
    )) return;
    setError(null);
    try {
      await api(`/api/admin/stages/${id}`, { method: "DELETE" });
      setBatchId(null);
      setData(null);
      setRows([]);
      await loadBatches();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
    }
  }

  async function clearOrphanedJobs() {
    if (!confirm("Remove failed and cancelled jobs that never produced a batch?")) return;
    setError(null);
    try {
      await api("/api/admin/stages/jobs/orphaned", { method: "DELETE" });
      await loadBatches();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("for_sale", file);
      await api("/api/admin/stages/load", { method: "POST", body: fd });
      // Load is fast, but the batch row only exists once the worker commits.
      setTimeout(async () => { await loadBatches(); setUploading(false); }, 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : String(e));
      setUploading(false);
    }
  }

  const byStage = (n: StageName) => data?.stages.find((s) => s.stage === n);

  return (
    <div className="px-7 py-6">
      <div className="flex items-end justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold">Staged ingest</h1>
          <p className="text-sm text-muted">
            Run each stage on its own. Check the numbers before you publish.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-sm px-3 py-2 rounded border border-line bg-white hover:border-blue disabled:opacity-50"
          >
            {uploading ? "Loading…" : "Load a for-sale CSV"}
          </button>
          <select
            value={batchId ?? ""}
            onChange={(e) => setBatchId(Number(e.target.value))}
            className="text-sm px-3 py-2 rounded border border-line bg-white"
          >
            {batches.length === 0 && <option value="">No batches yet</option>}
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.id} · {b.filename} · {fmtNumber(b.rows_inserted)} rows{b.is_active ? " · live" : ""}
              </option>
            ))}
          </select>
          {batchId !== null && data && !data.is_active && (
            <button
              onClick={() => deleteBatch(batchId)}
              title="Delete this batch, its listings and its job history"
              className="text-sm px-3 py-2 rounded border border-danger/40 text-danger bg-white hover:bg-danger/5"
            >
              Delete batch
            </button>
          )}
          <button
            onClick={clearOrphanedJobs}
            title="Remove failed and cancelled jobs that never produced a batch"
            className="text-sm px-3 py-2 rounded border border-line bg-white text-muted hover:border-blue"
          >
            Clear old jobs
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm rounded border border-danger/40 bg-danger/5 text-danger px-4 py-3">
          {error}
        </div>
      )}

      {batches.length === 0 && !uploading && (
        <div className="bg-white border border-line rounded-card shadow-soft px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold mb-1">Load a file to start</p>
          <p className="text-sm text-muted">
            Loading only reads the CSV into rows. Nothing goes live and no lookups run,
            so you can see what arrived before spending an hour on CoreLogic.
          </p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-5">
            {(["load", "enrich", "price", "publish"] as StageName[]).map((name) => (
              <StageCard
                key={name}
                name={name}
                state={byStage(name)}
                serverTime={data.server_time}
                busy={busy === name}
                onRun={() => runStage(name)}
                onCancel={cancel}
              />
            ))}
          </div>

          <div className="bg-white border border-line rounded-card shadow-soft px-5 py-4 mb-5">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <Stat label="Rows in batch" value={fmtNumber(data.enrich_coverage.total)} />
              <Stat label="Rejected at load" value={fmtNumber(data.rows_rejected)} />
              <Stat
                label="CoreLogic"
                value={
                  data.enrich_coverage.complete
                    ? `complete · ${fmtNumber(data.enrich_coverage.filled)} filled, ${fmtNumber(data.enrich_coverage.missed)} missed`
                    : `${data.enrich_coverage.pct_done}% done · ${fmtNumber(data.enrich_coverage.pending)} left`
                }
                tone={data.enrich_coverage.complete ? "good" : "warn"}
              />
              <Stat
                label="Unpriced"
                value={fmtNumber(data.unpriced_rows)}
                tone={data.unpriced_rows > 0 ? "warn" : "good"}
              />
              <Stat
                label="Held for review"
                value={fmtNumber(data.held_rows)}
                tone={data.held_rows > 0 ? "warn" : "good"}
              />
            </div>
            {data.note && <p className="text-xs text-faint mt-3">{data.note}</p>}
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {([
              ["all", "All rows"],
              ["held", `Held (${data.held_rows})`],
              ["unpriced", `Unpriced (${data.unpriced_rows})`],
              ["pending", `Not enriched (${data.enrich_coverage.pending})`],
              ["missed", `CoreLogic missed (${data.enrich_coverage.missed})`],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`text-xs px-3 py-1.5 rounded-full border ${
                  filter === k ? "border-blue text-blue bg-blue/5" : "border-line text-muted bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <RowGrid rows={rows} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={tone === "warn" ? "text-sub font-semibold" : tone === "good" ? "text-under font-semibold" : "font-semibold"}>
        {value}
      </div>
    </div>
  );
}

function StageCard({
  name, state, serverTime, busy, onRun, onCancel,
}: {
  name: StageName;
  state: StageState | undefined;
  serverTime: string;
  busy: boolean;
  onRun: () => void;
  onCancel: (jobId: number) => void;
}) {
  const s = state;
  const status = s?.status ?? "not_started";
  const isRunning = status === "running" || status === "pending";
  const heartbeat = secondsSince(s?.heartbeat_at ?? null, serverTime);
  // The backend reaps at 10 minutes; warn a little before it does.
  const stale = isRunning && heartbeat !== null && heartbeat > 120;

  const tone =
    status === "completed" ? "border-under/40 bg-under/5"
    : status === "failed" ? "border-danger/40 bg-danger/5"
    : status === "cancelled" ? "border-line bg-paper"
    : isRunning ? "border-blue/40 bg-blue/5"
    : "border-line bg-white";

  return (
    <div className={`border rounded-card px-4 py-3 flex flex-col ${tone}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-display font-semibold">{STAGE_LABEL[name]}</span>
        <span className="text-[10.5px] uppercase tracking-wider text-faint font-semibold">
          {status === "not_started" ? "not run" : status}
        </span>
      </div>

      <p className="text-xs text-muted mb-3 min-h-[32px]">{STAGE_BLURB[name]}</p>

      {isRunning && (
        <>
          <div className="h-1.5 bg-line2 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-blue transition-all" style={{ width: `${s?.progress_pct ?? 0}%` }} />
          </div>
          <div className="text-xs text-text mb-1">
            {fmtNumber(s?.rows_processed ?? 0)} / {fmtNumber(s?.rows_total ?? 0)}
          </div>
          {name === "enrich" && (
            <div className="text-xs text-muted mb-1">
              {fmtNumber(s?.rows_filled ?? 0)} filled · {fmtNumber(s?.rows_missed ?? 0)} missed ·{" "}
              {fmtNumber(s?.rows_skipped ?? 0)} needed nothing
            </div>
          )}
          <div className={`text-xs mb-2 ${stale ? "text-danger font-semibold" : "text-faint"}`}>
            {stale ? "no update for " : "last update "}{ago(heartbeat)}
            {stale && " — this may have stopped"}
          </div>
        </>
      )}

      {!isRunning && s?.detail && status !== "not_started" && (
        <p className="text-xs text-muted mb-2">{s.detail}</p>
      )}

      {!isRunning && s?.started_at && s?.completed_at && (
        <p className="text-xs text-faint mb-2">
          Took {duration(s.started_at, s.completed_at)} · finished{" "}
          {ago(secondsSince(s.completed_at, serverTime))}
        </p>
      )}

      {status === "failed" && s?.error && (
        <details className="text-xs text-danger mb-2">
          <summary className="cursor-pointer">What went wrong</summary>
          <pre className="whitespace-pre-wrap mt-1 text-[11px] leading-snug">{s.error.slice(0, 600)}</pre>
        </details>
      )}

      <div className="mt-auto flex gap-2">
        <button
          onClick={onRun}
          disabled={!s?.can_run || busy || isRunning}
          title={s?.blocked_reason ?? ""}
          className="flex-1 text-sm px-3 py-2 rounded border border-line bg-white hover:border-blue disabled:opacity-40 disabled:hover:border-line"
        >
          {busy ? "Starting…" : status === "completed" ? `Run ${STAGE_LABEL[name].toLowerCase()} again` : `Run ${STAGE_LABEL[name].toLowerCase()}`}
        </button>
        {isRunning && s?.job_id && (
          <button
            onClick={() => onCancel(s.job_id!)}
            className="text-sm px-3 py-2 rounded border border-danger/40 text-danger bg-white"
          >
            Cancel
          </button>
        )}
      </div>

      {!s?.can_run && s?.blocked_reason && !isRunning && (
        <p className="text-xs text-faint mt-2">{s.blocked_reason}</p>
      )}
    </div>
  );
}

function RowGrid({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-line rounded-card shadow-soft px-6 py-12 text-center text-sm text-muted">
        Nothing matches this filter.
      </div>
    );
  }
  return (
    <div className="bg-white border border-line rounded-card shadow-soft overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
          <tr>
            <th className="text-left px-4 py-3">Address</th>
            <th className="text-left px-4 py-3">Suburb</th>
            <th className="text-right px-4 py-3">Floor</th>
            <th className="text-right px-4 py-3">Land</th>
            <th className="text-right px-4 py-3">CV</th>
            <th className="text-right px-4 py-3">Asking</th>
            <th className="text-right px-4 py-3">Fair value</th>
            <th className="text-right px-4 py-3">Margin</th>
            <th className="text-left px-4 py-3">CoreLogic</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-t border-line2 ${r.is_held ? "bg-danger/5" : ""}`}>
              <td className="px-4 py-2.5">
                {r.address ?? "—"}
                {r.is_held && r.hold_reason && (
                  <span className="block text-xs text-danger">{r.hold_reason}</span>
                )}
              </td>
              <td className="px-4 py-2.5 text-muted">{r.suburb ?? "—"}</td>
              <td className="px-4 py-2.5 text-right">{r.floor_area_m2 ? `${Math.round(r.floor_area_m2)}m²` : <Empty />}</td>
              <td className="px-4 py-2.5 text-right">{r.land_area_m2 ? `${Math.round(r.land_area_m2)}m²` : <Empty />}</td>
              <td className="px-4 py-2.5 text-right">{r.cv_numeric ? fmtMoney(r.cv_numeric) : <Empty />}</td>
              <td className="px-4 py-2.5 text-right">{r.asking_price ? fmtMoney(r.asking_price) : <Empty />}</td>
              <td className="px-4 py-2.5 text-right">
                {r.priced_at ? (r.fair_value ? fmtMoney(r.fair_value) : "—") : <NotRun />}
              </td>
              <td className={`px-4 py-2.5 text-right ${r.margin && r.margin > 0.5 ? "text-danger font-semibold" : r.margin && r.margin > 0 ? "text-under" : ""}`}>
                {r.priced_at ? (r.margin !== null ? `${(r.margin * 100).toFixed(0)}%` : "—") : <NotRun />}
              </td>
              <td className="px-4 py-2.5">
                <EnrichBadge status={r.enrich_status} cells={r.enrich_cells_filled} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A blank source field — the scrape didn't carry one. */
function Empty() {
  return <span className="text-faint">—</span>;
}

/** Distinct from Empty: the stage that fills this hasn't run yet. Showing these
 *  the same way would make an un-run pipeline look like missing data. */
function NotRun() {
  return <span className="text-faint italic text-xs">not priced</span>;
}

function EnrichBadge({ status, cells }: { status: Row["enrich_status"]; cells: number }) {
  const map = {
    pending: ["text-faint bg-paper", "pending"],
    filled: ["text-under bg-under/10", `filled ${cells}`],
    missed: ["text-muted bg-line2", "no match"],
    skipped: ["text-faint bg-paper", "not needed"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{label}</span>;
}
