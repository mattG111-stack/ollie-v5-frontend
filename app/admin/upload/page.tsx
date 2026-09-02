"use client";

import DataConnection from "@/components/DataConnection";
import NewListings from "@/components/NewListings";
import TrainedValuation from "@/components/TrainedValuation";
import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { ImportBatch, IngestJob, api, apiRaw } from "@/lib/api";
import { useT } from "@/lib/i18n";
import TradeMeFill from "@/components/TradeMeFill";

export default function UploadPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { t } = useT();
  const [fsFile, setFsFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ total: number; loaded: number } | null>(null);
  const [soldFile, setSoldFile] = useState<File | null>(null);
  const [rentFile, setRentFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeJobs, setActiveJobs] = useState<IngestJob[]>([]);
  const [history, setHistory] = useState<ImportBatch[]>([]);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const data = await api<ImportBatch[]>("/api/admin/upload/history");
    setHistory(data);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* Delete one load's data, leaving every other load alone.
   *
   * Confirmed in words rather than with a bare "are you sure", because the two
   * cases are genuinely different and only one of them is reversible by
   * re-uploading: deleting an ARCHIVED load takes nothing off the site;
   * deleting the LIVE one puts the previous week back and every price on the
   * site changes with it. */
  async function deleteBatch(b: ImportBatch) {
    const rows = (b.rows_inserted ?? 0).toLocaleString();
    const warning = b.is_active
      ? `"${b.filename}" is the LIVE load.\n\nDeleting it removes ${rows} rows and puts the previous load back. Every price on the site changes.\n\nDelete it?`
      : `Delete "${b.filename}" and its ${rows} rows?\n\nThis load is not live, so nothing on the site changes.`;
    if (!window.confirm(warning)) return;

    setDeleting(b.id);
    setDeleteMsg(null);
    try {
      const r = await api<{ message: string }>(
        `/api/admin/upload/history/${b.id}`, { method: "DELETE" });
      setDeleteMsg(r.message);
      await loadHistory();
    } catch (e: any) {
      setDeleteMsg(e?.detail || e?.message || "Could not delete that load");
    } finally {
      setDeleting(null);
    }
  }

  // Poll active jobs every 2s until all are completed or failed.
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const pending = activeJobs.some((j) => j.status === "pending" || j.status === "running");
    if (!pending) {
      loadHistory();
      return;
    }
    const t = setTimeout(async () => {
      const refreshed: IngestJob[] = await Promise.all(
        activeJobs.map((j) => api<IngestJob>(`/api/admin/jobs/${j.id}`).catch(() => j)),
      );
      setActiveJobs(refreshed);
    }, 2000);
    return () => clearTimeout(t);
  }, [activeJobs, loadHistory]);

  async function submit() {
    if (!fsFile && !soldFile && !rentFile) return;
    setBusy(true);
    setErr(null);
    setActiveJobs([]);
    const form = new FormData();
    if (fsFile) form.append("for_sale", fsFile);
    if (soldFile) form.append("sold", soldFile);
    if (rentFile) form.append("rent", rentFile);
    try {
      const jobs = await api<IngestJob[]>("/api/admin/upload", { method: "POST", body: form });
      setActiveJobs(jobs);
      setFsFile(null);
      setSoldFile(null);
      setRentFile(null);
    } catch (e: any) {
      setErr(e?.detail || e?.message || t("adm.uploadFailed"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * What this file WOULD do, before it does it.
   *
   * A load has been a one-way door: the file goes in, a count comes out, and
   * the rejected rows are gone — not stored, not listed, not recoverable. So
   * "why isn't 36 Lloyd Ave in the system" had no answer, and "10,608 rows not
   * in this region" on a file named auckland_v2.csv was a fact nobody could act
   * on.
   *
   * This runs the same rules and downloads one line per row of the original
   * saying what would happen to it and why. Nothing is written anywhere.
   */
  async function preflight() {
    if (!fsFile) return;
    setChecking(true);
    setErr(null);
    setCheck(null);
    try {
      const form = new FormData();
      form.append("for_sale", fsFile);
      const res = await apiRaw("/api/admin/upload/preflight", { method: "POST", body: form });
      const total = Number(res.headers.get("X-Preflight-Total") || 0);
      const loaded = Number(res.headers.get("X-Preflight-Loaded") || 0);
      setCheck({ total, loaded });

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "preflight.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not check that file");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="px-7 py-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">{t("adm.uploadTitle")}</h1>
        <p className="text-sm text-muted max-w-2xl mt-1">
          {t("adm.uploadSub")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <Drop label={t("adm.forSale")} hint={t("adm.forSaleHint")} color="#2E353D" file={fsFile} onPick={setFsFile} t={t} />
        <Drop label={t("adm.sold")} hint={t("adm.soldHint")} color="#0A8754" file={soldFile} onPick={setSoldFile} t={t} />
        <Drop label={t("adm.rent")} hint={t("adm.rentHint")} color="#0E8C8C" file={rentFile} onPick={setRentFile} t={t} />
      </div>

      {err && (
        <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg px-4 py-3 mb-4">
          {err}
        </div>
      )}

      <div className="flex justify-end items-center gap-3 mb-8">
        {/* Reads out what the download says, so the answer is on the screen and
            not only in a file somebody has to open. */}
        {check && (
          <span className="text-xs text-muted mr-auto tnum">
            {check.loaded.toLocaleString()} of {check.total.toLocaleString()} rows would load
            {check.total > check.loaded && (
              <> · <span style={{ color: "#D4503E" }}>
                {(check.total - check.loaded).toLocaleString()} would be rejected
              </span> — the reason for each one is in the file</>
            )}
          </span>
        )}
        <button
          onClick={preflight}
          disabled={!fsFile || checking || busy}
          className="px-5 py-2.5 rounded-lg font-semibold border border-line
                     hover:bg-[#F7F5F2] disabled:opacity-40 disabled:cursor-not-allowed"
          title="Runs the same rules the load runs and downloads the verdict for every row. Writes nothing."
        >
          {checking ? "Checking…" : "Check this file first"}
        </button>
        <button
          onClick={submit}
          disabled={(!fsFile && !soldFile && !rentFile) || busy}
          className="bg-blue text-white hover:bg-blue-dark disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-lg font-semibold"
        >
          {busy ? t("adm.uploading") : t("adm.importToDb")}
        </button>
      </div>

      {activeJobs.length > 0 && (
        <div className="mb-8">
          <h2 className="font-display font-semibold text-sm mb-3">{t("adm.activeJobs")}</h2>
          <div className="grid gap-3">
            {activeJobs.map((j) => (
              <JobCard key={j.id} job={j} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* The connection comes before the thing that needs it: with no token
          the panel below can only say "nothing waiting", which reads as "no new
          listings" rather than "not switched on yet". */}
      <DataConnection />

      {/* What the portals found since yesterday. Above the weekly Trade Me
          fill and the import history because it is the only thing on this page
          that goes stale — a listing nobody has looked at is a deal nobody
          saw. */}
      <NewListings />

      {/* The model itself. Below the data panels because it is fitted FROM
          them — a retrain is only worth pressing once this week's sales are
          in — and because unlike them it changes nothing until switched on. */}
      <TrainedValuation />

      <TradeMeFill />

      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-display font-semibold text-sm">{t("adm.importHistory")}</h2>
        <span className="text-xs text-muted">{t("adm.activeBatchNote")}</span>
      </div>
      {deleteMsg && (
        <div className="text-xs text-muted mb-2">{deleteMsg}</div>
      )}
      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
            <tr>
              <th className="text-left px-4 py-3">{t("adm.batch")}</th>
              <th className="text-left px-4 py-3">{t("adm.type")}</th>
              <th className="text-left px-4 py-3">{t("adm.filename")}</th>
              <th className="text-right px-4 py-3">{t("adm.rows")}</th>
              <th className="text-left px-4 py-3">{t("adm.uploaded")}</th>
              <th className="text-left px-4 py-3">{t("adm.status")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {history.map((b) => (
              <tr key={b.id} className="border-t border-line2">
                <td className="px-4 py-3 text-muted">#{b.id}</td>
                <td className="px-4 py-3">{b.batch_type}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {b.filename}
                  {/* WHY rows were rejected, not just how many. The ingest has
                      always counted this — nine named reasons — and wrote it
                      into a column nothing displayed, so "11,773 rejected"
                      gave no way to tell a feed full of apartments from a feed
                      with no council valuations from a broken column mapping.
                      Every one of those needs a different response and they
                      looked identical. */}
                  {b.note && (
                    <div className="font-sans text-[11px] text-muted mt-1 leading-relaxed max-w-xl">
                      {b.note.replace(/^ · /, "")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{(b.rows_inserted ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-muted">{new Date(b.created_at).toLocaleString("en-NZ")}</td>
                <td className="px-4 py-3">
                  {b.is_active ? (
                    <span className="text-under text-xs font-semibold">● {t("adm.active")}</span>
                  ) : (
                    <span className="text-faint text-xs">{t("adm.archived")}</span>
                  )}
                </td>
                {/* Deleting ONE load. The only tool before this was a script
                    that wipes every for-sale batch, so undoing a five-second
                    mistake meant an hour of reloading. Confirmed in words
                    rather than with a bare "are you sure", because the two
                    cases are genuinely different: an archived load takes
                    nothing off the site, the live one takes the site down to
                    the previous week. */}
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deleteBatch(b)}
                    disabled={deleting === b.id}
                    className="text-[11px] font-semibold text-faint hover:text-danger disabled:opacity-40"
                    title={b.is_active
                      ? "This load is live — deleting it puts the previous one back"
                      : "Delete this load's data"}
                  >
                    {deleting === b.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionRatesPanel t={t} />
    </div>
  );
}

type SectionRatesData = { default: number | null; count?: number; suburbs: { suburb: string; rate: number }[]; note?: string };

function SectionRatesPanel({ t }: { t: (k: string, v?: Record<string, string | number>) => string }) {
  const [data, setData] = useState<SectionRatesData | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<SectionRatesData>("/api/admin/section-rates").then(setData).catch(() => {});
  }, []);
  if (!data) return null;
  return (
    <div className="mt-6">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="font-display font-semibold text-sm">{t("adm.sectionRatesTitle")}</h2>
        <span className="text-xs text-muted">
          {t("adm.sectionRatesUsed", { rate: data.default ? `$${(data.default ?? 0).toLocaleString()}/m²` : "—" })}
          {data.count ? t("adm.sectionRatesSuburbs", { n: data.count }) : ""}
        </span>
      </div>
      <div className="bg-white border border-line rounded-card shadow-soft p-4">
        <p className="text-xs text-muted mb-3">
          {t("adm.sectionRatesNote")}
        </p>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-blue font-semibold hover:underline">
          {open ? t("adm.hideRates", { n: data.suburbs.length }) : t("adm.showRates", { n: data.suburbs.length })}
        </button>
        {open && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 max-h-[420px] overflow-y-auto">
            {data.suburbs.map((s) => (
              <div key={s.suburb} className="flex justify-between text-xs border-b border-line2 py-1">
                <span className="text-text">{s.suburb}</span>
                <span className="tabular-nums font-semibold">${(s.rate ?? 0).toLocaleString()}/m²</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job, t }: { job: IngestJob; t: (k: string, v?: Record<string, string | number>) => string }) {
  const statusColor =
    job.status === "completed"
      ? "#0A8754"
      : job.status === "failed"
      ? "#D4503E"
      : "#2E353D";

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold capitalize">{job.batch_type.replace("_", " ")}</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
              style={{ color: statusColor, background: `${statusColor}15` }}
            >
              {job.status}
            </span>
          </div>
          <div className="text-xs text-muted mt-0.5 font-mono">
            {job.filename} · {(job.file_size_bytes / 1024 / 1024).toFixed(1)} MB
          </div>
        </div>
        <div className="text-xs text-muted">{t("adm.jobId", { id: job.id })}</div>
      </div>

      {job.status !== "failed" && (
        <div className="mb-2">
          <div className="flex justify-between text-xs text-muted mb-1">
            <span>{job.stage || t("adm.queued")}</span>
            <span>{job.progress_pct}%</span>
          </div>
          <div className="h-2 bg-paper rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${job.progress_pct}%`, background: statusColor }}
            />
          </div>
        </div>
      )}

      {job.status === "completed" && (
        <div className="text-xs text-under mt-2">
          ✓ {t("adm.rowsInserted", { n: job.rows_inserted?.toLocaleString() ?? 0 })}
          {job.rows_rejected ? t("adm.rejectedN", { n: job.rows_rejected }) : ""}
          {job.batch_id ? t("adm.batchN", { id: job.batch_id }) : ""}
        </div>
      )}

      {job.status === "completed" && job.audit_warnings && (
        <AuditWarnings raw={job.audit_warnings} t={t} />
      )}

      {job.status === "failed" && (
        <div className="mt-2">
          <div className="text-xs text-danger font-semibold mb-1">{t("adm.failed")}</div>
          <pre className="text-[11px] text-danger bg-danger/5 border border-danger/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {job.error_message}
          </pre>
        </div>
      )}
    </div>
  );
}

type AuditWarning = {
  code: string;
  severity: "high" | "medium" | "low";
  message: string;
  sample_addresses: string[];
  count: number;
};

function AuditWarnings({ raw, t }: { raw: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  let parsed: AuditWarning[] = [];
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed.length) return null;
  const highCount = parsed.filter((w) => w.severity === "high").length;
  return (
    <details className="mt-3 border border-amber-300 bg-amber-50 rounded-lg p-2 text-xs">
      <summary className="cursor-pointer font-semibold text-amber-900 flex items-center gap-2">
        <span>⚠</span>
        <span>
          {parsed.length === 1 ? t("adm.warningsN", { n: parsed.length }) : t("adm.warningsNPlural", { n: parsed.length })}
          {highCount > 0 ? t("adm.highSeverity", { n: highCount }) : ""}
        </span>
      </summary>
      <ul className="mt-2 space-y-2">
        {parsed.map((w, i) => (
          <li key={i} className="border-l-2 border-amber-400 pl-2">
            <div className="font-mono text-[10px] uppercase tracking-wide text-amber-800">
              [{w.severity}] {w.code} · {(w.count ?? 0).toLocaleString()} {w.count === 1 ? t("adm.rowWord") : t("adm.rowsWord")}
            </div>
            <div className="text-slate-700">{w.message}</div>
            {w.sample_addresses.length > 0 && (
              <div className="mt-1 text-[11px] text-slate-500">
                {t("adm.samples")} {w.sample_addresses.join(" · ")}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Drop({
  label,
  hint,
  color,
  file,
  onPick,
  t,
}: {
  label: string;
  hint: string;
  color: string;
  file: File | null;
  onPick: (f: File | null) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) onPick(f);
      }}
      onClick={() => ref.current?.click()}
      className="bg-white border-2 border-dashed rounded-card p-6 text-center cursor-pointer transition-colors"
      style={{ borderColor: drag ? color : file ? "#0A8754" : "#E4EAF2" }}
    >
      <input
        ref={ref}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
      />
      <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color }}>
        {label}
      </div>
      <div className="text-3xl my-2">📄</div>
      {file ? (
        <>
          <div className="font-display font-semibold text-sm">{file.name}</div>
          <div className="text-xs text-muted mt-1">{t("adm.clickReplace", { size: (file.size / 1024 / 1024).toFixed(2) })}</div>
        </>
      ) : (
        <>
          <div className="font-display font-semibold text-sm">{t("adm.dropCsv")}</div>
          <div className="text-xs text-muted mt-1">{hint}</div>
        </>
      )}
    </div>
  );
}
