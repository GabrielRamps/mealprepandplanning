"use client";

import { Check, ChevronLeft, ChevronRight, Copy, Minus, Plus, Send, ShoppingCart, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import {
  addPlanEntryAction,
  approvePlanAction,
  copyPreviousWeekAction,
  createListFromPlanAction,
  type PlanResult,
  removePlanEntryAction,
  requestPlanChangesAction,
  sendPlanAction,
  updatePlanEntryAction,
} from "@/app/(app)/plan/actions";
import { PageHeader } from "@/components/page-header";
import { PLANS_CHANGED } from "@/components/tab-bar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/quantity";
import type { PlanEntry, WeekPlan } from "@/lib/plan/plans";
import { canEdit, canReview, canSend } from "@/lib/plan/rules";
import { addDays, dayLabel, localToday, MEAL_SLOTS, type MealSlot, SLOT_LABELS, weekDays, weekLabel, weekStartOf } from "@/lib/plan/week";
import { cn } from "@/lib/utils";

type Recipe = { id: string; title: string; servings: number; coverUrl: string | null };

const noSubscribe = () => () => {};

type Props = {
  plan: WeekPlan;
  recipes: Recipe[];
  userId: string;
  memberNames: Record<string, string>;
  partnerLabel: string;
  previousWeekHasMeals: boolean;
  listId: string | null;
};

export function WeekPlanView({ plan, recipes, userId, memberNames, partnerLabel, previousWeekHasMeals, listId }: Props) {
  const [adding, setAdding] = useState<string | null>(null); // day
  const [editing, setEditing] = useState<PlanEntry | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editable = canEdit(plan, userId);
  // The phone's date, read after hydration (the server runs in UTC).
  const today = useSyncExternalStore(noSubscribe, localToday, () => null);
  const thisWeek = today ? weekStartOf(today) : null;
  const name = (id: string | null) => (id && memberNames[id]) || "your partner";

  function run(action: () => Promise<PlanResult | void>, after?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result && result.error) setMessage(result.error);
      else {
        window.dispatchEvent(new Event(PLANS_CHANGED));
        after?.();
      }
    });
  }

  const byDay = useMemo(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const e of plan.entries) map.set(e.day, [...(map.get(e.day) ?? []), e]);
    return map;
  }, [plan.entries]);

  return (
    <>
      <PageHeader title="Plan" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <nav aria-label="Weeks" className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Previous week">
            <Link href={`/plan/${addDays(plan.weekStart, -7)}`}>
              <ChevronLeft className="size-6" />
            </Link>
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold" data-testid="week-label">
              {weekLabel(plan.weekStart)}
            </span>
            {!thisWeek ? null : plan.weekStart === thisWeek ? (
              <span className="text-xs text-muted-foreground">This week</span>
            ) : (
              <Link href={`/plan/${thisWeek}`} className="text-xs text-primary underline">
                Go to this week
              </Link>
            )}
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Next week">
            <Link href={`/plan/${addDays(plan.weekStart, 7)}`}>
              <ChevronRight className="size-6" />
            </Link>
          </Button>
        </nav>

        <StatusBanner
          plan={plan}
          userId={userId}
          sender={name(plan.sentBy)}
          reviewer={name(plan.reviewedBy)}
          partnerLabel={partnerLabel}
          listId={listId}
          pending={pending}
          onApprove={() => run(() => approvePlanAction(plan.id!))}
          onRequestChanges={() => setReviewing(true)}
          onMakeList={() => run(() => createListFromPlanAction(plan.id!))}
        />

        {message ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {message}
          </p>
        ) : null}

        {plan.entries.length === 0 && previousWeekHasMeals && editable ? (
          <Button variant="outline" disabled={pending} onClick={() => run(() => copyPreviousWeekAction(plan.weekStart))}>
            <Copy aria-hidden /> Copy last week&apos;s meals
          </Button>
        ) : null}

        <ol className="flex flex-col gap-3">
          {weekDays(plan.weekStart).map((day) => {
            const entries = byDay.get(day) ?? [];
            return (
              <li key={day} className="rounded-xl border p-3" aria-label={dayLabel(day)} data-day={day}>
                <div className="flex items-center justify-between">
                  <h2 className={cn("font-semibold", day === today && "text-primary")}>
                    {dayLabel(day)}
                    {day === today ? <span className="ml-2 text-xs font-normal">Today</span> : null}
                  </h2>
                  {editable ? (
                    <Button variant="ghost" size="sm" onClick={() => setAdding(day)} aria-label={`Add a meal on ${dayLabel(day)}`}>
                      <Plus aria-hidden /> Add
                    </Button>
                  ) : null}
                </div>
                {entries.length === 0 ? <p className="text-sm text-muted-foreground">Nothing planned.</p> : null}
                {MEAL_SLOTS.filter((slot) => entries.some((e) => e.slot === slot)).map((slot) => (
                  <div key={slot} className="mt-2">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{SLOT_LABELS[slot]}</h3>
                    <ul className="flex flex-col">
                      {entries
                        .filter((e) => e.slot === slot)
                        .map((e) => (
                          <li key={e.id}>
                            <button
                              type="button"
                              disabled={!editable}
                              onClick={() => setEditing(e)}
                              className="flex min-h-12 w-full items-center gap-3 py-1 text-left disabled:cursor-default"
                              data-testid="plan-entry"
                            >
                              <Thumb url={e.coverUrl} />
                              <span className="flex flex-col">
                                <span className={cn("font-medium", !e.recipeAvailable && "text-muted-foreground line-through")}>
                                  {e.recipeTitle}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {formatNumber(e.servings)} {e.servings === 1 ? "serving" : "servings"}
                                  {e.note ? ` · ${e.note}` : ""}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </li>
            );
          })}
        </ol>

        {plan.status === "draft" && editable ? (
          <Button size="lg" disabled={pending || !canSend(plan, plan.entries.length)} onClick={() => run(() => sendPlanAction(plan.id!))}>
            <Send aria-hidden /> Send to {partnerLabel} for approval
          </Button>
        ) : null}
      </main>

      <AddMealDialog
        // Fresh state for every opening, including after a meal is added.
        key={adding ?? "closed"}
        day={adding}
        recipes={recipes}
        pending={pending}
        onClose={() => setAdding(null)}
        onAdd={(slot, recipe, servings, note) =>
          run(
            () => addPlanEntryAction({ weekStart: plan.weekStart, day: adding!, slot, recipeId: recipe.id, servings, note }),
            () => setAdding(null),
          )
        }
      />
      <EditMealDialog
        entry={editing}
        pending={pending}
        onClose={() => setEditing(null)}
        onSave={(servings, note) => run(() => updatePlanEntryAction(plan.id!, editing!.id, { servings, note }), () => setEditing(null))}
        onRemove={() => run(() => removePlanEntryAction(plan.id!, editing!.id), () => setEditing(null))}
      />
      <RequestChangesDialog
        open={reviewing}
        pending={pending}
        onClose={() => setReviewing(false)}
        onSend={(note) => run(() => requestPlanChangesAction(plan.id!, note), () => setReviewing(false))}
      />
    </>
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

function StatusBanner({
  plan,
  userId,
  sender,
  reviewer,
  partnerLabel,
  listId,
  pending,
  onApprove,
  onRequestChanges,
  onMakeList,
}: {
  plan: WeekPlan;
  userId: string;
  sender: string;
  reviewer: string;
  partnerLabel: string;
  listId: string | null;
  pending: boolean;
  onApprove: () => void;
  onRequestChanges: () => void;
  onMakeList: () => void;
}) {
  if (plan.status === "pending_approval") {
    if (!canReview(plan, userId)) {
      return (
        <div role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm" data-testid="plan-status">
          <strong>Waiting for {partnerLabel} to approve.</strong> They can also change meals or ask you for changes.
        </div>
      );
    }
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-amber-500/10 p-3 text-sm" data-testid="plan-status">
        <p>
          <strong>{sender} sent this week for your approval.</strong> You can change meals first.
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={pending} onClick={onApprove}>
            <Check aria-hidden /> Approve
          </Button>
          <Button className="flex-1" variant="outline" disabled={pending} onClick={onRequestChanges}>
            Request changes
          </Button>
        </div>
      </div>
    );
  }
  if (plan.status === "approved") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-primary/10 p-3 text-sm" data-testid="plan-status">
        <p>
          <strong>Approved</strong> by {reviewer}. Changing a meal sends it back to draft.
        </p>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={pending} onClick={onMakeList}>
            <ShoppingCart aria-hidden /> {listId ? "Make a new list" : "Make grocery list"}
          </Button>
          {listId ? (
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/lists/${listId}`}>Open list</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  if (plan.changeNote) {
    return (
      <div role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm" data-testid="plan-status">
        <strong>{reviewer} asked for changes:</strong> {plan.changeNote}
      </div>
    );
  }
  return plan.entries.length ? (
    <p className="text-sm text-muted-foreground" data-testid="plan-status">
      Draft. Send it when the week looks right.
    </p>
  ) : null;
}

function ServingsStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <Button type="button" variant="outline" size="icon" aria-label="Fewer servings" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>
        <Minus aria-hidden />
      </Button>
      <output className="w-20 text-center">
        <span className="font-semibold">{formatNumber(value)}</span> {value === 1 ? "serving" : "servings"}
      </output>
      <Button type="button" variant="outline" size="icon" aria-label="More servings" onClick={() => onChange(Math.min(200, value + 1))}>
        <Plus aria-hidden />
      </Button>
    </div>
  );
}

function AddMealDialog({
  day,
  recipes,
  pending,
  onClose,
  onAdd,
}: {
  day: string | null;
  recipes: Recipe[];
  pending: boolean;
  onClose: () => void;
  onAdd: (slot: MealSlot, recipe: Recipe, servings: number, note: string) => void;
}) {
  const [slot, setSlot] = useState<MealSlot>("dinner");
  const [query, setQuery] = useState("");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [servings, setServings] = useState(4);
  const [note, setNote] = useState("");

  const shown = recipes.filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 50);

  function reset() {
    setQuery("");
    setRecipe(null);
    setNote("");
  }

  return (
    <Dialog
      open={day !== null}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a meal</DialogTitle>
          <DialogDescription>{day ? dayLabel(day) : ""}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Meal">
          {MEAL_SLOTS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={slot === s}
              onClick={() => setSlot(s)}
              className={cn(
                "min-h-11 rounded-lg border text-sm font-medium",
                slot === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {SLOT_LABELS[s]}
            </button>
          ))}
        </div>

        {recipe ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Thumb url={recipe.coverUrl} />
              <span className="flex-1 font-medium">{recipe.title}</span>
              <Button variant="ghost" size="sm" onClick={() => setRecipe(null)}>
                Change
              </Button>
            </div>
            <ServingsStepper value={servings} onChange={setServings} label="Servings" />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meal-note">
                Note <span className="font-normal text-muted-foreground">Optional</span>
              </Label>
              <Input id="meal-note" value={note} maxLength={200} placeholder="Double batch for lunches" onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter>
              <Button disabled={pending} onClick={() => onAdd(slot, recipe, servings, note)}>
                {pending ? "Adding…" : `Add to ${SLOT_LABELS[slot].toLowerCase()}`}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input type="search" aria-label="Search recipes" placeholder="Search recipes" value={query} onChange={(e) => setQuery(e.target.value)} />
            {recipes.length === 0 ? <p className="text-sm text-muted-foreground">Add recipes to your library first.</p> : null}
            <ul className="flex flex-col divide-y" aria-label="Recipes">
              {shown.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRecipe(r);
                      setServings(r.servings);
                    }}
                    className="flex min-h-12 w-full items-center gap-3 py-1 text-left"
                  >
                    <Thumb url={r.coverUrl} />
                    <span className="font-medium">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditMealDialog({
  entry,
  pending,
  onClose,
  onSave,
  onRemove,
}: {
  entry: PlanEntry | null;
  pending: boolean;
  onClose: () => void;
  onSave: (servings: number, note: string) => void;
  onRemove: () => void;
}) {
  // Re-seeded from the entry each time the dialog opens (keyed below).
  return (
    <Dialog open={entry !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {entry ? <EditMealForm key={entry.id} entry={entry} pending={pending} onSave={onSave} onRemove={onRemove} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditMealForm({
  entry,
  pending,
  onSave,
  onRemove,
}: {
  entry: PlanEntry;
  pending: boolean;
  onSave: (servings: number, note: string) => void;
  onRemove: () => void;
}) {
  const [servings, setServings] = useState(entry.servings);
  const [note, setNote] = useState(entry.note ?? "");
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{entry.recipeTitle}</DialogTitle>
        <DialogDescription>
          {dayLabel(entry.day)} · {SLOT_LABELS[entry.slot]}
          {!entry.recipeAvailable ? " · no longer in the library" : ""}
        </DialogDescription>
      </DialogHeader>
      <ServingsStepper value={servings} onChange={setServings} label="Servings" />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-note">Note</Label>
        <Input id="edit-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </div>
      {entry.recipeAvailable ? (
        <Link href={`/recipes/${entry.recipeId}`} className="text-sm text-primary underline">
          Open recipe
        </Link>
      ) : null}
      <DialogFooter className="gap-2">
        <Button variant="destructive" disabled={pending} onClick={() => (confirming ? onRemove() : setConfirming(true))}>
          {confirming ? "Tap again to remove" : "Remove"}
        </Button>
        <Button disabled={pending} onClick={() => onSave(servings, note)}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

function RequestChangesDialog({
  open,
  pending,
  onClose,
  onSend,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onSend: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
          <DialogDescription>The week goes back to draft with your note.</DialogDescription>
        </DialogHeader>
        <Label htmlFor="change-note">What should change?</Label>
        <Textarea id="change-note" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Swap Thursday for something lighter" />
        <DialogFooter>
          <Button disabled={pending || !note.trim()} onClick={() => onSend(note)}>
            Send note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
