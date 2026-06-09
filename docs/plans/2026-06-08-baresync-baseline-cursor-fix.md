# Fix baresync Baseline Pull Cursor Storage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `baresync-core` so that a baseline pull stores a cursor when no existing cursor exists, eliminating repeated FullResync on every app open and the infinite `needs_baseline_sync=true` state.

**Architecture:** The bug is in `pull.rs:162` — the cursor storage guard only runs for `PullStartCursor::Stored`, but `run_full_resync` passes `PullStartCursor::Baseline`. The fix extends the guard to also store on baseline pulls when no cursor row exists for the scope. This preserves the documented invariant ("baseline pulls never overwrite an existing cursor") while fixing first-sync cursor storage.

**Tech Stack:** Rust, tokio async tests, baresync-core internal test harness (`RecordingTransport`, `temp_db`, `test_engine_with_transport`)

---

## Bug Walkthrough

### The broken flow (current)

```
1. App opens → syncNow() → get_sync_local_state() → no cursor → needs_baseline_sync=true
2. Engine chooses FullResync → calls pull(Baseline) → server returns rows + cursor "sync:..."
3. pull() applies rows, reaches line 162:
     if matches!(start_cursor, PullStartCursor::Stored) && !new_cursor.is_empty()
   → FALSE (start_cursor is Baseline) → cursor NOT stored
4. Back in engine, push() runs, GC runs, sync_now returns FullResync
5. sync-status-changed handler fires → getState() → no cursor → needs_baseline_sync=true
6. UI spinner stays on; next syncNow() repeats FullResync from step 1
```

### The fixed flow

```
1-2. Same as above
3. pull() applies rows, reaches fixed guard:
     if !new_cursor.is_empty() {
       if matches!(start_cursor, PullStartCursor::Stored) {
         // incremental: always store
       } else if get_last_cursor(db, scope_id)?.is_empty() {
         // baseline + no existing cursor: store initial cursor
       }
     }
   → cursor stored
4. sync_now returns FullResync
5. sync-status-changed handler → getState() → cursor found → needs_baseline_sync=false
6. Next syncNow() → incremental PullOnly instead of FullResync
```

### Why the original guard existed

The test `baseline_pull_does_not_advance_stored_cursor` proves that when a cursor ALREADY EXISTS, a baseline pull (e.g. re-pulling rejected tables after push) must NOT overwrite it. This invariant is preserved — the fix only stores when no cursor row exists.

## Evidence from Production Logs

### Issue 1: FullResync on every app open (cursor never stored)

The app only performed registration → pin → login — **no local writes were ever made**. FullResync ran successfully on first open, then the app was closed and reopened with zero local changes. Despite the successful first sync, the second open repeats the full FullResync instead of using an incremental PullOnly:

```
# ──── First open (PID 6328) ────
[baresync] sync_now: scope_id=019ea84a-..., local_dirty=0, server_has_changes=true, changed_tables=["registers"], needs_baseline=true
[baresync] sync_now completed: mode=FullResync
[JS] [SYNC:RESULT] result mode=full_resync pull_rows=1 pull_server_time=2026-06-08T17:58:16.314Z
[JS] [SYNC:STATUS_CHANGED] status_changed needs_baseline_sync=true local_dirty_count=0
                                                                   ↑ should be false after successful sync
# ──── App closed, reopened (PID 6530) ────
[baresync] sync_now: scope_id=019ea84a-..., local_dirty=0, server_has_changes=true, changed_tables=["registers"], needs_baseline=true
                                                                                                                                ↑ still true!
[baresync] sync_now completed: mode=FullResync
[JS] [SYNC:RESULT] result mode=full_resync pull_rows=1 pull_server_time=2026-06-08T18:02:02.166Z
[JS] [SYNC:STATUS_CHANGED] status_changed needs_baseline_sync=true local_dirty_count=0
```

**What should happen:** After the first FullResync, the cursor from the pull response (`2026-06-08T17:58:16.314Z`) should be written to `sync_cursors`. On the second open, `get_sync_local_state()` finds the cursor → `needs_baseline_sync=false` → engine picks `PullOnly` (cheap incremental pull). Instead, the cursor was never stored, so every open is a full baseline pull.

**Cost:** FullResync sends an empty cursor, so the server returns ALL rows for ALL 10 synced tables. With production data growing, this becomes a full table scan on every app launch.

### Issue 2: Sync status indicator stuck on infinite spinner

The `SyncStatusIndicator` component showed a spinning cloud icon permanently. The spinner shows when `syncStatus() === "syncing"`. Here's why it never cleared:

