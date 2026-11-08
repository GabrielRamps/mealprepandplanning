# Changelog

What changed, newest first. Database changes say when they reached production;
the Vercel build doesn't run migrations (see README → Migrations and deploys).

## 2026-11-08 · Prep: core week builder (milestones 7–9)

Spec: [docs/PRD-prep.md](docs/PRD-prep.md).

### For you

- **Prep tab**, first in the tab bar, with **Today · Week · Menu**. The first
  time, **Load our plan** sets up our 32 foods (nutrition, packages, estimated
  Walmart prices), 12 meals with Gabriel's and Anna's portions, targets
  (Gabriel 2,400 kcal / 195 g; Anna's 1,700 / 125 are placeholders to edit),
  Mom and Dad as guests (off until you turn them on), and the 4-week rotation.
- **Week:** a new week offers the rotation's next template (marked
  Suggested), Copy last week or Blank. Tap any breakfast, lunch, dinner or
  snack to pick the meal, swap the protein / starch / veg, add a flavor, turn
  on **Double** (tomorrow's lunch becomes the leftovers; it asks before
  replacing a planned lunch), use a library recipe, or mark it Flex. The bar
  above the tabs shows the week's cost against the $175 budget and each
  person's average calories and protein, green / amber / red with words; tap
  it for the day-by-day table and cost by food (estimate or receipt).
  Also: guests at dinner per week, restock items with "Buy this week", extras
  (sauces, seasonings), Save as template, Start over.
