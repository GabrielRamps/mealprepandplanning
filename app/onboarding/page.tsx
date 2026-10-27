import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/auth/actions";
import { CreateHouseholdForm, JoinHouseholdForm } from "@/components/onboarding-forms";
import { Button } from "@/components/ui/button";
import { getMembership, requireUser } from "@/lib/household";
import { createHouseholdAction, joinHouseholdAction } from "./actions";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await requireUser();
  if (await getMembership(user.id)) redirect("/recipes");
  const firstName = user.name.trim().split(/\s+/)[0] || "there";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Welcome, {firstName}</h1>
        <p className="text-muted-foreground">
          Recipes, plans and lists live in a household you both share. Create one, or join your partner&apos;s.
        </p>
      </header>
      <CreateHouseholdForm action={createHouseholdAction} />
      <JoinHouseholdForm action={joinHouseholdAction} />
      <form action={signOutAction} className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm break-all text-muted-foreground">Signed in as {user.email}</p>
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </main>
  );
}
