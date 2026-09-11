import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/catalogue";
import { rateLimit } from "@/lib/rateLimit";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const rawIp = req.headers.get("x-forwarded-for") || "anon";
  const ip = rawIp.split(",")[0].trim() || "anon";
  const rl = rateLimit(`search:${ip}`, 30, 60000);
  if (!rl.ok) return NextResponse.json({ error: "rate limit" }, { status: 429, headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": "0" } });
  const rawQ = req.nextUrl.searchParams.get("q")?.trim() || "";
  const parsed = z.string().max(100).safeParse(rawQ);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query" }, { status: 400, headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rl.remaining) } });
  }
  const q = parsed.data;
  if (!q || q.length < 2) {
    return NextResponse.json([], { headers: { "Cache-Control": "public, max-age=60", "X-RateLimit-Remaining": String(rl.remaining) } });
  }

  try {
    const results = await searchAnime(q);
    return NextResponse.json(results, { headers: { "Cache-Control": "public, max-age=60", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch {
    return NextResponse.json([], { status: 500, headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rl.remaining) } });
  }
}
