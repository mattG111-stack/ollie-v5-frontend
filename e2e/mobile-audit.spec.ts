import { test, Page } from "@playwright/test";
import { ADMIN, CUSTOMER, PROMOTER, apiToken } from "./helpers";

/**
 * What actually makes a page hard to use on a phone.
 *
 * The overflow test in responsive.spec.ts proves a page does not scroll
 * sideways. That is worth having and it is not the same as usable: a page with
 * 10px type, buttons too small to hit with a thumb, and a table you have to
 * drag inside passes it comfortably.
 *
 * This one MEASURES and REPORTS rather than asserting. The point is to find out
 * how bad it is before deciding what to fix — a threshold picked before looking
 * at the numbers just encodes a guess.
 *
 *   npx playwright test e2e/mobile-audit.spec.ts --reporter=list
 *
 * Thresholds are the platform guidelines, not opinions:
 *   44x44 CSS px  — Apple's minimum touch target
 *   16px on inputs — below this, iOS Safari ZOOMS the page on focus, and the
 *                    user is left at 1.3x with no obvious way back
 *   14px body      — smaller is where reading becomes squinting
 */
const PHONE = { width: 390, height: 844 };

const ROUTES: [string, "customer" | "admin" | "promoter" | "public"][] = [
  ["/sign-in", "public"],
  ["/sign-up", "public"],
  ["/today", "customer"],
  ["/properties", "customer"],
  ["/trends", "customer"],
  ["/underpriced", "customer"],
  ["/subdividable", "customer"],
  ["/wishlists", "customer"],
  ["/ask", "customer"],
  ["/settings", "customer"],
  ["/promoter", "promoter"],
  ["/admin/dashboard", "admin"],
  ["/admin/users", "admin"],
  ["/admin/promoters", "admin"],
  ["/admin/bugs", "admin"],
];

const WHO = { customer: CUSTOMER, admin: ADMIN, promoter: PROMOTER } as const;

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

async function audit(page: Page) {
  return page.evaluate(() => {
    const px = (v: string) => parseFloat(v) || 0;
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };

    // --- tap targets: anything you are meant to hit with a thumb ------------
    const tappable = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [onclick]',
      ),
    ).filter(seen);

    const small = tappable
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 32),
        };
      })
      .filter((t) => t.w < 44 || t.h < 44);

    // --- type size ----------------------------------------------------------
    const inputs = Array.from(
      document.querySelectorAll<HTMLElement>("input, select, textarea"),
    ).filter(seen);
    // Below 16px, iOS Safari zooms the whole page when the field is focused.
    const zoomers = inputs
      .map((el) => ({ tag: el.tagName.toLowerCase(), size: px(getComputedStyle(el).fontSize),
                      name: el.getAttribute("name") || el.getAttribute("aria-label") || "" }))
      .filter((i) => i.size < 16);

    const textish = Array.from(document.querySelectorAll<HTMLElement>("p, td, li, span, div"))
      .filter((el) => seen(el) && el.children.length === 0 && (el.textContent || "").trim().length > 12);
    const tiny = textish
      .map((el) => ({ size: px(getComputedStyle(el).fontSize),
                      text: (el.textContent || "").trim().slice(0, 34) }))
      .filter((t) => t.size > 0 && t.size < 13);

    // --- things you have to scroll INSIDE ----------------------------------
    // Allowed by the overflow test on purpose, and still a real cost: a table
    // you drag sideways on a phone hides columns behind a gesture nobody is
    // told about.
    const innerScroll = Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter(seen)
      .filter((el) => el.scrollWidth > el.clientWidth + 8 && el.clientWidth > 100)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || "").toString().slice(0, 50),
        visible: el.clientWidth,
        actual: el.scrollWidth,
      }))
      .slice(0, 8);

    // --- the viewport tag: without it nothing else matters ------------------
    const meta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";

    return {
      tappableTotal: tappable.length,
      small: small.slice(0, 10),
      smallCount: small.length,
      zoomers: zoomers.slice(0, 6),
      zoomerCount: zoomers.length,
      tiny: tiny.slice(0, 6),
      tinyCount: tiny.length,
      innerScroll,
      viewportMeta: meta,
    };
  });
}

test.describe("mobile usability audit", () => {
  test.use({ viewport: PHONE });

  for (const [path, who] of ROUTES) {
    test(`audit ${path}`, async ({ page }) => {
      if (who !== "public") await authAs(page, WHO[who], who === "customer" ? "user" : who);
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_400);
      const a = await audit(page);

      const lines: string[] = [`\n── ${path} @ ${PHONE.width}px ──`];
      if (!a.viewportMeta.includes("width=device-width")) {
        lines.push(`  !! viewport meta is "${a.viewportMeta}" — must include width=device-width`);
      }
      lines.push(`  tap targets under 44px: ${a.smallCount} of ${a.tappableTotal}`);
      for (const s of a.small) lines.push(`      <${s.tag}> ${s.w}x${s.h}  "${s.label}"`);
      lines.push(`  inputs under 16px (iOS zooms on focus): ${a.zoomerCount}`);
      for (const z of a.zoomers) lines.push(`      <${z.tag} name="${z.name}"> ${z.size}px`);
      lines.push(`  text under 13px: ${a.tinyCount}`);
      for (const t of a.tiny) lines.push(`      ${t.size}px  "${t.text}"`);
      lines.push(`  scrolls inside: ${a.innerScroll.length}`);
      for (const i of a.innerScroll) {
        lines.push(`      <${i.tag} class="${i.cls}"> shows ${i.visible}px of ${i.actual}px`);
      }
      console.log(lines.join("\n"));
    });
  }
});
