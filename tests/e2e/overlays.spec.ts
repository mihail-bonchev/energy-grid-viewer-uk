import { test, expect } from "@playwright/test";

test.describe("Overlay toggles", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Ensure we are on the overview tab
    await page.getByRole("button", { name: /Live Overview/ }).click();
  });

  test.describe("Yesterday overlay", () => {
    test("toggle button is present", async ({ page }) => {
      await expect(page.getByRole("button", { name: /Yesterday/ })).toBeVisible();
    });

    test("clicking Yesterday adds a legend entry", async ({ page }) => {
      await page.getByRole("button", { name: /Yesterday/ }).click();
      await expect(page.locator("text=Yesterday").last()).toBeVisible();
    });

    test("clicking Yesterday again hides the legend entry", async ({ page }) => {
      const btn = page.getByRole("button", { name: /Yesterday/ });
      // Exact text matches only the legend label; the button reads "📅 Yesterday"
      const legendEntries = page.getByText("Yesterday", { exact: true });
      await btn.click(); // on
      await expect(legendEntries).toHaveCount(1);
      await btn.click(); // off
      await expect(legendEntries).toHaveCount(0);
    });
  });

  test.describe("Prices overlay", () => {
    test("Prices toggle is present", async ({ page }) => {
      await expect(page.getByRole("button", { name: /Prices/ })).toBeVisible();
    });

    test("clicking Prices shows the Octopus Agile chart section", async ({ page }) => {
      await page.getByRole("button", { name: /Prices/ }).click();
      await expect(page.getByText("Octopus Agile Prices")).toBeVisible();
    });

    test("Prices section shows unit and region info", async ({ page }) => {
      await page.getByRole("button", { name: /Prices/ }).click();
      await expect(page.getByText(/p\/kWh/)).toBeVisible();
      await expect(page.getByText(/Region/)).toBeVisible();
    });

    test("clicking Prices again hides the chart", async ({ page }) => {
      const btn = page.getByRole("button", { name: /Prices/ });
      await btn.click();
      await expect(page.getByText("Octopus Agile Prices")).toBeVisible();
      await btn.click();
      await expect(page.getByText("Octopus Agile Prices")).not.toBeVisible();
    });
  });

  test.describe("Carbon intensity overlay", () => {
    test("Carbon toggle is present", async ({ page }) => {
      await expect(page.getByRole("button", { name: /Carbon/ })).toBeVisible();
    });

    test("clicking Carbon shows the intensity chart section", async ({ page }) => {
      await page.getByRole("button", { name: /Carbon/ }).click();
      await expect(page.getByText("Grid Carbon Intensity")).toBeVisible();
    });

    test("Carbon section shows gCO₂ units", async ({ page }) => {
      await page.getByRole("button", { name: /Carbon/ }).click();
      await expect(page.getByText(/gCO/)).toBeVisible();
    });

    test("clicking Carbon again hides the chart", async ({ page }) => {
      const btn = page.getByRole("button", { name: /Carbon/ });
      await btn.click();
      await expect(page.getByText("Grid Carbon Intensity")).toBeVisible();
      await btn.click();
      await expect(page.getByText("Grid Carbon Intensity")).not.toBeVisible();
    });
  });

  test.describe("System price overlay", () => {
    test("System Price toggle is present", async ({ page }) => {
      await expect(page.getByRole("button", { name: /System Price/ })).toBeVisible();
    });

    test("clicking System Price shows the imbalance chart section", async ({ page }) => {
      await page.getByRole("button", { name: /System Price/ }).click();
      await expect(page.getByText(/System Price & Imbalance/)).toBeVisible();
      await expect(page.getByText(/SSP\/SBP/)).toBeVisible();
    });

    test("clicking System Price again hides the chart", async ({ page }) => {
      const btn = page.getByRole("button", { name: /System Price/ });
      await btn.click();
      await expect(page.getByText(/System Price & Imbalance/)).toBeVisible();
      await btn.click();
      await expect(page.getByText(/System Price & Imbalance/)).not.toBeVisible();
    });
  });

  test.describe("P&L price basis", () => {
    test("P&L can be valued at the system price", async ({ page }) => {
      await page.getByRole("button", { name: /P&L/ }).click();
      await page.getByRole("button", { name: /Value at System price/ }).click();
      await expect(page.getByText(/System \(imbalance\) price/).first()).toBeVisible();
    });
  });

  test("multiple overlays can be active simultaneously", async ({ page }) => {
    await page.getByRole("button", { name: /Prices/ }).click();
    await page.getByRole("button", { name: /Carbon/ }).click();
    await expect(page.getByText("Octopus Agile Prices")).toBeVisible();
    await expect(page.getByText("Grid Carbon Intensity")).toBeVisible();
  });
});
