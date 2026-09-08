"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { BRAND_FILES } from "@/lib/brand-assets";

/**
 * Everything a promoter needs to actually make an ad: the facts, the rules, the
 * colours, ready-made copy, and a drafting tool.
 *
 * The ready-made copy comes first and the AI drafting second, deliberately. The
 * templates work at eleven at night with no API key configured and no network
 * round trip; the generator is the thing you reach for when the templates do
 * not fit the idea you had. An influencer blocked behind "AI is not switched on
 * for this account" is an influencer who posts nothing.
 *
 * The rules are printed, not just enforced. A prohibition that only the model
 * can see does nothing about the caption someone writes themselves — and on a
 * property site, "guaranteed returns" in an affiliate's post is our problem
 * whoever typed it.
 */
type Kit = {
  product: { name: string; what: string; who: string; points: string[] };
  rules: string[];
  colours: { name: string; hex: string; use: string }[];
  templates: { channel: string; text: string }[];
  ads_remaining: number;
  ads_limit: number;
  ai_available: boolean;
};

type Draft = { channel: string; hook: string; text: string };

type Asset = {
  id: number;
  title: string;
  kind: string;
  note: string | null;
  filename: string | null;
  content_type: string | null;
  size_bytes: number;
  url: string | null;
  downloadable: boolean;
};

const prettyBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB`
  : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;

const CHANNELS = [
  "Instagram caption",
  "TikTok caption",
  "Short video script (30s)",
  "Facebook post",
  "LinkedIn post",
  "Newsletter / email",
  "YouTube description",
  "X / Twitter thread",
];

export default function PromoterKit({ link }: { link: string }) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [channel, setChannel] = useState(CHANNELS[0]);
  const [angle, setAngle] = useState("");
  const [campaign, setCampaign] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setKit(await api<Kit>("/api/promoter/kit"));
      // Separate call, and a failure here does not take the pack down with it:
      // the copy and the rules are the part that always has to render.
      setAssets(await api<Asset[]>("/api/promoter/assets").catch(() => []));
    } catch (e: any) {
      setErr(e?.detail || e?.message || "Could not load the media pack");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true); setGenErr(null);
    try {
      const r = await api<{ drafts: Draft[]; remaining: number }>("/api/promoter/ads", {
        method: "POST",
        body: JSON.stringify({ channel, angle, campaign: campaign.trim() || null }),
      });
      setDrafts(r.drafts);
      setKit((k) => (k ? { ...k, ads_remaining: r.remaining } : k));
    } catch (e: any) {
      setGenErr(e?.detail || e?.message || "Could not draft anything just now");
    } finally { setBusy(false); }
  }

  if (err) return <div className="text-sm text-danger">{err}</div>;
  if (!kit) return <div className="text-sm text-muted">Loading…</div>;

  return (
    <div className="flex flex-col gap-5">
      {/* ── what you are promoting ─────────────────────────────────────── */}
      <Card title="What you are promoting"
            sub="Use these words. They are the ones we can stand behind.">
        <p className="text-sm text-ink leading-relaxed">{kit.product.what}</p>
        <p className="text-sm text-muted mt-2"><b>Who it is for:</b> {kit.product.who}</p>
        <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {kit.product.points.map((p) => (
            <li key={p} className="text-sm text-muted flex gap-2">
              <span style={{ color: "#0A8754" }}>✓</span>{p}
            </li>
          ))}
        </ul>
      </Card>

      {/* ── the rules ──────────────────────────────────────────────────── */}
      <Card title="What you must not say"
            sub="These apply to anything you write yourself as well as the drafts below.">
        <ul className="flex flex-col gap-1.5">
          {kit.rules.map((r) => (
            <li key={r} className="text-sm flex gap-2" style={{ color: "#7A3E00" }}>
              <span>•</span>{r}
            </li>
          ))}
        </ul>
        <div className="text-xs text-faint mt-3 leading-relaxed">
          This is property research data, not financial advice, and it is a paid
          referral. Say both. Beyond being the rule here, the platforms require
          the disclosure and take posts down for missing it.
        </div>
      </Card>

      {/* ── the ad pack ────────────────────────────────────────────────── */}
      {assets.length > 0 && (
        <Card title="Ad pack"
              sub="Artwork and files to use in your posts. Downloads are for you — please do not re-share the files themselves.">
          <div className="grid sm:grid-cols-2 gap-3">
            {assets.map((a) => <AssetCard key={a.id} asset={a} />)}
          </div>
        </Card>
      )}

      {/* ── brand ──────────────────────────────────────────────────────── */}
      <Card title="Logo and colours">
        {BRAND_FILES.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {BRAND_FILES.map((f) => (
              <a key={f} href={`/brand/${f}`} download
                 className="flex items-center gap-3 border border-line rounded-lg px-4 py-3 hover:border-blue">
                <img src={`/brand/${f}`} alt="" style={{ height: 26, maxWidth: 150 }} />
                <span className="text-xs font-mono text-muted">{f}</span>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-sm rounded-lg border px-4 py-3"
               style={{ background: "#FFF6E5", borderColor: "#F0C674", color: "#6B4E00" }}>
            The logo files have not been uploaded yet. Ask for them before you
            put the mark in anything — please do not screenshot it off the site,
            a re-drawn logo is worse than no logo.
          </div>
        )}

        <div className="flex flex-wrap gap-3 mt-4">
          {kit.colours.map((c) => (
            <div key={c.hex} className="border border-line rounded-lg overflow-hidden" style={{ width: 168 }}>
              <div style={{ background: c.hex, height: 46 }} />
              <div className="px-3 py-2">
                <div className="text-xs font-semibold">{c.name}</div>
                <button onClick={() => navigator.clipboard?.writeText(c.hex)}
                        className="text-[11px] font-mono text-blue hover:underline">{c.hex}</button>
                <div className="text-[10.5px] text-faint leading-snug mt-0.5">{c.use}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── ready-made copy ────────────────────────────────────────────── */}
      <Card title="Ready-made copy"
            sub="Your link is already in each one. Edit them — they read better in your own voice.">
        <div className="flex flex-col gap-3">
          {kit.templates.map((t) => <Copy key={t.channel} title={t.channel} text={t.text} />)}
        </div>
      </Card>

      {/* ── AI drafting ────────────────────────────────────────────────── */}
      <Card title="Draft something new"
            sub={kit.ai_available
              ? `Written against the rules above. ${kit.ads_remaining} of ${kit.ads_limit} left today.`
              : "Not switched on for this account yet — the ready-made copy above needs nothing."}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">Channel</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}
                    className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue">
              {CHANNELS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              Your angle (optional)
            </span>
            <input value={angle} onChange={(e) => setAngle(e.target.value)}
                   placeholder="e.g. for first-home buyers who keep getting outbid"
                   className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue" />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">
              Tag it (optional) — so you can see how this one performs
            </span>
            <input value={campaign} onChange={(e) => setCampaign(e.target.value)}
                   placeholder="insta-reel-aug"
                   className="mt-1 w-full bg-white border border-line rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-blue" />
          </label>
          <div className="flex items-end">
            <button onClick={generate}
                    disabled={busy || !kit.ai_available || kit.ads_remaining <= 0}
                    className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 w-full"
                    style={{ background: "#1F6FEB" }}>
              {busy ? "Writing…" : "Write me three"}
            </button>
          </div>
        </div>

        {genErr && <div className="text-sm text-danger mt-3">{genErr}</div>}

        {drafts.length > 0 && (
          <div className="flex flex-col gap-3 mt-4">
            {drafts.map((d, i) => (
              <Copy key={i} title={d.hook || `${d.channel} — option ${i + 1}`} text={d.text} />
            ))}
            <div className="text-xs text-faint leading-relaxed">
              Drafts, not posts. Read them before they go anywhere — an AI will
              write a confident sentence that is not true, and your name is the
              one on the post.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

/**
 * One downloadable item.
 *
 * Images preview inline, which means fetching the bytes with the auth header
 * and handing the browser an object URL — a plain <img src> cannot carry a
 * bearer token, and the pack is behind the promoter gate on purpose so an
 * unreleased campaign image is not sitting on a public URL before it launches.
 */
function AssetCard({ asset }: { asset: Asset }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isImage = (asset.content_type || "").startsWith("image/");

  useEffect(() => {
    if (!isImage || !asset.downloadable) return;
    let url: string | null = null;
    let dead = false;
    (async () => {
      try {
        const res = await fetch(`/api/promoter/assets/${asset.id}/file`, {
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        });
        if (!res.ok || dead) return;
        url = URL.createObjectURL(await res.blob());
        setPreview(url);
      } catch { /* no thumbnail; the download button still works */ }
    })();
    return () => { dead = true; if (url) URL.revokeObjectURL(url); };
  }, [asset.id, asset.downloadable, isImage]);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/promoter/assets/${asset.id}/file`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.filename || asset.title;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(false); }
  }

  return (
    <div className="border border-line rounded-lg overflow-hidden flex flex-col">
      {preview && (
        <div className="bg-paper border-b border-line grid place-items-center" style={{ height: 150 }}>
          <img src={preview} alt="" style={{ maxHeight: 150, maxWidth: "100%", objectFit: "contain" }} />
        </div>
      )}
      <div className="px-3.5 py-3 flex-1 flex flex-col gap-1">
        <div className="text-sm font-semibold">{asset.title}</div>
        {asset.note && <div className="text-xs text-faint leading-snug">{asset.note}</div>}
        <div className="text-[11px] text-faint mt-0.5">
          {asset.kind}{asset.size_bytes ? ` · ${prettyBytes(asset.size_bytes)}` : ""}
        </div>
        <div className="mt-2">
          {asset.downloadable ? (
            <button onClick={download} disabled={busy}
                    className="text-xs font-semibold px-3 py-1.5 rounded-md border border-line hover:border-blue disabled:opacity-50"
                    style={{ color: "#1F6FEB" }}>
              {busy ? "Fetching…" : "Download"}
            </button>
          ) : asset.url ? (
            <a href={asset.url} target="_blank" rel="noreferrer"
               className="text-xs font-semibold px-3 py-1.5 rounded-md border border-line hover:border-blue inline-block"
               style={{ color: "#1F6FEB" }}>
              Open
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-5">
      <h2 className="font-display font-semibold text-sm">{title}</h2>
      {sub && <div className="text-xs text-muted mt-0.5 mb-3">{sub}</div>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </div>
  );
}

function Copy({ title, text }: { title: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-2 bg-paper border-b border-line">
        <span className="text-xs font-semibold flex-1">{title}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setDone(true);
              setTimeout(() => setDone(false), 2000);
            } catch { /* selectable on screen either way */ }
          }}
          className="text-xs font-semibold px-2.5 py-1 rounded-md"
          style={{ background: done ? "#0A8754" : "#fff", color: done ? "#fff" : "#1F6FEB",
                   border: `1px solid ${done ? "#0A8754" : "#D6DEE9"}` }}
        >
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="px-3.5 py-3 text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-ink">
        {text}
      </pre>
    </div>
  );
}
