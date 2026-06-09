## Implementation Discipline

Every numbered behavior task is test-driven:

1. **RED:** add one focused test and run it alone;
2. confirm it fails for the expected missing behavior, not a setup error;
3. **GREEN:** add the smallest implementation that passes;
4. run the focused test and the containing suite;
5. **REFACTOR:** clean up only while the suite remains green.

Do not batch all tests after implementation. Record the focused RED and GREEN commands in the implementation notes or commit message.

## 1. Repository And Plugin Scaffold

- [ ] 1.1 Inspect `tauri-plugin-image-pipeline/`. Remove its nested `.git/` metadata so it is a normal directory owned by the Sakti POS repository; preserve any non-Git files.
- [ ] 1.2 Generate or create a standard Tauri 2 plugin scaffold with `Cargo.toml`, `build.rs`, `src/lib.rs`, `src/commands.rs`, `src/error.rs`, `src/dto.rs`, `desktop.rs`, `mobile.rs`, `guest-js/index.ts`, `permissions/default.toml`, and Android library structure.
- [ ] 1.3 Configure `Cargo.toml` with shared dependencies and target-specific non-Android codec dependencies. Do not use a default feature combination that accidentally compiles Rust codecs on Android.
- [ ] 1.4 Add `build.rs` command generation for: `enqueue_job`, `process_pending_jobs`, `get_completed_jobs`, `consume_completed_job`, `reset_stuck_jobs`, `retry_failed_job`, `get_failed_jobs`, `get_pending_preview`, `get_cached_asset_path`, and `cleanup_orphaned_temp_files`.
- [ ] 1.5 Define a minimal `permissions/default.toml`. Document that Sakti POS uses the public Rust API for mutating workflow operations and does not need frontend permission for Rust-to-Rust calls.
- [ ] 1.6 **RED:** add a compile test or minimal integration test that imports `init`, DTO types, and the public extension trait. Run `cargo test --manifest-path tauri-plugin-image-pipeline/Cargo.toml scaffold_api -- --exact` and confirm the missing API fails compilation/test.
- [ ] 1.7 **GREEN:** implement the minimal plugin registration, managed state shell, public handle, and extension trait needed by the scaffold test. Re-run the focused test and `cargo test --manifest-path tauri-plugin-image-pipeline/Cargo.toml`.
- [ ] 1.8 Run `cargo metadata` for the Android target or an equivalent dependency inspection and verify `image`, `zenwebp`, and `kamadak-exif` are absent from the Android dependency graph.

## 2. DTOs, Errors, And State Invariants

- [ ] 2.1 **RED:** add serialization tests for `QueueDocument`, `JobStatus`, `JobRecord`, `JobResult`, `CompletedJob`, request/response DTOs, and event payloads. Assert camelCase fields, snake_case status values, and queue `version = 1`.
- [ ] 2.2 **GREEN:** implement the DTOs exactly as specified in `design.md`, using UUID v4 job IDs and UTC RFC 3339 timestamps.
- [ ] 2.3 **RED:** add table-driven tests for job invariants: zero edge, zero attempts, attempts above maximum, completed without result, non-completed with result, failed without error, and malformed timestamps.
- [ ] 2.4 **GREEN:** implement one `JobRecord::validate()` or equivalent validator that rejects each invalid state with a field-specific `PluginError::InvalidRequest`.
- [ ] 2.5 **RED:** add tests that every `PluginError` variant produces a descriptive serialized Tauri-boundary message containing operation, path, job ID, or field context as applicable.
- [ ] 2.6 **GREEN:** implement `PluginError` without raw `String` errors inside plugin internals. Convert to a serializable boundary error only in command handlers.
- [ ] 2.7 Re-run the DTO/error module tests and the full plugin test suite before proceeding.

## 3. Queue Document Load, Save, And Recovery

