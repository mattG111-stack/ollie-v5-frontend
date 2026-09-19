import { expect, test } from "@playwright/test";
import { PROMOTER, CUSTOMER, REF_CODE, signIn, stayPut, trackResponses } from "./helpers";

/**
 * The promoter dashboard — the view that was unusable for five builds.
 *
 * The bug: the header polls a paywalled endpoint every 60 seconds, a promoter
 * gets 402, and the 402 handler redirected to the paywall. It survived 604
 * backend tests because every layer it passed through was a different one —
 * server answering correctly, client handling a correct answer wrongly, browser
 * obeying. Only a real browser against a real server can see it.
 */
test.describe("promoter dashboard", () => {
  test("signing in lands on the dashboard, not the paywall", async ({ page }) => {
    await signIn(page, PROMOTER);
    await expect(page).toHaveURL(/\/promoter/);
    await expect(page.getByRole("heading", { name: /your referrals/i })).toBeVisible();
  });

  test("stays there — no poll may bounce them to onboarding", async ({ page }) => {
    const responses = trackResponses(page);
    await signIn(page, PROMOTER);
    await expect(page).toHaveURL(/\/promoter/);

    // The regression. Long enough to cover the immediate poll and settle.
    await stayPut(page, "/promoter", 6_000);

    // And prove the poll is not being fired at all for a promoter, rather than
    // fired and quietly failing — the fix was to stop asking, not to hide it.
    const polled = responses.filter((r) => r.url.includes("/api/wishlists/notifications"));
    expect(polled, `promoter should never poll wish lists, saw ${JSON.stringify(polled)}`)
      .toHaveLength(0);
  });

  test("shows income and paying customers as the first thing on the page", async ({ page }) => {
    await signIn(page, PROMOTER);
    await expect(page.getByText("Your income")).toBeVisible();
    await expect(page.getByText("Paying customers")).toBeVisible();
    // Seeded: one paying customer at $20, two months already recorded.
    await expect(page.getByText("$20.00", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/\$40\.00/).first()).toBeVisible();
  });

  test("a trial is shown but never counted as income", async ({ page }) => {
    await signIn(page, PROMOTER);
    await expect(page.getByText(/on trial/i).first()).toBeVisible();
    await expect(page.getByText(/earn.*nothing until their first payment/i).first())
      .toBeVisible();
  });

  test("carries the referral link, and no customer identities", async ({ page }) => {
    await signIn(page, PROMOTER);
    await expect(page.getByText(new RegExp(`ref=${REF_CODE}`))).toBeVisible();
    // A promoter must never see who their customers are.
    await expect(page.locator("body")).not.toContainText(CUSTOMER);
    await expect(page.locator("body")).not.toContainText("Paying Customer");
  });

  test("the ads tab breaks results down per campaign", async ({ page }) => {
    await signIn(page, PROMOTER);
    await page.getByRole("button", { name: "My ads" }).click();
    await expect(page.getByText("e2e-reel")).toBeVisible();
    await expect(page.getByRole("heading", { name: /how each ad is doing/i })).toBeVisible();
  });

  test("the link builder tidies a tag the same way the server does", async ({ page }) => {
    await signIn(page, PROMOTER);
    await page.getByRole("button", { name: "My ads" }).click();
    await page.getByPlaceholder("insta reel aug").fill("Insta Reel — Aug");
    await expect(page.getByText(/c=insta-reel-aug/)).toBeVisible();
  });

  test("the media pack renders without an AI key configured", async ({ page }) => {
    await signIn(page, PROMOTER);
    await page.getByRole("button", { name: "Media pack" }).click();
    await expect(page.getByRole("heading", { name: /what you are promoting/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /what you must not say/i })).toBeVisible();
    // The rules must be on screen for a human, not only in the model's prompt.
    await expect(page.getByText(/guaranteed profit/i)).toBeVisible();
    await expect(page.getByText(/ready-made copy/i).first()).toBeVisible();
  });

  test("a promoter cannot reach the customer product", async ({ page }) => {
    await signIn(page, PROMOTER);
    await page.goto("/properties");
    // Routed back to their own dashboard rather than left on a page that 402s.
    await expect(page).toHaveURL(/\/promoter/, { timeout: 15_000 });
  });
});
