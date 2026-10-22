import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP com nonce por requisição.
 *
 * Por que aqui e não no `next.config.ts`: o Next.js aplica o nonce
 * automaticamente aos scripts e estilos que ELE gera, mas só consegue fazer
 * isso se a política chegar no header da REQUISICAÇÃO. Um `headers()` estático
 * no config não tem nonce por requisição — só daria para usar
 * `'unsafe-inline'`, que anula a proteção contra XSS.
 *
 * Referência: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
 */
export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Em DEV não usamos nonce. A spec do CSP ignora `'unsafe-inline'` quando a
  // mesma diretiva tem um nonce ("'unsafe-inline' is ignored if either a hash
  // or nonce value is present") — logo, `style-src 'self' 'nonce-X'
  // 'unsafe-inline'` NÃO libera estilo inline. O `next/font` injeta os
  // @font-face como <style> inline no dev, e o Tailwind injeta <style> no
  // hot reload: ambos ficavam bloqueados (a UI caía no "Geist Fallback" e o
  // console encheu de violações).
  //
  // Em PROD o nonce é obrigatório e funciona: o CSS é extraído para arquivo
  // e o next/font serve as fontes por <link> — zero <style> inline.
  const csp = isDev
    ? [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ")
    : [
        "default-src 'self'",
        // 'strict-dynamic' faz o navegador confiar apenas nos scripts com nonce
        // (e nos que eles carregam), ignorando allowlists de host.
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        // `style-src-attr 'unsafe-inline'` libera apenas o atributo `style="..."`
        // — que o `next/image` emite (`color:transparent`) — mantendo os
        // elementos <style> sujeitos ao nonce. É mais estrito do que
        // `style-src 'unsafe-inline'` e mais compatível do que exigir nonce em
        // atributo (impossível: o Next os gera internamente).
        `style-src 'self' 'nonce-${nonce}'`,
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' blob: data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "upgrade-insecure-requests",
      ].join("; ");

  const requestHeaders = new Headers(request.headers);
  if (!isDev) {
    // O Next lê o nonce daqui e o aplica nos scripts/styles que ele gera.
    requestHeaders.set("x-nonce", nonce);
  }
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Static assets e rotas de API não precisam da CSP (não são documentos
      // HTML); prefetches também não — o nonce real vem na navegação.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
