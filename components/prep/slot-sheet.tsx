"use client";

import { Minus, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { useMemo, useState } from "react";
import { EaterLine } from "@/components/prep/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, dayLabel, type MealSlot, SLOT_LABELS } from "@/lib/plan/week";
import { formatMoney } from "@/lib/prep/format";
import type { SlotInput } from "@/lib/prep/validation";
import type { EntryKind, EntryView, MenuView } from "@/lib/prep/view";
import { formatNumber } from "@/lib/quantity";
import { cn } from "@/lib/utils";

export type RecipeChoice = { id: string; title: string; servings: number; coverUrl: string | null };

export type SlotTarget = { day: string; slot: MealSlot; entry: EntryView | null; position: number };

type Props = {
  target: SlotTarget | null;
  weekStart: string;
  weekId: string;
  menu: MenuView;
  recipes: RecipeChoice[];
  entries: EntryView[];
  guestsOn: boolean;
  pending: boolean;
  /** A question from the server ("Replace Thursday's lunch with leftovers?"). */
  confirm: string | null;
  /** A failed save, shown in the sheet. */
  error: string | null;
  onClose: () => void;
  onSave: (input: SlotInput) => void;
  onRemove: (entry: EntryView) => void;
};

const KINDS: { kind: EntryKind; label: string }[] = [
  { kind: "meal", label: "Meal" },
  { kind: "recipe", label: "Recipe" },
  { kind: "leftovers", label: "Leftovers" },
  { kind: "flex", label: "Flex" },
];

export function SlotSheet(props: Props) {
  const { target } = props;
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {target ? <SlotForm key={`${target.day}:${target.slot}:${target.entry?.id ?? "new"}`} {...props} target={target} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SlotForm({ target, weekStart, weekId, menu, recipes, entries, guestsOn, pending, confirm, error, onSave, onRemove }: Props & { target: SlotTarget }) {
  const { entry, day, slot } = target;
  const weekday = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`)) / 86_400_000) + 1;
  const isSunday = weekday === 7;
  const slotMeals = menu.meals.filter((m) => !m.isFlex && m.slot === slot);
  const otherMeals = menu.meals.filter((m) => !m.isFlex && m.slot !== slot);
  const flexMeals = menu.meals.filter((m) => m.isFlex);
  const dinners = entries.filter((e) => e.slot === "dinner" && e.kind !== "leftovers" && e.day < day);
  const eaterCount = menu.eaters.filter((e) => e.isActive && e.slots.includes(slot) && (e.kind === "member" || guestsOn)).length;

  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? "meal");
  const [mealId, setMealId] = useState<string>(
    entry?.kind === "meal" && entry.coreMealId ? entry.coreMealId : (slotMeals[0]?.id ?? otherMeals[0]?.id ?? ""),
  );
  const [choices, setChoices] = useState<Record<string, string>>(entry?.choices ?? {});
  const [flavor, setFlavor] = useState(entry?.flavor ?? "");
  const [isDouble, setDouble] = useState(entry ? entry.isDouble : slot === "dinner" && menu.doubleWeekdays.includes(weekday) && !isSunday);
  const [noPrep, setNoPrep] = useState(entry?.noPrep ?? false);
  const [recipeId, setRecipeId] = useState<string | null>(entry?.recipeId ?? null);
  const [servings, setServings] = useState(entry?.servings ?? Math.max(1, eaterCount));
  const [query, setQuery] = useState("");
  const [leftoverOf, setLeftoverOf] = useState<string | null>(
    entry?.leftoverOf ?? dinners.find((d) => d.day === addDays(day, -1))?.id ?? dinners.at(-1)?.id ?? null,
  );
  const [flexId, setFlexId] = useState<string | null>(entry?.kind === "flex" ? entry.coreMealId : (flexMeals[0]?.id ?? null));
  const [confirmRemove, setConfirmRemove] = useState(false);

  const meal = menu.meals.find((m) => m.id === mealId);
  const foodsByCategory = useMemo(() => {
    const map = new Map<string, MenuView["foods"]>();
    for (const f of menu.foods) map.set(f.category, [...(map.get(f.category) ?? []), f]);
    return map;
  }, [menu.foods]);
  const shownRecipes = recipes.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40);
  const recipe = recipes.find((r) => r.id === recipeId) ?? null;

  function submit(confirmReplace: boolean) {
    let e: SlotInput["entry"];
    if (kind === "meal") e = { kind: "meal", coreMealId: mealId, choices };
    else if (kind === "recipe") e = { kind: "recipe", recipeId: recipeId!, servings };
    else if (kind === "leftovers") e = { kind: "leftovers", leftoverOf: leftoverOf! };
    else e = { kind: "flex", coreMealId: flexId };
    onSave({
      weekId,
      entryId: entry?.id ?? null,
      day,
      slot,
      entry: e,
      flavor: flavor.trim() || null,
      isDouble: slot === "dinner" && (kind === "meal" || kind === "recipe") && isDouble,
      noPrep,
      position: target.position,
      confirmReplace,
    });
  }

  const canSave =
    (kind === "meal" && Boolean(meal)) || (kind === "recipe" && Boolean(recipeId)) || (kind === "leftovers" && Boolean(leftoverOf)) || kind === "flex";

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {dayLabel(day)} · {SLOT_LABELS[slot]}
        </DialogTitle>
        <DialogDescription>{entry ? "Change what you eat here." : "Add to this meal."}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="What goes here">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cn("min-h-11 rounded-lg border text-sm font-medium", kind === k.kind ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind === "meal" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slot-meal">Meal</Label>
            <select
              id="slot-meal"
              value={mealId}
              onChange={(e) => {
                setMealId(e.target.value);
                setChoices({});
              }}
              className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
            >
              {slotMeals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              {otherMeals.length ? (
                <optgroup label="Other meals">
                  {otherMeals.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
          {meal?.components
            .filter((c) => c.swapCategory)
            .map((c) => (
              <div key={c.id} className="flex flex-col gap-1.5">
                <Label htmlFor={`swap-${c.id}`} className="capitalize">
                  {c.label ?? c.role}
                </Label>
                <select
                  id={`swap-${c.id}`}
                  value={choices[c.id] ?? c.defaultFoodId}
                  onChange={(e) => setChoices({ ...choices, [c.id]: e.target.value })}
                  className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
                >
                  {(foodsByCategory.get(c.swapCategory!) ?? []).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          <FlavorField flavor={flavor} setFlavor={setFlavor} ideas={meal?.flavorIdeas ?? []} />
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-5 accent-primary" checked={noPrep} onChange={(e) => setNoPrep(e.target.checked)} />
            Cooked fresh (leave out of prep tasks)
          </label>
        </div>
      ) : null}

      {kind === "recipe" ? (
        recipe ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Thumb url={recipe.coverUrl} />
              <span className="flex-1 font-medium">{recipe.title}</span>
              <Button variant="ghost" size="sm" onClick={() => setRecipeId(null)}>
                Change
              </Button>
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Servings">
              <Button type="button" variant="outline" size="icon" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings(Math.max(1, servings - 1))}>
                <Minus aria-hidden />
              </Button>
              <output className="w-24 text-center">
                <span className="font-semibold">{formatNumber(servings)}</span> servings
              </output>
              <Button type="button" variant="outline" size="icon" aria-label="More servings" onClick={() => setServings(Math.min(200, servings + 1))}>
                <Plus aria-hidden />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Counts toward cost; nutrition isn&apos;t counted for library recipes yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input type="search" aria-label="Search recipes" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
            {recipes.length === 0 ? <p className="text-sm text-muted-foreground">Add recipes to your library first.</p> : null}
            <ul className="flex max-h-72 flex-col divide-y overflow-y-auto" aria-label="Recipes">
              {shownRecipes.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setRecipeId(r.id)} className="flex min-h-12 w-full items-center gap-3 py-1 text-left">
                    <Thumb url={r.coverUrl} />
                    <span className="font-medium">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {kind === "leftovers" ? (
        dinners.length ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slot-leftover">Leftovers of</Label>
            <select
              id="slot-leftover"
              value={leftoverOf ?? ""}
              onChange={(e) => setLeftoverOf(e.target.value)}
              className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
            >
              {dinners.map((d) => (
                <option key={d.id} value={d.id}>
                  {dayLabel(d.day).split(",")[0]} dinner: {d.title}
                  {d.flavor ? ` (${d.flavor})` : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Members eat the leftovers; turn on Double for that dinner so enough gets bought.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No dinner earlier this week to have leftovers of.</p>
        )
      ) : null}

      {kind === "flex" ? (
        <div className="flex flex-col gap-3">
          {flexMeals.length > 1 ? (
            <select
              aria-label="Flex meal"
              value={flexId ?? ""}
              onChange={(e) => setFlexId(e.target.value)}
              className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
            >
              {flexMeals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slot-flex-note">Note</Label>
            <Input id="slot-flex-note" value={flavor} maxLength={80} placeholder="Leftovers or a planned meal out" onChange={(e) => setFlavor(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Adds no cost or nutrition; the day shows as not fully counted.</p>
        </div>
      ) : null}

      {slot === "dinner" && (kind === "meal" || kind === "recipe") ? (
        <label className={cn("flex min-h-11 items-center gap-3", isSunday && "opacity-60")}>
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={isDouble && !isSunday}
            disabled={isSunday}
            onChange={(e) => setDouble(e.target.checked)}
          />
          <span>
            Double
            <span className="block text-xs text-muted-foreground">
              {isSunday ? "Sunday leftovers fall in next week." : "Cook twice over; the extra is tomorrow's lunch."}
            </span>
          </span>
        </label>
      ) : null}

      {entry && entry.kind === kind ? <SavedNumbers entry={entry} /> : null}

      {confirm ? (
        <div role="alertdialog" aria-label={confirm} className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">{confirm}</p>
          <Button disabled={pending} onClick={() => submit(true)}>
            Replace with leftovers
          </Button>
          <p className="text-xs text-muted-foreground">Or turn Double off to keep that lunch.</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <DialogFooter className="gap-2">
        {entry ? (
          <Button variant="destructive" disabled={pending} onClick={() => (confirmRemove ? onRemove(entry) : setConfirmRemove(true))}>
            <Trash2 aria-hidden /> {confirmRemove ? "Tap again to clear" : "Clear"}
          </Button>
        ) : null}
        <Button disabled={pending || !canSave} onClick={() => submit(false)}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

function FlavorField({ flavor, setFlavor, ideas }: { flavor: string; setFlavor: (s: string) => void; ideas: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="slot-flavor">
        Flavor <span className="font-normal text-muted-foreground">Optional</span>
      </Label>
      <Input id="slot-flavor" value={flavor} maxLength={80} placeholder="garlic-herb" onChange={(e) => setFlavor(e.target.value)} />
      {ideas.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Flavor ideas">
          {ideas.map((idea) => (
            <li key={idea}>
              <button
                type="button"
                onClick={() => setFlavor(idea)}
                className={cn("min-h-9 rounded-full border px-3 text-sm", flavor === idea ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
              >
                {idea}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** This slot's cost and each eater's numbers, as saved (the server computes them). */
function SavedNumbers({ entry }: { entry: EntryView }) {
  const b = entry.breakdown;
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3 text-sm">
      <p>
        <span className="font-semibold">{formatMoney(b.costCents)}</span> for this meal
        {entry.kind === "recipe" ? " (partly priced)" : ""}
        {entry.isDouble ? ", with the double" : ""}
      </p>
      {b.notCounted ? <p className="text-muted-foreground">Nutrition not counted.</p> : null}
      {!b.notCounted
        ? b.plates.map((p) => (
            <div key={p.eaterId} className="flex flex-col">
              <EaterLine plate={p} />
              {p.kcal > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(p.kcal)} kcal · {Math.round(p.protein)} g protein
                </span>
              ) : null}
            </div>
          ))
        : null}
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  return (
    <span className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos come straight from the public bucket
        <img src={url} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <UtensilsCrossed className="m-2.5 size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}
