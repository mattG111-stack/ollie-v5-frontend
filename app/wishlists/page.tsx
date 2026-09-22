"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

interface WishList {
  id: number;
  name: string;
  district: string | null;
  suburb: string | null;
  property_category: string | null;
  min_price: number | null;
  max_price: number | null;
  min_beds: number | null;
  underpriced_only: boolean;
  subdividable_only: boolean;
  max_dev_buy_price: number | null;
  match_count: number;
  new_count: number;
}

interface Match {
  id: number;
  address: string | null;
  suburb: string | null;
  district: string | null;
  property_type?: string | null;
  beds: number | null;
  baths: number | null;
  asking_price: number | null;
  fair_value: number | null;
  buy_price: number | null;
  margin: number | null;
  is_underpriced: boolean;
  is_subdividable: boolean;
  best_net_gain: number | null;
  max_addl_lots: number | null;
  days_on_market: number | null;
  image_url: string | null;
  is_new: boolean;
}

const DISTRICTS = [
  "Auckland City", "North Shore City", "Waitakere City", "Manukau City",
  "Rodney", "Franklin", "Papakura", "Waiheke Island", "Hauraki Gulf Islands",
];
const CATS = ["house", "townhouse", "apartment", "unit", "section", "lifestyle"];
const CAT_KEY: Record<string, string> = {
  house: "ptable.house", townhouse: "ptable.townhouse", apartment: "ptable.apartment",
  unit: "ptable.unit", section: "ptable.section", lifestyle: "ptable.lifestyle",
};
const PRICES: { v: number; label: string }[] = [
  { v: 750_000, label: "$750k" }, { v: 1_000_000, label: "$1M" }, { v: 1_500_000, label: "$1.5M" },
  { v: 2_000_000, label: "$2M" }, { v: 3_000_000, label: "$3M" }, { v: 5_000_000, label: "$5M" },
];

export default function WishlistsPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

const EMPTY = {
  name: "", district: "", property_category: "", min_beds: "", min_price: "", max_price: "",
  underpriced_only: false, subdividable_only: false, max_dev_buy_price: "",
};

