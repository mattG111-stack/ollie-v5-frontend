import { defineConfig, devices } from "@playwright/test";

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
    launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined },
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
        JWT_SECRET: "e2e-secret",
        CORS_ORIGINS: "*",
        SEED_ADMIN_EMAIL: "admin@apexdemo.co.nz",
        SEED_ADMIN_PASSWORD: "TestPass123",
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
