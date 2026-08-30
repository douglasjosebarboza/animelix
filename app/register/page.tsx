import { registerAction } from "@/lib/actions";
import { AuthForm } from "@/components/AuthForm";

export default function RegisterPage() {
  return <AuthForm mode="register" action={registerAction} />;
}
