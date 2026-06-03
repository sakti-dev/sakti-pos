# Rename packages/database → packages/sync-contract

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename `packages/database` to `packages/sync-contract` with package name `@sync-contract`, following baresync scaffold conventions.

**⚠️ HARD CUT — NO BACKWARDS COMPATIBILITY**

Same rules as the baresync alignment plan: no re-exports, no wrapper aliases. Every import changes to the new path in the same task.

**Scope:** ~40 files across the monorepo. Pure mechanical rename — no logic changes.

---

## Import Mapping

### POS app (`apps/pos-app/`)

| Current | New |
|---------|-----|
| `from "@repo/database"` | `from "@sync-contract/local-synced-schema"` |
| `from "@repo/database/sync-constants"` | `from "@sync-contract/constants"` |

### API app (`apps/api/`)

| Current | New |
|---------|-----|
| `from "@repo/database/api-schema"` | `from "@sync-contract/api-schema"` |

### Scaffold convention (for reference)

```
@sync-contract/local-schema          → infrastructure tables (outbox, cursors)
@sync-contract/local-synced-schema   → business tables with localSyncColumns
@sync-contract/api-schema            → server tables with apiSyncColumns + batch_requests
@sync-contract/constants             → SYNC_SCOPE
```

---

## Phase 1: Rename Package Directory & Config

### Task 1: Rename directory and update package.json

**Files:**
- Rename: `packages/database/` → `packages/sync-contract/`
- Modify: `packages/sync-contract/package.json` (after rename)

**Step 1: Rename directory**

```bash
mv packages/database packages/sync-contract
```

**Step 2: Update package.json**

Change `"name": "@repo/database"` → `"name": "@sync-contract"`.

Keep all exports, scripts, and dependencies identical (only the name changes).

**Step 3: Verify no internal references break**

The sync.config.ts imports from relative paths (`./src/api-synced-schema.ts`, `./src/synced-schema.ts`) — these are fine since internal structure is unchanged.

**Step 4: Commit**

```bash
git add -A
git commit -m "♻️ refactor: rename packages/database → packages/sync-contract"
```

---

## Phase 2: Update Workspace Dependencies

### Task 2: Update package.json dependencies in both apps

**Files:**
- Modify: `apps/pos-app/package.json`
- Modify: `apps/api/package.json`

**Step 1: Update pos-app dependency**

Change `"@repo/database": "*"` → `"@sync-contract": "*"` in dependencies.

**Step 2: Update api dependency**

Change `"@repo/database": "*"` → `"@sync-contract": "*"` in dependencies.

**Step 3: Run bun install**

```bash
bun install
```

This updates the lockfile and workspace resolution.

**Step 4: Commit**

```bash
git add -A
git commit -m "♻️ refactor: update workspace dependencies to @sync-contract"
```

---

## Phase 3: Update tsconfig Path Aliases

### Task 3: Update tsconfig paths in pos-app

**Files:**
- Modify: `apps/pos-app/tsconfig.json`

**Step 1: Replace path alias**

Change:
```json
"@repo/database": ["../../packages/database/src/schema.ts"],
```

To:
```json
"@sync-contract/*": ["../../packages/sync-contract/src/*"],
"@sync-contract/generated/*": ["../../packages/sync-contract/generated/*"],
```

Note: The old alias pointed to a non-existent `schema.ts`. The new aliases follow the scaffold convention and let IDE resolve subpath imports correctly.

**Step 2: Verify**

```bash
cd apps/pos-app && bun run typecheck
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: update pos-app tsconfig paths to @sync-contract"
```

---

## Phase 4: Migrate POS App Imports

### Task 4: Update POS app production imports (9 files)

**Files:**
- Modify: `apps/pos-app/src/db/index.ts`
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/menu.ts`
- Modify: `apps/pos-app/src/db/outlets.ts`
- Modify: `apps/pos-app/src/db/staff.ts`
- Modify: `apps/pos-app/src/db/merchants.ts`
- Modify: `apps/pos-app/src/db/dashboard.ts`
- Modify: `apps/pos-app/src/lib/auth/provider.ts`
- Modify: `apps/pos-app/src/store/auth.ts`
- Modify: `apps/pos-app/src/providers/sync-client-provider.tsx`
- Modify: `apps/pos-app/src/lib/sync.ts`

**Pattern:**

```diff
- import { staff } from "@repo/database";
+ import { staff } from "@sync-contract/local-synced-schema";

