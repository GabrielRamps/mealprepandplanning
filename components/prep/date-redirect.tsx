"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { localToday, weekStartOf } from "@/lib/plan/week";

/** Today and this week depend on the phone's date, so these redirects happen in the browser. */
export function DateRedirect({ to }: { to: "today" | "week" }) {
  const router = useRouter();
  useEffect(() => {
    const today = localToday();
    router.replace(to === "today" ? `/prep/today/${today}` : `/prep/week/${weekStartOf(today)}`);
  }, [router, to]);
  return <p className="p-6 text-center text-muted-foreground">Opening {to === "today" ? "today" : "this week"}…</p>;
}
