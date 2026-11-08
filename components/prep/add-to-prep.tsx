"use client";

import { ChefHat } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";
import { addRecipeToPrepWeekAction } from "@/app/(app)/prep/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { addDays, dayLabel, localToday, MEAL_SLOTS, type MealSlot, SLOT_LABELS, weekDays, weekLabel, weekStartOf } from "@/lib/plan/week";

const noSubscribe = () => () => {};

/** P-12: put a library recipe into a Prep week, with servings for everyone eating that meal. */
export function AddToPrepWeek({ recipeId }: { recipeId: string }) {
  const today = useSyncExternalStore(noSubscribe, localToday, () => null);
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<MealSlot>("dinner");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<{ weekStart: string; day: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const thisWeek = today ? weekStartOf(today) : null;
  const weekStart = week ?? thisWeek;
  const days = weekStart ? weekDays(weekStart) : [];
  const chosenDay = day && days.includes(day) ? day : (days.find((d) => d === today) ?? days[0] ?? null);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!today}>
        <ChefHat aria-hidden /> Add to Prep week
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setAdded(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{added ? "Added to Prep" : "Add to Prep week"}</DialogTitle>
            <DialogDescription>
              {added
                ? `It's on ${dayLabel(added.day)}. Its ingredients go on the week's list; nutrition isn't counted for library recipes yet.`
                : "Servings start at the number of people eating that meal."}
            </DialogDescription>
          </DialogHeader>
          {added ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Done
              </Button>
              <Button asChild>
                <Link href={`/prep/week/${added.weekStart}`}>Open the week</Link>
              </Button>
            </DialogFooter>
          ) : weekStart && chosenDay ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prep-week">Week</Label>
                <select
                  id="prep-week"
                  value={weekStart}
                  onChange={(e) => setWeek(e.target.value)}
                  className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
                >
                  {[0, 7, 14, 21].map((n) => {
                    const ws = addDays(thisWeek!, n);
                    return (
                      <option key={ws} value={ws}>
                        {n === 0 ? "This week" : n === 7 ? "Next week" : weekLabel(ws)} ({weekLabel(ws)})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="prep-day">Day</Label>
                <select
                  id="prep-day"
                  value={chosenDay}
                  onChange={(e) => setDay(e.target.value)}
                  className="h-11 rounded-lg border border-input bg-transparent px-3 text-base dark:bg-input/30"
                >
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {dayLabel(d)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Meal">
                {MEAL_SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={slot === s}
                    onClick={() => setSlot(s)}
                    className={
                      slot === s
                        ? "min-h-11 rounded-lg border border-primary bg-primary text-sm font-medium text-primary-foreground"
                        : "min-h-11 rounded-lg border text-sm font-medium hover:bg-muted"
                    }
                  >
                    {SLOT_LABELS[s]}
                  </button>
                ))}
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <DialogFooter>
                <Button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      const result = await addRecipeToPrepWeekAction({ recipeId, day: chosenDay, slot });
                      if (result.error) setError(result.error);
                      else setAdded({ weekStart: result.weekStart!, day: chosenDay });
                    })
                  }
                >
                  {pending ? "Adding…" : `Add to ${SLOT_LABELS[slot].toLowerCase()}`}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
