import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isValidElement, type ReactNode } from "react";

type Chart = {
  type: "bar" | "line"; title: string; source: string;
  unit: "NZD" | "percent" | "count" | "days" | "sqm";
  data: { label: string; value: number | null }[];
};

export function parseChart(raw: string): Chart | null {
  if (raw.length > 24000) return null;
  try {
    const c = JSON.parse(raw);
    const text = (v: unknown, max: number) => typeof v === "string" && v.trim().length > 0 && v.length <= max;
    if (!c || !["bar", "line"].includes(c.type) || !text(c.title, 140) || !text(c.source, 500)
        || !["NZD", "percent", "count", "days", "sqm"].includes(c.unit)
        || !Array.isArray(c.data) || c.data.length < 1 || c.data.length > (c.type === "bar" ? 24 : 60)) return null;
    if (c.data.some((p: Chart["data"][number]) => !p || !text(p.label, 100)
        || !(p.value === null || (typeof p.value === "number" && Number.isFinite(p.value) && Math.abs(p.value) <= 1e12)))) return null;
    if (!c.data.some((p: Chart["data"][number]) => p.value !== null)
        || new Set(c.data.map((p: Chart["data"][number]) => p.label)).size !== c.data.length) return null;
    // Time charts use actual dates, never equally spaced arbitrary categories.
    if (c.type === "line" && c.data.some((p: Chart["data"][number], i: number) => {
      if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(p.label)) return true;
      const date = new Date(p.label.length === 7 ? `${p.label}-01T00:00:00Z` : `${p.label}T00:00:00Z`);
      return !Number.isFinite(date.getTime()) || date.toISOString().slice(0, p.label.length) !== p.label
        || (i > 0 && new Date(c.data[i - 1].label).getTime() >= date.getTime());
    })) return null;
    return c;
  } catch { return null; }
}

