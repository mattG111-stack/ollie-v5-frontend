"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { PendingUser, api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function PendingPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { t } = useT();
  const [rows, setRows] = useState<PendingUser[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    const data = await api<PendingUser[]>("/api/admin/users?status=pending");
    setRows(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: number, status: "approved" | "rejected") {
    setBusy(id);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-7 py-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("adm.pendingTitle")}</h1>
          <p className="text-sm text-muted">
            {rows.length === 1 ? t("adm.pendingSub", { n: rows.length }) : t("adm.pendingSubPlural", { n: rows.length })}
          </p>
        </div>
        <div className="bg-blue/10 border border-blue/30 text-blue rounded-full px-3 py-1 text-xs font-semibold">
          {t("adm.pendingBadge", { n: rows.length })}
        </div>
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
            <tr>
              <th className="text-left px-4 py-3">{t("adm.name")}</th>
              <th className="text-left px-4 py-3">{t("adm.company")}</th>
              <th className="text-left px-4 py-3">{t("adm.email")}</th>
              <th className="text-left px-4 py-3">{t("adm.phone")}</th>
              <th className="text-right px-4 py-3">{t("adm.action")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted py-12">
                  {t("adm.noPending")}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-line2">
                  <td className="px-4 py-3 font-medium">{r.full_name || "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.company || "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.email}</td>
                  <td className="px-4 py-3 text-muted">{r.phone || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => decide(r.id, "rejected")}
                        disabled={busy === r.id}
                        className="px-3 py-1.5 text-xs border border-line rounded-md hover:border-danger hover:text-danger disabled:opacity-50"
                      >
                        {t("adm.reject")}
                      </button>
                      <button
                        onClick={() => decide(r.id, "approved")}
                        disabled={busy === r.id}
                        className="px-3 py-1.5 text-xs bg-blue text-white rounded-md hover:bg-blue-dark font-semibold disabled:opacity-50"
                      >
                        {busy === r.id ? "…" : t("adm.approve")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
