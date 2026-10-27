import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/server";
import { signOutAction } from "./auth/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/auth/sign-in");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Meal Planner</h1>
      <p data-testid="signed-in-as">
        Signed in as <strong>{user.name}</strong> ({user.email})
      </p>
      <form action={signOutAction}>
        <button type="submit" className="min-h-11 rounded-xl border border-black/15 px-4 py-2 dark:border-white/15">
          Sign out
        </button>
      </form>
    </main>
  );
}
