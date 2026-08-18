import { expect, test, Page } from "@playwright/test";
import { ADMIN, CUSTOMER, PROMOTER, apiToken } from "./helpers";

/**
 * Every view, at phone and tablet width.
 *
 * The failure this is built to catch is horizontal overflow: one element wider
 * than the screen makes the whole page scroll sideways, and every other element
 * on it drift out of alignment. It is the single most common way a desktop
 * layout "is broken on mobile", and it is invisible on a laptop — which is why
 * it survives until someone opens the site on a phone.
 *
 * When it fails, the message names the offending element and how far past the
 * edge it goes, because "the page overflows" is not something anyone can act on.
 */
const VIEWPORTS = [
  { name: "phone",          width: 390,  height: 844 },   // iPhone 14
  { name: "phone-small",    width: 360,  height: 780 },   // common Android
  { name: "tablet",         width: 820,  height: 1180 },  // iPad Air, portrait
  { name: "tablet-landscape", width: 1180, height: 820 },
];

/** Pages a signed-in customer can reach. */
const CUSTOMER_ROUTES = [
  "/today", "/properties", "/trends", "/underpriced",
  "/subdividable", "/wishlists", "/ask", "/settings",
];

const ADMIN_ROUTES = [
  "/admin/dashboard", "/admin/users", "/admin/pending", "/admin/promoters",
  "/admin/maps", "/admin/data-probe", "/admin/bugs", "/admin/upload",
];

const PUBLIC_ROUTES = ["/sign-in", "/sign-up"];

/** Set the token straight into localStorage — far faster than the form, and
 *  this suite is testing layout, not authentication. */
async function authAs(page: Page, email: string, role: string) {
  const token = await apiToken(email);
  await page.addInitScript(
    ([t, r]) => {
      localStorage.setItem("ollie_token", t as string);
      localStorage.setItem("ollie_role", r as string);
    },
    [token, role],
  );
}

/** Anything sticking out past the right edge, with enough detail to fix it. */
async function overflowing(page: Page, width: number) {
  return page.evaluate((w) => {
    const doc = document.documentElement;
    const bad: { tag: string; cls: string; right: number; text: string }[] = [];
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      // Only the element itself, not every ancestor that contains it.
      if (r.right > w + 1 && el.children.length < 40) {
        const parent = el.parentElement;
        const parentOver = parent
          ? parent.getBoundingClientRect().right > w + 1
          : false;
        if (!parentOver) {
          bad.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 70),
            right: Math.round(r.right),
            text: (el.textContent || "").trim().slice(0, 40),
          });
        }
      }
    });
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, bad: bad.slice(0, 6) };
  }, width);
}

async function checkPage(page: Page, path: string, vw: number) {
  // domcontentloaded, not networkidle. The app polls a badge count every
  // minute, so the network is never idle and waiting for it spent the whole
  // test budget on one page. A fixed settle is enough to measure layout.
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_200);

  const r = await overflowing(page, vw);
  const detail = r.bad.length
    ? r.bad.map((b) => `<${b.tag} class="${b.cls}"> reaches ${b.right}px  "${b.text}"`).join("\n      ")
    : "(no single element identified — check a parent's min-width or a fixed width)";

  expect(
    r.scrollWidth,
    `${path} scrolls sideways at ${vw}px — content is ${r.scrollWidth}px wide.\n      ${detail}`,
  ).toBeLessThanOrEqual(r.clientWidth + 1);
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // One test per route. Batching them read nicely and then timed out before
    // measuring anything, which is worse than useless — it looked like a
    // layout failure when nothing had been checked at all.
    for (const path of PUBLIC_ROUTES) {
      test(`${path} fits`, async ({ page }) => {
        await checkPage(page, path, vp.width);
      });
    }

    for (const path of CUSTOMER_ROUTES) {
      test(`${path} fits`, async ({ page }) => {
        await authAs(page, CUSTOMER, "user");
        await checkPage(page, path, vp.width);
      });
    }

    for (const path of ADMIN_ROUTES) {
      test(`${path} fits`, async ({ page }) => {
        await authAs(page, ADMIN, "admin");
        await checkPage(page, path, vp.width);
      });
    }

    test("/promoter fits, on every tab", async ({ page }) => {
      await authAs(page, PROMOTER, "promoter");
      await checkPage(page, "/promoter", vp.width);
      // Each tab lays out differently — a table that fits on one can overflow
      // on another, and nobody looks at the tab they did not open.
      for (const tab of ["My ads", "Media pack"]) {
        await page.getByRole("button", { name: tab }).click();
        await page.waitForTimeout(900);
        const r = await overflowing(page, vp.width);
        const detail = r.bad.map((b) => `<${b.tag} class="${b.cls}"> reaches ${b.right}px`).join("\n      ");
        expect(r.scrollWidth, `/promoter "${tab}" tab scrolls sideways at ${vp.width}px\n      ${detail}`)
          .toBeLessThanOrEqual(r.clientWidth + 1);
      }
    });

    test("a property page fits", async ({ page }) => {
      await authAs(page, CUSTOMER, "user");
      await page.goto("/properties", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_500);
      const link = page.locator('a[href^="/property/"]').first();
      if (!(await link.count())) test.skip(true, "no listing link on the page");
      await link.click();
      await page.waitForTimeout(1_800);
      const r = await overflowing(page, vp.width);
      const detail = r.bad.map((b) => `<${b.tag} class="${b.cls}"> reaches ${b.right}px`).join("\n      ");
      expect(r.scrollWidth, `a property page scrolls sideways at ${vp.width}px\n      ${detail}`)
        .toBeLessThanOrEqual(r.clientWidth + 1);
    });
  });
}

/** The rail becomes a drawer below 900px. If the button is missing or the
 *  drawer will not open, the whole app is unnavigable on a phone. */
test.describe("phone navigation", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the menu button opens the nav drawer", async ({ page }) => {
    await authAs(page, CUSTOMER, "user");
    await page.goto("/today");
    await page.waitForLoadState("networkidle").catch(() => {});

    const menu = page.getByRole("button", { name: /open menu/i }).first();
    await expect(menu, "no menu button on a phone — the app cannot be navigated")
      .toBeVisible();
    await menu.click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("link", { name: /all properties/i }).first()).toBeVisible();
  });

  test("tapping a nav link closes the drawer and navigates", async ({ page }) => {
    await authAs(page, CUSTOMER, "user");
    await page.goto("/today");
    await page.waitForLoadState("networkidle").catch(() => {});
    const menu = page.getByRole("button", { name: /open menu/i }).first();
    await menu.click();
    await page.waitForTimeout(400);
    await page.getByRole("link", { name: /all properties/i }).first().click();
    await expect(page).toHaveURL(/\/properties/);
  });
});
