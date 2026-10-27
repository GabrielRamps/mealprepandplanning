"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "@/app/auth/actions";

type Props = {
  mode: "sign-in" | "sign-up";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
};

const inputClass =
  "w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-base outline-none focus:border-emerald-600 dark:border-white/15 dark:bg-neutral-900";

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const isSignUp = mode === "sign-up";

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <h1 className="text-2xl font-semibold">{isSignUp ? "Create your account" : "Sign in"}</h1>

      {isSignUp && (
        <Field label="Name" error={state?.fieldErrors?.name}>
          <input name="name" autoComplete="name" required className={inputClass} />
        </Field>
      )}
      <Field label="Email" error={state?.fieldErrors?.email}>
        <input name="email" type="email" autoComplete="email" inputMode="email" required className={inputClass} />
      </Field>
      <Field label="Password" error={state?.fieldErrors?.password}>
        <input
          name="password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={8}
          required
          className={inputClass}
        />
      </Field>

      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-xl bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-60"
      >
        {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
      </button>

      <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
        {isSignUp ? (
          <>
            Already have an account? <Link href="/auth/sign-in" className="underline">Sign in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/auth/sign-up" className="underline">Create an account</Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      {children}
      {error && <span className="text-sm font-normal text-red-600">{error}</span>}
    </label>
  );
}
