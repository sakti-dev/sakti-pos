# Baresync Create Sync Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the three standalone batteries-included server handler factories with one framework-agnostic `createSyncServer` factory, while keeping low-level primitives and marking the old factories deprecated.

**Architecture:** Keep primitives such as `decodeSyncRequest`, `encodeSyncResponse`, `createIdempotencyGuard`, and ordering helpers as the low-level API. Add `createSyncServer({ db, resolveScope, push, pull, status })`, returning `{ push, pull, status }` request handlers with the same `Request, context -> Response` behavior as today. Keep `createSyncPushHandler`, `createSyncPullHandler`, and `createSyncStatusHandler` as compatibility wrappers with JSDoc deprecation.

**Tech Stack:** TypeScript, Bun, Vitest, Web `Request`/`Response`, Drizzle transaction-capable database contract, Baresync server package.

---

### Task 1: Add Failing Tests For The New Grouped Server API

**Files:**
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/baresync/src/server/__test__/handlers.test.ts`

**Step 1: Write the failing tests**

Add an import for `createSyncServer` and a new `describe("createSyncServer", ...)` block. The tests should prove:

```ts
const sync = createSyncServer<
  { sessionId: string },
  { merchantId: string }
>({
  db,
  resolveScope: vi.fn(async ({ scopeId }) =>
    authorizedScope({ merchantId: scopeId })
  ),
  push: {
    applyPushChanges: vi.fn(async (input) => ({
      acceptedTables: input.changes.map((change) => change.table),
      scopeId: input.scopeId,
    })),
    upsertOrder: ["categories", "products"],
  },
  pull: {
    limit: 25,
    loadPullChanges: vi.fn(async (input) => ({
      cursor: input.cursor,
      hasMore: false,
      tables: input.tables.map((table) => ({ table })),
    })),
  },
  status: {
    loadSyncStatus: vi.fn(async (input) => ({
      cursor: input.cursor,
      hasChanges: true,
    })),
  },
});
```

Expected behavior:
- `sync.push(request, context)` orders push changes and returns the same body shape as `createSyncPushHandler`.
- `sync.push` replays identical idempotent push requests using the top-level `db`.
- `sync.pull(request, context)` passes `pull.limit` into `loadPullChanges`.
- `sync.status(request, context)` calls the shared `resolveScope`.
- A denied scope returns the scope response and does not call the operation callback.

**Step 2: Run tests to verify failure**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test packages/baresync/src/server/__test__/handlers.test.ts
```

Expected: FAIL because `createSyncServer` is not exported or not implemented.

### Task 2: Implement `createSyncServer`

**Files:**
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/baresync/src/server/handlers.ts`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/baresync/src/server/index.ts`

**Step 1: Add option types**

In `handlers.ts`, add types that share `db` and `resolveScope` at the parent level:

```ts
export interface SyncServerOptions<
  TContext,
  TScope,
  TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase,
> {
  db: TDb;
  resolveScope: (
    input: SyncResolveScopeInput<TContext>
  ) => Awaitable<SyncScopeResolution<TScope>>;
  push: Omit<
    SyncPushHandlerOptions<TContext, TScope, TDb>,
    "idempotency" | "resolveScope"
  >;
  pull: Omit<SyncPullHandlerOptions<TContext, TScope>, "resolveScope">;
  status: Omit<SyncStatusHandlerOptions<TContext, TScope>, "resolveScope">;
}

export interface SyncServer<TContext> {
  push: SyncHandler<TContext>;
  pull: SyncHandler<TContext>;
  status: SyncHandler<TContext>;
}
```

**Step 2: Add the grouped factory**

Implement:

```ts
export function createSyncServer<TContext, TScope>(
  options: SyncServerOptions<TContext, TScope>
): SyncServer<TContext> {
  return {
    push: createSyncPushHandler({
      ...options.push,
      idempotency: { db: options.db },
      resolveScope: options.resolveScope,
    }),
    pull: createSyncPullHandler({
      ...options.pull,
      resolveScope: options.resolveScope,
    }),
    status: createSyncStatusHandler({
      ...options.status,
      resolveScope: options.resolveScope,
    }),
  };
}
```

If generic inference fails for `TDb`, add the third generic parameter to `createSyncServer<TContext, TScope, TDb extends SyncIdempotencyDatabase = SyncIdempotencyDatabase>`.

**Step 3: Export the new API**

In `server/index.ts`, export:

```ts
createSyncServer,
type SyncServer,
type SyncServerOptions,
```

