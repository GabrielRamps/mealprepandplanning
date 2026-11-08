"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteCoreFoodAction, upsertCoreFoodAction } from "@/app/(app)/prep/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AISLES, type Aisle, CORE_FOOD_CATEGORIES, type CoreFoodCategory } from "@/lib/enums";
import { AISLE_LABELS } from "@/lib/grocery/aisles";
import { formatMoney, formatWeight, parseAmount } from "@/lib/prep/format";
import { CATEGORY_LABELS, isPriceStale } from "@/lib/prep/labels";
import type { FoodRecord } from "@/lib/prep/load";
import { WALMART_PREFIX } from "@/lib/prep/validation";

type History = { priceCents: number; packageAmount: number; source: "manual" | "receipt" | "seed"; observedOn: string; by: string | null };

const SOURCE: Record<History["source"], string> = { manual: "by hand", receipt: "receipt", seed: "estimate" };

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

/** All core food fields (PRD-prep 7.1), entered in friendly units and saved in grams and cents. */
export function FoodEditor({ food, history }: { food: FoodRecord | null; history: History[] }) {
  const router = useRouter();
  const [f, setF] = useState(() => ({
    name: food?.name ?? "",
    category: (food?.category ?? "protein") as CoreFoodCategory,
    unitKind: food?.unitKind ?? "weight",
    gramsPerCount: food?.gramsPerCount?.toString() ?? "",
    kcal: food?.per100g.kcal.toString() ?? "",
    protein: food?.per100g.protein.toString() ?? "",
    carbs: food?.per100g.carbs.toString() ?? "0",
    fat: food?.per100g.fat.toString() ?? "0",
    fiber: food?.per100g.fiber.toString() ?? "0",
    cookedYield: food?.cookedYield.toString() ?? "1",
    displayCupG: food?.displayCupG?.toString() ?? "",
    packageLabel: food?.packageLabel ?? "",
    packageSize: food ? (food.unitKind === "count" ? String(food.packageAmount) : `${food.packageAmount} g`) : "",
    price: food ? (food.packagePriceCents / 100).toFixed(2) : "",
    // A price typed by hand is real unless ticked otherwise (P-2).
    estimate: false,
    buyMode: food?.buyMode ?? "by_amount",
    restockWeeks: food?.restockWeeks?.toString() ?? "4",
    walmartName: food?.walmartName ?? "",
    walmartUrl: food?.walmartUrl ?? "",
    notes: food?.notes ?? "",
    aisle: (food?.aisle ?? "other") as Aisle,
  }));
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const pkg = parseAmount(f.packageSize, { unitKind: f.unitKind, gramsPerCount: num(f.gramsPerCount) || null, cookedYield: 1, displayCupG: null });
  const priceChanged = food ? Math.round(num(f.price) * 100) !== food.packagePriceCents : true;

  function save() {
    setError(null);
    if ("error" in pkg) return setError(`Package size: ${pkg.error}`);
    const cents = Math.round(num(f.price.replace(/[$,]/g, "")) * 100);
    if (!Number.isFinite(cents)) return setError("Type the package price, like 11.97");
    startTransition(async () => {
      const result = await upsertCoreFoodAction({
        id: food?.id ?? null,
        name: f.name,
        category: f.category,
        unitKind: f.unitKind,
        gramsPerCount: f.unitKind === "count" ? num(f.gramsPerCount) : null,
        kcal100g: num(f.kcal),
        protein100g: num(f.protein),
        carbs100g: num(f.carbs) || 0,
        fat100g: num(f.fat) || 0,
        fiber100g: num(f.fiber) || 0,
        cookedYield: num(f.cookedYield),
        displayCupG: f.displayCupG.trim() ? num(f.displayCupG) : null,
        packageLabel: f.packageLabel,
        packageAmount: pkg.amount,
        packagePriceCents: cents,
        priceIsEstimate: f.estimate,
        buyMode: f.buyMode,
        restockWeeks: f.buyMode === "restock" ? num(f.restockWeeks) : null,
        walmartName: f.walmartName,
        walmartUrl: f.walmartUrl,
        notes: f.notes,
        aisle: f.aisle,
      });
      if (result.error) setError(result.error);
      else {
        router.push("/prep/menu?tab=foods");
        router.refresh();
      }
    });
  }

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, opts: { hint?: string; inputMode?: "decimal" | "text" } = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} inputMode={opts.inputMode ?? "decimal"} onChange={(e) => onChange(e.target.value)} />
      {opts.hint ? <p className="text-xs text-muted-foreground">{opts.hint}</p> : null}
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section className="flex flex-col gap-3">
          {field("food-name", "Name", f.name, (v) => set({ name: v }), { inputMode: "text" })}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="food-category">Group</Label>
              <select id="food-category" value={f.category} onChange={(e) => set({ category: e.target.value as CoreFoodCategory })} className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30">
                {CORE_FOOD_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="food-aisle">Aisle</Label>
              <select id="food-aisle" value={f.aisle} onChange={(e) => set({ aisle: e.target.value as Aisle })} className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30">
                {AISLES.map((a) => (
                  <option key={a} value={a}>
                    {AISLE_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Measured by</legend>
            <div className="grid grid-cols-2 gap-1">
              {(["weight", "count"] as const).map((k) => (
                <label key={k} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm">
                  <input type="radio" name="unit-kind" className="size-4 accent-primary" checked={f.unitKind === k} onChange={() => set({ unitKind: k })} />
                  {k === "weight" ? "Weight (grams)" : "Count (each)"}
                </label>
              ))}
            </div>
          </fieldset>
          {f.unitKind === "count" ? field("food-gpc", "Grams each", f.gramsPerCount, (v) => set({ gramsPerCount: v }), { hint: "An egg is about 50 g, a banana 118 g." }) : null}
        </section>

        <section aria-labelledby="nutrition-heading" className="flex flex-col gap-3">
          <h2 id="nutrition-heading" className="font-semibold">
            Nutrition per 100 g, as bought
          </h2>
          <p className="text-xs text-muted-foreground">Raw meat and potatoes, eggs as sold.</p>
          <div className="grid grid-cols-3 gap-2">
            {field("food-kcal", "kcal", f.kcal, (v) => set({ kcal: v }))}
            {field("food-protein", "Protein g", f.protein, (v) => set({ protein: v }))}
            {field("food-carbs", "Carbs g", f.carbs, (v) => set({ carbs: v }))}
            {field("food-fat", "Fat g", f.fat, (v) => set({ fat: v }))}
            {field("food-fiber", "Fiber g", f.fiber, (v) => set({ fiber: v }))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field("food-yield", "Cooked yield", f.cookedYield, (v) => set({ cookedYield: v }), { hint: "Cooked ÷ raw weight: chicken 0.75, potatoes 0.85, else 1." })}
            {field("food-cup", "Grams per cup", f.displayCupG, (v) => set({ displayCupG: v }), { hint: "Optional. Shows cups on Today." })}
          </div>
        </section>

        <section aria-labelledby="buy-heading" className="flex flex-col gap-3">
          <h2 id="buy-heading" className="font-semibold">
            Package and price
          </h2>
          {field("food-package-label", "Package", f.packageLabel, (v) => set({ packageLabel: v }), { inputMode: "text", hint: "As it reads on the list: 3 lb family pack." })}
          <div className="grid grid-cols-2 gap-2">
            {field("food-package-size", f.unitKind === "count" ? "Count per package" : "Package size", f.packageSize, (v) => set({ packageSize: v }), {
              inputMode: "text",
              hint: "error" in pkg ? (f.packageSize ? pkg.error : f.unitKind === "count" ? "Like 18" : "Like 3 lb, 32 oz or 907 g") : f.unitKind === "count" ? `${pkg.amount} each` : `= ${Math.round(pkg.amount)} g (${formatWeight(pkg.amount)})`,
            })}
            {field("food-price", "Package price ($)", f.price, (v) => set({ price: v }))}
          </div>
          {priceChanged ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-primary" checked={f.estimate} onChange={(e) => set({ estimate: e.target.checked })} />
              This price is an estimate
            </label>
          ) : null}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">On the list</legend>
            <div className="grid grid-cols-2 gap-1">
              <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm">
                <input type="radio" name="buy-mode" className="size-4 accent-primary" checked={f.buyMode === "by_amount"} onChange={() => set({ buyMode: "by_amount" })} />
                Packages for the week
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm">
                <input type="radio" name="buy-mode" className="size-4 accent-primary" checked={f.buyMode === "restock"} onChange={() => set({ buyMode: "restock" })} />
                Restock (check you have)
              </label>
            </div>
          </fieldset>
          {f.buyMode === "restock" ? field("food-restock", "A package lasts (weeks)", f.restockWeeks, (v) => set({ restockWeeks: v })) : null}
          {field("food-walmart-name", "Walmart name", f.walmartName, (v) => set({ walmartName: v }), { inputMode: "text", hint: "Optional. The list uses it, so names match the store." })}
          {field("food-walmart-url", "Walmart link", f.walmartUrl, (v) => set({ walmartUrl: v }), { inputMode: "text", hint: `Optional. Starts with ${WALMART_PREFIX}` })}
          {food?.walmartUrl ? (
            <Button asChild variant="outline">
              <a href={food.walmartUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> Open in Walmart
              </a>
            </Button>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="food-notes">Notes</Label>
            <Textarea id="food-notes" rows={2} maxLength={500} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </section>

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : food ? "Save" : "Add food"}
        </Button>
      </form>

      {food ? (
        <section aria-labelledby="history-heading" className="flex flex-col gap-2">
          <h2 id="history-heading" className="font-semibold">
            Price history
          </h2>
          {isPriceStale(food.priceUpdatedAt) ? <p className="text-sm text-amber-700 dark:text-amber-400">Price may be stale.</p> : null}
          <ul className="flex flex-col divide-y rounded-xl border text-sm">
            {history.map((h, i) => (
              <li key={i} className="flex justify-between gap-2 px-3 py-2">
                <span>
                  {h.observedOn} · {SOURCE[h.source]}
                  {h.by ? ` · ${h.by}` : ""}
                </span>
                <span className="tabular-nums">
                  {formatMoney(h.priceCents)} / {food.unitKind === "count" ? `${h.packageAmount} ct` : formatWeight(h.packageAmount)}
                </span>
              </li>
            ))}
          </ul>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              startTransition(async () => {
                const result = await deleteCoreFoodAction(food.id);
                if (result.error) {
                  setDeleteError(result.error);
                  setConfirmDelete(false);
                } else {
                  router.push("/prep/menu?tab=foods");
                  router.refresh();
                }
              });
            }}
          >
            <Trash2 aria-hidden /> {confirmDelete ? "Tap again to delete" : "Delete food"}
          </Button>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive" data-testid="delete-error">
              {deleteError}
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
