"use client";

import { Check, ChevronLeft, ChevronRight, Snowflake, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { checkTaskAction } from "@/app/(app)/prep/actions";
import { EaterLine } from "@/components/prep/bits";
import { LiveRefresh } from "@/components/prep/live-refresh";
import { Button } from "@/components/ui/button";
import { addDays, dayLabel, localToday, SLOT_LABELS } from "@/lib/plan/week";
import type { TodayData, TodayMeal } from "@/lib/prep/pages";
import type { TaskView } from "@/lib/prep/view";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

const KIND_LABEL: Record<TaskView["kind"], string> = {
  freeze: "After shopping",
  prep: "Prep",
  pack: "Tonight",
  thaw: "Tonight",
};

export function TodayView({ data }: { data: TodayData }) {
  const today = useSyncExternalStore(noSubscribe, localToday, () => null);
  const [saving, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tasks, setOptimistic] = useOptimistic(data.tasks, (list, change: { key: string; weekId: string; checked: boolean }) =>
    list.map((t) => (t.key === change.key && t.weekId === change.weekId ? { ...t, checkedBy: change.checked ? "You" : null } : t)),
  );

  function toggle(task: TaskView) {
    const checked = !task.checkedBy;
    setError(null);
    startTransition(async () => {
      setOptimistic({ key: task.key, weekId: task.weekId, checked });
      const result = await checkTaskAction(task.weekId, task.key, checked);
      if (result.error) setError("Didn't save — try again.");
    });
  }

  const weeks = [data.weekStart, data.nextWeekStart ?? data.weekStart].sort();
  return (
    <>
      <LiveRefresh
        saving={saving}
        signals={[
          { body: { kind: "week", weekStart: data.weekStart } },
          ...(data.nextWeekStart ? [{ body: { kind: "week", weekStart: data.nextWeekStart } }] : []),
          { body: { kind: "checks", from: weeks[0], to: weeks[1] } },
        ]}
      />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <nav aria-label="Days" className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Previous day">
            <Link href={`/prep/today/${addDays(data.date, -1)}`}>
              <ChevronLeft className="size-6" />
            </Link>
          </Button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-semibold" data-testid="today-label">
              {dayLabel(data.date)}
            </span>
            {!today ? null : data.date === today ? (
              <span className="text-xs text-muted-foreground">Today</span>
            ) : (
              <Link href={`/prep/today/${today}`} className="text-xs text-primary underline">
                Go to today
              </Link>
            )}
          </div>
          <Button asChild variant="ghost" size="icon" aria-label="Next day">
            <Link href={`/prep/today/${addDays(data.date, 1)}`}>
              <ChevronRight className="size-6" />
            </Link>
          </Button>
        </nav>

        {data.meals.length === 0 && tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
            <p className="text-muted-foreground">{data.weekId ? "Nothing planned today." : "No Prep week for this week."}</p>
            <Button asChild>
              <Link href={`/prep/week/${data.weekStart}`}>{data.weekId ? "Open the week" : "Plan this week"}</Link>
            </Button>
          </div>
        ) : null}

        {data.meals.length ? (
          <section aria-label="Meals" className="flex flex-col gap-3">
            {data.meals.map((m) => (
              <MealCard key={m.id} meal={m} />
            ))}
          </section>
        ) : null}

        {tasks.length ? (
          <section aria-labelledby="tasks-heading" className="flex flex-col gap-2">
            <h2 id="tasks-heading" className="text-lg font-semibold">
              Tasks
            </h2>
            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <ul className="flex flex-col divide-y rounded-xl border">
              {tasks.map((t) => (
                <li key={`${t.weekId}:${t.key}`} data-testid="prep-task">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={Boolean(t.checkedBy)}
                    onClick={() => toggle(t)}
                    className="flex min-h-14 w-full items-start gap-3 px-3 py-3 text-left"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border-2",
                        t.checkedBy ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                    >
                      {t.checkedBy ? <Check className="size-5" aria-hidden /> : null}
                    </span>
                    <span className={cn("flex flex-col gap-0.5", t.checkedBy && "text-muted-foreground")}>
                      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {t.kind === "freeze" ? <Snowflake className="mr-1 inline size-3" aria-hidden /> : null}
                        {KIND_LABEL[t.kind]}
                      </span>
                      <span className={cn("font-medium", t.checkedBy && "line-through")}>{t.title}</span>
                      {t.detail.map((d, i) => (
                        <span key={i} className="text-sm text-muted-foreground">
                          {d}
                        </span>
                      ))}
                      {t.checkedBy ? <span className="text-xs">Done: {t.checkedBy}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

function MealCard({ meal }: { meal: TodayMeal }) {
  const plates = meal.breakdown.plates.filter((p) => p.lines.length > 0);
  return (
    <article className="flex flex-col gap-2 rounded-xl border p-3" data-testid="today-meal">
      <header className="flex items-start gap-3">
        {meal.kind === "recipe" ? (
          <span className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
            {meal.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- photos come straight from the public bucket
              <img src={meal.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <UtensilsCrossed className="m-3.5 size-5 text-muted-foreground" aria-hidden />
            )}
          </span>
        ) : null}
        <div className="flex flex-1 flex-col">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{SLOT_LABELS[meal.slot]}</span>
          {meal.kind === "recipe" && meal.recipeId ? (
            <Link href={`/recipes/${meal.recipeId}`} className="font-semibold text-primary underline-offset-2 hover:underline">
              {meal.title}
            </Link>
          ) : (
            <h3 className="font-semibold">{meal.title}</h3>
          )}
          {meal.kind === "meal" && meal.flavor ? <span className="text-sm text-muted-foreground">Flavor: {meal.flavor}</span> : null}
          {meal.kind === "recipe" ? (
            <span className="text-sm text-muted-foreground">
              {meal.servings} servings · nutrition not counted
            </span>
          ) : null}
        </div>
      </header>
      {meal.note ? <p className="rounded-lg bg-primary/10 px-2 py-1 text-sm font-medium">{meal.note}</p> : null}
      {plates.map((p) => (
        <EaterLine key={p.eaterId} plate={p} />
      ))}
      {meal.kind === "flex" ? <p className="text-sm text-muted-foreground">Not counted in totals.</p> : null}
    </article>
  );
}
