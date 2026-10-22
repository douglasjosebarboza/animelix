"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { loginRateLimitKeys } from "@/lib/verify-credentials";
import { parseCredentials, type AuthResult } from "@/lib/credentials";
import { checkRateLimit, hitRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/ip";
import { getLimits } from "@/lib/limits";

/**
 * Limites de autenticação.
 *
 * Login: contam apenas as FALHAS. Senha correta nunca esgota a cota do
 * usuário legítimo, mas o atacante esbarra no limite.
 *
 * A COTA AUTORITATIVA do login vive no `authorize` do provider Credentials
 * (`auth.ts`), porque esse é o único caminho até a comparação da senha — o
 * `authorize` também é alcançado por `POST /api/auth/callback/credentials`,
 * que contorna a server action. Aqui nesta action fazemos só um PE peek
 * (não consome) para poder escolher a mensagem exibida ao usuário.
 *
 * Registro: contam TODAS as tentativas, porque cada uma custa um bcrypt
 * (bcryptjs é JS puro e caro). É o que impede o DoS de CPU por conta
 * anônima.
 *
 * Os valores default estão em lib/limits.ts (ajustáveis por env).
 */

/** Custo do bcrypt. 12 = ~250ms com bcryptjs (JS puro). */
const BCRYPT_COST = 12;

async function clientIp(): Promise<string> {
  const hdr = await (await import("next/headers")).headers();
  return getClientIp(hdr);
}

export async function registerAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = parseCredentials(formData);
  if ("error" in parsed) return parsed;

  const { email, password } = parsed;
  const limits = getLimits();

  // Consome cota antes de qualquer trabalho caro (bcrypt + escrita no banco).
  const ip = await clientIp();
  const rl = await hitRateLimit(
    `register:ip:${ip}`,
    limits.registerPerIp,
    limits.registerWindowMs,
  );
  if (!rl.ok) {
    return { error: "Muitas tentativas, aguarde" };
  }

  // Case-insensitive: um e-mail legado em outra capitalização também conta
  // como "já cadastrado".
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (existing) {
    // Mesmo destino do sucesso. A resposta NÃO pode revelar se o e-mail já
    // existia — seria um oráculo de enumeração de usuários.
    redirect("/login?created=1");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    await prisma.user.create({ data: { email, passwordHash } });
  } catch (err) {
    // Corrida com outro registro simultâneo do mesmo e-mail: mesmo destino
    // genérico, sem revelar nada.
    if ((err as { code?: string }).code === "P2002") {
      redirect("/login?created=1");
    }
    throw err;
  }

  redirect("/login?created=1");
}

export async function loginAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = parseCredentials(formData);
  if ("error" in parsed) return parsed;

  const ip = await clientIp();
  const email = parsed.email;
  const limits = getLimits();
  const keys = loginRateLimitKeys(ip, email);

  // Peek (não consome): só para escolher a mensagem. Quem consome a cota é
  // o `authorize` em auth.ts.
  const [byIp, byAccount, byPair] = await Promise.all([
    checkRateLimit(keys.ip, limits.loginPerIp, limits.loginWindowMs),
    checkRateLimit(keys.account, limits.loginPerAccount, limits.loginWindowMs),
    checkRateLimit(keys.pair, limits.loginPerAccountIp, limits.loginWindowMs),
  ]);
  if (!byIp.ok || !byAccount.ok || !byPair.ok) {
    return { error: "Muitas tentativas, aguarde" };
  }

  try {
    await signIn("credentials", {
      email,
      password: parsed.password,
      redirectTo: "/watchlist",
    });
    return {};
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    if ((err as { code?: string }).code === "rate_limited") {
      return { error: "Muitas tentativas, aguarde" };
    }
    // A cota foi consumida dentro do `authorize` (auth.ts). Aqui só
    // traduzimos o erro em mensagem.
    return { error: "Email ou senha incorretos" };
  }
}
