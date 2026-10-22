import { describe, expect, it } from "vitest";
import { normalizeEmail, parseCredentials } from "@/lib/credentials";

describe("normalizeEmail", () => {
  it("normaliza caixa e espaços", () => {
    expect(normalizeEmail("  User@Test.COM  ")).toBe("user@test.com");
  });

  it("deixa intacto um e-mail já normalizado", () => {
    expect(normalizeEmail("user@test.com")).toBe("user@test.com");
  });
});

describe("parseCredentials", () => {
  function form(email: FormDataEntryValue | null, password: FormDataEntryValue | null) {
    const fd = new FormData();
    if (email !== null) fd.set("email", email);
    if (password !== null) fd.set("password", password);
    return fd;
  }

  it("normaliza o e-mail antes de devolver", () => {
    const parsed = parseCredentials(form("  USER@Test.com ", "supersecret123"));
    expect(parsed).toEqual({ email: "user@test.com", password: "supersecret123" });
  });

  it("rejeita e-mail inválido", () => {
    const parsed = parseCredentials(form("nao-e-email", "supersecret123"));
    expect(parsed).toHaveProperty("error");
  });

  it("rejeita senha curta", () => {
    const parsed = parseCredentials(form("user@test.com", "1234567"));
    expect(parsed).toHaveProperty("error");
  });

  it("usa a mensagem do validador quando o campo falta", () => {
    const parsed = parseCredentials(form(null, "supersecret123"));
    expect(parsed).toHaveProperty("error", "Informe um email válido");
  });
});
