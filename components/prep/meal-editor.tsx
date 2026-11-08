"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCoreMealAction, saveCoreMealAction } from "@/app/(app)/prep/actions";
import { EATER_COLOR } from "@/components/prep/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CORE_COMPONENT_ROLES, CORE_FOOD_CATEGORIES, type CoreComponentRole, type CoreFoodCategory } from "@/lib/enums";
import { MEAL_SLOTS, type MealSlot, SLOT_LABELS } from "@/lib/plan/week";
import { formatCooked, parseAmount } from "@/lib/prep/format";
import { CATEGORY_LABELS, ROLE_LABELS } from "@/lib/prep/labels";
import type { EaterRecord, FoodRecord, MealRecord } from "@/lib/prep/load";
import { cn } from "@/lib/utils";

type Cell = { text: string; needsReview: boolean };
type Part = {
  key: string;
  id: string | null;
  role: CoreComponentRole;
  label: string;
  swapCategory: CoreFoodCategory | "";
  defaultFoodId: string;
  prepAs: string;
  cells: Record<string, Cell>;
};

/** A stored amount as typed: "227 g" for weighed foods, "3" for counted ones. */
function amountText(food: FoodRecord | undefined, amount: number): string {
  if (!food) return String(amount);
  return food.unitKind === "count" ? String(amount) : `${Math.round(amount * 10) / 10} g`;
}

