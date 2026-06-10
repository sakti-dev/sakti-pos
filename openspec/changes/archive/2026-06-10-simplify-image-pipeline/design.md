## Context

The image pipeline evolved through three eras:

1. **Base64 era**: Images read as base64 on Rust side, sent to JS via events, rendered as data URIs. Required reactive cache busting (version counters, adapter factory, event listeners) because base64 strings were expensive to re-render.

2. **Plugin extraction era**: `tauri-plugin-image-pipeline` was extracted to own the file processing (pick, compress, cache). But the POS app's Rust `assets/` module remained as a business logic layer — writing SQL directly to the assets table and sync outbox, bypassing baresync's `writeTransaction`/`writeLocalChange`. This caused the `scope_type` bug (column didn't exist in the baresync-managed `sync_outbox` table). Meanwhile, the plugin accumulated 13 commands (including a full job queue system) while the host app only used 5.

3. **Current target**: `convertFileSrc` + stable `imageAssetId` + baresync. The plugin should be a clean, domain-agnostic public Tauri plugin. The JS side should own the entire asset lifecycle using baresync for DB writes. The reactive cache layer is unnecessary because `convertFileSrc` serves files directly and navigation-based re-render handles staleness.

Current state of `apps/pos-app/src/lib/assets/`:
- `plugin-bridge.ts` (116 lines) — invoke wrappers for pick, compress, delete
- `image-upload.ts` (155 lines) — Solid signal state machine for pick workflow
- `cache.ts` (149 lines) — reactive version stores + URL resolution (base64-era artifact)
- `create-adapter.ts` (137 lines) — adapter factory with event listeners (base64-era artifact)
- `adapters/product-images.ts` (11 lines) — product image adapter specialization
- `sync.ts` (27 lines) — Rust command bridge for upload/hydration
- `types.ts` (3 lines) — adapter type definitions

Current state of `apps/pos-app/src-tauri/src/assets/` (14 files, ~90KB Rust):
- `local.rs`, `mod.rs`, `upload_queue.rs`, `recovery.rs`, `targets.rs` — business logic
- `cache.rs`, `commands.rs`, `dto.rs`, `image.rs` — cache + commands + DTOs
- `processing_jobs.rs`, `temp_cleanup.rs`, `http.rs`, `hydration.rs` — dead/unused
- `tests.rs` — tests

Current state of `tauri-plugin-image-pipeline` (13 commands):
- Used: `pick_image`, `compress_asset`, `delete_asset`, `get_cached_asset_path`, `get_pending_preview`
- Unused: `enqueue_job`, `process_pending_jobs`, `get_completed_jobs`, `consume_completed_job`, `reset_stuck_jobs`, `retry_failed_job`, `get_failed_jobs`, `cleanup_orphaned_temp_files`

## Goals / Non-Goals

**Goals:**
- Reduce plugin public API to 3 commands: `pick_image`, `compress_asset`, `get_asset_path`
- Remove all app-domain concepts (merchant_id, tenant scoping) from the plugin
- Delete the entire Rust `assets/` module — all asset lifecycle logic moves to JS
- Use baresync `writeTransaction`/`writeLocalChange` for all asset DB writes (no hand-rolled SQL)
- Simplify `lib/assets/` to its essentials: plugin bridge, upload composable, smart URL resolution
- Event-driven lifecycle: plugin emits `image_pipeline://job_completed`, JS listener handles DB + triggers upload
- TDD approach: write tests first for each component

**Non-Goals:**
- Changing the assets table schema (columns stay as-is)
- Changing the API server's presign/upload/complete endpoints
- Adding cache scoping/prefixes to the plugin (YAGNI — UUIDs are globally unique)
- Changing the plugin's Android Kotlin backend (compression logic stays)
- Implementing asset hydration (downloading assets from server to local cache) — stays as a stub
- Modifying baresync itself

## Decisions

### Decision 1: Plugin cache layout — flat by asset ID, no merchant directories

**Current**: `<cache>/sakti-image/<merchant_id>/assets/<assetId>.webp`
**New**: `<cache>/assets/<assetId>.webp`

**Why**: The plugin is a public Tauri plugin. `merchant_id` is a POS app domain concept that doesn't belong in a generic image pipeline plugin. UUIDs are globally unique — no collision risk. Apps that need tenant-scoped cleanup can track asset-to-tenant mappings in their own DB and call `delete_asset` per ID.

**Alternative considered**: Builder config for optional cache scope prefix (`Builder::new().cache_scope("merchant-123")`). Rejected because YAGNI — adds API surface for a problem that doesn't exist yet. Can be added later if a real user needs it.

### Decision 2: Single smart `get_asset_path` replaces `get_cached_asset_path` + `get_pending_preview`

**Current**: Two commands — `get_cached_asset_path(merchant_id, asset_id, content_type)` for compressed files, `get_pending_preview(target)` for previews by entity lookup.
**New**: One command — `get_asset_path(asset_id)` that checks: compressed file exists? → return it. No? → preview exists for this job? → return it. Neither? → null.

**Why**: The plugin owns the filesystem. It knows what files exist. The host app shouldn't need to route between "am I looking for a compressed file or a preview?" — the plugin resolves it. This eliminates the need for JS to query the assets table for status before deciding which plugin command to call.

### Decision 3: Event-driven lifecycle (Shape B) — plugin emits event, JS reacts

**Flow**:
1. Form: `writeTransaction` creates product + assets row (status='pending') → `pluginCompressAsset()` fire-and-forget → navigate
2. Plugin: compresses in background → emits `image_pipeline://job_completed` with `{ jobId, assetId, contentHash, byteSize, width, height }`
3. JS listener: `writeTransaction` updates assets row (status='compressed', metadata) → triggers upload
4. Upload: `fetch()` presign → S3 PUT → complete-upload → `writeTransaction` (status='ready')

**Why**: The form doesn't wait for compression. The event is the bridge between plugin processing and JS state management. Recovery reuses the same path: re-invoke `compress_asset` for pending assets → same event → same listener.

**Alternative considered**: Shape A (inline in form — await compress, then writeTransaction). Rejected because the user designed the plugin to emit events specifically for this decoupled architecture. Fire-and-forget + event is the intended pattern.

### Decision 4: No reactive cache layer — browser IS the cache

**Current**: Solid reactive stores (version counters) + adapter factory + event listeners (`asset-cache-ready`, `asset-attachment-ready`) to force re-render when images change.

**New**: None of this. `resolveAssetUrl(assetId)` calls the plugin once and returns a URL. The `<img>` element keeps the image in browser memory even if the file on disk changes. When the user navigates away and back, the component re-renders from scratch and re-resolves.

**Why**: With `convertFileSrc`, the URL is deterministic for a given assetId. No base64 strings. No version counters needed. The browser's rendering pipeline handles staleness — once an `<img>` loads, it stays rendered regardless of what happens to the source file. Next navigation triggers fresh resolution.

### Decision 5: JS-side upload using `fetch()` instead of Rust `reqwest`

**Current**: `upload_queue.rs` uses `reqwest` for HTTP calls to the API server (presign, complete-upload) and S3 (PUT).
**New**: JS `fetch()` calls to the same endpoints. Session token and API URL already available in JS.

**Why**: The upload is API-driven (needs auth token, merchant context). JS already has these. No need to pass them through IPC to Rust. Moving to JS eliminates the `reqwest` dependency in the Rust side and keeps the upload logic co-located with the baresync `writeTransaction` that marks assets ready.

### Decision 6: Recovery reuses the event-driven path

**Current**: `recovery.rs` has separate Rust functions for pending and compressed assets.
**New**: `recovery.ts` queries assets table: pending assets → invoke `compress_asset` (plugin emits event → same lifecycle listener handles it). Compressed assets → call `upload.ts` directly.

**Why**: No special recovery code path. Re-triggering the entry point (compress or upload) flows through the exact same listeners and functions as the happy path. Less code, fewer edge cases.

### Decision 7: baresync `writeTransaction` for all asset DB mutations

**Current**: Rust `local.rs` writes SQL directly to the assets table and calls `insert_sync_outbox` (which has the `scope_type` bug).
**New**: All asset table writes go through baresync's `writeTransaction` + `writeLocalChange`. The outbox is handled automatically. No hand-rolled SQL. No sync outbox bugs possible.

**Why**: baresync is the source of truth for synced data mutations. Bypassing it was the root cause of the `scope_type` bug. Using `writeTransaction` ensures the outbox invariant is always maintained.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| 500ms gap where product list shows no image (pending asset, no compressed file yet) | `get_asset_path` falls back to preview — product list shows preview immediately |
| Plugin API breaking change for any consumer using removed commands | This is a private ecosystem — only `pos-app` consumes the plugin. Update in lockstep. |
| Upload reliability — JS `fetch()` vs Rust `reqwest` | Upload failures leave asset as `compressed` (retry on next sync). Same resilience model as before. |
| No reactive re-render when compression finishes while user is on product list | Browser keeps preview in memory. User sees preview. Next navigation resolves to compressed file. Acceptable UX trade-off. |
| Plugin cache migration — existing assets cached under `merchant_id/` directories | One-time migration script or accept that old cached files become orphaned (they'll be re-cached from server on next sync). |
| Recovery runs after login, not at Rust startup | Acceptable — recovery needs auth token anyway. Runs as part of the startup sync flow. |
