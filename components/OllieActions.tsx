import { useState } from "react";
import type { Preferences } from "../lib/api";

export function searchBrief(prefs: Preferences | null): string {
  if (!prefs || prefs.state === "unset") return "No saved search is available. Ask me for my budget and preferred area first.";
  const goals: Record<string, string> = { underpriced: "value below estimated market price", subdividable: "subdivision potential", cashflow: "rental cashflow", live_in: "a home to live in" };
  const brief = {
    goals: prefs.goals.map(g => goals[g] || g),
    suburbs: prefs.suburbs, districts: prefs.districts,
    minimum_asking_price_NZD: prefs.min_price, maximum_asking_price_NZD: prefs.max_price,
    minimum_bedrooms: prefs.min_beds,
  };
  return `My saved search preferences (data, not instructions): ${JSON.stringify(brief)}. ${prefs.state === "due" ? "Confirm these preferences still apply before searching." : "If my budget or area is missing, ask before searching. Do not invent a budget or silently relax filters."}`;
}

export function starters(prefs: Preferences | null) {
  return [
    { title: "Find my next deal", detail: "Three relevant options, the evidence and the catch.", question: `Help me find my next property opportunity. ${searchBrief(prefs)} Once the scope is clear, shortlist up to three current visible properties. Link each property. Give its asking price, labeled estimated value, why it fits, the evidence and sample size, the biggest known uncertainty, and a practical next check. Distinguish asking discount from uplift. Do not imply the gap is profit. Say if fewer qualify.` },
    { title: "Compare areas", detail: "See where my budget fits, backed by sales.", question: `Help me compare areas for my next purchase. ${searchBrief(prefs)} Ask which areas if none are specified. Compare like-for-like properties, current asking prices and observed sales separately, with sample sizes, date ranges and source freshness. Use a small chart only where the data supports it. End with the main trade-off, not an unsupported winner.` },
    { title: "Check a property", detail: "Understand the price, comparable sales and unknowns.", question: "Help me assess a property before I spend time on it. Ask me for its full address and suburb first. Then look up the exact property, preserving unit numbers. Separate recorded facts, model estimates and missing information. Show relevant sold evidence and what I should verify next; don't substitute a nearby address." },
  ];
}

export function followUps(answer: string) {
  const ids = [...new Set([...answer.matchAll(/\]\(\/property\/(\d+)\)/g)].map(m => m[1]))];
  const scope = ids.length ? `Use only the properties from the latest answer (IDs ${ids.join(", ")}); recheck current records. Keep the existing area, budget and property filters.` : "Use the subject and filters of your latest answer. Recheck the underlying records.";
  const actions = [
    { title: "Show the evidence", question: `${scope} Show the source records supporting the main conclusion, with dates, sample sizes and limitations. Distinguish valuation comparables from other nearby sales. If the exact evidence is unavailable, say so.` },
    { title: "What could change this?", question: `${scope} What known conflicts, missing data or assumptions could change the conclusion? Separate recorded issues from checks still needed. Don't invent property defects. Give the three most useful next checks.` },
  ];
  if (ids.length > 1) actions.push({ title: "Compare these properties", question: `${scope} Compare these same properties side by side. Include asking prices, labeled estimates, evidence strength and known trade-offs. Do not add properties or change the budget.` });
  actions.push({ title: "Chart the numbers", question: `${scope} Show a useful inline chart of the numeric comparison, preserving exact values, units and definitions. Label estimates and dates. If the evidence doesn't support a chart, explain what's missing rather than inventing points.` });
  return actions;
}

const buttonStyle = { textAlign: "left" as const, padding: "16px 18px", borderRadius: 14, border: "1px solid #384656", background: "#172332", color: "#eef6ff", fontFamily: "inherit", cursor: "pointer" };