**Step 4: Run tests to verify green**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test packages/baresync/src/server/__test__/handlers.test.ts
```

Expected: PASS.

### Task 3: Deprecate The Three Standalone Factories

**Files:**
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/baresync/src/server/handlers.ts`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/baresync/src/server/__test__/handlers.test.ts`

**Step 1: Add JSDoc deprecation comments**

Add comments immediately above each old factory:

```ts
/**
 * @deprecated Use createSyncServer for batteries-included server routes.
 * Low-level custom routes should use the exported server primitives directly.
 */
```

Apply to:
- `createSyncPushHandler`
- `createSyncPullHandler`
- `createSyncStatusHandler`

**Step 2: Keep compatibility tests**

Do not delete the existing standalone factory tests. They prove the old API remains source-compatible during the deprecation period.

**Step 3: Run focused tests**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test packages/baresync/src/server/__test__/handlers.test.ts
```

Expected: PASS.

### Task 4: Update Scaffold Templates To Use `createSyncServer`

**Files:**
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/create-baresync/src/templates/server/src/v1/routes-hono.ts`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/create-baresync/src/__test__/integration-templates.test.ts`

**Step 1: Write failing template assertions**

Update the integration template tests to assert:

```ts
expect(routes?.content).toContain("createSyncServer");
expect(routes?.content).toContain("db,");
expect(routes?.content).toContain("push:");
expect(routes?.content).toContain("pull:");
expect(routes?.content).toContain("status:");
expect(routes?.content).not.toContain("createSyncPushHandler");
expect(routes?.content).not.toContain("idempotency: { db }");
```

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test packages/create-baresync/src/__test__/integration-templates.test.ts
```

Expected: FAIL because templates still use the old factories.

**Step 2: Update Hono template**

Change imports to:

```ts
import { createSyncServer } from "baresync/server";
```

Create one server:

```ts
const syncServer = createSyncServer({
  db,
  resolveScope,
  push: {
    upsertOrder: repository.tableNames,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      repository.applyPushChanges({
        changes,
        scopeId: scope.scopeId,
        syncUpdatedAt,
      }),
  },
  pull: {
    limit: 1000,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      repository.loadPullChanges({
        cursor,
        scopeId: scope.scopeId,
        tables,
      }),
  },
  status: {
    loadSyncStatus: async ({ cursor, scope }) =>
      repository.loadSyncStatus({
        cursor,
        scopeId: scope.scopeId,
      }),
  },
});
```

Mount:

```ts
sync.post("/push", (c) => syncServer.push(c.req.raw, {}));
sync.post("/pull", (c) => syncServer.pull(c.req.raw, {}));
sync.post("/status", (c) => syncServer.status(c.req.raw, {}));
```

**Step 3: Update Elysia template**

Use the same `createSyncServer` setup. Mount:

```ts
export const sync = new Elysia({ prefix: "/api/sync/v1" })
  .post("/push", async ({ request }) => syncServer.push(request, {}))
  .post("/pull", async ({ request }) => syncServer.pull(request, {}))
  .post("/status", async ({ request }) => syncServer.status(request, {}));
```

**Step 4: Run template tests**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test packages/create-baresync/src/__test__/integration-templates.test.ts
```

Expected: PASS.

### Task 5: Update Example Server Route

**Files:**
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/examples/inventory-json-polling/apps/server/src/v1/routes.ts`

**Step 1: Update imports and route wiring**

Replace the three old factory imports with:

```ts
import { createSyncServer } from "baresync/server";
```

Use the same grouped `createSyncServer` shape from Task 4.

**Step 2: Run example/server tests if present**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test examples/inventory-json-polling/apps/server
```

Expected: PASS, or no matching tests. If no tests are discovered, run the workspace typecheck in Task 7.

### Task 6: Update Documentation And Skill References

**Files:**
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/README.md`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/apps/docs/content/docs/getting-started/server-routes.mdx`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/apps/docs/content/docs/reference/typescript-api.mdx`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/skills/baresync/reference/server.md`
- Modify: `/home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3/packages/baresync/skills/reference/server.md`

**Step 1: Update examples**

Show this as the preferred server route API:

```ts
const syncServer = createSyncServer({
  db,
  resolveScope,
  push: {
    upsertOrder: repository.tableNames,
    applyPushChanges,
  },
  pull: {
    limit: 1000,
    loadPullChanges,
  },
  status: {
    loadSyncStatus,
  },
});
```

**Step 2: Document deprecation**

Add a short migration note:

```md
`createSyncPushHandler`, `createSyncPullHandler`, and
`createSyncStatusHandler` remain available for compatibility, but
`createSyncServer` is the preferred batteries-included integration path.
For custom protocol work, use the low-level primitives exported from
`baresync/server`.
```

