"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { forgetImageryConfig } from "@/lib/imagery";

/**
 * The aerial imagery key, set once here.
 *
 * It was a build-time variable in the frontend, so changing it meant a rebuild
 * and a redeploy of the whole site — and setting the key without also setting a
 * second variable naming the provider did nothing, which is indistinguishable
 * from a key that does not work. Set here, it takes effect on the next page
 * load, and the key alone is the whole configuration.
 */
type Status = {
  provider: string;
  provider_setting: string | null;
  google_configured: boolean;
  google_last_four: string | null;
  linz_configured: boolean;
  linz_last_four: string | null;
  updated_at: string | null;
  detail: string;
};

const SOURCES: Record<string, { name: string; sharp: string; note: string }> = {
  google: {
    name: "Google satellite",
    sharp: "real pixels to zoom 21, at 2× density",
    note: "Streams as you pan. Billed per request against Google's monthly free allowance.",
  },
  linz: {
    name: "LINZ Basemaps",
    sharp: "real pixels to zoom 22",
    note: "10–30 cm over New Zealand, flown more recently than the global sets. Free with the key.",
  },
  esri: {
    name: "Esri World Imagery",
    sharp: "no pixels past zoom 19",
    note: "Free and needs no key. Everything past zoom 19 is the last real tile enlarged, which is what a soft aerial looks like.",
  },
};

export default function MapsAdminPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [s, setS] = useState<Status | null>(null);
  const [google, setGoogle] = useState("");
  const [linz, setLinz] = useState("");
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<Status>("/api/admin/maps");
    setS(r);
    setProvider(r.provider_setting ?? "");
  }, []);

  useEffect(() => { load().catch((e) => setErr(e?.detail || e?.message || null)); }, [load]);

  async function save(patch: Record<string, string>, msg: string) {
    setBusy(true); setErr(null); setOk(null);
    try {
      const r = await api<Status>("/api/admin/maps", { method: "PUT", body: JSON.stringify(patch) });
      setS(r);
      setProvider(r.provider_setting ?? "");
      setGoogle(""); setLinz("");
      // Every map on this browser re-reads the settings now, so the next
      // property page shows the change without a hard refresh.
      forgetImageryConfig();
      setOk(msg);
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not save");
    } finally { setBusy(false); }
  }

  const src = SOURCES[s?.provider ?? "esri"] ?? SOURCES.esri;

  return (
    <div className="px-7 py-6 max-w-4xl">
      <div className="text-[11px] uppercase tracking-widest text-blue font-semibold">ADMIN · MAP IMAGERY</div>
      <h1 className="font-display text-2xl font-semibold mt-1.5">Aerial photos — API key</h1>
      <p className="text-sm text-muted mt-1 mb-5">
        Which aerial the property pages draw. Paste a key and it is used — there is
        no second setting to remember. Nothing here affects the street maps on the
        listings and trends pages, which are free and need no key.
      </p>

      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: s?.provider === "esri" ? "#C9CED6" : "#0A8754" }}
          />
          <span className="text-sm font-semibold">Showing {src.name}</span>
          <span className="text-xs text-faint">— {src.sharp}</span>
        </div>
        <div className="text-sm text-muted">{s?.detail ?? "Loading…"}</div>

        {ok && <div className="mt-3 text-sm" style={{ color: "#067647" }}>{ok}</div>}
        {err && <div className="mt-3 text-sm text-danger">{err}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              Google Maps key{s?.google_configured ? " (replace)" : ""}
            </span>
            <input
              type="password"
              value={google}
              onChange={(e) => setGoogle(e.target.value)}
              placeholder="AIza…"
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => save({ google_key: google.trim() }, "Google key saved.")}
              disabled={busy || google.trim().length < 10}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
              style={{ background: "#0A8754" }}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {s?.google_configured && (
              <button
                type="button"
                onClick={() => save({ google_key: "" }, "Google key removed.")}
                disabled={busy}
                className="px-3 py-2 text-sm border border-danger/40 text-danger rounded-lg hover:border-danger disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          {s?.google_last_four && (
            <div className="sm:col-span-3 -mt-1 text-xs text-faint font-mono">
              saved: ···{s.google_last_four}
            </div>
          )}

          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              LINZ Basemaps key{s?.linz_configured ? " (replace)" : ""} — optional
            </span>
            <input
              type="password"
              value={linz}
              onChange={(e) => setLinz(e.target.value)}
              placeholder="c…"
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => save({ linz_key: linz.trim() }, "LINZ key saved.")}
              disabled={busy || linz.trim().length < 10}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-line hover:border-blue disabled:opacity-50"
            >
              Save
            </button>
            {s?.linz_configured && (
              <button
                type="button"
                onClick={() => save({ linz_key: "" }, "LINZ key removed.")}
                disabled={busy}
                className="px-3 py-2 text-sm border border-danger/40 text-danger rounded-lg hover:border-danger disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>

          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              Which to use
            </span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
            >
              <option value="">Automatic — the sharpest key that is set</option>
              <option value="google">Google satellite</option>
              <option value="linz">LINZ Basemaps</option>
              <option value="esri">Esri — free, no key, and the blurriest</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => save({ provider }, "Source saved.")}
              disabled={busy}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-line hover:border-blue disabled:opacity-50"
            >
              Save source
            </button>
          </div>
        </div>

        <div className="text-xs text-faint mt-4 leading-relaxed">
          {src.note}
        </div>
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft p-5">
        <h2 className="font-display font-semibold text-sm mb-2">Getting a Google key</h2>
        <ol className="text-sm text-muted leading-relaxed list-decimal ml-5 space-y-1">
          <li>Google Cloud Console → APIs &amp; Services → Library.</li>
          <li>
            Enable <b>both</b>: <b>Map Tiles API</b> (the sharp one — real satellite
            tiles that stream as you pan) and <b>Maps Static API</b> (the fallback
            for when a tile session cannot be minted).
          </li>
          <li>Credentials → Create credentials → API key.</li>
          <li>
            Edit that key → Application restrictions → <b>Websites</b> → add this
            site&apos;s domains. The key reaches the browser, because the browser is
            what calls Google — the domain restriction is what stops anyone else
            spending it.
          </li>
          <li>Paste it above.</li>
        </ol>
        <div className="text-xs text-faint mt-3 leading-relaxed">
          The key is stored encrypted and never shown again — only its last four
          characters. It is handed to the browser only on pages a signed-in,
          subscribed user is already entitled to see. Imagery is only ever
          requested on a property page, never while browsing the listings, so the
          cost follows the listings people actually open.
        </div>
      </div>
    </div>
  );
}
