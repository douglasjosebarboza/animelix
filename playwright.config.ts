import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // A suíte cria várias contas em sequência a partir do mesmo IP. Os
    // limites de produção (5 registros/hora por IP) bloqueariam o teste.
    env: {
      RATE_LIMIT_REGISTER_PER_IP: "100",
      RATE_LIMIT_LOGIN_PER_IP: "100",
      RATE_LIMIT_LOGIN_PER_ACCOUNT: "100",
      RATE_LIMIT_LOGIN_PER_ACCOUNT_IP: "100",
      RATE_LIMIT_SEARCH_PER_IP: "1000",
      RATE_LIMIT_ANILIST_SEARCH_PER_MINUTE: "1000",
      RATE_LIMIT_ANILIST_DETAIL_PER_MINUTE: "1000",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
