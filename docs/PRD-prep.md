# Prep — Core Week Builder · PRD v1

Nov 8, 2026 · Gabriel Henley · Addendum to [PRD.md](PRD.md)

## 0. How to use this document

This spec adds one feature area, **Prep**, to the existing Meal Prep & Planning app. Everything in [PRD.md](PRD.md) still applies: the stack, conventions, household scoping, security rules and the grocery list algorithm (PRD 8). Where this document says "reuse," use the existing module named; do not rebuild it.

Build in the order of §15. Each milestone ships on its own branch, with an additive migration and a CHANGELOG entry in the existing format.

---

## 1. Summary

**Problem.** The recipe library and weekly plan are good for discovering and trying recipes. But the household's real goal is a strict, repeatable week that hits each person's calories and protein, fits a grocery budget, and takes no thinking. Today that week lives in Claude docs and a hand-built page. Gabriel rebuilds the grocery list every week, the first real order cost $214 against a budget of roughly $150–175, and nothing checks whether a week actually hits the numbers.

**Solution.** A new **Prep** tab built from *core foods* (chicken breast, 93% lean beef, sweet potatoes, egg whites…) and *core meals* (a lunch bowl, a dinner plate, a scramble…) with fixed portions **per person**. Each week, you pick or reuse a week template. The app shows, live:

- each person's average daily calories and protein against their targets;
- the week's grocery cost against the budget, using real Walmart prices learned from receipts;
- a grocery list in package counts ("Chicken breast, 3 lb family pack × 2"), in the same item names every week;
- a **Today** screen with each person's portions for every meal, plus prep and thaw tasks.

Library recipes can be dropped into a Prep week to "spice it up," and their ingredients merge into the same list.

**Success, after 4 weeks of use:**

1. Building next week's plan and list takes under 5 minutes: pick the template, adjust, and tap Make list.
2. Weekly grocery cost is known before ordering, and actual receipts land within ±10% of it.
3. Both people's planned daily protein is within 5% of target on at least 6 of 7 days.

---

## 2. Scope

