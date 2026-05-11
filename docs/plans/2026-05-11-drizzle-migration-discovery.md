# Drizzle Migration Discovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Tauri app discover and apply local Drizzle migration files automatically from the embedded `apps/pos-app/drizzle` directory instead of maintaining a hardcoded Rust migration list.

**Architecture:** Keep the migration SQL files as the source of truth in `apps/pos-app/drizzle`, but stop manually enumerating them in Rust. At build time, embed the migration directory contents into the Tauri binary and have the Rust migration runner load, sort, and apply the embedded SQL files by filename. Preserve the existing `__drizzle_migrations` tracking table so already-applied migrations are still skipped safely.

**Tech Stack:** Rust, Tauri 2, SQLx SQLite, Drizzle Kit-generated SQL files, Bun for workspace checks.

---

### Task 1: Define the migration source shape

**Files:**
- Modify: `apps/pos-app/src-tauri/src/drizzle_proxy.rs`
- Modify: `apps/pos-app/src-tauri/Cargo.toml`

**Step 1: Read the current migration runner**

Inspect the existing hardcoded `MIGRATIONS` constant and the `run_migrations` loop to confirm the minimal data the loader needs: migration name, SQL body, and stable ordering.

**Step 2: Introduce a migration entry type**

Add a small Rust struct for embedded migrations, with fields for:
- `name`
- `sql`

Keep it local to `drizzle_proxy.rs` unless a helper module becomes necessary.

**Step 3: Add the embedding dependency if needed**

Use a build-time embedding crate or an equivalent approach that lets the Rust binary include the contents of `apps/pos-app/drizzle` without scanning the installed filesystem at runtime.

**Step 4: Run a focused compile check**

Run: `cargo check`

Expected: the code still fails at this stage only if the embedding helper is not yet wired up, but the new type should compile once wired.

### Task 2: Replace the hardcoded migration array with directory-driven discovery

**Files:**
- Modify: `apps/pos-app/src-tauri/src/drizzle_proxy.rs`
- Modify: `apps/pos-app/src-tauri/build.rs` if required by the chosen embedding approach

**Step 1: Write a failing test for ordering**

Add a small unit test around the migration discovery helper that proves:
- only `.sql` files are collected
- filenames are sorted lexicographically
- the migration name is derived from the file stem

Keep the test isolated from the database so it fails fast and only exercises the discovery logic.

**Step 2: Run the test to confirm the current implementation fails**

Run: `cargo test drizzle_proxy -- --nocapture`

Expected: fail or be unable to compile until the discovery helper exists.

**Step 3: Implement the discovery helper**

Replace the static `MIGRATIONS` array with a function that returns ordered embedded migrations from the `apps/pos-app/drizzle` directory.

Required behavior:
- ignore non-`.sql` files
- sort by filename
- map each file into the existing migration application loop
- continue to store the migration hash in `__drizzle_migrations`

**Step 4: Keep the existing migration execution semantics**

Do not change how statements are split on `--> statement-breakpoint`, how duplicate-column errors are handled, or how applied migrations are skipped.

**Step 5: Run the focused test again**

Run: `cargo test drizzle_proxy -- --nocapture`

Expected: the discovery test passes and the migration runner still compiles.

### Task 3: Verify the app build and repository checks

**Files:**
- None beyond the code changes above

**Step 1: Run the Rust build check**

Run: `cargo check`

Expected: pass. If it fails because the local environment lacks a C compiler, note that as an environment limitation rather than a code failure.

**Step 2: Run Ultracite**

Run: `bun x ultracite check`

Expected: pass without fixes.

**Step 3: Run the existing relevant app checks**

Run:
- `bun run typecheck` in `apps/pos-app`
- `bun run typecheck` in `apps/api`

Expected: both pass.

### Task 4: Clean up migration metadata assumptions

**Files:**
- Modify: `apps/pos-app/drizzle/meta/_journal.json` only if the generated metadata must stay aligned with the embedded migration list
- Modify: `apps/pos-app/src-tauri/build.rs` if the metadata or file embedding needs regeneration hooks

**Step 1: Decide whether runtime code depends on Drizzle metadata**

Confirm that the app runtime only relies on embedded `.sql` files and `__drizzle_migrations`, not on `_journal.json`.

**Step 2: Keep metadata as tooling-only**

If the journal is still useful for Drizzle CLI generation, keep it checked in. If not, document that it is no longer part of runtime migration behavior.

**Step 3: Document the operational rule**

Add a short note in the repo docs or in a code comment that migration files are added by dropping a new `.sql` file into `apps/pos-app/drizzle`, and the Rust side will pick it up automatically.

**Step 4: Final verification**

Run the same checks from Task 3 again if any build wiring changed.

