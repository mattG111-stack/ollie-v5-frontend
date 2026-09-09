"use client";

/**
 * How close each valuation gets to what a house ACTUALLY SOLD FOR.
 *
 * Ours, Hougarden's, and the council figure — side by side, split by house,
 * townhouse and apartment, because a blended number hides that a method can be
 * good at houses and poor at apartments. That is the usual shape: an
 * apartment's value is driven by the building and the floor it is on, and none
 * of these three can see either.
 *
 * THREE THINGS THAT MAKE THIS AN HONEST COMPARISON RATHER THAN A BROCHURE
 *
 * It is measured against sale prices, not against each other. Two estimates of
 * a house that has not sold can disagree by 20% and neither is wrong yet — that
 * measures disagreement, not accuracy.
 *
 * Our figure has never seen the sale it is scored on. There is no "our
 * valuation" column on a sold record, and that is deliberate: if there were, it
 * would have been written after the sale, with the sale in its own comp set,
 * and it would score beautifully and mean nothing. Ours is fitted only on sales
 * that happened BEFORE each one. That is a harder test than the other two face
 * here, and it is the only one that predicts next month.
 *
 * All three are scored on the SAME properties. Hougarden does not estimate
 * everything. Scoring ourselves on every sale and them on the subset they cover
 * compares two different markets — and flatters us, because the properties a
 * portal will commit to a number on are the ordinary well-traded ones every
 * method prices well.
 *
 * MAPE AND MEDIAN, TOGETHER
 *
 * MAPE is the number people ask for, so it leads. It is also badly behaved on
 * property: one sale recorded at a tenth of its real price moves the mean of
 * 500 by a full point, and property data is full of those. The median sits
 * beside it. When the two disagree sharply the mean is being dragged by a
 * handful of broken records, and the median is the one to believe.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Cell = {
  n: number;
  mape: number | null;
  median: number | null;
  within_10: number | null;
};

type Row = {
  property_type: string;
  n: number;
  ours: Cell;
  hougarden: Cell;
  council: Cell;
};

type Data = {
  rows: Row[];
  overall: Row | null;
  trained_on: number | null;
  min_rows: number | null;
  reason: string | null;
  method: string | null;
};

const METHODS = [
  { key: "ours" as const, label: "Ours" },
  { key: "hougarden" as const, label: "Hougarden" },
  { key: "council" as const, label: "Council CV" },
];

/** Lowest MAPE among the cells that HAVE one. Ties count as no winner. */
function best(row: Row): string | null {
  const scored = METHODS
    .map((m) => ({ key: m.key, v: row[m.key].mape }))
    .filter((x): x is { key: typeof METHODS[number]["key"]; v: number } => x.v != null);
  if (scored.length < 2) return null;
  scored.sort((a, b) => a.v - b.v);
  if (Math.abs(scored[0].v - scored[1].v) < 0.05) return null;   // a tie is a tie
  return scored[0].key;
}

export default function AccuracyVsHougarden() {
  const [d, setD] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const got = await api<Data>("/api/admin/ml/accuracy").catch(() => null);
    setD(got);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = d ? [...d.rows, ...(d.overall ? [d.overall] : [])] : [];

  return (
    <section className="mt-8 border border-line rounded-xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="font-display text-lg font-bold">
          How close we get, against Hougarden
        </h2>
        <span className="text-xs text-muted">
          Measured against what homes actually sold for
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-line hover:border-blue disabled:opacity-50"
        >
          {loading ? "Measuring…" : "Recheck"}
        </button>
      </div>

      {loading && !d && (
        <div className="text-xs text-muted mt-4">
          Fitting on the older sales to score the newer ones — a moment.
        </div>
      )}

      {d?.reason && (
        // The comparison refuses rather than inventing one. The most likely
        // reason by far: the sold files carry no Hougarden estimate column, so
        // there is nothing of theirs to measure.
        <div className="text-xs text-danger mt-4 leading-relaxed">
          Can’t compare yet — {d.reason}.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px] border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3" />
                  <th className="py-2 pr-3 text-right">Sales</th>
                  {METHODS.map((m) => (
                    <th key={m.key} className="py-2 pr-3 text-right">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const winner = best(r);
                  const isAll = r.property_type === "All";
                  return (
                    <tr key={r.property_type}
                        className={`border-b border-line/60 ${isAll ? "font-semibold" : ""}`}>
                      <td className="py-2 pr-3">{r.property_type}</td>
                      <td className="py-2 pr-3 text-right tnum text-muted">
                        {r.n.toLocaleString()}
                      </td>
                      {METHODS.map((m) => {
                        const c = r[m.key];
                        if (c.mape == null) {
                          return (
                            <td key={m.key}
                                className="py-2 pr-3 text-right text-[11px] text-muted"
                                title={`Only ${c.n} sales — too few to put a number on.`}>
                              too few ({c.n})
                            </td>
                          );
                        }
                        const won = winner === m.key;
                        return (
                          <td key={m.key} className="py-2 pr-3 text-right tnum">
                            <span className={won ? "text-[#0A8754] font-bold" : ""}>
                              {c.mape.toFixed(2)}%
                            </span>
                            <span className="text-muted text-[11px]">
                              {" "}· {c.median!.toFixed(2)}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-muted mt-3 leading-relaxed">
            Each cell is <b>average error · middle error</b> against the actual
            sale price. Lower is better. Where the two are far apart, a handful
            of odd records are dragging the average and the middle figure is the
            one to trust. A row with too few sales says so rather than showing a
            number off {d?.min_rows ?? 30} properties.
          </div>

          {d?.overall?.ours?.within_10 != null && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {METHODS.map((m) => (
                <div key={m.key} className="rounded-lg border border-line p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted">
                    {m.label} within 10%
                  </div>
                  <div className="tnum text-xl font-bold mt-1">
                    {d.overall![m.key].within_10?.toFixed(1) ?? "—"}%
                  </div>
                </div>
              ))}
            </div>
          )}

          {d?.method && (
            <div className="text-[11px] text-muted mt-3 leading-relaxed">
              {d.method}
              {d.trained_on
                ? ` Fitted on ${d.trained_on.toLocaleString()} earlier sales.`
                : ""}
            </div>
          )}
        </>
      )}
    </section>
  );
}
