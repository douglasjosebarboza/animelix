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
  await page.getByRole("button", { name: "marcar episódio 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "remover episódio 1", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/anime\/\d+/);
  const watchId = page.url().match(/\/anime\/(\d+)/)![1];

  // Counter shows 1 of 26 watched
  await expect(page.locator("dl")).toContainText("1/26");

  // Mark episode 2 as well
  await page.getByRole("button", { name: "marcar episódio 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "remover episódio 2", exact: true })).toBeVisible();
  await expect(page.locator("dl")).toContainText("2/26");

  // Unmark episode 1 -> entry kept (episode 2 still watched)
  await page.getByRole("button", { name: "remover episódio 1", exact: true }).click();
  await expect(page.getByRole("button", { name: "remover episódio 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "remover episódio 2", exact: true })).toBeVisible();
  await expect(page.locator("dl")).toContainText("1/26");

  // Remove the last watched episode -> entry deleted, stays on the anime page
  await page.getByRole("button", { name: "remover episódio 2", exact: true }).click();
  await expect(page).toHaveURL(/\/anime\/1/);
  await expect(page.getByRole("button", { name: "remover episódio 2", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remover", exact: true })).toHaveCount(0);
  await expect(page.locator("dl")).toContainText("0/26");

  // Watchlist no longer links to the anime
  await page.goto("/watchlist");
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

  await page.goto("/anime/1");
  await expect(page.getByRole("heading", { name: /Cowboy Bebop/i })).toBeVisible();
  await page.getByRole("button", { name: "marcar episódio 1", exact: true }).click();
  await expect(page).toHaveURL(/\/anime\/\d+/);

  // New entry exists (entry controls visible, counter shows progress)
  await expect(page.getByRole("button", { name: "Remover", exact: true })).toBeVisible();
  await expect(page.locator("dl")).toContainText("/");

  // Mark another episode; entry still there
  await page.getByRole("button", { name: "marcar episódio 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remover", exact: true })).toBeVisible();

  // On the watchlist it is grouped under Assistindo or Completo
  await page.goto("/watchlist");
  await expect(page.getByRole("heading", { name: /Assistindo|Completo/ })).toBeVisible();
});

test("bulk e paginação", async ({ page }) => {
  const bulkEmail = `e2e+${Date.now()}@animelix.test`;
  const bulkPassword = "supersecret123";

  await page.goto("/register");
  await page.getByLabel("Email").fill(bulkEmail);
  await page.getByLabel("Senha").fill(bulkPassword);
  await page.getByRole("button", { name: /cadastrar/i }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(bulkEmail);
  await page.getByLabel("Senha").fill(bulkPassword);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/watchlist/);

  // Paginação: página 2 começa no episódio 13 (títulos vêm da AniList ao
  // vivo — asserir estrutura, não nomes)
  await page.goto("/anime/1?epPage=2");
  await expect(page.getByRole("heading", { name: /Cowboy Bebop/i })).toBeVisible();
  await expect(page.getByText("Página 2 de 3")).toBeVisible();
  await expect(page.locator("ul li").first()).toContainText("13.");
  await expect(page.getByText("Episódio 12", { exact: true })).toHaveCount(0);

  // "até aqui" no ep 3 -> 3 assistidos
  await page.goto("/anime/1");
  await page.getByRole("button", { name: "marcar até o episódio 3", exact: true }).click();
  await expect(page.locator("dl")).toContainText("3/26");

  // "Marcar todos" -> tudo assistido
  await page.getByRole("button", { name: "Marcar todos" }).click();
  await expect(page.locator("dl")).toContainText("26/26");

  // "Desmarcar todos" -> entry some, permanece na página do anime
  await page.getByRole("button", { name: "Desmarcar todos" }).click();
  await expect(page).toHaveURL(/\/anime\/1/);
  await expect(page.locator("p", { hasText: "Status:" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remover", exact: true })).toHaveCount(0);
  await expect(page.locator("dl")).toContainText("0/26");
});
