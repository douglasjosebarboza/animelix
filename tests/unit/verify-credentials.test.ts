import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  RateLimitError,
  loginRateLimitKeys,
  verifyCredentials,
} from "@/lib/verify-credentials";
import { _clear } from "@/lib/rateLimit";

// bcrypt de "supersecret123" com custo 4 (custo só para o teste ser rápido;
// o `bcrypt.compare` lê o custo de dentro do hash).
const HASH = "$2b$04$.Mv8vbX2u8CcgfoTy3PDyOno4TUMijMcWvYcFsyc72uzn9U5WOkkS";

function req(ip: string): Request {
  return new Request("https://animelix.test/api/auth/callback/credentials", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": ip },
  });
}

beforeEach(() => {
  _clear();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loginRateLimitKeys", () => {
  it("a chave por conta NÃO contém o IP (resiste a ataque distribuído)", () => {
    const a = loginRateLimitKeys("1.1.1.1", "user@test.com");
    const b = loginRateLimitKeys("2.2.2.2", "user@test.com");
    expect(a.account).toBe(b.account);
    expect(a.account).not.toContain("1.1.1.1");
  });

  it("as chaves por IP e por par são distintas por origem", () => {
    const a = loginRateLimitKeys("1.1.1.1", "user@test.com");
    const b = loginRateLimitKeys("2.2.2.2", "user@test.com");
    expect(a.ip).not.toBe(b.ip);
    expect(a.pair).not.toBe(b.pair);
  });
});

describe("verifyCredentials", () => {
  it("devolve null quando o e-mail não existe (sem oráculo de enumeração)", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const user = await verifyCredentials(
      { email: "nobody@test.com", password: "whatever123" },
      req("1.1.1.1"),
    );
    expect(user).toBeNull();
  });

  it("devolve o usuário quando as credenciais batem", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      passwordHash: HASH,
      createdAt: new Date(),
    });
    // A senha que corresponde ao hash acima é "supersecret123".
    const user = await verifyCredentials(
      { email: "user@test.com", password: "supersecret123" },
      req("1.1.1.1"),
    );
    expect(user).toEqual({ id: "u1", email: "user@test.com" });
  });

  it("normaliza o e-mail antes de consultar (case-insensitive)", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    await verifyCredentials(
      { email: "  USER@Test.COM ", password: "whatever123" },
      req("1.1.1.1"),
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "user@test.com", mode: "insensitive" } },
    });
  });

  it("BLOQUEIA o brute force distribuído: o teto é por conta, não por IP", async () => {
    // Teto baixo para o teste não precisar rodar 20 bcrypts de custo 12.
    vi.stubEnv("RATE_LIMIT_LOGIN_PER_ACCOUNT", "3");
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

    // 3 falhas vindas de 3 IPs diferentes — o limite por conta é 3.
    for (let i = 0; i < 3; i++) {
      const user = await verifyCredentials(
        { email: "victim@test.com", password: `guess-${i}` },
        req(`10.0.0.${i + 1}`),
      );
      expect(user).toBeNull();
    }

    // A 4ª tentativa, de um IP INEDITO, já é barrada.
    await expect(
      verifyCredentials(
        { email: "victim@test.com", password: "guess-4" },
        req("10.0.0.99"),
      ),
    ).rejects.toBeInstanceOf(RateLimitError);

    // E a conta com e-mail diferente, do MESMO IP, ainda passa.
    const other = await verifyCredentials(
      { email: "outro@test.com", password: "guess-x" },
      req("10.0.0.99"),
    );
    expect(other).toBeNull();
  });

  it("um login bem-sucedido não consome cota", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: "u1",
      email: "user@test.com",
      passwordHash: HASH,
      createdAt: new Date(),
    });
    for (let i = 0; i < 30; i++) {
      await verifyCredentials(
        { email: "user@test.com", password: "supersecret123" },
        req("1.1.1.1"),
      );
    }
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(30);
  }, 20_000);

  it("a cota por (IP, e-mail) barra antes da cota por IP", async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null);
    // Limite por par é 5: a 6ª tentativa do mesmo par é barrada.
    for (let i = 0; i < 5; i++) {
      await verifyCredentials(
        { email: "user@test.com", password: `guess-${i}` },
        req("1.1.1.1"),
      );
    }
    await expect(
      verifyCredentials(
        { email: "user@test.com", password: "guess-6" },
        req("1.1.1.1"),
      ),
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it("rejeita senhas > 72 caracteres e e-mails malformados antes do Redis/bcrypt", async () => {
    const tooLongPassword = "a".repeat(73);
    const badEmail = await verifyCredentials(
      { email: "nao-e-email", password: "supersecret123" },
      req("1.1.1.1"),
    );
    const longPass = await verifyCredentials(
      { email: "user@test.com", password: tooLongPassword },
      req("1.1.1.1"),
    );
    expect(badEmail).toBeNull();
    expect(longPass).toBeNull();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
});
