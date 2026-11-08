import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LocalDate } from "@/components/local-date";
import { PageHeader } from "@/components/page-header";
import { ReceiptUpload } from "@/components/prep/receipt-scan";
import { SetupPrep } from "@/components/prep/setup-prep";
import { requireHousehold } from "@/lib/household";
import { scanTotal } from "@/lib/import/receipt-ai";
import { formatMoney } from "@/lib/prep/format";
import { loadCatalog } from "@/lib/prep/load";
import { recentScans } from "@/lib/prep/receipts";

export const metadata: Metadata = { title: "Scan a receipt" };

const STATUS = { processing: "Reading…", ready: "Ready to review", failed: "Couldn't read it" } as const;

/** Receipt scan (P-11): photos of a receipt or the Walmart cart. */
export default async function ScanPage() {
  const { membership } = await requireHousehold();
  const catalog = await loadCatalog(membership.householdId);
  if (!catalog) return <SetupPrep />;
  const scans = await recentScans(membership.householdId);
  return (
    <>
      <PageHeader title="Scan a receipt" back={{ href: "/prep/menu?tab=foods", label: "Menu" }} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4">
        <p className="text-muted-foreground">
          Photograph the receipt or screenshot your Walmart cart or order. Prices are read and matched to your foods; you check them
          before anything changes.
        </p>
        <ReceiptUpload />
        {scans.length ? (
          <section aria-labelledby="scans-heading" className="flex flex-col gap-2">
            <h2 id="scans-heading" className="font-semibold">
              Recent scans
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {scans.map((s) => (
                <li key={s.id}>
                  <Link href={`/prep/prices/scan/${s.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    <span className="flex flex-1 flex-col">
                      <span className="font-medium">
                        {s.store ?? "Receipt"} · <LocalDate iso={s.createdAt.toISOString()} />
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {s.appliedAt ? "Applied" : STATUS[s.status]}
                        {s.status === "ready" ? ` · ${s.lines.length} lines · ${formatMoney(scanTotal(s.lines))}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
