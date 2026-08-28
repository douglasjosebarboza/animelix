import { z } from "zod";

export const credentialsSchema = z.object({
  email: z.string().email("Informe um email válido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
});

export type AuthResult = { error?: string };

export type CredentialsError = { error: string };
export type ParsedCredentials = { email: string; password: string };

export function parseCredentials(formData: FormData): ParsedCredentials | CredentialsError {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  return parsed.data;
}
