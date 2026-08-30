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

test("auto-pause populates the activity feed", async ({ page }) => {
  const email = `e2e+${Date.now()}@animelix.test`;

  await signUp(page, email);

  await page.goto("/search?q=frieren");
  await expect(page.getByText(/resultado/i)).toBeVisible();
  await page.getByRole("button", { name: "Adicionar" }).first().click();
  await expect(page).toHaveURL(/\/anime\/\d+/);
  await page.getByRole("button", { name: /add to watchlist/i }).click();
  await expect(page).toHaveURL(/\/watchlist\/\d+/);

  // Mark episode 1 with a watchedAt 31 days in the past
  const past = new Date();
  past.setDate(past.getDate() - 31);
  await page
    .locator('input[name="watchedAt"]')
    .first()
    .fill(past.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Marcar" }).first().click();

  // Read-time auto-pause flips it to paused
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("paused");

  // The job endpoint is reachable and runs without error
  const res = await page.request.post("/api/auto-pause");
  expect(res.status()).toBe(200);

  // The feed shows the automatic transition
  await page.goto("/activity");
  await expect(page.getByText(/Pausado por inatividade/)).toBeVisible();
});

test("activity feed is private to each user", async ({ page }) => {
  const aEmail = `e2e+${Date.now()}-a@animelix.test`;
  const bEmail = `e2e+${Date.now()}-b@animelix.test`;

  // User A adds the anime and triggers a transition
  await signUp(page, aEmail);
  await page.goto("/search?q=frieren");
  await page.getByRole("button", { name: "Adicionar" }).first().click();
  await expect(page).toHaveURL(/\/anime\/\d+/);
  await page.getByRole("button", { name: /add to watchlist/i }).click();
  await expect(page).toHaveURL(/\/watchlist\/\d+/);
  const title = (await page.locator("h1").innerText()).trim();

  const past = new Date();
  past.setDate(past.getDate() - 31);
  await page
    .locator('input[name="watchedAt"]')
    .first()
    .fill(past.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Marcar" }).first().click();
  await expect(page.locator("p", { hasText: "Status:" })).toContainText("paused");

  // Sign out, sign in as User B
  await page.goto("/watchlist");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  await signUp(page, bEmail);

  // User B must NOT see User A's entry in their feed
  await page.goto("/activity");
  await expect(page.getByText(title)).toHaveCount(0);
});
