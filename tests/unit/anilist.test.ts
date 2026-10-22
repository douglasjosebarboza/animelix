import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as http from "node:http";
import {
  searchAnime,
  getAnimeById,
  getSeasonalAnime,
  currentSeason,
  AnilistError,
  sanitizeDescription,
  mapEpisodeTitles,
  formatTimeUntilAiring,
  type SeasonRef,
} from "@/lib/anilist";

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

function seasonalMedia(id: number, title: string, averageScore: number | null, genres: string[]) {
  return {
    ...media(id, title),
    averageScore,
    genres,
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
        if (parsed.variables.id === 99) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            data: {
              Media: {
                ...media(99, "Anime 99"),
                description: "Longa<br><br>\nsinopse aqui",
                streamingEpisodes: [{ title: "Episode 1 - Asteroid Blues" }, { title: null }],
              },
            },
          }));
          return;
        }
        if (parsed.variables.id === 100) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({
            data: {
              Media: {
                ...media(100, "Anime 100"),
                nextAiringEpisode: { episode: 13, airingAt: 1789913760, timeUntilAiring: 432742 },
              },
            },
          }));
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Media: media(parsed.variables.id, `Anime ${parsed.variables.id}`) } }));
      } else if (parsed.query.includes("Seasonal")) {
        const genre = parsed.variables.genre;
        const filtered =
          genre == null
            ? [seasonalMedia(10, "Frieren", 84, ["Drama", "Adventure"]), seasonalMedia(11, "Naruto", 70, ["Action"])]
            : [seasonalMedia(10, "Frieren", 84, ["Drama", "Adventure"]), seasonalMedia(11, "Naruto", 70, ["Action"])].filter(
                (m) => m.genres.some((g: string) => genre.includes(g)),
              );
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Page: { media: filtered } } }));
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

  it("deduplicates 10 concurrent reads into exactly 1 AniList call", async () => {
    const spy = vi.spyOn(globalThis, "fetch");

    const results = await Promise.all(
      Array.from({ length: 10 }, () => getAnimeById(7)),
    );
    // all share the same resolved value
    for (const r of results) expect(r).toEqual(results[0]);

    // spy-level: exactly one network request left the process for this query
    const netCalls = (spy.mock.calls as unknown[][]).filter((c) =>
      String(c[0]).includes(stubUrl),
    );
    expect(netCalls).toHaveLength(1);
    spy.mockRestore();

    // server-level: the stub received exactly one ById request for id 7
    const serverCalls = received.filter(
      (r) => r.query.includes("ById") && r.variables.id === 7,
    );
    expect(serverCalls).toHaveLength(1);
  });

  it("throws AnilistError when the API returns 500", async () => {
    await expect(getAnimeById(0)).rejects.toBeInstanceOf(AnilistError);
  });

  describe("currentSeason", () => {
    it("maps months to the correct AniList season", () => {
      const cases: [string, SeasonRef][] = [
        ["2026-01-15", { season: "WINTER", year: 2026 }],
        ["2026-04-15", { season: "SPRING", year: 2026 }],
        ["2026-07-15", { season: "SUMMER", year: 2026 }],
        ["2026-11-15", { season: "FALL", year: 2026 }],
      ];
      for (const [iso, expected] of cases) {
        expect(currentSeason(new Date(iso))).toEqual(expected);
      }
    });

    it("keeps the year stable across the winter boundary (Jan-Mar)", () => {
      expect(currentSeason(new Date("2026-03-31"))).toEqual({ season: "WINTER", year: 2026 });
    });
  });

  describe("getSeasonalAnime", () => {
    it("maps seasonal results", async () => {
      const results = await getSeasonalAnime({ season: "FALL", seasonYear: 2026 });
      expect(results[0]).toMatchObject({
        anilistId: 10,
        title: "Frieren",
        coverImageUrl: "https://img/10.jpg",
      });
      expect(results[0].episodeCount).toBe(12);
    });

    it("passes the genre filter to AniList when provided", async () => {
      const results = await getSeasonalAnime({ season: "FALL", seasonYear: 2026, genre: "Action" });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Naruto");
    });

  });

describe("rich detail fields", () => {
  it("sanitizeDescription remove tags e colapsa whitespace", () => {
    expect(sanitizeDescription("A<br><br>\nB  C")).toBe("A B C");
    expect(sanitizeDescription(null)).toBeNull();
    expect(sanitizeDescription("  ")).toBeNull();
  });

  it("mapEpisodeTitles mapeia por posição e limpa prefixo", () => {
    expect(
      mapEpisodeTitles([{ title: "Episode 1 - Asteroid Blues" }, { title: null }, {}]),
    ).toEqual(["Asteroid Blues", null, null]);
    expect(mapEpisodeTitles(null)).toEqual([]);
    expect(mapEpisodeTitles(undefined)).toEqual([]);
  });

  it("getAnimeById retorna description e episodeTitles", async () => {
    const anime = await getAnimeById(99);
    expect(anime.description).toBe("Longa sinopse aqui");
    expect(anime.episodeTitles[0]).toBe("Asteroid Blues");
    expect(anime.episodeTitles[1]).toBeNull();
  });

  it("getAnimeById retorna null para nextAiringEpisode quando ausente", async () => {
    const anime = await getAnimeById(99);
    expect(anime.nextAiringEpisode).toBeNull();
  });

  it("getAnimeById mapeia nextAiringEpisode quando presente", async () => {
    const anime = await getAnimeById(100);
    expect(anime.nextAiringEpisode).toEqual({ episode: 13, airingAt: 1789913760, timeUntilAiring: 432742 });
  });
});

describe("formatTimeUntilAiring", () => {
  const now = new Date("2026-09-15T12:00:00Z").getTime();
  const at = (diffSeconds: number) => now / 1000 + diffSeconds;

  it("formata dias e horas", () => {
    expect(formatTimeUntilAiring(at(5 * 86400 + 3 * 3600), now)).toBe("5d 3h");
    expect(formatTimeUntilAiring(at(2 * 86400), now)).toBe("2d");
  });

  it("formata horas e minutos", () => {
    expect(formatTimeUntilAiring(at(3 * 3600 + 12 * 60), now)).toBe("3h 12min");
    expect(formatTimeUntilAiring(at(45 * 60), now)).toBe("45min");
  });

  it("retorna 'breve' abaixo de 1min e null quando já passou", () => {
    expect(formatTimeUntilAiring(at(30), now)).toBe("breve");
    expect(formatTimeUntilAiring(at(0), now)).toBeNull();
    expect(formatTimeUntilAiring(at(-60), now)).toBeNull();
  });
});
});
