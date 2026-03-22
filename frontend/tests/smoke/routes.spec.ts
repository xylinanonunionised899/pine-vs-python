/**
 * Route-level smoke tests for the Trading Strategy Comparator.
 *
 * Prerequisites (servers must be running before `npx playwright test`):
 *
 *   # Backend
 *   cd "D:\python , pine script\backend"
 *   PYTHONPATH="D:\python , pine script" python -m uvicorn app.main:app --port 8000
 *
 *   # Frontend dev server
 *   cd "D:\python , pine script\frontend"
 *   npm run dev
 *
 * Coverage:
 *   - All 6 routes render without blank/error page
 *   - Workspace: demo banner + charts present on clean state
 *   - Library: built-in indicators load; loading one into Workspace updates editors
 *   - Imports: page renders, dataset list visible
 *   - Runs: seeded run-demo-ema listed
 *   - Chat panel: model list loads (or offline fallback shown)
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = "http://127.0.0.1:5173";

// ── helpers ───────────────────────────────────────────────────────────────────

async function waitForNoSpinner(page: Page) {
  // Wait for any "Running..." or "Loading..." text to clear
  await page.waitForFunction(() =>
    !document.body.innerText.includes("Starting backend") &&
    !document.body.innerText.includes("Loading..."),
  );
}

// ── Route smoke: no blank pages, no error banners ─────────────────────────────

test.describe("Route smoke — all routes render", () => {
  const routes = [
    { path: "/workspace", label: "Workspace" },
    { path: "/imports",   label: "Imports" },
    { path: "/runs",      label: "Runs" },
    { path: "/settings",  label: "Settings" },
    { path: "/library",   label: "Library" },
    { path: "/alignment", label: "Alignment" },
  ];

  for (const { path, label } of routes) {
    test(`${label} (${path}) renders without blank page`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await waitForNoSpinner(page);

      // Body has visible text content (not blank)
      const bodyText = await page.evaluate(() => document.body.innerText.trim());
      expect(bodyText.length).toBeGreaterThan(20);

      // No unhandled JS error banner from React
      const errorBoundary = page.locator("text=Something went wrong");
      await expect(errorBoundary).not.toBeVisible();

      // App shell nav tabs are visible
      await expect(page.locator("nav.nav-tabs")).toBeVisible();
    });
  }
});

// ── Workspace: demo first-run ─────────────────────────────────────────────────

test.describe("Workspace — demo first-run state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/workspace`);
    await waitForNoSpinner(page);
    // Wait for refreshCore to complete (dataset pill changes from "No dataset saved")
    await page.waitForFunction(() =>
      document.body.innerText.includes("Dataset linked"),
      { timeout: 10_000 },
    );
  });

  test("demo banner is visible", async ({ page }) => {
    await expect(
      page.locator("text=Showing bundled demo data"),
    ).toBeVisible();
  });

  test("Pine pane has a chart canvas", async ({ page }) => {
    // lightweight-charts renders into a <canvas> inside the Pine article
    const pineArticle = page.locator("article.workspace-card").first();
    await expect(pineArticle.locator("canvas")).toBeVisible({ timeout: 12_000 });
  });

  test("Python pane has a chart canvas", async ({ page }) => {
    const pythonArticle = page.locator("article.workspace-card").nth(1);
    await expect(pythonArticle.locator("canvas")).toBeVisible({ timeout: 8_000 });
  });

  test("Run Python button is present and enabled", async ({ page }) => {
    const btn = page.locator("button", { hasText: /Run Python/i }).first();
    await expect(btn).toBeVisible();
    await expect(btn).not.toBeDisabled();
  });

  test("Run Pine button is present", async ({ page }) => {
    const btn = page.locator("button", { hasText: /Run Pine/i });
    await expect(btn).toBeVisible();
  });
});

// ── Imports: dataset list ─────────────────────────────────────────────────────

test.describe("Imports — dataset list", () => {
  test("demo dataset appears in saved datasets list", async ({ page }) => {
    await page.goto(`${BASE}/imports`);
    await waitForNoSpinner(page);
    // Wait for dataset list to load
    await expect(
      page.locator("text=Demo Dataset"),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("import form fields are present", async ({ page }) => {
    await page.goto(`${BASE}/imports`);
    await waitForNoSpinner(page);
    // File path input should be present
    await expect(page.locator("input[type='text']").first()).toBeVisible();
  });
});

// ── Runs: seeded run listed ───────────────────────────────────────────────────

test.describe("Runs — seeded run", () => {
  test("run-demo-ema is listed with completed lifecycle", async ({ page }) => {
    await page.goto(`${BASE}/runs`);
    await waitForNoSpinner(page);
    await expect(
      page.locator("text=run-demo-ema"),
    ).toBeVisible({ timeout: 8_000 });
    await expect(
      page.locator("text=completed"),
    ).toBeVisible();
  });
});

// ── Library: built-ins present, load into Workspace ──────────────────────────

test.describe("Library — built-in indicators", () => {
  test("EMA Crossover appears in the library", async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await waitForNoSpinner(page);
    await expect(
      page.locator("text=EMA Crossover"),
    ).toBeVisible({ timeout: 8_000 });
  });

  test("loading RSI into Workspace updates the Pine editor", async ({ page }) => {
    await page.goto(`${BASE}/library`);
    await waitForNoSpinner(page);

    // Click Load to Workspace for RSI
    const rsiRow = page.locator("text=RSI").locator("..");
    const loadBtn = rsiRow.locator("button", { hasText: /Load|Workspace/i });
    if (await loadBtn.count() === 0) {
      // Fallback: find Load button in the RSI card area
      const card = page.locator("[data-indicator-id='ind-rsi'], .indicator-card").filter({ hasText: "RSI" });
      await card.locator("button").first().click();
    } else {
      await loadBtn.first().click();
    }

    // Should navigate to workspace
    await page.waitForURL(/\/workspace/, { timeout: 5_000 });

    // Pine editor should contain RSI code
    const editorContent = await page.locator(".monaco-editor").first().innerText();
    expect(editorContent.toLowerCase()).toContain("rsi");
  });
});

// ── Settings: models load ─────────────────────────────────────────────────────

test.describe("Settings — model list", () => {
  test("settings page renders with model selector or offline message", async ({ page }) => {
    await page.goto(`${BASE}/settings`);
    await waitForNoSpinner(page);

    // Either a model selector exists or an offline-fallback message is shown
    const hasModelSelector = await page.locator("select").count() > 0;
    const hasOfflineMsg = await page.locator("text=offline").count() > 0
      || await page.locator("text=Ollama").count() > 0;
    expect(hasModelSelector || hasOfflineMsg).toBe(true);
  });
});