```
# The polling sync-status-changed handler sets "syncing" when needs_baseline_sync=true:
[JS] [SYNC:STATUS_CHANGED] status_changed needs_baseline_sync=true local_dirty_count=0
                                                                   ↑ true because cursor never stored (Issue 1)
# Handler code (BEFORE our POS-side fix):
#   if (state.needs_baseline_sync || state.local_dirty_count > 0) {
#     setSyncStatus("syncing");   ← sets syncing because needs_baseline_sync is true
#   } else {
#     setSyncStatus("idle");      ← never reached
#   }
```

The baresync engine completed the sync successfully (`sync_now completed: mode=FullResync`, HTTP 200), but `getState()` still returned `needs_baseline_sync=true` because the cursor was never stored. The handler set "syncing" and with a 300s polling interval, the spinner ran for 5 minutes until the next cycle — which would do another FullResync and set "syncing" again, ad infinitum.

**There were zero diagnostic logs** for this path before our POS-side fix. All errors were silently swallowed with `.catch(() => {})` in the provider.

### Root Cause Chain

```
pull.rs:162 guard only stores cursor for PullStartCursor::Stored
  → run_full_resync passes PullStartCursor::Baseline
    → cursor never written to sync_cursors
      → get_sync_local_state() finds empty cursor → needs_baseline_sync=true forever
        → every syncNow() chooses FullResync (expensive)
        → sync-status-changed handler sets "syncing" (spinner stuck)
```

### Ruling out POS-side misconfiguration

The POS app only performed registration → pin creation → login. **No local writes were made** (`writeTransaction` / `writeLocalChange` were never called). This raised the question: is the empty cursor a POS-side misconfiguration, or an engine bug?

**Checked every code path that touches `sync_cursors`:**

1. **JS `writeTransaction` + `writeLocalChange`** (`baresync/dist/chunk-7EP6ZHMB.js:86-92`): `writeTransaction` is just `db.transaction(callback)`. `writeLocalChange` runs the write callback and inserts into `sync_outbox`. Neither touches `sync_cursors`.

2. **Rust `set_last_cursor_tx`** (`baresync-core/src/cursor.rs:14`): The only function that writes to `sync_cursors`. Grepped the entire `baresync-core` and `tauri-plugin-baresync` source trees — **`pull.rs:163` is the sole call site**. No write path, no transaction handler, no client setup, and no migration seeds cursors.

3. **POS app Drizzle migrations** (`apps/pos-app/src-tauri/migrations/0000_init.sql:53`): Creates the `sync_cursors` table with `CREATE TABLE`. Runs once via `__drizzle_migrations` tracking. Never drops, truncates, or clears data.

**Conclusion:** The POS side is correct. The empty cursor is not caused by missing writes or misconfiguration. `pull.rs:163` is the only place in the entire baresync codebase that writes cursors, and the guard at line 162 prevents it from running for baseline pulls. This is a baresync engine bug.

### Issue 3: Device database confirmation — `sync_cursors` table is empty

Pulled `baresync.db` from the Waydroid device after the two FullResync cycles shown above:

```sql
-- All synced tables exist with pulled data:
merchants  → 1 row
outlets    → 1 row
registers  → 1 row
staff      → 1 row

-- But sync_cursors is COMPLETELY EMPTY:
SELECT * FROM sync_cursors;
-- (zero rows)

-- And sync_outbox is clean:
SELECT * FROM sync_outbox;
-- (zero rows)
```

**This is the smoking gun.** The engine pulled 4 rows across 2 FullResync cycles, stored them in the synced tables, but never wrote a cursor to `sync_cursors`. On the next app open, `get_sync_local_state()` queries `sync_cursors`, finds nothing, and sets `needs_baseline_sync=true` — triggering yet another FullResync.

The DB uses WAL mode — the 370KB WAL file contains all the data while the main file is only 4KB. To inspect on a Waydroid device, pull all three files:

```bash
doas waydroid shell -- cat /data/user/0/com.sakti_dev.sakti_pos/baresync.db > baresync-device.db
doas waydroid shell -- cat /data/user/0/com.sakti_dev.sakti_pos/baresync.db-wal > baresync-device.db-wal
doas waydroid shell -- cat /data/user/0/com.sakti_dev.sakti_pos/baresync.db-shm > baresync-device.db-shm
sqlite3 baresync-device.db "SELECT * FROM sync_cursors;"
```

## Files

### baresync repo (changes in baresync-core crate)

| File | Action | Responsibility |
|------|--------|---------------|
| `crates/baresync-core/src/pull.rs` | Modify | Fix cursor storage guard at line 162 |
| `crates/baresync-core/tests/simulation.rs` | Modify | Add regression test + update existing test |

