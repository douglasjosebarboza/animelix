import { Redis } from "@upstash/redis";

/**
 * Cliente Upstash Redis compartilhado.
 *
 * Extraído de `lib/rateLimit.ts` para que outras camadas usem a MESMA
 * instância (rate limiting, fallback de "último valor bom" do catálogo).
 * Criar dois clientes do mesmo par url/token só gasta memória e conexões.
 *
 * Retorna `null` quando o Redis não está configurado — o chamador decide o
 * fallback (in-memory, ou degradar silenciosamente).
 */
let cached: { key: string; client: Redis | null } | null = null;

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  const envKey = `${url}|${token}`;

  if (!cached || cached.key !== envKey) {
    cached = {
      key: envKey,
      client: url && token ? new Redis({ url, token }) : null,
    };
  }
  return cached.client;
}
