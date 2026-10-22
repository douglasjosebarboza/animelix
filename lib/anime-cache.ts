import { unstable_cache } from "next/cache";
import { catalog } from "@/lib/catalog";
import { getRedis } from "@/lib/redis";
import { logEvent } from "@/lib/logger";
import { AnilistError, type AnimeSeed, type Season } from "@/lib/anilist";

const DETAIL_TTL_SECONDS = 3600;
const LIST_TTL_SECONDS = 600;

/**
 * Fallback de "último valor bom".
 *
 * O `unstable_cache` do Next já devolve o valor stale quando a revalidação
 * falha (ver `next/dist/server/web/spec-extension/unstable-cache.js`). Mas
 * isso só ajuda nas chaves que JÁ existem no cache — um cache-miss (busca
 * com termo novo, anime nunca acessado) continua devolvendo erro.
 *
 * Guardamos aqui o último valor bem-sucedido de cada chave para que uma
 * indisponibilidade da AniList degrade o site em vez de derrubá-lo.
 *
 * Onde o valor fica:
 *  - Map em memória por instância (acesso rápido, sem round-trip).
 *  - Redis (Upstash) como backup compartilhado entre instâncias — é ele que
 *    sobrevive a um cold start da lambda.
 *
 * O Redis recebe no máximo uma escrita a cada `LKG_REDIS_WRITE_INTERVAL_MS`
 * por chave: escrever em toda requisição (todo cache-hit reescreveria o
 * valor) gastaria a cota do Upstash à toa.
 */
const LKG_PREFIX = "animelix:lkg";
const LKG_DETAIL_TTL_SECONDS = 60 * 60 * 24;
const LKG_LIST_TTL_SECONDS = 60 * 60 * 2;
const LKG_REDIS_WRITE_INTERVAL_MS = 5 * 60_000;
const LKG_MEMORY_LIMIT = 500;

type LastGood = {
  value: unknown;
  expiresAt: number;
  redisWrittenAt: number;
};

const memoryLkg = new Map<string, LastGood>();

function redisLkgKey(key: string): string {
  return `${LKG_PREFIX}:${key}`;
}

function pruneMemory(now: number): void {
  for (const [key, entry] of memoryLkg) {
    if (entry.expiresAt <= now) memoryLkg.delete(key);
  }
  // Map preserva a ordem de inserção: as primeiras chaves são as mais antigas.
  while (memoryLkg.size > LKG_MEMORY_LIMIT) {
    const oldest = memoryLkg.keys().next();
    if (oldest.done) break;
    memoryLkg.delete(oldest.value);
  }
}

async function saveLastGood(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const now = Date.now();
  const previous = memoryLkg.get(key);

  memoryLkg.set(key, {
    value,
    expiresAt: now + ttlSeconds * 1000,
    redisWrittenAt: previous?.redisWrittenAt ?? 0,
  });
  pruneMemory(now);

  // Só grava no Redis de tempos em tempos (e na primeira vez).
  if (now - (previous?.redisWrittenAt ?? 0) < LKG_REDIS_WRITE_INTERVAL_MS) return;

  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(redisLkgKey(key), value, { ex: ttlSeconds });
    const entry = memoryLkg.get(key);
    if (entry) entry.redisWrittenAt = now;
  } catch {
    // Redis fora do ar: o backup em memória cobre esta instância.
  }
}

async function readLastGood<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const mem = memoryLkg.get(key);
  if (mem && mem.expiresAt > now) return mem.value as T;
  if (mem) memoryLkg.delete(key);

  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<T>(redisLkgKey(key));
    return raw ?? null;
  } catch {
    return null;
  }
}

/**
 * Executa a leitura do catálogo; se a AniList falhar, devolve o último valor
 * bom conhecido em vez de propagar o erro.
 */
async function withLastGood<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  try {
    const value = await fetcher();
    await saveLastGood(key, value, ttlSeconds);
    return value;
  } catch (err) {
    if (err instanceof AnilistError) {
      const stale = await readLastGood<T>(key);
      if (stale !== null) {
        logEvent("anilist_stale_served", { key });
        return stale;
      }
    }
    throw err;
  }
}

export function getCachedAnimeById(anilistId: number): Promise<AnimeSeed> {
  // "v2": invalida entradas gravadas antes de AnimeSeed.nextAiringEpisode existir.
  return withLastGood(`anime:${anilistId}`, LKG_DETAIL_TTL_SECONDS, () =>
    unstable_cache(() => catalog.getById(anilistId), ["anime", String(anilistId), "v2"], {
      revalidate: DETAIL_TTL_SECONDS,
      tags: [`anime:${anilistId}`],
    })(),
  );
}

export function searchCachedAnime(query: string): Promise<AnimeSeed[]> {
  // Normaliza a chave do cache: evita entradas duplicadas por variação de
  // caixa/espaço e reduz o espaço de chaves do Data Cache.
  const normalized = query.trim().toLowerCase();
  return withLastGood(`search:${normalized}`, LKG_LIST_TTL_SECONDS, () =>
    unstable_cache(() => catalog.search(normalized), ["anime-search", normalized], {
      revalidate: LIST_TTL_SECONDS,
      tags: ["anime-search"],
    })(),
  );
}

export function getCachedSeasonalAnime(season: Season, year: number): Promise<AnimeSeed[]> {
  return withLastGood(`seasonal:${season}:${year}`, LKG_DETAIL_TTL_SECONDS, () =>
    unstable_cache(() => catalog.getSeasonal(season, year), ["anime-seasonal", season, String(year)], {
      revalidate: LIST_TTL_SECONDS,
      tags: ["anime-seasonal"],
    })(),
  );
}
