import { expect, test } from "@playwright/test";
import { ADMIN, CUSTOMER, apiToken, signIn, trackResponses } from "./helpers";

/**
 * Press the buttons. In a browser. All the way to live.
 *
 * Every other check on the publish path calls the functions directly, and they
 * pass — staged goes to preview, preview goes to published, both batches come
 * back active. None of that helps if the screen in front of the person doing it
 * throws, shows no button, or posts a request that 500s. This drives the real
 * pages in a real browser and fails on any of those.
 *
 * What it asserts, in order:
 *   the import history renders at all (it is the screen that reports what is
 *     loaded, and a 500 there reads as "the data is gone")
 *   the review page offers the step you are actually on
 *   pressing through preview and go-live leaves both batches ACTIVE
 *   and nothing in the whole sequence returned a 5xx or threw in the browser
 */

test.describe("publishing a load puts it live", () => {
  test.describe.configure({ mode: "serial" });
  test("the import history page renders without a server error", async ({ page }) => {
    const seen = trackResponses(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await signIn(page, ADMIN);
    await page.goto("/admin/upload", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_000);

    const bad = seen.filter((s) => s.status >= 500);
    expect(bad, `the upload page made a request that failed: ${JSON.stringify(bad)}`)
      .toEqual([]);
    expect(errors, `the page threw in the browser: ${errors.join(" | ")}`).toEqual([]);
    await expect(page.getByRole("heading", { name: /upload|import/i }).first())
      .toBeVisible();
  });

  test("the review page renders and offers a button", async ({ page }) => {
    const seen = trackResponses(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await signIn(page, ADMIN);
    await page.goto("/admin/publish", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    const bad = seen.filter((s) => s.status >= 500);
    expect(bad, `the review page made a request that failed: ${JSON.stringify(bad)}`)
      .toEqual([]);
    expect(errors, `the page threw in the browser: ${errors.join(" | ")}`).toEqual([]);

    // Either button, or the "nothing staged" state — but not a blank page.
    const anyButton = page.getByRole("button", {
      name: /finish and preview|go live/i,
    }).first();
    await expect(
      anyButton,
      "the review page showed no button at all — with a load waiting, there is "
        + "no way to publish it from this screen",
    ).toBeVisible({ timeout: 10_000 });
  });

  test("preview then go live, and the site is serving the new data", async ({ page }) => {
    const seen = trackResponses(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await signIn(page, ADMIN);
    await page.goto("/admin/publish", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    const preview = page.getByRole("button", { name: /finish and preview/i }).first();
    await expect(preview, "the seeded batch must start staged").toBeVisible({ timeout: 15_000 });
    await preview.click();

    const live = page.getByRole("button", { name: /go live/i }).first();
    await expect(
      live,
      "after pressing Finish and preview, the Go live button never appeared — "
        + "which is exactly what 'it will not publish' looks like from the outside",
    ).toBeVisible({ timeout: 15_000 });
    page.once("dialog", (dialog) => dialog.accept());
    const publishedResponse = page.waitForResponse((r) =>
      new URL(r.url()).pathname === "/api/admin/release/publish" && r.request().method() === "POST");
    await live.click();
    const response = await publishedResponse;
    expect(response.ok(), await response.text()).toBeTruthy();
    const result = await response.json();
    expect(result.published.some((b: { batch_type: string }) => b.batch_type === "for_sale")).toBeTruthy();
    await expect(page.getByText(/Published \d+ batch\(es\) live/)).toBeVisible();

    const token = await apiToken(CUSTOMER);
    const customerRows = await page.request.get("/api/properties?limit=100", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(customerRows.ok(), await customerRows.text()).toBeTruthy();
    const body = await customerRows.json();
    const rows = Array.isArray(body) ? body : (body.rows ?? body.items ?? body.results ?? []);
    expect(rows.filter((r: { address: string }) => /Waiting Road/.test(r.address))).toHaveLength(2);

    const adminToken = await page.evaluate(() => localStorage.getItem("ollie_token"));
    const summary = await page.request.get("/api/admin/release/staged", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(summary.ok()).toBeTruthy();
    expect((await summary.json()).has_staged).toBe(false);

    const bad = seen.filter((s) => s.status >= 500);
    expect(bad, `publishing made a request that failed: ${JSON.stringify(bad)}`)
      .toEqual([]);
    expect(errors, `the page threw in the browser: ${errors.join(" | ")}`).toEqual([]);

    // The proof is on the history screen: the batch reads active, not waiting.
    await page.goto("/admin/upload", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_500);
    await expect(
      page.getByText(/^active$/i).first(),
      "nothing on the import history reads as active after a publish — the load "
        + "is still waiting and the Database page will still be empty",
    ).toBeVisible({ timeout: 10_000 });
  });
});
