import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteAccount } from "@/lib/account";

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  await deleteAccount(session.user.id);
  return new NextResponse(null, { status: 204 });
}
