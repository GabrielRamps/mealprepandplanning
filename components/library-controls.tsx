"use client";

import { Heart, Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RECIPE_SOURCES, RECIPE_STATUSES, type RecipeSource, type RecipeStatus } from "@/lib/enums";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  filtersToSearch,
  type LibraryFilters,
  type Sort,
  SORT_LABELS,
  SORTS,
  SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/library-filters";
import { cn } from "@/lib/utils";

const selectClass = "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30";

type Props = {
  filters: LibraryFilters;
  tags: { id: string; name: string }[];
  partnerLabel: string;
};

export function LibraryControls({ filters, tags, partnerLabel }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function apply(patch: Partial<LibraryFilters>) {
    startTransition(() => router.replace(`${pathname}${filtersToSearch({ ...filters, ...patch })}`, { scroll: false }));
  }

  // Search as you type, a beat after the last keystroke.
  function onSearch(value: string) {
    setQ(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => apply({ q: value.trim() }), 300);
  }

  const count = activeFilterCount(filters);

  return (
    <div className={cn("flex flex-col gap-3 px-4 pt-3 transition-opacity", pending && "opacity-70")}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search recipes"
          placeholder="Search titles, tags, ingredients"
          value={q}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <FiltersDialog filters={filters} partnerLabel={partnerLabel} count={count} apply={apply} />
        <Chip active={filters.favorites} onClick={() => apply({ favorites: !filters.favorites })}>
          <Heart className={cn("size-4", filters.favorites && "fill-current")} aria-hidden /> Favorites
        </Chip>
        {tags.map((tag) => (
          <Chip key={tag.id} active={filters.tag === tag.id} onClick={() => apply({ tag: filters.tag === tag.id ? null : tag.id })}>
            {tag.name}
          </Chip>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort
          <select
            aria-label="Sort"
            value={filters.sort}
            onChange={(e) => apply({ sort: e.target.value as Sort })}
            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30"
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {count > 0 || filters.q ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearTimeout(searchTimer.current);
              setQ("");
              apply({ ...DEFAULT_FILTERS, sort: filters.sort });
            }}
          >
            <X aria-hidden /> Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function FiltersDialog({
  filters,
  partnerLabel,
  count,
  apply,
}: {
  filters: LibraryFilters;
  partnerLabel: string;
  count: number;
  apply: (patch: Partial<LibraryFilters>) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
            count > 0 ? "border-primary text-primary" : "hover:bg-muted",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters{count > 0 ? ` (${count})` : ""}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Filters</DialogTitle>
          <DialogDescription>Changes apply right away.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-rating">Rating</Label>
            <div className="grid grid-cols-2 gap-2">
              <select
                id="filter-rating"
                className={selectClass}
                value={filters.minRating ?? ""}
                onChange={(e) => apply({ minRating: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Any rating</option>
                {[5, 4, 3, 2].map((n) => (
                  <option key={n} value={n}>
                    {n === 5 ? "5 stars" : `${n}+ stars`}
                  </option>
                ))}
              </select>
              <select
                aria-label="Rated by"
                className={selectClass}
                value={filters.ratedBy}
                disabled={!filters.minRating}
                onChange={(e) => apply({ ratedBy: e.target.value as "me" | "partner" })}
              >
                <option value="me">by me</option>
                <option value="partner">by {partnerLabel}</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-source">Source</Label>
            <select
              id="filter-source"
              className={selectClass}
              value={filters.source ?? ""}
              onChange={(e) => apply({ source: (e.target.value || null) as RecipeSource | null })}
            >
              <option value="">Any source</option>
              {RECIPE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-status">Show</Label>
            <select
              id="filter-status"
              className={selectClass}
              value={filters.status}
              onChange={(e) => apply({ status: e.target.value as RecipeStatus })}
            >
              {RECIPE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
