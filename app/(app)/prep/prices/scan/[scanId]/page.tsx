import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ReceiptReview } from "@/components/prep/receipt-scan";
import { SetupPrep } from "@/components/prep/setup-prep";
import { requireHousehold } from "@/lib/household";
import { suggestPackagePrice } from "@/lib/import/receipt-ai";
import { addDays, weekStartOf } from "@/lib/plan/week";
import { weekTotals } from "@/lib/prep/calc";
import { getWeekRow, loadCatalog, loadWeek } from "@/lib/prep/load";
import { getScan } from "@/lib/prep/receipts";

export const metadata: Metadata = { title: "Review prices" };

/** Review (P-11): receipt line → matched food → old price → new price → Apply. */
export default async function ScanReviewPage(props: PageProps<"/prep/prices/scan/[scanId]">) {
  const { scanId } = await props.params;
  const { membership } = await requireHousehold();
  const householdId = membership.householdId;
  const catalog = await loadCatalog(householdId);
  if (!catalog) return <SetupPrep />;
  const scan = await getScan(householdId, scanId);
  if (!scan) notFound();

  // The week this shop is for: shopping on Sunday buys for the week starting Monday.
  const weekStart = weekStartOf(addDays(scan.createdAt.toISOString().slice(0, 10), 1));
  const week = await getWeekRow(householdId, weekStart);
  const estimate = week ? weekTotals((await loadWeek(householdId, catalog, week)).input).costCents : null;

  const foods = [...catalog.foods.values()]
    .filter((f) => !f.deleted)
    .map((f) => ({
      id: f.id,
      name: f.name,
      unitKind: f.unitKind,
      gramsPerCount: f.gramsPerCount,
      packageAmount: f.packageAmount,
      packageLabel: f.packageLabel,
      packagePriceCents: f.packagePriceCents,
      priceIsEstimate: f.priceIsEstimate,
    }));
  const suggestions = scan.lines.map((l) => {
    const food = l.core_food_id ? catalog.foods.get(l.core_food_id) : undefined;
    return food ? suggestPackagePrice(l, food) : null;
  });
  return (
    <>
      <PageHeader title="Review prices" back={{ href: "/prep/prices/scan", label: "Scans" }} />
      <ReceiptReview scan={scan} foods={foods} suggestions={suggestions} weekEstimateCents={estimate} weekStart={week ? weekStart : null} />
    </>
  );
}