- [ ] 3.1 Introduce a testable filesystem adapter for queue operations. Production uses Tokio/std filesystem calls; tests can force failures at write, flush, backup replacement, and primary replacement.
- [ ] 3.2 **RED:** test that missing primary and backup files load as `QueueDocument { version: 1, jobs: [] }` without producing a corruption artifact.
- [ ] 3.3 **GREEN:** implement missing-file initialization.
- [ ] 3.4 **RED:** test that a valid saved queue reloads with every job field unchanged.
- [ ] 3.5 **GREEN:** implement JSON serialization, temp-file write, `sync_all`, and primary replacement.
- [ ] 3.6 **RED:** inject failure before primary replacement and assert the previous valid `jobs.json` remains byte-for-byte unchanged.
- [ ] 3.7 **GREEN:** preserve the old primary until the replacement can succeed; remove or ignore stale temp files on recovery.
- [ ] 3.8 **RED:** save twice and assert the backup contains the previous valid primary while the primary contains the new document.
- [ ] 3.9 **GREEN:** implement valid-primary backup replacement before installing the new primary.
- [ ] 3.10 **RED:** provide corrupt primary plus valid backup; assert the corrupt file is quarantined and the backup is restored.
- [ ] 3.11 **GREEN:** implement `jobs.corrupt-<timestamp>.json` quarantine and backup recovery.
- [ ] 3.12 **RED:** provide corrupt primary and corrupt backup; assert `QueueCorrupt` is returned, neither file is overwritten with an empty queue, and cleanup eligibility is false.
- [ ] 3.13 **GREEN:** implement unrecoverable corruption behavior.
- [ ] 3.14 **RED:** provide `version = 2`; assert `UnsupportedQueueVersion { found: 2, supported: 1 }`.
- [ ] 3.15 **GREEN:** reject unknown versions before job interpretation.
- [ ] 3.16 Run all queue persistence tests repeatedly, including at least one parallel test run, to detect shared-path or timing assumptions.

## 4. Queue State Machine And Concurrency

- [ ] 4.1 **RED:** add a lifecycle test: enqueue -> claim -> complete -> list completed -> consume. Assert every persisted status and result.
- [ ] 4.2 **GREEN:** implement `enqueue`, atomic `claim_next`, `complete`, `get_completed`, and `consume`.
- [ ] 4.3 **RED:** add invalid-transition tests: complete pending, consume pending, claim completed, automatically claim failed, and consume missing job.
- [ ] 4.4 **GREEN:** enforce the state transition table from `design.md`.
- [ ] 4.5 **RED:** fail processing before `max_attempts`; assert attempts incremented, error recorded, status returned to `pending`, and event metadata has `terminal = false`.
- [ ] 4.6 **GREEN:** implement retryable failure transition.
- [ ] 4.7 **RED:** fail on the final attempt; assert terminal `failed`, exclusion from automatic claims, and `terminal = true`.
- [ ] 4.8 **GREEN:** implement bounded terminal failure with default `max_attempts = 3`.
- [ ] 4.9 **RED:** explicitly retry a failed job with an existing source; assert attempts reset to zero, error cleared, and status becomes pending.
- [ ] 4.10 **GREEN:** implement `retry_failed_job`.
- [ ] 4.11 **RED:** explicitly retry with missing source; assert the failed job is unchanged.
- [ ] 4.12 **GREEN:** validate the source before mutating explicit retry state.
- [ ] 4.13 **RED:** reset a queue containing pending, processing, completed, and failed jobs; assert only processing becomes pending.
- [ ] 4.14 **GREEN:** implement `reset_stuck_jobs`.
- [ ] 4.15 **RED:** launch two concurrent claim operations against one pending job; assert exactly one receives the job.
- [ ] 4.16 **GREEN:** place queue transition plus save behind one Tokio mutex. Do not hold the lock during image work.
- [ ] 4.17 Run queue state and concurrency tests with `--test-threads=1` and the default parallel setting.

## 5. Source Path And Identifier Safety

- [ ] 5.1 **RED:** add tests accepting a canonical regular source under `product_photo_inputs`.
- [ ] 5.2 **GREEN:** canonicalize allowed roots and source paths and verify containment.
- [ ] 5.3 **RED:** add tests rejecting missing paths, directories, lexical parent traversal, absolute outside paths, and symlinks resolving outside the allowed root.
- [ ] 5.4 **GREEN:** reject every unsafe path without creating previews or queue jobs.
- [ ] 5.5 **RED:** add table-driven path-segment tests for empty string, `.`, `..`, slash, backslash, absolute prefix, and valid UUID/hash/merchant strings.
- [ ] 5.6 **GREEN:** implement one shared safe-segment validator used by cache, preview, and queue paths.
- [ ] 5.7 Verify path tests on the current host and keep platform-specific path handling behind standard `Path` APIs.