| Priority | Feature | Milestone |
| --- | --- | --- |
| Must | Prep tab with Today / Week / Menu views | M7 |
| Must | Core foods: nutrition per 100 g, package size and price, aisle, Walmart name and link, buy mode | M7 |
| Must | Core meals with per-person portions and swappable components | M7 |
| Must | Eaters: household members with calorie and protein targets; guest eaters (Anna's parents) for dinners | M7 |
| Must | One-tap setup that seeds Gabriel and Anna's foods, meals, targets and the 4-week rotation | M7 |
| Must | Week builder: start from a template or last week; set meal, protein/starch/veg choice, flavor note and double flag per slot | M7 |
| Must | Live totals: per-person daily calories and protein, weekly cost vs budget, with green/amber/red status | M7 |
| Must | Make grocery list from a Prep week, in package counts and prices, merged with any library recipes | M7 |
| Must | Today screen: each person's portions per meal, prep tasks on prep days, pack-leftover and thaw reminders, shared check-off | M8 |
| Must | Price entry by hand, with price history | M7 |
| Should | Receipt / cart screenshot scan: AI extracts prices; review, then apply to core foods | M9 |
| Should | Save a week as a template; rotation suggests the next template | M8 |
| Should | Live sync of Prep week edits and task check-offs (reuse Live sync) | M8 |
| Nice | "Ate it" check per person per meal on Today | Later |
| Later | USDA lookup for core food nutrition; Walmart cart automation; Anna's own training plan | — |
| Out | Automatic Walmart ordering (no public API for consumer carts), AI-generated meal plans, calorie logging of off-plan food | — |

The existing Plan tab, Recipes, Lists and Import are unchanged except for: one new tab in the tab bar (§5), two nullable columns on `grocery_items` and one on `grocery_lists` (§7.2), and a "Add to Prep week" action on recipe detail (§6, P-12).

---

## 3. Users and the weekly flow

**Gabriel.** Cooks most meals and does both prep days. Cutting from 230 lb toward ~200 on a 12-week kettlebell program. Targets: 2,400 kcal and 195 g protein a day. Shops through Walmart+ on Sunday.

**Anna.** Same meals with smaller portions. Wants to lose fat and build muscle. Her targets aren't set yet, so the defaults are placeholders she edits in Menu → Eaters.

**Anna's parents (guests, no accounts).** Join for dinners once Gabriel and Anna move in. They eat a standard dinner plate and add their own sides.

**The week, every week:**

| When | What happens in the app |
| --- | --- |
| Saturday or Sunday morning | Open Prep → Week for next week. It suggests the next rotation template. Adjust anything, check that the totals are green, then tap **Make grocery list**. Order on Walmart+ from the list. |
| Sunday | Today shows the **Sunday prep** checklist: what to cook and how much, then how to portion each person's containers. |
| Mon–Sun | Today shows each meal with "Gabriel: 6 oz cooked chicken, 250 g sweet potato…" and "Anna: …", plus evening tasks ("Pack Tuesday lunches," "Move 1¾ lb chicken to the fridge"). |
| Wednesday | Today shows the **Wednesday prep** checklist. |
| After shopping | Optional: scan the receipt so prices stay real. |

---

## 4. Concepts and glossary

| Term | Meaning |
| --- | --- |
| **Core food** | Something you buy and eat in measured amounts. Nutrition and prices are per 100 g (or per count item) *as purchased*: raw meat, raw potatoes, eggs as sold. |
| **Cooked yield** | Cooked weight ÷ raw weight, for display only (chicken 0.75, potatoes 0.85). The app stores raw grams and shows "≈ 6 oz cooked." |
| **Buy mode** | `by_amount`: the list buys whole packages to cover the week. `restock`: a long-lasting item (oats, whey, oil, spices) goes in "Check you have." It costs nothing on the list unless ticked **Buy this week**, but the budget always counts its *weekly share*. |
| **Core meal** | A meal pattern made of **components**: protein, starch, vegetable, fat or other. Each component has a fixed portion per eater. A component can be **swappable**: it names a category, and the week picks the food (for example, protein = chicken thighs). |
| **Eater** | Someone portions are calculated for. **Members** are the household's signed-in users. **Guests** have a name only and eat chosen slots only (default: dinner). |
| **Prep week** | One Monday–Sunday week of meal slots, an eaters selection and a budget. It links to the grocery list made from it. |
| **Double** | A dinner cooked twice over. The extra feeds the members' lunch the next day, shown as "Leftovers: …". |
| **Prep as** | A label on a component ("lunch protein," "breakfast potatoes," "egg white bites") used to group prep tasks. |
| **Template** | A saved week pattern by weekday, not date. Weeks 1–4 of the rotation are seeded. |
| **Flex** | A slot with no planned food (Saturday dinner: "Leftovers or a planned meal out"). It adds no cost or nutrition and is marked "not counted" in totals. |

---

## 5. Screens and navigation

The tab bar gains a fifth tab, **Prep**, first in order: **Prep, Recipes, Plan, Lists, Import**. Icon: lucide `ChefHat`. `/prep` redirects to `/prep/today`.

| Route | Screen | Key contents |
| --- | --- | --- |
| `/prep/today` (and `/prep/today/[date]`) | Today | Date switcher (◂ Today ▸). Meal cards per slot, each with the meal name and flavor note. One line per eater: "**Gabriel** 6 oz cooked chicken · 250 g sweet potato · 1½ cups green beans." Library recipes link to the recipe. Then **Tasks**: prep checklist on prep days, "Pack tomorrow's lunches" after double dinners, thaw reminders. Each task has a shared checkbox. Empty state: "No Prep week for this week — Plan this week." |
| `/prep/week` and `/prep/week/[weekStart]` | Week builder | Sticky **summary bar**: cost vs budget, and each member's average kcal and protein, each with a status color. Week switcher. A "Start from" sheet for new weeks (template list with the suggested one first, Copy last week, Blank). Seven day cards with Breakfast / Lunch / Dinner / Snack rows; tapping a row opens the slot sheet. Guests toggle ("Mom & Dad at dinner"). Actions: **Make grocery list** (or **Update list** if one exists), **Save as template**. |
| Slot sheet (modal) | — | Meal picker filtered by slot; swappable component pickers (protein, starch, veg); flavor note (free text, with suggestions from the meal's flavor ideas); **Double** toggle on dinners; **Use a library recipe** (opens the recipe picker with servings, which defaults to the number of eaters); **Flex**; Clear. Bottom: this slot's cost and each eater's kcal/protein. |
| Summary sheet | — | Tap the summary bar. Per member, a 7-day table of kcal, protein, carbs, fat and fiber with day status. Cost by food, biggest first, marked estimate or receipt. Restock shares. |
| `/prep/menu` | Menu | Segments: **Foods · Meals · Eaters · Settings**. Foods: grouped by category; each row shows name, package and price ("$11.97 · 3 lb · receipt Nov 9"), an estimate badge when unconfirmed, kcal/protein per 100 g. Meals: list with slot and components. Eaters: members and guests, with targets. Settings: weekly budget, prep days, double-dinner default days, rotation order. Button: **Scan a receipt**. |
| `/prep/menu/foods/[id]` | Food editor | All core food fields (§7.1); price history list; **Open in Walmart** if a URL is set. |
| `/prep/menu/meals/[id]` | Meal editor | Name, slot, flavor ideas, components (role, food or swappable category, prep-as label) and a portion grid: component rows × eater columns, with amounts in g, oz or count. |
| `/prep/prices/scan` and `/prep/prices/scan/[scanId]` | Receipt scan | Upload 1–4 images (camera or library, reusing the import photo picker and resizing). Then a review table: receipt line → matched food → old price → new price → Apply checkbox. Apply selected. |

UI rules (in addition to PRD 5): amounts always show **cooked** for meat and potatoes on Today ("6 oz cooked chicken") and **raw** on lists and prep tasks ("cook 2 lb raw chicken breast"); each eater's line starts with their name in their color (members get the two app accent colors, guests neutral); status colors always come with words ("$186 · $11 over").

---

## 6. User stories and acceptance criteria

Story points use Fibonacci and assume AI-assisted speed. "Member" means a signed-in household member; every read and write is scoped to their household (PRD 3).

### P-1 · First-time setup (3)

As Gabriel, I want one button that loads our foods, meals, targets and rotation, so that Prep works on day one.

- Given a household with no core foods, when a member opens any Prep route, then they see "Set up Prep" with a short description and a **Load our plan** button.
- When they tap it, then the seed in §11 is inserted in one transaction. Members become eaters with the default targets (Gabriel's for the member whose display name starts with "Gabriel", Anna's placeholder for the other). It also creates two inactive guests, "Mom" and "Dad" (dinner only), settings, the meals and templates Week 1–4, and links core foods to `ingredients` rows by name, creating any that are missing with the seed aisle.
- [ ] Running it twice creates nothing new (checked on `prep_settings` existence inside the transaction).
- [ ] Every seeded price has `price_is_estimate = true`.
- [ ] Seeding fails as a whole on any error and shows "Setup didn't finish — try again."

### P-2 · Manage core foods (5)

As a member, I want to add and edit foods with nutrition, package and price, so that the totals are true.

- Given the Foods list, when I edit chicken breast's price to $11.97 for a 3 lb pack, then `package_price_cents = 1197`, `package_amount = 1361` (g), `price_is_estimate = false`, a `core_food_prices` row is written with `source = 'manual'`, and every open Prep week's totals reflect it.
- [ ] Validation (Zod): name 1–80 chars, unique per household (case-insensitive) among non-deleted foods. kcal 0–900, protein/carbs/fat 0–100, fiber 0–50 per 100 g. `unit_kind = 'count'` requires `grams_per_count` from 1 to 2000. `package_amount` is greater than 0 (g or count). Price is 0–100000 cents. `cooked_yield` is 0.2–1.5. `restock_weeks` is 1–26 when `buy_mode = 'restock'`. `walmart_url` must be an `https://www.walmart.com/` URL.
- [ ] Deleting is a soft delete. A food used by a meal component or an upcoming week can't be deleted: "Used in Lunch bowl and 2 weeks. Swap it out first."
- [ ] Unit entry accepts g, oz, lb or count and stores grams (oz ×28.3495, lb ×453.592).

### P-3 · Manage core meals and portions (5)

As Gabriel, I want each meal to define each person's portion of each component, so that our plates differ by person without separate meals.

- Given the Lunch bowl with components protein (swappable, category protein, default chicken breast, prep-as "lunch protein"), starch (swappable, default sweet potato) and veg (swappable, default broccoli), when I set Gabriel protein = 6 oz cooked, then it's stored as raw grams: 170.1 ÷ 0.75 = 226.8 → 227 g.
- [ ] Every component must have a portion for every **active** eater who eats that slot. A missing portion shows the cell in red, and the meal can't be saved until it's filled or explicitly set to 0.
- [ ] A new eater (guest or member) gets portions copied from the member with the most similar targets, marked "check portions" until edited.
- [ ] A swappable component only accepts foods in its category. A fixed component names one food.

### P-4 · Eaters and targets (2)

As Anna, I want to set my own calorie and protein targets, so that my totals mean something.

- [ ] Each eater has a name (members show their display name, read-only), active flag, slots eaten (subset of breakfast/lunch/dinner/snack; members default all, guests default dinner), and for members `kcal_target` (1000–5000) and `protein_target_g` (40–350).
- [ ] Guests have no targets and appear in cost and portions only.
- [ ] A week's guests can be toggled per week (P-6) without changing the eater's active default.

### P-5 · Start a week (3)

As Gabriel, I want next week to start from the right template, so that I don't rebuild it.

- Given no Prep week for the Monday I'm viewing, when I open it, then the "Start from" sheet lists templates in rotation order. The one after the template used by the most recent earlier week is marked **Suggested** (after Week 4 comes Week 1). It also offers **Copy last week** and **Blank**.
- When I pick a template, then one `prep_week_meals` row is created per template meal, with `day = week_start + (weekday − 1)`. Leftover links are rebuilt to the new rows, and template extras copy into `prep_week_extras`.
- [ ] Budget snapshot = settings budget at creation. Guests at dinner = settings default.
- [ ] The week start must be a Monday. Any other date in the URL redirects to that week's Monday.

### P-6 · Edit a slot (5)

As a member, I want to set what we eat in a slot, so that the week matches our plans.

- [ ] The slot sheet saves: meal (`core_meal_id`) **or** recipe (`recipe_id` + `servings`) **or** flex **or** leftovers (`leftover_of`). Exactly one; enforced by a DB check and Zod.
- [ ] Choices for swappable components are saved in `choices` (`{ [componentId]: coreFoodId }`). A missing choice falls back to the component's default food.
- [ ] Turning **Double** on for a dinner on day D sets the next day's lunch (D+1, in the same week) to `leftover_of = that dinner`, if that lunch is empty or already leftovers. If it holds a planned meal, ask: "Replace Thursday's lunch with leftovers?" Turning Double off clears a lunch that was leftovers of it.
- [ ] A Sunday double has no next-day lunch in the week. The toggle is disabled with the note "Sunday leftovers fall in next week."
- [ ] Multiple entries per slot are allowed (snack: yogurt bowl + shake), ordered by `position`.
- [ ] Edits are saved one slot at a time with optimistic UI. A failed save reverts the slot and shows "Didn't save — try again."

### P-7 · Live totals (8)

As Gabriel, I want to see whether the week hits our numbers and budget while I build it, so that I fix it before shopping.

- Given the seeded Week 1 for Gabriel and Anna with no guests, when it loads, then the summary bar shows the week cost and each member's average daily kcal and protein as computed by §8. Statuses follow §8.6.
- [ ] Totals recompute after every slot save without a page reload (server returns fresh totals with the save).
- [ ] Days with any flex slot are flagged "Saturday not fully counted," and the averages use only fully counted days for that person.
- [ ] Library recipes count toward cost (from their ingredients, §8.5) but not toward nutrition until `ingredients.nutrients` exist. The slot shows "nutrition not counted."
- [ ] The summary sheet lists cost by food, marking each line *estimate* or *receipt*, so you can tell which numbers are real.

### P-8 · Make the grocery list (8)

As Gabriel, I want one tap to turn the week into a grocery list I can order from, so that Sunday takes minutes.

- Given a Prep week, when I tap **Make grocery list**, then a `grocery_lists` row is created with `prep_week_id`, named "Prep · Week of Nov 9". It holds:
  1. one item per `by_amount` core food with a quantity, in packages (§8.4). Name = `walmart_name` or `name`. `quantity` = package count, `unit = 'package'`. `note` = "3 lb family pack · $11.97 each" or "≈ 5.1 lb needed". `price_cents` = packages × price. Aisle and pantry come from the linked ingredient. `merge_key = core:{core_food_id}`;
  2. one item per restock food used this week, in the "Check you have" group (`is_pantry = true`, `price_cents` null), unless marked **Buy this week**, in which case it's priced like (1);
  3. each `prep_week_extras` row as an item (manual-style, `merge_key = extra:{id}`), priced if it has a price;
  4. library recipe ingredients through the existing `buildList` (PRD 8), merged by its usual keys. If a recipe ingredient's `ingredient_id` matches a core food's `ingredient_id`, its amount (converted to grams where it's weight) is added to that core food's need **before** package rounding, and the recipe is added to that item's `sources`.
- [ ] The list screen shows a footer "Estimated total $X (Y items not priced)" when any item has a price.
- [ ] Tapping a core item shows its sources (which meals and days) and **Open in Walmart** if a URL is set.
- [ ] If the week changes after the list exists, the week shows "Week changed — update list?" Updating follows PRD 8.4: it keeps `is_checked` for items whose `merge_key` remains and keeps manual items.
- [ ] **Copy list** (on the list's ⋯ menu) copies plain text grouped by aisle: "Chicken breast — 3 lb family pack × 2". Make it work for every list, not just Prep lists.
- [ ] Saving a Prep list for reorder works as today. Its items save as hand-added items.

### P-9 · Today (8)

As either of us, I want to open the app and see exactly what I eat and what to cook today, so that we don't have to think.

- Given today is Monday of a Prep week, when I open Today, then each slot shows its meal and one line per eater who eats that slot with **cooked** display amounts (§8.2). Double dinners say "Cook double — leftovers are Tuesday's lunch." Leftover lunches say "Leftovers: Garlic-herb chicken thighs, smashed red potatoes, broccoli" with each person's amounts.
- [ ] **Prep tasks** appear on each prep day (default Sunday before the week and Wednesday), computed by §8.7: one task per prep-as group with total raw amount and a portioning line per eater.
- [ ] **Pack leftovers** appears on the evening of each double dinner. **Thaw** appears the evening before any dinner whose protein must thaw (§8.7).
- [ ] Task check-offs are shared (`prep_task_checks`), show who checked them, and sync to the other phone (Live sync, Should).
- [ ] The Sunday before a week shows that week's Sunday prep, even though the date is outside the Monday–Sunday range.

### P-10 · Prices by hand and history (2)

- [ ] Every price change writes `core_food_prices` (amount, package, source, date, who). The food editor lists the last 10 changes.
- [ ] Prices older than 60 days show "price may be stale."

### P-11 · Scan a receipt (8, Should)

As Gabriel, I want to photograph a receipt or screenshot my Walmart cart and have prices update, so that the budget stays real without typing.

- Given 1–4 images, when I submit, then the server stores them in the private `imports` bucket under `receipts/{householdId}/{scanId}/`, calls Claude (§10), and saves the parsed lines to `receipt_scans.lines`. It returns within 60 s or marks the scan failed with "Couldn't read that receipt — try a clearer photo."
- Then the review screen shows each line: raw text, price, the suggested core food (or "No match"), the current price, and the new **package price** with package size (from the line, or the food's current package if the line has no size).
- [ ] Lines whose size differs from the food's package by more than 10% show "Different size: 5 lb vs 3 lb" and default to unchecked.
- [ ] Apply updates only the checked lines' foods, writes history with `source = 'receipt'` and `receipt_scan_id`, sets `price_is_estimate = false`, and marks the scan `applied_at`.
- [ ] Unmatched lines offer "Match to…" (food picker) or "Ignore."
- [ ] The scan total (sum of lines) is shown next to the week's estimated total.
- [ ] Images are deleted by the existing daily cleanup cron after 7 days (extend its prefix list).

### P-12 · Spice up a week with a library recipe (3)

As Anna, I want to add a recipe from our library to the core week, so that we can try something fun without breaking the plan.

- [ ] Recipe detail gets **Add to Prep week** (week picker defaults to the current week, then day and slot). It creates a `prep_week_meals` row with `recipe_id` and `servings` = number of eaters in that slot.
- [ ] The week builder shows such slots with the recipe photo and "nutrition not counted" until nutrients exist.

### P-13 · Save as template and rotation (3, Should)

- [ ] **Save as template** stores the week's meals by weekday (1–7), choices, flavor notes, double flags, leftover links (by weekday) and extras, under a name. It can overwrite the template the week came from or save as new.
- [ ] Settings → Rotation lets you reorder templates and exclude some from suggestions.

---

## 7. Data model

All new tables are household-scoped and use the conventions in PRD 3 and 6: UUID ids, `timestamptz`, ISO dates, soft delete via `deleted_at` where noted. The migration is `drizzle/0002_prep.sql`, **additive only**. Define the tables in `lib/db/schema.ts` and generate the migration with `npm run db:generate`.

### 7.1 New enums and tables

```sql
CREATE TYPE core_food_category AS ENUM
  ('protein','starch','vegetable','fruit','dairy_eggs','grain','fat','flavor','supplement','snack');
CREATE TYPE core_unit_kind AS ENUM ('weight','count');
CREATE TYPE core_buy_mode  AS ENUM ('by_amount','restock');
CREATE TYPE core_component_role AS ENUM ('protein','starch','vegetable','fat','other');
CREATE TYPE eater_kind AS ENUM ('member','guest');
CREATE TYPE price_source AS ENUM ('manual','receipt','seed');
CREATE TYPE receipt_status AS ENUM ('processing','ready','failed');

-- One row per household once Prep is set up.
CREATE TABLE prep_settings (
  household_id        uuid PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  weekly_budget_cents integer NOT NULL DEFAULT 17500 CHECK (weekly_budget_cents BETWEEN 0 AND 1000000),
  prep_weekdays       smallint[] NOT NULL DEFAULT '{0,3}',   -- 0 = the Sunday BEFORE week_start, 1..7 = Mon..Sun
  double_weekdays     smallint[] NOT NULL DEFAULT '{1,3}',   -- Mon, Wed: default double dinners for blank weeks
  guests_default      boolean NOT NULL DEFAULT false,
  rotation            uuid[] NOT NULL DEFAULT '{}',          -- prep_templates ids in order
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prep_eaters (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  kind          eater_kind NOT NULL,
  user_id       text,                      -- members only; matches household_members.user_id
  name          text NOT NULL,             -- guests: 'Mom'; members: copy of display name
  color         text NOT NULL DEFAULT 'neutral', -- 'a' | 'b' | 'neutral'
  slots         meal_slot[] NOT NULL DEFAULT '{breakfast,lunch,dinner,snack}',
  kcal_target   integer CHECK (kcal_target BETWEEN 1000 AND 5000),
  protein_target_g integer CHECK (protein_target_g BETWEEN 40 AND 350),
  is_active     boolean NOT NULL DEFAULT true,
  position      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'member') = (user_id IS NOT NULL)),
  CHECK (kind = 'guest' OR (kcal_target IS NOT NULL AND protein_target_g IS NOT NULL))
);
CREATE UNIQUE INDEX prep_eaters_household_user ON prep_eaters(household_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE core_foods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ingredient_id   uuid REFERENCES ingredients(id) ON DELETE SET NULL, -- aisle + pantry + recipe matching
  name            text NOT NULL,                 -- 'Chicken breast'
  category        core_food_category NOT NULL,
  unit_kind       core_unit_kind NOT NULL DEFAULT 'weight',
  grams_per_count numeric(8,2),                  -- count foods: egg 50, banana 118
  kcal_100g       numeric(6,1) NOT NULL,         -- as purchased (raw)
  protein_100g    numeric(5,1) NOT NULL,
  carbs_100g      numeric(5,1) NOT NULL DEFAULT 0,
  fat_100g        numeric(5,1) NOT NULL DEFAULT 0,
  fiber_100g      numeric(5,1) NOT NULL DEFAULT 0,
  cooked_yield    numeric(4,2) NOT NULL DEFAULT 1.00,
  package_label   text NOT NULL,                 -- '3 lb family pack'
  package_amount  numeric(10,2) NOT NULL CHECK (package_amount > 0), -- grams, or count for count foods
  package_price_cents integer NOT NULL CHECK (package_price_cents >= 0),
  price_is_estimate boolean NOT NULL DEFAULT true,
  price_updated_at  timestamptz NOT NULL DEFAULT now(),
  buy_mode        core_buy_mode NOT NULL DEFAULT 'by_amount',
  restock_weeks   smallint CHECK (restock_weeks BETWEEN 1 AND 26),
  walmart_name    text,
  walmart_url     text,
  notes           text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (unit_kind = 'weight' OR grams_per_count IS NOT NULL),
  CHECK (buy_mode = 'by_amount' OR restock_weeks IS NOT NULL)
);
CREATE UNIQUE INDEX core_foods_household_name ON core_foods(household_id, lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX core_foods_household_category ON core_foods(household_id, category) WHERE deleted_at IS NULL;

CREATE TABLE core_food_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  core_food_id    uuid NOT NULL REFERENCES core_foods(id) ON DELETE CASCADE,
  price_cents     integer NOT NULL,
  package_amount  numeric(10,2) NOT NULL,
  source          price_source NOT NULL,
  receipt_scan_id uuid REFERENCES receipt_scans(id) ON DELETE SET NULL,
  observed_on     date NOT NULL,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX core_food_prices_food ON core_food_prices(core_food_id, observed_on DESC);

CREATE TABLE core_meals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name          text NOT NULL,                 -- 'Lunch bowl'
  slot          meal_slot NOT NULL,            -- default slot for pickers
  is_flex       boolean NOT NULL DEFAULT false,-- 'Leftovers or a planned meal out'
  flavor_ideas  text[] NOT NULL DEFAULT '{}',
  notes         text,
  position      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE core_meal_components (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  core_meal_id    uuid NOT NULL REFERENCES core_meals(id) ON DELETE CASCADE,
  role            core_component_role NOT NULL,
  label           text,                         -- 'Green vegetable'
  swap_category   core_food_category,           -- set = swappable
  default_food_id uuid NOT NULL REFERENCES core_foods(id) ON DELETE RESTRICT,
  prep_as         text,                         -- 'lunch protein' | 'breakfast potatoes' | 'egg white bites' | null
  position        integer NOT NULL DEFAULT 0
);

CREATE TABLE core_meal_portions (
  component_id  uuid NOT NULL REFERENCES core_meal_components(id) ON DELETE CASCADE,
  eater_id      uuid NOT NULL REFERENCES prep_eaters(id) ON DELETE CASCADE,
  amount        numeric(8,2) NOT NULL CHECK (amount >= 0), -- grams as purchased, or count
  needs_review  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (component_id, eater_id)
);

CREATE TABLE prep_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name          text NOT NULL,                 -- 'Week 1 — American classics'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE prep_template_meals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES prep_templates(id) ON DELETE CASCADE,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  slot          meal_slot NOT NULL,
  core_meal_id  uuid REFERENCES core_meals(id) ON DELETE CASCADE,
  recipe_id     uuid REFERENCES recipes(id) ON DELETE SET NULL,
  servings      numeric(6,2),
  leftover_of_weekday smallint CHECK (leftover_of_weekday BETWEEN 1 AND 7), -- dinner on that weekday
  choices       jsonb NOT NULL DEFAULT '{}',   -- { componentId: coreFoodId }
  flavor        text,
  is_double     boolean NOT NULL DEFAULT false,
  position      integer NOT NULL DEFAULT 0
);

CREATE TABLE prep_template_extras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid NOT NULL REFERENCES prep_templates(id) ON DELETE CASCADE,
  name          text NOT NULL,                 -- 'BBQ sauce'
  for_note      text,                          -- 'Wed pulled chicken'
  aisle         aisle NOT NULL DEFAULT 'condiments',
  price_cents   integer,
  is_pantry     boolean NOT NULL DEFAULT true  -- most extras are 'check you have'
);

CREATE TABLE prep_weeks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  week_start    date NOT NULL,                 -- a Monday
  template_id   uuid REFERENCES prep_templates(id) ON DELETE SET NULL,
  budget_cents  integer NOT NULL,
  guests_on     boolean NOT NULL DEFAULT false,
  restock_buy   uuid[] NOT NULL DEFAULT '{}',  -- core_food ids marked 'Buy this week'
  list_built_at timestamptz,                   -- compare with updated_at for 'Week changed'
  created_by    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, week_start)
);

CREATE TABLE prep_week_meals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_week_id  uuid NOT NULL REFERENCES prep_weeks(id) ON DELETE CASCADE,
  day           date NOT NULL,                 -- within the week (enforced in app)
  slot          meal_slot NOT NULL,
  core_meal_id  uuid REFERENCES core_meals(id) ON DELETE RESTRICT,
  recipe_id     uuid REFERENCES recipes(id) ON DELETE SET NULL,
  servings      numeric(6,2),
  leftover_of   uuid REFERENCES prep_week_meals(id) ON DELETE SET NULL,
  choices       jsonb NOT NULL DEFAULT '{}',
  flavor        text,
  is_double     boolean NOT NULL DEFAULT false,
  position      integer NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(core_meal_id, recipe_id, leftover_of) = 1),
  CHECK (recipe_id IS NULL OR servings > 0),
  CHECK (NOT is_double OR slot = 'dinner')
);
CREATE INDEX prep_week_meals_week_day ON prep_week_meals(prep_week_id, day, slot, position);

CREATE TABLE prep_week_extras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prep_week_id  uuid NOT NULL REFERENCES prep_weeks(id) ON DELETE CASCADE,
  name          text NOT NULL,
  for_note      text,
  aisle         aisle NOT NULL DEFAULT 'condiments',
  price_cents   integer,
  is_pantry     boolean NOT NULL DEFAULT true
);

CREATE TABLE prep_task_checks (
  prep_week_id  uuid NOT NULL REFERENCES prep_weeks(id) ON DELETE CASCADE,
  task_key      text NOT NULL,                 -- §8.7, deterministic
  checked_by    text NOT NULL,
  checked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (prep_week_id, task_key)
);

CREATE TABLE receipt_scans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  image_keys    text[] NOT NULL,
  status        receipt_status NOT NULL DEFAULT 'processing',
  model         text,
  lines         jsonb,                          -- ReceiptLine[] (§10)
  receipt_total_cents integer,
  error         text,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  applied_at    timestamptz
);
```

Create `receipt_scans` before `core_food_prices` in the migration (foreign key order).

### 7.2 Changes to existing tables (additive)

```sql
ALTER TABLE grocery_items ADD COLUMN note text;          -- '3 lb family pack · $11.97 each'
ALTER TABLE grocery_items ADD COLUMN price_cents integer;-- line total
ALTER TABLE grocery_lists ADD COLUMN prep_week_id uuid REFERENCES prep_weeks(id) ON DELETE SET NULL;
```

`saved_list_items` stays as is. Saving a Prep list for reorder drops `note` and `price_cents`, so add both to `saved_list_items` in the same migration and copy them through `saveListAs` and `reorderSavedList`.

### 7.3 Relationships

```
households 1─* prep_eaters, core_foods, core_meals, prep_templates, prep_weeks, receipt_scans
households 1─1 prep_settings
core_meals 1─* core_meal_components *─1 core_foods (default_food_id)
core_meal_components 1─* core_meal_portions *─1 prep_eaters
prep_templates 1─* prep_template_meals, prep_template_extras
prep_weeks 1─* prep_week_meals (self-reference leftover_of), prep_week_extras, prep_task_checks
prep_weeks 1─0..1 grocery_lists (grocery_lists.prep_week_id; latest wins)
core_foods 1─* core_food_prices *─0..1 receipt_scans
```

---

## 8. Calculation logic

All of this is pure TypeScript in `lib/prep/calc.ts`, with unit tests in `lib/prep/calc.test.ts`. Database code loads one `WeekInput` object and passes it in. Nothing here touches the database.

```ts
type Food = { id: string; name: string; unitKind: 'weight' | 'count'; gramsPerCount: number | null;
  per100g: { kcal: number; protein: number; carbs: number; fat: number; fiber: number };
  cookedYield: number; packageAmount: number; packagePriceCents: number; priceIsEstimate: boolean;
  buyMode: 'by_amount' | 'restock'; restockWeeks: number | null; packageLabel: string; displayName: string };
type Eater = { id: string; kind: 'member' | 'guest'; name: string; slots: Slot[]; kcalTarget: number | null; proteinTarget: number | null };
type Component = { id: string; role: Role; swapCategory: Category | null; defaultFoodId: string; prepAs: string | null;
  portions: Record<string /*eaterId*/, number> };
type WeekMeal = { id: string; day: string; slot: Slot; coreMealId: string | null; recipeId: string | null; servings: number | null;
  leftoverOf: string | null; choices: Record<string, string>; flavor: string | null; isDouble: boolean };
type WeekInput = { weekStart: string; foods: Map<string, Food>; meals: Map<string, { name: string; isFlex: boolean; components: Component[] }>;
  eaters: Eater[]; guestsOn: boolean; weekMeals: WeekMeal[]; restockBuy: Set<string>; budgetCents: number;
  extras: { name: string; priceCents: number | null; isPantry: boolean }[]; recipeCosts: Map<string, number> /* per week-meal id, §8.5 */ };
```

### 8.1 Who eats a slot

An eater eats a week meal if they are active, the slot is in their `slots`, and (for guests) `guestsOn` is true. Leftover lunches are eaten by **members only**.

### 8.2 Portions

For a core-meal week meal, each component's food = `choices[component.id] ?? component.defaultFoodId`. Eater amount = `component.portions[eater.id] ?? 0`.

- Grams for nutrition and shopping: weight foods use the amount as is. Count foods use `amount × gramsPerCount`.
- Display on Today: meat and potatoes (`cookedYield ≠ 1`) show `amount × cookedYield`, converted to oz for proteins (round to the nearest ¼ oz) and grams for starches (round to 5 g). Count foods show the count ("3 eggs"). Other foods show cups where a `display_cup_g` is known (seed: liquid egg whites 243 g/cup, yogurt 227 g, berries 140 g, oats 80 g, green vegetables 120 g); otherwise grams.

### 8.3 Nutrition per eater per day

For each day and member, sum over every eaten week meal:

- Core meal: Σ components `grams × per100g / 100`.
- Leftovers: the nutrition of the referenced dinner's portions for that member.
- Recipe: not counted. Mark the day `partial`.
- Flex: not counted. Mark the day `partial`.

`weekAverage(member)` = the mean over days that aren't `partial`. If every day is partial, show "—".

**Worked example: Gabriel, Week 1 Monday.** Seed values (§11), portions as purchased:

| Meal | Food: grams | kcal | Protein |
| --- | --- | --- | --- |
| Breakfast: scramble | 3 eggs (150 g) · whites 180 g · russet 235 g · pepper 40 g · onion 25 g · spinach 20 g | 516 | 44.7 g |
| Lunch: bowl | chicken breast 227 g · sweet potato 294 g · broccoli 175 g | 574 | 61.0 g |
| Snack: yogurt bowl | yogurt 227 g · berries 140 g · oats 20 g | 327 | 28.5 g |
| Snack: shake | whey 30 g | 120 | 24.0 g |
| Dinner: plate (thighs chosen) | thighs 227 g · red potato 294 g · broccoli 180 g · oil 14 g | 675 | 56.0 g |
| **Day** | | **2,212** | **214.2 g** |

The unit test has two cases. As seeded, with thighs for dinner, it expects 2,212.4 kcal ± 1 and 214.2 g ± 0.5. With chicken breast and russets for dinner (673 kcal, 62.4 g), it expects 2,210.1 kcal ± 1 and 220.6 g ± 0.5. Both are about 8% under Gabriel's 2,400 kcal target, so his day shows amber for calories and green for protein. That is correct, not a bug: the fix is a bigger snack or more starch, and the summary sheet points to it.

### 8.4 Shopping need and packages

For each `by_amount` food:

```
need_g = Σ over week meals (core-meal or recipe-matched) of eaters' grams
       + for each double dinner: Σ members' grams again      // tomorrow's leftover lunch
packages = fractional(need / package_g) ≤ 0.05 ? floor(need / package_g) : ceil(need / package_g)
packages = max(packages, need_g > 0 ? 1 : 0)
cost_cents = packages × packagePriceCents
```

`package_g` is `packageAmount` for weight foods and `packageAmount × gramsPerCount` for count foods. When the 5% rule rounds down, the item note says "≈ 2 oz short."

**Worked example: chicken breast, Week 1, Gabriel and Anna only.** Lunch portions are 227 g (Gabriel) and 170 g (Anna):

- Lunch bowls on Mon, Wed, Fri, Sat and Sun: 5 × 397 g = 1,985 g. Tue and Thu lunches are leftovers.
- Wednesday BBQ dinner, double: 2 × 397 g = 794 g.
- Friday honey-mustard dinner: 397 g.
- Need = 3,176 g (7.0 lb). Packages of 1,361 g (3 lb): 3,176 / 1,361 = 2.33, so buy **3 packs**. Cost = 3 × $11.97 = $35.91 (seed estimate).
- **Round-down case:** switch Sunday's lunch to beef and the need drops to 2,779 g (6.13 lb). 2,779 / 1,361 = 2.04, and 0.04 is ≤ 0.05, so buy **2 packs** with the note "≈ 2 oz short" (2,779 − 2,722 = 57 g).

For `restock` foods:

```
weekly_share_cents = round(Σ grams used this week / package_g × packagePriceCents)   // budget only
on list: 'Check you have' unless id ∈ restockBuy → then 1 package at full price on the list
```

### 8.5 Library recipe cost

For a recipe week meal, cost = Σ its scaled ingredients matched to core foods (by `ingredient_id`), priced at the core food's **per-gram** price (no package rounding, since their grams already merge into §8.4). Unmatched ingredients cost $0 and count toward "Y items not priced." Show "≈ $X (partly priced)."

### 8.6 Week totals and status

```
weekCost = Σ by_amount cost + Σ restock weekly shares + Σ priced extras (pantry extras count 0 unless they have price and !isPantry)
```

| Status | Cost vs budget | Avg kcal vs target | Avg protein vs target |
| --- | --- | --- | --- |
| Green | ≤ 100% | within ±7% | ≥ 95% |
| Amber | 100–110% | ±7–15% | 85–95% |
| Red | > 110% | beyond ±15% | < 85% |

The summary bar shows the worst status among its numbers as its accent, with each number's own status beside it.

### 8.7 Tasks for Today

Prep coverage: each prep day (from `prep_weekdays`; 0 = the Sunday before `week_start`) covers the days from the next day until the following prep day. The default coverage is Sunday → Mon–Wed and Wednesday → Thu–Sun. Breakfast potatoes follow the same coverage.

For each prep day P:

1. Collect week meals in P's coverage whose components have `prep_as` set. Leftover lunches are excluded (they come from dinners).
2. Group by `(prep_as, food)`. Task = "Cook {Σ raw lb or g, to ¼ lb} {food}" + per eater "{name}: {count} × {cooked display amount}". For example: "Lunch protein: cook 1¾ lb chicken breast. Gabriel 2 × 6 oz cooked, Anna 2 × 4½ oz cooked." The egg white bites group shows the batch amount: "Egg white bites: 3 cups egg whites + 1 cup peppers and onions, makes 12."
3. `task_key = {P date}:prep:{prep_as}:{food_id}`.

Pack leftovers: for a double dinner on day D: `task_key = {D}:pack:{meal_id}`, with text "Pack tomorrow's lunches: Gabriel {portions}, Anna {portions}."

Thaw: the shopping day is the Sunday before `week_start`. For each dinner on day D ≥ shopping day + 3 with a protein (raw meat category) food, add a task on D−1: "Tonight: move {Σ raw lb} {food} to the fridge for {weekday}." `task_key = {D−1}:thaw:{week_meal_id}`. On the Today screen of the shopping day, a one-time task appears: "Freeze: {list of the proteins needed Wednesday or later}." `task_key = {shopping day}:freeze`.

---

## 9. Server actions, routes and modules

New files (follow the existing patterns in `app/(app)/lists` and `lib/grocery`):

| Module | Responsibility |
| --- | --- |
| `lib/prep/calc.ts` | Pure functions in §8; fully unit-tested |
| `lib/prep/seed.ts` | Seed data (§11) as typed constants + `seedPrep(householdId, members)` |
| `lib/prep/load.ts` | `loadWeekInput(householdId, weekStart)`; `getToday(householdId, date)` |
| `lib/prep/weeks.ts` | Create from template, copy last week, slot upsert, double/leftover logic, save template |
| `lib/prep/list.ts` | `createListFromPrepWeek`, `updateListFromPrepWeek`, reusing `buildList` and the insert pattern in `createList` |
| `lib/prep/receipts.ts` + `lib/import/receipt-ai.ts` | Scan flow and Claude call (§10) |
| `app/(app)/prep/**` | Routes in §5 |
| `components/prep/*` | Summary bar, day card, slot sheet, portion grid, eater line, task list |

Server actions (all call `requireHousehold()` first and validate with Zod):

| Action | Input | Effect | Returns |
| --- | --- | --- | --- |
| `setupPrep()` | — | P-1 seed | `{ ok }` |
| `upsertCoreFood(input)` | food fields | Insert or update; price change writes history | `{ id }` |
| `deleteCoreFood(id)` | id | Soft delete, guarded (P-2) | `{ ok }` or `{ error }` |
| `saveCoreMeal(input)` | meal + components + portions | Replace components and portions in one transaction | `{ id }` |
| `saveEater(input)` | eater fields | Upsert; new eater copies portions (P-3) | `{ id }` |
| `saveSettings(input)` | settings | Update | `{ ok }` |
| `startWeek({ weekStart, from })` | `from`: `{ templateId }` \| `'last'` \| `'blank'` | P-5 | `{ weekId }` |
| `saveSlot(input)` | weekId, day, slot, entry (one of meal/recipe/flex/leftovers), choices, flavor, isDouble, position | P-6; bumps `prep_weeks.updated_at` | `{ meal, totals }` |
| `deleteSlotEntry(id)` | id | Remove; clears leftovers linked to it | `{ totals }` |
| `setWeekOptions(input)` | guestsOn, restockBuy, budgetCents | Update | `{ totals }` |
| `makePrepList(weekId)` | — | P-8; sets `list_built_at` | `{ listId }` |
| `updatePrepList(weekId)` | — | PRD 8.4 rules | `{ listId }` |
| `saveWeekAsTemplate({ weekId, name, overwrite })` | — | P-13 | `{ templateId }` |
| `checkTask({ weekId, taskKey, checked })` | — | Upsert or delete `prep_task_checks` | `{ ok }` |
| `startReceiptScan(formData)` | 1–4 images | §10 | `{ scanId }` |
| `applyReceiptScan({ scanId, lines })` | `[{ lineIndex, coreFoodId, packagePriceCents, packageAmount }]` | P-11 | `{ updated: number }` |

Realtime (Should, M8): add `prepWeekLiveQuery(weekId)` covering `prep_weeks.updated_at` and `prep_task_checks`, plus a seal route `app/api/realtime/prep/route.ts`, mirroring `planLiveQuery`. The polling fallback is 15 s while a Prep screen is open.

---

## 10. Receipt scan (AI)

Reuse `lib/import/claude.ts` (client, timeout, model from `ANTHROPIC_MODEL`) and the image resizing used by imports. Add `lib/import/receipt-ai.ts` with its own prompt and Zod output schema.

```ts
const ReceiptLine = z.object({
  raw_text: z.string(),                       // as printed: 'GV BNLS SKNLS CHKN BRST 3LB'
  quantity: z.number().positive().default(1), // units bought
  size_text: z.string().nullable(),           // '3 lb', '32 oz', '18 ct', null
  size_grams: z.number().positive().nullable(), // converted when the size is a weight
  size_count: z.number().int().positive().nullable(), // for 'ct' items
  unit_price_cents: z.number().int().nonnegative(),   // price for ONE unit
  line_total_cents: z.number().int().nonnegative(),
  core_food_id: z.string().uuid().nullable(), // best match from the provided list, or null
  confidence: z.enum(['high', 'medium', 'low']),
});
const ReceiptOutput = z.object({
  store: z.string().nullable(),
  receipt_total_cents: z.number().int().nullable(),
  lines: z.array(ReceiptLine).max(150),
});
```

**Prompt rules:**

1. Read grocery line items only. Skip tax, fees, tips, bag fees, substitution notes and savings lines, but subtract an item's savings line from its line total.
2. For a weighed item ("2.31 lb @ $1.27/lb"), set `size_grams` to the weighed amount and `unit_price_cents` to the line total.
3. The user message includes this household's core foods as `id | name | walmart_name | package_label`. Match only to these ids, otherwise null. Never invent an id. Server-side, any id not in the list becomes null.
4. Return JSON only, through `zodOutputFormat`.

**Suggested package price on review:** if `size_grams` matches the food's `package_amount` within 10%, the new package price = `unit_price_cents`. If it's a weighed item, the new package price = `round(unit_price_cents / size_grams × package_amount)`, labeled "scaled from price per lb." Otherwise, it shows the "Different size" warning (P-11).

Failures: a timeout or invalid output after one retry sets `status = 'failed'` with the error. Images stay for 7 days.

---

## 11. Seed data

These are the values `seedPrep` inserts. Nutrition is approximate per 100 g as purchased (USDA-style reference values), and every value is editable. **All prices are estimates** (`price_is_estimate = true`, source `seed`) until a receipt or a hand edit replaces them.

### 11.1 Eaters

| Eater | Kind | Slots | kcal | Protein | Color |
| --- | --- | --- | --- | --- | --- |
| Gabriel (member whose display name starts "Gabriel"; else the household creator) | member | all | 2400 | 195 | a |
| Anna (the other member) | member | all | 1700 | 125 | b |
| Mom | guest, inactive | dinner | — | — | neutral |
| Dad | guest, inactive | dinner | — | — | neutral |

Show a one-time banner on Eaters: "Anna's targets are placeholders. Set them when you know her numbers."

### 11.2 Core foods

| Name | Category | Kind (g/count) | kcal | P | C | F | Fib | Yield | Package | Est. price | Buy | Aisle |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chicken breast | protein | weight | 120 | 22.5 | 0 | 2.6 | 0 | 0.75 | 3 lb family pack (1361 g) | $11.97 | amount | meat_seafood |
| Chicken thighs, boneless | protein | weight | 121 | 19.7 | 0 | 4.1 | 0 | 0.75 | 2 lb pack (907 g) | $6.98 | amount | meat_seafood |
| Ground chicken | protein | weight | 143 | 17.4 | 0 | 8.1 | 0 | 0.75 | 1 lb (454 g) | $4.48 | amount | meat_seafood |
| 93% lean ground beef | protein | weight | 152 | 21.0 | 0 | 7.0 | 0 | 0.75 | 1 lb (454 g) | $6.98 | amount | meat_seafood |
| Eggs | dairy_eggs | count (50 g) | 144 | 12.6 | 0.8 | 9.6 | 0 | 1.00 | 18 ct | $3.47 | amount | dairy_eggs |
| Liquid egg whites | dairy_eggs | weight | 52 | 11.0 | 0.7 | 0 | 0 | 1.00 | 32 oz carton (907 g) | $4.48 | amount | dairy_eggs |
| Vanilla protein Greek yogurt, nonfat | dairy_eggs | weight | 80 | 11.0 | 6.0 | 0.5 | 0 | 1.00 | 32 oz tub (907 g) | $5.48 | amount | dairy_eggs |
| Sweet potatoes | starch | weight | 86 | 1.6 | 20.0 | 0.1 | 3.0 | 0.85 | 3 lb bag (1361 g) | $3.47 | amount | produce |
| Russet potatoes | starch | weight | 77 | 2.0 | 17.5 | 0.1 | 2.1 | 0.85 | 10 lb bag (4536 g) | $5.97 | amount | produce |
| Red or gold potatoes | starch | weight | 77 | 2.0 | 17.5 | 0.1 | 2.1 | 0.85 | 3 lb bag (1361 g) | $3.47 | amount | produce |
| Frozen broccoli | vegetable | weight | 28 | 3.0 | 5.0 | 0.1 | 3.0 | 1.00 | 12 oz bag (340 g) | $1.38 | amount | frozen |
| Frozen green beans | vegetable | weight | 31 | 1.8 | 7.0 | 0.2 | 2.7 | 1.00 | 12 oz bag (340 g) | $1.24 | amount | frozen |
| Frozen pepper and onion blend | vegetable | weight | 30 | 1.0 | 7.0 | 0.2 | 1.8 | 1.00 | 12 oz bag (340 g) | $1.38 | amount | frozen |
| Frozen stir-fry vegetables | vegetable | weight | 35 | 2.0 | 7.0 | 0.2 | 2.5 | 1.00 | 12 oz bag (340 g) | $1.48 | amount | frozen |
| Frozen mixed vegetables | vegetable | weight | 64 | 2.9 | 13.0 | 0.5 | 4.0 | 1.00 | 12 oz bag (340 g) | $1.24 | amount | frozen |
| Bell peppers | vegetable | count (150 g) | 26 | 1.0 | 6.0 | 0.3 | 2.1 | 1.00 | 3-pack | $3.47 | amount | produce |
| Yellow onions | vegetable | weight | 40 | 1.1 | 9.3 | 0.1 | 1.7 | 1.00 | 3 lb bag (1361 g) | $2.97 | amount | produce |
| Spinach | vegetable | weight | 23 | 2.9 | 3.6 | 0.4 | 2.2 | 1.00 | 10 oz bag (283 g) | $2.48 | amount | produce |
| Salad mix | vegetable | weight | 17 | 1.2 | 3.3 | 0.2 | 2.1 | 1.00 | 11 oz bag (312 g) | $2.98 | amount | produce |
| Coleslaw mix | vegetable | weight | 25 | 1.3 | 5.8 | 0.1 | 2.5 | 1.00 | 14 oz bag (397 g) | $1.98 | amount | produce |
| Carrots | vegetable | weight | 41 | 0.9 | 9.6 | 0.2 | 2.8 | 1.00 | 1 lb bag (454 g) | $0.98 | amount | produce |
| Zucchini | vegetable | count (200 g) | 17 | 1.2 | 3.1 | 0.3 | 1.0 | 1.00 | each | $0.84 | amount | produce |
| Cucumbers | vegetable | count (300 g) | 15 | 0.7 | 3.6 | 0.1 | 0.5 | 1.00 | each | $0.68 | amount | produce |
| Tomatoes | vegetable | count (120 g) | 18 | 0.9 | 3.9 | 0.2 | 1.2 | 1.00 | each | $0.48 | amount | produce |
| Frozen mixed berries | fruit | weight | 50 | 0.7 | 12.0 | 0.3 | 3.0 | 1.00 | 3 lb bag (1361 g) | $8.47 | amount | frozen |
| Bananas | fruit | count (118 g) | 89 | 1.1 | 22.8 | 0.3 | 2.6 | 1.00 | each | $0.27 | amount | produce |
| Apples | fruit | count (182 g) | 52 | 0.3 | 13.8 | 0.2 | 2.4 | 1.00 | 3 lb bag (~7 ct) | $4.47 | amount | produce |
| Old-fashioned oats | grain | weight | 379 | 13.0 | 68.0 | 6.5 | 10.0 | 1.00 | 42 oz canister (1191 g) | $4.48 | restock (4 wk) | pasta_grains |
| Whey protein | supplement | weight | 400 | 80.0 | 10.0 | 5.0 | 0 | 1.00 | 2 lb tub (907 g) | $29.98 | restock (3 wk) | other |
| Olive oil | fat | weight | 884 | 0 | 0 | 100.0 | 0 | 1.00 | 17 oz bottle (500 g) | $5.97 | restock (8 wk) | condiments |
| Unsweetened cocoa powder | flavor | weight | 228 | 19.6 | 57.9 | 13.7 | 37.0 | 1.00 | 8 oz can (227 g) | $3.48 | restock (8 wk) | spices_baking |
| Beef jerky | snack | weight | 280 | 39.0 | 11.0 | 3.5 | 0 | 1.00 | 2.85 oz bag (81 g) | $5.98 | amount | snacks |

For count foods, the nutrition columns are per 100 g; the app multiplies by `grams_per_count`. Eggs at 50 g each come to 72 kcal and 6.3 g protein per egg.

### 11.3 Core meals and portions

Amounts are **as purchased**. Cooked equivalents are in brackets for reference. G = Gabriel, A = Anna, Guest = Mom/Dad.

| Meal (slot) | Component (role · swap · default · prep as) | G | A | Guest |
| --- | --- | --- | --- | --- |
| Potato hash scramble (breakfast) | other · — · Eggs | 3 | 2 | — |
|  | protein · — · Liquid egg whites | 180 g | 120 g | — |
|  | starch · — · Russet potatoes · breakfast potatoes | 235 g [200 g] | 118 g [100 g] | — |
|  | vegetable · — · Bell peppers | 40 g | 40 g | — |
|  | vegetable · — · Yellow onions | 25 g | 25 g | — |
|  | vegetable · — · Spinach | 20 g | 20 g | — |
| Overnight oats + egg bites (breakfast) | grain · — · Oats | 40 g | 27 g | — |
|  | other · — · Yogurt | 113 g | 113 g | — |
|  | other · — · Whey | 15 g | 15 g | — |
|  | other · — · Berries | 70 g | 70 g | — |
|  | protein · — · Liquid egg whites · egg white bites | 183 g [3 bites] | 122 g [2 bites] | — |
|  | vegetable · — · Bell peppers · egg white bites | 25 g | 17 g | — |
| Lunch bowl (lunch) | protein · protein · Chicken breast · lunch protein | 227 g [6 oz] | 170 g [4½ oz] | — |
|  | starch · starch · Sweet potatoes · lunch starch | 294 g [250 g] | 176 g [150 g] | — |
|  | vegetable · vegetable · Frozen broccoli · lunch vegetable | 175 g | 175 g | — |
| Dinner plate (dinner) | protein · protein · Chicken breast | 227 g [6 oz] | 170 g [4½ oz] | 227 g |
|  | starch · starch · Russet potatoes | 294 g [250 g] | 176 g [150 g] | 294 g |
|  | vegetable · vegetable · Frozen broccoli | 180 g | 180 g | 180 g |
|  | fat · — · Olive oil | 14 g | 5 g | 14 g |
| Yogurt berry bowl (snack) | other · — · Yogurt | 227 g | 170 g | — |
|  | fruit · — · Berries | 140 g | 70 g | — |
|  | grain · — · Oats | 20 g | 10 g | — |
| Whey shake (snack) | supplement · — · Whey | 30 g | 30 g | — |
| Shake + banana (snack) | supplement · — · Whey | 30 g | 30 g | — |
|  | fruit · — · Bananas | 1 | 0.5 | — |
| Egg white bites (snack) | protein · — · Liquid egg whites · egg white bites | 305 g [5 bites] | 183 g [3 bites] | — |
|  | vegetable · — · Bell peppers · egg white bites | 42 g | 25 g | — |
| Jerky + apple (snack) | protein · — · Beef jerky | 28 g | 28 g | — |
|  | fruit · — · Apples | 1 | 1 | — |
| Chocolate protein pudding (snack) | other · — · Yogurt | 227 g | 170 g | — |
|  | supplement · — · Whey | 30 g | 15 g | — |
|  | flavor · — · Cocoa | 5 g | 2 g | — |
| Leftovers or a meal out (dinner, flex) | — | — | — | — |

Flavor ideas (seed `flavor_ideas`): Lunch bowl: lemon-pepper, taco, Greek, Korean-style, buffalo, honey-garlic, garlic-herb, chipotle. Dinner plate: garlic-herb, taco, BBQ, burger, honey mustard, fajita, Cajun, teriyaki, Italian, shawarma.

### 11.4 Templates (the 4-week rotation)

Every template has the same daily base:

- Breakfast: Potato hash scramble on Mon–Sun.
- Snack: Yogurt berry bowl + Whey shake on Mon–Sun.
- Lunch: Lunch bowl on Mon, Wed, Fri and Sat. Tue = leftovers of Mon dinner; Thu = leftovers of Wed dinner. Sun lunch is a Lunch bowl with no prep-as (cooked fresh or from leftovers; the user can change it).
- Dinner: Mon and Wed are double, Sat is flex, and the rest are as in the table.

Dinner plates name their choices (protein · starch · veg) and flavor:

| Template | Mon (double) | Tue | Wed (double) | Thu | Fri | Sun | Lunch flavors (Mon/Wed bowl · Fri/Sat bowl) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Week 1 — American classics | Thighs · red/gold potatoes · broccoli · garlic-herb | 93% beef · sweet potatoes · pepper & onion blend · taco | Breast · sweet potatoes · green beans · BBQ | 93% beef · russets · salad mix · burger | Breast · red/gold potatoes · carrots · honey mustard | Breakfast for dinner: Potato hash scramble (G, A) + 93% beef 113 g G / 85 g A as "other" via a template extra note | lemon-pepper · taco |
| Week 2 — Around the world | Breast · red/gold · pepper & onion blend · fajita | 93% beef · red/gold · broccoli · Korean-style | Thighs · sweet potatoes · green beans · Cajun | Ground chicken · red/gold · salad mix · Greek | Thighs · sweet potatoes · stir-fry vegetables · teriyaki | Same as Week 1 | Greek · Korean-style |
| Week 3 — Comfort food | 93% beef · sweet potatoes · mixed vegetables · shepherd's pie | 93% beef · russets · pepper & onion blend · chili (+ beans, tomatoes as extras) | Breast · red/gold · salad mix · chicken parm (+ marinara, mozzarella as extras) | Breast · russets · broccoli · loaded potato bar | Breast · russets · pepper & onion blend · cheesesteak (+ provolone as an extra) | Flex: "Chili from the freezer" | buffalo · honey-garlic |
| Week 4 — Sheet pan & skillet | Breast · red/gold · green beans · lemon-pepper | 93% beef · russets · pepper & onion blend · hash skillet | Breast · sweet potatoes · carrots · buffalo | 93% beef · red/gold · zucchini · Italian meatballs (+ marinara as an extra) | Thighs · red/gold · cucumbers · shawarma | Same as Week 1 | garlic-herb · chipotle |

Sunday "breakfast for dinner" is a seeded core meal, **Breakfast for dinner** (dinner slot): the scramble's components plus a protein component (93% beef, G 113 g, A 85 g, guest 113 g).

Template extras (pantry, with estimate prices):

| Template | Extras |
| --- | --- |
| Week 1 | Salsa ($2.48), BBQ sauce ($1.98), Dijon mustard ($1.48), honey ($3.98), ketchup ($1.98), dill pickles ($2.48), apple cider vinegar ($2.48), taco seasoning ($0.98), lemon pepper ($1.48) |
| Week 2 | Fajita seasoning ($0.98), soy sauce ($1.98), fresh ginger ($0.50), Cajun seasoning ($1.48), Greek seasoning ($1.48), light teriyaki sauce ($2.48), lemons ×2 ($1.20, not pantry) |
| Week 3 | Kidney beans 2 cans ($1.80, not pantry), diced tomatoes 2 cans ($1.80, not pantry), chili seasoning ($0.98), marinara ($1.98, not pantry), part-skim mozzarella 8 oz ($2.48, not pantry), provolone slices ($2.98, not pantry), buffalo sauce ($2.48) |
| Week 4 | Marinara ($1.98, not pantry), celery ($1.78, not pantry), lemons ×2 ($1.20, not pantry), buffalo sauce ($2.48), Italian seasoning ($1.48), chipotle powder ($1.98) |

Guest add-ons (rolls, tortillas, rice, cornbread mix, etc.) are not seeded as extras. With guests on, the week shows a tip: "Parents' sides: add them on the list."

### 11.5 Settings

Budget $175 a week, prep days `{0,3}`, double weekdays `{1,3}`, guests off, rotation = Weeks 1–4 in order.

---

## 12. Non-functional requirements

- **Speed:** opening the week builder or Today renders in under 1 s server time for one week (about 60 meals, 40 foods). `saveSlot` round trip is under 500 ms; totals come back with the save.
- **Correctness:** `calc.ts` is the only place nutrition, cost, packages and tasks are computed. The UI never recomputes them.
- **Money:** integers in cents everywhere; format with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
- **Units:** grams internally. Show lb, oz and cups only through `lib/prep/format.ts`, with tests.
- **Mobile:** 390 px first. The summary bar sits above the tab bar and stays visible on scroll. Tap targets are at least 44 px. Follows system light and dark.
- **Security:** household scoping on every read and write (PRD 3). Receipt images are private, and keys are never sent to the client. The AI output is validated and core food ids are checked against the household.
- **Accessibility:** status colors always come with text. Portion lines are readable by screen readers as "Gabriel, 6 ounces cooked chicken breast."

---

## 13. Testing

| Layer | What |
| --- | --- |
| Unit (Vitest), `lib/prep/calc.test.ts` | §8.3 worked examples (2,212.4 kcal / 214.2 g; 2,210.1 kcal / 220.6 g); §8.4 chicken examples (3 packs; 2 packs with "≈ 2 oz short"); the 5% rounding rule at 0.04, 0.05 and 0.06; count foods; restock weekly share; double → leftovers counted for members only, with guests on; flex and recipe days marked partial and excluded from averages; status thresholds at each boundary; task coverage for prep days {0,3} and {0,4}; thaw tasks only for dinners ≥ shopping day + 3; deterministic `task_key`s |
| Unit, `lib/prep/format.test.ts` | g → lb/oz (¼ lb, ¼ oz), cups by `display_cup_g`, cooked display |
| Unit, `lib/import/receipt-ai.test.ts` | Parsing fixtures: weighed item, multi-quantity line, savings line subtracted, unknown id dropped |
| DB (`TEST_DATABASE_URL`), `lib/prep/prep.db.test.ts` | Seed is idempotent; start week from template rebuilds leftover links; Double toggling; make list → item names, package counts, prices, pantry group; update list keeps checks; delete guards |
| Browser (existing suite style) | Set up Prep → Week 1 → totals green for Gabriel → Make list → list shows "Chicken breast — 3 lb family pack × 3" → Today shows Sunday prep tasks → check one on phone A and see it on phone B |

---

## 14. Definition of Done (each story)

- [ ] Acceptance criteria met on a Vercel preview with its own Neon branch.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass; new pure logic has unit tests; DB tests pass with `TEST_DATABASE_URL`.
- [ ] Migration is additive; `npm run db:migrate` was run on production **before** merging (README → Migrations and deploys).
- [ ] CHANGELOG entry in the existing format (For you · Database · Vercel · Code · Tested).
- [ ] Works at 390 px in light and dark; no console errors; tap targets ≥ 44 px.
- [ ] Every Prep read and write is household-scoped; Zod on every action input and on the AI output.
- [ ] Gabriel has checked it on his phone.

---

## 15. Milestones

| Milestone | Stories | Points | Done when |
| --- | --- | --- | --- |
| **M7 · Prep core** | P-1, P-2, P-3, P-4, P-5, P-6, P-7, P-8, P-10 | 41 | Week 1 can be planned with live totals and turned into a priced Walmart-ready list |
| **M8 · Today and rotation** | P-9, P-12, P-13, Prep live sync | 14 | Today guides Sunday prep and the week; Anna can drop a library recipe into the week; templates rotate |
| **M9 · Receipt prices** | P-11 | 8 | A real Walmart receipt updates prices, and the estimate badges go away |

Within M7, build in this order: schema + migration → `calc.ts` with tests → seed → Menu (read-only first) → week builder → list. The calc tests are the contract for everything after them.

**Risks.**

| Risk | Mitigation |
| --- | --- |
| Seed prices are guesses and make the budget look wrong | Estimate badges everywhere; M9 receipt scan; manual edit in M7 |
| Walmart item sizes change (3 lb vs 2.5 lb packs) | Package fields per food; the size-mismatch warning on scan |
| Tab bar with 5 tabs gets crowded at 390 px | Labels stay one word; icons 22 px; test on iPhone SE width (375 px) |
| Raw vs cooked confusion | Store raw only; show cooked on Today, raw on lists and tasks, always labeled |

---

## 16. Open questions (defaults in place)

| Question | Default until answered |
| --- | --- |
| Anna's real calorie and protein targets | 1,700 kcal / 125 g, with a banner to edit |
| Weekly budget | $175, editable in Settings |
| Do guests eat lunches or snacks ever? | Dinner only; editable per guest |
| Should Saturday flex nights count toward calories? | Not counted; flagged on the day |
| Should the grocery list split "for Mom & Dad" items? | No; parents' sides are added by hand |

---

## 17. Future

- USDA FoodData Central lookup for `core_foods` and recipe `ingredients.nutrients`, so library recipes count toward nutrition.
- An "Ate it" check per person per meal, feeding the kettlebell tracker's daily numbers.
- Anna's training plan in the app alongside her targets.
- Walmart cart automation if Walmart opens a consumer cart API, or a share-a-cart integration.
- Cost trends: weekly actual vs estimated over time, from receipts.