- **Make grocery list** turns the week into a list in packages ("Chicken
  breast, 3 lb family pack × 3 · $35.91"), restock items and pantry extras
  under "Check you have", and library recipe ingredients merged in. The list
  shows an **Estimated total**; tap a Prep item for the meals and days it's
  for and **Open in Walmart** when a link is set. If the week changes, both the
  week and the list offer **Update list** (checks and added items stay).
- **Copy list** on every list's ⋯ menu copies it as text by aisle.
- **Today:** each meal with one line per person in cooked amounts ("Gabriel
  6 oz cooked chicken breast · 250 g cooked sweet potatoes · 1½ cups
  broccoli"), the Sunday and Wednesday prep checklists with amounts and
  portioning, pack-leftovers and thaw reminders, and a freeze list on
  shopping day. Check-offs are shared and show who did them.
- **Menu:** edit foods (prices by hand keep a history; prices older than
  60 days say so), meals with a portion grid (type "6 oz cooked", "227 g" or
  "3"), eaters and their targets, and settings (budget, prep days, rotation).
- **Scan a receipt** (Menu): photos of a receipt or Walmart cart; prices are
  read and matched to foods, then you tick which to apply. Different package
  sizes are flagged and left unticked.
- **Recipes → Add to Prep week** drops a library recipe into a day and meal,
  with servings for everyone eating it.

### Database

Migration `drizzle/0002_prep.sql`, additive only:

- New enums and tables: `prep_settings`, `prep_eaters`, `core_foods`,
  `core_food_prices`, `core_meals`, `core_meal_components`,
  `core_meal_portions`, `prep_templates`, `prep_template_meals`,
  `prep_template_extras`, `prep_weeks`, `prep_week_meals`, `prep_week_extras`,
  `prep_task_checks`, `receipt_scans`.
- New nullable columns: `grocery_items.note`, `grocery_items.price_cents`,
  `grocery_lists.prep_week_id`, `saved_list_items.note`,
  `saved_list_items.price_cents`.

**Not yet applied to production.** Run `npm run db:migrate` against
production before merging (README → Migrations and deploys).

### Vercel

No new settings. Receipt scans use the existing `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL` and the private `imports` bucket; the daily cleanup cron
now also deletes receipt photos older than 7 days.

### Code

- `lib/prep/calc.ts`: the only place portions, nutrition, packages, cost,
  status and tasks are computed (pure). `lib/prep/format.ts`: units.
- `lib/prep/seed-data.ts` (pure) and `seed.ts`; `load.ts`, `weeks.ts`,
  `list-items.ts` (pure) and `list.ts`, `menu.ts`, `receipts.ts`,
  `template.ts`, `view.ts`, `pages.ts`, `validation.ts`.
- `lib/import/receipt-ai.ts` (prompt, schema, checks, suggested prices) and
  `readReceiptWithClaude` in `lib/import/claude.ts`.
- `app/(app)/prep/**`, `components/prep/*`, `app/api/realtime/prep`
  (`prepWeekLiveQuery`, `prepChecksLiveQuery`), `lib/grocery/copy-text.ts`.

### Differences from the PRD

- Built on one branch rather than one per milestone.
- `core_meal_components.default_food_id` and `prep_week_meals.core_meal_id`
  are `on delete cascade`, not `restrict`: with restrict, deleting a household
  failed. Foods and meals are only soft-deleted by the app, behind the
  "Used in … Swap it out first" guard, so nothing in use can be removed.
- Small additions: `core_foods.display_cup_g` (cups on Today),
  `no_prep` on template and week meals (Sunday's lunch bowl is cooked fresh,
  so it's left out of Wednesday prep), `receipt_scans.store`, and a `weighed`
  flag on receipt lines (to tell price-per-lb items from packages).
- Guests eat when they're switched on in Eaters **and** the week has guests
  at dinner on.
- Swappable portions are in the default food's unit; a swap to a food of the
  other kind (zucchini, counted, for broccoli, weighed) converts by weight.

### Tested

- Unit tests: the PRD's worked examples (2,212.4 kcal / 214.2 g; 2,210.1 kcal
  / 220.6 g; chicken breast 3 packs, and 2 packs "≈ 2 oz short"), the 5% rule
  at 0.04 / 0.05 / 0.06, counts, restock shares, doubles with guests, partial
  days, status boundaries, prep coverage {0,3} and {0,4}, thaw and freeze
  tasks, units, list items, copy text, and receipt parsing.
- `lib/prep/prep.db.test.ts`: 11 tests against a real Postgres (seed is
  idempotent, template weeks rebuild leftovers, Double asks / replaces /
  clears, delete cascades leftovers, make list, update list keeps checks,
  delete guards, price history, guest portions, templates, check-offs).
  The migration chain was applied to an empty database.
- A production build driven in a browser at 390 px and 375 px, light and
  dark: set up → Week 1 → totals → Double with the replace question → Make
  list ("Chicken breast 3 × 3 lb family pack") → Sunday prep on Today → a
  check-off seen by the second person → food, meal and eater edits → guests →
  "Week changed" → receipt review and apply. No horizontal scroll.
- Lint, typecheck and build pass.

### Known limits

- The browser run used a local database and a test session, not Neon.
  Realtime live updates, the receipt photo upload and the Claude read itself
  weren't exercised here (no storage or API keys); Prep screens fall back to
  polling every 15 s, as tested.
- Library recipes count toward cost, not nutrition, until ingredient
  nutrients exist (as specified).
- Seed prices are estimates until a receipt or hand edit replaces them.

## 2026-10-28 · Milestone 6: live sync, aisle order and pantry staples

### For you

- **Live sync:** an open shopping list or weekly plan updates on the other
  phone as soon as something changes (about half a second in testing). If the
  live connection is down, lists check every 3 s and plans every 15 s.
- **Your store** (Settings): put aisles in the order you walk them; lists
  follow it. Reset to default order puts it back.
- **Ingredient aisles and pantry staples** (Settings): search ingredients and
  set each one's aisle and whether it's a pantry staple ("Check you have" group
  at the end of a list). Changes apply to new lists and to unchecked items on
  active lists.

### Database

No migration. Uses `households.aisle_order` and `ingredients.aisle` /
`is_pantry_staple`, which already existed.

### Vercel

No changes. Live sync uses `NEXT_PUBLIC_NEON_REALTIME_URL` and
`NEON_REALTIME_SECRET`, already set.

### Code

- `components/live-signal.tsx`: subscribes to a sealed Realtime query and
  tells the screen when to reload; `components/realtime-root.tsx` reports
  whether Realtime is available.
- `lib/realtime.ts`: `planLiveQuery`; seal route `app/api/realtime/plan`.
- `lib/grocery/ingredients.ts`, `components/store-settings.tsx`,
  `app/(app)/settings/ingredients`, settings actions.
- Plan reloads wait while your own save is in flight, so the screen never
  shows the plan from before the save.

### Tested

- Unit tests (new `isAisleOrder` tests), lint, typecheck, build.
- Browser suites on a temporary Neon branch with Realtime on and with it off,
  including the earlier milestones' suites, re-run after merging the Lists
  update; `lib/grocery/lists.db.test.ts` passes on the merged code.

## 2026-10-27 · Lists: Active / Reorder / History, delete, saved lists

### For you

- **Three buttons at the top of Lists:** Active, Reorder and History, each with
  a count. The view is kept in the URL (`/lists?tab=reorder`, `?tab=history`),
  so the back button and reloads land on the same one.
  - **Active:** lists still being shopped, with a progress bar.
  - **History:** lists marked Done shopping, most recently finished first. They
    no longer clutter the main view. Reopen, save or delete them from ⋯.
  - **Reorder:** saved lists. Each card shows its meals with servings, the
    items added by hand, and when it was last ordered. **Reorder** makes a fresh
    active list with the same meals and items and opens it.
- **Delete a list** from its ⋯ menu, on the Lists screen or inside the list. A
  confirmation says it's deleted for both of you, gone for good, and can't be
  undone; Keep it cancels. "List deleted." shows afterwards.
- **Save for reorder** from ⋯, or from the banner shown after Done shopping.
  It keeps the list's recipes, servings and hand-added items under a name. A
  list made by reordering (or already saved) can update its saved list or save
  a separate one.
- **Saved lists** can be renamed or deleted (with the same confirmation). Lists
  already made from a deleted saved list stay where they are.
- Recipes deleted, archived or marked "didn't like" since saving are skipped
  on reorder, as in the weekly plan; the card says which.
- If the other phone deletes a list you have open, you see "This list was
  deleted" instead of an error.

### Database

Migration `drizzle/0001_saved_lists.sql`, additive only (no existing data
touched):

- New tables `saved_lists`, `saved_list_recipes`, `saved_list_items`.
- New nullable column `grocery_lists.saved_list_id` (on delete set null).

**Applied to production on 2026-10-27**, before the code shipped, so the live
app kept working throughout. Preview branches copied from production after that
already have it.

### Vercel

No settings or environment variables changed.

### Code

- `lib/grocery/saved.ts`: save, update, reorder, rename and delete saved lists.
- `lib/grocery/lists.ts`: `createList` takes hand-added items and a saved-list
  link; per-status `listLists`, `listCounts`, `deleteList`.
- `lib/grocery/tabs.ts`: view and notice names and URLs.
- `app/(app)/lists/actions.ts`: server actions, all scoped to the household.
- Components: `lists-tabs`, `list-actions` (⋯ menu, save and delete dialogs),
  `saved-list-card`, `lists-notice`, `local-date`.

### Tested

- Unit tests for views, notices and reorder contents (`npm test`).
- `lib/grocery/lists.db.test.ts`: 11 tests against a real database (save,
  reorder, History, deletes and cascades, household isolation). Runs only with
  `TEST_DATABASE_URL`; see README → Tests.
- The migration was run with `npm run db:migrate` on a schema-only copy of
  production and on an empty database (full chain), and re-run as a no-op.
- A production build driven in a browser at iPhone size through every flow
  above, including a delete from the second phone, with no console errors. The
  Lists buttons fit at 320 px wide.
- Lint, typecheck and build pass.

### Known limits

- Reorder is one tap; change servings on the new list afterwards.
- History shows the latest 100 lists.
- The browser run used a test session rather than a real sign-in.

## 2026-10-27 · Milestones 1–5

1. Household onboarding, tab bar, PWA and shadcn/ui.
2. Recipe library, editor, detail and servings scaler.
3. Grocery lists from recipes, shared check-off, print.
4. Weekly plan, send and approve, list from plan.
5. Import from links, photos and text, review, Shortcut tokens.
