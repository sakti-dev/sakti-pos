# Baresync Alignment — Hard Cut Migration

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align POS app and packages/database with baresync scaffold patterns — clean dead code, add Solid Query, simplify baresync plumbing, auto-invalidate UI on sync.

**⚠️ HARD CUT — NO BACKWARDS COMPATIBILITY**

The app has not launched. There are zero users. This is a hard cut migration:

- **No re-exports** — if `~/lib/http.ts` is deleted, every import moves to the new location. No `~/lib/http.ts` re-exporting from `~/lib/api/eden.ts`.
- **No wrapper functions** — if `getSyncClient()` is replaced by `syncClient`, every call site changes. No `getSyncClient` wrapper around the new export.
- **No gradual migration** — every task completes the full change. No "old pattern works alongside new pattern".
- **No backwards compat shims** — if `createResource` becomes `useDrizzleQuery`, all 22 calls change in the same task. No "keep both for now".
- **Delete aggressively** — if a file is dead, delete it. If an export is unused, remove it. If a dependency is not imported, uninstall it.

Every file touched should end in its final state. No intermediate compatibility layers.

**Architecture:** Hard cut from `createResource` + module singletons to `@tanstack/solid-query` + `SyncClientProvider` context. All 22 `createResource` calls replaced with `createQuery` via `useDrizzleQuery`. Event bridge wired to `queryClient.invalidateQueries()`. No wrappers, no re-exports.

**Tech Stack:** `baresync@0.2.3`, `@tanstack/solid-query`, `solid-js`, `@solidjs/router`, `@elysia/eden`, `drizzle-orm`

---

## Phase 1: Dead Code Cleanup

### Task 1: Delete dead API files and unused dependencies

**Hard cut:** `lib/http.ts` is deleted. Every import of `API_URL` moves to `eden.ts`. No re-export shim.

**Files:**
- Delete: `apps/pos-app/src/lib/api/cloud.ts`
- Delete: `apps/pos-app/src/lib/http.ts`
- Modify: `apps/pos-app/src/lib/api/eden.ts` — add `API_URL` export
- Modify: `apps/pos-app/src/lib/auth/cloud.ts` — change import to `~/lib/api/eden`
- Modify: `apps/pos-app/src/store/sync.ts` — change import to `~/lib/api/eden`
- Delete: `apps/pos-app/src/lib/__test__/http.test.ts` — tests dead code
- Modify: `apps/pos-app/package.json` — remove `ky`, `bcryptjs`, `@types/bcryptjs`

**Step 1: Verify no production code imports `cloudApi` or `api` from http.ts**

```bash
cd /home/eekrain/CODE/sakti-pos
grep -r "from.*~/lib/api/cloud" apps/pos-app/src --include="*.ts" --include="*.tsx" | grep -v __test__
grep -r "import.*{.*api.*}.*from.*~/lib/http" apps/pos-app/src --include="*.ts" --include="*.tsx" | grep -v __test__
```

Expected: zero matches (cloud.ts is dead, `api` export is dead)

**Step 2: Find ALL imports of `~/lib/http`**

```bash
grep -rn "from.*~/lib/http" apps/pos-app/src --include="*.ts" --include="*.tsx"
```

Expected: `eden.ts`, `cloud.ts` (dead), `auth/cloud.ts`, `__test__/http.test.ts`

**Step 3: Move `API_URL` into `eden.ts`**

```ts
// apps/pos-app/src/lib/api/eden.ts
import { treaty } from "@elysia/eden";
import type { App } from "@repo/api";
import { AuthStorage } from "~/lib/auth/storage";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const authFetcher = (async (url: URL | RequestInfo, options?: RequestInit) => {
  const token = await AuthStorage.getToken();
  const headers = new Headers(options?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return globalThis.fetch(url, { ...options, headers });
}) as typeof fetch;

export const eden = treaty<App>(API_URL, {
  fetcher: authFetcher,
});
```

**Step 4: Update ALL imports — hard cut, no re-export**