- import { SYNC_SCOPE } from "@repo/database/sync-constants";
+ import { SYNC_SCOPE } from "@sync-contract/constants";
```

**Step 1: Update each file**

Use find-and-replace across all files. The mapping is:
- `from "@repo/database"` → `from "@sync-contract/local-synced-schema"`
- `from "@repo/database/sync-constants"` → `from "@sync-contract/constants"`

**Step 2: Verify**

```bash
cd apps/pos-app && bun run typecheck
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: migrate POS app imports to @sync-contract"
```

---

### Task 5: Update POS app test imports (4 files)

**Files:**
- Modify: `apps/pos-app/src/db/__test__/staff.test.ts`
- Modify: `apps/pos-app/src/db/__test__/orders.test.ts`
- Modify: `apps/pos-app/src/db/__test__/menu.test.ts`
- Modify: `apps/pos-app/src/db/__test__/sync-schema.test.ts`

**Pattern:** Same as Task 4.

**Step 1: Update each file**

**Step 2: Verify**

```bash
cd apps/pos-app && bun run typecheck && bun run test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: migrate POS app test imports to @sync-contract"
```

---

## Phase 5: Migrate API App Imports

### Task 6: Update API app imports (15 files)

**Files:**
- Modify: `apps/api/src/db/index.ts`
- Modify: `apps/api/src/db/script.ts`
- Modify: `apps/api/src/db/__test__/sync-events-schema.test.ts`
- Modify: `apps/api/src/sync/service.ts`
- Modify: `apps/api/src/sync/routes.ts`
- Modify: `apps/api/src/outlets/routes.ts`
- Modify: `apps/api/src/registers/public-routes.ts`
- Modify: `apps/api/src/registers/protected-routes.ts`
- Modify: `apps/api/src/auth/routes.ts`
- Modify: `apps/api/src/assets/routes.ts`
- Modify: `apps/api/src/merchants/routes.ts`
- Modify: `apps/api/src/staff/routes.ts`
- Modify: `apps/api/src/lib/auth.ts`
- Modify: `apps/api/src/lib/sync-simulator.ts`
- Modify: `apps/api/src/lib/sync-cleanup.ts`

**Pattern:**

```diff
- import { staff } from "@repo/database/api-schema";
+ import { staff } from "@sync-contract/api-schema";
```

**Step 1: Update each file**

Use find-and-replace: `from "@repo/database/api-schema"` → `from "@sync-contract/api-schema"`

**Step 2: Verify**

```bash
cd apps/api && bun run typecheck && bun run test
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: migrate API app imports to @sync-contract"
```

---

## Phase 6: Update Build & Config Files

### Task 7: Update Rust include_str! path

**Files:**
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Update the path**

```diff
- "../../../../packages/database/generated/2026-06-03/sync-contract.json"
+ "../../../../packages/sync-contract/generated/2026-06-03/sync-contract.json"
```

**Step 2: Verify**

```bash
cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: update Rust include_str! path to sync-contract"
```

---

### Task 8: Update root workspace scripts and biome config

**Files:**
- Modify: `package.json` (root)
- Modify: `biome.jsonc`

**Step 1: Update root package.json scripts**

Change all `cd packages/database` → `cd packages/sync-contract`:

```diff
- "generate:sync": "cd packages/database && bunx baresync generate",
- "generate:sync:check": "cd packages/database && bunx baresync generate --check",
- "generate:sync:doctor": "cd packages/database && bunx baresync doctor"
+ "generate:sync": "cd packages/sync-contract && bunx baresync generate",
+ "generate:sync:check": "cd packages/sync-contract && bunx baresync generate --check",
+ "generate:sync:doctor": "cd packages/sync-contract && bunx baresync doctor"
```

**Step 2: Update biome.jsonc**

Change `"packages/database/src/**"` → `"packages/sync-contract/src/**"`.

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: update root scripts and biome config for sync-contract"
```

---

### Task 9: Update drizzle config paths

**Files:**
- Modify: `apps/pos-app/drizzle.config.ts`
- Modify: `apps/api/drizzle.config.ts`

**Step 1: Update pos-app drizzle config**

```diff
- schema: "../../packages/database/src/local-schema.ts",
+ schema: "../../packages/sync-contract/src/local-schema.ts",
```

**Step 2: Update api drizzle config**

```diff
- schema: path.resolve(__dirname, "../../packages/database/src/api-schema.ts"),
+ schema: path.resolve(__dirname, "../../packages/sync-contract/src/api-schema.ts"),
```

**Step 3: Commit**

```bash
git add -A
git commit -m "♻️ refactor: update drizzle config paths for sync-contract"
```

---

## Phase 7: Final Verification

### Task 10: Full verification

**Step 1: Run all checks**

```bash
cd /home/eekrain/CODE/sakti-pos
bun install
bun x ultracite check

cd apps/pos-app && bun run typecheck
cd apps/pos-app && bun run test

cd apps/api && bun run typecheck
cd apps/api && bun run test

cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

**Step 2: Verify sync generation still works**

```bash
bun run generate:sync
```

**Step 3: Final commit if needed**

---

## Known Issue: Missing Schema Snapshots

The baresync generator (v0.2.3) only produces 3 files:
1. `sync-contract.json`
2. `sync-table-order.ts`
3. `sync-contract.manifest.json`

**Missing:** Frozen schema snapshots (`api-synced-schema.ts`, `local-synced-schema.ts`).

The SKILL.md says the generator produces "Frozen schema snapshots — server imports from these." The server.md says to import from `@sync-contract/generated/<date>/api-synced-schema`. But the generator doesn't produce these files yet.

**Impact:** None for now — the API app imports from `@sync-contract/api-schema` (source file). Schema versioning via frozen snapshots is not yet functional in baresync 0.2.3. This should be revisited when baresync adds this feature.

---

## Summary

| Phase | Tasks | Risk |
|-------|-------|------|
| 1. Rename directory & package.json | 1 | Low — filesystem only |
| 2. Update workspace dependencies | 2 | Low — bun install |
| 3. Update tsconfig paths | 3 | Low — IDE config only |
| 4. Migrate POS app imports | 4-5 | Low — find-and-replace |
| 5. Migrate API app imports | 6 | Low — find-and-replace |
| 6. Update build & config | 7-9 | Low — path updates |
| 7. Final verification | 10 | — |

**Total: 10 tasks across 7 phases. ~40 files touched. Pure mechanical rename.**
