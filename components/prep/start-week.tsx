"use client";

import { Copy, FilePlus2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startWeekAction } from "@/app/(app)/prep/actions";
import { Button } from "@/components/ui/button";
import type { StartOptions } from "@/lib/prep/pages";
import { cn } from "@/lib/utils";

/** "Start from" (P-5): the rotation's suggestion first, then the other templates, last week, or blank. */
export function StartWeek({ weekStart, options }: { weekStart: string; options: StartOptions }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<string | null>(null);

  function start(from: { templateId: string } | "last" | "blank", key: string) {
    setError(null);
    setChoice(key);
    startTransition(async () => {
      const result = await startWeekAction(weekStart, from);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <section aria-labelledby="start-heading" className="flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <h2 id="start-heading" className="text-lg font-semibold">
          Start from
        </h2>
        <p className="text-sm text-muted-foreground">No Prep week yet. Pick where this week starts; you can change anything after.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {options.templates.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => start({ templateId: t.id }, t.id)}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left hover:bg-muted disabled:opacity-60",
                t.suggested && "border-primary bg-primary/5",
              )}
              data-testid="start-template"
            >
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{t.name}</span>
                {!t.inRotation ? <span className="text-xs text-muted-foreground">Not in the rotation</span> : null}
              </span>
              {t.suggested ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                  <Sparkles className="size-3" aria-hidden /> Suggested
                </span>
              ) : null}
              {pending && choice === t.id ? <span className="text-sm text-muted-foreground">Starting…</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={pending || !options.canCopyLast} onClick={() => start("last", "last")}>
          <Copy aria-hidden /> Copy last week
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => start("blank", "blank")}>
          <FilePlus2 aria-hidden /> Blank
        </Button>
      </div>
      {!options.canCopyLast ? <p className="text-xs text-muted-foreground">Last week has no Prep week to copy.</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
