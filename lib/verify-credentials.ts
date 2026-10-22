import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, hitRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/ip";
import { getLimits } from "@/lib/limits";
import { normalizeEmail } from "@/lib/credentials";

/**
 * Hash de uma senha aleatória descartada (bcrypt, custo 12).
 *
 * Existe só para igualar o tempo de resposta do login: sem ele, um e-mail
 * inexistente retorna em ~1ms (só um SELECT) enquanto um e-mail existente
 * leva ~250ms (bcrypt), e a diferença vira um oráculo de enumeração de
 * usuários. Comparamos a senha contra este hash e descartamos o resultado.
 */
export const DUMMY_PASSWORD_HASH = "$2b$12$cr1XiNb5MOR.5ivtavQccOWOnI7eAlrngGG5Vlig1n07CO.A.tCZG";

/**
 * Cota de login esgotada.
 *
 * `auth.ts` traduz este erro para um `CredentialsSignin` com `code`
 * próprio, para que a action distinga "senha errada" de "cota esgotada"
 * sem revelar se o e-mail existe.
 */
export class RateLimitError extends Error {
  readonly code = "rate_limited";
  constructor() {
    super("rate_limited");
    this.name = "RateLimitError";
  }
}

/**
 * Chaves de cota do login.
 *
 * Três dimensões independentes:
 *
 *  - `ip`    limita o VOLUME total vindo de uma origem.
 *  - `acct`  limita por E-MAIL, SEM o IP. É a única que resiste a ataque
 *            distribuído: um atacante com N IPs continua batendo no mesmo
 *            teto de 20 falhas / 15 min.
 *  - `pair`  limita por (IP, e-mail). Granularidade fina: 5 falhas / 15 min
 *            a partir de uma mesma origem contra a mesma conta.
 */
export function loginRateLimitKeys(ip: string, email: string) {
  return {
    ip: `login:ip:${ip}`,
    account: `login:acct:${email}`,
    pair: `login:pair:${ip}:${email}`,
  };
}

export type VerifiedUser = { id: string; email: string };

/**
 * Verifica e-mail + senha contra o banco, aplicando o rate limit.
 *
 * Este é o ÚNICO lugar onde a senha é comparada — e, portanto, o único
 * lugar onde o rate limit precisa estar. O `authorize` do provider
 * Credentials também é alcançado por `POST /api/auth/callback/credentials`,
 * que contorna a server action; um rate limit aplicado só na action seria
 * burlado com um `curl` e um `csrfToken` público.
 */
export async function verifyCredentials(
  raw: Record<string, unknown> | undefined,
  request: Request,
): Promise<VerifiedUser | null> {
  const email = normalizeEmail(typeof raw?.email === "string" ? raw.email : "");
  const password = typeof raw?.password === "string" ? raw.password : "";
  if (!email || !password) return null;

  const ip = getClientIp(request.headers);
  const limits = getLimits();
  const keys = loginRateLimitKeys(ip, email);

  // Checagem ANTES do bcrypt: se já esgotou, nem gastamos CPU com hash.
  // `checkRateLimit` é peek — não consome cota.
  const [byIp, byAccount, byPair] = await Promise.all([
    checkRateLimit(keys.ip, limits.loginPerIp, limits.loginWindowMs),
    checkRateLimit(keys.account, limits.loginPerAccount, limits.loginWindowMs),
    checkRateLimit(keys.pair, limits.loginPerAccountIp, limits.loginWindowMs),
  ]);
  if (!byIp.ok || !byAccount.ok || !byPair.ok) {
    throw new RateLimitError();
  }

  // Case-insensitive: contas legadas (gravadas antes da normalização)
  // continuam funcionando sem precisar de migration de dados.
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  // Mesmo custo de CPU nos dois casos — não revela se o e-mail existe.
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid) {
    // Consome a cota só na FALHA. Senha correta nunca esgota a cota do
    // usuário legítimo, mas o atacante esbarra no limite.
    await Promise.all([
      hitRateLimit(keys.ip, limits.loginPerIp, limits.loginWindowMs),
      hitRateLimit(keys.account, limits.loginPerAccount, limits.loginWindowMs),
      hitRateLimit(keys.pair, limits.loginPerAccountIp, limits.loginWindowMs),
    ]);
    return null;
  }

  // Normaliza a linha legada (best-effort). Se colidir com outra variante
  // já normalizada, o índice unique manda — e o login segue válido, porque
  // a busca é case-insensitive.
  if (user.email !== email) {
    try {
      await prisma.user.update({ where: { id: user.id }, data: { email } });
    } catch {
      // Colisão de unicidade: mantém a linha como está.
    }
  }

  return { id: user.id, email: user.email };
}
