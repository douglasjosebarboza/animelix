import { expect, test } from "@playwright/test";

const email = `e2e+${Date.now()}@animelix.test`;
const password = "supersecret123";

test("add to watchlist -> toggle Assistido -> remove", async ({ page }) => {
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

  // Use seeded anime 1 (Cowboy Bebop) directly — no AniList search needed
  await page.goto("/anime/1");
  await expect(page.getByRole("heading", { name: /Cowboy Bebop/i })).toBeVisible();

  // Mark episode 1 -> auto-adds to watchlist
  await page.getByRole("button", { name: "Assistido", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "✓ Assistido" })).toBeVisible();
  await expect(page).toHaveURL(/\/anime\/\d+/);
  const watchId = page.url().match(/\/anime\/(\d+)/)![1];

  // Initially watching (assistindo)
  await expect(page.locator("p", { hasText: "Status:" })).toContainText(/assistindo/i);

  // Mark episode 2 as well
  await page.getByRole("button", { name: "Assistido", exact: true }).first().click();
  await expect(page.getByRole("button", { name: "✓ Assistido" })).toHaveCount(2);

  // Unmark episode 1 -> entry kept (episode 2 still watched)
  await page.getByRole("button", { name: "✓ Assistido" }).first().click();
  await expect(page.getByRole("button", { name: "✓ Assistido" })).toHaveCount(1);

  // Remove the last watched episode -> entry deleted -> redirect to watchlist
  await page.getByRole("button", { name: "✓ Assistido" }).first().click();
  // Wait for redirect
  await expect(page).toHaveURL(/\/watchlist$/);
  await expect(page.locator(`a[href="/anime/${watchId}"]`)).toHaveCount(0);
});

test("watchlist groups entries by status", async ({ page }) => {
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

  await page.goto("/anime/2");
  await expect(page.getByRole("heading", { name: /Frieren/i })).toBeVisible();
  await page.getByRole("button", { name: "Assistido", exact: true }).first().click();
  await expect(page).toHaveURL(/\/anime\/\d+/);

  // New entry starts as assistindo
  await expect(page.getByText(/Status: assistindo/i)).toBeVisible();

  // Mark an episode; still assistindo (unless anime has 1 ep)
  await page.getByRole("button", { name: "Assistido", exact: true }).first().click();
  await expect(page.getByText(/Status: (assistindo|completado)/i)).toBeVisible();

  // On the watchlist it is grouped under Assistindo or Completo
  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: /Assistindo|Completo/ })).toBeVisible();
});