- `lib/auth/cloud.ts:2` — change `import { API_URL } from "~/lib/http"` → `import { API_URL } from "~/lib/api/eden"`
- `store/sync.ts:25` — delete local `API_URL` definition, add `import { API_URL } from "~/lib/api/eden"` (also covers Task 2's dedup for this file)
- `lib/auth/provider.ts:91` — delete local `apiUrl`, add `import { API_URL } from "~/lib/api/eden"`, change usage

**Step 5: Delete dead files and tests**

```bash
rm apps/pos-app/src/lib/api/cloud.ts
rm apps/pos-app/src/lib/http.ts
rm apps/pos-app/src/lib/__test__/http.test.ts
```

**Step 6: Remove unused dependencies from `apps/pos-app/package.json`**

Remove from `dependencies`: `ky`
Remove from `devDependencies`: `@types/bcryptjs`
Remove from `dependencies`: `bcryptjs`

Run: `bun install` to update lockfile.

**Step 7: Verify**

```bash
cd /home/eekrain/CODE/sakti-pos
bun x ultracite check
cd apps/pos-app && bun run typecheck
cd apps/pos-app && bun run test
```

Expected: all pass (dead code removal should not break anything)

**Step 8: Commit**

```bash
git add -A
git commit -m "🧹 chore: remove dead API files and unused dependencies

- Delete lib/api/cloud.ts (duplicate eden client, never imported)
- Delete lib/http.ts (ky instance unused, only API_URL was used)
- Move API_URL into lib/api/eden.ts
- Remove ky, bcryptjs, @types/bcryptjs from package.json"
```

---

### Task 2: Remove dead exports

**Files:**
- Modify: `apps/pos-app/src/lib/auth/cloud.ts:149-151` — delete `getGoogleOAuthUrl`
- Modify: `apps/pos-app/src/lib/date-time.ts:19-23` — delete `getBusinessNow`
- Modify: `apps/pos-app/src/db/index.ts:54` — delete `DatabaseType` export
- Modify: `apps/pos-app/src/db/menu.ts` — remove `export` from `NewCategory`, `NewProduct` if unused
- Modify: `apps/pos-app/src/db/staff.ts` — remove `export` from `StaffMember`, `NewStaffMember` if unused
- Modify: `apps/pos-app/src/db/outlets.ts` — remove `export` from `OutletRecord` if unused

**Step 1: Verify each export is truly unused**

```bash
cd /home/eekrain/CODE/sakti-pos/apps/pos-app/src
grep -r "getGoogleOAuthUrl" --include="*.ts" --include="*.tsx" | grep -v "cloud.ts"
grep -r "getBusinessNow" --include="*.ts" --include="*.tsx" | grep -v "date-time.ts"
grep -r "DatabaseType" --include="*.ts" --include="*.tsx" | grep -v "db/index.ts"
grep -r "NewCategory" --include="*.ts" --include="*.tsx" | grep -v "db/menu.ts"
grep -r "NewProduct" --include="*.ts" --include="*.tsx" | grep -v "db/menu.ts"
grep -r "StaffMember" --include="*.ts" --include="*.tsx" | grep -v "db/staff.ts"
grep -r "NewStaffMember" --include="*.ts" --include="*.tsx" | grep -v "db/staff.ts"
grep -r "OutletRecord" --include="*.ts" --include="*.tsx" | grep -v "db/outlets.ts"
```

Expected: zero matches for each (confirming dead)

**Step 2: Remove each dead export**

- `getGoogleOAuthUrl`: delete the function (lines 149-151 of cloud.ts)
- `getBusinessNow`: delete the function (lines 19-23 of date-time.ts)
- `DatabaseType`: delete line 54 of db/index.ts
- `NewCategory`, `NewProduct`: remove `export` keyword (keep as local types)
- `StaffMember`, `NewStaffMember`: remove `export` keyword
- `OutletRecord`: remove `export` keyword

**Step 3: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "🧹 chore: remove unused exports across pos-app"
```

---

### Task 3: Move test-only exports out of production code

**Files:**
- Modify: `apps/pos-app/src/store/sync.ts` — remove `__resetSyncStateForTests`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts` — use `vi.hoisted` or inline mock
- Modify: `apps/pos-app/src/store/auth.ts` — remove `getActiveStaff` export
- Modify: `apps/pos-app/src/store/__test__/auth.test.ts` — use inline DB query

**Step 1: Update sync test to not depend on `__resetSyncStateForTests`**

Read the test file to understand how it uses the function. Replace with `vi.hoisted` to mock the signals directly, or restructure the test to not need a reset function.

**Step 2: Update auth test to not depend on `getActiveStaff`**

The test can import `db` and `staff` directly and run the query inline instead of calling an exported function.

**Step 3: Remove the exports**

- Delete `__resetSyncStateForTests` from `store/sync.ts`
- Remove `export` from `getActiveStaff` in `store/auth.ts` (keep function, make private)

**Step 4: Verify**

```bash
cd apps/pos-app && bun run test
```

**Step 5: Commit**

```bash
git add -A
git commit -m "🧹 chore: move test-only helpers out of production modules"
```

---

## Phase 2: packages/database Alignment

### Task 4: Add missing package.json exports and scripts

**Files:**
- Modify: `packages/database/package.json`

**Step 1: Update package.json**

```json
{
  "name": "@repo/database",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/local-schema.ts",
    "./local-schema": "./src/local-schema.ts",
    "./api-schema": "./src/api-schema.ts",
    "./api-synced-schema": "./src/api-synced-schema.ts",
    "./local-synced-schema": "./src/local-schema.ts",
    "./synced-schema": "./src/synced-schema.ts",
    "./sync-constants": "./src/sync-constants.ts",
    "./sync.config": "./sync.config.ts",
    "./generated/sync-contract": "./generated/2026-06-03/sync-contract.json",
    "./generated/sync-table-order": "./generated/2026-06-03/sync-table-order.ts",
    "./generated/manifest": "./generated/2026-06-03/sync-contract.manifest.json"
  },
  "scripts": {
    "generate": "bunx baresync generate",
    "doctor": "bunx baresync doctor",
    "check": "bun run doctor && bun run typecheck"
  },
  "dependencies": {
    "baresync": "0.2.3",
    "drizzle-orm": "^0.45.2",
    "uuid": "^14.0.0"
  },
  "devDependencies": {
    "typescript": "5.9.2"
  }
}
```

**Step 2: Verify generated files exist**

```bash
ls -la packages/database/generated/2026-06-03/
```

Expected: `sync-contract.json`, `sync-contract.manifest.json`, `sync-table-order.ts`

**Step 3: Verify**

```bash
cd apps/pos-app && bun run typecheck
cd apps/api && bun run typecheck
```

**Step 4: Commit**

```bash
git add -A
git commit -m "🔧 chore: align packages/database exports and scripts with baresync scaffold"
```

---

## Phase 3: Solid Query Integration

### Task 5: Install `@tanstack/solid-query`

**Files:**
- Modify: `apps/pos-app/package.json`

**Step 1: Install**

```bash
cd /home/eekrain/CODE/sakti-pos
bun add @tanstack/solid-query --filter @repo/pos-app
```

**Step 2: Verify package.json has the dependency**

```bash
grep "solid-query" apps/pos-app/package.json
```

**Step 3: Commit**

```bash
git add -A
git commit -m "➕ chore: add @tanstack/solid-query dependency"
```

---

### Task 6: Create `QueryClient` and `useDrizzleQuery` hook

**Files:**
- Create: `apps/pos-app/src/lib/query-client.ts`
- Create: `apps/pos-app/src/lib/use-drizzle-query.ts`

**Step 1: Create `lib/query-client.ts`**

```ts
import { QueryClient } from "@tanstack/solid-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
```

**Step 2: Create `lib/use-drizzle-query.ts`**

```ts
import { createQuery } from "@tanstack/solid-query";
import { createSignal, type Accessor } from "solid-js";

const [syncDataVersion, setSyncDataVersion] = createSignal(0);
export { setSyncDataVersion };

type Fetcher<T> = () => Promise<T>;

export function useDrizzleQuery<T>(
  key: unknown[],
  fetcher: Fetcher<T>
): {
  data: Accessor<T | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  refetch: () => void;
};

export function useDrizzleQuery<T, S>(
  source: Accessor<S>,
  fetcher: Fetcher<T>
): {
  data: Accessor<T | undefined>;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  refetch: () => void;
};

export function useDrizzleQuery<T, S>(
  keyOrSource: unknown[] | Accessor<S>,
  fetcher: Fetcher<T>
) {
  const isSource = typeof keyOrSource === "function";

  const query = createQuery(() => {
    const version = syncDataVersion();
    const queryKey = isSource
      ? ["drizzle", keyOrSource(), version]
      : [...keyOrSource, version];

    return {
      queryKey,
      queryFn: async () => await fetcher(),
    };
  });

  return {
    data: () => query.data,
    loading: () => query.isPending,
    error: () => (query.error ? String(query.error) : null),
    refetch: () => {
      query.refetch();
    },
  };
}
```

**Step 3: Verify**

```bash
cd apps/pos-app && bun run typecheck
```

**Step 4: Commit**

```bash
git add -A
git commit -m "✨ feat: create QueryClient and useDrizzleQuery hook"
```

---

### Task 7: Create `SyncClientProvider` context

**Files:**
- Create: `apps/pos-app/src/providers/sync-client-provider.tsx`

**Step 1: Create the provider**

```tsx
import { useQueryClient } from "@tanstack/solid-query";
import { listen } from "@tauri-apps/api/event";
import { type ParentComponent, createEffect, onCleanup } from "solid-js";
import { createLogger } from "~/lib/logger";
import { setSyncDataVersion } from "~/lib/use-drizzle-query";
import { syncClient } from "~/lib/sync";
import { setSyncStatus } from "~/store/sync";

const providerLogger = createLogger({
  domain: "SYNC",
  module: "sync",
  scope: "provider",
});

export const SyncClientProvider: ParentComponent = (props) => {
  const queryClient = useQueryClient();

  createEffect(() => {
    let disposed = false;
    let cleanup: (() => Promise<void>) | null = null;

    Promise.all([
      listen("baresync://data-changed", () => {
        providerLogger.info("data_changed", {});
        setSyncDataVersion((v) => v + 1);
        queryClient.invalidateQueries({ queryKey: ["drizzle"] });
      }),
      listen("baresync://sync-status-changed", async () => {
        try {
          const state = await syncClient.getState();
          if (state.needs_baseline_sync || state.local_dirty_count > 0) {
            setSyncStatus("syncing");
          } else {
            setSyncStatus("idle");
          }
        } catch {
          // ignore
        }
      }),
    ]).then(([unlistenData, unlistenStatus]) => {
      const release = async () => {
        await Promise.all([unlistenData(), unlistenStatus()]);
      };
      if (disposed) {
        release();
        return;
      }
      cleanup = release;
    });

    onCleanup(() => {
      disposed = true;
      if (cleanup) cleanup();
    });
  });

  return <>{props.children}</>;
};
```

**Step 2: Verify**

```bash
cd apps/pos-app && bun run typecheck
```

**Step 3: Commit**

```bash
git add -A
git commit -m "✨ feat: create SyncClientProvider with event bridge"
```

---

## Phase 4: Simplify Baresync Plumbing (Hard Cut)

### Task 8: Create `lib/sync.ts`

**Files:**
- Create: `apps/pos-app/src/lib/sync.ts`

**Step 1: Create the file**

```ts
import { invoke } from "@tauri-apps/api/core";
import { createSyncClient } from "baresync/tauri";
import { SYNC_SCOPE } from "@repo/database/sync-constants";

export const syncClient = createSyncClient({ scopeId: SYNC_SCOPE, invoke });
```

**Step 2: Commit**

```bash
git add -A
git commit -m "✨ feat: create lib/sync.ts with syncClient export"
```

---

### Task 9: Refactor `store/sync.ts` — remove singleton and event listeners

**Hard cut:** `getSyncClient()` is deleted. Every call site changes to `syncClient` import. No wrapper function.

**Files:**
- Modify: `apps/pos-app/src/store/sync.ts` — remove singleton, event listeners, import syncClient
- Modify: `apps/pos-app/src/db/orders.ts` — change import
- Modify: `apps/pos-app/src/db/staff.ts` — change import
- Modify: `apps/pos-app/src/db/menu.ts` — change import
- Modify: `apps/pos-app/src/db/outlets.ts` — change import

**Step 1: Update db module imports — hard cut**

All 4 db files import `getSyncClient` from `~/store/sync`. Change each to:
```ts
import { syncClient } from "~/lib/sync";
```

Delete `const client = getSyncClient();` lines. Use `syncClient` directly.

**Step 2: Refactor `store/sync.ts` — hard cut**

Remove (delete entirely):
- `let syncClient` singleton (line 27)
- `getSyncClient()` function (lines 30-38)
- `startEventListeners()` function (lines 50-100)
- `stopEventListeners()` function (lines 102-106)
- `cleanupListeners` variable (line 28)
- `import { listen } from "@tauri-apps/api/event"` (line 3)
- `import { createSyncClient, type SyncClient } from "baresync/tauri"` (line 4)
- `import { SYNC_SCOPE } from "@repo/database/sync-constants"` (line 1)
- `import { invoke } from "@tauri-apps/api/core"` (line 2)
- `setLastSyncTime` signal (line 16) — remove (dead after provider takes over event listening)

Add import:
```ts
import { syncClient } from "~/lib/sync";
```

Export `setSyncStatus` for the provider to use:
```ts
export { syncStatus, lastAssetQueueCount, setSyncStatus };
```

Update `startSyncScheduler`:
```ts
export function startSyncScheduler() {
  syncClient.startPolling();
}
```

Update `stopSyncScheduler`:
```ts
export function stopSyncScheduler() {
  syncClient.stopPolling().catch(() => {});
}
```

Update `syncNow`:
```ts
const result = (await syncClient.syncNow()) as SyncNowResult;
```

Update `runStartupSync`:
```ts
export async function runStartupSync(): Promise<void> {
  // ... existing guard checks ...
  setSyncStatus("syncing");
  try {
    startSyncScheduler();
    await syncNow();
    setSyncStatus("idle");
  } catch {
    if (syncStatus() !== "error") {
      setSyncStatus("offline");
    }
  }
}
```

Note: `startEventListeners()` call removed from `runStartupSync` — the provider handles this now.

**Step 3: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "♻️ refactor: simplify store/sync.ts — remove singleton, import syncClient from lib/sync"
```

---

### Task 10: Wire provider into app tree

**Files:**
- Modify: `apps/pos-app/src/index.tsx` — wrap app with providers
- Modify: `apps/pos-app/src/components/layout.tsx` — remove `startSyncScheduler`/`stopSyncScheduler` from AppShell

**Step 1: Update `index.tsx`**

```tsx
/* @refresh reload */
import { QueryClientProvider } from "@tanstack/solid-query";
import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { queryClient } from "./lib/query-client";
import { startAppEventListeners } from "./lib/app/listeners";
import { loadOutletContext } from "./store/outlet";
import { runStartupSync } from "./store/sync";
import { SyncClientProvider } from "./providers/sync-client-provider";
import "./index.css";
import App from "./App";

loadOutletContext();
startAppEventListeners();

const [booted, setBooted] = createSignal(false);
const [bootError, setBootError] = createSignal<string | null>(null);

async function bootstrap() {
  try {
    await Promise.race([
      runStartupSync(),
      new Promise((r) => setTimeout(r, 5000)),
    ]);
  } catch (err) {
    setBootError(String(err));
  } finally {
    setBooted(true);
  }
}

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <SyncClientProvider>
        <Show fallback={<BootSplash />} when={booted() || bootError()}>
          <Show
            fallback={<BootstrapError error={bootError()!} />}
            when={!bootError()}
          >
            <App />
          </Show>
        </Show>
      </SyncClientProvider>
    </QueryClientProvider>
  );
}

