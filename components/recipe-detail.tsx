"use client";

import { Archive, ArchiveRestore, EllipsisVertical, Heart, Minus, Pencil, Plus, ShoppingCart, Star, ThumbsDown, Trash2 } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import {
  deleteRecipeAction,
  dislikeRecipeAction,
  rateRecipeAction,
  setRecipeStatusAction,
  toggleFavoriteAction,
} from "@/app/(app)/recipes/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RecipeStatus } from "@/lib/enums";
import { formatAmount } from "@/lib/quantity";
import type { UnitCode } from "@/lib/units";
import { cn } from "@/lib/utils";

type Ingredient = {
  id: string;
  section: string | null;
  quantity: number | null;
  quantityMax: number | null;
  unit: UnitCode | null;
  name: string;
  prepNote: string | null;
  isOptional: boolean;
};

/** Servings stepper plus the ingredient list it rescales (PRD B3). */
export function ScaledIngredients({ servings, ingredients }: { servings: number; ingredients: Ingredient[] }) {
  const [target, setTarget] = useState(servings);
  const factor = target / servings;

  const groups: { section: string | null; items: Ingredient[] }[] = [];
  for (const i of ingredients) {
    const last = groups.at(-1);
    if (last && last.section === i.section) last.items.push(i);
    else groups.push({ section: i.section, items: [i] });
  }

  return (
    <section aria-labelledby="ingredients-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="ingredients-heading" className="text-lg font-semibold">
          Ingredients
        </h2>
        <div className="flex items-center gap-1" role="group" aria-label="Servings">
          <Button
            variant="outline"
            size="icon"
            aria-label="Fewer servings"
            disabled={target <= 1}
            onClick={() => setTarget((n) => Math.max(1, n - 1))}
          >
            <Minus aria-hidden />
          </Button>
          <output className="min-w-24 text-center" aria-live="polite">
            <span className="font-semibold">{target}</span> {target === 1 ? "serving" : "servings"}
          </output>
          <Button
            variant="outline"
            size="icon"
            aria-label="More servings"
            disabled={target >= 100}
            onClick={() => setTarget((n) => Math.min(100, n + 1))}
          >
            <Plus aria-hidden />
          </Button>
        </div>
      </div>
      {target !== servings ? (
        <p className="text-sm text-muted-foreground">
          Scaled from {servings}.{" "}
          <button type="button" className="underline" onClick={() => setTarget(servings)}>
            Reset
          </button>
        </p>
      ) : null}
      {ingredients.length === 0 ? <p className="text-muted-foreground">No ingredients listed.</p> : null}
      {groups.map((group, gi) => (
        <div key={gi} className="flex flex-col gap-1">
          {group.section ? <h3 className="pt-2 font-semibold">{group.section}</h3> : null}
          <ul className="flex flex-col divide-y">
            {group.items.map((i) => {
              const amount = formatAmount(i.quantity, i.quantityMax, i.unit, factor);
              return (
                <li key={i.id} className="flex gap-3 py-2.5" data-testid="ingredient">
                  <span className="w-28 shrink-0 font-semibold tabular-nums">{amount}</span>
                  <span>
                    {i.name}
                    {i.prepNote ? <span className="text-muted-foreground">, {i.prepNote}</span> : null}
                    {i.isOptional ? <span className="text-muted-foreground"> (optional)</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** My 1–5 stars (PRD B4). Tapping the current rating clears it. */
export function StarRating({ recipeId, value, label }: { recipeId: string; value: number | null; label: string }) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [, startTransition] = useTransition();

  function rate(n: number) {
    const next = optimistic === n ? null : n;
    startTransition(async () => {
      setOptimistic(next);
      await rateRecipeAction(recipeId, next);
    });
  }

  return (
    <div role="radiogroup" aria-label={label} className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={optimistic === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => rate(n)}
          className="flex size-11 items-center justify-center"
        >
          <Star
            className={cn(
              "size-7",
              optimistic !== null && n <= optimistic ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50",
            )}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}

export function StaticStars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-sm text-muted-foreground">Not rated</span>;
  return (
    <span className="flex" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("size-5", n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function FavoriteButton({ recipeId, isFavorite }: { recipeId: string; isFavorite: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(isFavorite);
  const [, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      aria-pressed={optimistic}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFavoriteAction(recipeId, !optimistic);
        })
      }
    >
      <Heart className={cn(optimistic && "fill-red-500 text-red-500")} aria-hidden />
      {optimistic ? "Favorite" : "Add to favorites"}
    </Button>
  );
}

/** Edit, didn't like, archive, delete (PRD B5). */
export function RecipeActions({ recipeId, status }: { recipeId: string; status: RecipeStatus }) {
  const [dialog, setDialog] = useState<"dislike" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Recipe actions">
            <EllipsisVertical className="size-6" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem asChild>
            <Link href={`/recipes/${recipeId}/edit`}>
              <Pencil aria-hidden /> Edit
            </Link>
          </DropdownMenuItem>
          {status === "active" ? (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/lists/new?recipe=${recipeId}`}>
                  <ShoppingCart aria-hidden /> Make a grocery list
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog("dislike")}>
                <ThumbsDown aria-hidden /> Didn&apos;t like it…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => startTransition(() => setRecipeStatusAction(recipeId, "archived"))}>
                <Archive aria-hidden /> Archive
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => startTransition(() => setRecipeStatusAction(recipeId, "active"))}>
              <ArchiveRestore aria-hidden /> Move back to library
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden /> Delete…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === "dislike"} onOpenChange={(open) => setDialog(open ? "dislike" : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Didn&apos;t like it</DialogTitle>
            <DialogDescription>
              It leaves the library and the planner, but stays findable under Filters → Show → Didn&apos;t like.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await dislikeRecipeAction(recipeId, reason);
                if (result.error) setError(result.error);
                else {
                  setDialog(null);
                  setReason("");
                  setError(null);
                }
              });
            }}
          >
            <Label htmlFor="dislike-reason">What didn&apos;t work?</Label>
            <Textarea
              id="dislike-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Too salty, kids wouldn't eat it…"
              aria-invalid={!!error || undefined}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(open) => setDialog(open ? "delete" : null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this recipe?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from the library for both of you. To just hide it, archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                startTransition(() => deleteRecipeAction(recipeId));
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
