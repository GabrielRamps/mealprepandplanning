# Household Meal Planner — PRD v1

Oct 26, 2026 · Gabriel Henley

## 1. Overview

Build a private web app for one household (Gabriel and his wife) that turns saved recipes into a weekly meal plan and a ready-to-shop grocery list. The goal for tonight is a working v1 deployed to Vercel and installed on both iPhones.

**Problem.** Recipes live in scattered Instagram saves, TikToks, screenshots, websites and cookbooks. Planning the week and writing a grocery list from them is slow and annoying, so it doesn't happen.

**Users.** Two people, both signed in, sharing one household. They see the same recipes, plans and lists. No other users, no public sign-up flow beyond these two.

**v1 must let them:**

1. Import a recipe from an Instagram or TikTok post (caption and video read together), a recipe website, a screenshot, or a photo of a recipe card or cookbook page, then edit it before saving.
2. Add a recipe by hand, with a photo.
3. Keep a library: search, tag, rate (each person), favorite, mark "didn't like it" with a reason, archive, delete.
4. Plan a week (breakfast, lunch, dinner, snack per day) and send it to the other person to approve or change.
5. Pick recipes and servings, then get one merged grocery list grouped by aisle that both phones can check off together, and print.

**Success for tonight:** both of you can sign in on your phones, import a real Instagram recipe through the share button, put three recipes on this week's plan, approve it, and shop from the generated list.

## 2. Scope

Tonight ships the Must-haves. Should-haves go in only if time remains. Later items are designed for, not built.

| Priority | Feature |
| --- | --- |
| Must | Email and password sign-in for two accounts; one shared household with an invite code |
| Must | Manual recipe entry with photo |
| Must | Import: paste a link (Instagram, TikTok, website) or upload 1–6 images |
| Must | Import edit screen: change, add or remove ingredients and steps before approving |
| Must | Recipe library with search, tags, per-person rating, favorite, "didn't like it," archive, delete |
| Must | Servings scaler on every recipe |
| Must | Weekly plan with send, approve and request-changes |
| Must | Grocery list from a plan or hand-picked recipes: scaled, merged, grouped by aisle, check-off, manual items, print |
| Must | iPhone Shortcut endpoint with personal import tokens |
| Should | Live sync of grocery check-offs via Neon Realtime (polling every 5 seconds is the Must fallback) |
| Should | Pantry staples section on lists; editable aisle per ingredient |
| Should | In-app notification badge when a plan is waiting for approval |
| Later | Macros (calories, protein, carbs, fat) via USDA FoodData Central |
| Later | Web push notifications, Google sign-in, native Expo app, Neon Functions for imports |
| Out | Pinned-comment import, public sharing, multiple households per user, Instacart ordering, AI-generated meal plans |

For macros later: keep `ingredients.usda_fdc_id` and `ingredients.nutrients` columns nullable now so no migration is needed.

## 3. Tech stack and conventions

