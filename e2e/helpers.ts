import { expect, Page, request } from "@playwright/test";

/**
 * The seeded world. Matches olliev6/seed_e2e.py exactly.
 *
 * The password is read from the environment with a deliberately non-credential
 * default, and seed_e2e.py reads the same variable. Keep the two in step — if
 * they drift, every sign-in in every suite fails for a reason that looks
 * nothing like a wrong password.
 */
export const PW = process.env.E2E_PASSWORD || "not-a-secret-e2e";
export const ADMIN = "admin@apexdemo.co.nz";
export const CUSTOMER = "customer@apexdemo.co.nz";
export const TRIAL = "trial@apexdemo.co.nz";
export const PROMOTER = "promoter@apexdemo.co.nz";
export const REF_CODE = "E2ETEST";

/** Sign in through the real form, the way a person does. */
export async function signIn(page: Page, email: string, password = PW) {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20_000 });
}

/**
 * Watch for a navigation that should NOT happen.
 *
 * The promoter bug was a redirect firing a second after the page settled, from
 * a poll nobody clicked. Asserting the URL once right after load would have
 * missed it — the assertion has to stay open over a window of time, which is
 * what this does.
 */
export async function stayPut(page: Page, expectedPath: string, ms = 4_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const path = new URL(page.url()).pathname;
    expect(path, `navigated away to ${path} while sitting on ${expectedPath}`)
      .toContain(expectedPath);
    await page.waitForTimeout(400);
  }
}

/** Every failed request the page made, so a test can assert on status codes. */
export function trackResponses(page: Page) {
  const seen: { url: string; status: number }[] = [];
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/")) seen.push({ url: u.pathname, status: r.status() });
  });
  return seen;
}

/**
 * A token straight from the API.
 *
 * The responsive suite checks layout on dozens of pages; driving the sign-in
 * form for each one would spend most of the run re-authenticating and none of
 * it measuring. Auth has its own tests — this just needs to be past the door.
 */
export async function apiToken(email: string, password = PW): Promise<string> {
  const ctx = await request.newContext({ baseURL: "http://127.0.0.1:3100" });
  const res = await ctx.post("/api/auth/sign-in", {
    form: { username: email, password },
  });
  if (!res.ok()) throw new Error(`sign-in for ${email} failed: ${res.status()}`);
  const body = await res.json();
  await ctx.dispose();
  return body.access_token as string;
}
