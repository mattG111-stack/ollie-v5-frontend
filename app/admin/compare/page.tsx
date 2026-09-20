"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { BatchCompare, BatchSummary, api } from "@/lib/api";
import { fmtMoneyShort, fmtPct } from "@/lib/format";
import { useT } from "@/lib/i18n";

export default function ComparePage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { t } = useT();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [a, setA] = useState<number | null>(null);
  const [b, setB] = useState<number | null>(null);
  const [data, setData] = useState<BatchCompare | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<BatchSummary[]>("/api/dashboards/batches?batch_type=for_sale").then((rows) => {
      setBatches(rows);
      if (rows.length >= 2) {
        setA(rows[1].id);
        setB(rows[0].id);
      } else if (rows.length === 1) {
        setA(rows[0].id);
        setB(rows[0].id);
      }
    });
  }, []);

  useEffect(() => {
    if (a == null || b == null || a === b) {
      setData(null);
      return;
    }
    setLoading(true);
    api<BatchCompare>(`/api/dashboards/batches/compare?a=${a}&b=${b}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [a, b]);

  return (
    <div className="px-7 py-6">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">{t("adm.compareTitle")}</h1>
        <p className="text-sm text-muted mt-1">
          {t("adm.compareSub")}
        </p>
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft p-5 mb-5">
        {batches.length < 2 ? (
          <div className="text-sm text-muted">
            {t("adm.needTwo", { n: batches.length })}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">{t("adm.olderBatch")}</div>
              <select
                value={a ?? ""}
                onChange={(e) => setA(parseInt(e.target.value))}
                className="bg-paper border border-line rounded-lg px-3 py-2 text-sm"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id} · {new Date(b.created_at).toLocaleDateString("en-NZ")} ·{" "}
                    {t("adm.rowsN", { n: (b.rows_inserted ?? 0).toLocaleString() })}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-faint text-2xl">→</div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-faint font-semibold mb-1">{t("adm.newerBatch")}</div>
              <select
                value={b ?? ""}
                onChange={(e) => setB(parseInt(e.target.value))}
                className="bg-paper border border-line rounded-lg px-3 py-2 text-sm"
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    #{b.id} · {new Date(b.created_at).toLocaleDateString("en-NZ")} ·{" "}
                    {t("adm.rowsN", { n: (b.rows_inserted ?? 0).toLocaleString() })}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {loading && <div className="text-sm text-muted">{t("adm.calculating")}</div>}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <Kpi label={t("adm.rowsAdded")} value={(data.rows_added ?? 0).toLocaleString()} tone="good" />
            <Kpi label={t("adm.rowsRemoved")} value={(data.rows_removed ?? 0).toLocaleString()} tone="bad" />
            <Kpi label={t("adm.stillOnMarket")} value={(data.rows_in_both ?? 0).toLocaleString()} />
            <Kpi
              label={t("adm.medianAskingChange")}
              value={
                data.median_asking_change_pct == null
                  ? "—"
                  : `${data.median_asking_change_pct > 0 ? "+" : ""}${(data.median_asking_change_pct * 100).toFixed(2)}%`
              }
              tone={data.median_asking_change_pct == null ? undefined : data.median_asking_change_pct > 0 ? "good" : "bad"}
            />
            <Kpi
              label={t("adm.medianEstChange")}
              value={
                data.median_market_value_change_pct == null
                  ? "—"
                  : `${data.median_market_value_change_pct > 0 ? "+" : ""}${(data.median_market_value_change_pct * 100).toFixed(2)}%`
              }
              tone={data.median_market_value_change_pct == null ? undefined : data.median_market_value_change_pct > 0 ? "good" : "bad"}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MoverTable title={t("adm.top10Drops")} rows={data.biggest_price_drop} color="#0A8754" t={t} />
            <MoverTable title={t("adm.top10Rises")} rows={data.biggest_price_rise} color="#D4503E" t={t} />
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const t = tone === "good" ? "text-under" : tone === "bad" ? "text-danger" : "";
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <div className="text-[10px] uppercase tracking-wider text-faint font-semibold">{label}</div>
      <div className={`font-display text-2xl font-bold mt-1 ${t}`}>{value}</div>
    </div>
  );
}

function MoverTable({
  title,
  rows,
  color,
  t,
}: {
  title: string;
  rows: { address: string | null; suburb: string | null; asking_a: number | null; asking_b: number | null; change_pct: number | null }[];
  color: string;
  t: (k: string) => string;
}) {
  return (
    <div className="bg-white border border-line rounded-card shadow-soft p-4">
      <h3 className="font-display font-semibold text-sm mb-3" style={{ color }}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <div className="text-xs text-muted">{t("adm.noMovers")}</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-faint font-semibold">
            <tr>
              <th className="text-left pb-2">{t("adm.property")}</th>
              <th className="text-right pb-2">{t("adm.was")}</th>
              <th className="text-right pb-2">{t("adm.now")}</th>
              <th className="text-right pb-2">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line2">
                <td className="py-2">
                  <div className="font-display font-semibold">{r.address}</div>
                  <div className="text-faint">{r.suburb}</div>
                </td>
                <td className="text-right tabular-nums">{fmtMoneyShort(r.asking_a)}</td>
                <td className="text-right tabular-nums">{fmtMoneyShort(r.asking_b)}</td>
                <td className="text-right tabular-nums font-semibold" style={{ color }}>
                  {r.change_pct == null
                    ? "—"
                    : `${r.change_pct > 0 ? "+" : ""}${(r.change_pct * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
