import { BookOpen, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Recipes" };

export default async function RecipesPage() {
  await requireHousehold();

  return (
    <>
      <PageHeader
        title="Recipes"
        action={
          <Button asChild variant="ghost" size="icon" aria-label="Settings">
            <Link href="/settings">
              <Settings className="size-6" />
            </Link>
          </Button>
        }
      />
      <main className="mx-auto w-full max-w-2xl flex-1">
        <EmptyState icon={<BookOpen className="size-7" />} title="No recipes yet">
          Your shared recipe library will live here. Adding recipes by hand, with photos, comes next.
        </EmptyState>
      </main>
    </>
  );
}
