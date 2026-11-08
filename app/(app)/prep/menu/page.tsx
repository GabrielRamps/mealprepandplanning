import { Camera, ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LocalDate } from "@/components/local-date";
import { EatersEditor } from "@/components/prep/eaters-editor";
import { PrepHeader } from "@/components/prep/prep-header";
import { SettingsEditor } from "@/components/prep/settings-editor";
import { SetupPrep } from "@/components/prep/setup-prep";
import { Button } from "@/components/ui/button";
import type { CoreFoodCategory } from "@/lib/enums";
import { getMembers, requireHousehold } from "@/lib/household";
import { SLOT_LABELS } from "@/lib/plan/week";
import { formatMoney, formatWeight } from "@/lib/prep/format";
import { type Catalog, listTemplates, loadCatalog } from "@/lib/prep/load";
import { CATEGORY_LABELS, isPriceStale } from "@/lib/prep/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Prep menu" };

const TABS = [
  { key: "foods", label: "Foods" },
  { key: "meals", label: "Meals" },
  { key: "eaters", label: "Eaters" },
  { key: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["key"];

/** Menu (PRD-prep 5): Foods · Meals · Eaters · Settings. */
export default async function PrepMenuPage(props: PageProps<"/prep/menu">) {
  const search = await props.searchParams;
  const tab: Tab = TABS.some((t) => t.key === search.tab) ? (search.tab as Tab) : "foods";
  const { membership } = await requireHousehold();
  const householdId = membership.householdId;
  const catalog = await loadCatalog(householdId);
  if (!catalog) {
    return (
      <>
        <PrepHeader />
        <SetupPrep />
      </>
    );
  }

  return (
    <>
      <PrepHeader
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/prep/prices/scan">
              <Camera aria-hidden /> Scan a receipt
            </Link>
          </Button>
        }
      />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
        <nav aria-label="Menu sections" className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/prep/menu?tab=${t.key}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-full border px-4 text-sm font-medium",
                tab === t.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {tab === "foods" ? <Foods catalog={catalog} /> : null}
        {tab === "meals" ? <Meals catalog={catalog} /> : null}
        {tab === "eaters" ? <Eaters catalog={catalog} householdId={householdId} /> : null}
        {tab === "settings" ? <Settings catalog={catalog} householdId={householdId} /> : null}
      </main>
    </>
  );
}

function Foods({ catalog }: { catalog: Catalog }) {
  const foods = [...catalog.foods.values()].filter((f) => !f.deleted);
  const byCategory = new Map<CoreFoodCategory, typeof foods>();
  for (const f of foods) byCategory.set(f.category, [...(byCategory.get(f.category) ?? []), f]);
  return (
    <>
      <Button asChild variant="outline">
        <Link href="/prep/menu/foods/new">
          <Plus aria-hidden /> Add a food
        </Link>
      </Button>
      {(Object.keys(CATEGORY_LABELS) as CoreFoodCategory[])
        .filter((c) => byCategory.has(c))
        .map((c) => (
          <section key={c} aria-label={CATEGORY_LABELS[c]} className="flex flex-col">
            <h2 className="py-1.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{CATEGORY_LABELS[c]}</h2>
            <ul className="flex flex-col divide-y rounded-xl border">
              {byCategory.get(c)!.map((f) => (
                <li key={f.id}>
                  <Link href={`/prep/menu/foods/${f.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2" data-testid="core-food">
                    <span className="flex flex-1 flex-col">
                      <span className="font-medium">
                        {f.name}
                        {f.priceIsEstimate ? (
                          <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">estimate</span>
                        ) : null}
                        {f.buyMode === "restock" ? <span className="ml-1.5 rounded bg-muted px-1.5 text-xs font-medium">restock</span> : null}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatMoney(f.packagePriceCents)} · {f.packageLabel}
                        {f.unitKind === "weight" ? ` (${formatWeight(f.packageAmount)})` : ""} ·{" "}
                        {f.priceIsEstimate ? "estimate" : <>price <LocalDate iso={f.priceUpdatedAt} /></>}
                        {isPriceStale(f.priceUpdatedAt) ? " · price may be stale" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {Math.round(f.per100g.kcal)} kcal · {f.per100g.protein} g protein per 100 g
                        {f.unitKind === "count" ? ` · ${f.gramsPerCount} g each` : ""}
                      </span>
                    </span>
                    <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </>
  );
}

function Meals({ catalog }: { catalog: Catalog }) {
  const meals = [...catalog.meals.values()].filter((m) => !m.deleted).sort((a, b) => a.position - b.position);
  return (
    <>
      <Button asChild variant="outline">
        <Link href="/prep/menu/meals/new">
          <Plus aria-hidden /> Add a meal
        </Link>
      </Button>
      <ul className="flex flex-col divide-y rounded-xl border">
        {meals.map((m) => (
          <li key={m.id}>
            <Link href={`/prep/menu/meals/${m.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2" data-testid="core-meal">
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{m.name}</span>
                <span className="text-sm text-muted-foreground">
                  {SLOT_LABELS[m.slot]}
                  {m.isFlex ? " · flex, not counted" : ""}
                  {m.components.length
                    ? ` · ${m.components
                        .map((c) => (c.swapCategory ? `${c.label ?? c.role} (any ${CATEGORY_LABELS[c.swapCategory].toLowerCase()})` : catalog.foods.get(c.defaultFoodId)?.name))
                        .join(", ")}`
                    : ""}
                </span>
                {m.components.some((c) => Object.keys(c.portions).some((e) => catalog.needsReview.has(`${c.id}:${e}`))) ? (
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Check portions</span>
                ) : null}
              </span>
              <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

async function Eaters({ catalog, householdId }: { catalog: Catalog; householdId: string }) {
  const members = await getMembers(householdId);
  const missing = members
    .filter((m) => !catalog.eaters.some((e) => e.userId === m.userId))
    .map((m) => ({ userId: m.userId, name: m.displayName.trim().split(/\s+/)[0] || m.displayName }));
  return <EatersEditor eaters={catalog.eaters} missingMembers={missing} />;
}

async function Settings({ catalog, householdId }: { catalog: Catalog; householdId: string }) {
  const templates = await listTemplates(householdId);
  return <SettingsEditor settings={catalog.settings} templates={templates} />;
}
