"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { localToday, weekStartOf } from "@/lib/plan/week";

/** "This week" depends on the phone's date, so the redirect happens in the browser. */
export function ThisWeekRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/plan/${weekStartOf(localToday())}`);
  }, [router]);
  return <p className="p-6 text-center text-muted-foreground">Opening this week…</p>;
}