// ... BootSplash and BootstrapError unchanged ...

const root = document.getElementById("root");
render(() => <Root />, root!);
bootstrap();
```

**Step 2: Remove scheduler from `layout.tsx` AppShell**

Remove from `AppShell`:
- `import { startSyncScheduler, stopSyncScheduler } from "~/store/sync";` (line 31)
- `onMount` block (lines 123-126) that calls `startSyncScheduler()`
- `onCleanup` block (lines 128-130) that calls `stopSyncScheduler()`

Note: The provider now handles event listeners. The scheduler is started by `runStartupSync()` in `index.tsx`. AppShell no longer needs to manage it.

**Step 3: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "✨ feat: wire QueryClientProvider and SyncClientProvider into app tree"
```

---

## Phase 5: Migrate Pages to `useDrizzleQuery` (Hard Cut — All 22 at Once)

### Task 11: Migrate simple one-shot resources (6 files)

**Files:**
- Modify: `apps/pos-app/src/pages/users/user-list.tsx:22`
- Modify: `apps/pos-app/src/pages/settings/product-categories/category-list.tsx:35`
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx:39`
- Modify: `apps/pos-app/src/pages/settings/product-categories/category-form.tsx:27`
- Modify: `apps/pos-app/src/pages/settings/account.tsx:134`
- Modify: `apps/pos-app/src/pages/settings/use-settings.ts:48-49`

**Pattern:** `createResource(fetcher)` → `useDrizzleQuery(["key"], fetcher)`

**Example — `user-list.tsx`:**

Before:
```tsx
const [staff] = createResource(getStaff);
```

After:
```tsx
import { useDrizzleQuery } from "~/lib/use-drizzle-query";
const staffQuery = useDrizzleQuery(["staff"], getStaff);
```

Then update all usages: `staff()` → `staffQuery.data()`, `staff.loading` → `staffQuery.loading()`.

**For each file:**
1. Add import for `useDrizzleQuery`
2. Replace `createResource` with `useDrizzleQuery`
3. Update `.loading` → `.loading()`, `.error` → `.error()`
4. If `refetch` is destructured, use `query.refetch`

**Step 1: Migrate each file one at a time**

For each file:
- Edit the resource declaration
- Update all references to the resource
- Run `bun run typecheck` after each

**Step 2: Verify all at once**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: migrate simple one-shot resources to useDrizzleQuery"
```

