"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

/**
 * Type an address, see exactly what the free data sources hold for it.
 *
 * Built to answer one procurement question — what do we get for nothing, and
 * what do we have to buy — against live responses rather than anyone's memory
 * of a schema. So it prints EVERY field each layer returns, not a curated
 * selection: the useful discovery is the field nobody expected, and a probe
 * that only reports what someone already thought of cannot make one.
 *
 * Runs server-side. The LINZ key is a secret and would be readable in a browser
 * bundle, and LINZ does not promise CORS headers to arbitrary origins.
 */
type Layer = {
  name: string;
  id: string;
  why: string;
  status: number;
  features: number;
  fields: Record<string, string>;
  error: string | null;
};

type Coverage = {
  beta: string;
  input: string;
  found: { field: string; layer: string; value: string } | null;
};

type Probe = {
  matched: string | null;
  lat: number | null;
  lng: number | null;
  reached: number;
  layers: Layer[];
  coverage: Coverage[];
};

const EXAMPLES = ["1 Queen Street, Auckland", "12 Bassett Road, Remuera", "5 Hurstmere Road, Takapuna"];

export default function DataProbePage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [address, setAddress] = useState("");
  const [r, setR] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(text?: string) {
    const q = (text ?? address).trim();
    if (!q) return;
    setBusy(true); setErr(null); setR(null);
    if (text) setAddress(text);
    try {
      // A lat,lng pair is passed through as coordinates; anything else is an
      // address for LINZ's own geocoder to resolve.
      const pair = q.split(",").map((s) => Number(s.trim()));
      const isCoords = pair.length === 2 && pair.every((n) => Number.isFinite(n));
      const qs = isCoords ? `lat=${pair[0]}&lng=${pair[1]}` : `address=${encodeURIComponent(q)}`;
      setR(await api<Probe>(`/api/admin/data-probe?${qs}`));
    } catch (e: any) {
      setErr(e?.detail || e?.message || "The probe could not run");
    } finally { setBusy(false); }
  }

  const got = r?.coverage.filter((c) => c.found).length ?? 0;

  return (
    <div className="px-7 py-6 max-w-5xl">
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · DATA</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">What can we get for free?</h1>
      <p className="text-sm text-muted mt-1 mb-5 max-w-2xl">
        Type an address. This asks every free LINZ layer what it holds for that
        property and prints all of it, then scores the result against the nine
        inputs the pricing model takes.
      </p>

      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <div className="flex flex-wrap gap-3">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") run(); }}
            placeholder="12 Bassett Road, Remuera    — or   -36.8790, 174.7770"
            className="flex-1 min-w-[280px] bg-white border border-line rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue"
          />
          <button
            onClick={() => run()}
            disabled={busy || !address.trim()}
            className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
            style={{ background: "#1F6FEB" }}
          >
            {busy ? "Asking LINZ…" : "Probe"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3 items-center">
          <span className="text-xs text-faint">Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e} onClick={() => run(e)} disabled={busy}
                    className="text-xs px-2.5 py-1 border border-line rounded-lg hover:border-blue disabled:opacity-50">
              {e}
            </button>
          ))}
        </div>
        {err && <div className="mt-3 text-sm text-danger">{err}</div>}
      </div>

      {r && (
        <>
          {r.matched && (
            <div className="text-sm text-muted mb-4">
              Matched <b className="text-ink">{r.matched}</b>
              {r.lat != null && (
                <span className="font-mono text-xs text-faint ml-2">
                  {r.lat.toFixed(5)}, {r.lng?.toFixed(5)}
                </span>
              )}
            </div>
          )}

          {r.reached === 0 ? (
            /* Nine red crosses drawn from four failed requests reads as "none of
               this is available free", which is the opposite of what it means. */
            <div className="bg-white border rounded-card shadow-soft p-5 mb-5"
                 style={{ borderColor: "#F0C674", background: "#FFF6E5", color: "#6B4E00" }}>
              <b>Nothing answered, so there is nothing to score.</b>
              <div className="text-sm mt-2">
                Usually the key is wrong or revoked, or the server cannot reach
                data.linz.govt.nz. Do not read this as &ldquo;the data is not
                available&rdquo; — the question was never asked.
              </div>
            </div>
          ) : (
            <div className="bg-white border border-line rounded-card shadow-soft overflow-hidden mb-5">
              <div className="px-5 py-3 border-b border-line flex items-baseline gap-3">
                <h2 className="font-display font-semibold text-sm flex-1">
                  Model inputs covered
                </h2>
                <span className="text-sm">
                  <b className="text-lg tabular-nums" style={{ color: got ? "#0A8754" : undefined }}>
                    {got}
                  </b>
                  <span className="text-faint"> of {r.coverage.length} free</span>
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {r.coverage.map((c) => (
                    <tr key={c.input} className="border-t border-line2">
                      <td className="px-5 py-2.5 w-14 font-mono text-xs text-faint">{c.beta}</td>
                      <td className="px-2 py-2.5 font-medium">{c.input}</td>
                      <td className="px-5 py-2.5 text-right">
                        {c.found ? (
                          <span>
                            <span className="font-mono text-xs">{c.found.field}</span>
                            <span className="text-faint"> = </span>
                            <b>{c.found.value}</b>
                            <div className="text-[11px] text-faint">{c.found.layer}</div>
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "#B42318" }}>
                            buy it, or ask the owner
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Every field, verbatim. The point of the whole page. */}
          <div className="flex flex-col gap-3">
            {r.layers.map((l) => (
              <div key={l.id} className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
                <div className="px-5 py-3 border-b border-line">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="font-display font-semibold text-sm">{l.name}</h3>
                    <span className="font-mono text-[11px] text-faint">{l.id}</span>
                    <span className="ml-auto text-xs font-semibold"
                          style={{ color: l.error ? "#B42318" : l.features ? "#0A8754" : "#B98700" }}>
                      {l.error ? `HTTP ${l.status || "—"}`
                        : l.features ? `${l.features} found · ${Object.keys(l.fields).length} fields`
                        : "nothing here"}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{l.why}</div>
                </div>
                {l.error ? (
                  <div className="px-5 py-3 text-sm text-danger">{l.error}</div>
                ) : Object.keys(l.fields).length === 0 ? (
                  <div className="px-5 py-3 text-sm text-muted">
                    Answered, but no feature at this point — either no coverage
                    here, or the geometry column differs on this layer.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(l.fields).map(([k, v]) => (
                          <tr key={k} className="border-t border-line2">
                            <td className="px-5 py-1.5 font-mono text-xs text-muted whitespace-nowrap w-64">{k}</td>
                            <td className="px-2 py-1.5 break-all">{v || <span className="text-faint">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="text-xs text-faint mt-5 leading-relaxed max-w-2xl">
            Everything above is free under CC-BY, commercial use included, with
            attribution. If a field showed up that looks useful but is not on the
            scorecard, say so — the scorecard only recognises the names it was
            told to look for.
          </div>
        </>
      )}
    </div>
  );
}
