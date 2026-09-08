import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { defineConfig, devices } from "@playwright/test";

/**
 * The browser these tests run in.
 *
 * This image ships Chromium under /opt/pw-browsers, but under the build number
 * it was installed with. Playwright asks for the build number IT was compiled
 * against, and when the two differ it does not fall back — it throws
 * "Executable doesn't exist" before a single assertion runs.
 *
 * That is not a test failure, it is no test at all, and it is how the whole
 * responsive suite came to be green while the app was visibly broken on a
 * phone: every spec errored at launch and nothing ever measured a layout.
 * So find whatever build is actually on disk rather than trusting the pin.
 */
function chromiumOnDisk(): string | undefined {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  const candidates = readdirSync(root)
    .filter((d) => d.startsWith("chromium-"))
    .map((d) => join(root, d, "chrome-linux", "chrome"))
    .filter((f) => existsSync(f));
  return candidates[0];
}

/**
 * Browser tests against the REAL stack: a real FastAPI backend on a seeded
 * SQLite database, and the real Next.js production build in front of it.
 *
 * Not jsdom, and not mocked fetches. The bug that made the promoter dashboard
 * unusable for five builds — a background poll hitting a paywalled endpoint and
 * the 402 handler redirecting — cannot be reproduced without a real server
 * answering 402 and a real browser obeying the redirect. Every layer that bug
 * passed through has to be in the test or the test cannot see it.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,          // one seeded database, shared
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Chromium is pre-installed in this image; never let Playwright fetch one.
    launchOptions: { executablePath: chromiumOnDisk() },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Rebuilt and reseeded per run, so a test can never pass because of a row
      // another test left behind.
      command: "python3 seed_e2e.py && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8100",
      cwd: "/home/user/olliev6",
      port: 8100,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: "sqlite:////tmp/e2e.db",
        JWT_SECRET: process.env.E2E_JWT || "not-a-secret-jwt",
        CORS_ORIGINS: "*",
        SEED_ADMIN_EMAIL: "admin@apexdemo.co.nz",
        // Same variable seed_e2e.py and e2e/helpers.ts read, same default.
        // Throwaway for a disposable local SQLite file, kept out of the source
        // so nothing here is shaped like a credential.
        E2E_PASSWORD: process.env.E2E_PASSWORD || "not-a-secret-e2e",
        SEED_ADMIN_PASSWORD: process.env.E2E_PASSWORD || "not-a-secret-e2e",
        PYTHONPATH: "/home/user/olliev6",
      },
    },
    {
      // BUILT here, not just started. Next resolves next.config.js rewrites at
      // BUILD time and writes the destination into .next/routes-manifest.json,
      // so BACKEND_ORIGIN set only at runtime is ignored and the app proxies to
      // whatever was baked in. Starting a prebuilt app pointed these tests at
      // the PRODUCTION backend — which is exactly the trap the same behaviour
      // sets for a staging deploy.
      command: "npx next build && npx next start -p 3100",
      port: 3100,
      reuseExistingServer: false,
      timeout: 420_000,
      env: {
        BACKEND_ORIGIN: "http://127.0.0.1:8100",
        // Loopback must not go through this container's egress proxy, which
        // answers 403 for anything off its allowlist.
        NO_PROXY: "127.0.0.1,localhost",
        no_proxy: "127.0.0.1,localhost",
      },
    },
  ],
});
