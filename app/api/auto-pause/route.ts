import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runAutoPauseJob } from "@/lib/watchlist";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const paused = await runAutoPauseJob(new Date());
  return NextResponse.json({ paused });
}
