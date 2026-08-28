import { expect, test } from "@playwright/test";

const email = `e2e+${Date.now()}@animelix.test`;
const password = "supersecret123";

test("add to watchlist -> mark -> undo -> mark again", async ({ page }) => {
  // Register
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /cadastrar/i }).click();
  await expect(page).toHaveURL(/\/login/);

  // Login
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/watchlist/);

  // Search and add the first result (catalogs the Anime)
  await page.goto("/search?q=frieren");
  await expect(page.getByText(/resultado/i)).toBeVisible();
  await page.getByRole("button", { name: "Adicionar" }).first().click();
  await expect(page).toHaveURL(/\/anime\/\d+/);

  // Add the catalogued Anime to the watchlist
  await page.getByRole("button", { name: /add to watchlist/i }).click();
  await expect(page).toHaveURL(/\/watchlist\/\d+/);

  // Mark episode 1
  const firstMark = page.getByRole("button", { name: "Marcar" }).first();
  await firstMark.click();
  await expect(page.getByText(/assistido:/)).toBeVisible();

  // Undo last
  await page.getByRole("button", { name: /undo last/i }).click();
  await expect(page.getByText(/assistido:/)).toHaveCount(0);

  // Mark again
  await page.getByRole("button", { name: "Marcar" }).first().click();
  await expect(page.getByText(/assistido:/)).toBeVisible();
});

test("marking first episode transitions to watching; manual override sets dropped", async ({
  page,
}) => {
  const e2eEmail = `e2e+${Date.now()}@animelix.test`;
  const e2ePassword = "supersecret123";

  await page.goto("/register");
  await page.getByLabel("Email").fill(e2eEmail);
  await page.getByLabel("Senha").fill(e2ePassword);
  await page.getByRole("button", { name: /cadastrar/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(e2eEmail);
  await page.getByLabel("Senha").fill(e2ePassword);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/watchlist/);

  await page.goto("/search?q=frieren");
  await expect(page.getByText(/resultado/i)).toBeVisible();
  await page.getByRole("button", { name: "Adicionar" }).first().click();
  await expect(page).toHaveURL(/\/anime\/\d+/);
  await page.getByRole("button", { name: /add to watchlist/i }).click();
  await expect(page).toHaveURL(/\/watchlist\/\d+/);

  // New entry starts as plan_to_watch
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("plan_to_watch");

  // Marking the first episode triggers the automatic transition to watching
  await page.getByRole("button", { name: "Marcar" }).first().click();
  await expect(page.getByText(/assistido:/)).toBeVisible();
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("watching");

  // Manual override to dropped
  await page.getByRole("button", { name: "dropped" }).click();
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("dropped");
});
