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
      await btn.click(); // on
      await btn.click(); // off
      // Legend entry should disappear (only the button text remains, not the legend chip)
      const legendEntries = page.locator("span", { hasText: "Yesterday" });
      // Button itself has the text, but the legend span should not exist
      await expect(legendEntries).toHaveCount(1); // just the button
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

  test("multiple overlays can be active simultaneously", async ({ page }) => {
    await page.getByRole("button", { name: /Prices/ }).click();
    await page.getByRole("button", { name: /Carbon/ }).click();
    await expect(page.getByText("Octopus Agile Prices")).toBeVisible();
    await expect(page.getByText("Grid Carbon Intensity")).toBeVisible();
  });
});