---

### Task 12: Migrate reactive-source resources (8 files)

**Files:**
- Modify: `apps/pos-app/src/pages/pos/use-pos.ts:53,57`
- Modify: `apps/pos-app/src/pages/order-history.tsx:57,67`
- Modify: `apps/pos-app/src/pages/dashboard/use-dashboard-data.ts:71,79,90,98,106,114`
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-list.tsx:39,43`
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx:40,58`
- Modify: `apps/pos-app/src/pages/users/user-form.tsx:41`
- Modify: `apps/pos-app/src/components/settings/printer-settings.tsx:86`
- Modify: `apps/pos-app/src/pages/settings/use-settings.ts:52`

**Pattern:** `createResource(source, fetcher)` → `useDrizzleQuery(source, fetcher)`

**Example — `use-pos.ts`:**

Before:
```tsx
const [products] = createResource(
  () => getDomainCatalogVersion("product"),
  () => getActiveProductsByCategory()
);
```

After:
```tsx
const productsQuery = useDrizzleQuery(
  () => getDomainCatalogVersion("product"),
  () => getActiveProductsByCategory()
);
```

**Example — `dashboard/use-dashboard-data.ts`:**

Before:
```tsx
const [summary] = createResource(rangeKey, (key) =>
  getDashboardSummary(key.dateFrom, key.dateTo)
);
```

