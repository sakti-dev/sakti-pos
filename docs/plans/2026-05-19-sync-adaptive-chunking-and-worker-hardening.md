# Sync Adaptive Chunking And Worker Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make POS sync push resilient to payload and database limits across Cloudflare Workers, Turso/libSQL, SQLite, and future PostgreSQL deployments.

**Architecture:** POS owns byte-aware push chunking and split-on-413 retries before sending protobuf push batches. API keeps hard request and row caps plus DB write chunking by bind-parameter limits. Rejected-row reconciliation avoids cursor drift by pulling rejected tables from baseline, and JS receives structured native sync errors instead of parsing strings.

**Tech Stack:** Rust/Tauri/sqlx/prost, TypeScript/Solid/Bun/Elysia/Drizzle, generated sync protobuf, Ultracite/Biome.

---

## Limits

- Cloudflare Workers Free has a 10 ms CPU limit and 128 MB memory, so the default POS push target is `256 KiB`.
- API hard push body limit remains `2 MiB`.
- API hard push row limit remains `2000`.
- API DB write chunks stay below `30_000` bind parameters, below SQLite/libSQL's `32766` and PostgreSQL's `65,535`.

## Tasks

### Task 1: Adaptive POS Push Chunking

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Test: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Steps:**
1. Add failing tests for encoded-byte chunking at `256 KiB`, preserving outbox IDs and splitting a single large table by byte size.
2. Implement chunking that considers row count and encoded protobuf byte length.
3. Preserve deterministic idempotency keys from each chunk's outbox IDs.

### Task 2: Split-On-413 Retry

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Test: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Steps:**
1. Add tests for recursive chunk splitting after a simulated 413 and permanent single-row failure.
2. Implement retry splitting without unbounded retries.
3. Return a structured permanent payload error for single-row 413.

### Task 3: Structured Native Sync Errors

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/pull.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `apps/pos-app/src/store/sync.ts`
- Test: `apps/pos-app/src/store/__test__/sync.test.ts`

**Steps:**
1. Add JS tests for structured native errors.
2. Return JSON error strings from native commands with `kind`, `status`, and `message`.
3. Classify structured errors before falling back to legacy string parsing.

### Task 4: Rejected-Row Reconciliation Without Cursor Drift

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Test: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Steps:**
1. Track rejected tables in `PushResult`.
2. Pull rejected tables from baseline after server-wins rows so older server rows are not skipped by the stored cursor.
3. Keep normal pull behavior cursor-based.

### Task 5: Pending Outbox Uniqueness

**Files:**
- Modify: `packages/database/src/local-schema.ts`
- Create: `apps/pos-app/drizzle/0001_sync_outbox_pending_unique.sql`
- Test: `apps/pos-app/src-tauri/src/sync/mod.rs`

**Steps:**
1. Add a partial unique index on `sync_outbox(table_name, row_id)` where `synced_at IS NULL`.
2. Add an idempotent migration SQL file for existing DBs.
3. Add a focused SQLite test for duplicate pending outbox rejection.

### Task 6: Compact Metrics And Docs

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync/push.rs`
- Modify: `docs/DOCUMENTED-LOG-PREFIX.md`
- Modify: `logs/capture-adb-logcat.sh`
- Create: `docs/knowledge/SYNC-LIMITS.md`

**Steps:**
1. Log compact per-chunk metrics only: rows, bytes, retry count, rejected count.
2. Document Cloudflare/Turso/libSQL/PostgreSQL limits.
3. Update log capture filter and docs.

### Task 7: Verification

Run:

```bash
bun test apps/api/src/sync/__test__/service.test.ts
bun test apps/api/src/sync/__test__/protobuf.test.ts
bun test apps/api/src/sync/__test__/routes-protobuf.test.ts
bun test apps/pos-app/src/db/__test__/sync-outbox.test.ts apps/pos-app/src/store/__test__/sync.test.ts
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib sync::
bun run sync-proto:check
bun x ultracite check
bash -n logs/capture-adb-logcat.sh
```
