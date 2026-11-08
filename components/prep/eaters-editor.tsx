"use client";

import { Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGuestAction, saveEaterAction } from "@/app/(app)/prep/actions";
import { EATER_COLOR } from "@/components/prep/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MEAL_SLOTS, type MealSlot, SLOT_LABELS } from "@/lib/plan/week";
import type { EaterRecord } from "@/lib/prep/load";
import { ANNA_TARGETS } from "@/lib/prep/seed-data";
import { cn } from "@/lib/utils";

type Draft = {
  id: string | null;
  kind: "member" | "guest";
  userId: string | null;
  name: string;
  isActive: boolean;
  slots: MealSlot[];
  kcal: string;
  protein: string;
};

const toDraft = (e: EaterRecord): Draft => ({
  id: e.id,
  kind: e.kind,
  userId: e.userId,
  name: e.name,
  isActive: e.isActive,
  slots: e.slots,
  kcal: e.kcalTarget?.toString() ?? "",
  protein: e.proteinTarget?.toString() ?? "",
});

/** Eaters (P-4): members with targets, guests by name; who eats which meals. */
export function EatersEditor({ eaters, missingMembers }: { eaters: EaterRecord[]; missingMembers: { userId: string; name: string }[] }) {
  const placeholder = eaters.some((e) => e.kind === "member" && e.color === "b" && e.kcalTarget === ANNA_TARGETS.kcal && e.proteinTarget === ANNA_TARGETS.protein);
  const [adding, setAdding] = useState<Draft | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {placeholder ? (
        <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm">
          <strong>Anna&apos;s targets are placeholders.</strong> Set them when you know her numbers.
        </p>
      ) : null}
      {eaters.map((e) => (
        <EaterCard key={e.id} initial={toDraft(e)} color={e.color} />
      ))}
      {missingMembers.map((m) => (
        <Button
          key={m.userId}
          variant="outline"
          onClick={() =>
            setAdding({ id: null, kind: "member", userId: m.userId, name: m.name, isActive: true, slots: [...MEAL_SLOTS], kcal: "2000", protein: "150" })
          }
        >
          <UserPlus aria-hidden /> Add {m.name} as an eater
        </Button>
      ))}
      <Button
        variant="outline"
        onClick={() => setAdding({ id: null, kind: "guest", userId: null, name: "", isActive: true, slots: ["dinner"], kcal: "", protein: "" })}
      >
        <Plus aria-hidden /> Add a guest
      </Button>
      {adding ? <EaterCard key={`new:${adding.userId ?? "guest"}`} initial={adding} color={adding.kind === "guest" ? "neutral" : "b"} onDone={() => setAdding(null)} /> : null}
    </div>
  );
}

function EaterCard({ initial, color, onDone }: { initial: Draft; color: "a" | "b" | "neutral"; onDone?: () => void }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const isNew = d.id === null;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveEaterAction({
        id: d.id,
        kind: d.kind,
        userId: d.userId,
        name: d.name,
        isActive: d.isActive,
        slots: d.slots,
        kcalTarget: d.kind === "member" ? Number(d.kcal) || null : null,
        proteinTargetG: d.kind === "member" ? Number(d.protein) || null : null,
      });
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        onDone?.();
        router.refresh();
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      aria-label={d.name || "New guest"}
      data-testid="eater-card"
    >
      <div className="flex items-center gap-2">
        {d.kind === "guest" ? (
          <Input aria-label="Guest name" value={d.name} maxLength={40} placeholder="Name" onChange={(e) => setD({ ...d, name: e.target.value })} />
        ) : (
          <h3 className={cn("text-lg font-semibold", EATER_COLOR[color])}>{d.name}</h3>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{d.kind === "member" ? "Member" : "Guest"}</span>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-primary" checked={d.isActive} onChange={(e) => setD({ ...d, isActive: e.target.checked })} />
        {d.kind === "guest" ? "Joins when guests are on for a week" : "Eating from Prep"}
      </label>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">Eats</legend>
        <div className="grid grid-cols-4 gap-1">
          {MEAL_SLOTS.map((s) => {
            const on = d.slots.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setD({ ...d, slots: on ? d.slots.filter((x) => x !== s) : [...d.slots, s] })}
                className={cn("min-h-11 rounded-lg border text-sm font-medium", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
              >
                {SLOT_LABELS[s]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {d.kind === "member" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`kcal-${d.id ?? "new"}`}>Calories a day</Label>
            <Input id={`kcal-${d.id ?? "new"}`} inputMode="numeric" value={d.kcal} onChange={(e) => setD({ ...d, kcal: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`protein-${d.id ?? "new"}`}>Protein (g) a day</Label>
            <Input id={`protein-${d.id ?? "new"}`} inputMode="numeric" value={d.protein} onChange={(e) => setD({ ...d, protein: e.target.value })} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Guests count toward cost and portions only, not toward targets.</p>
      )}
      {isNew ? <p className="text-xs text-muted-foreground">Portions are copied from the closest member and marked &ldquo;check portions&rdquo;.</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {d.kind === "guest" && d.id ? (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              startTransition(async () => {
                await deleteGuestAction(d.id!);
                router.refresh();
              });
            }}
          >
            <Trash2 aria-hidden /> {confirmDelete ? "Tap again to remove" : "Remove"}
          </Button>
        ) : null}
        <Button type="submit" className="ml-auto" disabled={pending}>
          {pending ? "Saving…" : saved ? "Saved" : isNew ? "Add" : "Save"}
        </Button>
      </div>
    </form>
  );
}