### Sakti POS repo (already done — for reference only)

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/pos-app/src/providers/sync-client-provider.tsx` | Done | Added logging, removed `needs_baseline_sync` from UI syncing condition |
| `docs/DOCUMENTED-LOG-PREFIX.md` | Done | Documented 7 new SYNC provider prefixes |
| `logs/capture-adb-logcat.sh` | Done | Added provider log keys to LOG_FILTER |

---

## Task 1: Write failing regression test — baseline pull stores cursor when no existing cursor

**Files:**
- Modify: `crates/baresync-core/tests/simulation.rs`

**Context:** The existing test `baseline_pull_does_not_advance_stored_cursor` (line 898) proves the guard works when a cursor DOES exist. We need the inverse test: when NO cursor exists, a baseline pull MUST store the returned cursor.

- [ ] **Step 1: Write the failing test**

Add this test after `baseline_pull_does_not_advance_stored_cursor` (after line 933):

```rust
#[tokio::test]
async fn baseline_pull_stores_cursor_when_no_existing_cursor() {
    let pool = temp_db().await;
    // Deliberately do NOT seed a cursor — simulates first sync

    let response = fixtures::pull_response(true, false, None);
    let _ = pull::apply_pull_batch_tables_tx(
        &pool,
        &["categories".to_string()],
        &[],
        response.get("tables").unwrap(),
        "2026-05-19T12:00:00.000Z",
        &[],
    )
    .await
    .unwrap();

    let new_cursor = response
        .get("cursor")
        .and_then(|c| c.as_str())
        .unwrap_or("");
    assert!(!new_cursor.is_empty(), "fixture must return a cursor");

    // After baseline pull with no existing cursor, cursor should be stored
    let cursor: String =
        db_scalar("SELECT last_cursor FROM sync_cursors WHERE scope_id = 'merchant-1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(cursor, new_cursor);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --package baresync-core baseline_pull_stores_cursor_when_no_existing_cursor`
Expected: FAIL — `cursor` is empty string, not `"sync:1716120000000:products:prod-1"`

---

## Task 2: Fix pull.rs cursor storage guard

**Files:**
- Modify: `crates/baresync-core/src/pull.rs:162-166`

**Context:** The current code at line 162 only stores cursor for `PullStartCursor::Stored`. We change it to also store on `Baseline` when no existing cursor row exists for the scope.

- [ ] **Step 3: Replace the cursor storage guard**

In `crates/baresync-core/src/pull.rs`, replace lines 162-166:

```rust
    if matches!(start_cursor, PullStartCursor::Stored) && !new_cursor.is_empty() {
        cursor::set_last_cursor_tx(db, &config.scope_id, &new_cursor)
            .await
            .map_err(SyncError::Database)?;
    }
```

With:

```rust
    if !new_cursor.is_empty() {
        if matches!(start_cursor, PullStartCursor::Stored) {
            cursor::set_last_cursor_tx(db, &config.scope_id, &new_cursor)
                .await
                .map_err(SyncError::Database)?;
        } else if cursor::get_last_cursor(db, &config.scope_id)
            .await
            .map_err(SyncError::Database)?
            .is_empty()
        {
            cursor::set_last_cursor_tx(db, &config.scope_id, &new_cursor)
                .await
                .map_err(SyncError::Database)?;
        }
    }
```

This preserves the invariant: `PullStartCursor::Baseline` only stores when no cursor row exists (first sync). If a cursor already exists, baseline pulls skip storage.

- [ ] **Step 4: Run the regression test from Task 1**

Run: `cargo test --package baresync-core baseline_pull_stores_cursor_when_no_existing_cursor`
Expected: PASS

- [ ] **Step 5: Run the existing guard test to confirm invariant holds**

Run: `cargo test --package baresync-core baseline_pull_does_not_advance_stored_cursor`
Expected: PASS — the existing test seeds a cursor before baseline pull, so the new `else if` branch reads a non-empty cursor and skips storage.

- [ ] **Step 6: Commit**

```bash
git add crates/baresync-core/src/pull.rs
git commit -m "fix: store cursor on baseline pull when no existing cursor"
```

---

## Task 3: Add integration test — FullResync then syncNow uses PullOnly

**Files:**
- Modify: `crates/baresync-core/tests/simulation.rs`

**Context:** This proves the end-to-end fix: after a FullResync (which calls pull with Baseline), the next `syncNow()` should see a stored cursor and choose incremental mode (PullOnly) instead of FullResync again.

- [ ] **Step 7: Write the integration test**

Add this test after `sync_now_preserves_baseline_sync_when_local_cursor_missing` (after line 552):

```rust
#[tokio::test]
async fn sync_now_uses_incremental_after_full_resync() {
    let pool = temp_db().await;
    let pool_for_second = pool.clone();

    // First sync: no cursor → FullResync
    let first_transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:first",
            "serverTime": "2026-05-19T12:00:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [{
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Drinks",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-19T12:00:00.000Z"
            }],
            "deletedIds": []
        }])),
    );
    let engine = test_engine_with_transport(pool, first_transport.clone(), "merchant-1").await;

    let first_result = engine.sync_now(1000).await.unwrap();
    assert_eq!(first_result.mode, baresync_core::engine::SyncNowMode::FullResync);

    // Verify cursor was stored
    let state = engine.get_sync_local_state().await.unwrap();
    assert!(!state.needs_baseline_sync, "cursor should be stored after FullResync");

    // Second sync: cursor exists → should NOT be FullResync
    let second_transport = RecordingTransport::new(
        response_with_table_ack("categories", vec![]),
        serde_json::json!({
            "changedTables": ["categories"],
            "hasChanges": true,
            "cursor": "sync:second",
            "serverTime": "2026-05-19T12:01:00.000Z",
        }),
        response_with_pull_tables(serde_json::json!([{
            "table": "categories",
            "changedRows": [{
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Drinks Updated",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-19T12:01:00.000Z"
            }],
            "deletedIds": []
        }])),
    );
    let engine2 = test_engine_with_transport(
        pool_for_second,
        second_transport.clone(),
        "merchant-1",
    ).await;

    let second_result = engine2.sync_now(1000).await.unwrap();
    assert_ne!(
        second_result.mode,
        baresync_core::engine::SyncNowMode::FullResync,
        "second sync should use incremental mode, not FullResync"
    );
}
```

`DbClient` derives `Clone`, so `pool.clone()` shares the same underlying SQLite connection. The second engine reads the cursor stored by the first sync.

- [ ] **Step 8: Run the integration test**

Run: `cargo test --package baresync-core sync_now_uses_incremental_after_full_resync`
Expected: PASS (because Task 2 already fixed the cursor storage)

- [ ] **Step 9: Commit**

```bash
git add crates/baresync-core/tests/simulation.rs
git commit -m "test: add regression test for incremental sync after FullResync"
```

---

## Task 4: Run full test suite and verify no regressions

- [ ] **Step 10: Run all baresync-core tests**

Run: `cargo test --package baresync-core`
Expected: All tests pass, including:
- `baseline_pull_does_not_advance_stored_cursor` (existing invariant)
- `baseline_pull_stores_cursor_when_no_existing_cursor` (new regression test)
- `sync_now_uses_incremental_after_full_resync` (new integration test)
- `sync_now_preserves_baseline_sync_when_local_cursor_missing` (existing test — now cursor IS stored after FullResync, so `needs_baseline` becomes false)

**Note:** The existing test `sync_now_preserves_baseline_sync_when_local_cursor_missing` (line 520) does NOT check `needs_baseline_sync` after the sync — it only checks the mode and that the pull request has an empty cursor. It should continue to pass unchanged.

- [ ] **Step 11: Commit all changes if any test fixes were needed**

```bash
git add -A
git commit -m "fix: baresync baseline pull cursor storage — resolves repeated FullResync"
```

---

## Task 5: Publish and update Sakti POS

- [ ] **Step 12: Bump baresync-core version and publish**

In the baresync repo:
1. Update `crates/baresync-core/Cargo.toml` version to `0.4.3`
2. Update `crates/tauri-plugin-baresync/Cargo.toml` dependency to `baresync-core = "0.4.3"`
3. Update `crates/tauri-plugin-baresync/Cargo.toml` version to `0.4.3`
4. Run `cargo publish --package baresync-core && cargo publish --package tauri-plugin-baresync`
5. Publish npm packages if needed (`baresync` npm package version should match)

- [ ] **Step 13: Update Sakti POS dependencies**

In the Sakti POS repo:
1. Update `apps/pos-app/src-tauri/Cargo.toml`: `tauri-plugin-baresync = "0.4.3"`
2. Update `apps/api/package.json`: `"baresync": "0.4.3"`
3. Update `apps/pos-app/package.json`: `"baresync": "0.4.3"`
4. Update `packages/sync-contract/package.json`: `"baresync": "0.4.3"`
5. Run `bun install && cargo build`

- [ ] **Step 14: Verify on device**

```bash
# Build and deploy to Android device
cd apps/pos-app && bun run tauri android dev

# Capture logs in another terminal
bash logs/capture-adb-logcat.sh
```

Expected log sequence:
```
[baresync] sync_now: needs_baseline=true → FullResync    ← first open
[baresync] sync_now completed: mode=FullResync
[JS] [SYNC:STATUS_CHANGED] needs_baseline_sync=false     ← cursor stored!
# Kill and reopen app
[baresync] sync_now: needs_baseline=false → PullOnly     ← incremental!
[baresync] sync_now completed: mode=PullOnly
```

- [ ] **Step 15: Final commit in Sakti POS**

```bash
git add -A
git commit -m "chore: bump baresync to 0.4.3 — baseline cursor fix"
```
