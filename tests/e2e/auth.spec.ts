import { test, expect } from "@playwright/test";

test("register, login, and reach the protected watchlist", async ({ page }) => {
  const email = `user_${Date.now()}@example.com`;
  const password = "password123";

  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL(/\/login$/);

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

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
  await page.click('button[type="submit"]');
  await expect(page.getByText("Email ou senha incorretos")).toBeVisible();
});

test("registering a duplicate email shows an error", async ({ page }) => {
  const email = `dup_${Date.now()}@example.com`;
  const password = "password123";

  // First registration succeeds and redirects to /login
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/login$/);

  // Second registration with same email shows error
  await page.goto("/register");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await expect(page.getByText("Este email já está cadastrado")).toBeVisible();
});
