/**
 * "Do not display any dates like this it's rubbish — day, month, year."
 *
 * A map popup was printing "2009-08-04" straight off the API. That is not a
 * date to a New Zealander, it is a serial number, and it was sitting on the
 * customer-facing map next to a sale price.
 *
 * Every date the reader sees goes through fmtDayDate and comes out dd-mm-yyyy.
 * The second half of this file is the part that matters over time: a scan of
 * the source for a raw date field being dropped into the page without it. Four
 * places were doing that, in three different components, and each one was
 * written by someone who had no reason to know the other three existed.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { fmtDayDate } from "../lib/format";

// ---------------------------------------------------------------------------
// The format itself
// ---------------------------------------------------------------------------
test("an ISO date comes out day-month-year", () => {
  expect(fmtDayDate("2009-08-04")).toBe("04-08-2009");
  expect(fmtDayDate("2026-07-01")).toBe("01-07-2026");
});

test("a timestamp keeps the day it was written on", () => {
  expect(fmtDayDate("2009-08-04T00:00:00")).toBe("04-08-2009");
  expect(fmtDayDate("2009-08-04 09:30:00")).toBe("04-08-2009");
});

test("a date-only string is not shifted by a timezone", () => {
  // Date() reads "2009-08-04" as UTC MIDNIGHT, so west of Greenwich it renders
  // as the 3rd. There is no time in the string to convert, so it is split
  // rather than parsed and the day cannot move.
  expect(fmtDayDate("2009-08-04").startsWith("04-")).toBe(true);
  expect(fmtDayDate("2026-01-01")).toBe("01-01-2026");     // and no year rollover
});

test("our epoch-seconds strings still work", () => {
  // The sold feed carries these; they were the reason fmtDayDate exists.
  expect(fmtDayDate("1097924400")).toMatch(/^\d{2}-\d{2}-\d{4}$/);
});

test("a bare year is left alone rather than invented into a day", () => {
  expect(fmtDayDate("2019")).toBe("2019");
});

test("nothing is an em dash, not 'Invalid Date'", () => {
  for (const v of [null, undefined, "", "—"]) {
    expect(fmtDayDate(v)).toBe("—");
  }
  expect(fmtDayDate("by negotiation")).toBe("by negotiation");
});

test("never the ISO order, whatever goes in", () => {
  for (const v of ["2009-08-04", "2026-07-01T12:00:00", "1097924400"]) {
    expect(fmtDayDate(v)).not.toMatch(/^\d{4}-/);
  }
});

// ---------------------------------------------------------------------------
// Nowhere prints a raw date field
// ---------------------------------------------------------------------------
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !full.includes("/e2e/")) out.push(full);
  }
  return out;
}

test("no component drops a raw date field into the page", () => {
  // Matches a date-ish field interpolated with nothing wrapped around it:
  //   ${p.sold_date}          {r.last_sold_date}        ${escapeHtml(c.sold_date)}
  // A formatted one reads fmtDayDate(...) / fmtEpoch(...) / toLocaleDateString,
  // so the capture below never fires on it.
  const raw = /[${{]\s*(?:[a-z]\w*\.)?\w*(?:sold_date|_at|date_\w+)\s*[}]/g;
  const allowed = /fmtDayDate|fmtEpoch|toLocaleDateString|monthShort|new Date\(/;

  const offenders: string[] = [];
  for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      if (allowed.test(line)) return;
      const hit = line.match(raw);
      if (hit) offenders.push(`${file}:${i + 1}  ${line.trim()}`);
    });
  }
  expect(offenders, `raw date fields reaching the page:\n${offenders.join("\n")}`)
    .toEqual([]);
});

test("the two maps format the sale date they show", () => {
  // Both popups printed the API string. They are separate components and each
  // was fixed on its own, which is exactly how the second one got missed.
  for (const file of ["components/MapView.tsx", "components/SuburbTrendsMap.tsx"]) {
    const text = readFileSync(file, "utf8");
    expect(text, `${file} shows a sale date`).toContain("sold_date");
    expect(text, `${file} must format it`).toContain("fmtDayDate");
  }
});
