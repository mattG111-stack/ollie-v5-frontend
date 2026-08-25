"use client";

/**
 * The valuation, fitted on our own sales.
 *
 * Until now every price on this site came from coefficients extracted from a
 * spreadsheet dated 17 May 2026. They were fitted once, elsewhere, on data we
 * do not hold, and they have never moved. Sold files have landed every week
 * since and taught them nothing — which is a claim that the market has not
 * changed, restated on every page load.
 *
 * This panel fits a model on the sales already in the database and shows the
 * three numbers that matter, side by side, on sales the fit never saw:
 *
 *   the trained model · the estimator running today · the raw council figure
 *
 * The council figure is there because it is the honest floor. Anyone can read a
 * CV off the council website for free, and a valuation that cannot beat it is
 * not earning its place, however sophisticated it is.
 *
 * TWO THINGS THIS PANEL IS DELIBERATE ABOUT
 *
 * A model that passes goes live on its own. This used to need a human to
 * switch it on, and that was wrong: the gate already refuses anything that
 * does not beat both the council figure and the estimator running today, on
 * sales it never saw, on a forward split. Asking a person to then agree adds
 * no safety — the measurement IS the decision — it just means a valuation
 * measured as better sits unused until somebody remembers a button. What the
 * button here does is STOP it, instantly, and roll back to any earlier model.
 *
 * A failed retrain is shown, not hidden. Three failures in a row is how you
 * find out something is wrong with the incoming data, and that signal is lost
 * if the list only shows the winners.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Row = {
  id: number;
  trained_at: string | null;
  n_train: number | null;
  n_test: number | null;
  forward_error: number | null;
  engine_error: number | null;
  raw_cv_error: number | null;
  shipped: boolean;
  is_active: boolean;
  verdict: string | null;
};

type Status = {
  has_model: boolean;
  enabled: boolean;
  active: Row | null;
  history: Row[];
  sold_rows_available: number;
};

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}%`);

/** Day, month, year. Never the ISO string. */
function when(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${d.toLocaleString("en-NZ", { month: "short" })} ${d.getFullYear()}`;
}

export default function TrainedValuation() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<Status>("/api/admin/ml/status").catch(() => null);
    if (d) setSt(d);
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Fitting tens of thousands of sales with cross-validation takes tens of
   * seconds. Held open as one request it gets cut off by the proxy and the
   * browser sees a 500 with no body — the same failure the portal sweep had. */
  async function train() {
    setBusy(true);
    setMsg("Fitting on the sales we hold… this takes a minute.");
    try {
      const { job_id } = await api<{ job_id: number }>(
        "/api/admin/ml/train", { method: "POST" });
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const job = await api<{ status: string; stage: string | null;
                               error_message: string | null }>(
          `/api/admin/jobs/${job_id}`).catch(() => null);
        if (!job) continue;
        if (job.status === "completed") { setMsg(job.stage || "Done"); await load(); return; }
        if (job.status === "failed") { setMsg(job.error_message || "Training failed"); return; }
        if (job.stage) setMsg(job.stage);
      }
      setMsg("Still running — check the job list.");
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Could not train");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      setSt(await api<Status>("/api/admin/ml/enabled",
        { method: "POST", body: JSON.stringify({ enabled: on }) }));
      setMsg(on
        ? "Back on. Re-price to apply it to the live listings."
        : "Stopped. Re-price to put the previous valuation back.");
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Could not change that");
    } finally {
      setBusy(false);
    }
  }

  async function rollback(id: number) {
    setBusy(true);
    try {
      setSt(await api<Status>(`/api/admin/ml/rollback/${id}`, { method: "POST" }));
      setMsg(`Model ${id} is live again.`);
    } catch (e: any) {
      setMsg(e?.detail || e?.message || "Could not roll back");
    } finally {
      setBusy(false);
    }
  }

  const a = st?.active;
  const beatsEngine = a && a.forward_error != null && a.engine_error != null
    && a.forward_error < a.engine_error;

  return (
    <section className="mt-8 border border-line rounded-xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-lg font-bold">Valuation model</h2>
        <span className="text-xs text-muted">
          Fitted on the sales we hold, not on a fixed table
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs font-semibold">
          <span className="inline-block w-2 h-2 rounded-full"
                style={{ background: st?.enabled ? "#0A8754" : "#C3CAD5" }} />
          {st?.enabled ? "Pricing with it" : st?.has_model ? "Switched off" : "Nothing fitted"}
        </span>
      </div>

      {msg && <div className="text-xs text-muted mt-2">{msg}</div>}

      {!st?.has_model ? (
        <div className="text-xs text-muted mt-4 leading-relaxed">
          Nothing fitted yet. The site is pricing from a fixed table that has
          not changed since it was loaded. A model that beats it goes live on
          its own; one that does not is kept and listed, and changes nothing.{" "}
          {st ? `${st.sold_rows_available.toLocaleString()} sales are available to fit on.` : ""}
          <div className="mt-3">
            <button onClick={train} disabled={busy}
              className="text-xs font-semibold px-3 py-2 rounded-lg bg-ink text-white disabled:opacity-50">
              {busy ? "Fitting…" : "Fit a model"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* The three numbers, side by side. Error on sales the fit never saw. */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Trained model", v: a?.forward_error, hero: true },
              { label: "Previous valuation", v: a?.engine_error },
              { label: "Council figure alone", v: a?.raw_cv_error },
            ].map((c) => (
              <div key={c.label}
                   className={`rounded-lg border p-3 ${
                     c.hero && beatsEngine ? "border-[#0A8754]" : "border-line"}`}>
                <div className="text-[11px] uppercase tracking-wider text-muted">
                  {c.label}
                </div>
                <div className={`tnum text-xl font-bold mt-1 ${
                  c.hero && beatsEngine ? "text-[#0A8754]" : ""}`}>
                  {pct(c.v ?? null)}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted mt-2 leading-relaxed">
            Typical error against what {a?.n_test?.toLocaleString() ?? "—"} homes
            actually sold for — sales the model had never seen, and that sold
            <b> after</b> everything it learned from. Lower is better. Fitted on{" "}
            {a?.n_train?.toLocaleString() ?? "—"} sales on {when(a?.trained_at ?? null)}.
          </div>
          {a?.verdict && (
            <div className="text-xs mt-2 font-semibold">{a.verdict}</div>
          )}

          <div className="flex gap-2 mt-4 flex-wrap items-center">
            <button onClick={train} disabled={busy}
              className="text-xs font-semibold px-3 py-2 rounded-lg border border-line hover:border-blue disabled:opacity-50">
              {busy ? "Fitting…" : "Fit again on the latest sales"}
            </button>
            <button onClick={() => toggle(!st.enabled)} disabled={busy}
              className={`text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50 ${
                st.enabled ? "border border-line hover:border-danger"
                           : "bg-ink text-white"}`}>
              {st.enabled ? "Stop using it" : "Use it again"}
            </button>
          </div>

          {st.history.length > 1 && (
            <div className="mt-5">
              <div className="text-[11px] uppercase tracking-wider text-muted mb-2">
                Every fit, including the ones that did not make it
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                      <th className="py-1.5 pr-3">Fitted</th>
                      <th className="py-1.5 pr-3 text-right">Sales</th>
                      <th className="py-1.5 pr-3 text-right">Model</th>
                      <th className="py-1.5 pr-3 text-right">Previous</th>
                      <th className="py-1.5 pr-3 text-right">Council</th>
                      <th className="py-1.5 pr-3">Outcome</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {st.history.map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="py-1.5 pr-3">{when(r.trained_at)}</td>
                        <td className="py-1.5 pr-3 text-right tnum">
                          {r.n_train?.toLocaleString() ?? "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-right tnum font-semibold">
                          {pct(r.forward_error)}
                        </td>
                        <td className="py-1.5 pr-3 text-right tnum">{pct(r.engine_error)}</td>
                        <td className="py-1.5 pr-3 text-right tnum">{pct(r.raw_cv_error)}</td>
                        <td className="py-1.5 pr-3">
                          {r.is_active ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white">
                              live
                            </span>
                          ) : r.shipped ? (
                            <span className="text-muted">passed</span>
                          ) : (
                            <span className="text-danger" title={r.verdict ?? ""}>
                              not used
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-right">
                          {r.shipped && !r.is_active && (
                            <button onClick={() => rollback(r.id)} disabled={busy}
                              className="text-[11px] text-blue hover:underline disabled:opacity-50">
                              make live
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
