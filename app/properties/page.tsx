"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import PropertiesTable from "@/components/PropertiesTable";
import { useAuth } from "@/lib/auth";

// Same-origin only (see lib/api.ts) — never a cross-origin call, so no CORS.
const API_BASE = "";

export default function PropertiesPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";

  return (
    <div className="px-7 py-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">All properties</div>
          <h1 className="font-display text-2xl font-semibold mt-1.5">Every listing, one filtered view</h1>
          <p className="text-sm text-muted mt-1">
            Scan the whole market like a spreadsheet — sort any column, filter by opportunity, click a row to open it.
          </p>
        </div>
        {isAdmin && <ExportButton />}
      </div>
      <Suspense fallback={<div className="text-sm text-muted">Loading…</div>}>
        <PropertiesWithSearch />
      </Suspense>
    </div>
  );
}

function ExportButton() {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const token = localStorage.getItem("ollie_token");
      const res = await fetch(`${API_BASE}/api/properties/export.csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `ollie_priced_export_${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Export failed: ${e?.message ?? "unknown"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={download}
      disabled={busy}
      className="bg-blue text-white hover:bg-blue-dark disabled:opacity-50 px-4 py-2.5 rounded-lg font-semibold text-sm whitespace-nowrap"
    >
      {busy ? "Preparing…" : "⤓ Export all to CSV"}
    </button>
  );
}

function PropertiesWithSearch() {
  const params = useSearchParams();
  const initialFilter = useMemo(() => {
    const filter: Record<string, string> = {};
    const search = params?.get("search");
    if (search) filter.search = search;
    return filter;
  }, [params]);

  return <PropertiesTable initialFilter={initialFilter} />;
}
