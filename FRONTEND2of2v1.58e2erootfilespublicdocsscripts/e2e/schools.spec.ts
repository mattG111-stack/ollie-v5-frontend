import { expect, test, Page } from "@playwright/test";
import { CUSTOMER, apiToken } from "./helpers";

/**
 * Schools on the property page.
 *
 * The export has carried a school list for every property all along — around
 * thirty of them, each with a distance and, crucially, whether this address is
 * IN ZONE. It was being stored and never shown. In Auckland the zone is one of
 * the first things a family checks, so it leads the panel.
 *
 * The seeded listing has two in-zone schools and eight further away, with the
 * in-zone ones NOT the closest by every measure — so an ordering that ignored
 * the zone flag would be visible here.
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

/** The seeded rich listing — the only one carrying school data. */
async function openRichListing(page: Page) {
  await page.goto("/properties", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
  await page.goto("/property/1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_000);
}

test.describe("schools", () => {
  test.beforeEach(async ({ page }) => {
    await asCustomer(page);
    await openRichListing(page);
  });

  test("the panel is on the property page", async ({ page }) => {
    const heading = page.getByText("Schools", { exact: true }).first();
    await expect(heading, "no schools panel on a listing that has school data")
      .toBeVisible();
  });

  test("in-zone schools are named, and marked as in zone", async ({ page }) => {
    await expect(page.getByText("In zone", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("E2E Primary School")).toBeVisible();
    await expect(page.getByText("E2E College")).toBeVisible();
  });

  test("in-zone comes before the rest, whatever the distances", async ({ page }) => {
    const panel = page.getByText("Schools", { exact: true }).first()
      .locator("xpath=ancestor::div[1]/parent::div");
    const text = await panel.innerText();
    const zoned = text.indexOf("E2E College");
    const other = text.indexOf("Far Away School 1");
    expect(zoned, "in-zone school missing from the panel").toBeGreaterThan(-1);
    expect(other, "nearby schools missing from the panel").toBeGreaterThan(-1);
    expect(zoned, "an out-of-zone school was listed above an in-zone one")
      .toBeLessThan(other);
  });

  test("each school carries how far away it is", async ({ page }) => {
    await expect(page.getByText(/0\.54km/).first(),
      "no distance shown against a school").toBeVisible();
  });

  test("the long tail is collapsed until asked for", async ({ page }) => {
    // Eight out of zone, five shown — the eighth is behind the toggle.
    await expect(page.getByText("Far Away School 8")).toHaveCount(0);
    await page.getByRole("button", { name: /show all/i }).first().click();
    await expect(page.getByText("Far Away School 8")).toBeVisible();
  });

});

/**
 * Outside the describe, so it pays for one property page rather than two.
 *
 * Every property page fires the third-party estimate endpoint, which makes real
 * outbound calls on a first view — in this container those hang until they time
 * out, and a test that opens two property pages spends most of its budget
 * waiting on them.
 */
test("a listing with no school data shows no panel, not an empty one",
  async ({ page }) => {
    await asCustomer(page);
    await page.goto("/property/2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3_000);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText("In zone", { exact: true })).toHaveCount(0);
  });
