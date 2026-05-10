# API Organization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize `apps/api` into domain-focused modules so routes, business logic, and tests are easier to find and maintain.

**Architecture:** Keep the Elysia worker entrypoint thin, then group each feature area into its own folder with route handlers plus any feature-specific helpers. Move shared infrastructure that crosses domains, such as session handling, OAuth, and sync event recording, into a small shared layer. Avoid barrel files; import concrete files directly so ownership stays obvious.

**Tech Stack:** Elysia, Drizzle ORM, Cloudflare Workers, Narvik, TypeScript, Vitest, Ultracite/Biome

---

## Target Structure

Start from the current flat layout:

- `src/index.ts`
- `src/routes/*`
- `src/lib/*`
- `src/__test__/*`

Move toward this structure:

```text
src/
  app.ts
  auth/
    routes.ts
    service.ts
    __test__/
  merchants/
    routes.ts
    __test__/
  outlets/
    routes.ts
    __test__/
  registers/
    routes.ts
    __test__/
  staff/
    routes.ts
    __test__/
  sync/
    routes.ts
    service.ts
    __test__/
  lib/
    session.ts
    oauth.ts
    sync-events.ts
  db/
  scripts/
```

The first pass should preserve behavior. This is a structural cleanup, not a feature rewrite.

---

### Task 1: Split the worker bootstrap from route composition

**Files:**
- Create: `apps/api/src/app.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Write the failing test**

Add a small bootstrapping test if needed, or update an existing test to import the new app module directly instead of the old entrypoint.

Use this command to confirm the current entrypoint is the only composition root:

```bash
bun run test src/__test__/auth.test.ts
```

Expected: passes before the refactor, but the new `app.ts` file does not exist yet.

**Step 2: Move route composition into `app.ts`**

Create `src/app.ts` with the current `Elysia` setup, CORS, logging hooks, and `.use(...)` calls for each route module.

Keep `src/index.ts` as a tiny wrapper that only exports the compiled app from `src/app.ts`.

**Step 3: Verify the worker still starts**

Run:

```bash
bun run typecheck
```

Expected: no TypeScript errors.

**Step 4: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/index.ts
git commit -m "refactor(api): extract app bootstrap"
```

---

### Task 2: Move auth into its own domain folder

**Files:**
- Create: `apps/api/src/auth/routes.ts`
- Create: `apps/api/src/auth/service.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/__test__/auth.test.ts`

**Step 1: Write the failing test**

Change the auth test to import the route module from `src/auth/routes.ts` instead of `src/routes/auth.ts`.

Run:

```bash
bun run test src/__test__/auth.test.ts
```

Expected: FAIL until the new path exists.

**Step 2: Move route and helper logic**

Move the HTTP handlers from `src/routes/auth.ts` into `src/auth/routes.ts`.

Move auth-specific implementation details such as password hashing, cookie helpers, and Narvik session wiring into `src/auth/service.ts` if they are only used by auth.

Keep `src/lib/session.ts` only for shared cookie/request/session parsing helpers.

**Step 3: Update composition**

Replace the old auth route import in `src/app.ts` with the new `auth/routes.ts` import.

**Step 4: Verify**

Run:

```bash
bun run test src/__test__/auth.test.ts
bun run typecheck
```

Expected: both pass.

**Step 5: Commit**

```bash
git add apps/api/src/auth apps/api/src/app.ts apps/api/src/__test__/auth.test.ts
git commit -m "refactor(api): move auth into domain folder"
```

---

### Task 3: Move merchant, outlet, register, and staff routes into domain folders

**Files:**
- Create: `apps/api/src/merchants/routes.ts`
- Create: `apps/api/src/outlets/routes.ts`
- Create: `apps/api/src/registers/routes.ts`
- Create: `apps/api/src/staff/routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/__test__/merchants.test.ts`
- Modify: `apps/api/src/__test__/outlets.test.ts`
- Modify: `apps/api/src/__test__/registers.test.ts`
- Modify: `apps/api/src/__test__/staff.test.ts`

**Step 1: Write the failing tests**

