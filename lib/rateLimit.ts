import { getRedis } from "@/lib/redis";

/**
 * Rate limiting.
 *
 * Dois backends com a MESMA semântica (janela fixa por chave):
 *
 *  - Upstash Redis (REST): distribuído. Obrigatório em serverless (Vercel),
 *    onde cada instância de lambda tem o próprio processo — um Map in-memory
 *    vira N limites independentes, um por instância quente.
 *  - In-memory: fallback para dev/testes.
 *
 * A API é dividida em "consultar" (peek, não consome) e "consumir" (hit,
 * incrementa). Isso permite contar apenas as falhas de login: senha correta
 * nunca esgota a cota do usuário legítimo, e o atacante ainda esbarra no
 * limite.
 */

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  reset: number;
};

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;

/** Namespace das chaves no Redis. */
const REDIS_PREFIX = "animelix:rl";

/** Teto de chaves mantidas no fallback in-memory (protege a memória da instância). */
const MAX_MEMORY_KEYS = 10_000;

// ---------------------------------------------------------------------------
// Backend in-memory
// ---------------------------------------------------------------------------

type Window = { count: number; expiresAt: number };

const memory = new Map<string, Window>();
let lastSweep = 0;

function memoryWindow(key: string, windowMs: number, now: number): Window {
  const current = memory.get(key);
  if (current && current.expiresAt > now) return current;

  const fresh: Window = { count: 0, expiresAt: now + windowMs };
  memory.set(key, fresh);
  return fresh;
}

/** Remove janelas expiradas e descarta as chaves mais antigas em excesso. */
function memorySweep(now: number): void {
  for (const [key, w] of memory) {
    if (w.expiresAt <= now) memory.delete(key);
  }
  // Map preserva a ordem de inserção: as primeiras chaves são as mais antigas.
  while (memory.size > MAX_MEMORY_KEYS) {
    const oldest = memory.keys().next();
    if (oldest.done) break;
    memory.delete(oldest.value);
  }
}

function memoryHit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const w = memoryWindow(key, windowMs, now);
  w.count += 1;
  return {
    ok: w.count <= limit,
    remaining: Math.max(0, limit - w.count),
    reset: w.expiresAt,
  };
}

function memoryPeek(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > windowMs) {
    memorySweep(now);
    lastSweep = now;
  }
  const w = memoryWindow(key, windowMs, now);
  return {
    ok: w.count < limit,
    remaining: Math.max(0, limit - w.count),
    reset: w.expiresAt,
  };
}

// ---------------------------------------------------------------------------
// Backend Redis (Upstash)
// ---------------------------------------------------------------------------

function redisKey(key: string): string {
  return `${REDIS_PREFIX}:${key}`;
}

/** Lê o contador atual sem incrementar. */
async function redisPeek(key: string): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get<number | string>(redisKey(key));
  if (raw == null) return 0;
  const n = typeof raw === "number" ? raw : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Incrementa o contador e renova a janela apenas na primeira vez (PEXPIRE NX). */
async function redisHit(key: string, windowMs: number): Promise<number | null> {
  const redis = getRedis();
  if (!redis) return null;
  const res = await redis
    .pipeline()
    .incr(redisKey(key))
    .pexpire(redisKey(key), windowMs, "NX")
    .exec<[number, 0 | 1]>();
  const count = Array.isArray(res) ? Number(res[0]) : 0;
  return Number.isFinite(count) ? count : 0;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Rate limit síncrono, apenas in-memory (consome cota).
 *
 * Mantido síncrono de propósito: é o fallback usado quando não há Redis
 * configurado (dev/testes) e a API síncrona não pode ser usada nos Server
 * Actions. Em produção prefira `checkRateLimit`/`hitRateLimit`, que usam o
 * Redis quando disponível.
 */
export function rateLimit(
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
): RateLimitResult {
  return memoryHit(key, limit, windowMs);
}

/**
 * Consulta o estado do limite SEM consumir cota.
 *
 * Usado antes de operações caras (bcrypt): se já estourou, nem executamos o
 * hash. `ok` é verdadeiro enquanto `count < limit`.
 *
 * Se o Redis estiver indisponível (cota esgotada, rede), cai para o
 * fallback in-memory em vez de derrubar a aplicação.
 */
export async function checkRateLimit(
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  if (getRedis()) {
    try {
      const count = await redisPeek(key);
      if (count != null) {
        return {
          ok: count < limit,
          remaining: Math.max(0, limit - count),
          reset: Date.now() + windowMs,
        };
      }
    } catch {
      // Redis fora do ar: segue com o fallback in-memory.
    }
  }

  return memoryPeek(key, limit, windowMs);
}

/** Consome cota (incrementa o contador da janela). */
export async function hitRateLimit(
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
): Promise<RateLimitResult> {
  if (getRedis()) {
    try {
      const count = await redisHit(key, windowMs);
      if (count != null) {
        return {
          ok: count <= limit,
          remaining: Math.max(0, limit - count),
          reset: Date.now() + windowMs,
        };
      }
    } catch {
      // Redis fora do ar: segue com o fallback in-memory.
    }
  }

  return memoryHit(key, limit, windowMs);
}

/** Limpa o estado in-memory (usado nos testes). */
export function _clear(): void {
  memory.clear();
  lastSweep = 0;
}
