import { logEvent } from "@/lib/logger";
import { hitRateLimit } from "@/lib/rateLimit";
import { getLimits } from "@/lib/limits";

function anilistEndpoint(): string {
  return process.env.ANILIST_GRAPHQL_URL ?? "https://graphql.anilist.co";
}

export type NextAiringEpisode = {
  episode: number;
  airingAt: number;
  timeUntilAiring: number;
};

export type AnimeSeed = {
  anilistId: number;
  title: string;
  coverImageUrl: string | null;
  episodeCount: number | null;
  seasonCount: number | null;
  description: string | null;
  episodeTitles: (string | null)[];
  nextAiringEpisode: NextAiringEpisode | null;
};

export class AnilistError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** true quando o erro foi a cota global da AniList, não a API em si. */
    readonly isBudgetExceeded = false,
  ) {
    super(message);
    this.name = "AnilistError";
  }
}

type RawMedia = {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string; extraLarge?: string } | null;
  episodes?: number | null;
  averageScore?: number | null;
  genres?: string[] | null;
  description?: string | null;
  streamingEpisodes?: { title?: string | null }[] | null;
  nextAiringEpisode?: {
    episode?: number | null;
    airingAt?: number | null;
    timeUntilAiring?: number | null;
  } | null;
};

function pickTitle(title: RawMedia["title"]): string {
  return title.english ?? title.romaji ?? title.native ?? "Sem título";
}

export function sanitizeDescription(html: string | null | undefined): string | null {
  if (html == null) return null;
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

export function mapEpisodeTitles(
  list: { title?: string | null }[] | null | undefined,
): (string | null)[] {
  if (!list) return [];
  return list.map((ep, i) => {
    const t = ep?.title?.trim();
    if (!t) return null;
    const prefix = new RegExp(`^episode\\s+${i + 1}\\s*[-–:]\\s*`, "i");
    const cleaned = t.replace(prefix, "").trim();
    return cleaned === "" ? null : cleaned;
  });
}

function mapNextAiringEpisode(
  raw: RawMedia["nextAiringEpisode"],
): NextAiringEpisode | null {
  const episode = raw?.episode;
  const airingAt = raw?.airingAt;
  if (episode == null || airingAt == null) return null;
  const timeUntilAiring = raw?.timeUntilAiring ?? Math.max(0, airingAt * 1000 - Date.now()) / 1000;
  return { episode, airingAt, timeUntilAiring: Math.max(0, Math.floor(timeUntilAiring)) };
}

function mapMedia(m: RawMedia): AnimeSeed {
  // AniList does not expose a season count on Media (only `season`/`seasonYear`),
  // so seasonCount is left null for now.
  return {
    anilistId: m.id,
    title: pickTitle(m.title),
    coverImageUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    episodeCount: m.episodes ?? null,
    seasonCount: null,
    description: sanitizeDescription(m.description),
    episodeTitles: mapEpisodeTitles(m.streamingEpisodes),
    nextAiringEpisode: mapNextAiringEpisode(m.nextAiringEpisode),
  };
}

export function formatTimeUntilAiring(airingAtSeconds: number, nowMs: number = Date.now()): string | null {
  const diffSeconds = Math.floor(airingAtSeconds - nowMs / 1000);
  if (diffSeconds <= 0) return null;
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  if (minutes > 0) return `${minutes}min`;
  return "breve";
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
};

// AniList enforces 90 req/min. Concurrent requests for the same query are
// deduplicated through this in-flight map, guaranteeing a single HTTP call and
// keeping us well under the limit for repeated reads of the same Anime.
const inflight = new Map<string, Promise<unknown>>();

/**
 * Teto GLOBAL de chamadas de saída à AniList.
 *
 * O cache (`unstable_cache`) protege contra consultas repetidas, mas cada
 * consulta nova ainda consome cota. O rate limit por IP não basta: vários IPs
 * somados estouram os 90 req/min da AniList e o IP do app é banido — o site
 * inteiro cai. Este teto é distribuído (Redis), então vale para todas as
 * instâncias de lambda somadas.
 */
const ANILIST_WINDOW_MS = 60_000;

/**
 * Baldes da cota global.
 *
 * "search" e "detail" são independentes de propósito: uma enxurrada de
 * buscas com termos inéditos (cada uma é um cache-miss) consome o balde
 * único e derruba também as páginas de anime que ainda não estão em cache.
 * Separando, o ataque de cache-miss só consegue esgotar o balde de busca.
 *
 * A soma dos dois (25 + 40 = 65/min) fica abaixo dos 90 req/min que a
 * AniList permite — estourar isso faz a Vercel banir o IP do app e derruba
 * o site inteiro.
 */
type AnilistBucket = "search" | "detail";

function budgetKey(bucket: AnilistBucket): string {
  return `anilist:global:${bucket}`;
}

function budgetLimit(bucket: AnilistBucket): number {
  const limits = getLimits();
  return bucket === "search"
    ? limits.anilistSearchCallsPerMinute
    : limits.anilistDetailCallsPerMinute;
}

async function request<T>(
  query: string,
  variables: Record<string, unknown>,
  bucket: AnilistBucket = "detail",
): Promise<T> {
  const key = JSON.stringify({ query, variables });
  const cached = inflight.get(key) as Promise<T> | undefined;
  if (cached) return cached;

  const promise = (async () => {
    // Falha fechada: melhor recusar a consulta do que queimar a cota global
    // e ser banido da AniList.
    const budget = await hitRateLimit(
      budgetKey(bucket),
      budgetLimit(bucket),
      ANILIST_WINDOW_MS,
    );
    if (!budget.ok) {
      logEvent("anilist_budget_exhausted", { bucket });
      throw new AnilistError(
        "Limite de requisições à AniList atingido. Tente novamente em instantes.",
        undefined,
        true,
      );
    }

    let res: Response;
    try {
      res = await fetch(anilistEndpoint(), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Accept": "application/json",
          "User-Agent": "Animelix/1.0"
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(8_000),
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
        coverImage { extraLarge large }
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
      coverImage { extraLarge large }
      episodes
      description(asHtml: false)
      streamingEpisodes { title }
      nextAiringEpisode { episode airingAt timeUntilAiring }
    }
  }
`;

export async function searchAnime(query: string): Promise<AnimeSeed[]> {
  const data = await request<{ Page: { media: RawMedia[] } }>(
    SEARCH_QUERY,
    { q: query },
    "search",
  );
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
        coverImage { extraLarge large }
        episodes
        averageScore
        genres
      }
    }
  }
`;

export async function getSeasonalAnime(opts: {
  season: Season;
  seasonYear: number;
  genre?: string;
  perPage?: number;
}): Promise<AnimeSeed[]> {
  const data = await request<{ Page: { media: RawMedia[] } }>(SEASONAL_QUERY, {
    season: opts.season,
    seasonYear: opts.seasonYear,
    genre: opts.genre ? [opts.genre] : undefined,
    perPage: opts.perPage ?? 30,
  });
  return (data.Page?.media ?? []).map(mapMedia);
}


