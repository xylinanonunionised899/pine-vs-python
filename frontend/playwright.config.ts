import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests run against live dev server (http://127.0.0.1:5173).
 * Start both servers before running:
 *
 *   # Terminal 1 — backend
 *   cd "D:\python , pine script\backend"
 *   PYTHONPATH="D:\python , pine script" python -m uvicorn app.main:app --port 8000
 *
 *   # Terminal 2 — frontend
 *   cd "D:\python , pine script\frontend"
 *   npm run dev
 *
 *   # Terminal 3 — run tests
 *   npx playwright test
 */
export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
