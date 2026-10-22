import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { rateLimit, checkRateLimit, hitRateLimit, _clear } from "@/lib/rateLimit";

beforeEach(() => {
  _clear();
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit (in-memory, síncrono)", () => {
  it("blocks after limit", () => {
    const ip = "1.1.1.1";
    for (let i = 0; i < 30; i++) expect(rateLimit(ip, 30, 60000).ok).toBe(true);
    expect(rateLimit(ip, 30, 60000).ok).toBe(false);
  });

  it("mantém chaves independentes", () => {
    expect(rateLimit("a", 1, 60000).ok).toBe(true);
    expect(rateLimit("b", 1, 60000).ok).toBe(true);
    expect(rateLimit("a", 1, 60000).ok).toBe(false);
  });
});

describe("checkRateLimit (consulta sem consumir)", () => {
  it("não consome cota", async () => {
    const first = await checkRateLimit("k", 5, 60000);
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(5);

    const second = await checkRateLimit("k", 5, 60000);
    expect(second.ok).toBe(true);
    expect(second.remaining).toBe(5);
  });

  it("reflete o estado depois de hits", async () => {
    await hitRateLimit("k", 2, 60000);
    await hitRateLimit("k", 2, 60000);

    const blocked = await checkRateLimit("k", 2, 60000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });
});

describe("hitRateLimit (consome cota)", () => {
  it("bloqueia depois do limite", async () => {
    expect((await hitRateLimit("k", 3, 60000)).ok).toBe(true);
    expect((await hitRateLimit("k", 3, 60000)).ok).toBe(true);
    expect((await hitRateLimit("k", 3, 60000)).ok).toBe(true);
    expect((await hitRateLimit("k", 3, 60000)).ok).toBe(false);
  });

  it("renova a janela quando expira", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    expect((await hitRateLimit("k", 1, 60000)).ok).toBe(true);
    expect((await hitRateLimit("k", 1, 60000)).ok).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    expect((await hitRateLimit("k", 1, 60000)).ok).toBe(true);
  });

  it("chaves distintas não compartilham a cota", async () => {
    expect((await hitRateLimit("ip:1", 1, 60000)).ok).toBe(true);
    expect((await hitRateLimit("ip:2", 1, 60000)).ok).toBe(true);
    expect((await hitRateLimit("ip:1", 1, 60000)).ok).toBe(false);
  });
});
