import { test, expect } from "@playwright/test";

test("theme toggle flips dark mode and persists after reload", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Alternar tema" });
  await expect(toggle).toBeVisible();

  const startsDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );

  await toggle.click();
  const afterClick = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  expect(afterClick).toBe(!startsDark);

  await page.reload();
  const afterReload = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  expect(afterReload).toBe(afterClick);
});

test("home still renders content with the new theme", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main")).toBeVisible();
});
