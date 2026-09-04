"use client";

/**
 * What are you hunting? — asked inside Ollie, never at signup.
 *
 * Nobody is stopped at the door. They sign up, they get in, and the first time
 * they open Ollie he asks — in his own voice, in the conversation — what he
 * should be looking for. Every answer is a tap; there is always "tell me in
 * your own words" and always "skip, show me everything".
 *
 * Three things make this worth building rather than a settings form:
 *
 *   The reward for answering is the answer. Step three is not "you're all set"
 *   with a tick — it is their market, narrowed to them, with the best listing
 *   already on screen. A wizard that ends in a confirmation screen teaches
 *   people that answering questions costs them time and gives nothing back.
 *
 *   The counts are real, and they come from the same visibility rule as the
 *   listing pages. A suburb chip that says 184 means 184 rows the customer can
 *   actually open. Quoting a number they then cannot find is worse than
 *   quoting none.
 *
 *   It is stored against the user, not as a saved search they have to remember
 *   to create — which is why we knew nothing about our customers before.
 *
 * Dark on purpose. This is Ollie's own space inside a light app, and the shift
 * is the signal that he is talking rather than the page.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PreferencePreview,
  PreferenceOptions,
  Preferences,
  api,
} from "@/lib/api";
import { D } from "@/components/apex";
import { fmtMoneyShort } from "@/lib/format";
import { useT } from "@/lib/i18n";

// The four things people actually come here for. Keys match app/preferences.py
// — the backend refuses anything else, so a fifth added here alone would be
// silently dropped rather than half-working.
const GOALS = [
  { key: "underpriced", accent: "#3DDC97", tint: "rgba(61,220,151,", ink: "#05221A" },
  { key: "subdividable", accent: "#FF7A45", tint: "rgba(255,122,69,", ink: "#200A00" },
  { key: "cashflow", accent: "#46C6F5", tint: "rgba(70,198,245,", ink: "#06121F" },
  { key: "live_in", accent: "#B9C8DC", tint: "rgba(185,200,220,", ink: "#0A1120" },
] as const;

// One dark for the whole product — see D in components/apex.tsx. These were a
// blue-black of their own, which read as a different app the moment the panel
// sat next to the navigation rail.
const CYAN = D.accent;
const DIM = D.dim;
const FAINT = D.faint;
const LINE = D.line;
const PANEL = D.panel;
const SKY = `radial-gradient(120% 52% at 50% 0%, ${D.lift} 0%, ${D.ground} 48%, ${D.ground} 100%)`;

/** How many suburb chips before the rest hide behind "more". */
const CHIPS_SHOWN = 12;

// A placeholder we substitute for the count, then split the finished sentence
// on. Colouring the number by chopping the first word off the string would
// only work in a language that puts it first — "今早有 9 套" does not.
const MARK = "\u0000";

function Counted({ text, value }: { text: string; value: string }) {
  const [before, after] = text.split(MARK);
  if (after === undefined) return <>{text}</>;
  return (
    <>
      {before}
      <span style={{ color: "#3DDC97" }}>{value}</span>
      {after}
    </>
  );
}

export interface HuntProps {
  prefs: Preferences;
  /** Called once the customer is through — with what they chose, so the page
   *  can lead with it immediately rather than refetching. */
  onDone: (saved: Preferences) => void;
  /** "Skip" and "carry on" both land here: nothing stored, nothing filtered. */
  onDismiss: () => void;
}

