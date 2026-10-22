import { expect, test } from "@playwright/test";

async function signUp(page: import("@playwright/test").Page, email: string) {
  const password = "supersecret123";
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /cadastrar/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/watchlist/);
}

test("cross-user cannot see another user's watch progress", async ({ page }) => {
  const aEmail = `e2e+${Date.now()}-a@animelix.test`;
  const bEmail = `e2e+${Date.now()}-b@animelix.test`;

  // User A marks episode 1 (auto-adds) and lands on the anime page
  await signUp(page, aEmail);
  await page.goto("/anime/1");
  await expect(page.getByRole("heading", { name: /Cowboy Bebop/i })).toBeVisible();
  await page.getByRole("button", { name: "marcar episódio 1", exact: true }).click();
  await expect(page).toHaveURL(/\/anime\/\d+/);
  await expect(page.getByRole("button", { name: "remover episódio 1", exact: true })).toBeVisible();
  const aUrl = page.url();

  // User A signs out
  await page.goto("/watchlist");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();

  // User B logs in and opens the same anime page -> sees a fresh state:
  // no watched episodes from A, no entry controls (no Remover/Status)
  await signUp(page, bEmail);
  await page.goto(aUrl);
  await expect(page.getByRole("button", { name: "remover episódio 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remover", exact: true })).toHaveCount(0);
  await expect(page.locator("p", { hasText: "Status:" })).toHaveCount(0);
});

test("deleting the account requires the password and then logs the user out", async ({
  page,
}) => {
  const email = `e2e+${Date.now()}@animelix.test`;

  await signUp(page, email);
  await page.goto("/watchlist");

  // The delete form must ask for the password — a hijacked session alone
  // must not be enough to destroy the account.
  await page.getByRole("button", { name: "Excluir Conta" }).click();
  await page.fill('input[name="password"]', "wrongpassword");
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByText("Senha incorreta")).toBeVisible();
  await expect(page).toHaveURL(/\/watchlist/);

  // With the right password the account is deleted and the session dies.
  await page.fill('input[name="password"]', "supersecret123");
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page).toHaveURL(/\/login/);

  // The (now deleted) session can no longer reach protected routes
  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login/);
});
