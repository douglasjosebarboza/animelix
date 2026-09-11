import cfg from "@/next.config";
import { describe, it, expect } from "vitest";
it("has CSP", async ()=>{
  const c=(await import("@/next.config")).default as any;
  const h=await c.headers();
  expect(JSON.stringify(h)).toContain("Content-Security-Policy");
});
