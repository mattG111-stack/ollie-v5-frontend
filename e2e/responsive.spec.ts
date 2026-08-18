import { expect, test, Page } from "@playwright/test";
import { ADMIN, CUSTOMER, PROMOTER, apiToken, firstListingId } from "./helpers";

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

/**
 * Columns too narrow to hold their own content.
 *
 * The overflow check above cannot see this, and it is what actually broke the
 * property page on a phone. A CSS grid told to be "1fr 1fr" does not overflow
 * when the screen shrinks — it SQUEEZES, to two 171px columns, and every figure
 * inside gets clipped mid-number ("$3,990,00"). scrollWidth stays exactly equal
 * to clientWidth, the suite reports green, and the page is unusable.
 *
 * So measure the columns themselves. Below MIN_COL a side-by-side layout has
 * stopped being a layout, and the block should have stacked.
 */
const MIN_COL = 170;      // below this a column has stopped being a column
const PANEL_H = 120;      // above this the thing in it is a panel, not a tile

async function crampedGrids(page: Page, width: number) {
  return page.evaluate(([minCol, panelH]) => {
    const out: { cols: string; narrowest: number; tallest: number; text: string }[] = [];
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display !== "grid") return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const cols = cs.gridTemplateColumns.split(" ").map(parseFloat).filter((n) => !isNaN(n));
      if (cols.length < 2) return;
      const narrowest = Math.min(...cols);
      if (narrowest >= minCol) return;
      // Narrow alone is not the fault. A row of spec tiles is SUPPOSED to be
      // narrow — BEDS 4, BATHS 2 — and it reads fine at 110px. What does not
      // read is a PANEL squeezed into the same width: a pricing card with eight
      // label-and-figure rows, at 171px, with every figure cut mid-number.
      // Height is what separates the two, so measure the children.
      const tallest = Math.max(
        0,
        ...Array.from(el.children).map((c) => c.getBoundingClientRect().height),
      );
      if (tallest < panelH) return;
      out.push({
        cols: cs.gridTemplateColumns,
        narrowest: Math.round(narrowest),
        tallest: Math.round(tallest),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 46),
      });
    });
    return out.slice(0, 6);
  }, [MIN_COL, PANEL_H]);
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

  // Only on a phone. Two 171px panels side by side is a real layout on a
  // tablet and a squeeze on a phone, so the same number cannot judge both.
  if (vw <= 480) {
    const cramped = await crampedGrids(page, vw);
    expect(
      cramped,
      `${path} keeps a side-by-side layout at ${vw}px that is too narrow to read:\n      `
        + cramped.map((c) => `columns ${c.cols} — narrowest ${c.narrowest}px, ${c.tallest}px tall  "${c.text}"`).join("\n      "),
    ).toEqual([]);
  }
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
      // Straight to the page by id. Going via /properties meant hunting for a
      // link on a screen that opens in MAP view, finding none, and skipping —
      // which is how the single most layout-heavy page in the app went
      // unmeasured while this suite reported green.
      const id = await firstListingId();
      await page.goto(`/property/${id}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2_500);
      const r = await overflowing(page, vp.width);
      const detail = r.bad.map((b) => `<${b.tag} class="${b.cls}"> reaches ${b.right}px`).join("\n      ");
      expect(r.scrollWidth, `a property page scrolls sideways at ${vp.width}px\n      ${detail}`)
        .toBeLessThanOrEqual(r.clientWidth + 1);
      if (vp.width <= 480) {
        const cramped = await crampedGrids(page, vp.width);
        expect(
          cramped,
          `the property page keeps a side-by-side layout at ${vp.width}px:\n      `
            + cramped.map((c) => `columns ${c.cols} — narrowest ${c.narrowest}px, ${c.tallest}px tall  "${c.text}"`).join("\n      "),
        ).toEqual([]);
      }
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
