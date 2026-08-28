import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as http from "node:http";
import { searchAnime, getAnimeById, AnilistError } from "@/lib/anilist";

let server: http.Server;
let stubUrl: string;
let received: { query: string; variables: Record<string, unknown> }[] = [];

function media(id: number, title: string) {
  return {
    id,
    title: { romaji: title, english: title, native: title },
    coverImage: { large: `https://img/${id}.jpg` },
    episodes: 12,
  };
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      received.push({ query: parsed.query ?? "", variables: parsed.variables ?? {} });
      if (parsed.query.includes("Search")) {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ data: { Page: { media: [media(1, "Frieren"), media(2, "Naruto")] } } }),
        );
      } else if (parsed.query.includes("ById")) {
        if (parsed.variables.id === 0) {
          res.statusCode = 500;
          res.end("boom");
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Media: media(parsed.variables.id, `Anime ${parsed.variables.id}`) } }));
      } else {
        res.statusCode = 500;
        res.end("boom");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as { port: number };
  stubUrl = `http://127.0.0.1:${port}/graphql`;
  process.env.ANILIST_GRAPHQL_URL = stubUrl;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  received = [];
  vi.restoreAllMocks();
});

describe("AniList client", () => {
  it("maps search results to AnimeSeed with cover and title", async () => {
    const results = await searchAnime("frieren");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      anilistId: 1,
      title: "Frieren",
      coverImageUrl: "https://img/1.jpg",
      episodeCount: 12,
      seasonCount: null,
    });
  });

  it("falls back to romaji title when english is missing", async () => {
    // Naruto has no english override in our stub, so romaji is used.
    const results = await searchAnime("naruto");
    expect(results[1].title).toBe("Naruto");
  });

  it("getAnimeById returns a single mapped seed", async () => {
    const anime = await getAnimeById(42);
    expect(anime.anilistId).toBe(42);
    expect(anime.title).toBe("Anime 42");
  });

  it("deduplicates concurrent requests for the same query (single HTTP call)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const [a, b] = await Promise.all([getAnimeById(7), getAnimeById(7)]);
    expect(a).toEqual(b);
    // one in-flight entry -> only one network request for identical args
    const calls = (spy.mock.calls as unknown[][]).filter((c) =>
      String(c[0]).includes(stubUrl),
    );
    expect(calls).toHaveLength(1);
  });

  it("throws AnilistError when the API returns 500", async () => {
    await expect(getAnimeById(0)).rejects.toBeInstanceOf(AnilistError);
  });
});
