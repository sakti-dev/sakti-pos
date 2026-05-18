# adb DB Snapshot Trigger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dev-only adb-triggered path that exports the local POS SQLite snapshot without using the UI, and make the host sync script overwrite the repo snapshot in place.

**Architecture:** The app will keep the existing Tauri snapshot export command as the single export implementation. A dev-only Android broadcast receiver will translate an adb broadcast into a custom deep link, and the Rust side will listen for that deep link and invoke the export helper. The host sync script will copy the exported device snapshot into the repo snapshot path atomically and overwrite any previous file so Drizzle Studio always opens the latest copy.

**Tech Stack:** Rust, Tauri 2 mobile plugins, Android debug source sets, Bash, SQLite `VACUUM INTO`, Bun test runners.

---

### Task 1: Add a shared Rust export helper and deep-link handler

**Files:**
- Modify: `apps/pos-app/src-tauri/src/db/snapshot.rs`
- Modify: `apps/pos-app/src-tauri/src/app/startup.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/Cargo.toml`
- Test: `apps/pos-app/src-tauri/src/db/__test__/snapshot.test.rs` if needed, otherwise add focused tests beside the helper

**Step 1: Write the failing test**

Add a small Rust test for the URL matcher that should accept the debug export scheme and reject everything else.

**Step 2: Run the test to verify it fails**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml snapshot -- --nocapture`
Expected: FAIL because the deep-link matcher and shared helper do not exist yet.

**Step 3: Write the minimal implementation**

Refactor the snapshot export logic into a shared helper that both the Tauri command and the deep-link handler can call, then wire the app startup to listen for the export URL and call that helper.

**Step 4: Run the test to verify it passes**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml snapshot -- --nocapture`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/db/snapshot.rs apps/pos-app/src-tauri/src/app/startup.rs apps/pos-app/src-tauri/src/lib.rs apps/pos-app/src-tauri/Cargo.toml apps/pos-app/src-tauri/src/db/__test__/snapshot.test.rs
git commit -m "feat(pos): add adb-triggered db snapshot export hook"
```

### Task 2: Add a dev-only adb bridge in Android debug sources

**Files:**
- Create: `apps/pos-app/src-tauri/gen/android/app/src/debug/AndroidManifest.xml`
- Create: `apps/pos-app/src-tauri/gen/android/app/src/debug/java/com/sakti_dev/sakti_pos/debug/DbSnapshotExportReceiver.kt`
- Modify: `apps/pos-app/src-tauri/gen/android/app/src/main/AndroidManifest.xml` only if the debug source set needs a shared component declaration
- Test: `apps/pos-app/src-tauri/gen/android` build or the targeted Android build command already used by the app

**Step 1: Write the failing test**

Add a small unit test for the receiver intent action or the URL it forwards to, depending on the receiver shape.

**Step 2: Run the test to verify it fails**

Run: `./gradlew assembleDebug` from `apps/pos-app/src-tauri/gen/android`
Expected: FAIL because the debug receiver does not exist yet.

**Step 3: Write the minimal implementation**

Add the debug-only receiver and manifest entry so `adb shell am broadcast` can trigger the app export path without any UI interaction.

**Step 4: Run the test to verify it passes**

Run: `./gradlew assembleDebug`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/gen/android/app/src/debug/AndroidManifest.xml apps/pos-app/src-tauri/gen/android/app/src/debug/java/com/sakti_dev/sakti_pos/debug/DbSnapshotExportReceiver.kt
git commit -m "feat(pos): add adb broadcast snapshot trigger"
```

### Task 3: Make host snapshot sync overwrite the repo file safely

**Files:**
- Modify: `apps/pos-app/scripts/sync-db-snapshot`
- Test: `apps/pos-app/scripts/__test__/sync-db-snapshot.test.sh` or a focused shell test harness

**Step 1: Write the failing test**

Create a shell test that pre-populates the host snapshot file, runs the sync script, and asserts the file is replaced without manual deletion.

**Step 2: Run the test to verify it fails**

Run: `bash apps/pos-app/scripts/__test__/sync-db-snapshot.test.sh`
Expected: FAIL because the script still assumes the host snapshot path is disposable.

**Step 3: Write the minimal implementation**

Make the script copy into a temporary file and move it into place atomically, or delete the target file itself before writing.

**Step 4: Run the test to verify it passes**

Run: `bash apps/pos-app/scripts/__test__/sync-db-snapshot.test.sh`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/scripts/sync-db-snapshot apps/pos-app/scripts/__test__/sync-db-snapshot.test.sh
git commit -m "feat(pos): make db snapshot sync overwrite-safe"
```

### Task 4: Update docs and log filters for the new adb flow

**Files:**
- Modify: `docs/DOCUMENTED-LOG-PREFIX.md`
- Modify: `logs/capture-adb-logcat.sh`
- Modify: `package.json` if a new convenience script is needed

**Step 1: Write the failing test**

No code test needed; verify the document and log filter still include the new DB snapshot export prefixes after the code lands.

**Step 2: Run the test to verify it fails**

Run: `bun x ultracite check docs/DOCUMENTED-LOG-PREFIX.md logs/capture-adb-logcat.sh`
Expected: FAIL or report missing coverage until the new prefixes are added.

**Step 3: Write the minimal implementation**

Add the adb-export prefix and the broadcast/deep-link logs to the support docs and capture filter.

**Step 4: Run the test to verify it passes**

Run: `bun x ultracite check docs/DOCUMENTED-LOG-PREFIX.md logs/capture-adb-logcat.sh`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/DOCUMENTED-LOG-PREFIX.md logs/capture-adb-logcat.sh package.json
git commit -m "docs(pos): document adb snapshot export flow"
```