Update one test at a time to import from the new domain route path.

Run each suite after its import change:

```bash
bun run test src/__test__/merchants.test.ts
bun run test src/__test__/outlets.test.ts
bun run test src/__test__/registers.test.ts
bun run test src/__test__/staff.test.ts
```

Expected: fail until each route module exists in its new location.

**Step 2: Move the route handlers**

Move each route file from `src/routes/*.ts` into the matching feature folder.

Do not change the route prefixes or handler behavior during the move.

**Step 3: Update app composition**

Import the new route modules from `src/app.ts`.

**Step 4: Verify**

Run:

```bash
bun run test src/__test__/merchants.test.ts src/__test__/outlets.test.ts src/__test__/registers.test.ts src/__test__/staff.test.ts
bun run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/src/merchants apps/api/src/outlets apps/api/src/registers apps/api/src/staff apps/api/src/app.ts apps/api/src/__test__
git commit -m "refactor(api): group domain routes by feature"
```

---

### Task 4: Split sync into service and route layers

**Files:**
- Create: `apps/api/src/sync/routes.ts`
- Create: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/__test__/sync.test.ts`
- Modify: `apps/api/src/__test__/sync-events.test.ts`
- Modify: `apps/api/src/__test__/sync-cleanup.test.ts`

**Step 1: Write the failing test**

Update the sync tests to import from the new `src/sync/*` module paths.

Run:

```bash
bun run test src/__test__/sync.test.ts
```

Expected: fail until the new module exists.

**Step 2: Split HTTP handling from sync logic**

Move the Elysia route handlers into `src/sync/routes.ts`.

Keep the shared sync implementation in `src/sync/service.ts` and move the current `lib/sync.ts` contents there if needed.

Preserve the transaction helpers, table ordering, push/pull behavior, and access checks exactly.

**Step 3: Keep shared event logging separate**

Leave `src/lib/sync-events.ts` in place unless the sync module needs a thin wrapper around it. That file is cross-cutting infrastructure, not route logic.

**Step 4: Verify**

Run:

```bash
bun run test src/__test__/sync.test.ts src/__test__/sync-events.test.ts src/__test__/sync-cleanup.test.ts
bun run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/src/sync apps/api/src/app.ts apps/api/src/__test__
git commit -m "refactor(api): split sync into domain module"
```

---

### Task 5: Clean up shared lib boundaries and remove dead paths

**Files:**
- Modify: `apps/api/src/lib/session.ts`
- Modify: `apps/api/src/lib/oauth.ts`
- Modify: `apps/api/src/lib/sync-events.ts`
- Delete: `apps/api/src/routes/auth.ts`
- Delete: `apps/api/src/routes/merchants.ts`
- Delete: `apps/api/src/routes/outlets.ts`
- Delete: `apps/api/src/routes/registers.ts`
- Delete: `apps/api/src/routes/staff.ts`
- Delete: `apps/api/src/routes/sync.ts`
- Delete: any now-unused files under `apps/api/src/lib/` only if they became dead after the move

**Step 1: Review imports**

Search for old paths:

```bash
rg 'src/routes/|../routes/' apps/api/src apps/api/src/__test__
```

Expected: only the new domain paths remain.

**Step 2: Remove dead files**

Delete the old route files after all imports have moved.

**Step 3: Verify formatting and lint**

Run:

```bash
bun x ultracite fix
bun x ultracite check
```

Expected: `fix` makes any remaining mechanical cleanup; `check` reports no errors.

**Step 4: Verify types**

Run:

```bash
bun run typecheck
```

Expected: pass.

**Step 5: Commit**

```bash
git add apps/api/src/lib apps/api/src/routes apps/api/src/sync apps/api/src/auth apps/api/src/merchants apps/api/src/outlets apps/api/src/registers apps/api/src/staff apps/api/src/app.ts
git commit -m "refactor(api): finish domain-based organization"
```

---

## Verification Checklist

- `bun run typecheck`
- `bun x ultracite fix`
- `bun x ultracite check`
- targeted Vitest runs for each moved domain

