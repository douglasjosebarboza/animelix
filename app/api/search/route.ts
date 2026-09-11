import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/catalogue";
import { rateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anon";
  if (!rateLimit(`search:${ip}`, 30, 60000).ok) return NextResponse.json({ error: "rate limit" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  const q = z.string().max(100).parse(req.nextUrl.searchParams.get("q")?.trim() || "");
  if (!q || q.length < 2) {
    return NextResponse.json([], { headers: { "Cache-Control": "public, max-age=60" } });
  }

  try {
    const results = await searchAnime(q);
    return NextResponse.json(results, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch {
    return NextResponse.json([], { status: 500 });
  }
}
