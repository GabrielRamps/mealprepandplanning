import { ChevronRight, Plus, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { type ListSummary, listLists } from "@/lib/grocery/lists";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Lists" };

export default async function ListsPage() {
  const { membership } = await requireHousehold();
  const lists = await listLists(membership.householdId);
  const active = lists.filter((l) => l.status === "active");
  const done = lists.filter((l) => l.status === "completed");

  return (
    <>
      <PageHeader
        title="Lists"
        action={
          <Button asChild variant="ghost" size="icon" aria-label="New list">
            <Link href="/lists/new">
              <Plus className="size-6" />
            </Link>
          </Button>
        }
      />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
        {lists.length === 0 ? (
          <div className="flex flex-col items-center">
            <EmptyState icon={<ShoppingCart className="size-7" />} title="No lists yet">
              Pick recipes and servings, and get one list grouped by aisle that you can both check off.
            </EmptyState>
            <Button asChild size="lg">
              <Link href="/lists/new">
                <Plus aria-hidden /> New list
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <ListGroup title="Active" lists={active} />
            <ListGroup title="Done" lists={done} />
          </>
        )}
      </main>
    </>
  );
}

function ListGroup({ title, lists }: { title: string; lists: ListSummary[] }) {
  if (lists.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {lists.map((l) => (
          <li key={l.id}>
            <Link href={`/lists/${l.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2">
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{l.name}</span>
                <span className="text-sm text-muted-foreground">
                  {l.checked} of {l.total} checked
                </span>
              </span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
