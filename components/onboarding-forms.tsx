"use client";

import { useActionState } from "react";
import type { OnboardingState } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Action = (prev: OnboardingState, formData: FormData) => Promise<OnboardingState>;

export function CreateHouseholdForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  const error = state?.fieldErrors?.name;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create household</CardTitle>
        <CardDescription>Start fresh, then share the invite code with your partner.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="household-name">Household name</Label>
            <Input
              id="household-name"
              name="name"
              placeholder="Our kitchen"
              maxLength={80}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "household-name-error" : undefined}
            />
            {error && (
              <p id="household-name-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create household"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function JoinHouseholdForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  const error = state?.fieldErrors?.code;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Join with code</CardTitle>
        <CardDescription>Enter the 6-character code from your partner&apos;s Settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-code">Invite code</Label>
            <Input
              id="invite-code"
              name="code"
              placeholder="K7MP2Q"
              maxLength={8}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono text-lg tracking-[0.3em] uppercase"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "invite-code-error" : undefined}
            />
            {error && (
              <p id="invite-code-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Joining…" : "Join household"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