One Next.js app on Vercel, with Neon for the database, logins, file storage and live sync. Use exactly these unless a step is blocked; if blocked, note the swap in the README.

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16, App Router, TypeScript (strict) | Server Actions for mutations; Route Handlers for `/api/*` |
| UI | Tailwind CSS + shadcn/ui | Mobile-first at 390 px wide; follows system light/dark |
| PWA | Web app manifest, icons, `display: standalone` | Installable to the iPhone home screen from Safari |
| Database | Neon Postgres (project "Meal Prep & Planning," AWS US East 2) | Drizzle ORM + `@neondatabase/serverless`; migrations with drizzle-kit |
| Auth | [Neon Auth](https://neon.com/docs/auth/quick-start/nextjs.md) (managed Better Auth), `@neondatabase/auth` | Email and password for v1; `proxy.ts` protects every route except `/auth/*`, `/api/auth/*` and `/api/import` |
| File storage | Neon Object Storage, S3-compatible, via `@aws-sdk/client-s3` | Buckets: `recipe-photos` (public read) and `imports` (private) |
| Live sync | [Neon Realtime](https://neon.com/docs/realtime/overview) live queries (beta) | Fallback: poll every 5 seconds while a list or plan is open |
| Social post reading | Google Gemini via `@google/genai`; model from `GEMINI_MODEL` (default `gemini-3.5-flash`) | Video + caption in one request; JSON output |
| Website and image reading | Anthropic via `@anthropic-ai/sdk`; model from `ANTHROPIC_MODEL` (default `claude-haiku-5-5`) | Text and image input; JSON output |
| Video download | Apify via `apify-client` | `truefetch/instagram-post`, `maximedupre/tiktok-video-downloader` |
| Validation | Zod | Every form, API body and AI response |
| Images | `sharp` on the server | Store covers as WebP, max 1200 px wide |
| Hosting | Vercel Hobby | Functions get [300 s max duration and a 4.5 MB request body limit](https://vercel.com/docs/functions/limitations) |

Conventions:

- Every database read and write is scoped to the signed-in user's `household_id`. Never trust a household id sent from the client.
- IDs are UUIDs (`gen_random_uuid()`); timestamps are `timestamptz`; dates (plan days) are `date` in ISO 8601 (`2026-10-26`).
- Client resizes photos to max 1600 px JPEG at quality 0.8 before upload, keeping requests under 4.5 MB.
- No Python services. Website parsing and ingredient parsing happen in TypeScript and through the AI output format in section 7.
- Keep secrets server-side only; nothing AI- or storage-related runs in the browser.

## 4. User stories and acceptance criteria

Twenty-one stories in six areas. "Partner" means the other member of the household.

### A. Accounts and household

**A1. Sign up and sign in.** As a user, I want to sign in with email and password, so that my data is private and saved.

- [ ] Given no session, when I open any page except `/auth/*`, then I'm redirected to `/auth/sign-in`.
- [ ] Sessions persist across app restarts on iPhone home-screen installs.
- [ ] Password minimum 8 characters; errors show inline.

**A2. Create or join a household.** As a new user, I want to create a household or join one with a code, so that we share one library.

- [ ] Given I have no household, when I sign in, then I see `/onboarding` with "Create household" and "Join with code."
- [ ] Creating one generates a 6-character uppercase invite code (A–Z, 2–9, no 0/O/1/I), valid 7 days.
- [ ] Joining with a valid code adds me as a member; invalid or expired codes show an error.
- [ ] A user belongs to exactly one household; a household has at most 6 members.

### B. Recipe library

**B1. Add a recipe by hand.** As a user, I want to type in a recipe with a photo, so that family and cookbook recipes live here too.

- [ ] Fields: title (required, 1–200 chars), description, servings (required, 1–50), prep and cook minutes, ingredients, steps, tags, notes, source URL, cover photo.
- [ ] Ingredient rows have quantity, unit (from the unit list in section 8), name, prep note, optional flag, and a section label (e.g., "Sauce").
- [ ] Rows and steps can be added, removed and reordered.

**B2. Browse and search.** As a user, I want to search and filter the library, so that I can find a meal fast.

- [ ] Search matches title, tags and ingredient names (case-insensitive).
- [ ] Filters: tag, favorites (mine), rating ≥ N (mine or partner's), source type, status (active by default; "didn't like" and archived are opt-in).
- [ ] Sort: newest, title A–Z, highest rated, most recently planned.

**B3. Recipe detail and servings scaler.** As a user, I want to change servings and see amounts update, so that I can cook for any number.

- [ ] Changing servings rescales every quantity using the rules in section 8; display uses friendly fractions (¼, ⅓, ½, ⅔, ¾).
- [ ] Shows source link and creator, each member's rating, and tags.

**B4. Rate and favorite.** As a user, I want my own 1–5 star rating and favorite, so that we each track what we like.

- [ ] Ratings and favorites are per user; both members' ratings show on the recipe.

**B5. Didn't like it, archive, delete.** As a user, I want to mark a recipe "didn't like it" with a reason, so that we remember not to make it again.

- [ ] "Didn't like it" requires a reason (1–500 chars), hides the recipe from the planner picker and default library view, and keeps it searchable under the status filter.
- [ ] Archive hides without judgment; delete is a soft delete (`deleted_at`), with a confirm step.

**B6. Tags.** As a user, I want to tag recipes (e.g., Dinner, Chicken, Quick), so that I can filter.

- [ ] Tags are household-wide, created inline, case-insensitive unique.

### C. Import and review

**C1. Import from a link.** As a user, I want to paste an Instagram, TikTok or recipe website link, so that the recipe is pulled out for me.

- [ ] Given a supported link, when I submit, then an import job is created and I see its status (Fetching → Reading → Ready to review) without waiting on the page.
- [ ] Instagram and TikTok imports always read both the caption and the video (section 7).

**C2. Import from images.** As a user, I want to upload or take 1–6 photos (screenshot, recipe card, cookbook page), so that any recipe can come in.

- [ ] Accepts JPEG, PNG, HEIC (converted), WebP; images are resized client-side first.
- [ ] All images in one import are read together as one recipe.

**C3. Edit before approving.** As a user, I want to edit the draft before it's saved, so that mistakes don't enter the library.

- [ ] Draft opens in the same editor as B1, prefilled.
- [ ] Conflicts between caption and video show inline with both values and a choice.
- [ ] "Approve" creates the recipe; "Discard" deletes the draft; nothing reaches the library without Approve.
- [ ] If no recipe was found, the screen says so and offers "Add photos" or "Type it in."

**C4. Import history.** As a user, I want to see recent imports and retry failed ones, so that nothing gets lost.

- [ ] List shows the last 30 imports with status; failed ones show the error and a Retry button.

### D. Weekly plan and approval

**D1. Plan a week.** As a user, I want to place recipes on days and meals, so that we know what we're eating.

- [ ] Week starts Monday; slots: breakfast, lunch, dinner, snack; multiple recipes per slot allowed.
- [ ] Each entry has servings (defaults to the recipe's servings) and an optional note.
- [ ] Picker excludes "didn't like" and archived recipes.
- [ ] Navigate to previous and next weeks; copy last week's plan into this week.

**D2. Send for approval.** As a user, I want to send the plan to my partner, so that we agree before shopping.

- [ ] Status moves Draft → Waiting for approval; partner sees a badge on the Plan tab.
- [ ] While waiting, only the partner can edit entries.

**D3. Approve or request changes.** As the partner, I want to approve or send it back with a note, so that we settle the week.

- [ ] Approve → status Approved; Request changes requires a note and returns status to Draft with the note visible to the sender.
- [ ] Editing an Approved plan returns it to Draft.

### E. Grocery list

**E1. Make a list.** As a user, I want a list from an approved week or from recipes I pick with servings, so that shopping is one tap.

- [ ] "Make grocery list" on a plan uses every entry's recipe and servings; "New list" lets me pick recipes and servings by hand.
- [ ] Items are merged and grouped per section 8.

**E2. Shop together.** As a user, I want check-offs to appear on both phones, so that we can split up in the store.

- [ ] Check-offs from one phone appear on the other within 5 seconds.
- [ ] Checked items move to the bottom of their aisle group, struck through.

**E3. Edit the list.** As a user, I want to add, edit and delete items and see which recipes need an item, so that the list matches reality.

- [ ] Manual items have name, optional quantity/unit, aisle.
- [ ] Tapping an item shows each source recipe and its amount.

**E4. Print.** As a user, I want a clean printable list, so that paper works too.

- [ ] `/lists/[id]/print` renders aisle groups in two columns, no navigation, checkboxes as empty squares.

### F. Settings

**F1. Import tokens for the Shortcut.** As a user, I want a personal import token, so that the iPhone Shortcut can send recipes.

- [ ] Create a named token; the full token shows once; only a hash is stored; tokens can be revoked.

**F2. Household settings.** As a user, I want to see members, the invite code, and manage aisles and pantry staples, so that the app fits our store.

- [ ] Regenerate the invite code; reorder aisles; mark ingredients as pantry staples.

## 5. Screens and navigation

A bottom tab bar with four tabs: **Recipes, Plan, Lists, Import**. Settings sits behind an icon in the Recipes header.

| Route | Screen | Key contents |
| --- | --- | --- |
| `/auth/sign-in`, `/auth/sign-up` | Sign in / sign up | Email, password |
| `/onboarding` | Create or join household | Name field or 6-character code |
| `/recipes` | Library | Search bar, filter chips, sort, 2-column card grid (photo, title, total time, both ratings, favorite heart) |
| `/recipes/new` | New recipe | Recipe editor (shared component) |
| `/recipes/[id]` | Recipe detail | Cover, servings stepper, ingredients by section, steps, source link, ratings, favorite, tags, actions menu (edit, add to plan, add to list, didn't like, archive, delete) |
| `/recipes/[id]/edit` | Edit recipe | Recipe editor |
| `/plan` and `/plan/[weekStart]` | Week plan | Status banner, 7 day cards with 4 meal slots, add-recipe sheet, Send / Approve / Request changes, Make grocery list |
| `/lists` | Lists | Active lists first, then completed; New list button |
| `/lists/new` | New list | Recipe picker with servings per recipe |
| `/lists/[id]` | Shopping view | Aisle groups, big tap targets, checked items sink, add item field, pantry section, print link |
| `/lists/[id]/print` | Print view | Two columns, no chrome |
| `/import` | Import | Paste-link field, Add photos (camera + library), recent imports with status |
| `/import/[jobId]` | Review | Status while processing; when ready, the recipe editor prefilled plus conflict callouts; Approve / Discard |
| `/settings` | Settings | Members, invite code, import tokens, aisle order, pantry staples, Shortcut setup instructions |

The recipe editor is one shared component used by New, Edit and Review, so every path into the library has the same fields and validation.

UI rules: tap targets at least 44 px; the shopping view keeps the screen awake while open (Screen Wake Lock API where supported); every destructive action asks for confirmation.

## 6. Data model

Fifteen tables in the `public` schema, written as Drizzle schema from this SQL. Users come from Neon Auth (`neon_auth` schema); store their id as `text` with no foreign key.

```sql
create type recipe_source as enum ('manual','instagram','tiktok','website','image','text');
create type recipe_status as enum ('active','disliked','archived');
create type meal_slot     as enum ('breakfast','lunch','dinner','snack');
create type plan_status   as enum ('draft','pending_approval','approved');
create type import_status as enum ('queued','fetching','reading','ready','failed','approved','discarded');
create type aisle as enum ('produce','meat_seafood','dairy_eggs','bakery','deli','pantry','canned_jarred',
  'pasta_grains','spices_baking','condiments','frozen','beverages','snacks','household','other');

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text unique,
  invite_expires_at timestamptz,
  aisle_order aisle[] not null default '{produce,meat_seafood,deli,bakery,dairy_eggs,frozen,pasta_grains,canned_jarred,condiments,spices_baking,pantry,snacks,beverages,household,other}',
  created_at timestamptz not null default now()
);

create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id text not null unique,            -- one household per user
  display_name text not null,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table ingredients (                 -- one canonical record per food, per household
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,                      -- lowercase, singular: 'yellow onion'
  aisle aisle not null default 'other',
  is_pantry_staple boolean not null default false,
  usda_fdc_id integer,                     -- later: macros
  nutrients jsonb,                         -- later: macros
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  source_type recipe_source not null default 'manual',
  source_url text,
  creator_name text,
  creator_handle text,
  cover_image_key text,                    -- key in bucket recipe-photos
  servings integer not null check (servings between 1 and 50),
  prep_minutes integer check (prep_minutes >= 0),
  cook_minutes integer check (cook_minutes >= 0),
  steps jsonb not null default '[]',       -- [{"section": "Sauce" | null, "text": "..."}]
  notes text,
  status recipe_status not null default 'active',
  disliked_reason text,
  disliked_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status <> 'disliked' or disliked_reason is not null)
);
create index on recipes (household_id, status) where deleted_at is null;

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  position integer not null,
  section text,                            -- 'Sauce', 'Marinade', or null
  raw_text text not null,                  -- '2 cloves garlic, minced'
  quantity numeric(10,3),                  -- null for 'salt to taste'
  quantity_max numeric(10,3),              -- for ranges '2-3'
  unit text,                               -- canonical unit code from section 8, or null for counts
  name text not null,                      -- 'garlic'
  prep_note text,                          -- 'minced'
  is_optional boolean not null default false,
  ingredient_id uuid references ingredients(id) on delete set null
);
create index on recipe_ingredients (recipe_id, position);

create table recipe_user_prefs (
  recipe_id uuid not null references recipes(id) on delete cascade,
  user_id text not null,
  rating smallint check (rating between 1 and 5),
  is_favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40)
);
create unique index on tags (household_id, lower(name));

create table recipe_tags (
  recipe_id uuid not null references recipes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);

create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),   -- Mondays only
  status plan_status not null default 'draft',
  sent_by text, sent_at timestamptz,
  reviewed_by text, reviewed_at timestamptz,
  change_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, week_start)
);

create table meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references meal_plans(id) on delete cascade,
  day date not null,                       -- must fall within the plan's week (enforced in app)
  slot meal_slot not null,
  recipe_id uuid not null references recipes(id),
  servings numeric(6,2) not null check (servings > 0),
  note text,
  position integer not null default 0
);
create index on meal_plan_entries (plan_id, day, slot);

create table grocery_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,                      -- 'Week of Oct 26'
  meal_plan_id uuid references meal_plans(id) on delete set null,
  status text not null default 'active' check (status in ('active','completed')),
  created_by text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table grocery_list_recipes (           -- what the list was built from
  list_id uuid not null references grocery_lists(id) on delete cascade,
  recipe_id uuid not null references recipes(id),
  servings numeric(6,2) not null check (servings > 0),
  primary key (list_id, recipe_id)
);

create table grocery_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references grocery_lists(id) on delete cascade,
  ingredient_id uuid references ingredients(id) on delete set null,
  merge_key text,                          -- see section 8; null for manual items
  name text not null,
  quantity numeric(10,3),
  unit text,
  aisle aisle not null default 'other',
  is_pantry boolean not null default false,
  is_manual boolean not null default false,
  sources jsonb not null default '[]',     -- [{recipe_id, recipe_title, quantity, unit, raw_text}]
  is_checked boolean not null default false,
  checked_by text, checked_at timestamptz,
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index on grocery_items (list_id);

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  created_by text not null,
  source_type recipe_source not null,
  source_url text,
  image_keys text[] not null default '{}', -- keys in bucket imports
  status import_status not null default 'queued',
  caption_text text,
  thumbnail_url text,
  video_key text,                          -- deleted after reading
  model text,
  draft jsonb,                             -- RecipeDraft, section 7
  error text,
  attempts integer not null default 0,
  recipe_id uuid references recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on import_jobs (household_id, created_at desc);

create table import_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id text not null,
  name text not null,                      -- "Gabriel's iPhone"
  token_hash text not null unique,         -- sha256 hex of the full token
  token_prefix text not null,              -- first 8 chars, for display
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

Rules the code must enforce:

- A recipe used by any plan entry or list can't be hard-deleted; deleting sets `deleted_at` and it disappears from the library, but old plans still show its title.
- When a recipe ingredient is saved, find or create its `ingredients` row by lowercase singular name and set `ingredient_id`; new ingredients get an aisle from the AI guess (section 7) or `other`.
- Seed nothing except the household on onboarding; tags and ingredients are created as used.

## 7. Import pipeline

Every import becomes an `import_jobs` row, processes in the background, and ends as a draft the user edits and approves. Social posts always send both the caption and the video to Gemini; everything else goes to Claude.

### 7.1 Flow

1. `POST /api/import` validates input, creates the job (`queued`), returns `202 { jobId }` immediately, then processes it with Next.js `after()`. The route sets `export const maxDuration = 300`.
2. The client polls `GET /api/import/[id]` every 2 seconds until status is `ready`, `failed` or `approved`.
3. Processing sets `fetching`, then `reading`, then `ready` (draft saved) or `failed` (error saved).
4. On the review screen, Approve validates the edited draft, creates the recipe, sets `approved` and `recipe_id`, and deletes the job's files from the `imports` bucket.

### 7.2 Source detection

| Source | URL pattern | Notes |
| --- | --- | --- |
| Instagram | `instagram.com/(p\|reel\|reels\|tv)/{code}` | Strip query strings |
| TikTok | `tiktok.com/@{user}/video/{id}`, `vm.tiktok.com/*`, `vt.tiktok.com/*` | Follow redirects on short links first |
| Website | Any other `http(s)` URL |  |
| Images | Multipart upload, 1–6 files | Stored in `imports` bucket |
| Text | JSON `{ text }`, up to 20,000 chars | From the Shortcut or a paste box |

### 7.3 Per source

**TikTok**

1. Caption, creator and thumbnail: `GET https://www.tiktok.com/oembed?url={url}` (no key). Caption is the `title` field.
2. Video: run the Apify actor in `APIFY_TIKTOK_ACTOR` (default [`maximedupre/tiktok-video-downloader`](https://apify.com/maximedupre/tiktok-video-downloader)); it returns a short-lived `mediaUrl`. Download immediately.

**Instagram**

1. Caption, creator, thumbnail and video URL: run the Apify actor in `APIFY_INSTAGRAM_ACTOR` (default `apify/instagram-scraper` with the post URL as a direct URL).
2. If Apify fails, call Meta's tokenless oEmbed, `GET https://graph.facebook.com/v25.0/instagram_oembed?url={url}`, for the author and embed HTML, and pull caption text from the HTML if present.

Before coding either actor, open its Apify page and match the current input and output field names; record them in `lib/import/apify.ts`.

**Then, for both social sources:** upload the video to the Gemini Files API (Gemini doesn't read arbitrary public video links), wait until the file is `ACTIVE`, call `generateContent` with the video plus the caption text and the prompt in 7.5, requesting JSON that matches `RecipeDraft`. Delete the Gemini file afterwards. Don't keep the video in storage.

- Video download fails: continue with caption only, and add a draft note: "Couldn't read the video; check amounts."
- No caption and no video: `failed` with "Couldn't reach this post. Try a screenshot instead."

**Website**

1. Fetch HTML server-side with a browser user agent, 15-second timeout, 5 MB cap.
2. Parse every `<script type="application/ld+json">`; find the object whose `@type` is or includes `Recipe` (search arrays and `@graph`).
3. Send that JSON-LD to Claude to normalize into `RecipeDraft`. With no JSON-LD, send the page's visible text (scripts, nav and footer removed, max 30,000 chars).
4. Use the JSON-LD `image` as the cover candidate.

**Images and text**

- Send all images (base64 JPEG) or the text to Claude in one message with the 7.5 prompt.
- No automatic cover for image imports; on review the user may pick one of the uploaded images as the cover.

### 7.4 RecipeDraft (AI output and editor input)

One Zod schema used for Gemini's `responseSchema`, Claude's output, the review editor, and Approve.

```json
{
  "no_recipe_found": false,
  "title": "Crispy Garlic Parmesan Chicken",
  "description": "Weeknight sheet-pan chicken.",
  "servings": 4,
  "prep_minutes": 10,
  "cook_minutes": 25,
  "ingredients": [
    {
      "section": null,
      "raw_text": "1 1/2 lb chicken thighs, boneless",
      "quantity": 1.5,
      "quantity_max": null,
      "unit": "lb",
      "name": "chicken thigh",
      "prep_note": "boneless",
      "is_optional": false,
      "aisle": "meat_seafood"
    }
  ],
  "steps": [{ "section": null, "text": "Heat oven to 425°F." }],
  "tags": ["Dinner", "Chicken"],
  "creator_name": "Jane Cooks",
  "creator_handle": "@janecooks",
  "conflicts": [
    { "field": "parmesan quantity", "caption_value": "1/2 cup", "video_value": "1 cup", "chosen": "video" }
  ],
  "confidence": "high",
  "notes": null
}
```

Field rules: `unit` is one of the unit codes in section 8 or null for counts ("2 eggs"); `name` is lowercase, singular, without prep words; `aisle` is one of the `aisle` enum values; `tags` has at most 5 items; `confidence` is `high`, `medium` or `low`.

### 7.5 Prompt rules (both models)

- Extract only what the source states. Never invent ingredients, amounts or steps.
- Unstated amount: `quantity` null, keep the words in `raw_text` ("salt to taste").
- Convert fractions and unicode (½ → 0.5); ranges go to `quantity` and `quantity_max`.
- Video + caption: merge into one recipe; where they disagree, pick the more specific value and record the disagreement in `conflicts`.
- Ignore hashtags, promos, discount codes, "link in bio" and calls to follow.
- If the recipe is withheld ("comment RECIPE and I'll DM you") or absent, set `no_recipe_found: true` and leave lists empty.
- Servings unknown: estimate from quantities and set `confidence` to `medium` or `low`.

### 7.6 Failures and retries

- Retry runs the whole job again, up to 3 attempts (`attempts`).
- Every external call has a timeout (fetch 15 s, Apify 90 s, Gemini 120 s, Claude 60 s) and is logged with the job id.
- AI output that fails Zod validation is retried once with the validation errors appended; then the job fails with "Couldn't read this recipe."
- Duplicate link already approved in this household: show "Already in your library" with a link, and allow importing anyway.

## 8. Grocery list algorithm

Build the list in six steps: collect, scale, convert, merge, round, group. Put this in `lib/grocery/build.ts` as pure functions with unit tests.

### 8.1 Unit codes

| Family | Codes (base unit) | Factor to base |
| --- | --- | --- |
| Volume | `ml` (base), `l`, `tsp`, `tbsp`, `fl_oz`, `cup`, `pint`, `quart`, `gallon` | 1, 1000, 4.929, 14.787, 29.574, 236.588, 473.176, 946.353, 3785.41 |
| Weight | `g` (base), `kg`, `oz`, `lb` | 1, 1000, 28.3495, 453.592 |
| Package | `clove`, `can`, `jar`, `package`, `bunch`, `head`, `slice`, `stick`, `sprig`, `piece`, `pinch`, `dash` | No conversion; merge only with the same code |
| Count | `null` ("2 eggs", "1 onion") | No conversion |

### 8.2 Steps

1. **Collect** each source recipe with its target servings. If the same recipe appears more than once (two dinners), add the servings together.
2. **Scale** each ingredient: `factor = targetServings / recipe.servings`; multiply `quantity` and `quantity_max`. For ranges, shop with `quantity_max`.
3. **Convert** volume and weight amounts to the base unit.
4. **Merge** by `merge_key = {ingredient_id}:{family or package code or 'count'}`. Sum amounts; append each contribution to `sources`. Ingredients with no quantity ("salt to taste") merge into one line with no amount.
5. **Round and display:**
   - Volume: show cups if total ≥ ¼ cup, else tbsp if ≥ 1 tbsp, else tsp; round to the nearest ⅛.
   - Weight: show lb if ≥ 1 lb, else oz rounded to the nearest 0.5. If every source used metric, show g or kg instead.
   - Count and package: round up to a whole number (1.3 lemons → 2).
6. **Group** by `ingredients.aisle`, ordered by `households.aisle_order`. Pantry staples (`is_pantry_staple`) go in a final "Check you have" group. Optional ingredients show "(optional)."

The same ingredient with different families ("1 onion" and "1 cup diced onion") stays as two lines, shown next to each other.

### 8.3 Worked example

Recipe A serves 4 and uses 2 cup milk; planned for 4 servings. Recipe B serves 2 and uses 1 tbsp milk; planned for 4 servings.

- A: 2 cup × 1 = 473.18 ml. B: 1 tbsp × 2 = 29.57 ml.
- Total 502.75 ml = 2.125 cup → shows **milk — 2⅛ cups**, aisle Dairy, sources A (2 cups) and B (2 tbsp).

### 8.4 Updating a list

If the plan behind a list changes after the list was made, show "Plan changed — update list?" Updating rebuilds the recipe-derived items, keeps `is_checked` for any item whose `merge_key` still exists, keeps every manual item, and removes recipe items no longer needed.

## 9. API, actions and environment

Route Handlers exist only where something outside the app's own pages calls in (the Shortcut, polling, auth). Everything else is a Server Action that checks the session and household first.

### 9.1 Route Handlers

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET, POST /api/auth/[...path]` | — | Neon Auth handler |
| `POST /api/import` | Session cookie **or** `Authorization: Bearer mpt_…` | Start an import |
| `GET /api/import/[id]` | Session | Job status and draft |
| `GET /api/lists/[id]/items?since={ISO time}` | Session | Items changed since a time (polling fallback) |

**`POST /api/import`** accepts one of:

- `application/json` `{ "url": "https://www.instagram.com/reel/ABC123/" }`
- `application/json` `{ "text": "Pasted recipe text…" }` (max 20,000 chars)
- `multipart/form-data` with 1–6 `images` fields (JPEG, PNG, WebP or HEIC; total under 4.5 MB)

Responses:

```json
202 { "jobId": "7f9c…", "status": "queued", "reviewUrl": "https://{APP_URL}/import/7f9c…" }
400 { "error": "Unsupported link or empty request" }
401 { "error": "Sign in or use a valid import token" }
413 { "error": "Images too large; resize and try again" }
429 { "error": "Import limit reached; try again in an hour" }
```

Limits: 20 imports per household per hour. A bearer token updates `import_tokens.last_used_at`; revoked tokens get 401.

### 9.2 Server Actions

- Household: `createHousehold`, `joinHousehold(code)`, `regenerateInviteCode`
- Recipes: `createRecipe`, `updateRecipe`, `setRecipeStatus(id, status, reason?)`, `deleteRecipe`, `rateRecipe(id, 1–5 | null)`, `toggleFavorite`, `uploadRecipePhoto(FormData)`
- Import: `approveImport(jobId, draft, coverChoice)`, `discardImport`, `retryImport`
- Plan: `addPlanEntry`, `updatePlanEntry`, `removePlanEntry`, `copyPreviousWeek`, `sendPlan`, `approvePlan`, `requestPlanChanges(note)`
- Lists: `createListFromPlan(planId)`, `createListFromRecipes([{recipeId, servings}])`, `toggleItem`, `addManualItem`, `updateItem`, `deleteItem`, `rebuildList`, `completeList`
- Settings: `createImportToken(name)` returns the full token once, `revokeImportToken`, `setAisleOrder`, `setIngredientAisle`, `setPantryStaple`

Each action validates input with Zod, loads the user's `household_id` from the session, and rejects any record outside that household with a 404.

Token format: `mpt_` + 32 random bytes, base64url. Store `sha256(token)` and the first 8 characters.

Photo keys: `households/{householdId}/recipes/{uuid}.webp` in `recipe-photos`; `households/{householdId}/imports/{jobId}/{n}.jpg` in `imports`.

### 9.3 Environment variables

| Name | Example / default | Where it comes from |
| --- | --- | --- |
| `DATABASE_URL` | pooled connection string | Neon console |
| `DATABASE_URL_UNPOOLED` | direct connection string, for migrations | Neon console |
| `NEON_AUTH_BASE_URL` | Auth URL | Neon console, Auth tab |
| `NEON_AUTH_COOKIE_SECRET` | 32+ random characters | `openssl rand -base64 32` |
| `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY` | S3 credentials | Neon console, Object storage (confirm names there) |
| `STORAGE_PUBLIC_BASE_URL` | public URL for `recipe-photos` | Neon console |
| `BUCKET_PHOTOS`, `BUCKET_IMPORTS` | `recipe-photos`, `imports` | — |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | key, `claude-haiku-5-5` | Claude Console |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | key, `gemini-3.5-flash` | Google AI Studio |
| `APIFY_TOKEN`, `APIFY_INSTAGRAM_ACTOR`, `APIFY_TIKTOK_ACTOR` | token, `apify/instagram-scraper`, `maximedupre/tiktok-video-downloader` | Apify console |
| `APP_URL` | `https://mealprepandplanning.vercel.app` | Vercel |

Ship a `.env.example` with every name and no values, starting from docs/env.example.

## 10. iPhone Shortcuts

Two Shortcuts, built by hand in the iPhone Shortcuts app, call `POST /api/import` with a personal token. Two are simpler than one Shortcut that branches on what was shared.

### 10.1 What the server must tolerate

- `url` may arrive as a string or a one-item array; use the first item.
- Shared text that contains a link (Instagram sometimes shares "Check out this reel… https://…"): extract the first `http(s)` URL; if none, treat it as a `text` import.
- Images arrive as a form field named `images`, already resized by the Shortcut.

### 10.2 Shortcut 1: "Save Recipe" (links)

1. Shortcuts app → **+** → name it **Save Recipe**.
2. Open its details (ⓘ) → turn on **Show in Share Sheet** → share sheet types: **URLs, Safari web pages, Text**.
3. Add **Get URLs from Input** (input: Shortcut Input).
4. Add **Get Contents of URL**: URL `https://{APP_URL}/api/import`; Method **POST**; Headers: `Authorization` = `Bearer mpt_…` (your token from Settings); Request Body **JSON**, key `url` = **URLs**.
5. Add **Show Notification**: "Recipe sent to Meal Planner."

### 10.3 Shortcut 2: "Save Recipe Photo" (one screenshot or photo)

1. New Shortcut **Save Recipe Photo** → **Show in Share Sheet** → types: **Images**.
2. Add **Resize Image** to width 1600 (height auto).
3. Add **Convert Image** to JPEG.
4. Add **Get Contents of URL**: same URL and header; Request Body **Form**, field `images`, type **File**, value **Converted Image**.
5. Add **Show Notification**.

For multi-page recipes (two cookbook pages), use **Add photos** inside the app instead.

### 10.4 In the app

`/settings` shows both sets of steps, the app URL, and a "Create token" button that reveals the token once with a Copy button. Each person makes their own token, named for their phone.

## 11. Build order for tonight

Build in six milestones, deploying to Vercel after each, so there's a working app at every stop. Grocery lists come before import because they solve the main problem and import is the riskiest part.

1. **Scaffold, auth, household** (A1, A2)
   - Next.js 16 + Tailwind + shadcn/ui, PWA manifest and icons, bottom tab bar
   - Drizzle schema from section 6, first migration applied to Neon
   - Neon Auth email/password, `proxy.ts`, onboarding create/join
   - **Done when:** both phones sign in from the home-screen app and land in the same household.
2. **Recipes** (B1–B6)
   - Shared recipe editor, photo upload to `recipe-photos`, library grid, search and filters, detail with servings scaler, ratings, favorites, statuses, tags
   - **Done when:** three recipes added by hand with photos, and scaling 4 → 6 servings updates every amount.
3. **Grocery lists** (E1–E4)
   - `lib/grocery/build.ts` with unit tests (include the milk example from 8.3), new list from picked recipes, shopping view with 5-second polling, manual items, print view
   - **Done when:** a list from two recipes merges shared ingredients, groups by aisle, and a check-off on one phone shows on the other.
4. **Weekly plan and approval** (D1–D3, E1 from plan)
   - Week view, add/edit/remove entries, copy last week, send / approve / request changes, waiting badge, make list from plan
   - **Done when:** one person sends a week, the other approves it, and a list is made from it.
5. **Import** (C1–C4, F1)
   - In this order: text and images via Claude → websites → TikTok → Instagram; review screen; import history and retry; import tokens; Shortcut docs in Settings
   - **Done when:** an Instagram reel shared through the "Save Recipe" Shortcut arrives as a draft, is edited, and approved into the library.
6. **Polish, if time remains** (Should items)
   - Neon Realtime for lists and plans, pantry staples and aisle settings (F2), screen wake lock, duplicate-link warning

Per milestone: run lint, type-check and tests; fix failures before moving on; commit with a message naming the milestone.

## 12. Security, privacy and quality

The app holds only two people's recipes, but it stores API keys and accepts calls from outside, so these rules are required.

**Security**

- `proxy.ts` protects every route except `/auth/*`, `/api/auth/*` and `/api/import` (which does its own session-or-token check).
- Every query filters by the session's `household_id`; a record from another household returns 404, never 403.
- Import tokens: stored only as SHA-256 hashes, revocable, scoped to creating imports. The full token is never logged.
- Server-side fetches of user-supplied URLs: allow only `http`/`https`, block private and loopback IP ranges, follow at most 5 redirects, cap size and time (section 7.6).
- Treat captions, web pages and AI output as untrusted text: render as plain text, never as HTML; validate AI output with Zod before saving.
- Rate limit: 20 imports per household per hour.

**Privacy**

- Downloaded videos are never stored; Gemini files are deleted after reading.
- Files in the `imports` bucket are deleted when a job is approved or discarded, and any left after 7 days are removed by a daily Vercel cron.
- Every recipe keeps its source link and creator credit; nothing is republished.

**Quality**

- TypeScript strict, ESLint clean, no `any` in `lib/`.
- Unit tests (Vitest) for unit conversion, scaling, merging, rounding, source detection, and the RecipeDraft schema.
- Usable at 390 px wide on iPhone Safari, in both light and dark mode.
- Library and plan screens load in under 2 seconds on a phone connection after the database wakes (the free plan sleeps after 5 minutes idle, so the first request can be slower).
- Errors shown to users are plain sentences with a next step; full errors go to server logs with the job or request id.

**Definition of done for each story:** acceptance criteria met on a real iPhone, lint/type-check/tests pass, deployed to Vercel, no console errors.

## 13. Setup tasks and open questions

Do the setup tasks before starting Claude Code so it never stalls waiting on a key. The open questions have defaults already written into this PRD; change any you disagree with.

### 13.1 Setup (Gabriel)

- [ ] Neon project "Meal Prep & Planning" (US East 2): turn on Postgres, Object storage, Better Auth and Realtime
- [ ] Buckets: `recipe-photos` (Public) and `imports` (Private)
- [ ] Copy from Neon: pooled and direct connection strings, Auth base URL, storage endpoint and keys, public photo URL
- [ ] Claude Console: API key
- [ ] Google AI Studio: Gemini API key
- [ ] Apify: account and API token
- [ ] GitHub repo mealprepandplanning + Vercel project linked to it; add every variable from 9.3 in Vercel
- [ ] Generate `NEON_AUTH_COOKIE_SECRET` with `openssl rand -base64 32`

### 13.2 Handing this to Claude Code

1. This PRD is committed to [GabrielRamps/mealprepandplanning](https://github.com/GabrielRamps/mealprepandplanning) at `docs/PRD.md`, with `docs/env.example`. It lives in `docs/` so `create-next-app` can still scaffold into the repo root. After editing this doc, re-export it to that path.
2. Prompt: "Read docs/PRD.md. Build milestone 1 from section 11, meet its done-check, deploy, then stop and summarize."
3. Test on your phone, then ask for the next milestone. One milestone per prompt keeps each step checkable.

### 13.3 Open questions (defaults in place)

| Question | Default in this PRD |
| --- | --- |
| Week starts Monday or Sunday? | Monday |
| Meal slots? | Breakfast, lunch, dinner, snack |
| Display units? | US (cups, oz, lb); metric kept when every source is metric |
| How is the partner told a plan needs approval? | In-app badge only; web push later |
| Is your wife on iPhone? | Yes; Android would use the PWA share target later |
| Sign-in method? | Email and password; Google sign-in later |
