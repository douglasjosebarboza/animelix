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

test("cross-user cannot access another user's watchlist entry (404)", async ({ page }) => {
  const aEmail = `e2e+${Date.now()}-a@animelix.test`;
  const bEmail = `e2e+${Date.now()}-b@animelix.test`;

  // User A adds an anime and lands on their watchlist entry
  await signUp(page, aEmail);
  await page.goto("/search?q=frieren");
  await page.getByRole("button", { name: "Adicionar" }).first().click();
  await expect(page).toHaveURL(/\/anime\/\d+/);
  await page.getByRole("button", { name: /add to watchlist/i }).click();
  await expect(page).toHaveURL(/\/watchlist\/\d+/);
  const aUrl = page.url();

  // User A signs out
  await page.goto("/watchlist");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);

  // User B logs in and tries to open A's entry -> must 404, not reveal it
  await signUp(page, bEmail);
  await page.goto(aUrl);
  await expect(page.getByText(/404/)).toBeVisible();
});

test("deleting the account logs the user out and invalidates the session", async ({
  page,
}) => {
  const email = `e2e+${Date.now()}@animelix.test`;

  await signUp(page, email);
  await page.goto("/watchlist");
  await page.getByRole("button", { name: "Excluir conta" }).click();
  await expect(page).toHaveURL(/\/login/);

  // The (now deleted) session can no longer reach protected routes
  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login/);
});
