"use client";

import { Check, Minus, Plus, Search, UtensilsCrossed } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { createListFromRecipesAction } from "@/app/(app)/lists/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Recipe = { id: string; title: string; servings: number; coverUrl: string | null };

/** E1: pick recipes and servings, then build one merged list. */
export function NewListForm({ recipes, preselect }: { recipes: Recipe[]; preselect: string | null }) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Map<string, number>>(() => {
    const r = recipes.find((x) => x.id === preselect);
    return new Map(r ? [[r.id, r.servings]] : []);
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? recipes.filter((r) => r.title.toLowerCase().includes(q)) : recipes;
  }, [recipes, query]);

  function toggle(r: Recipe) {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(r.id)) next.delete(r.id);
      else next.set(r.id, r.servings);
      return next;
    });
  }

  function setServings(id: string, servings: number) {
    setPicked((m) => new Map(m).set(id, Math.min(200, Math.max(1, servings))));
  }

  function submit() {
    const today = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
    setError(null);
    startTransition(async () => {
      const result = await createListFromRecipesAction({
        name: name.trim() || `Groceries · ${today}`,
        picks: [...picked].map(([recipeId, servings]) => ({ recipeId, servings })),
      });
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-28">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="list-name">
          List name <span className="font-normal text-muted-foreground">Optional</span>
        </Label>
        <Input id="list-name" placeholder="Groceries" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          aria-label="Search recipes"
          placeholder="Search recipes"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {recipes.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Add some recipes first, then come back to make a list.</p>
      ) : null}

      <ul className="flex flex-col divide-y" aria-label="Recipes">
        {shown.map((r) => {
          const servings = picked.get(r.id);
          const selected = servings !== undefined;
          return (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(r)}
                className="flex min-h-14 flex-1 items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                  )}
                >
                  {selected ? <Check className="size-4" aria-hidden /> : null}
                </span>
                <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {r.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photos come straight from the public bucket
                    <img src={r.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <UtensilsCrossed className="m-3 size-6 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <span className="line-clamp-2 font-medium">{r.title}</span>
              </button>
              {selected ? (
                <div className="flex items-center" role="group" aria-label={`Servings for ${r.title}`}>
                  <Button variant="ghost" size="icon" aria-label="Fewer servings" onClick={() => setServings(r.id, servings - 1)} disabled={servings <= 1}>
                    <Minus aria-hidden />
                  </Button>
                  <output className="w-8 text-center font-semibold">{servings}</output>
                  <Button variant="ghost" size="icon" aria-label="More servings" onClick={() => setServings(r.id, servings + 1)}>
                    <Plus aria-hidden />
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button size="lg" onClick={submit} disabled={pending || picked.size === 0}>
            {pending ? "Making list…" : picked.size ? `Make list from ${picked.size} recipe${picked.size === 1 ? "" : "s"}` : "Pick recipes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
