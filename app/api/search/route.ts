import { NextRequest, NextResponse } from "next/server";
import { searchCachedAnime } from "@/lib/anime-cache";
import { hitRateLimit } from "@/lib/rateLimit";
import { getClientIp } from "@/lib/ip";
import { getLimits } from "@/lib/limits";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const limits = getLimits();
  const ip = getClientIp(req.headers);
  const rl = await hitRateLimit(`search:${ip}`, limits.searchPerIp, limits.searchWindowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "X-RateLimit-Remaining": "0",
          "Retry-After": String(Math.ceil(limits.searchWindowMs / 1000)),
        },
      },
    );
  }

  const rawQ = req.nextUrl.searchParams.get("q")?.trim() || "";
  const parsed = z.string().max(100).safeParse(rawQ);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid query" },
      {
        status: 400,
        headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rl.remaining) },
      },
    );
  }
  const q = parsed.data;
  if (!q || q.length < 2) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "public, max-age=60", "X-RateLimit-Remaining": String(rl.remaining) },
    });
  }

  try {
    // Usa o cache (AniList + Data Cache) para não estourar a cota de
    // 90 req/min da AniList — e para a resposta ser servida pelo CDN.
    const results = await searchCachedAnime(q);
    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, max-age=60", "X-RateLimit-Remaining": String(rl.remaining) },
    });
  } catch {
    return NextResponse.json([], {
      status: 500,
      headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rl.remaining) },
    });
  }
}
