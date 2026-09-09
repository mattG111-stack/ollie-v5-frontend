"use client";

/**
 * Who our customers are — built from what they tell Ollie they're hunting.
 *
 * Counts only. Deliberately no names, no emails, no per-person row: a page
 * that lists who wants what invites being used as a prospect list, while one
 * that reports demand against supply can only be used to decide what to build.
 *
 * The number worth acting on is at the bottom — the suburbs people are watching
 * that we barely cover. That is the next region to ingest.
 */

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { C, Card, MONO } from "@/components/apex";
import { CustomerIntel, api } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";

const VERDICT: Record<string, { label: string; color: string }> = {
  covered: { label: "well covered", color: "#0A8754" },
  thin: { label: "thin", color: "#D4503E" },
  over_supplied: { label: "over-supplied", color: "#5A6B82" },
};

export default function AdminCustomersPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const [d, setD] = useState<CustomerIntel | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<CustomerIntel>("/api/admin/customer-intel")
      .then(setD)
      .catch((e) => setErr(e?.detail || "Could not load"));
  }, []);

  if (err) {
    return (
      <div style={{ padding: "34px 40px" }}>
        <Card><div style={{ color: C.danger }}>{err}</div></Card>
      </div>
    );
  }
  if (!d) {
    return <div style={{ padding: "34px 40px", color: C.label }}>Loading…</div>;
  }

  const peakWatchers = Math.max(1, ...d.areas.map((a) => a.watchers));
  const peakListings = Math.max(1, ...d.areas.map((a) => a.listings));
  const peakGoal = Math.max(1, ...d.goals.map((g) => g.count));

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 1180, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-.035em", margin: 0, color: C.ink }}>
            Who our customers are
          </h1>
          <p style={{ fontSize: 14, color: C.label, margin: "7px 0 0" }}>
            Built from what people tell Ollie they&rsquo;re hunting. No names on this page.
          </p>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.mono, fontWeight: 600 }}>
          {new Date(d.generated_at).toLocaleDateString("en-NZ", {
            day: "numeric", month: "long", year: "numeric",
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginTop: 22 }}>
        <Tile label="TOLD US WHAT THEY WANT" value={d.answered.toLocaleString()}
              sub={`of ${d.customers.toLocaleString()} customers · ${d.answered_pct != null ? `${d.answered_pct.toFixed(0)}%` : "—"}`} />
        <Tile label="MEDIAN TOP BUDGET" value={fmtMoneyShort(d.median_max_price)}
              sub={d.median_min_price != null ? `from ${fmtMoneyShort(d.median_min_price)}` : "no floor given"} />
        <Tile label="BEEN THROUGH A CHECK-IN" value={d.changed_at_review.toLocaleString()}
              sub="came back and re-stated it" />
        <Tile label="ASKED FOR, NOT STOCKED" value={String(d.gap_suburbs.length)}
              sub="suburbs with demand, no coverage"
              tone={d.gap_suburbs.length ? C.danger : undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 14, marginTop: 14, alignItems: "start" }}>
        <Card>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".2em", color: C.mono, fontWeight: 600 }}>
            WHAT THEY&rsquo;RE HUNTING
          </div>
          {d.goals.map((g) => (
            <div key={g.key} style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: C.ink }}>{g.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: C.ink }}>{g.count}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: C.divider, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${(g.count / peakGoal) * 100}%`, height: 8, borderRadius: 4, background: C.ink }} />
              </div>
            </div>
          ))}
          {d.top_pair && (
            <>
              <div style={{ height: 1, background: C.divider, margin: "20px 0 0" }} />
              <div style={{ fontSize: 13, color: C.label, lineHeight: 1.5, marginTop: 14 }}>
                The pair that shows up most is{" "}
                <strong style={{ color: C.ink, fontWeight: 700 }}>{d.top_pair.labels.join(" + ")}</strong>{" "}
                — {d.top_pair.count} {d.top_pair.count === 1 ? "person" : "people"}.
              </div>
            </>
          )}
          {d.answered > d.with_criteria && (
            <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5, marginTop: 12 }}>
              {d.answered - d.with_criteria} answered &ldquo;just show me everything&rdquo;.
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".2em", color: C.mono, fontWeight: 600 }}>
            WHERE THEY WANT IT — AGAINST WHAT WE HOLD
          </div>

          {d.areas.length === 0 && (
            <div style={{ fontSize: 14, color: C.label, marginTop: 16 }}>
              Nobody has named an area yet.
            </div>
          )}

          {d.areas.map((a, i) => {
            const v = VERDICT[a.verdict] ?? VERDICT.covered;
            return (
              <div key={a.suburb}>
                {i > 0 && <div style={{ height: 1, background: C.divider }} />}
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0" }}>
                  <div style={{ width: 150, flexShrink: 0, fontSize: 14.5, fontWeight: 700, color: C.ink }}>
                    {a.suburb}
                  </div>
                  <div style={{ flexGrow: 1, minWidth: 60 }}>
                    <Bar pct={(a.watchers / peakWatchers) * 100} color={C.ink} />
                    <div style={{ height: 5 }} />
                    <Bar pct={(a.listings / peakListings) * 100}
                         color={a.verdict === "thin" ? "#D4503E" : "#B7C3D2"} />
                  </div>
                  <div style={{ width: 100, flexShrink: 0, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: v.color }}>
                    {v.label}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ display: "flex", alignItems: "center", gap: 20, paddingTop: 8 }}>
            <Key color={C.ink} label="people asking" />
            <Key color="#B7C3D2" label="listings we hold" />
          </div>

          {d.gap_suburbs.length > 0 && (
            <div style={{ background: "#FDF3F1", border: "1px solid #F3D8D2", borderRadius: 13, padding: "14px 16px", marginTop: 18, fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>
              <strong style={{ fontWeight: 800 }}>Act on this:</strong>{" "}
              {d.gap_watchers} {d.gap_watchers === 1 ? "person is" : "people are"} watching{" "}
              {d.gap_suburbs.join(", ")} and we barely cover{" "}
              {d.gap_suburbs.length === 1 ? "it" : "them"}. That is the next area to load.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub: string; tone?: string;
}) {
  return (
    <Card>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: ".2em", color: C.mono, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-.045em", color: tone ?? C.ink, marginTop: 8, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: C.label, marginTop: 7 }}>{sub}</div>
    </Card>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 7, borderRadius: 4, background: C.divider, overflow: "hidden" }}>
      <div style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: 7, borderRadius: 4, background: color }} />
    </div>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ width: 16, height: 7, borderRadius: 4, background: color }} />
      <span style={{ fontSize: 12, color: C.label }}>{label}</span>
    </div>
  );
}
