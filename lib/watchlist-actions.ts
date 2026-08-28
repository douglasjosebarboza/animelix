"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  addToWatchlist,
  removeFromWatchlist,
  markEpisodeWatched,
  undoLastEpisodeWatch,
  WatchlistError,
} from "@/lib/watchlist";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}

export async function addToWatchlistAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = Number(formData.get("anilistId"));
  try {
    await addToWatchlist(userId, anilistId);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(`/anime/${anilistId}?error=already_in_watchlist`);
    }
    throw err;
  }
  redirect(`/watchlist/${anilistId}`);
}

export async function removeFromWatchlistAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = Number(formData.get("anilistId"));
  await removeFromWatchlist(userId, anilistId);
  redirect("/watchlist");
}

export async function markEpisodeAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = Number(formData.get("anilistId"));
  const season = Number(formData.get("season"));
  const episode = Number(formData.get("episode"));
  const dateStr = String(formData.get("watchedAt") ?? "");
  const watchedAt = dateStr ? new Date(dateStr) : new Date();
  await markEpisodeWatched(userId, anilistId, season, episode, watchedAt);
  revalidatePath(`/watchlist/${anilistId}`);
}

export async function undoLastAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = Number(formData.get("anilistId"));
  await undoLastEpisodeWatch(userId, anilistId);
  revalidatePath(`/watchlist/${anilistId}`);
}
