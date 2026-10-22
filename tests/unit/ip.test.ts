import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/ip";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("getClientIp", () => {
  it("prefere x-vercel-forwarded-for", () => {
    const h = headers({
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-forwarded-for": "203.0.113.30",
    });
    expect(getClientIp(h)).toBe("203.0.113.10");
  });

  it("NÃO usa x-real-ip: a Vercel não o normaliza, então o cliente pode forjá-lo", () => {
    // Se x-real-ip fosse lido, o atacante forjaria o próprio IP e burlaria
    // todos os rate limits.
    const h = headers({
      "x-real-ip": "203.0.113.20",
      "x-forwarded-for": "203.0.113.30",
    });
    expect(getClientIp(h)).toBe("203.0.113.30");
  });

  it("ignora o valor injetado pelo cliente e usa o último do x-forwarded-for", () => {
    // "9.9.9.9" foi enviado pelo cliente; o IP real é o último elemento.
    const h = headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.30" });
    expect(getClientIp(h)).toBe("203.0.113.30");
  });

  it("usa o último elemento do x-vercel-forwarded-for", () => {
    const h = headers({ "x-vercel-forwarded-for": "9.9.9.9, 203.0.113.40" });
    expect(getClientIp(h)).toBe("203.0.113.40");
  });

  it("devolve anon quando não há nenhum header de IP", () => {
    expect(getClientIp(headers({}))).toBe("anon");
  });

  it("ignora headers vazios ou só com espaços", () => {
    const h = headers({ "x-forwarded-for": "   " });
    expect(getClientIp(h)).toBe("anon");
  });

  it("ignora valores que não parecem IP (evita poluir o keyspace do Redis)", () => {
    const h = headers({ "x-forwarded-for": "not-an-ip-at-all" });
    expect(getClientIp(h)).toBe("anon");
  });

  it("aceita IPv6", () => {
    const h = headers({ "x-vercel-forwarded-for": "2001:db8::1" });
    expect(getClientIp(h)).toBe("2001:db8::1");
  });
});