function Inner() {
  const { t } = useT();
  const [lists, setLists] = useState<WishList[] | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);

  const load = useCallback(async () => {
    setLists(await api<WishList[]>("/api/wishlists"));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const num = (v: string) => (v ? Number(v) : null);
      await api("/api/wishlists", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          district: form.district || null,
          property_category: form.property_category || null,
          min_beds: form.min_beds ? Number(form.min_beds) : null,
          min_price: num(form.min_price),
          max_price: num(form.max_price),
          underpriced_only: form.underpriced_only,
          subdividable_only: form.subdividable_only,
          max_dev_buy_price: num(form.max_dev_buy_price),
        }),
      });
      setForm({ ...EMPTY });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    await api(`/api/wishlists/${id}`, { method: "DELETE" });
    if (openId === id) setOpenId(null);
    await load();
  }

  async function toggle(w: WishList) {
    if (openId === w.id) { setOpenId(null); return; }
    setOpenId(w.id);
    setMatches(await api<Match[]>(`/api/wishlists/${w.id}/matches`));
    if (w.new_count > 0) {
      await api(`/api/wishlists/${w.id}/seen`, { method: "POST" });
      load();
    }
  }

  return (
    <div className="px-7 py-6 max-w-5xl">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">{t("wish.title")}</h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">{t("wish.blurb")}</p>
      </div>

      {/* create */}
      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-6">
        <h2 className="font-display font-semibold text-sm mb-3">{t("wish.new")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input
            placeholder={t("wish.namePlaceholder")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 md:col-span-3 bg-paper border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
          />
          <Select value={form.district} onChange={(v) => setForm({ ...form, district: v })} placeholder={t("ptable.allAreas")}
            options={DISTRICTS.map((d) => ({ v: d, label: d }))} />
          <Select value={form.property_category} onChange={(v) => setForm({ ...form, property_category: v })} placeholder={t("ptable.allTypes")}
            options={CATS.map((c) => ({ v: c, label: t(CAT_KEY[c]) }))} />
          <Select value={form.min_beds} onChange={(v) => setForm({ ...form, min_beds: v })} placeholder={t("ptable.anyBeds")}
            options={[1, 2, 3, 4, 5].map((n) => ({ v: String(n), label: t("ptable.bedsPlus", { n }) }))} />
          <Select value={form.min_price} onChange={(v) => setForm({ ...form, min_price: v })} placeholder={t("wish.minPrice")}
            options={PRICES.map((p) => ({ v: String(p.v), label: `${t("wish.from")} ${p.label}` }))} />
          <Select value={form.max_price} onChange={(v) => setForm({ ...form, max_price: v })} placeholder={t("wish.maxPrice")}
            options={PRICES.map((p) => ({ v: String(p.v), label: t("ptable.underPrice", { v: p.label }) }))} />
          <Select value={form.max_dev_buy_price} onChange={(v) => setForm({ ...form, max_dev_buy_price: v })} placeholder={t("wish.devBudget")}
            options={PRICES.map((p) => ({ v: String(p.v), label: t("ptable.underPrice", { v: p.label }) }))} />
        </div>
        <div className="flex flex-wrap items-center gap-4 mt-3">
          <Check label={t("ptable.underpriced")} checked={form.underpriced_only} onChange={(b) => setForm({ ...form, underpriced_only: b })} />
          <Check label={t("nav.subdividable")} checked={form.subdividable_only} onChange={(b) => setForm({ ...form, subdividable_only: b })} />
          <button
            onClick={create}
            disabled={!form.name.trim() || saving}
            className="ml-auto bg-blue text-white hover:bg-blue-dark disabled:opacity-40 px-5 py-2 rounded-lg font-semibold text-sm"
          >
            {saving ? "…" : t("wish.create")}
          </button>
        </div>
      </div>

      {/* list */}
      {lists && lists.length === 0 && (
        <div className="text-sm text-muted">{t("wish.empty")}</div>
      )}
      <div className="grid gap-3">
        {lists?.map((w) => (
          <div key={w.id} className="bg-white border border-line rounded-card shadow-soft overflow-hidden">
            <div className="p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-semibold">{w.name}</span>
                  {w.new_count > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-under/15 text-under">
                      {t("wish.newBadge", { n: w.new_count })}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted mt-1">{summary(w, t)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-display text-xl font-bold tnum">{(w.match_count ?? 0).toLocaleString()}</div>
                <div className="text-[10px] uppercase tracking-wide text-faint">{t("wish.matchesLabel")}</div>
              </div>
              <button onClick={() => toggle(w)} className="text-xs font-semibold text-blue hover:text-blue-dark px-3 py-2 border border-line rounded-lg">
                {openId === w.id ? t("wish.hide") : t("wish.view")}
              </button>
              <button onClick={() => remove(w.id)} className="text-xs text-muted hover:text-danger px-2 py-2" title={t("wish.delete")}>✕</button>
            </div>
            {openId === w.id && (
              <div className="border-t border-line2 divide-y divide-line2">
                {matches.length === 0 && <div className="px-5 py-4 text-sm text-muted">{t("wish.noMatches")}</div>}
                {matches.map((m) => (
                  <Link key={m.id} href={`/property/${m.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-paper transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {m.is_new && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-under text-white">{t("wish.newTag")}</span>}
                        <span className="font-display font-semibold text-sm truncate">{m.address}</span>
                      </div>
                      <div className="text-[11px] text-faint">{m.suburb} · {m.beds ?? "—"} bd</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="text-muted">{fmtMoneyShort(m.asking_price)} <span className="text-faint">→</span> <span className="font-semibold">{fmtMoneyShort(m.fair_value)}</span></div>
                      <div className="text-under font-semibold">{m.margin != null ? `${m.margin > 0 ? "+" : ""}${(m.margin * 100).toFixed(1)}%` : (m.is_subdividable ? `+${(m.max_addl_lots ?? 0).toFixed(0)} lots` : "")}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function summary(w: WishList, t: (k: string, v?: Record<string, string | number>) => string) {
  const parts: string[] = [];
  if (w.district) parts.push(w.district);
  if (w.property_category) parts.push(t(`ptable.${w.property_category}`));
  if (w.min_beds) parts.push(t("ptable.bedsPlus", { n: w.min_beds }));
  if (w.max_price) parts.push(t("ptable.underPrice", { v: fmtMoneyShort(w.max_price) }));
  if (w.underpriced_only) parts.push(t("ptable.underpriced"));
  if (w.subdividable_only) parts.push(t("nav.subdividable"));
  if (w.max_dev_buy_price) parts.push(`${t("wish.devBudget")} ${fmtMoneyShort(w.max_dev_buy_price)}`);
  return parts.join(" · ") || t("wish.anyListing");
}

function Select({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: { v: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="bg-paper border border-line rounded-lg px-3 py-2 text-sm text-muted focus:outline-none focus:border-blue cursor-pointer">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue w-4 h-4" />
      {label}
    </label>
  );
}
