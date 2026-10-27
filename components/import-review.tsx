"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { approveImportAction, discardImportAction } from "@/app/(app)/import/actions";
import { RetryButton } from "@/components/import-forms";
import { PageHeader } from "@/components/page-header";
import { type CoverChoice, type EditorInitial, RecipeEditor } from "@/components/recipe-editor";
import { Button } from "@/components/ui/button";
import { IN_PROGRESS, type JobStatus, STATUS_LABELS } from "@/lib/import/labels";
import { cn } from "@/lib/utils";

const POLL_MS = 2000;
const STEPS: JobStatus[] = ["fetching", "reading", "ready"];

type Conflict = { field: string; caption_value: string | null; video_value: string | null; chosen: string };

type Props = {
  jobId: string;
  status: JobStatus;
  error: string | null;
  canRetry: boolean;
  recipeId: string | null;
  noRecipeFound: boolean;
  initial: EditorInitial | null;
  conflicts: Conflict[];
  coverChoices: CoverChoice[];
  tagSuggestions: string[];
  duplicate: { id: string; title: string } | null;
};

/** C3: live status while processing, then the shared editor to approve or discard. */
export function ImportReview(props: Props) {
  const router = useRouter();
  const { jobId, status } = props;

  // Poll every 2 s until the job leaves processing (PRD 7.1), then reload the page's data.
  useEffect(() => {
    if (!IN_PROGRESS.includes(status)) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/import/${jobId}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data: { status: JobStatus } = await res.json();
      if (data.status !== status) router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [jobId, status, router]);

  if (status === "ready" && props.initial && !props.noRecipeFound) {
    return (
      <RecipeEditor
        recipeId={jobId}
        initial={props.initial}
        tagSuggestions={props.tagSuggestions}
        cancelHref="/import"
        save={approveImportAction}
        title="Review import"
        saveLabel="Approve"
        coverChoices={props.coverChoices}
        notice={<ReviewNotices conflicts={props.conflicts} duplicate={props.duplicate} />}
        footer={<DiscardButton jobId={jobId} />}
      />
    );
  }

  return (
    <>
      <PageHeader title="Import" back={{ href: "/import", label: "Import" }} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 p-4" data-testid="import-status" data-status={status}>
        {IN_PROGRESS.includes(status) ? (
          <>
            <ol className="flex flex-col gap-3" aria-label="Progress">
              {STEPS.map((step) => {
                const reached = STEPS.indexOf(step) <= STEPS.indexOf(status === "queued" ? "fetching" : status);
                const current = step === status || (status === "queued" && step === "fetching");
                return (
                  <li key={step} className={cn("flex items-center gap-3", !reached && "text-muted-foreground")}>
                    {current ? <Loader2 className="size-5 animate-spin text-primary" aria-hidden /> : reached ? <Check className="size-5 text-primary" aria-hidden /> : <span className="size-5" />}
                    {STATUS_LABELS[step]}
                  </li>
                );
              })}
            </ol>
            <p className="text-sm text-muted-foreground">You can leave this screen; the import keeps going and shows up under Recent imports.</p>
          </>
        ) : null}

        {status === "failed" ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="rounded-xl bg-destructive/10 p-3">
              {props.error ?? "Couldn't import this."}
            </p>
            <div className="flex gap-2">
              <RetryButton jobId={jobId} disabled={!props.canRetry} />
              <DiscardButton jobId={jobId} />
            </div>
            {!props.canRetry ? <p className="text-sm text-muted-foreground">This failed 3 times. Try a screenshot instead.</p> : null}
          </div>
        ) : null}

        {status === "ready" && props.noRecipeFound ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl bg-amber-500/10 p-3">
              <strong>No recipe found.</strong> The post may keep the recipe somewhere else (like &ldquo;comment RECIPE&rdquo;). Add screenshots of it, or type it in.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline">
                <Link href="/import#photos">Add photos</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/recipes/new">Type it in</Link>
              </Button>
            </div>
            <DiscardButton jobId={jobId} />
          </div>
        ) : null}

        {status === "approved" ? (
          <p>
            Saved to your library.{" "}
            {props.recipeId ? (
              <Link href={`/recipes/${props.recipeId}`} className="text-primary underline">
                Open recipe
              </Link>
            ) : null}
          </p>
        ) : null}
        {status === "discarded" ? <p className="text-muted-foreground">This import was discarded.</p> : null}
      </main>
    </>
  );
}

function ReviewNotices({ conflicts, duplicate }: { conflicts: Conflict[]; duplicate: { id: string; title: string } | null }) {
  if (!conflicts.length && !duplicate) return null;
  return (
    <div className="flex flex-col gap-3">
      {duplicate ? (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm">
          <strong>Already in your library:</strong>{" "}
          <Link href={`/recipes/${duplicate.id}`} className="underline">
            {duplicate.title}
          </Link>
          . You can still approve this one.
        </p>
      ) : null}
      {conflicts.length ? (
        <section aria-label="Caption and video disagree" className="flex flex-col gap-2 rounded-xl bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">The caption and video disagree. Check these before approving:</p>
          <ul className="flex flex-col gap-2">
            {conflicts.map((c, i) => (
              <li key={i} className="flex flex-col gap-1">
                <span className="font-medium">{c.field}</span>
                <span className="flex flex-wrap gap-2">
                  <Choice label="Caption" value={c.caption_value} chosen={c.chosen === "caption"} />
                  <Choice label="Video" value={c.video_value} chosen={c.chosen === "video"} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Choice({ label, value, chosen }: { label: string; value: string | null; chosen: boolean }) {
  return (
    <span className={cn("rounded-md border px-2 py-1", chosen ? "border-primary bg-background" : "border-transparent opacity-80")}>
      {label}: <strong>{value ?? "not stated"}</strong>
      {chosen ? " · used in the draft" : ""}
    </span>
  );
}

function DiscardButton({ jobId }: { jobId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="destructive"
      disabled={pending}
      onClick={() => (confirming ? startTransition(() => discardImportAction(jobId)) : setConfirming(true))}
    >
      <Trash2 aria-hidden /> {confirming ? "Tap again to discard" : "Discard"}
    </Button>
  );
}
