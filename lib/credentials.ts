import { z } from "zod";

/**
 * Normalização de e-mail.
 *
 * `trim().toLowerCase()` — o mesmo endereço pode ser digitado de formas
 * diferentes ("User@X.com", " user@x.com ").
 *
 * Sem normalizar, cada variante vira uma conta DISTINTA no banco (o índice
 * `@unique` do Postgres é case-sensitive). Isso permite cadastrar duas
 * contas para o mesmo endereço e, no dia em que existir reset de senha por
 * e-mail, vira account takeover: o atacante cadastra a variante do e-mail da
 * vítima e fica com a conta que "recebe" o reset.
 *
 * A normalização é aplicada na ESCRITA (registro) e a LEITURA usa comparação
 * case-insensitive — assim as contas legadas (gravadas antes desta mudança)
 * continuam funcionando sem precisar de migration de dados.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const credentialsSchema = z.object({
  email: z.string().max(254, "Informe um email válido").email("Informe um email válido"),
  // bcrypt usa no máximo 72 bytes; acima disso o resto é descartado. Limitar
  // aqui evita processamento inútil e payloads grandes.
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(72, "A senha precisa ter no máximo 72 caracteres"),
});

export type AuthResult = { error?: string };

export type CredentialsError = { error: string };
export type ParsedCredentials = { email: string; password: string };

export function parseCredentials(formData: FormData): ParsedCredentials | CredentialsError {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  const parsed = credentialsSchema.safeParse({
    // `""` (e não `null`) para que a mensagem de erro seja a do validador,
    // e não o erro de tipo padrão do Zod.
    email: typeof rawEmail === "string" ? normalizeEmail(rawEmail) : "",
    password: typeof rawPassword === "string" ? rawPassword : "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  return parsed.data;
}
