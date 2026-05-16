import { test, expect } from "@playwright/test";

test.describe("Dashboard — core load", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("page title and header render", async ({ page }) => {
    await expect(page).toHaveTitle(/GB Grid/i);
    await expect(page.getByText("GB Grid Battery Storage")).toBeVisible();
    await expect(page.getByText("Elexon Insights API")).toBeVisible();
  });

  test("displays a live battery output reading", async ({ page }) => {
    // Hero MW figure — matches e.g. "1.23 GW" or "-456 MW"
    await expect(
      page.locator("text=/^-?\\d+(\\.\\d+)? (MW|GW)$/").first()
    ).toBeVisible();
  });

  test("stat cards are visible", async ({ page }) => {
    await expect(page.getByText("Peak Discharge")).toBeVisible();
    await expect(page.getByText("Peak Charge")).toBeVisible();
    await expect(page.getByText("Daily Average")).toBeVisible();
  });

  test("main chart renders (Storage Output — Today)", async ({ page }) => {
    await expect(page.getByText("Storage Output — Today")).toBeVisible();
  });

  test("shows data source as Elexon (not mock)", async ({ page }) => {
    // If mock badge appears, the API is down — this flags it
    const mockBadge = page.getByText("SIMULATED DATA");
    await expect(mockBadge).not.toBeVisible();
  });

  test("view selector shows BESS / Pumped Hydro / Total Storage tabs", async ({ page }) => {
    await expect(page.getByRole("button", { name: "BESS" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pumped Hydro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Total Storage" })).toBeVisible();
  });

  test("countdown timer is visible and ticking", async ({ page }) => {
    const timer = page.locator("text=/↻ \\d+s/");
    const first = await timer.textContent();
    await page.waitForTimeout(2000);
    const second = await timer.textContent();
    expect(first).not.toBe(second);
  });
});