After:
```tsx
const summaryQuery = useDrizzleQuery(rangeKey, () =>
  getDashboardSummary(range().dateFrom, range().dateTo)
);
```

Note: The source function becomes the first arg. The fetcher uses the same signals directly (Solid reactivity handles it).

**For each file:**
1. Add import for `useDrizzleQuery`
2. Replace `createResource(source, fetcher)` with `useDrizzleQuery(source, fetcher)`
3. Update `.loading` → `.loading()`, `.error` → `.error()`
4. If `refetch` is destructured, use `query.refetch`

**Step 1: Migrate each file one at a time**

**Step 2: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: migrate reactive-source resources to useDrizzleQuery"
```

---

### Task 13: Migrate asset adapter resources

**Files:**
- Modify: `apps/pos-app/src/lib/assets/create-adapter.ts:110,117`

**These are special** — they create resources inside a factory function, not a component. `createQuery` from `@tanstack/solid-query` works in Solid's reactive system, so it should work here as long as the factory is called within a reactive context.

**Step 1: Migrate**

Before:
```tsx
const [imageUrl] = createResource(
  () => ({ assetId: assetId(), version: getAssetCacheVersion(assetId()) }),
  (key) => resolveCachedImageUrl(key.assetId)
);
```

After:
```tsx
const imageUrlQuery = useDrizzleQuery(
  () => ({ assetId: assetId(), version: getAssetCacheVersion(assetId()) }),
  () => resolveCachedImageUrl(assetId())
);
```

**Step 2: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: migrate asset adapter resources to useDrizzleQuery"
```