function AnswerChart({ raw }: { raw: string }) {
  const chart = parseChart(raw);
  if (!chart) return <p role="status">This chart could not be displayed. Please ask Ollie for the figures in a table.</p>;
  const { data, unit } = chart;
  const format = (n: number, compact = false) => {
    const value = new Intl.NumberFormat("en-NZ", { minimumFractionDigits: 0,
      // The data table and tooltips promise exact figures. Keep the supplied
      // precision there; only axis/bar labels use compact rounding.
      ...(compact ? { maximumFractionDigits: 1 } : { maximumSignificantDigits: 21 }),
      ...(compact ? { notation: "compact" as const } : {}),
      ...(unit === "NZD" ? { style: "currency", currency: "NZD", currencyDisplay: "narrowSymbol" } : {}),
    }).format(n);
    return value + (unit === "percent" ? "%" : unit === "sqm" ? " m²" : unit === "days" ? " days" : "");
  };
  const values = data.flatMap(p => p.value === null ? [] : [p.value]);
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1;
  const bar = chart.type === "bar";
  const height = bar ? data.length * 32 + 60 : 290;
  const xBar = (n: number) => 205 + (n - min) / span * 325;
  const firstTime = new Date(data[0].label).getTime();
  const lastTime = new Date(data[data.length - 1].label).getTime();
  const xLine = (label: string) => data.length === 1 ? 345 : 65 + (new Date(label).getTime() - firstTime) / (lastTime - firstTime) * 560;
  const yLine = (n: number) => 235 - (n - min) / span * 205;
  return <figure style={{ margin: "18px 0", padding: 16, border: "1px solid #485160", borderRadius: 12, background: "rgba(255,255,255,.035)" }}>
    <figcaption style={{ fontWeight: 700 }}>{chart.title}</figcaption>
    <p style={{ fontSize: 12, opacity: .8 }}>Source and filters: {chart.source} · Unit: {unit}</p>
    <div style={{ overflowX: "auto" }} tabIndex={0} role="region" aria-label={`${chart.title} chart`}>
      <svg viewBox={`0 0 650 ${height}`} style={{ width: "100%", minWidth: 520, display: "block" }} role="img" aria-label={chart.title}>
        <title>{`${chart.title}. Exact figures are available in the data table below.`}</title>
        {bar ? <>
          <line x1={xBar(0)} x2={xBar(0)} y1={8} y2={height - 36} stroke="#a7b2c2" />
          {data.map((p, i) => <g key={p.label}>
            <text x={195} y={i * 32 + 25} textAnchor="end" fill="currentColor" fontSize={12}>{p.label.length > 29 ? p.label.slice(0, 27) + "…" : p.label}</text>
            {p.value !== null && <rect x={Math.min(xBar(0), xBar(p.value))} y={i * 32 + 9} width={Math.abs(xBar(p.value) - xBar(0))} height={22} rx={3} fill={p.value < 0 ? "#ffae88" : "#72d2ff"}><title>{`${p.label}: ${format(p.value)}`}</title></rect>}
            <text x={540} y={i * 32 + 25} fill="currentColor" fontSize={12}>{p.value === null ? "No data" : format(p.value, true)}</text>
          </g>)}
          <text x={205} y={height - 10} fill="currentColor" fontSize={11}>{format(min, true)}</text>
          <text x={530} y={height - 10} textAnchor="end" fill="currentColor" fontSize={11}>{format(max, true)}</text>
        </> : <>
          {[min, min + span / 2, min + span].map(n => <g key={n}>
            <line x1={65} x2={625} y1={yLine(n)} y2={yLine(n)} stroke="#485160" />
            <text x={58} y={yLine(n) + 4} textAnchor="end" fill="currentColor" fontSize={11}>{format(n, true)}</text>
          </g>)}
          {data.map((p, i) => <g key={p.label}>
            {p.value !== null && <>
              {i > 0 && data[i - 1].value !== null && <line x1={xLine(data[i - 1].label)} y1={yLine(data[i - 1].value!)} x2={xLine(p.label)} y2={yLine(p.value)} stroke="#72d2ff" strokeWidth={2} />}
              <circle cx={xLine(p.label)} cy={yLine(p.value)} r={4} fill="#72d2ff"><title>{`${p.label}: ${format(p.value)}`}</title></circle>
            </>}
            {(i === 0 || i === data.length - 1) && <text x={xLine(p.label)} y={260} textAnchor={i === 0 ? "start" : "end"} fill="currentColor" fontSize={11}>{p.label}</text>}
          </g>)}
        </>}
      </svg>
    </div>
    <details style={{ marginTop: 12 }}><summary style={{ cursor: "pointer" }}>View chart data ({data.length} points)</summary>
      <div className="assistant-answer-table" tabIndex={0} role="region" aria-label="Chart data">
        <table><thead><tr><th scope="col">{bar ? "Category" : "Date"}</th><th scope="col">Value ({unit})</th></tr></thead>
          <tbody>{data.map(p => <tr key={p.label}><th scope="row">{p.label}</th><td>{p.value === null ? "No data" : format(p.value)}</td></tr>)}</tbody></table>
      </div>
    </details>
  </figure>;
}

/** Render model text as markup, never executable HTML or remote media. */
export default function AssistantAnswer({ content }: { content: string }) {
  return <div className="assistant-answer">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      disallowedElements={["img"]}
      urlTransform={(url) => {
        if (/^\/(?!\/)/.test(url) && !/[\\\u0000-\u0020]/.test(url)) return url;
        try {
          const parsed = new URL(url);
          return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
        } catch { return ""; }
      }}
      components={{
        pre: ({ children }) => {
          if (isValidElement<{ className?: string; children?: ReactNode }>(children)
              && children.props.className === "language-apex-chart") {
            return <AnswerChart raw={String(children.props.children ?? "")} />;
          }
          return <pre>{children}</pre>;
        },
        a: ({ href, children }) => href
          ? <a href={href} target={href.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a>
          : <span>{children}</span>,
        table: ({ children }) => <div className="assistant-answer-table" tabIndex={0} role="region" aria-label="Answer table"><table>{children}</table></div>,
      }}
    >{content}</ReactMarkdown>
  </div>;
}
