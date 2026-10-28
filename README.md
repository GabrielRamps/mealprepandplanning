# Meal Prep & Planning

Private household meal planner. Spec: [docs/PRD.md](docs/PRD.md). What
changed and when: [CHANGELOG.md](CHANGELOG.md).

Next.js 16 (App Router) on Vercel, with Neon for Postgres, Auth (Managed Better
Auth), Object Storage and Realtime. Services are declared in [`neon.ts`](neon.ts).

## Setup

```bash
npm install
neon link --org-id org-crimson-queen-11195186 --project-id aged-mode-19244395 --branch production -y
neon deploy                # provisions neon.ts services, writes .env.local
npm run db:migrate         # applies ./drizzle migrations
echo "NEON_AUTH_COOKIE_SECRET=$(openssl rand -base64 32)" >> .env.local
echo 'NEXT_PUBLIC_NEON_REALTIME_URL=$NEON_REALTIME_URL' >> .env.local
npm run dev
```

`neon deploy` needs Neon credentials: `neon login` on your machine, or
`NEON_API_KEY` in the environment (cloud sandboxes).

Sign in, then open `/api/health` to check every service end to end.

## Getting started on your phones

1. Open the app in Safari on the iPhone, then Share → **Add to Home Screen**.
2. Sign up. The first person picks **Create household**; the invite code is in
   Settings (gear icon on Recipes), valid for 7 days, with **Share code** and
   **New code** buttons.
3. The second person signs up and picks **Join with code**.

## Import (milestone 5)

Imports need `ANTHROPIC_API_KEY` (websites, photos, pasted text),
`GEMINI_API_KEY` (Instagram and TikTok video + caption) and `APIFY_TOKEN`
(fetching the posts). Without them an import fails with a plain message and can
be retried later. `CRON_SECRET` protects the daily cleanup of old uploads.

The iPhone Shortcut posts to `/api/import` with a personal token from
Settings; the steps are listed there.

## Live sync (milestone 6)

Open lists and plans update on the other phone through Neon Realtime when
`NEXT_PUBLIC_NEON_REALTIME_URL` is set. Without it, or while the connection is
down, lists poll every 3 s and plans every 15 s.

Settings → **Your store** sets the aisle order; **Ingredient aisles and pantry
staples** sets each ingredient's aisle and whether it goes in the "Check you
have" group.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` / `test` | ESLint, `tsc`, Vitest |
| `npm run db:generate` | New migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (direct connection) |

## Migrations and deploys

The Vercel build is plain `next build`; it doesn't run migrations. Before
merging a change that adds one, run `npm run db:migrate` against production
(`DATABASE_URL_UNPOOLED` from the Neon project's production branch; add
`DATABASE_DRIVER=neon-http` where outbound TCP is blocked). Keep migrations
additive so the live app keeps working in between. Each preview deploy gets its
own Neon branch, copied from production when the branch is first deployed.

## Tests

`npm test` runs the unit tests. `lib/grocery/lists.db.test.ts` also exercises
lists, saved lists and deletes against a real database, and only runs with
`TEST_DATABASE_URL` set to a throwaway database with migrations applied (a
schema-only Neon branch works; never production):

```bash
TEST_DATABASE_URL=postgres://… DATABASE_DRIVER=neon-http npm test
```

## Deviations from the PRD

- **Database driver:** `pg` with `attachDatabasePool` (Neon's guidance for
  Vercel Fluid compute) instead of `@neondatabase/serverless`. Set
  `DATABASE_DRIVER=neon-http` where outbound TCP is blocked.
- **Storage env names:** Neon injects `AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3` and `AWS_REGION`, replacing the
  PRD's `STORAGE_*` names. Public photo URLs are
  `${AWS_ENDPOINT_URL_S3}/recipe-photos/<key>`.
- **Cache Components** is turned off: every screen reads the session.
