import { redirect } from "next/navigation";

// Signed-out visitors never get here (proxy.ts); /recipes sends anyone without
// a household on to /onboarding.
export default function Home() {
  redirect("/recipes");
}
