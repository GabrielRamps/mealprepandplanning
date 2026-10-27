import { ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Lists" };

export default async function ListsPage() {
  await requireHousehold();

  return (
    <>
      <PageHeader title="Lists" />
      <main className="mx-auto w-full max-w-2xl flex-1">
        <EmptyState icon={<ShoppingCart className="size-7" />} title="Grocery lists">
          Pick recipes and get one list grouped by aisle that you can both check off while shopping.
        </EmptyState>
      </main>
    </>
  );
}
