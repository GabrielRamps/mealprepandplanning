import { CheckCheck, Repeat, ShoppingCart } from "lucide-react";
import Link from "next/link";
import type { ListCounts } from "@/lib/grocery/lists";
import { LIST_TABS, listsHref, type ListsTab, TAB_LABELS } from "@/lib/grocery/tabs";
import { cn } from "@/lib/utils";

const ICONS = { active: ShoppingCart, reorder: Repeat, history: CheckCheck } as const;

/** Active / Reorder / History, as one segmented control at the top of Lists. */
export function ListsTabs({ tab, counts }: { tab: ListsTab; counts: ListCounts }) {
  const count: Record<ListsTab, number> = { active: counts.active, reorder: counts.saved, history: counts.history };
  return (
    <nav aria-label="List views" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
      {LIST_TABS.map((t) => {
        const Icon = ICONS[t];
        const current = t === tab;
        return (
          <Link
            key={t}
            href={listsHref(t)}
            replace
            scroll={false}
            aria-current={current ? "page" : undefined}
            data-testid={`lists-tab-${t}`}
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-sm font-medium whitespace-nowrap transition-colors min-[380px]:gap-1.5 min-[380px]:px-2",
              current ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {/* Small phones (iPhone SE) keep just the label and count. */}
            <Icon className="size-4 shrink-0 max-[379px]:hidden" aria-hidden />
            {TAB_LABELS[t]}
            {count[t] > 0 ? (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1 text-center text-xs leading-5 tabular-nums min-[380px]:px-1.5",
                  current ? "bg-primary text-primary-foreground" : "bg-foreground/10",
                )}
              >
                {count[t]}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
