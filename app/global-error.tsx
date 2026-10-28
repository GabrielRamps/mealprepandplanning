"use client";

import "./globals.css";

// Replaces the root layout when it crashes, so a failure there shows a way
// back instead of a blank page. The message helps when reporting it.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : null;
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <title>Something went wrong</title>
        <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">Reload the app. If it keeps happening, send a screenshot of this screen.</p>
          <p className="font-mono text-xs break-all text-muted-foreground">
            {message}
            {digest ? ` (${digest})` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button type="button" className="min-h-11 rounded-lg border px-4 font-medium" onClick={() => retry()}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
