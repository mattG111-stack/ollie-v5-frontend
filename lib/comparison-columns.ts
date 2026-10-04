/** Transpose bounded entity tables into criteria-by-option comparisons. */
export function comparisonColumns(content: string): string {
  const lines = content.split("\n");
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) { fenced = !fenced; continue; }
    if (fenced || !/^\|\s*(Property|Source)\s*\|/i.test(lines[i])) continue;
    const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(s => s.trim());
    const header = cells(lines[i]);
    if (!/^\|[\s:|-]+\|$/.test(lines[i + 1] ?? "")) continue;
    let end = i + 2;
    while (end < lines.length && /^\|.*\|$/.test(lines[end])) end++;
    const rows = lines.slice(i + 2, end).map(cells);
    if (rows.length < 2 || rows.length > 6 || rows.some(r => r.length !== header.length)) continue;
    const table = [
      "| Criteria | " + rows.map(r => r[0]).join(" | ") + " |",
      "|---|" + rows.map(() => "---|").join(""),
      ...header.slice(1).map((name, col) => "| " + name + " | " + rows.map(r => r[col + 1] || "Not available").join(" | ") + " |")
    ];
    lines.splice(i, end - i, ...table);
    i += table.length - 1;
  }
  return lines.join("\n");
}
