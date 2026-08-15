"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

/* Type-ahead suburb filter. Auckland has hundreds of suburbs, so a dropdown of
 * them all is unusable — instead the user types and picks from live suggestions
 * (the /suggest endpoint, suburbs only). The picked value is the EXACT suburb
 * name, which the list API filters on exactly (PropertyForSale.suburb == value).
 * Reused across the deal-finder filter bars and the auctions lane. */

type Suggestion = { kind: string; label: string; sub?: string | null; id?: number | null };

export default function SuburbFilter({
  value, onChange, region = "Auckland", width = 190,
}: { value: string; onChange: (v: string) => void; region?: string; width?: number }) {
  const { t } = useT();
  const [term, setTerm] = useState(value);
  const [opts, setOpts] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Keep the visible text in sync when the value is cleared/changed externally.
  useEffect(() => { setTerm(value); }, [value]);

  // Debounced suggest fetch (suburbs only).
  useEffect(() => {
    const q = term.trim();
    if (q.length < 2 || q === value) { setOpts([]); return; }
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const r = await api<Suggestion[]>(
          `/api/properties/suggest?q=${encodeURIComponent(q)}&region=${encodeURIComponent(region)}`);
        if (!alive) return;
        setOpts(r.filter((s) => s.kind === "suburb").map((s) => s.label).slice(0, 8));
        setHi(0);
      } catch { if (alive) setOpts([]); }
    }, 180);
    return () => { alive = false; clearTimeout(id); };
  }, [term, region, value]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: string) => { onChange(s); setTerm(s); setOpen(false); setOpts([]); };
  const clear = () => { onChange(""); setTerm(""); setOpts([]); setOpen(false); };

  return (
    <div ref={boxRef} style={{ position: "relative", width }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #E4E9F0", borderRadius: 11, padding: "10px 12px" }}>
        <input
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !opts.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, opts.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); pick(opts[hi]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={t("filter.suburbPlaceholder")}
          style={{ border: "none", outline: "none", background: "transparent", fontFamily: "inherit", fontSize: 14, color: "#5A6B82", width: "100%", minWidth: 0 }}
        />
        {value && (
          <button onClick={clear} aria-label={t("filter.clearSuburb")}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9AA6B6", fontSize: 16, lineHeight: 1, padding: 0, flex: "none" }}>×</button>
        )}
      </div>
      {open && opts.length > 0 && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1px solid #E4E9F0", borderRadius: 11, boxShadow: "0 8px 24px rgba(16,24,40,.12)", overflow: "hidden" }}>
          {opts.map((s, i) => (
            <button key={s} onMouseDown={(e) => { e.preventDefault(); pick(s); }} onMouseEnter={() => setHi(i)}
              style={{ display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                background: i === hi ? "#F1F5FB" : "#fff", padding: "9px 13px", fontSize: 14, color: "#14233A" }}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
