import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";

export async function deleteAccount(userId: string): Promise<void> {
  try {
    await prisma.user.delete({ where: { id: userId } });
    logEvent("account_deleted", { userId });
  } catch (err) {
    // Idempotent: deleting an already-deleted account is a no-op.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return;
    }
    throw err;
  }
}
