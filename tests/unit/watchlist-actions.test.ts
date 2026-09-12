import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signOut: vi.fn(),
}));

import { parsePositiveInt, parseTotal } from "@/lib/watchlist-actions";

describe("parseTotal", () => {
  it("converte string numérica", () => {
    expect(parseTotal("24")).toBe(24);
  });
  it("retorna null para ausente, vazio ou inválido", () => {
    expect(parseTotal(null)).toBeNull();
    expect(parseTotal("")).toBeNull();
    expect(parseTotal("?")).toBeNull();
  });
  it("rejeita zero, negativos e não-inteiros", () => {
    expect(parseTotal("0")).toBeNull();
    expect(parseTotal("-3")).toBeNull();
    expect(parseTotal("2.5")).toBeNull();
  });
});

describe("parsePositiveInt", () => {
  it("aceita inteiros positivos", () => {
    expect(parsePositiveInt("24")).toBe(24);
  });
  it("rejeita inválidos", () => {
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parsePositiveInt(null)).toBeNull();
  });
});
