import { Clock, Heart, Star, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import type { RecipeCard as RecipeCardData } from "@/lib/recipes";

export function formatMinutes(total: number): string {
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function RecipeCard({ recipe, partnerLabel }: { recipe: RecipeCardData; partnerLabel: string }) {
  return (
    <Link href={`/recipes/${recipe.id}`} className="group flex flex-col gap-2">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        {recipe.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- photos come straight from the public bucket
          <img
            src={recipe.coverUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <UtensilsCrossed className="size-8" aria-hidden />
          </div>
        )}
        {recipe.isFavorite ? (
          <span className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/90">
            <Heart className="size-4 fill-red-500 text-red-500" aria-label="Favorite" />
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <h2 className="line-clamp-2 leading-snug font-medium">{recipe.title}</h2>
        <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {recipe.totalMinutes !== null ? (
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {formatMinutes(recipe.totalMinutes)}
            </span>
          ) : null}
          {recipe.myRating !== null ? <RatingPill label="You" value={recipe.myRating} /> : null}
          {recipe.othersRating !== null ? <RatingPill label={partnerLabel} value={recipe.othersRating} /> : null}
        </div>
      </div>
    </Link>
  );
}

function RatingPill({ label, value }: { label: string; value: number }) {
  const shown = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <span className="flex items-center gap-0.5" aria-label={`${label}: ${shown} of 5 stars`}>
      {label} <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
      {shown}
    </span>
  );
}
