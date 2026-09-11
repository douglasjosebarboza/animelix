import { test, expect } from "@playwright/test";

test("home falls back to jikan when anilist 403", async ({ page }) => {
  await page.route("https://graphql.anilist.co", (r) =>
    r.fulfill({ status: 403, body: '{"errors":[{"message":"disabled"}]}' }),
  );
  await page.route("https://api.jikan.moe/**", (r) =>
    r.fulfill({
      status: 200,
      body: JSON.stringify({
        data: [
          {
            mal_id: 1,
            title_english: "Fallback",
            images: { jpg: { large_image_url: "https://cdn.myanimelist.net/1.jpg" } },
            episodes: 12,
          },
        ],
      }),
    }),
  );
  await page.goto("/");
  await expect(page.locator("ul").first()).toBeVisible();
});