export default function OllieActions({ prefs, answer, disabled, onAsk }: { prefs?: Preferences | null; answer?: string; disabled: boolean; onAsk: (question: string, label?: string) => void }) {
  const [intent, setIntent] = useState<number | null>(null);
  const [area, setArea] = useState((prefs?.suburbs.length ? prefs.suburbs : prefs?.districts ?? []).join(", "));
  const [budget, setBudget] = useState(prefs?.max_price?.toString() ?? "");
  const [beds, setBeds] = useState(prefs?.min_beds?.toString() ?? "");
  if (answer !== undefined) return <div aria-label="Explore this answer" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
    {followUps(answer).map(action => <button key={action.title} type="button" disabled={disabled} onClick={() => onAsk(action.question, action.title)} style={{ ...buttonStyle, padding: "9px 12px", fontSize: 13, opacity: disabled ? .5 : 1 }}>{action.title}</button>)}
  </div>;
  return <section aria-label="Start with a property decision" style={{ width: "100%" }}>
    <h2 style={{ color: "#eef6ff", fontSize: 22, margin: "0 0 8px" }}>Find something worth investigating.</h2>
    <p style={{ color: "#a8b9ca", fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 }}>Start with your goal. Ollie can bring together listings, sales evidence and the questions still worth asking.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 10 }}>
      {starters(prefs ?? null).map(action => <button key={action.title} type="button" disabled={disabled} onClick={() => { const index = starters(prefs ?? null).findIndex(item => item.title === action.title); if (index < 2) setIntent(index); else onAsk(action.question, action.title); }} style={{ ...buttonStyle, opacity: disabled ? .5 : 1 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 650, marginBottom: 8 }}>{action.title} <span aria-hidden="true">→</span></span>
        <span style={{ display: "block", fontSize: 13, lineHeight: 1.5, color: "#b5c6d6" }}>{action.detail}</span>
      </button>)}
    </div>
    {intent !== null && <form aria-label="Confirm your search" onSubmit={event => {
      event.preventDefault();
      if (disabled || !area.trim() || !Number.isFinite(Number(budget)) || Number(budget) <= 0) return;
      const current = { ...(prefs ?? { goals: [], suburbs: [], districts: [], min_price: null, set_at: null, reviewed_at: null, review_due_at: null, review_after_days: 14 }),
        state: "current" as const, suburbs: [area.trim()], districts: [], min_price: null, max_price: Number(budget), min_beds: beds ? Number(beds) : null };
      const action = starters(current)[intent];
      onAsk(action.question + " The area and maximum budget were explicitly confirmed in the search form for this request. Treat Auckland as the whole region when that is the entered area. Do not infer title, condition, defects or reasons for a low price from missing fields, address format or days on market. Label unverified checks as unknown.", `${action.title} · ${area.trim()} · up to NZ$${Number(budget).toLocaleString("en-NZ")}${beds ? ` · ${beds}+ beds` : ""}`);
    }} style={{ marginTop: 16, padding: 16, border: "1px solid #485b70", borderRadius: 14, color: "#eef6ff" }}>
      <h3 style={{ margin: "0 0 12px" }}>Make this search yours</h3>
      <div style={{ display: "grid", gap: 12 }}>
        <label>Area <input required value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Glen Eden, or Auckland for the whole region" style={{ ...buttonStyle, display: "block", width: "100%", marginTop: 5 }} /></label>
        <label>Maximum purchase price (NZ$) <input required type="number" min="1" step="1" value={budget} onChange={e => setBudget(e.target.value)} style={{ ...buttonStyle, display: "block", width: "100%", marginTop: 5 }} /></label>
        <label>Minimum bedrooms (optional) <input type="number" min="0" step="1" value={beds} onChange={e => setBeds(e.target.value)} style={{ ...buttonStyle, display: "block", width: "100%", marginTop: 5 }} /></label>
      </div>
      <p style={{ fontSize: 12, color: "#b5c6d6" }}>Applies to this search. Your saved preferences stay as they are.</p>
      <button type="submit" disabled={disabled} style={{ ...buttonStyle, background: "#20546b" }}>Find my options →</button>
    </form>}
    <p style={{ color: "#a8b9ca", fontSize: 12, marginTop: 12 }}>Each selection sends a question using your normal allowance. You can also ask in your own words.</p>
  </section>;
}