export default function OllieHunt({ prefs, onDone, onDismiss }: HuntProps) {
  // "due" means we already know what they said and are only checking it still
  // holds — so that starts on the check-in card, not on question one.
  const [step, setStep] = useState<"checkin" | "goals" | "where" | "ready">(
    prefs.state === "due" ? "checkin" : "goals",
  );
  const [goals, setGoals] = useState<string[]>(prefs.goals ?? []);
  const [suburbs, setSuburbs] = useState<string[]>(prefs.suburbs ?? []);
  const [minPrice, setMinPrice] = useState<number | null>(prefs.min_price);
  const [maxPrice, setMaxPrice] = useState<number | null>(prefs.max_price);
  const [minBeds, setMinBeds] = useState<number | null>(prefs.min_beds);
  const [options, setOptions] = useState<PreferenceOptions | null>(null);
  const [preview, setPreview] = useState<PreferencePreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const criteria = useMemo(
    () => ({
      goals,
      suburbs,
      districts: [],
      min_price: minPrice,
      max_price: maxPrice,
      min_beds: minBeds,
    }),
    [goals, suburbs, minPrice, maxPrice, minBeds],
  );

  useEffect(() => {
    api<PreferenceOptions>("/api/preferences/options")
      .then(setOptions)
      .catch(() => null);
  }, []);

  // Re-count as they choose, so the running total under the slider is the real
  // one. Debounced: dragging a slider should not be one request per pixel.
  useEffect(() => {
    if (step !== "where") return;
    const id = setTimeout(() => {
      api<PreferencePreview>("/api/preferences/preview", {
        method: "POST",
        body: JSON.stringify(criteria),
      })
        .then(setPreview)
        .catch(() => null);
    }, 260);
    return () => clearTimeout(id);
  }, [criteria, step]);

  const save = useCallback(async () => {
    setSaving(true);
    setFailed(null);
    try {
      // Count and store in one go. The preview is what step three shows, and
      // it has to describe what was actually saved — asking twice invites the
      // two to disagree.
      const [saved, shown] = await Promise.all([
        api<Preferences>("/api/preferences", {
          method: "PUT",
          body: JSON.stringify(criteria),
        }),
        api<PreferencePreview>("/api/preferences/preview", {
          method: "POST",
          body: JSON.stringify(criteria),
        }),
      ]);
      setPreview(shown);
      setStep("ready");
      // Handed up so the page can lead with it — but the flow stays on screen
      // until they choose to leave it.
      onDone(saved);
    } catch (e: any) {
      setFailed(e?.detail || "That didn't save. Try again?");
    } finally {
      setSaving(false);
    }
  }, [criteria, onDone]);

  const answer = useCallback(
    async (path: string) => {
      setSaving(true);
      setFailed(null);
      try {
        await api<Preferences>(path, { method: "POST" });
        onDismiss();
      } catch (e: any) {
        setFailed(e?.detail || "That didn't save. Try again?");
      } finally {
        setSaving(false);
      }
    },
    [onDismiss],
  );

  return (
    <div
      style={{
        background: SKY,
        borderRadius: 22,
        color: "#E8EDF5",
        padding: "30px 30px 34px",
        maxWidth: 760,
        boxShadow: "0 24px 60px -30px rgba(7,11,20,.7)",
      }}
    >
      <style>{`@keyframes ollieBreathe{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.2)}}`}</style>

      {step === "checkin" && (
        <CheckIn
          prefs={prefs}
          busy={saving}
          onConfirm={() => answer("/api/preferences/confirm")}
          onSnooze={() => answer("/api/preferences/snooze")}
          onEdit={() => setStep("goals")}
        />
      )}

      {step === "goals" && (
        <Goals
          selected={goals}
          onToggle={(k) =>
            setGoals((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]))
          }
          onNext={() => setStep("where")}
          onSkip={() => answer("/api/preferences/skip")}
          busy={saving}
        />
      )}

      {step === "where" && (
        <Where
          options={options}
          suburbs={suburbs}
          onToggleSuburb={(s) =>
            setSuburbs((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))
          }
          minPrice={minPrice}
          maxPrice={maxPrice}
          minBeds={minBeds}
          setMinPrice={setMinPrice}
          setMaxPrice={setMaxPrice}
          setMinBeds={setMinBeds}
          preview={preview}
          onBack={() => setStep("goals")}
          onDone={save}
          busy={saving}
        />
      )}

      {step === "ready" && (
        <Ready
          preview={preview}
          criteria={criteria}
          onFinish={onDismiss}
          onChange={() => setStep("goals")}
        />
      )}

      {failed && (
        <div style={{ marginTop: 16, fontSize: 13.5, color: "#FF9A6E" }}>{failed}</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- step one */

function Goals({
  selected, onToggle, onNext, onSkip, busy,
}: {
  selected: string[];
  onToggle: (k: string) => void;
  onNext: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const { t } = useT();
  return (
    <>
      <Eyebrow>{t("hunt.eyebrow")}</Eyebrow>
      <Heading>{t("hunt.title")}</Heading>
      <Lede>{t("hunt.intro")}</Lede>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
        {GOALS.map((g) => {
          const on = selected.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onToggle(g.key)}
              aria-pressed={on}
              style={{
                textAlign: "left",
                cursor: "pointer",
                fontFamily: "inherit",
                borderRadius: 16,
                padding: on ? 1 : 0,
                border: on ? "none" : `1px solid ${LINE}`,
                background: on
                  ? `linear-gradient(140deg, ${g.tint}.85), ${g.tint}.14))`
                  : PANEL,
              }}
            >
              <div
                style={{
                  borderRadius: 15,
                  background: on ? `linear-gradient(160deg, #0E1E2C 0%, #0A1522 100%)` : "transparent",
                  padding: "15px 16px",
                  display: "flex",
                  gap: 13,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                    background: on ? `${g.tint}.14)` : "rgba(126,154,192,.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <GoalIcon which={g.key} color={on ? g.accent : DIM} />
                </div>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-.02em", color: on ? "#FFFFFF" : "#E8EDF5" }}>
                    {t(`hunt.goal.${g.key}`)}
                  </div>
                  <div style={{ fontSize: 13, color: DIM, lineHeight: 1.35, marginTop: 2 }}>
                    {t(`hunt.goal.${g.key}.sub`)}
                  </div>
                </div>
                <Tick on={on} accent={g.accent} ink={g.ink} />
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 24 }}>
        <Primary onClick={onNext} disabled={busy}>{t("hunt.next")}</Primary>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Quiet onClick={onSkip} disabled={busy}>{t("hunt.skip")}</Quiet>
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- step two */

function Where({
  options, suburbs, onToggleSuburb, minPrice, maxPrice, minBeds,
  setMinPrice, setMaxPrice, setMinBeds, preview, onBack, onDone, busy,
}: {
  options: PreferenceOptions | null;
  suburbs: string[];
  onToggleSuburb: (s: string) => void;
  minPrice: number | null;
  maxPrice: number | null;
  minBeds: number | null;
  setMinPrice: (v: number | null) => void;
  setMaxPrice: (v: number | null) => void;
  setMinBeds: (v: number | null) => void;
  preview: PreferencePreview | null;
  onBack: () => void;
  onDone: () => void;
  busy: boolean;
}) {
  const { t } = useT();
  const [showAll, setShowAll] = useState(false);

  const edges = options?.price_bucket_edges ?? [];
  // The slider runs over the real market, not a made-up 0–5m. Falls back to a
  // sane range before the options land so the control is never dead.
  const lo = edges.length ? Math.round(edges[0] / 10_000) * 10_000 : 300_000;
  const hi = edges.length
    ? Math.round(edges[edges.length - 1] / 10_000) * 10_000
    : 3_000_000;
  const from = minPrice ?? lo;
  const to = maxPrice ?? hi;
  const span = Math.max(1, hi - lo);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));

  const chips = options?.suburbs ?? [];
  const shown = showAll ? chips : chips.slice(0, CHIPS_SHOWN);
  const peak = Math.max(1, ...(options?.price_buckets ?? [1]));

  return (
    <>
      {suburbs.length === 0 && <Eyebrow>{t("hunt.eyebrow")}</Eyebrow>}
      <Heading>{t("hunt.whereTitle")}</Heading>
      <Lede>{t("hunt.whereIntro")}</Lede>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 9, marginTop: 20 }}>
        {shown.map((s) => {
          const on = suburbs.includes(s.suburb);
          return (
            <button
              key={s.suburb}
              type="button"
              onClick={() => onToggleSuburb(s.suburb)}
              aria-pressed={on}
              style={{
                cursor: "pointer", fontFamily: "inherit",
                borderRadius: 13, padding: on ? "11px 14px" : "10px 13px",
                border: on ? `1px solid ${CYAN}` : `1px solid ${LINE}`,
                background: on ? "#0E2233" : PANEL,
                display: "flex", alignItems: "baseline", gap: 8,
              }}
            >
              <span style={{ fontSize: 14.5, fontWeight: 700, color: on ? "#FFFFFF" : "#B9C8DC" }}>
                {s.suburb}
              </span>
              {/* What we actually hold there. An empty area can never be picked
                  in silence, and a busy one advertises itself. */}
              <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? CYAN : FAINT }}>
                {s.count}
              </span>
            </button>
          );
        })}
        {!showAll && chips.length > CHIPS_SHOWN && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            style={{
              cursor: "pointer", fontFamily: "inherit", borderRadius: 13,
              padding: "10px 13px", border: `1px dashed ${LINE}`,
              background: "transparent", fontSize: 14.5, fontWeight: 700, color: DIM,
            }}
          >
            + {chips.length - CHIPS_SHOWN} more
          </button>
        )}
      </div>

      <div style={{ marginTop: 28 }}>
        <Eyebrow>{t("hunt.budget")}</Eyebrow>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
          <Big>{fmtMoneyShort(from)}</Big>
          <span style={{ fontSize: 17, fontWeight: 700, color: FAINT }}>—</span>
          <Big>{fmtMoneyShort(to)}</Big>
        </div>

        {/* The range sits on the real distribution, so the choice is informed
            rather than a shot in the dark. */}
        <div style={{ marginTop: 16, display: "flex", alignItems: "flex-end", gap: 3, height: 46 }}>
          {(options?.price_buckets ?? []).map((n, i) => {
            const inRange =
              edges.length > i + 1 && edges[i + 1] >= from && edges[i] <= to;
            return (
              <div
                key={i}
                style={{
                  flexGrow: 1,
                  height: Math.max(4, (n / peak) * 46),
                  borderRadius: 2,
                  background: inRange ? CYAN : "rgba(126,154,192,.16)",
                }}
              />
            );
          })}
        </div>

        <div style={{ position: "relative", height: 26, marginTop: 6 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 10, height: 3, borderRadius: 2, background: "rgba(126,154,192,.2)" }} />
          <div style={{ position: "absolute", left: `${pct(from)}%`, right: `${100 - pct(to)}%`, top: 10, height: 3, borderRadius: 2, background: CYAN }} />
          <input
            aria-label="Lowest price"
            type="range" min={lo} max={hi} step={10_000} value={from}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMinPrice(v <= lo ? null : Math.min(v, to));
            }}
            style={rangeStyle}
          />
          <input
            aria-label="Highest price"
            type="range" min={lo} max={hi} step={10_000} value={to}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxPrice(v >= hi ? null : Math.max(v, from));
            }}
            style={rangeStyle}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, letterSpacing: ".14em", color: DIM, fontWeight: 600 }}>
            {t("hunt.beds")}
          </span>
          {[null, 2, 3, 4, 5].map((b) => (
            <button
              key={String(b)}
              type="button"
              onClick={() => setMinBeds(b)}
              style={{
                cursor: "pointer", fontFamily: "inherit", borderRadius: 10,
                padding: "7px 13px", fontSize: 14, fontWeight: 700,
                border: minBeds === b ? `1px solid ${CYAN}` : `1px solid ${LINE}`,
                background: minBeds === b ? "#0E2233" : "transparent",
                color: minBeds === b ? "#FFFFFF" : "#B9C8DC",
              }}
            >
              {b === null ? t("hunt.bedsAny") : `${b}+`}
            </button>
          ))}
        </div>

        {preview && (
          <div style={{ fontSize: 13.5, color: DIM, lineHeight: 1.45, marginTop: 18 }}>
            {t("hunt.inRange", { n: preview.in_budget.toLocaleString() })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <Primary onClick={onDone} disabled={busy}>
          {busy ? t("hunt.saving") : t("hunt.done")}
        </Primary>
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <Quiet onClick={onBack} disabled={busy}>{t("hunt.back")}</Quiet>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- step three */

interface Criteria {
  goals: string[];
  suburbs: string[];
  min_price: number | null;
  max_price: number | null;
  min_beds: number | null;
}

/**
 * Where "take me to them" goes — and whether we may promise a number.
 *
 * The listing page filters on ONE suburb and AND-s its flags. Ollie counts
 * across every suburb they named and OR-s their goals. Those two agree only
 * when the customer named at most one suburb and at most one goal; anywhere
 * else the page would open on a different number than the sentence above it
 * just quoted, and the first thing they'd learn about us is that our counts
 * cannot be trusted. So the count is only put on the button when the link can
 * keep it.
 */
function destination(c: Criteria): { href: string; exact: boolean } {
  const q = new URLSearchParams({ view: "list" });
  if (c.suburbs.length === 1) q.set("suburb", c.suburbs[0]);
  if (c.min_price != null) q.set("min_price", String(Math.round(c.min_price)));
  if (c.max_price != null) q.set("max_price", String(Math.round(c.max_price)));
  if (c.min_beds != null) q.set("min_beds", String(c.min_beds));
  if (c.goals.length === 1) {
    if (c.goals[0] === "underpriced") q.set("underpriced", "true");
    if (c.goals[0] === "subdividable") q.set("subdividable", "true");
    if (c.goals[0] === "cashflow") q.set("cashflow_positive", "true");
  }
  // "live_in" is not a filter — it tells us who they are, not which listings
  // exist — so a lone "somewhere to live" still lands on an unnarrowed list,
  // and that is an honest match for what was counted.
  const filterableGoals = c.goals.filter((g) => g !== "live_in");
  const exact = c.suburbs.length <= 1 && filterableGoals.length <= 1;
  return { href: `/properties?${q.toString()}`, exact };
}

function Ready({
  preview, criteria, onFinish, onChange,
}: {
  preview: PreferencePreview | null;
  criteria: Criteria;
  onFinish: () => void;
  onChange: () => void;
}) {
  const { t } = useT();
  const n = preview?.matches ?? 0;
  const best = preview?.rows?.[0] ?? null;
  const to = destination(criteria);

  return (
    <>
      <Eyebrow>{t("hunt.readyEyebrow")}</Eyebrow>
      {n === 0 ? (
        <>
          <Heading>{t("hunt.readyNone")}</Heading>
        </>
      ) : (
        <>
          <Heading>
            <Counted text={t("hunt.readyTitle", { n: MARK })} value={n.toLocaleString()} />
          </Heading>
          <Lede>
            {preview!.subdividable > 0 &&
              `${t("hunt.readySplit", { n: preview!.subdividable })} `}
            {preview!.best_margin_dollars != null &&
              t("hunt.readyBest", {
                amount: fmtMoneyShort(preview!.best_margin_dollars),
              })}
          </Lede>
        </>
      )}

      {best && (
        <div
          style={{
            borderRadius: 20, marginTop: 22, padding: 1,
            background: "linear-gradient(150deg, rgba(61,220,151,.7), rgba(61,220,151,.08))",
          }}
        >
          <div style={{ borderRadius: 19, background: "linear-gradient(165deg, #0E2320 0%, #0A1522 100%)", padding: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-.05em", lineHeight: 1, color: "#3DDC97" }}>
                {fmtMoneyShort(best.margin_dollars)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: DIM }}>under</div>
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.025em", color: "#FFFFFF", marginTop: 13 }}>
              {best.address}
            </div>
            <div style={{ fontSize: 13, color: DIM, marginTop: 3 }}>
              {[best.suburb, best.beds ? `${best.beds} bed` : null].filter(Boolean).join(" · ")}
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 14, flexWrap: "wrap" }}>
              <Pill>{`Asking ${fmtMoneyShort(best.asking_price)}`}</Pill>
              {best.can_subdivide && best.max_addl_lots ? (
                <Pill tone="orange">{`Splits into ${Math.round(best.max_addl_lots) + 1}`}</Pill>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div style={{ border: `1px solid ${LINE}`, borderRadius: 18, background: PANEL, padding: "18px 19px", marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ width: 7, height: 7, borderRadius: 4, background: "#3DDC97", boxShadow: "0 0 9px #3DDC97", animation: "ollieBreathe 2.6s ease-in-out infinite" }} />
          <Eyebrow>{t("hunt.fromNow")}</Eyebrow>
        </div>
        <div style={{ fontSize: 14.5, color: "#C5D4E6", lineHeight: 1.55, marginTop: 13 }}>
          {t("hunt.promise")}
        </div>
        <div style={{ height: 1, background: "rgba(126,154,192,.16)", margin: "16px 0" }} />
        <div style={{ fontSize: 13.5, color: DIM, lineHeight: 1.4 }}>{t("hunt.fortnight")}</div>
      </div>

      <div style={{ marginTop: 22 }}>
        {n > 0 ? (
          <Link href={to.href} style={{ textDecoration: "none" }}>
            <Primary onClick={() => undefined}>
              {to.exact
                ? t("hunt.showAll", { n: n.toLocaleString() })
                : t("hunt.takeMe")}
            </Primary>
          </Link>
        ) : (
          <Primary onClick={onChange}>{t("hunt.widen")}</Primary>
        )}
        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 15 }}>
          <Quiet onClick={onChange}>{t("hunt.change")}</Quiet>
          {n > 0 && <Quiet onClick={onFinish}>{t("hunt.startAsking")}</Quiet>}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------- the fortnightly check */

function CheckIn({
  prefs, busy, onConfirm, onSnooze, onEdit,
}: {
  prefs: Preferences;
  busy: boolean;
  onConfirm: () => void;
  onSnooze: () => void;
  onEdit: () => void;
}) {
  const { t } = useT();

  const goalLine = prefs.goals.length
    ? prefs.goals.map((g) => t(`hunt.goal.${g}`)).join(" · ")
    : t("checkin.anyGoal");
  const areaLine = prefs.suburbs.length ? prefs.suburbs.join(", ") : t("checkin.anywhere");
  const budgetLine =
    prefs.min_price == null && prefs.max_price == null
      ? t("checkin.anyBudget")
      : `${fmtMoneyShort(prefs.min_price ?? 0)} – ${prefs.max_price != null ? fmtMoneyShort(prefs.max_price) : "…"}`;

  return (
    <>
      <Eyebrow>{t("checkin.eyebrow")}</Eyebrow>
      <Heading>{t("checkin.title")}</Heading>

      {/* State it back plainly. "Yes" should be one honest tap, which it only
          is if they can see exactly what they are agreeing to. */}
      <div style={{ border: `1px solid ${LINE}`, borderRadius: 18, background: PANEL, padding: "4px 18px", marginTop: 20 }}>
        {[goalLine, areaLine, budgetLine].map((line, i) => (
          <div key={i}>
            {i > 0 && <div style={{ height: 1, background: "rgba(126,154,192,.14)" }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "15px 0" }}>
              <div style={{ flexGrow: 1, fontSize: 14.5, fontWeight: 600, color: "#E8EDF5" }}>{line}</div>
              <button
                type="button"
                onClick={onEdit}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: CYAN, fontWeight: 700 }}
              >
                {t("checkin.edit")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 22 }}>
        <Primary onClick={onConfirm} disabled={busy}>{t("checkin.confirm")}</Primary>
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          style={{
            height: 52, borderRadius: 14, border: `1px solid rgba(126,154,192,.28)`,
            background: "transparent", color: "#B9C8DC", fontSize: 15.5,
            fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
          }}
        >
          {t("checkin.update")}
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Quiet onClick={onSnooze} disabled={busy}>{t("checkin.snooze")}</Quiet>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

const rangeStyle: React.CSSProperties = {
  position: "absolute", left: 0, right: 0, top: 0, width: "100%",
  appearance: "none", WebkitAppearance: "none", background: "transparent",
  pointerEvents: "auto", height: 24, margin: 0,
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: 10.5, letterSpacing: ".24em", color: "#6F8BB0", fontWeight: 600 }}>
      {children}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontSize: 33, fontWeight: 900, letterSpacing: "-.04em", lineHeight: 1.06, margin: "13px 0 0", color: D.ink }}>
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 15, color: DIM, lineHeight: 1.5, margin: "12px 0 0" }}>{children}</p>;
}

function Big({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-.04em", color: D.ink }}>{children}</div>;
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: "orange" }) {
  return (
    <div
      style={{
        background: tone === "orange" ? "rgba(255,122,69,.13)" : "rgba(126,154,192,.12)",
        borderRadius: 9, padding: "7px 11px", fontSize: 12.5, fontWeight: 700,
        color: tone === "orange" ? "#FF9A6E" : "#E8EDF5",
      }}
    >
      {children}
    </div>
  );
}

/** One glyph per goal, so the four are told apart at a glance rather than read. */
function GoalIcon({ which, color }: { which: string; color: string }) {
  const s = { stroke: color, strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  if (which === "underpriced") {
    return (
      <svg width="19" height="19" viewBox="0 0 21 21" aria-hidden>
        <path d="M3 15l5-5 4 4 6-8" {...s} />
        <path d="M18 6v4h-4" {...s} />
      </svg>
    );
  }
  if (which === "subdividable") {
    return (
      <svg width="19" height="19" viewBox="0 0 21 21" aria-hidden>
        <rect x="2.5" y="2.5" width="7" height="7" rx="1.3" {...s} />
        <rect x="11.5" y="2.5" width="7" height="7" rx="1.3" {...s} />
        <rect x="2.5" y="11.5" width="7" height="7" rx="1.3" {...s} />
        <rect x="11.5" y="11.5" width="7" height="7" rx="1.3" {...s} />
      </svg>
    );
  }
  if (which === "cashflow") {
    return (
      <svg width="19" height="19" viewBox="0 0 21 21" aria-hidden>
        <path d="M10.5 2.5v16" {...s} />
        <path d="M14.5 6.2c0-1.5-1.8-2.7-4-2.7s-4 1.2-4 2.7 1.8 2.4 4 2.9 4 1.4 4 2.9-1.8 2.7-4 2.7-4-1.2-4-2.7" {...s} />
      </svg>
    );
  }
  return (
    <svg width="19" height="19" viewBox="0 0 21 21" aria-hidden>
      <path d="M3 17.5V9l7.5-6 7.5 6v8.5" {...s} />
      <path d="M8 17.5v-5h5v5" {...s} />
    </svg>
  );
}

function Tick({ on, accent, ink }: { on: boolean; accent: string; ink: string }) {
  if (!on) {
    return <div style={{ width: 22, height: 22, borderRadius: 11, border: "1.6px solid rgba(126,154,192,.35)", flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: 22, height: 22, borderRadius: 11, background: accent, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="11" height="9" viewBox="0 0 12 10" fill="none" aria-hidden>
        <path d="M1.5 5.2l3 3L10.5 1.5" stroke={ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Primary({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", height: 52, borderRadius: 14, border: "none",
        background: disabled ? "rgba(70,198,245,.4)" : CYAN,
        color: "#06121F", fontSize: 16, fontWeight: 800, letterSpacing: "-.01em",
        cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function Quiet({
  children, onClick, disabled,
}: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "none", border: "none", cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit", fontSize: 13, color: FAINT,
        borderBottom: "1px solid rgba(85,112,143,.5)", padding: "0 0 1px",
      }}
    >
      {children}
    </button>
  );
}
