"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { PendingUser, api } from "@/lib/api";
import { useT } from "@/lib/i18n";

export default function UsersPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { t } = useT();
  const [rows, setRows] = useState<PendingUser[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "", company: "", phone: "", password: "", role: "user" });
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddErr(null);
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ email: "", full_name: "", company: "", phone: "", password: "", role: "user" });
      setShowAdd(false);
      await load();
    } catch (e: any) {
      setAddErr(e?.detail || e?.message || "Could not create user");
    } finally {
      setAdding(false);
    }
  }

  const load = useCallback(async () => {
    const data = await api<PendingUser[]>("/api/admin/users");
    setRows(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: number, status: string) {
    setBusy(id);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const filtered = rows.filter((r) =>
    `${r.full_name ?? ""} ${r.company ?? ""} ${r.email}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="px-7 py-6">
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("adm.allUsers")}</h1>
          <p className="text-sm text-muted">
            {t("adm.usersSub", { total: rows.length, active: rows.filter((r) => r.status === "approved").length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("adm.searchUsers")}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-blue"
          />
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="px-3 py-2 text-sm font-semibold text-white rounded-lg whitespace-nowrap"
            style={{ background: "#0A8754" }}
          >
            {showAdd ? t("adm.cancel") : t("adm.addUser")}
          </button>
        </div>
      </div>

      {showAdd && (
        <form
          onSubmit={createUser}
          className="bg-white border border-line rounded-card shadow-soft p-5 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          <Field label={t("adm.email")} required>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </Field>
          <Field label={t("adm.name")}>
            <input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </Field>
          <Field label={t("adm.company")}>
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </Field>
          <Field label={t("adm.phone")}>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </Field>
          <Field label={t("adm.password")} required>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={t("adm.passwordHint")}
              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            />
          </Field>
          <Field label={t("adm.role")}>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            >
              <option value="user">{t("adm.roleUser")}</option>
              <option value="admin">{t("adm.roleAdmin")}</option>
            </select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={adding}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ background: "#0A8754" }}
            >
              {adding ? t("adm.creating") : t("adm.createUser")}
            </button>
            {addErr && <span className="text-sm text-danger">{addErr}</span>}
            <span className="text-xs text-faint">{t("adm.addUserNote")}</span>
          </div>
        </form>
      )}

      <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
            <tr>
              <th className="text-left px-4 py-3">{t("adm.name")}</th>
              <th className="text-left px-4 py-3">{t("adm.company")}</th>
              <th className="text-left px-4 py-3">{t("adm.email")}</th>
              <th className="text-left px-4 py-3">{t("adm.role")}</th>
              <th className="text-left px-4 py-3">{t("adm.status")}</th>
              <th className="text-right px-4 py-3">{t("adm.action")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-line2">
                <td className="px-4 py-3 font-medium">{r.full_name || "—"}</td>
                <td className="px-4 py-3 text-muted">{r.company || "—"}</td>
                <td className="px-4 py-3 text-muted">{r.email}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={r.role} t={t} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} t={t} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() =>
                      setStatus(r.id, r.status === "approved" ? "deactivated" : "approved")
                    }
                    disabled={busy === r.id}
                    className="px-3 py-1.5 text-xs border border-line rounded-md hover:border-blue disabled:opacity-50"
                  >
                    {r.status === "approved" ? t("adm.deactivate") : t("adm.reactivate")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function RoleBadge({ role, t }: { role: string; t: (k: string) => string }) {
  const cls = role === "admin" ? "bg-blue/15 text-blue" : "bg-paper text-muted";
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{role === "admin" ? t("adm.roleAdmin") : t("adm.roleUser")}</span>;
}

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  const map: Record<string, string> = {
    approved: "text-under",
    pending: "text-blue",
    rejected: "text-danger",
    deactivated: "text-faint",
  };
  const label: Record<string, string> = {
    approved: t("adm.statusApproved"),
    pending: t("adm.statusPending"),
    rejected: t("adm.statusRejected"),
    deactivated: t("adm.statusDeactivated"),
  };
  return <span className={`text-xs font-medium ${map[status] ?? ""}`}>● {label[status] ?? status}</span>;
}
