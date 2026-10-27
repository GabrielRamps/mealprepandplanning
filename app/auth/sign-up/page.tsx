import { AuthForm } from "@/components/auth-form";
import { signUpAction } from "../actions";

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <AuthForm mode="sign-up" action={signUpAction} />
    </main>
  );
}