## 6. Shared Sizing And Rust Image Processor

- [ ] 6.1 Copy only image fixtures needed by tests into plugin-owned `tests/fixtures/`; include landscape, portrait, square, small, corrupt, and EXIF orientations 1 through 8.
- [ ] 6.2 **RED:** add table-driven `fit_within_max_edge` tests for landscape, portrait, square, already-small, extreme aspect ratio, and one-pixel output bounds.
- [ ] 6.3 **GREEN:** implement the shared integer sizing rule without producing zero dimensions.
- [ ] 6.4 **RED:** add one test per EXIF orientation asserting corrected output dimensions and representative corner placement.
- [ ] 6.5 **GREEN:** port the existing EXIF transform behavior into `DefaultProcessor`.
- [ ] 6.6 **RED:** assert a large image becomes WebP with longest edge 400, declared `image/webp`, and dimensions matching the sizing helper.
- [ ] 6.7 **GREEN:** implement Triangle resize and `zenwebp` quality 75/method 6 encoding.
- [ ] 6.8 **RED:** assert already-small input is not upscaled.
- [ ] 6.9 **GREEN:** preserve original corrected dimensions when both edges fit.
- [ ] 6.10 **RED:** assert preview output decodes as JPEG, uses quality path 75, and longest edge 320.
- [ ] 6.11 **GREEN:** implement preview generation.
- [ ] 6.12 **RED:** corrupt bytes must return a processing-stage error and no output.
- [ ] 6.13 **GREEN:** add decode error context without panics.
- [ ] 6.14 **RED:** hash returned output and assert it equals SHA-256 of the exact bytes.
- [ ] 6.15 **GREEN:** implement output-derived hashing in the pipeline layer, not independently inside platform processors.
- [ ] 6.16 Run all processor tests and existing asset image tests to establish behavioral parity before deleting old code.

## 7. Content-Addressed Cache And Preview Files

- [ ] 7.1 **RED:** write bytes for merchant/hash and assert exact `<cache>/sakti-image/<merchant>/assets/<hash>.webp` path, byte contents, and resolution response.
- [ ] 7.2 **GREEN:** implement merchant-qualified path building, parent creation, atomic write, and exact-path resolution.
- [ ] 7.3 **RED:** request an unknown content type and assert validation failure before writing.
- [ ] 7.4 **GREEN:** implement a closed MIME-to-extension mapping, initially `image/webp -> webp` and `image/jpeg -> jpg`.
- [ ] 7.5 **RED:** inject temp write/flush failure with an existing final file and assert the final contents remain unchanged.
- [ ] 7.6 **GREEN:** implement unique same-directory temp files and replacement.
- [ ] 7.7 **RED:** generate a preview and assert exact `<cache>/sakti-image/previews/<job_id>.jpg` path and recorded queue path.
- [ ] 7.8 **GREEN:** implement atomic preview writing.
- [ ] 7.9 **RED:** resolve pending previews across multiple jobs and assert the newest matching pending/processing job wins while completed/failed jobs are excluded from UI preview lookup.
- [ ] 7.10 **GREEN:** implement attachment-target preview lookup without scanning SQLite.
- [ ] 7.11 **RED:** cleanup with referenced jobs in every status; assert all referenced source/preview files survive and unreferenced regular files are deleted.
- [ ] 7.12 **GREEN:** implement queue-snapshot-based cleanup.
- [ ] 7.13 **RED:** assert cleanup follows no symlinks and deletes nothing when queue recovery fails.
- [ ] 7.14 **GREEN:** enforce cleanup safety and error propagation.

## 8. Pipeline Commands And Durable Events

