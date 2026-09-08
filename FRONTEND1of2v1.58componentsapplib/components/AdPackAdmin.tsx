"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, getToken } from "@/lib/api";

/**
 * The ad pack, from the admin side: upload it once, every promoter has it.
 *
 * Files are stored in the database rather than on the container's disk, because
 * Railway wipes that disk on every deploy — a file written next to the app is
 * gone the next time anything ships, and it goes silently, with a promoter
 * finding out by clicking a download that 404s.
 *
 * That trade has a ceiling, so anything over the size limit is a link instead.
 * A brand video belongs on YouTube or Drive with its URL here; promoters get the
 * same thing and the database stays a database.
 */
type Asset = {
  id: number;
  title: string;
  kind: string;
  note: string | null;
  filename: string | null;
  content_type: string | null;
  size_bytes: number;
  url: string | null;
  active: boolean;
  created_at: string | null;
  downloadable: boolean;
};

const KINDS = ["image", "logo", "video", "doc", "link"];

export const prettyBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB`
  : n >= 1024 ? `${Math.round(n / 1024)} KB`
  : `${n} B`;

export default function AdPackAdmin() {
  const [rows, setRows] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("image");
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setRows(await api<Asset[]>("/api/admin/promoters/assets"));
  }, []);
  useEffect(() => { load().catch((e) => setErr(e?.detail || e?.message || null)); }, [load]);

  async function upload() {
    setBusy(true); setErr(null); setOk(null);
    try {
      const fd = new FormData();
      const f = fileRef.current?.files?.[0];
      if (f) fd.append("file", f);
      fd.append("title", title.trim());
      fd.append("kind", kind);
      fd.append("note", note.trim());
      fd.append("url", url.trim());

      // Multipart goes through fetch rather than the JSON api() helper, and the
      // Content-Type header is deliberately NOT set — the browser has to add it
      // with the boundary or the server cannot parse the body.
      const res = await fetch("/api/admin/promoters/assets", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Upload failed (${res.status})`);
      }
      const a = (await res.json()) as Asset;
      setTitle(""); setNote(""); setUrl("");
      if (fileRef.current) fileRef.current.value = "";
      setOk(`"${a.title}" added — every promoter can see it now.`);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Could not upload that");
    } finally { setBusy(false); }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(true); setErr(null); setOk(null);
    try {
      await api(`/api/admin/promoters/assets/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not save");
    } finally { setBusy(false); }
  }

  async function remove(a: Asset) {
    if (!window.confirm(`Delete "${a.title}" for good? Hiding it instead keeps it recoverable.`)) return;
    setBusy(true); setErr(null); setOk(null);
    try {
      await api(`/api/admin/promoters/assets/${a.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not delete");
    } finally { setBusy(false); }
  }

  const total = rows.reduce((n, r) => n + (r.size_bytes || 0), 0);

  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
      <h2 className="font-display font-semibold text-sm">Ad pack</h2>
      <div className="text-xs text-muted mt-0.5 mb-3">
        Images, logos, videos and documents your promoters can download. Anything
        you add here shows up in their Media pack straight away.
      </div>

      {ok && <div className="mb-3 text-sm" style={{ color: "#067647" }}>{ok}</div>}
      {err && <div className="mb-3 text-sm text-danger">{err}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 placeholder="Story image — under value"
                 className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}
                  className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue">
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">File</span>
          <input ref={fileRef} type="file"
                 className="mt-1 w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-line file:bg-paper file:text-xs" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
            …or a link (for anything big)
          </span>
          <input value={url} onChange={(e) => setUrl(e.target.value)}
                 placeholder="https://youtube.com/…"
                 className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
            Note for promoters (optional)
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
                 placeholder="1080×1920, keep the top 250px clear"
                 className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
        </label>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button onClick={upload} disabled={busy}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                style={{ background: "#0A8754" }}>
          {busy ? "Uploading…" : "Add to the pack"}
        </button>
        <span className="text-xs text-faint">
          20 MB a file. Bigger than that, put it on YouTube or Drive and paste the link.
        </span>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-paper text-[10.5px] uppercase tracking-wider text-faint font-semibold">
              <tr>
                <th className="text-left px-4 py-2">Item</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-right px-4 py-2">Size</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-line2" style={{ opacity: a.active ? 1 : 0.5 }}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">
                      {a.title}
                      {!a.active && <span className="ml-2 text-xs text-danger">hidden</span>}
                    </div>
                    {a.note && <div className="text-xs text-faint">{a.note}</div>}
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer"
                         className="text-xs text-blue hover:underline break-all">{a.url}</a>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted">{a.kind}</td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted tabular-nums">
                    {a.size_bytes ? prettyBytes(a.size_bytes) : "link"}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => patch(a.id, { active: !a.active })} disabled={busy}
                            className="text-xs hover:underline"
                            style={{ color: a.active ? "#B42318" : "#0A8754" }}>
                      {a.active ? "hide" : "show"}
                    </button>
                    <button onClick={() => remove(a)} disabled={busy}
                            className="ml-3 text-xs text-faint hover:underline">delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="text-xs text-faint mt-2">
          {prettyBytes(total)} stored in the database. Hiding keeps an item
          recoverable; deleting does not.
        </div>
      )}
    </div>
  );
}