---

## Phase 6: Cleanup & Polish

### Task 14: Fix `changePin` to use eden + baresync outbox

**Files:**
- Modify: `apps/pos-app/src/lib/auth/provider.ts:87-121`

**Step 1: Refactor `changePin`**

Before (raw fetch + direct SQL):
```ts
export async function changePin(staffId: string, newPin: string): Promise<void> {
  const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
  const sessionToken = await AuthStorage.getToken();
  // ... raw fetch ...
  await invoke("run_sql", { query: { sql: "UPDATE staff SET pin = ?1..." } });
}
```

After (eden + baresync outbox):
```ts
import { eden } from "~/lib/api/eden";
import { syncClient } from "~/lib/sync";
import { db } from "~/db";
import { staff } from "@repo/database";
import { eq } from "drizzle-orm";

export async function changePin(staffId: string, newPin: string): Promise<void> {
  const result = await eden.api.staff[staffId].pin.patch({ pin: newPin });
  if (result.error) {
    throw new Error("Failed to change PIN");
  }

  const now = new Date().toISOString();
  await syncClient.writeTransaction(db, async (tx) => {
    await tx
      .update(staff)
      .set({ pin: result.data.pin, updatedAt: now, isSynced: false })
      .where(eq(staff.id, staffId));
    await syncClient.enqueueChange(tx, {
      table: staff,
      rowId: staffId,
      operation: "update",
    });
  });
}
```

