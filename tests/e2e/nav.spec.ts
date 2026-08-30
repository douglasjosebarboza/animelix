import { test, expect } from "@playwright/test";

test("logged-out users see Home/Buscar/Entrar/Registrar and no Perfil", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Buscar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Registrar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Perfil" })).toHaveCount(0);
  // The logo is the only home entry point; no separate "Home" link.
  await expect(page.getByRole("link", { name: "Home" })).toHaveCount(0);
});

test("nav is hidden on login and register pages", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Animelix" })).toHaveCount(0);

  await page.goto("/register");
  await expect(page.getByRole("link", { name: "Animelix" })).toHaveCount(0);
});

test("logged-in users see Perfil and Sair, and Sair logs them out", async ({ page }) => {
  const email = `e2e+${Date.now()}@animelix.test`;
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

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Perfil" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/$|\/\?/);
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Perfil" })).toHaveCount(0);
});
