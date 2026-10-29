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
    await expect(page).toHaveURL(/\/today(?:[/?#]|$)/);
  });

  test("Today opens first, with an explicit Ask Olie tab", async ({ page }) => {
    await signIn(page, CUSTOMER);
    await expect(page).toHaveURL(/\/today$/);
    const tabs = page.getByRole("navigation", { name: "Today and Ask Olie" });
    await expect(tabs.getByRole("link", { name: /today/i })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Your daily brief" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Your watchlist" })).toBeVisible();
    await tabs.getByRole("link", { name: "Ask Olie", exact: true }).click();
    await expect(page).toHaveURL(/\/ask$/);
    await expect(tabs.getByRole("link", { name: "Ask Olie", exact: true })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: /today/i }).click();
    await expect(page).toHaveURL(/\/today$/);
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
    await expect(page).toHaveURL(/\/today(?:[/?#]|$)/);
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

test('personal brief uses approved preview evidence without asking Olie automatically', async ({page}) => {
  const token=await (await import('./helpers')).apiToken(CUSTOMER);
  const response=await page.request.get('/api/properties?search=1%20Test%20Street', {headers:{Authorization:`Bearer ${token}`}});
  const listing=(await response.json()).rows.find((r:{address:string})=>r.address.startsWith('1 Test Street'));
  expect(listing).toBeTruthy();
  await page.route('**/api/preferences', async route=> {
    if(route.request().method()!=='GET')return route.continue();
    await route.fulfill({json:{goals:[],suburbs:[listing.suburb],districts:[],min_price:null,max_price:null,min_beds:null,state:'current',set_at:null,reviewed_at:null,review_due_at:null,review_after_days:14}});
  });
  const automaticWrites:string[]=[];
  page.on('request',r=>{if(r.method()==='POST' && (/\/assistant\/ask(?:\?|$)/.test(r.url())||/\/wishlists\/\d+\/seen/.test(r.url())))automaticWrites.push(r.url());});
  await signIn(page,CUSTOMER);
  const brief=page.getByRole('region',{name:'Your daily brief'});
  await expect(brief).toContainText(listing.address);
  await expect(brief.getByLabel('Recorded asking-price change')).toContainText('Price reduced $50,000');
  await expect(brief.getByRole('link',{name:/View sales and suburb trends/})).toHaveAttribute('href',`/trends?${new URLSearchParams({suburb:listing.suburb})}`);
  expect(automaticWrites).toEqual([]);
});