**Step 3: Preserve raw request guidance**

Add or keep this integration rule:

```md
Pass the raw Web `Request` to `syncServer.push`, `syncServer.pull`, and
`syncServer.status`. Avoid framework middleware that consumes the body before
Baresync reads it, because push idempotency hashes the raw request bytes.
```

### Task 7: Typecheck And Run Focused Test Suite

**Files:**
- No code changes.

**Step 1: Run server tests**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test packages/baresync/src/server/__test__
```

Expected: PASS.

**Step 2: Run create-baresync template tests**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun test packages/create-baresync/src/__test__/integration-templates.test.ts
```

Expected: PASS.

**Step 3: Run TypeScript typecheck**

Run:

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
bun run typecheck
```

Expected: PASS.

### Task 8: Apply The New API To Sakti POS Sync Routes

**Files:**
- Modify: `/home/eekrain/CODE/sakti-pos/apps/api/src/sync/routes.ts`

**Step 1: Update route wiring after Baresync package update**

Replace the three factory imports with `createSyncServer` after the local app depends on the new Baresync version.

Use:

```ts
const syncServer = createSyncServer<ScopeContext, ResolvedScope>({
  db,
  resolveScope,
  push: {
    upsertOrder: repository.tableNames,
    applyPushChanges: async ({ changes, scope, syncUpdatedAt }) =>
      repository.applyPushChanges({
        changes,
        scopeId: scope.scopeId,
        syncUpdatedAt,
      }),
  },
  pull: {
    limit: 1000,
    loadPullChanges: async ({ cursor, scope, tables }) =>
      repository.loadPullChanges({
        cursor,
        scopeId: scope.scopeId,
        tables,
      }),
  },
  status: {
    loadSyncStatus: async ({ cursor, scope }) =>
      repository.loadSyncStatus({
        cursor,
        scopeId: scope.scopeId,
      }),
  },
});
```

Mount:

```ts
export const syncRoutes = new Elysia({ prefix: "/api/sync/v1" })
  .use(authenticated)
  .post("/push", (c) => syncServer.push(c.request, { userId: c.session.userId }))
  .post("/pull", (c) => syncServer.pull(c.request, { userId: c.session.userId }))
  .post("/status", (c) =>
    syncServer.status(c.request, { userId: c.session.userId })
  );
```

If Elysia authentication middleware consumes the body before these route handlers, keep the temporary reconstructed `Request` compatibility workaround until the auth middleware is adjusted to avoid body parsing for sync routes.

**Step 2: Run focused API tests**

Run:

```bash
cd /home/eekrain/CODE/sakti-pos
bun test apps/api/src/sync
```

Expected: PASS, or no matching tests. If no tests exist, run:

```bash
cd /home/eekrain/CODE/sakti-pos
bun test apps/api/src
```

### Task 9: Commit Baresync Changes In Small Groups

**Files:**
- All modified Baresync files from Tasks 1-7.

**Step 1: Commit package API and tests**

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
git add packages/baresync/src/server/handlers.ts packages/baresync/src/server/index.ts packages/baresync/src/server/__test__/handlers.test.ts
git commit -m "feat(server): add grouped sync server factory"
```

**Step 2: Commit templates and docs**

```bash
cd /home/eekrain/.opensrc/repos/github.com/sakti-dev/baresync/0.3.3
git add packages/create-baresync/src/templates/server/src/v1/routes-hono.ts packages/create-baresync/src/templates/server/src/v1/routes-elysia.ts packages/create-baresync/src/__test__/integration-templates.test.ts examples/inventory-json-polling/apps/server/src/v1/routes.ts README.md apps/docs/content/docs/getting-started/server-routes.mdx apps/docs/content/docs/reference/typescript-api.mdx skills/baresync/reference/server.md packages/baresync/skills/reference/server.md
git commit -m "docs(server): prefer createSyncServer integration"
```

If working from the current `opensrc` cache, first copy the source into a real Baresync git worktree. The cached `opensrc` directory may not be a git checkout.

### Task 10: Release And Migration Notes

**Files:**
- Modify the Baresync changelog or release notes file if the repository has one.

**Step 1: Add release note**

Mention:
- Added `createSyncServer`.
- `db` now lives at the parent batteries-included server config.
- Existing three factories remain compatible but are deprecated.
- Raw `Request` remains the recommended path for Hono, Elysia, Workers, Bun, and plain fetch handlers.

**Step 2: Versioning decision**

This is source-compatible if deprecated factories remain exported, so it can ship as a minor version. If maintainers decide to remove the old factories in the same release, make it a major version.

