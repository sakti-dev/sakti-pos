# DB Snapshot Inspector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dev-only Settings action that exports the local POS SQLite database to a stable snapshot path so Drizzle Studio can inspect the live Android/Waydroid state without Android Studio.

**Architecture:** The app will expose a Tauri command that creates a consistent SQLite snapshot from the current local DB and writes it to a writable snapshot location. The settings page will show a hidden dev-only action that triggers the command and reports the snapshot path back to the user. The snapshot path should prefer a repo-fixed location when the dev environment makes that writable, and otherwise fall back to an app-local snapshot directory.

**Tech Stack:** Tauri commands, SQLite `VACUUM INTO`, SolidJS settings UI, Vitest, Rust unit tests, Ultracite/Biome, dev-only env vars.

---

### Task 1: Add a snapshot-path resolver and export command

**Files:**
- Create: `apps/pos-app/src-tauri/src/db/snapshot.rs`
- Modify: `apps/pos-app/src-tauri/src/db/drizzle_proxy.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Test: `apps/pos-app/src-tauri/src/db/__test__/snapshot.test.rs`

**Step 1: Write the failing test**

Add Rust tests for:
- resolving a preferred repo snapshot path when one is configured
- falling back to the app config dir when no dev snapshot path is configured
- rejecting paths that cannot be resolved or are empty

**Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml snapshot -- --nocapture`
Expected: FAIL because the snapshot helper does not exist yet.

**Step 3: Write minimal implementation**

Implement:
- a pure helper that resolves the export path from a preferred override plus the app config dir
- a Tauri command that runs SQLite `VACUUM INTO` against the resolved target path
- a return type that includes the written snapshot path
- command registration in `src-tauri/src/lib.rs`

**Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml snapshot -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/db/snapshot.rs apps/pos-app/src-tauri/src/db/drizzle_proxy.rs apps/pos-app/src-tauri/src/lib.rs apps/pos-app/src-tauri/src/db/__test__/snapshot.test.rs
git commit -m "feat(pos): add db snapshot export command"
```

### Task 2: Surface the export action in Settings

**Files:**
- Modify: `apps/pos-app/src/pages/settings/use-settings.ts`
- Modify: `apps/pos-app/src/pages/settings/settings-home.tsx`
- Test: `apps/pos-app/src/pages/settings/__test__/settings.test.tsx`

**Step 1: Write the failing test**

Add tests for:
- the export action is visible in dev mode
- the export action is hidden when dev mode is off
- clicking the action invokes the export command and reports success/failure

**Step 2: Run test to verify it fails**

Run: `bun test apps/pos-app/src/pages/settings/__test__/settings.test.tsx`
Expected: FAIL because the UI action and handler do not exist yet.

**Step 3: Write minimal implementation**

Implement:
- a dev-only settings action/button
- a settings handler that calls the new export command
- a success path that shows the snapshot path
- a failure path that surfaces the export error

**Step 4: Run test to verify it passes**

Run: `bun test apps/pos-app/src/pages/settings/__test__/settings.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/settings/use-settings.ts apps/pos-app/src/pages/settings/settings-home.tsx apps/pos-app/src/pages/settings/__test__/settings.test.tsx
git commit -m "feat(pos): add dev db snapshot export action"
```

### Task 3: Make the repo path usable during dev and document logging

**Files:**
- Modify: `apps/pos-app/scripts/dev`
- Modify: `docs/DOCUMENTED-LOG-PREFIX.md`
- Modify: `logs/capture-adb-logcat.sh`
- Add: `apps/pos-app/.db-snapshots/.gitignore`

**Step 1: Write the failing test**

No automated test required for the launcher script, but validate the target path and log prefixes manually before merging.

**Step 2: Run test to verify it fails**

Run: `bash -n apps/pos-app/scripts/dev && bash -n logs/capture-adb-logcat.sh`
Expected: PASS before and after edits; the actual missing behavior is the repo snapshot path/env wiring.

**Step 3: Write minimal implementation**

Implement:
- a dev env var for the snapshot target path that points at a fixed repo location when possible
- a `.gitignore` entry so generated snapshots are never committed
- DB snapshot log prefix entries for the new export action
- `LOG_FILTER` coverage for the new DB snapshot logs

**Step 4: Run test to verify it passes**

Run:
```bash
bash -n apps/pos-app/scripts/dev
bash -n logs/capture-adb-logcat.sh
bun x ultracite check docs/DOCUMENTED-LOG-PREFIX.md
```
Expected: PASS

**Step 5: Commit**

```bash
git add apps/pos-app/scripts/dev apps/pos-app/.db-snapshots/.gitignore docs/DOCUMENTED-LOG-PREFIX.md logs/capture-adb-logcat.sh
git commit -m "feat(pos): make db snapshot export dev-friendly"
```
