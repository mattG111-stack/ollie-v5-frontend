"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
type Memory = { enabled: boolean; property_count: number; areas: {suburb: string; properties: number}[] };
export default function InterestMemorySettings() {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { api<Memory>("/api/activity/interests").then(setMemory).catch(() => setMessage("Could not load your interest settings. Please reload to retry.")); }, []);
  async function update(enabled: boolean) {
    setBusy(true); setMessage("");
    try { setMemory(await api<Memory>("/api/activity/interests", {method: "PUT", body: JSON.stringify({enabled}), headers: {"Content-Type":"application/json"}})); setMessage(enabled ? "Property interest memory is on." : "Memory is off and your browsing interests have been cleared."); }
    catch { setMessage("Could not save that change. Please try again."); }
    finally { setBusy(false); }
  }
  async function clear() {
    setBusy(true); setMessage("");
    try { await api("/api/activity/interests", {method:"DELETE"}); setMemory(m => m ? {...m, property_count:0, areas:[]} : m); setMessage("Browsing interests cleared. Future views can be remembered while this setting is on."); }
    catch { setMessage("Could not clear your interests. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="bg-white border border-line rounded-card shadow-soft p-6 mb-5">
    <h2 className="font-display font-semibold text-base mb-3">Ollie’s memory</h2>
    <label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={memory?.enabled ?? false} disabled={!memory || busy} onChange={e => void update(e.target.checked)} />Remember my property interests</label>
    <p className="text-sm text-muted mt-3">When on, Apex remembers up to 100 property records you open. Ollie uses views from the last 30 days to suggest areas you may like, and asks before changing your search. Your stated budget and must-haves stay in control.</p>
    <p className="text-sm text-muted mt-2">Turning this off clears browsing interests. It does not delete saved preferences, wish lists or previous Ollie conversations.</p>
    {memory && <p className="text-sm mt-3">{memory.property_count} recent property records remembered{memory.areas.length ? ` · Areas explored: ${memory.areas.map(a => a.suburb).join(", ")}` : ""}</p>}
    <button className="border border-line rounded-lg px-4 py-2 text-sm mt-3 disabled:opacity-50" disabled={busy || !memory?.property_count} onClick={() => void clear()}>Clear browsing interests</button>
    <p role="status" className="text-sm mt-2">{message}</p>
  </section>;
}
