/**
 * Limites de rate limit, configuráveis por variável de ambiente.
 *
 * Os defaults são valores conservativeos pensados para produção. O e2e
 * (e qualquer ambiente de teste) cria várias contas do mesmo IP em sequência,
 * por isso os limites são ajustáveis via env sem precisar tocar no código.
 *
 * Variáveis:
 *   RATE_LIMIT_LOGIN_PER_ACCOUNT    falhas por E-MAIL (sem IP)   default 20
 *   RATE_LIMIT_LOGIN_PER_ACCOUNT_IP falhas por (IP, e-mail)       default 5
 *   RATE_LIMIT_LOGIN_PER_IP         falhas por IP                default 20
 *   RATE_LIMIT_LOGIN_WINDOW_MS      janela do login (ms)         default 15 min
 *   RATE_LIMIT_REGISTER_PER_IP      registros por IP             default 5
 *   RATE_LIMIT_REGISTER_WINDOW_MS   janela do registro (ms)      default 1 h
 *   RATE_LIMIT_SEARCH_PER_IP        buscas por IP                default 20
 *   RATE_LIMIT_SEARCH_WINDOW_MS     janela da busca (ms)         default 1 min
 *   RATE_LIMIT_ANILIST_SEARCH_PER_MINUTE  buscas/min (cota AniList) default 25
 *   RATE_LIMIT_ANILIST_DETAIL_PER_MINUTE  detalhes/min (cota AniList) default 40
 *
 * A cota da AniList é dividida em dois baldes independentes (busca e
 * detalhe). Sem essa separação, uma enxurrada de buscas com termos inéditos
 * (cada uma é um cache-miss) consome o balde global e derruba também as
 * páginas de anime que ainda não estão em cache. A soma dos dois (65/min)
 * fica abaixo dos 90 req/min que a AniList permite.
 *
 * O limite "por E-MAIL" (sem IP) é o que impede brute force DISTRIBUÍDO: um
 * atacante com N IPs continua batendo no mesmo teto. O preço é que a conta
 * fica bloqueada por 15 min após 20 falhas — ataque de lockout. Como o
 * limite por (IP, e-mail) é de 5, o atacante precisa de 4 IPs para travar a
 * conta, e o usuário legítimo se recupera sozinho depois da janela.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export type Limits = {
  loginPerAccount: number;
  loginPerAccountIp: number;
  loginPerIp: number;
  loginWindowMs: number;
  registerPerIp: number;
  registerWindowMs: number;
  searchPerIp: number;
  searchWindowMs: number;
  anilistSearchCallsPerMinute: number;
  anilistDetailCallsPerMinute: number;
};

export function getLimits(): Limits {
  return {
    loginPerAccount: num("RATE_LIMIT_LOGIN_PER_ACCOUNT", 20),
    loginPerAccountIp: num("RATE_LIMIT_LOGIN_PER_ACCOUNT_IP", 5),
    loginPerIp: num("RATE_LIMIT_LOGIN_PER_IP", 20),
    loginWindowMs: num("RATE_LIMIT_LOGIN_WINDOW_MS", 15 * 60_000),
    registerPerIp: num("RATE_LIMIT_REGISTER_PER_IP", 5),
    registerWindowMs: num("RATE_LIMIT_REGISTER_WINDOW_MS", 60 * 60_000),
    searchPerIp: num("RATE_LIMIT_SEARCH_PER_IP", 20),
    searchWindowMs: num("RATE_LIMIT_SEARCH_WINDOW_MS", 60_000),
    anilistSearchCallsPerMinute: num("RATE_LIMIT_ANILIST_SEARCH_PER_MINUTE", 25),
    anilistDetailCallsPerMinute: num("RATE_LIMIT_ANILIST_DETAIL_PER_MINUTE", 40),
  };
}
