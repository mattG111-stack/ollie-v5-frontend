import { test, expect, Page } from "@playwright/test";
import { CUSTOMER, apiToken } from "./helpers";

async function asCustomer(page: Page) {
  const token = await apiToken(CUSTOMER);
  await page.addInitScript(([t, r]) => {
    localStorage.setItem("ollie_token", t as string);
    localStorage.setItem("ollie_role", r as string);
  }, [token, "user"]);
}

for (const path of ["/properties?view=list", "/underpriced", "/subdividable"]) {
  test(`type filter on ${path}`, async ({ page }) => {
    const errs: string[] = [];
    const crashes: string[] = [];
    page.on("response", (r) => {
      if (r.status() >= 500) errs.push(`${r.status()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`);
    });
    page.on("pageerror", (e) => crashes.push(String(e).slice(0, 200)));

    await asCustomer(page);
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // The type <select> — find it by its options rather than a label.
    const selects = page.locator("select");
    const n = await selects.count();
    let typeSel = -1;
    for (let i = 0; i < n; i++) {
      const opts = (await selects.nth(i).locator("option").allTextContents()).join("|");
      if (/house/i.test(opts) && /apartment/i.test(opts)) { typeSel = i; break; }
    }
    console.log(`${path}: selects=${n} typeSelectIndex=${typeSel}`);
    if (typeSel < 0) { console.log(`${path}: NO TYPE FILTER FOUND`); return; }

    const opts = await selects.nth(typeSel).locator("option").allInnerTexts();
    const values = await selects.nth(typeSel).locator("option").evaluateAll(
      (els: any[]) => els.map((e) => e.value));
    console.log(`${path}: options=${JSON.stringify(opts)} values=${JSON.stringify(values)}`);

    for (const v of values) {
      if (!v) continue;
      await selects.nth(typeSel).selectOption(v);
      await page.waitForTimeout(2200);
      const visible = await page.locator("body").isVisible();
      console.log(`${path}: selected "${v}" bodyVisible=${visible} errs=${errs.length} crashes=${crashes.length}`);
    }
    console.log(`${path}: SERVER ERRORS: ${JSON.stringify(errs)}`);
    console.log(`${path}: PAGE CRASHES: ${JSON.stringify(crashes)}`);
    expect(crashes, `the page threw: ${crashes.join(" | ")}`).toHaveLength(0);
    expect(errs, `server errors: ${errs.join(", ")}`).toHaveLength(0);
  });
}
