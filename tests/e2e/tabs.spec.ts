import { test, expect } from "@playwright/test";

test.describe("Tab navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("all four tabs are present in the nav", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Live Overview/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Live Sites/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fleet Directory/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Site Map/ })).toBeVisible();
  });

  test.describe("Live Overview tab", () => {
    test("is active by default and shows the main chart", async ({ page }) => {
      await expect(page.getByText("Storage Output — Today")).toBeVisible();
      await expect(page.getByText("Hourly Average")).toBeVisible();
    });
  });

  test.describe("Live Sites tab", () => {
    test("shows a list of BESS sites after clicking", async ({ page }) => {
      await page.getByRole("button", { name: /Live Sites/ }).click();
      // Site leaderboard should appear
      await expect(page.getByText(/MW/).first()).toBeVisible({ timeout: 15_000 });
    });

    test("has active/all toggle", async ({ page }) => {
      await page.getByRole("button", { name: /Live Sites/ }).click();
      await expect(
        page.getByRole("button", { name: /Active Only|Show All/i })
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe("Fleet Directory tab", () => {
    test("shows a search input and storage units", async ({ page }) => {
      await page.getByRole("button", { name: /Fleet Directory/ }).click();
      await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10_000 });
      // Some BMU entries should appear
      await expect(page.locator("text=/Storage Units|BMU|MW/i").first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test.describe("Site Map tab", () => {
    test("renders the UK map", async ({ page }) => {
      await page.getByRole("button", { name: /Site Map/ }).click();
      // SVG map element should appear (react-simple-maps renders an <svg>)
      await expect(page.locator("svg").first()).toBeVisible({ timeout: 15_000 });
    });

    test("has colour mode toggle", async ({ page }) => {
      await page.getByRole("button", { name: /Site Map/ }).click();
      await expect(
        page.getByRole("button", { name: /capacity|operator/i })
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test("switching tabs does not lose overlay state", async ({ page }) => {
    // Enable Prices overlay on overview
    await page.getByRole("button", { name: /Prices/ }).click();
    await expect(page.getByText("Octopus Agile Prices")).toBeVisible();

    // Navigate away
    await page.getByRole("button", { name: /Live Sites/ }).click();

    // Return to overview
    await page.getByRole("button", { name: /Live Overview/ }).click();

    // Prices overlay should still be visible
    await expect(page.getByText("Octopus Agile Prices")).toBeVisible();
  });
});
