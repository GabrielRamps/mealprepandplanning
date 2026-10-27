"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setAisleOrderAction, updateIngredientAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AISLES, type Aisle, DEFAULT_AISLE_ORDER } from "@/lib/enums";
import { AISLE_LABELS } from "@/lib/grocery/aisles";
import type { IngredientSetting } from "@/lib/grocery/ingredients";
import { cn } from "@/lib/utils";

const selectClass = "h-11 rounded-lg border border-input bg-transparent px-2 text-base dark:bg-input/30";

/** F2: walk-the-store order for list groups. Each move saves straight away. */
export function AisleOrderEditor({ initialOrder }: { initialOrder: Aisle[] }) {
  const [order, setOrder] = useState(initialOrder);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const isDefault = order.every((a, i) => a === DEFAULT_AISLE_ORDER[i]);

  function save(next: Aisle[]) {
    const previous = order;
    setOrder(next);
    setError(null);
    startTransition(async () => {
      const result = await setAisleOrderAction(next).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
      if (!result.ok) {
        setOrder(previous);
        setError(result.error);
      }
    });
  }

  function move(index: number, by: -1 | 1) {
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    save(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col divide-y rounded-lg border" aria-label="Aisle order">
        {order.map((aisle, i) => (
          <li key={aisle} className="flex min-h-11 items-center gap-2 py-0.5 pr-1 pl-3" data-testid="aisle-row">
            <span className="w-6 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="flex-1">{AISLE_LABELS[aisle]}</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`Move ${AISLE_LABELS[aisle]} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`Move ${AISLE_LABELS[aisle]} down`}
              disabled={i === order.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button variant="outline" disabled={isDefault} onClick={() => save([...DEFAULT_AISLE_ORDER])}>
        Reset to default order
      </Button>
    </div>
  );
}

type IngredientProps = {
  items: IngredientSetting[];
  more: boolean;
  q: string;
  pantryOnly: boolean;
};

/** F2: each ingredient's aisle and pantry-staple flag. Changes save straight away. */
export function IngredientSettings({ items, more, q: initialQ, pantryOnly }: IngredientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [searching, startSearch] = useTransition();
  const [q, setQ] = useState(initialQ);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function go(next: { q?: string; pantryOnly?: boolean }) {
    const params = new URLSearchParams();
    const query = (next.q ?? q).trim();
    if (query) params.set("q", query);
    if (next.pantryOnly ?? pantryOnly) params.set("pantry", "1");
    const search = params.toString();
    startSearch(() => router.replace(`${pathname}${search ? `?${search}` : ""}`, { scroll: false }));
  }

  function onSearch(value: string) {
    setQ(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => go({ q: value }), 300);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Search ingredients" placeholder="Search ingredients" value={q} onChange={(e) => onSearch(e.target.value)} className="pl-10" />
      </div>
      <div className="flex gap-2" role="group" aria-label="Show">
        <Button variant={pantryOnly ? "outline" : "default"} size="sm" aria-pressed={!pantryOnly} onClick={() => go({ pantryOnly: false })}>
          All
        </Button>
        <Button variant={pantryOnly ? "default" : "outline"} size="sm" aria-pressed={pantryOnly} onClick={() => go({ pantryOnly: true })}>
          Pantry staples
        </Button>
      </div>

      <div className={cn("transition-opacity", searching && "opacity-70")}>
        {items.length ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {items.map((item) => (
              // Keyed by value so a fresh server row replaces stale local state.
              <IngredientRow key={`${item.id}:${item.aisle}:${item.isPantryStaple}`} item={item} />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {q.trim() || pantryOnly ? "No ingredients match." : "Ingredients appear here once you save recipes."}
          </p>
        )}
        {more ? <p className="mt-2 text-sm text-muted-foreground">Showing the first 100. Search to find others.</p> : null}
      </div>
    </div>
  );
}

function IngredientRow({ item }: { item: IngredientSetting }) {
  const [aisle, setAisle] = useState(item.aisle);
  const [pantry, setPantry] = useState(item.isPantryStaple);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function save(patch: { aisle?: Aisle; isPantryStaple?: boolean }) {
    const previous = { aisle, pantry };
    if (patch.aisle) setAisle(patch.aisle);
    if (patch.isPantryStaple !== undefined) setPantry(patch.isPantryStaple);
    setError(null);
    startTransition(async () => {
      const result = await updateIngredientAction(item.id, patch).catch(() => ({ ok: false as const, error: "Couldn't save. Try again." }));
      if (!result.ok) {
        setAisle(previous.aisle);
        setPantry(previous.pantry);
        setError(result.error);
      }
    });
  }

  const nameId = `ingredient-${item.id}`;
  return (
    <li className="flex flex-col gap-2 px-3 py-2" data-testid="ingredient-row">
      <div className="flex items-baseline justify-between gap-2">
        <span id={nameId} className="font-medium first-letter:uppercase">
          {item.name}
        </span>
        <span className="text-sm text-muted-foreground">
          {item.recipeCount} {item.recipeCount === 1 ? "recipe" : "recipes"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <select
          className={cn(selectClass, "min-w-0 flex-1")}
          aria-label={`Aisle for ${item.name}`}
          value={aisle}
          onChange={(e) => save({ aisle: e.target.value as Aisle })}
        >
          {AISLES.map((a) => (
            <option key={a} value={a}>
              {AISLE_LABELS[a]}
            </option>
          ))}
        </select>
        <label className="flex min-h-11 shrink-0 items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={pantry}
            aria-describedby={nameId}
            onChange={(e) => save({ isPantryStaple: e.target.checked })}
          />
          Pantry staple
        </label>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </li>
  );
}
