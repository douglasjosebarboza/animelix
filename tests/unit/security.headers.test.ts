import { describe, expect, it, vi } from "vitest";
import nextConfig from "@/next.config";
import { proxy } from "@/proxy";

function headerValue(
  headers: { key: string; value: string }[],
  key: string,
): string | undefined {
  return headers.find((h) => h.key === key)?.value;
}

describe("security headers", () => {
  it("tem HSTS, X-Frame-Options e X-Content-Type-Options", async () => {
    const headersFn = nextConfig.headers;
    const headers = headersFn ? await headersFn() : [];
    const flat = headers.flatMap((h) => h.headers);
    expect(headerValue(flat, "Strict-Transport-Security")).toContain("max-age=");
    expect(headerValue(flat, "X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headerValue(flat, "X-Content-Type-Options")).toBe("nosniff");
  });

  it("tem Referrer-Policy, Permissions-Policy e COOP/CORP", async () => {
    const headersFn = nextConfig.headers;
    const headers = headersFn ? await headersFn() : [];
    const flat = headers.flatMap((h) => h.headers);
    expect(headerValue(flat, "Referrer-Policy")).toBeTruthy();
    expect(headerValue(flat, "Permissions-Policy")).toBeTruthy();
    expect(headerValue(flat, "Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headerValue(flat, "Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("não anuncia a stack (poweredByHeader desligado)", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("a CSP fica no proxy (nonce por requisição), não no next.config", async () => {
    const headersFn = nextConfig.headers;
    const headers = headersFn ? await headersFn() : [];
    expect(JSON.stringify(headers)).not.toContain("Content-Security-Policy");
  });
});

describe("CSP com nonce (proxy.ts)", () => {
  function cspOf(res: Response): string {
    return res.headers.get("Content-Security-Policy") ?? "";
  }

  it("gera um nonce diferente por requisição", () => {
    const req = new Request("https://animelix.test/") as never;
    const a = cspOf(proxy(req));
    const b = cspOf(proxy(new Request("https://animelix.test/") as never));
    const nonceA = /'nonce-([^']+)'/.exec(a)?.[1];
    const nonceB = /'nonce-([^']+)'/.exec(b)?.[1];
    expect(nonceA).toBeTruthy();
    expect(nonceB).toBeTruthy();
    expect(nonceA).not.toBe(nonceB);
  });

  it("não usa 'unsafe-inline' em script-src no build de produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      const csp = cspOf(proxy(new Request("https://animelix.test/") as never));
      const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
      expect(scriptSrc).toBeTruthy();
      expect(scriptSrc).not.toContain("'unsafe-inline'");
      expect(scriptSrc).toContain("'nonce-");
      expect(scriptSrc).toContain("'strict-dynamic'");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("tem as diretivas de bloqueio que faltavam", () => {
    const csp = cspOf(proxy(new Request("https://animelix.test/") as never));
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
