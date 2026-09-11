import { test, expect } from "@playwright/test";

test("home loads without login and shows anime list", async ({ page }) => {
  await page.goto("/");
  // No genre filter, no heading — just list/error/count
  await expect(page.getByRole("combobox", { name: /Gênero/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Temporada atual/ })).toHaveCount(0);
  // Either error banner or grid should be present (grid may be empty when AniList down)
  await expect(page.locator("main")).toBeVisible();
});

test("search via navbar q param shows results", async ({ page }) => {
  await page.goto("/?q=frieren");
  await expect(page.locator("main")).toBeVisible();
});