export function MealEditor({
  meal,
  foods,
  eaters,
  needsReview,
}: {
  meal: MealRecord | null;
  foods: FoodRecord[];
  eaters: EaterRecord[];
  needsReview: string[];
}) {
  const router = useRouter();
  const foodById = new Map(foods.map((f) => [f.id, f]));
  const review = new Set(needsReview);
  const [name, setName] = useState(meal?.name ?? "");
  const [slot, setSlot] = useState<MealSlot>(meal?.slot ?? "dinner");
  const [ideas, setIdeas] = useState((meal?.flavorIdeas ?? []).join(", "));
  const [parts, setParts] = useState<Part[]>(() =>
    (meal?.components ?? []).map((c) => ({
      key: c.id,
      id: c.id,
      role: c.role,
      label: c.label ?? "",
      swapCategory: c.swapCategory ?? "",
      defaultFoodId: c.defaultFoodId,
      prepAs: c.prepAs ?? "",
      cells: Object.fromEntries(
        Object.entries(c.portions).map(([eaterId, amount]) => [eaterId, { text: amountText(foodById.get(c.defaultFoodId), amount), needsReview: review.has(`${c.id}:${eaterId}`) }]),
      ),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  // Columns: active eaters who eat this slot (required), plus anyone with a portion already.
  const required = new Set(eaters.filter((e) => e.isActive && e.slots.includes(slot)).map((e) => e.id));
  const columns = eaters.filter((e) => required.has(e.id) || parts.some((p) => p.cells[e.id]?.text));
  const isFlex = meal?.isFlex ?? false;

  const update = (key: string, patch: Partial<Part>) => setParts((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const setCell = (key: string, eaterId: string, text: string) =>
    setParts((ps) => ps.map((p) => (p.key === key ? { ...p, cells: { ...p.cells, [eaterId]: { text, needsReview: false } } } : p)));

  function parsed(p: Part, eaterId: string): number | null | "bad" {
    const cell = p.cells[eaterId];
    if (!cell || !cell.text.trim()) return null;
    const food = foodById.get(p.defaultFoodId);
    if (!food) return "bad";
    const r = parseAmount(cell.text, food);
    return "error" in r ? "bad" : r.amount;
  }

  function save() {
    setError(null);
    for (const p of parts) {
      for (const e of columns) {
        const v = parsed(p, e.id);
        if (v === "bad") return setError(`${e.name}'s ${foodById.get(p.defaultFoodId)?.name.toLowerCase() ?? "portion"}: type an amount like 227 g, 6 oz cooked or 3.`);
        if (v === null && required.has(e.id)) return setError(`Fill in ${e.name}'s ${foodById.get(p.defaultFoodId)?.name.toLowerCase() ?? "portion"} (or set it to 0).`);
      }
    }
    startTransition(async () => {
      const result = await saveCoreMealAction({
        id: meal?.id ?? null,
        name,
        slot,
        flavorIdeas: ideas.split(",").map((s) => s.trim()).filter(Boolean),
        notes: meal?.notes ?? null,
        components: parts.map((p) => ({
          id: p.id,
          role: p.role,
          label: p.label,
          swapCategory: p.swapCategory || null,
          defaultFoodId: p.defaultFoodId,
          prepAs: p.prepAs,
          portions: columns.map((e) => {
            const v = parsed(p, e.id);
            return { eaterId: e.id, amount: typeof v === "number" ? v : null, needsReview: p.cells[e.id]?.needsReview ?? false };
          }),
        })),
      });
      if (result.error) setError(result.error);
      else {
        router.push("/prep/menu?tab=meals");
        router.refresh();
      }
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-name">Name</Label>
          <Input id="meal-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-slot">Usually for</Label>
          <select id="meal-slot" value={slot} onChange={(e) => setSlot(e.target.value as MealSlot)} className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30">
            {MEAL_SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meal-ideas">Flavor ideas</Label>
          <Input id="meal-ideas" value={ideas} onChange={(e) => setIdeas(e.target.value)} placeholder="garlic-herb, taco, BBQ" />
          <p className="text-xs text-muted-foreground">Separated by commas; offered when you plan the meal.</p>
        </div>
      </section>

      {isFlex ? (
        <p className="rounded-xl bg-muted p-3 text-sm">A flex meal has no food in it: it adds no cost or nutrition.</p>
      ) : (
        <section aria-labelledby="parts-heading" className="flex flex-col gap-3">
          <h2 id="parts-heading" className="font-semibold">
            Parts and portions
          </h2>
          <p className="text-xs text-muted-foreground">
            Portions are as bought (raw). Type grams, oz, lb, a count, or a cooked amount like &ldquo;6 oz cooked&rdquo;.
          </p>
          {parts.map((p, i) => {
            const food = foodById.get(p.defaultFoodId);
            const choices = foods.filter((f) => !f.deleted && (!p.swapCategory || f.category === p.swapCategory));
            return (
              <div key={p.key} className="flex flex-col gap-2 rounded-xl border p-3" data-testid="meal-part">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`role-${p.key}`} className="text-xs">
                      Part
                    </Label>
                    <select id={`role-${p.key}`} value={p.role} onChange={(e) => update(p.key, { role: e.target.value as CoreComponentRole })} className="h-11 rounded-lg border border-input bg-transparent px-2 text-base dark:bg-input/30">
                      {CORE_COMPONENT_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`swap-${p.key}`} className="text-xs">
                      Swappable
                    </Label>
                    <select
                      id={`swap-${p.key}`}
                      value={p.swapCategory}
                      onChange={(e) => {
                        const swapCategory = e.target.value as CoreFoodCategory | "";
                        const ok = !swapCategory || food?.category === swapCategory;
                        update(p.key, { swapCategory, defaultFoodId: ok ? p.defaultFoodId : (foods.find((f) => !f.deleted && f.category === swapCategory)?.id ?? "") });
                      }}
                      className="h-11 rounded-lg border border-input bg-transparent px-2 text-base dark:bg-input/30"
                    >
                      <option value="">No, always this food</option>
                      {CORE_FOOD_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          Any {CATEGORY_LABELS[c].toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`food-${p.key}`} className="text-xs">
                    {p.swapCategory ? "Default food" : "Food"}
                  </Label>
                  <select id={`food-${p.key}`} value={p.defaultFoodId} onChange={(e) => update(p.key, { defaultFoodId: e.target.value })} className="h-11 rounded-lg border border-input bg-transparent px-2 text-base dark:bg-input/30">
                    <option value="" disabled>
                      Pick a food
                    </option>
                    {choices.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`label-${p.key}`} className="text-xs">
                      Label (optional)
                    </Label>
                    <Input id={`label-${p.key}`} value={p.label} maxLength={40} placeholder="Green vegetable" onChange={(e) => update(p.key, { label: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`prep-${p.key}`} className="text-xs">
                      Prep as (optional)
                    </Label>
                    <Input id={`prep-${p.key}`} value={p.prepAs} maxLength={40} placeholder="lunch protein" onChange={(e) => update(p.key, { prepAs: e.target.value })} />
                  </div>
                </div>
                <div className="flex flex-col gap-1" role="group" aria-label="Portions">
                  {columns.map((e) => {
                    const v = parsed(p, e.id);
                    const missing = v === null && required.has(e.id);
                    const cell = p.cells[e.id];
                    return (
                      <div key={e.id} className="flex items-center gap-2">
                        <Label htmlFor={`cell-${p.key}-${e.id}`} className={cn("w-20 shrink-0 truncate", EATER_COLOR[e.color])}>
                          {e.name}
                        </Label>
                        <Input
                          id={`cell-${p.key}-${e.id}`}
                          value={cell?.text ?? ""}
                          placeholder={required.has(e.id) ? "Required" : "—"}
                          aria-invalid={missing || v === "bad" || undefined}
                          className={cn("w-32", (missing || v === "bad") && "border-destructive bg-destructive/5")}
                          onChange={(ev) => setCell(p.key, e.id, ev.target.value)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {typeof v === "number" && food && v > 0 ? `≈ ${formatCooked(food, v).amount}` : v === "bad" ? "Can't read that" : ""}
                          {cell?.needsReview ? <span className="ml-1 font-medium text-amber-700 dark:text-amber-400">check portions</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => setParts((ps) => swap(ps, i, i - 1))}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === parts.length - 1} onClick={() => setParts((ps) => swap(ps, i, i + 1))}>
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Remove part" onClick={() => setParts((ps) => ps.filter((x) => x.key !== p.key))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          <Button
            variant="outline"
            onClick={() =>
              setParts((ps) => [
                ...ps,
                { key: crypto.randomUUID(), id: null, role: "other", label: "", swapCategory: "", defaultFoodId: "", prepAs: "", cells: {} },
              ])
            }
          >
            <Plus aria-hidden /> Add a part
          </Button>
        </section>
      )}

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="lg" disabled={pending || !name.trim()} onClick={save}>
        {pending ? "Saving…" : meal ? "Save meal" : "Add meal"}
      </Button>
      {meal ? (
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            startTransition(async () => {
              const result = await deleteCoreMealAction(meal.id);
              if (result.error) {
                setDeleteError(result.error);
                setConfirmDelete(false);
              } else {
                router.push("/prep/menu?tab=meals");
                router.refresh();
              }
            });
          }}
        >
          <Trash2 aria-hidden /> {confirmDelete ? "Tap again to delete" : "Delete meal"}
        </Button>
      ) : null}
      {deleteError ? (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      ) : null}
    </main>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}