- [ ] 8.1 Create a fake `ImageProcessor` for pipeline tests that returns deterministic bytes or configured failures without mocking queue/cache behavior.
- [ ] 8.2 **RED:** enqueue a valid request and assert preview creation occurs before the pending job becomes visible.
- [ ] 8.3 **GREEN:** implement `enqueue_job`; on preview failure, leave no job and remove any partial preview.
- [ ] 8.4 **RED:** process two pending jobs with limit 1; assert only the oldest is claimed and the response reports `attempted = 1`.
- [ ] 8.5 **GREEN:** implement limit validation and oldest-first processing.
- [ ] 8.6 **RED:** successful processing must persist completed state and result before the completion event is observed.
- [ ] 8.7 **GREEN:** implement process -> hash -> cache -> complete -> emit ordering.
- [ ] 8.8 **RED:** configure retryable processor failure and assert persisted pending state exists before failure event emission.
- [ ] 8.9 **GREEN:** implement retryable failure event ordering.
- [ ] 8.10 **RED:** configure terminal processor failure and assert persisted failed state exists before terminal event emission.
- [ ] 8.11 **GREEN:** implement terminal failure event ordering.
- [ ] 8.12 **RED:** consume a completed job and force source/preview deletion failures; assert queue removal remains committed and the result is returned.
- [ ] 8.13 **GREEN:** implement consume-first durable removal followed by best-effort safe cleanup.
- [ ] 8.14 **RED:** zero processing limit returns validation error and mutates no jobs.
- [ ] 8.15 **GREEN:** reject invalid limits.
- [ ] 8.16 Wire Tauri command handlers as thin DTO/error adapters over the same public Rust handle. Do not duplicate business logic in command functions.
- [ ] 8.17 Add typed guest JS wrappers using `plugin:image-pipeline|<command>` and matching camelCase DTOs.

## 9. Android Native Processor

- [ ] 9.1 Initialize the plugin Android library using Tauri 2 conventions. Add AndroidX ExifInterface and ensure plugin identifier/class names match Rust `register_android_plugin`.
- [ ] 9.2 Extract pure Kotlin helpers for target dimensions, EXIF orientation matrix selection, and WebP format selection so they can be unit-tested without a device.
- [ ] 9.3 **RED:** add Kotlin table tests matching every Rust sizing case.
- [ ] 9.4 **GREEN:** implement equivalent integer rounding in Kotlin.
- [ ] 9.5 **RED:** add orientation-matrix tests for EXIF values 1 through 8.
- [ ] 9.6 **GREEN:** implement all rotation and mirror combinations.
- [ ] 9.7 **RED:** assert API 24-29 selects deprecated `WEBP`, while API 30+ selects `WEBP_LOSSY`.
- [ ] 9.8 **GREEN:** implement SDK-based format selection with narrowly scoped deprecation suppression.
- [ ] 9.9 **RED:** add a command test using an injected executor/scope and assert bitmap work does not execute on the calling/main thread.
- [ ] 9.10 **GREEN:** implement `SupervisorJob() + Dispatchers.Default` or `Dispatchers.IO` command execution before decode begins.
- [ ] 9.11 **RED:** representative JPEG plus EXIF input produces correctly oriented WebP and preview JPEG; `Bitmap.compress(false)` produces an error.
- [ ] 9.12 **GREEN:** implement bounds decode, `inSampleSize`, exact scaling, WebP/JPEG encoding, result serialization, and safe intermediate bitmap recycling.
- [ ] 9.13 **RED:** Rust mobile bridge test verifies command names, camelCase payload, response decoding, and native rejection mapping.
- [ ] 9.14 **GREEN:** implement `mobile.rs`/Android processor calls through `PluginHandle::run_mobile_plugin`.
- [ ] 9.15 Run Kotlin unit tests and an Android compile. Confirm no JPEG fallback exists for final assets.

## 10. POS Completed-Job Transaction

