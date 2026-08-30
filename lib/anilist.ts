import { logEvent } from "@/lib/logger";

function anilistEndpoint(): string {
  return process.env.ANILIST_GRAPHQL_URL ?? "https://graphql.anilist.co";
}

export type AnimeSeed = {
  anilistId: number;
  title: string;
  coverImageUrl: string | null;
  episodeCount: number | null;
  seasonCount: number | null;
};

export class AnilistError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AnilistError";
  }
}

type RawMedia = {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string } | null;
  episodes?: number | null;
  averageScore?: number | null;
  genres?: string[] | null;
};

function pickTitle(title: RawMedia["title"]): string {
  return title.english ?? title.romaji ?? title.native ?? "Sem título";
}

function mapMedia(m: RawMedia): AnimeSeed {
  // AniList does not expose a season count on Media (only `season`/`seasonYear`),
  // so seasonCount is left null for now.
  return {
    anilistId: m.id,
    title: pickTitle(m.title),
    coverImageUrl: m.coverImage?.large ?? null,
    episodeCount: m.episodes ?? null,
    seasonCount: null,
  };
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

// AniList enforces 90 req/min. Concurrent requests for the same query are
// deduplicated through this in-flight map, guaranteeing a single HTTP call and
// keeping us well under the limit for repeated reads of the same Anime.
const inflight = new Map<string, Promise<unknown>>();

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const key = JSON.stringify({ query, variables });
  const cached = inflight.get(key) as Promise<T> | undefined;
  if (cached) return cached;

  const promise = (async () => {
    let res: Response;
    try {
      res = await fetch(anilistEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
      });
    } catch (cause) {
      logEvent("anilist_error", { error: `network: ${(cause as Error).message}` });
      throw new AnilistError(`Falha de rede ao chamar AniList: ${(cause as Error).message}`);
    }

    if (!res.ok) {
      logEvent("anilist_error", { status: res.status });
      throw new AnilistError(`AniList respondeu ${res.status}`, res.status);
    }

    const json = (await res.json()) as GraphQLResponse<T>;
    if (json.errors?.length) {
      logEvent("anilist_error", { errors: json.errors.map((e) => e.message) });
      throw new AnilistError(json.errors.map((e) => e.message).join("; "));
    }
    if (!json.data) {
      throw new AnilistError("Resposta da AniList sem `data`");
    }
    return json.data;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

const SEARCH_QUERY = `
  query Search($q: String) {
    Page(perPage: 20) {
      media(search: $q, type: ANIME, isAdult: false) {
        id
        title { romaji english native }
        coverImage { large }
        episodes
      }
    }
  }
`;

const BY_ID_QUERY = `
  query ById($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { romaji english native }
      coverImage { large }
      episodes
    }
  }
`;

export async function searchAnime(query: string): Promise<AnimeSeed[]> {
  const data = await request<{ Page: { media: RawMedia[] } }>(SEARCH_QUERY, { q: query });
  return (data.Page?.media ?? []).map(mapMedia);
}

export async function getAnimeById(anilistId: number): Promise<AnimeSeed> {
  const data = await request<{ Media: RawMedia }>(BY_ID_QUERY, { id: anilistId });
  if (!data.Media) {
    throw new AnilistError(`Anime ${anilistId} não encontrado na AniList`);
  }
  return mapMedia(data.Media);
}

export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";
export type SeasonRef = { season: Season; year: number };

export function currentSeason(now: Date = new Date()): SeasonRef {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  if (month <= 3) return { season: "WINTER", year };
  if (month <= 6) return { season: "SPRING", year };
  if (month <= 9) return { season: "SUMMER", year };
  return { season: "FALL", year };
}

export type SeasonalAnime = {
  anilistId: number;
  title: string;
  coverImageUrl: string | null;
  episodeCount: number | null;
  averageScore: number | null;
  genres: string[];
};

const SEASONAL_QUERY = `
  query Seasonal($season: MediaSeason, $seasonYear: Int, $genre: [String], $perPage: Int) {
    Page(perPage: $perPage) {
      media(
        season: $season
        seasonYear: $seasonYear
        type: ANIME
        isAdult: false
        sort: SCORE_DESC
        genre_in: $genre
      ) {
        id
        title { romaji english native }
        coverImage { large }
        episodes
        averageScore
        genres
      }
    }
  }
`;

function mapSeasonal(m: RawMedia): SeasonalAnime {
  return {
    anilistId: m.id,
    title: pickTitle(m.title),
    coverImageUrl: m.coverImage?.large ?? null,
    episodeCount: m.episodes ?? null,
    averageScore: m.averageScore ?? null,
    genres: m.genres ?? [],
  };
}

export async function getSeasonalAnime(opts: {
  season: Season;
  seasonYear: number;
  genre?: string;
  perPage?: number;
}): Promise<SeasonalAnime[]> {
  const data = await request<{ Page: { media: RawMedia[] } }>(SEASONAL_QUERY, {
    season: opts.season,
    seasonYear: opts.seasonYear,
    genre: opts.genre ? [opts.genre] : undefined,
    perPage: opts.perPage ?? 30,
  });
  return (data.Page?.media ?? []).map(mapSeasonal);
}
