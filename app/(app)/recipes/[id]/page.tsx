import { Clock, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { formatMinutes } from "@/components/recipe-card";
import {
  FavoriteButton,
  RecipeActions,
  ScaledIngredients,
  StarRating,
  StaticStars,
} from "@/components/recipe-detail";
import { Badge } from "@/components/ui/badge";
import { requireHousehold } from "@/lib/household";
import { getRecipe } from "@/lib/recipes";

export async function generateMetadata(props: PageProps<"/recipes/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const { membership } = await requireHousehold();
  const recipe = await getRecipe(membership.householdId, id);
  return { title: recipe?.title ?? "Recipe" };
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default async function RecipePage(props: PageProps<"/recipes/[id]">) {
  const { id } = await props.params;
  const { user, membership } = await requireHousehold();
  const recipe = await getRecipe(membership.householdId, id);
  if (!recipe) notFound();

  const mine = recipe.prefs.find((p) => p.userId === user.id);
  const others = recipe.prefs.filter((p) => p.userId !== user.id);
  const times = [
    recipe.prepMinutes !== null ? `Prep ${formatMinutes(recipe.prepMinutes)}` : null,
    recipe.cookMinutes !== null ? `Cook ${formatMinutes(recipe.cookMinutes)}` : null,
  ].filter(Boolean);

  const stepGroups: { section: string | null; steps: { n: number; text: string }[] }[] = [];
  recipe.steps.forEach((s, i) => {
    const last = stepGroups.at(-1);
    if (last && last.section === s.section) last.steps.push({ n: i + 1, text: s.text });
    else stepGroups.push({ section: s.section, steps: [{ n: i + 1, text: s.text }] });
  });

  return (
    <>
      <PageHeader
        title={recipe.title}
        back={{ href: "/recipes", label: "Recipes" }}
        action={<RecipeActions recipeId={recipe.id} status={recipe.status} />}
      />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
        {recipe.status === "disliked" ? (
          <p className="rounded-xl bg-destructive/10 p-3 text-sm">
            <strong>Didn&apos;t like it:</strong> {recipe.dislikedReason}
          </p>
        ) : recipe.status === "archived" ? (
          <p className="rounded-xl bg-muted p-3 text-sm">Archived. It&apos;s hidden from the library and the planner.</p>
        ) : null}

        {recipe.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- photos come straight from the public bucket
          <img src={recipe.coverUrl} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />
        ) : null}

        <div className="flex flex-col gap-3">
          {recipe.description ? <p className="text-muted-foreground">{recipe.description}</p> : null}
          {times.length ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden /> {times.join(" · ")}
            </p>
          ) : null}
          {recipe.sourceUrl || recipe.creatorName || recipe.creatorHandle ? (
            <p className="text-sm">
              {recipe.creatorName || recipe.creatorHandle ? (
                <span>
                  By {[recipe.creatorName, recipe.creatorHandle].filter(Boolean).join(" ")}
                  {recipe.sourceUrl ? " · " : ""}
                </span>
              ) : null}
              {recipe.sourceUrl ? (
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  {hostname(recipe.sourceUrl)} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              ) : null}
            </p>
          ) : null}
          {recipe.tags.length ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {recipe.tags.map((t) => (
                <li key={t}>
                  <Badge variant="secondary">{t}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <section aria-label="Ratings" className="flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">You</span>
            <StarRating recipeId={recipe.id} value={mine?.rating ?? null} label="Your rating" />
          </div>
          {others.map((p) => (
            <div key={p.userId} className="flex min-h-11 items-center justify-between gap-2">
              <span className="font-medium">{p.displayName}</span>
              <StaticStars value={p.rating} />
            </div>
          ))}
          <FavoriteButton recipeId={recipe.id} isFavorite={mine?.isFavorite ?? false} />
        </section>

        <ScaledIngredients servings={recipe.servings} ingredients={recipe.ingredients} />

        <section aria-labelledby="steps-heading" className="flex flex-col gap-3">
          <h2 id="steps-heading" className="text-lg font-semibold">
            Steps
          </h2>
          {stepGroups.length === 0 ? <p className="text-muted-foreground">No steps written yet.</p> : null}
          {stepGroups.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-2">
              {group.section ? <h3 className="font-semibold">{group.section}</h3> : null}
              <ol className="flex flex-col gap-3">
                {group.steps.map((s) => (
                  <li key={s.n} className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {s.n}
                    </span>
                    <p className="pt-0.5 whitespace-pre-line">{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        {recipe.notes ? (
          <section aria-labelledby="notes-heading" className="flex flex-col gap-2">
            <h2 id="notes-heading" className="text-lg font-semibold">
              Notes
            </h2>
            <p className="whitespace-pre-line text-muted-foreground">{recipe.notes}</p>
          </section>
        ) : null}
      </main>
    </>
  );
}