- [ ] 10.1 Refactor app persistence helpers to accept a SQLx transaction executor. Do not change behavior yet; keep existing tests green.
- [ ] 10.2 Build an integration fixture containing products, assets, local cache, and sync outbox tables plus a representative `CompletedJob`.
- [ ] 10.3 **RED:** persist one completed job and assert: asset upsert, cache upsert, product image link, asset outbox, and product outbox all exist after one commit.
- [ ] 10.4 **GREEN:** implement `persist_completed_asset_job` as one SQLite transaction.
- [ ] 10.5 **RED:** inject failure after each SQL stage and assert every table remains at its pre-call state.
- [ ] 10.6 **GREEN:** ensure every helper uses the same transaction and all errors roll it back.
- [ ] 10.7 **RED:** run persistence twice for the same job and assert identical final rows with no duplicate pending outbox entries.
- [ ] 10.8 **GREEN:** make asset/cache/link/outbox operations idempotent under existing uniqueness rules.
- [ ] 10.9 **RED:** existing ready asset remains ready after repeated reconciliation.
- [ ] 10.10 **GREEN:** reuse `resolve_local_asset_persist_state` semantics.
- [ ] 10.11 **RED:** reject unsupported processing kind, unsupported target, missing product, merchant mismatch, asset/hash mismatch, missing cache file, wrong byte size, and unsafe cache path; assert zero committed writes.
- [ ] 10.12 **GREEN:** implement completed-job validation before transaction writes.
- [ ] 10.13 **RED:** simulate commit success followed by consume failure; assert DB state is complete, no app success events emitted, and the completed job remains available.
- [ ] 10.14 **GREEN:** enforce order: commit -> consume -> app events.
- [ ] 10.15 **RED:** rerun reconciliation after the prior consume failure; assert idempotent persistence, successful consume, and exactly one event pair from the successful reconciliation call.
- [ ] 10.16 **GREEN:** implement the shared reconciliation function used by command, startup, and plugin-event paths.

## 11. POS Command And Startup Integration

- [ ] 11.1 **RED:** update/add enqueue command tests asserting target validation and merchant resolution happen before the plugin call and that all attachment fields are forwarded.
- [ ] 11.2 **GREEN:** rewrite `enqueue_asset_processing` to use the plugin Rust API while preserving `{ jobId }`.
- [ ] 11.3 **RED:** add processing command tests asserting plugin processing is followed by reconciliation and the returned count is successfully persisted-and-consumed jobs.
- [ ] 11.4 **GREEN:** rewrite `process_pending_asset_jobs`.
- [ ] 11.5 **RED:** add cache lookup tests asserting SQLite supplies merchant/content type and plugin resolution supplies disk existence while the frontend response remains `{ localPath, contentType } | null`.
- [ ] 11.6 **GREEN:** rewrite app-owned `get_cached_asset_path`.
- [ ] 11.7 **RED:** add pending preview tests asserting lookup uses `product.image_asset_id` metadata and plugin JSON jobs, not SQLite job rows.
- [ ] 11.8 **GREEN:** rewrite `get_pending_preview_path`.
- [ ] 11.9 **RED:** add startup orchestration tests asserting exact order: reset stuck -> reconcile completed -> cleanup.
- [ ] 11.10 **GREEN:** update `app/startup.rs`.
- [ ] 11.11 **RED:** simulate queue corruption at startup; assert cleanup is skipped, the error is logged, and chosen app startup policy is honored.
- [ ] 11.12 **GREEN:** implement non-destructive degraded startup behavior.
- [ ] 11.13 Register `tauri_plugin_image_pipeline::init()` before setup code that accesses its state.
- [ ] 11.14 Add plugin command permissions only for commands actually invoked from Sakti POS JavaScript. Confirm app-owned command invocations remain authorized.
- [ ] 11.15 Keep TypeScript production calls on the existing app command names. Update frontend tests only for intentional response/count semantics.

## 12. Remove The SQLite Queue And Old Pipeline

- [ ] 12.1 Verify all new plugin and POS integration suites are green before deleting the old path.
- [ ] 12.2 Remove `pendingAssetProcessingJobs` from `packages/sync-contract/src/local-schema.ts`.
- [ ] 12.3 Generate the repository-owned migration that executes `DROP TABLE IF EXISTS pending_asset_processing_jobs`; do not hand-edit generator-owned runtime artifacts.
- [ ] 12.4 Remove old SQLite queue load, claim, fail, delete, reset, preview lookup, and temp cleanup queries.
- [ ] 12.5 Remove old processing commands and helpers that are replaced by the plugin, including obsolete registration entries.
- [ ] 12.6 Delete `assets/image.rs`, old cache-writing code, and old queue-specific cleanup only after all callers have moved.
- [ ] 12.7 Preserve upload/hydration and app-owned cache metadata behavior; do not remove helpers still used by those paths.
- [ ] 12.8 Remove direct `image`, `zenwebp`, and `kamadak-exif` dependencies from `apps/pos-app/src-tauri/Cargo.toml`.
- [ ] 12.9 Run:

