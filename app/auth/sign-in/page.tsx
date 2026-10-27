import { AuthForm } from "@/components/auth-form";
import { signInAction } from "../actions";

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <AuthForm mode="sign-in" action={signInAction} />
    </main>
  );
}
