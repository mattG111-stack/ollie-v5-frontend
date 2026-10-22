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
      name: /review customer preview|push live/i,
    }).first();
    await expect(
      anyButton,
      "the review page showed no button at all — with a load waiting, there is "
        + "no way to publish it from this screen",
    ).toBeVisible({ timeout: 10_000 });
  });

  test("preview then go live, and the site is serving the new data", async ({ page }) => {
    test.setTimeout(90_000);
    const seen = trackResponses(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await signIn(page, ADMIN);
    const customerToken = await apiToken(CUSTOMER);
    const customerHeaders = { Authorization: `Bearer ${customerToken}` };
    const waitingListings = "/api/properties?search=Waiting%20Road&page_size=20";
    const before = await page.request.get(waitingListings, { headers: customerHeaders });
    expect(before.ok()).toBeTruthy();
    const beforeData = await before.json();
    expect(beforeData.items ?? beforeData.rows ?? beforeData).toHaveLength(0);
    await page.goto("/admin/publish", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);

    const started = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/admin/release/price");
    await page.getByRole("button", { name: /re-run pricing on all/i }).click();
    expect((await started).ok(), "pricing must start on the staged batch").toBeTruthy();
    await expect(page.getByText(/\d+ listings repriced/))
      .toBeVisible({ timeout: 45_000 });

    const preview = page.getByRole("button", { name: /review customer preview/i }).first();
    if (await preview.isVisible().catch(() => false)) {
      await preview.click();
      await page.waitForTimeout(4_000);
    }

    const live = page.getByRole("button", { name: /push live/i }).first();
    await expect(
      live,
      "after pressing Finish and preview, the Go live button never appeared — "
        + "which is exactly what 'it will not publish' looks like from the outside",
    ).toBeVisible({ timeout: 15_000 });
    page.once("dialog", (dialog) => dialog.accept());
    const published = page.waitForResponse((response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/admin/release/publish");
    await live.click();
    expect((await published).ok(), "the publish request must succeed").toBeTruthy();
    const after = await page.request.get(waitingListings, { headers: customerHeaders });
    expect(after.ok()).toBeTruthy();
    const afterData = await after.json();
    const rows = afterData.items ?? afterData.rows ?? afterData;
    expect(rows.map((row: { address: string }) => row.address).sort())
      .toEqual(["1 Waiting Road", "2 Waiting Road"]);

    const bad = seen.filter((s) => s.status >= 500);
    expect(bad, `publishing made a request that failed: ${JSON.stringify(bad)}`)
      .toEqual([]);
    expect(errors, `the page threw in the browser: ${errors.join(" | ")}`).toEqual([]);

    // Check the history too; customer visibility above is the publication proof.
    await page.goto("/admin/upload", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_500);
    await expect(
      page.getByText(/active/i).first(),
      "nothing on the import history reads as active after a publish — the load "
        + "is still waiting and the Database page will still be empty",
    ).toBeVisible({ timeout: 10_000 });
  });
});
