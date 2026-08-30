import { loginAction } from "@/lib/actions";
import { AuthForm } from "@/components/AuthForm";

export default function LoginPage() {
  return <AuthForm mode="login" action={loginAction} />;
}
