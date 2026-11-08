import type { Metadata } from "next";
import { DateRedirect } from "@/components/prep/date-redirect";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Today" };

export default async function TodayRedirectPage() {
  await requireHousehold();
  return <DateRedirect to="today" />;
}
