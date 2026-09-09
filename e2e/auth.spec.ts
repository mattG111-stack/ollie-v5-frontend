import { expect, test } from "@playwright/test";
import { ADMIN, CUSTOMER, PW, TRIAL, signIn, stayPut, trackResponses } from "./helpers";

/**
 * Getting in, staying in, and being sent to the right place when you cannot.
 *
 * 401 and 402 mean different things and must route differently: one is "sign
 * in", the other is "you are signed in and this costs money". Collapsing them
 * sends a paying customer to a login screen, and that is the failure people
 * report as "it logged me out again".
 */
test.describe("sign-in and routing", () => {
  test("a paying customer lands in the product", async ({ page }) => {
    await signIn(page, CUSTOMER);
    await expect(page).toHaveURL(/\/(today|properties)/);
  });

  test("and stays there — nothing may bounce them while they read", async ({ page }) => {
    await signIn(page, CUSTOMER);
    await stayPut(page, "/", 6_000);
    expect(new URL(page.url()).pathname).not.toContain("sign-in");
    expect(new URL(page.url()).pathname).not.toContain("onboarding");
  });

  test("an admin gets the admin nav", async ({ page }) => {
    await signIn(page, ADMIN);
    await expect(page.getByRole("link", { name: /promoters/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /map imagery/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /data probe/i })).toBeVisible();
  });

  test("a wrong password is refused, and says so on the page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.locator('input[type="email"]').first().fill(CUSTOMER);
    await page.locator('input[type="password"]').first().fill("wrong-password");
    await page.locator('button[type="submit"]').first().click();
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.locator("body")).toContainText(/invalid|incorrect|check/i);
  });

  test("email case does not matter", async ({ page }) => {
    await signIn(page, CUSTOMER.toUpperCase());
    await expect(page).toHaveURL(/\/(today|properties)/);
  });

  test("a signed-out visitor is sent to sign-in, not shown an error", async ({ page }) => {
    await page.goto("/today");
    await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
  });

  test("the session survives a reload", async ({ page }) => {
    await signIn(page, CUSTOMER);
    const before = new URL(page.url()).pathname;
    await page.reload();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe(before);
  });

  test("nothing on a signed-in page 500s", async ({ page }) => {
    const responses = trackResponses(page);
    await signIn(page, CUSTOMER);
    await page.waitForLoadState("networkidle");
    const broken = responses.filter((r) => r.status >= 500);
    expect(broken, `server errors: ${JSON.stringify(broken)}`).toHaveLength(0);
  });

  test("a trialing user still gets in — a trial is access, just not income",
    async ({ page }) => {
      await signIn(page, TRIAL);
      expect(new URL(page.url()).pathname).not.toContain("sign-in");
    });
});
