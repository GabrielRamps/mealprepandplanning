import { Download } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  await requireHousehold();

  return (
    <>
      <PageHeader title="Import" />
      <main className="mx-auto w-full max-w-2xl flex-1">
        <EmptyState icon={<Download className="size-7" />} title="Import recipes">
          Save recipes from Instagram, TikTok, websites, screenshots and cookbook photos.
        </EmptyState>
      </main>
    </>
  );
}
