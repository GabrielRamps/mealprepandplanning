"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        Check your connection and try again. If it keeps happening, sign out and back in.
      </p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">Error {error.digest}</p> : null}
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
