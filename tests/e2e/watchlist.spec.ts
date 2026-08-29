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
  const watchId = page.url().match(/\/watchlist\/(\d+)/)![1];

  // Mark two distinct episodes (one "assistido" per watched episode)
  await page.getByRole("button", { name: "marcar episódio 1", exact: true }).click();
  await expect(page.getByText(/assistido:/)).toHaveCount(1);
  await page.getByRole("button", { name: "marcar episódio 2", exact: true }).click();
  await expect(page.getByText(/assistido:/)).toHaveCount(2);

  // Remove one specific episode -> still tracked with the other
  await page.getByRole("button", { name: "remover episódio 2", exact: true }).click();
  await expect(page.getByText(/assistido:/)).toHaveCount(1);

  // Remove the last watched episode -> entry leaves the watchlist
  await page.getByRole("button", { name: "remover episódio 1", exact: true }).click();
  await expect(page).toHaveURL(/\/watchlist$/);
  await expect(page.locator(`a[href="/watchlist/${watchId}"]`)).toHaveCount(0);
});

test("removing the only watched episode returns cleanly to the watchlist", async ({
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
  const watchId = page.url().match(/\/watchlist\/(\d+)/)![1];

  // Mark exactly one episode
  await page.getByRole("button", { name: "marcar episódio 1", exact: true }).click();
  await expect(page.getByText(/assistido:/)).toBeVisible();

  // Remove the only watched episode -> entry is deleted; the action must not
  // error by re-rendering the now-deleted entry page.
  await page.getByRole("button", { name: "remover episódio 1", exact: true }).click();
  await expect(page).toHaveURL(/\/watchlist$/);
  await expect(page.getByText(/application error/i)).toHaveCount(0);
  await expect(page.locator(`a[href="/watchlist/${watchId}"]`)).toHaveCount(0);
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

test("paused entry resumes to watching when a new episode is marked", async ({
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

  // First mark -> watching
  await page.getByRole("button", { name: "Marcar" }).first().click();
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("watching");

  // Pause it manually
  await page.getByRole("button", { name: "paused" }).click();
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("paused");

  // Watching a new (previously unwatched) episode resumes to watching
  await page.getByRole("button", { name: "marcar episódio 2", exact: true }).click();
  await expect(page.getByText(/assistido:/)).toBeVisible();
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("watching");
});
