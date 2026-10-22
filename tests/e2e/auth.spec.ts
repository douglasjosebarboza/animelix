import { test, expect } from "@playwright/test";

test("register, login, and reach the protected watchlist", async ({ page }) => {
  const email = `user_${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /cadastrar/i }).click();

  await expect(page).toHaveURL(/\/login/);

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /entrar/i }).click();

  await expect(page).toHaveURL(/\/watchlist$/);
  await expect(page.getByRole("heading", { name: /Minha Watchlist/i })).toBeVisible();
});

test("unauthenticated visit to /watchlist redirects to /login", async ({
  page,
}) => {
  await page.goto("/watchlist");
  await expect(page).toHaveURL(/\/login$/);
});

test("login with wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "nobody@example.com");
  await page.fill('input[name="password"]', "wrongpassword");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page.getByText("Email ou senha incorretos")).toBeVisible();
});

test("registering a duplicate email does not reveal that the account exists", async ({
  page,
}) => {
  const email = `dup_${Date.now()}@example.com`;
  const password = "password123";

  // First registration succeeds and redirects to /login
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /cadastrar/i }).click();
  await expect(page).toHaveURL(/\/login/);

  // Second registration with the same email must look EXACTLY like the
  // success case — no message that reveals the account already exists.
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /cadastrar/i }).click();
  await expect(page).toHaveURL(/\/login\?created=1/);
  await expect(
    page.getByText("Se este e-mail ainda não estava cadastrado, sua conta foi criada."),
  ).toBeVisible();
  await expect(page.getByText(/já está cadastrado/i)).toHaveCount(0);
});

test("email is case-insensitive: the same address is one single account", async ({
  page,
}) => {
  const email = `case_${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/register");
  await page.fill('input[name="email"]', email.toUpperCase());
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /cadastrar/i }).click();
  await expect(page).toHaveURL(/\/login/);

  // Logging in with the lowercase variant must work.
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).toHaveURL(/\/watchlist/);
});
