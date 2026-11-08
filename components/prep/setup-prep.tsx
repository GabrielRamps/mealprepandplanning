"use client";

import { ChefHat } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setupPrepAction } from "@/app/(app)/prep/actions";
import { Button } from "@/components/ui/button";

/** P-1: shown on every Prep screen until the household has set it up. */
export function SetupPrep() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <ChefHat className="size-7" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">Set up Prep</h2>
      <p className="text-muted-foreground">
        Loads our core foods with nutrition and estimated Walmart prices, the meals with each person&apos;s portions, calorie and
        protein targets, and the 4-week rotation. Everything can be changed afterwards.
      </p>
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setupPrepAction();
            if (result.error) setError(result.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Loading…" : "Load our plan"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
