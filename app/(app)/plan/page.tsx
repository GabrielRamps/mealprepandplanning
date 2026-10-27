import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Plan" };

export default async function PlanPage() {
  await requireHousehold();

  return (
    <>
      <PageHeader title="Plan" />
      <main className="mx-auto w-full max-w-2xl flex-1">
        <EmptyState icon={<CalendarDays className="size-7" />} title="Weekly plan">
          Plan breakfast, lunch, dinner and snacks for the week, then send it to your partner to approve.
        </EmptyState>
      </main>
    </>
  );
}
