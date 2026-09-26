"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
type CollectionRun = {id:number; kind:"for_sale"|"sold"; status:string; started_at:string|null; finished_at:string|null; observed:number; new?:number; pending?:number; discovery_pending?:number; excluded?:number; failed_sources?:number; record_errors?:number};
type Status = {configured:boolean; enabled:boolean; proxy_configured:boolean; review_required:boolean; message:string; latest_runs?:CollectionRun[]};
export default function DataConnection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Status>("/api/admin/release/scraper")
      .then(setStatus).catch(() => setError("Could not check the data connection. Please try again."));
  }, []);
  return <section className="mt-8 border border-line rounded-xl p-5">
    <h2 className="font-display text-lg font-bold">Data connection</h2>
    <p className="text-sm mt-2">Trade Me Property · OneRoof · homes.co.nz</p>
    <p role="status" className="text-sm mt-2">{error || (!status ? "Checking collection history…" : status.latest_runs?.length ? "Latest recorded worker runs" : "No collection runs recorded yet.")}</p>
    {!!status?.latest_runs?.length && <ul className="text-sm mt-3 space-y-3">{status.latest_runs.map(run => <li key={run.id}>
      <strong>{run.kind === "sold" ? "Sold properties" : "For-sale listings"}</strong>
      <span> · {run.status === "complete" ? "Batch completed" : run.status === "failed" ? "Attempt failed" : run.status === "partial" ? "Partial results saved" : run.status === "running" ? "Last recorded as running" : "Status unknown"}</span>
      <div className="text-xs text-muted">{run.observed} source records observed{run.new != null ? ` · ${run.new} ${run.kind === "sold" ? "validated sales saved" : "new listings for review"}` : ""}{run.pending != null ? ` · ${run.pending} URLs queued` : ""}{run.discovery_pending ? " · Search discovery incomplete" : ""}{run.failed_sources ? ` · ${run.failed_sources} sources waiting to retry` : ""}{run.record_errors ? ` · ${run.record_errors} details excluded; evidence retained` : ""}</div>
      {run.started_at && <div className="text-xs text-muted">Started {new Date(run.started_at).toLocaleString()}{run.finished_at ? ` · Finished ${new Date(run.finished_at).toLocaleString()}` : ""}</div>}
    </li>)}</ul>}
    <p className="text-xs text-muted mt-3">New for-sale listings wait in Review &amp; publish. Validated, merged sold transactions save automatically. Missing information can be filled from another source; conflicting facts require review. Undisclosed sale prices are not used for valuations.</p>
    <p className="text-xs text-muted mt-2">Collection runs in a separate worker. A completed batch does not mean the entire search has finished; queued URLs and incomplete discovery still need processing.</p>
    <p className="text-xs text-muted mt-2">Proxy credentials are managed securely in the server configuration. They are never shown here.</p>
  </section>;
}
