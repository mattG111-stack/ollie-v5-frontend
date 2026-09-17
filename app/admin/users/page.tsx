"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
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
  // Which row is open, and for what. Only one at a time — two half-filled
  // editors on screen is how the wrong account gets changed.
  const [editId, setEditId] = useState<number | null>(null);
  const [edit, setEdit] = useState({ email: "", full_name: "", company: "", phone: "", role: "user" });
  const [pwId, setPwId] = useState<number | null>(null);
  const [pw, setPw] = useState("");
  const [rowErr, setRowErr] = useState<string | null>(null);
  const [rowOk, setRowOk] = useState<string | null>(null);

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
    setRowErr(null);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (e: any) {
      setRowErr(e?.detail || e?.message || "Could not update user");
    } finally {
      setBusy(null);
    }
  }

  function openEdit(r: PendingUser) {
    setPwId(null); setRowErr(null); setRowOk(null);
    setEditId(r.id);
    setEdit({
      email: r.email, full_name: r.full_name ?? "", company: r.company ?? "",
      phone: r.phone ?? "", role: r.role,
    });
  }

  async function saveEdit(id: number) {
    setBusy(id); setRowErr(null); setRowOk(null);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(edit) });
      setEditId(null);
      await load();
    } catch (e: any) {
      setRowErr(e?.detail || e?.message || "Could not save changes");
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(id: number) {
    setBusy(id); setRowErr(null); setRowOk(null);
    try {
      await api(`/api/admin/users/${id}/password`, {
        method: "POST", body: JSON.stringify({ password: pw }),
      });
      setPwId(null); setPw("");
      setRowOk(t("adm.passwordSet"));
    } catch (e: any) {
      setRowErr(e?.detail || e?.message || "Could not set password");
    } finally {
      setBusy(null);
    }
  }

  async function removeUser(r: PendingUser) {
    // A real confirm, naming the account. Deleting the wrong row here is not
    // recoverable from the UI.
    if (!window.confirm(t("adm.deleteConfirm", { email: r.email }))) return;
    setBusy(r.id); setRowErr(null); setRowOk(null);
    try {
      await api(`/api/admin/users/${r.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setRowErr(e?.detail || e?.message || "Could not delete user");
    } finally {
      setBusy(null);
    }
  }

  const filtered = rows.filter((r) =>
    `${r.full_name ?? ""} ${r.company ?? ""} ${r.email}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="px-7 py-6">
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("adm.allUsers")}</h1>
          <p className="text-sm text-muted">
            {t("adm.usersSub", { total: rows.length, active: rows.filter((r) => r.status === "approved").length })}
          </p>
        </div>
        {/* w-64 on the search box plus the button is 460px, which is wider than
            a phone — and with html/body clipping overflow the page could not be
            scrolled to reach the button. It wraps now, and the box gives up its
            fixed width below the point where the pair stops fitting. */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("adm.searchUsers")}
            className="bg-white border border-line rounded-lg px-3 py-2 text-sm w-full sm:w-64 min-w-0 focus:outline-none focus:border-blue"
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

      {/* Delete and password results have no editor row to live in — a delete
          removes its own row, and a password save closes its panel. Without this
          the guard messages ("last active admin", "cannot delete yourself")
          vanished silently and the click just looked like it did nothing. */}
      {rowOk && !editId && !pwId && (
        <div className="mb-4 text-sm rounded-lg px-3 py-2 border" style={{ background: "#ECFDF3", borderColor: "#ABEFC6", color: "#067647" }}>
          {rowOk}
        </div>
      )}
      {rowErr && !editId && !pwId && (
        <div className="mb-4 text-sm text-danger border border-danger/30 bg-danger/5 rounded-lg px-3 py-2">
          {rowErr}
        </div>
      )}

      {/* overflow-x-auto, not overflow-hidden. Eight columns do not fit a phone,
          and `hidden` CLIPPED them — with html/body carrying overflow-x:clip as
          a safety net, the page could not be scrolled sideways either, so the
          email, role and status columns were simply unreachable on a phone.
          Scrolling the table inside its own card keeps them. */}
      <div className="bg-white border border-line rounded-card shadow-soft overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
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
              <Fragment key={r.id}>
                <tr className="border-t border-line2">
                  <td className="px-4 py-3 font-medium">{r.full_name || "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.company || "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.email}</td>
                  <td className="px-4 py-3">
                    <RoleBadge role={r.role} t={t} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} t={t} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end flex-wrap">
                      <RowBtn onClick={() => openEdit(r)} disabled={busy === r.id}>
                        {t("adm.edit")}
                      </RowBtn>
                      <RowBtn
                        onClick={() => { setEditId(null); setRowErr(null); setRowOk(null); setPwId(r.id); setPw(""); }}
                        disabled={busy === r.id}
                      >
                        {t("adm.setPassword")}
                      </RowBtn>
                      <RowBtn
                        onClick={() => setStatus(r.id, r.status === "approved" ? "deactivated" : "approved")}
                        disabled={busy === r.id}
                      >
                        {r.status === "approved" ? t("adm.deactivate") : t("adm.reactivate")}
                      </RowBtn>
                      <RowBtn onClick={() => removeUser(r)} disabled={busy === r.id} danger>
                        {t("adm.delete")}
                      </RowBtn>
                    </div>
                  </td>
                </tr>

                {editId === r.id && (
                  <tr className="border-t border-line2 bg-paper/60">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        <Field label={t("adm.email")}>
                          <input type="email" value={edit.email}
                            onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                            className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
                        </Field>
                        <Field label={t("adm.name")}>
                          <input value={edit.full_name}
                            onChange={(e) => setEdit({ ...edit, full_name: e.target.value })}
                            className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
                        </Field>
                        <Field label={t("adm.company")}>
                          <input value={edit.company}
                            onChange={(e) => setEdit({ ...edit, company: e.target.value })}
                            className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
                        </Field>
                        <Field label={t("adm.phone")}>
                          <input value={edit.phone}
                            onChange={(e) => setEdit({ ...edit, phone: e.target.value })}
                            className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
                        </Field>
                        <Field label={t("adm.role")}>
                          <select value={edit.role}
                            onChange={(e) => setEdit({ ...edit, role: e.target.value })}
                            className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue">
                            <option value="user">{t("adm.roleUser")}</option>
                            <option value="admin">{t("adm.roleAdmin")}</option>
                          </select>
                        </Field>
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <button onClick={() => saveEdit(r.id)} disabled={busy === r.id}
                          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                          style={{ background: "#0A8754" }}>
                          {busy === r.id ? t("adm.saving") : t("adm.save")}
                        </button>
                        <button onClick={() => setEditId(null)}
                          className="px-3 py-2 text-sm border border-line rounded-lg hover:border-blue">
                          {t("adm.cancel")}
                        </button>
                        {rowErr && <span className="text-sm text-danger">{rowErr}</span>}
                      </div>
                    </td>
                  </tr>
                )}

                {pwId === r.id && (
                  <tr className="border-t border-line2 bg-paper/60">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="flex items-end gap-3 flex-wrap">
                        <div className="w-72">
                          <Field label={t("adm.newPassword")} required>
                            <input type="password" minLength={8} value={pw} autoFocus
                              onChange={(e) => setPw(e.target.value)}
                              placeholder={t("adm.passwordHint")}
                              className="w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
                          </Field>
                        </div>
                        <button onClick={() => savePassword(r.id)} disabled={busy === r.id || pw.length < 8}
                          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                          style={{ background: "#0A8754" }}>
                          {busy === r.id ? t("adm.saving") : t("adm.save")}
                        </button>
                        <button onClick={() => { setPwId(null); setPw(""); }}
                          className="px-3 py-2 text-sm border border-line rounded-lg hover:border-blue">
                          {t("adm.cancel")}
                        </button>
                        {rowErr && <span className="text-sm text-danger pb-2">{rowErr}</span>}
                      </div>
                      <div className="text-xs text-faint mt-2">{r.email}</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowBtn({ onClick, disabled, danger, children }: {
  onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2.5 py-1.5 text-xs border rounded-md disabled:opacity-50 whitespace-nowrap ${
        danger ? "border-danger/40 text-danger hover:border-danger" : "border-line hover:border-blue"
      }`}
    >
      {children}
    </button>
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
