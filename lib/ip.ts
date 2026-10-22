/**
 * Extração do IP real do cliente.
 *
 * Só entram headers que a plataforma de hospedagem GARANTE que o cliente não
 * consegue forjar. Na Vercel:
 *
 *  - `x-vercel-forwarded-for`: a Vercel mantém íntegro mesmo atrás de proxy.
 *  - `x-forwarded-for`: a Vercel SOBRESCREVE esse header e não encaminha IPs
 *    externos ("we currently overwrite the X-Forwarded-For header and do not
 *    forward external IPs"), então o valor já vem limpo.
 *
 * `x-real-ip` foi REMOVIDO de propósito: a Vercel não o normaliza, então um
 * cliente pode enviá-lo diretamente. Se fosse lido, o atacante forjaria o
 * próprio IP e burlaria todos os rate limits (login, registro e busca).
 *
 * O elemento mais à DIREITA do `x-forwarded-for` é o do salto mais próximo
 * do servidor e, portanto, o menos controlável pelo cliente — qualquer valor
 * injetado pelo cliente aparece à esquerda. Pegar o primeiro elemento
 * (`split(",")[0]`) é exatamente o erro clássico que torna o rate limit
 * contornável.
 *
 * ⚠️ Se o app for auto-hospedado (Node/Docker) SEM proxy confiável, o
 * `x-forwarded-for` é 100% controlado pelo cliente e todo o rate limiting
 * deste app passa a ser decorativo. Nesse cenário é obrigatório um proxy
 * (nginx/Cloudflare) que sobrescreva o header. Ver `docs/DEPLOY.md`.
 */

/** Headers lidos, em ordem de confiança (do mais confiável para o menos). */
const IP_HEADERS = [
  "x-vercel-forwarded-for",
  "x-forwarded-for",
] as const;

/**
 * Formato aceitável de um IP (v4 ou v6).
 *
 * Não é um validador rigoroso — é uma guarda contra lixo. Sem ela, um
 * cliente poderia mandar qualquer string no header e poluir o espaço de
 * chaves do Redis (cada string vira uma chave de rate limit).
 */
const IP_SHAPE = /^[0-9a-fA-F:.]{3,45}$/;

function looksLikeIp(value: string): boolean {
  return IP_SHAPE.test(value);
}

/** Extrai o IP do cliente de um conjunto de headers. */
export function getClientIp(headers: Headers): string {
  for (const name of IP_HEADERS) {
    const raw = headers.get(name);
    if (!raw) continue;

    // Elemento mais à direita = salto mais próximo do servidor = menos
    // sujeito a spoofing pelo cliente.
    const ip = raw.split(",").pop()?.trim();
    if (ip && looksLikeIp(ip)) return ip;
  }

  return "anon";
}
