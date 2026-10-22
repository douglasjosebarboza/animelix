import { describe, expect, it } from "vitest";

import { parsePositiveInt } from "@/lib/parse";

describe("parsePositiveInt", () => {
  it("aceita inteiros positivos", () => {
    expect(parsePositiveInt("24")).toBe(24);
  });
  it("retorna null para ausente, vazio ou inválido", () => {
    expect(parsePositiveInt(null)).toBeNull();
    expect(parsePositiveInt("")).toBeNull();
    expect(parsePositiveInt("?")).toBeNull();
  });
  it("rejeita zero, negativos e não-inteiros", () => {
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("-3")).toBeNull();
    expect(parsePositiveInt("2.5")).toBeNull();
  });
});
