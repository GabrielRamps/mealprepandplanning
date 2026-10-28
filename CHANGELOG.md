# Changelog

What changed, newest first. Database changes say when they reached production;
the Vercel build doesn't run migrations (see README → Migrations and deploys).

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
