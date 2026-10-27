import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ImportForms, RetryButton } from "@/components/import-forms";
import { PageHeader } from "@/components/page-header";
import { requireHousehold } from "@/lib/household";
import { listJobs, MAX_ATTEMPTS } from "@/lib/import/jobs";
import { jobSourceLabel, STATUS_LABELS } from "@/lib/import/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  const { membership } = await requireHousehold();
  const jobs = await listJobs(membership.householdId);

  return (
    <>
      <PageHeader title="Import" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
        <ImportForms />

        <section aria-labelledby="recent-imports" className="flex flex-col gap-2">
          <h2 id="recent-imports" className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Recent imports
          </h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing imported yet. Imports from the iPhone Shortcut show up here too.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border" data-testid="import-history">
              {jobs.map((job) => {
                const title = job.draft && !job.draft.no_recipe_found ? job.draft.title : jobSourceLabel(job);
                return (
                  <li key={job.id} className="flex items-center gap-3 px-3 py-2">
                    <Link href={job.recipeId ? `/recipes/${job.recipeId}` : `/import/${job.id}`} className="flex min-h-12 flex-1 flex-col justify-center">
                      <span className="line-clamp-1 font-medium">{title}</span>
                      <span
                        className={cn(
                          "text-sm",
                          job.status === "failed" ? "text-destructive" : job.status === "ready" ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {STATUS_LABELS[job.status]}
                        {job.draft && !job.draft.no_recipe_found && title !== jobSourceLabel(job) ? ` · ${jobSourceLabel(job)}` : ""}
                        {job.status === "failed" && job.error ? ` · ${job.error}` : ""}
                      </span>
                    </Link>
                    {job.status === "failed" ? (
                      <RetryButton jobId={job.id} disabled={job.attempts >= MAX_ATTEMPTS} />
                    ) : (
                      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
