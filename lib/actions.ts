"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { parseCredentials, type AuthResult } from "@/lib/credentials";

export async function registerAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = parseCredentials(formData);
  if ("error" in parsed) return parsed;

  const { email, password } = parsed;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Este email já está cadastrado" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { email, passwordHash } });

  redirect("/login");
}

export async function loginAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = parseCredentials(formData);
  if ("error" in parsed) return parsed;

  try {
    await signIn("credentials", {
      email: parsed.email,
      password: parsed.password,
      redirectTo: "/watchlist",
    });
    return {};
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { error: "Email ou senha incorretos" };
  }
}
