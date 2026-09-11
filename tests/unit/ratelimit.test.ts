import { expect, it } from "vitest";
import { rateLimit } from "@/lib/rateLimit";
it("blocks after limit", () => {
  const ip="1.1.1.1";
  for(let i=0;i<30;i++) expect(rateLimit(ip,30,60000).ok).toBe(true);
  expect(rateLimit(ip,30,60000).ok).toBe(false);
});
