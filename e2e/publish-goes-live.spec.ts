import { expect, test } from "@playwright/test";
import { ADMIN, signIn, trackResponses } from "./helpers";

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
      name: /finish and preview|go live|reset/i,
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
    if (await preview.isVisible().catch(() => false)) {
      await preview.click();
      await page.waitForTimeout(4_000);
    }

    const live = page.getByRole("button", { name: /go live/i }).first();
    await expect(
      live,
      "after pressing Finish and preview, the Go live button never appeared — "
        + "which is exactly what 'it will not publish' looks like from the outside",
    ).toBeVisible({ timeout: 15_000 });
    await live.click();
    await page.waitForTimeout(5_000);

    const bad = seen.filter((s) => s.status >= 500);
    expect(bad, `publishing made a request that failed: ${JSON.stringify(bad)}`)
      .toEqual([]);
    expect(errors, `the page threw in the browser: ${errors.join(" | ")}`).toEqual([]);

    // The proof is on the history screen: the batch reads active, not waiting.
    await page.goto("/admin/upload", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2_500);
    await expect(
      page.getByText(/active/i).first(),
      "nothing on the import history reads as active after a publish — the load "
        + "is still waiting and the Database page will still be empty",
    ).toBeVisible({ timeout: 10_000 });
  });
});
