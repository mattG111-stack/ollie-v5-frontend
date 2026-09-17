import { expect, test, Page } from "@playwright/test";
import { CUSTOMER, apiToken } from "./helpers";

/**
 * Does the property type picker actually do anything?
 *
 * The unit tests prove the filter selects the right rows. They cannot prove the
 * page asks for it, or that the figures on screen change when someone uses it —
 * and a control that looks like it works is worse than no control.
 *
 * The seeded suburb holds houses around $1.2M and apartments around $600k, ten
 * of each a year for two years. If the picker works those two are far enough
 * apart to be unmistakable; if it does not, nothing on the page moves.
 */
async function asCustomer(page: Page) {
  const token = await apiToken(CUSTOMER);
  await page.addInitScript(
    ([t, r]) => {
      localStorage.setItem("ollie_token", t as string);
      localStorage.setItem("ollie_role", r as string);
    },
    [token, "user"],
  );
}

/** The suburb the sold history is seeded into. */
const SUBURB = "Mount Eden";

/** "$1.23M" / "$957k" → a number, so two medians can be compared. */
function money(text: string | null): number | null {
  if (!text) return null;
  const m = /\$([\d.,]+)\s*([MmKk])?/.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!m[2]) return n;
  return m[2].toLowerCase() === "m" ? n * 1_000_000 : n * 1_000;
}

/** The suburb panel's headline median, whatever the current filter is. */
async function headlineMedian(page: Page): Promise<number | null> {
  const el = page.locator("text=/median (sold|asking)/i").first();
  await el.waitFor({ timeout: 20_000 });
  const card = el.locator("xpath=..").locator("xpath=..");
  return money(await card.innerText());
}

test.describe("property type picker", () => {
  test.beforeEach(async ({ page }) => {
    await asCustomer(page);
    await page.goto("/trends", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_500);
    await page.getByRole("button", { name: SUBURB, exact: true }).first().click()
      .catch(() => null);
    await page.waitForTimeout(2_500);
  });

  test("is on the page, next to the suburb", async ({ page }) => {
    const picker = page.getByLabel("Property type");
    await expect(picker, "no property type picker on the trends page").toBeVisible();
    const options = await picker.locator("option").allTextContents();
    expect(options.join(" ")).toMatch(/house/i);
    expect(options.join(" ")).toMatch(/apartment/i);
  });

  test("choosing houses moves the figures away from the mixed median",
    async ({ page }) => {
      const mixed = await headlineMedian(page);
      expect(mixed, "no median on screen before filtering").not.toBeNull();

      await page.getByLabel("Property type").selectOption("House");
      await page.waitForTimeout(3_000);
      const houses = await headlineMedian(page);

      expect(houses, "no median on screen after choosing houses").not.toBeNull();
      // Seeded: houses ~$1.2M, apartments ~$600k, in equal numbers. Filtering to
      // houses has to lift the median well clear of the mix.
      expect(houses!, `houses ${houses} did not read above the mixed ${mixed}`)
        .toBeGreaterThan(mixed! * 1.2);
      expect(houses!).toBeGreaterThan(1_000_000);
    });

  test("and choosing apartments moves them the other way", async ({ page }) => {
    await page.getByLabel("Property type").selectOption("Apartment");
    await page.waitForTimeout(3_000);
    const flats = await headlineMedian(page);
    expect(flats, "no median on screen after choosing apartments").not.toBeNull();
    expect(flats!, `apartments read ${flats}, which is house money`)
      .toBeLessThan(900_000);
  });

  test("the request carries the type, and the page does not error", async ({ page }) => {
    const asked: string[] = [];
    const failed: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith("/api/")) asked.push(u.pathname + u.search);
    });
    page.on("response", (r) => {
      if (r.status() >= 500) failed.push(`${r.status()} ${new URL(r.url()).pathname}`);
    });

    await page.getByLabel("Property type").selectOption("House");
    await page.waitForTimeout(3_000);

    expect(asked.filter((u) => u.includes("ptype=House")).length,
      `neither endpoint was asked for a type:\n${asked.join("\n")}`)
      .toBeGreaterThanOrEqual(2);   // the chart AND the figures beside it
    expect(failed, `server errors: ${failed.join(", ")}`).toHaveLength(0);
  });

  /**
   * The crash. Reported as "select house, townhouse, apartment, unit and it
   * crashes", and it did: the panel guards on the suburb having three months,
   * not on the CHOSEN METRIC having a value in any of them. The seeded
   * Townhouse sales carry no days-on-market and are too thin to publish a
   * median, so the months exist and the values do not — and the page read
   * element [0] of an empty array and went white.
   */
  test("every type can be selected without white-screening the page",
    async ({ page }) => {
      const crashes: string[] = [];
      page.on("pageerror", (e) => crashes.push(String(e).slice(0, 200)));

      const picker = page.getByLabel("Property type");
      const values = await picker.locator("option").evaluateAll(
        (els: any[]) => els.map((e) => e.value));

      for (const v of values) {
        await picker.selectOption(v);
        await page.waitForTimeout(1_800);
        // Something has to still be on screen. A thrown render leaves the app
        // shell empty, so assert on content rather than on the body existing.
        await expect(page.locator("h1").first(),
          `the page went blank after choosing "${v || "All types"}"`).toBeVisible();
        expect(crashes,
          `choosing "${v || "All types"}" threw: ${crashes.join(" | ")}`).toHaveLength(0);
      }
    });

  test("and every metric on the market panel survives a thin type",
    async ({ page }) => {
      const crashes: string[] = [];
      page.on("pageerror", (e) => crashes.push(String(e).slice(0, 200)));

      await page.getByLabel("Property type").selectOption("Townhouse");
      await page.waitForTimeout(2_000);
      // vs CV / Median price / Sales / Days to sell — the seeded townhouses
      // have no CV and no days on market, so most of these have nothing to draw.
      for (const label of ["vs CV", "Median price", "Sales", "Days to sell"]) {
        const btn = page.getByRole("button", { name: label, exact: true }).first();
        if (!(await btn.count())) continue;
        await btn.click();
        await page.waitForTimeout(1_200);
        expect(crashes, `"${label}" threw on a thin type: ${crashes.join(" | ")}`)
          .toHaveLength(0);
      }
      await expect(page.locator("h1").first()).toBeVisible();
    });
});
