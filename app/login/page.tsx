import { loginAction } from "@/lib/actions";
import { AuthForm } from "@/components/AuthForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ created?: string | string[] }>;
}) {
  const { created } = (await searchParams) ?? {};
  const notice =
    (Array.isArray(created) ? created[0] : created) === "1"
      ? "Se este e-mail ainda não estava cadastrado, sua conta foi criada. Tente entrar."
      : undefined;

  return <AuthForm mode="login" action={loginAction} notice={notice} />;
}
