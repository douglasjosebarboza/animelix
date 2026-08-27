"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";

const credentialsSchema = z.object({
  email: z.string().email("Informe um email válido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
});

export type AuthResult = { error?: string };

export async function registerAction(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { email, password } = parsed.data;

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
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
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
