"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteAccount } from "@/lib/account";
import {
  addToWatchlist,
  removeFromWatchlist,
  markEpisodeWatched,
  removeEpisodeWatch,
  setWatchStatus,
  setAutoPause,
  WatchlistError,
} from "@/lib/watchlist";
import type { WatchStatus } from "@/lib/watchstatus";
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

export async function addToWatchlistAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/");
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
  if (season == null || episode == null) redirect(`/watchlist/${anilistId}`);
  const total = parseTotal(formData.get("total"));
  try {
    await markEpisodeWatched(userId, anilistId, season, episode, total);
  } catch (err) {
    if (err instanceof WatchlistError) {
      redirect(`/watchlist/${anilistId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  revalidatePath(`/watchlist/${anilistId}`);
}

export async function removeEpisodeAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const season = parsePositiveInt(formData.get("season"));
  const episode = parsePositiveInt(formData.get("episode"));
  if (season == null || episode == null) redirect(`/watchlist/${anilistId}`);
  const total = parseTotal(formData.get("total"));
  const entryRemoved = await removeEpisodeWatch(userId, anilistId, season, episode, total);
  // Removing the last watched episode deletes the entry; sending the user back
  // to the watchlist avoids re-rendering the now-deleted entry page (which would
  // surface notFound() as an error during the action's revalidation).
  if (entryRemoved) redirect("/watchlist");
  revalidatePath(`/watchlist/${anilistId}`);
}

const STATUSES: WatchStatus[] = ["watching", "completed"];

export async function setWatchStatusAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const status = String(formData.get("status") ?? "") as WatchStatus;
  if (!STATUSES.includes(status)) {
    throw new Error(`status inválido: ${status}`);
  }
  await setWatchStatus(userId, anilistId, status);
  revalidatePath(`/watchlist/${anilistId}`);
}

export async function setAutoPauseAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const anilistId = parsePositiveInt(formData.get("anilistId"));
  if (anilistId == null) redirect("/watchlist");
  const enabled = formData.get("enabled") === "on";
  await setAutoPause(userId, anilistId, enabled);
  revalidatePath(`/anime/${anilistId}`);
  revalidatePath(`/watchlist/${anilistId}`);
}

export async function deleteAccountAction(): Promise<void> {
  const userId = await requireUserId();
  await deleteAccount(userId);
  await signOut({ redirectTo: "/login" });
}
