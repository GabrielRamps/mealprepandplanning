import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ThisWeekRedirect } from "@/components/this-week-redirect";
import { requireHousehold } from "@/lib/household";
import { waitingForUser } from "@/lib/plan/plans";

export const metadata: Metadata = { title: "Plan" };

/** A week waiting for my answer comes first; otherwise this week on the phone's calendar. */
export default async function PlanPage() {
  const { user, membership } = await requireHousehold();
  const waiting = await waitingForUser(membership.householdId, user.id);
  if (waiting.weekStart) redirect(`/plan/${waiting.weekStart}`);
  return <ThisWeekRedirect />;
}
