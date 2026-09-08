import { expect, test, Page } from "@playwright/test";
import { ADMIN, signIn } from "./helpers";

/**
 * The Trade Me fill panel, in a browser.
 *
 * The backend tests prove the endpoint. They cannot prove an admin can reach
 * it: that the panel renders, that a file chosen through the OS dialog is
 * posted, that "Check first" writes nothing, and that what comes back is
 * legible rather than a raw JSON blob. Every one of those has its own way of
 * failing.
 *
 * The seeded world holds "1 Test Street, Mount Eden", so the fixture below is
 * one row that matches it and one that matches nothing.
 */
const THEIR_CSV = [
  "address,suburb,city,latitude,longitude,property_type,property_type_confidence," +
  "ownership_type,sale_date,sale_price,sale_display_price,floor_area_m2,land_area_m2," +
  "est_value,est_value_low,est_value_high,est_value_date,capital_value,land_value," +
  "improvement_value,cv_revision_date,cover_image_url",
  '"1 Test Street, Mount Eden, Auckland City",Mount Eden,Auckland City,-36.87,174.77,' +
  'House,high,Freehold,6/13/2026,1250000,"$1,250,000",210,640,$1.24M,$1.17M,$1.31M,' +
  "6-Aug-26,1200000,800000,400000,1-May-24,",
  '"99 Nowhere Road, Elsewhere, Somewhere",Elsewhere,Somewhere,-36.90,174.70,' +
  'House,high,Freehold,4/30/2026,900000,"$900,000",150,500,$890K,$840K,$940K,' +
  "6-Aug-26,880000,600000,280000,1-May-24,",
].join("\n");

async function openUpload(page: Page) {
  await signIn(page, ADMIN);
  await page.goto("/admin/upload", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2_000);
}

async function pick(page: Page, body = THEIR_CSV, name = "trademe.csv") {
  // Scoped by test id: the three weekly file drops on this page render the
  // same input[type=file][accept=.csv], and the first match is one of those.
  await page.setInputFiles('[data-testid="trademe-csv"]', {
    name, mimeType: "text/csv", buffer: Buffer.from(body),
  });
}

test.describe("Trade Me fill", () => {
  test.beforeEach(async ({ page }) => {
    await openUpload(page);
  });

  test("the panel is on the upload page, separate from the weekly import",
    async ({ page }) => {
      await expect(page.getByText("Trade Me sales export")).toBeVisible();
      // It must not be mistaken for one of the three weekly files.
      await expect(page.getByRole("button", { name: /fill gaps/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /check first/i })).toBeVisible();
    });

  test("nothing can be sent until a file is chosen", async ({ page }) => {
    await expect(page.getByRole("button", { name: /check first/i })).toBeDisabled();
    await expect(page.getByRole("button", { name: /fill gaps/i })).toBeDisabled();
  });

  test("check first reports what it would do, in words", async ({ page }) => {
    await pick(page);
    await page.getByRole("button", { name: /check first/i }).click();
    await expect(page.getByText(/what this would fill/i)).toBeVisible({ timeout: 30_000 });
    // The counts a reader needs: how many of ours matched, out of how many of
    // theirs, and how many of theirs we hold nothing for.
    await expect(page.getByText(/of our properties matched/i)).toBeVisible();
    await expect(page.getByText(/we hold nothing for/i)).toBeVisible();
  });

  test("and it says which fields, not just how many rows", async ({ page }) => {
    await pick(page);
    await page.getByRole("button", { name: /check first/i }).click();
    await expect(page.getByText(/what this would fill/i)).toBeVisible({ timeout: 30_000 });
    const panel = page.getByText("Trade Me sales export")
      .locator("xpath=ancestor::div[contains(@class,'rounded-card')][1]");
    const text = await panel.innerText();
    expect(text, `no field breakdown in the panel:\n${text}`)
      .toMatch(/floor area|council valuation|land area|ownership type|photo/i);
  });

  test("filling for real says filled, not would fill", async ({ page }) => {
    await pick(page);
    await page.getByRole("button", { name: /fill gaps/i }).click();
    await expect(page.getByText(/^filled$/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test("the wrong file is refused with a message naming the problem",
    async ({ page }) => {
      await pick(page, "who,what\n1,2\n", "the-wrong-one.csv");
      await page.getByRole("button", { name: /check first/i }).click();
      const err = page.getByText(/does not look like a trade me sales export/i);
      await expect(err, "an admin who picked the wrong CSV was not told which")
        .toBeVisible({ timeout: 30_000 });
    });

  test("a customer cannot reach it", async ({ page, request }) => {
    const res = await request.post("/api/admin/trademe-fill", {
      multipart: { file: { name: "x.csv", mimeType: "text/csv", buffer: Buffer.from(THEIR_CSV) } },
    });
    expect(res.status(), "the Trade Me endpoint answered an unauthenticated caller")
      .toBeGreaterThanOrEqual(400);
  });
});