```bash
rg -n "pending_asset_processing_jobs" \
  apps/pos-app packages/sync-contract \
  -g '*.{rs,ts,sql}'
```

- [ ] 12.10 Classify any remaining result. Runtime/schema references are failures; intentionally retained historical migration text must be documented.
- [ ] 12.11 Run an Android dependency inspection and confirm Rust image codec crates are absent from the POS Android build graph.

## 13. Logging And Operational Evidence

- [ ] 13.1 **RED:** add log-capture/unit assertions where practical for queue recovery, retryable failure, terminal failure, persistence rollback, consume failure, and cleanup refusal.
- [ ] 13.2 **GREEN:** add stable `[RUST] [PHOTO:QUEUE]`, `[PHOTO:QUEUE_RECOVERY]`, `[PHOTO:PROCESS]`, `[PHOTO:CACHE]`, and `[PHOTO:PERSIST]` messages through the `log` crate.
- [ ] 13.3 Include `job_id`, `merchant_id`, attempts, stage, and error where applicable. Do not log image bytes, Base64, or unrestricted sensitive paths.
- [ ] 13.4 Update `docs/knowledge/APP-LOGGING-DOCS.md` with every new message family and investigation purpose.
- [ ] 13.5 Update `LOG_FILTER` in `logs/capture-adb-logcat.sh` for enqueue, queue recovery, processing, persistence, consumption, and cleanup. Do not broaden `LOG_EXCLUDE` without a separate reason.
- [ ] 13.6 Run the capture script against a device or verify its shell syntax when no device is available.

## 14. Final Automated Verification

- [ ] 14.1 Run strict OpenSpec validation:

```bash
openspec validate tauri-plugin-image-pipeline --strict
```

- [ ] 14.2 Run plugin formatting, linting, and tests:

```bash
cargo fmt --manifest-path tauri-plugin-image-pipeline/Cargo.toml -- --check
cargo clippy --manifest-path tauri-plugin-image-pipeline/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path tauri-plugin-image-pipeline/Cargo.toml
```

- [ ] 14.3 Run focused POS Rust asset tests, then the full library suite:

```bash
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

- [ ] 14.4 Run focused frontend asset tests:

```bash
bun test apps/pos-app/src/lib/assets/__test__
```

- [ ] 14.5 Run project lint/type checks for touched TypeScript:

```bash
bun x ultracite check
```

- [ ] 14.6 Run sync schema checks required after changing the local Drizzle schema:

```bash
bun run sync-proto:check
```

- [ ] 14.7 Run Kotlin unit tests and Android compilation using the generated plugin/app Gradle commands.
- [ ] 14.8 Confirm no test is ignored merely because it is difficult. Device-only tests may be separately tagged but must have documented execution commands.

## 15. Manual Verification Guide

- [ ] 15.1 Document exact UI steps: create/edit product, pick camera image, observe pending preview, process/sync, reopen product list, restart app during processing, and retry a terminal failure.
- [ ] 15.2 Document the normal PID-scoped log command and the crash/native variant using prefixes from `docs/knowledge/APP-LOGGING-DOCS.md`.
- [ ] 15.3 Document SQLite checks for `assets`, `local_asset_cache`, `products.image_asset_id`, and pending `sync_outbox` rows. State explicitly that `pending_asset_processing_jobs` must not exist after migration.
- [ ] 15.4 Document filesystem checks for `jobs.json`, backup/corrupt artifacts, cached WebP, preview JPEG, and source cleanup.
- [ ] 15.5 Document edge simulations:
  - corrupt primary with valid backup;
  - corrupt primary and backup;
  - kill/restart after processing completion but before consumption;
  - missing product during reconciliation;
  - Android API 24-29 WebP path;
  - forced terminal processor failure.
- [ ] 15.6 Provide expected log prefixes and expected database/filesystem outcome for every manual scenario.
