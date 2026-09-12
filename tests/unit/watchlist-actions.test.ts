import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signOut: vi.fn(),
}));

import { parseTotal } from "@/lib/watchlist-actions";

describe("parseTotal", () => {
  it("converte string numérica", () => {
    expect(parseTotal("24")).toBe(24);
  });
  it("retorna null para ausente, vazio ou inválido", () => {
    expect(parseTotal(null)).toBeNull();
    expect(parseTotal("")).toBeNull();
    expect(parseTotal("?")).toBeNull();
  });
});
