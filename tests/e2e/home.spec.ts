import { test, expect } from "@playwright/test";

test("home loads without login and shows the season filter", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Temporada atual/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: /Gênero/i })).toBeVisible();
});

test("selecting a genre filters by query param", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: /Gênero/i }).selectOption("Action");
  await page.getByRole("button", { name: /Filtrar/i }).click();
  await expect(page).toHaveURL(/\?genre=Action/);
  await expect(page.getByRole("combobox", { name: /Gênero/i })).toHaveValue("Action");
});
