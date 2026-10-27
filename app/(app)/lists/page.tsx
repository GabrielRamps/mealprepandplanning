import { Bookmark, CheckCheck, ChevronRight, Plus, Repeat, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ListActionsMenu } from "@/components/list-actions";
import { ListsNotice } from "@/components/lists-notice";
import { ListsTabs } from "@/components/lists-tabs";
import { LocalDate } from "@/components/local-date";
import { EmptyState, PageHeader } from "@/components/page-header";
import { SavedListCard } from "@/components/saved-list-card";
import { Button } from "@/components/ui/button";
import { type ListCounts, type ListSummary, listCounts, listLists } from "@/lib/grocery/lists";
import { listSavedLists, type SavedList } from "@/lib/grocery/saved";
import { listsHref, parseListsNotice, parseListsTab } from "@/lib/grocery/tabs";
import { requireHousehold } from "@/lib/household";

export const metadata: Metadata = { title: "Lists" };

/** Lists (PRD 5): lists in progress, saved lists to reorder, and finished lists, one view at a time. */
export default async function ListsPage(props: PageProps<"/lists">) {
  const { membership } = await requireHousehold();
  const search = await props.searchParams;
  const tab = parseListsTab(search.tab);
  const notice = parseListsNotice(search.notice);
  const householdId = membership.householdId;
  const [counts, lists, saved] = await Promise.all([
    listCounts(householdId),
    tab === "reorder" ? Promise.resolve([]) : listLists(householdId, tab === "history" ? "completed" : "active"),
    tab === "reorder" ? listSavedLists(householdId) : Promise.resolve([]),
  ]);

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
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <ListsTabs tab={tab} counts={counts} />
        {/* A fresh key per render, so the same note twice in a row still shows. */}
        {notice ? <ListsNotice key={crypto.randomUUID()} notice={notice} /> : null}
        {tab === "active" ? <ActiveLists lists={lists} counts={counts} /> : null}
        {tab === "reorder" ? <SavedLists saved={saved} /> : null}
        {tab === "history" ? <HistoryLists lists={lists} /> : null}
      </main>
    </>
  );
}

function ActiveLists({ lists, counts }: { lists: ListSummary[]; counts: ListCounts }) {
  if (lists.length === 0) {
    const firstTime = counts.history === 0 && counts.saved === 0;
    return (
      <div className="flex flex-col items-center gap-2">
        <EmptyState icon={<ShoppingCart className="size-7" />} title={firstTime ? "No lists yet" : "Nothing to shop for"}>
          {firstTime
            ? "Pick recipes and servings, and get one list grouped by aisle that you can both check off."
            : counts.saved
              ? "Start a new list, or reorder one you saved."
              : "Start a new list. Finished lists are in History."}
        </EmptyState>
        <Button asChild size="lg">
          <Link href="/lists/new">
            <Plus aria-hidden /> New list
          </Link>
        </Button>
        {counts.saved ? (
          <Button asChild size="lg" variant="outline">
            <Link href={listsHref("reorder")} replace>
              <Repeat aria-hidden /> Reorder a saved list
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <ListRows label="Lists in progress" lists={lists}>
      {(l) => (
        <>
          <span className="text-sm text-muted-foreground">
            {l.total === 0 ? "No items yet" : `${l.checked} of ${l.total} checked`}
          </span>
          {l.total > 0 ? (
            <span className="mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${(l.checked / l.total) * 100}%` }} />
            </span>
          ) : null}
        </>
      )}
    </ListRows>
  );
}

function HistoryLists({ lists }: { lists: ListSummary[] }) {
  if (lists.length === 0) {
    return (
      <EmptyState icon={<CheckCheck className="size-7" />} title="No finished lists yet">
        When you tap Done shopping on a list, it moves here, out of the way. You can reopen, save or delete it later.
      </EmptyState>
    );
  }
  return (
    <ListRows label="Finished lists" lists={lists}>
      {(l) => (
        <span className="text-sm text-muted-foreground">
          Done <LocalDate iso={(l.completedAt ?? l.createdAt).toISOString()} /> · {l.checked} of {l.total} checked
        </span>
      )}
    </ListRows>
  );
}

function ListRows({
  label,
  lists,
  children,
}: {
  label: string;
  lists: ListSummary[];
  children: (list: ListSummary) => ReactNode;
}) {
  return (
    <ul className="flex flex-col divide-y rounded-xl border" aria-label={label}>
      {lists.map((l) => (
        <li key={l.id} className="flex items-stretch" data-testid="list-row">
          <Link href={`/lists/${l.id}`} className="flex min-h-16 flex-1 items-center gap-3 py-2 pl-3">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="truncate">{l.name}</span>
                {l.savedList ? (
                  <Bookmark className="size-4 shrink-0 fill-current text-primary" aria-label="Saved for reorder" />
                ) : null}
              </span>
              {children(l)}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
          <ListActionsMenu
            where="lists"
            list={{ id: l.id, name: l.name, status: l.status, itemCount: l.total, savedList: l.savedList }}
          />
        </li>
      ))}
    </ul>
  );
}

function SavedLists({ saved }: { saved: SavedList[] }) {
  if (saved.length === 0) {
    return (
      <EmptyState icon={<Repeat className="size-7" />} title="Nothing saved yet">
        Open a list, tap ⋯ and choose Save for reorder. Its meals and the items you added land here, ready to shop for again
        in one tap.
      </EmptyState>
    );
  }
  return (
    <section aria-label="Saved lists" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Tap Reorder to start a new list with the same meals and items.</p>
      {saved.map((s) => (
        <SavedListCard
          key={s.id}
          saved={{
            id: s.id,
            name: s.name,
            createdAt: s.createdAt.toISOString(),
            lastOrderedAt: s.lastOrderedAt?.toISOString() ?? null,
            recipes: s.recipes,
            items: s.items.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
          }}
        />
      ))}
    </section>
  );
}
