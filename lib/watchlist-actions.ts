"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteAccount } from "@/lib/account";
import {
  removeFromWatchlist,
  markEpisodeWatched,
  removeEpisodeWatch,
  WatchlistError,
} from "@/lib/watchlist";
import { parsePositiveInt, parseTotal } from "@/lib/parse";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // A deleted account still carries a (stateless JWT) session until sign-out;
  // treat a missing user row as unauthenticated so stale tokens are rejected.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");
  return session.user.id;
}

export async function removeFromWatchlistAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  await removeFromWatchlist(userId, anilistId);
  redirect("/watchlist");
}

export async function markEpisodeAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const season = parsePositiveInt(formData.get("season"));
  const episode = parsePositiveInt(formData.get("episode"));
  if (season == null || episode == null) redirect(`/anime/${anilistId}`);
  const total = parseTotal(formData.get("total"));
  try {
    await markEpisodeWatched(userId, anilistId, season, episode, total);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(`/anime/${anilistId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  revalidatePath(`/anime/${anilistId}`);
}

export async function removeEpisodeAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const season = parsePositiveInt(formData.get("season"));
  const episode = parsePositiveInt(formData.get("episode"));
  if (season == null || episode == null) redirect(`/anime/${anilistId}`);
  const total = parseTotal(formData.get("total"));
  const entryRemoved = await removeEpisodeWatch(userId, anilistId, season, episode, total);
  // Removing the last watched episode deletes the entry; sending the user back
  // to the watchlist keeps them on a page that still makes sense without it.
  if (entryRemoved) redirect("/watchlist");
  revalidatePath(`/anime/${anilistId}`);
}

export async function deleteAccountAction(): Promise<void> {
  const userId = await requireUserId();
  await deleteAccount(userId);
  await signOut({ redirectTo: "/login" });
}
