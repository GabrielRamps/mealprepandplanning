import type { Metadata } from "next";
import { DateRedirect } from "@/components/prep/date-redirect";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Week" };

export default async function WeekRedirectPage() {
  await requireHousehold();
  return <DateRedirect to="week" />;
}