Note: Verify the API endpoint signature first — check `apps/api/src/staff/routes.ts` for the PATCH pin route.

**Step 2: Remove unused imports from `provider.ts`**

After refactor, `invoke` and `AuthStorage` may no longer be needed in this file. Remove if unused.

**Step 3: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 4: Commit**

```bash
git add -A
git commit -m "♻️ refactor: changePin to use eden + baresync outbox instead of raw fetch"
```

---

### Task 15: Remove `lastSyncTime` signal (dead after provider refactor)

**Files:**
- Modify: `apps/pos-app/src/store/sync.ts`

After the provider refactor, `setLastSyncTime` is no longer called from the event listener (that moved to the provider). Check if `lastSyncTime` is used anywhere. If not, remove it.

```bash
grep -r "lastSyncTime" apps/pos-app/src --include="*.ts" --include="*.tsx" | grep -v store/sync.ts
```

If unused, remove the signal and its export.

**Step 1: Remove if dead**

**Step 2: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "🧹 chore: remove unused lastSyncTime signal"
```

---

### Task 16: Final verification — full test suite

**Step 1: Run all checks**

```bash
cd /home/eekrain/CODE/sakti-pos
bun x ultracite check

cd apps/pos-app && bun run typecheck
cd apps/pos-app && bun run test

cd apps/api && bun run typecheck
cd apps/api && bun run test

cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

**Step 2: Manual smoke test checklist**

- [ ] App boots, splash screen shows
- [ ] Login works (PIN entry)
- [ ] Dashboard loads with data
- [ ] POS page shows products
- [ ] Create an order — appears in order history
- [ ] Settings — products/categories load
- [ ] Settings — staff list loads
- [ ] Sync status indicator shows correct state
- [ ] Manual sync button works
- [ ] After sync, pages auto-refresh (the whole point of this refactor)

**Step 3: Final commit if needed**

---

## Summary

| Phase | Tasks | Risk |
|-------|-------|------|
| 1. Dead code cleanup | 1-3 | Low — pure deletion |
| 2. packages/database alignment | 4 | Low — additive exports |
| 3. Solid Query integration | 5-7 | Medium — new dependency + new patterns |
| 4. Simplify baresync plumbing | 8-10 | Medium — refactor imports + provider wiring |
| 5. Migrate pages | 11-13 | Medium — 22 resource replacements |
| 6. Cleanup & polish | 14-16 | Low — final cleanup |
