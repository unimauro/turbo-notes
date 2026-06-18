import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. Playwright brings up the WHOLE stack itself (so a single
 * `npm run test:e2e` is enough): the Django backend on :8000 (sqlite, migrated
 * on boot) and the Next.js dev server on :3000 pointing at it. The browser
 * calls the API cross-origin, so the backend's default CORS allowlist already
 * includes http://localhost:3000.
 *
 * Locally the backend command assumes Django is importable (activate the venv,
 * or `pip install -r backend/requirements.txt`); CI's e2e job sets that up.
 * `reuseExistingServer` lets you keep your own dev servers running between runs.
 */
// A dedicated port (not the usual 3000) so a stray dev server can't collide.
const FRONTEND_PORT = 3010;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;
const API_URL = "http://localhost:8000/api/v1";

export default defineConfig({
  testDir: "./e2e",
  // The flow mutates a shared DB (one user per run), so keep it serial.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: FRONTEND_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // createcachetable: the throttle uses Django's DatabaseCache, whose table
      // is created by this command (not migrations). Without it, throttled
      // endpoints (register/login) 500 on the cache write.
      command:
        "python manage.py migrate --noinput && python manage.py createcachetable && python manage.py runserver 8000",
      cwd: "../backend",
      url: "http://localhost:8000/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DJANGO_DEBUG: "true",
        DJANGO_SECRET_KEY: "e2e-only-secret",
        CORS_ALLOWED_ORIGINS: FRONTEND_URL,
      },
    },
    {
      command: `npm run dev -- -p ${FRONTEND_PORT}`,
      url: FRONTEND_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: API_URL },
    },
  ],
});
