import { describe, expect, it } from "vitest";
import { isOpen, recordFailure, recordSuccess } from "@/lib/circuitBreaker";
describe("circuitBreaker", () => {
  it("opens after 3 failures in 60s", () => {
    const key="anilist:test";
    recordFailure(key); recordFailure(key); recordFailure(key);
    expect(isOpen(key)).toBe(true);
  });
  it("closes on success", () => {
    const key="anilist:test2";
    recordFailure(key); recordFailure(key); recordFailure(key);
    recordSuccess(key);
    expect(isOpen(key)).toBe(false);
  });
});
