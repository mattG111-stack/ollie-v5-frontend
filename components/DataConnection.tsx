"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
type Status = {configured:boolean; enabled:boolean; proxy_configured:boolean; review_required:boolean; message:string};
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
    <p role="status" className="text-sm mt-2">{error || status?.message || "Checking connection…"}</p>
    <p className="text-xs text-muted mt-3">New for-sale listings wait in Review &amp; publish. Validated, merged sold transactions save automatically. Missing information can be filled from another source; conflicting facts require review. Undisclosed sale prices are not used for valuations.</p>
    <p className="text-xs text-muted mt-2">A configured connection does not confirm a collection has succeeded.</p>
    <p className="text-xs text-muted mt-2">Proxy credentials are managed securely in the server configuration. They are never shown here.</p>
  </section>;
}
