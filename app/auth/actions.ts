"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "@/lib/auth/server";

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string> } | null;

const SignIn = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const SignUp = SignIn.extend({
  name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SignIn.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await getAuth().signIn.email(parsed.data);
  if (error) return { error: error.message || "Email or password is incorrect." };
  redirect("/");
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = SignUp.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const { error } = await getAuth().signUp.email(parsed.data);
  if (error) return { error: error.message || "Couldn't create the account. Try again." };
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  await getAuth().signOut();
  redirect("/auth/sign-in");
}
