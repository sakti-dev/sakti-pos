# POS Product Photo Jobs And Asset Sync

Date: 2026-05-13

This note documents the product photo pipeline in the POS app. It exists because photo picking, compression, local cache, R2 upload, product row sync, and image hydration cross frontend, Rust, SQLite, API, and Cloudflare R2 boundaries. Small ownership mistakes can make photos appear correct in memory, then disappear after navigation or reinstall.

Read this together with `docs/knowledge/pos-smart-sync-strategy.md`.

## Design Goal

Saving a product should feel instant. Image compression and upload are background work, but the background work must still be durable and ordered.

The desired flow is:

```text
pick photo
save product row immediately
persist pending photo job
trigger syncNow()
syncNow processes the photo job
syncNow uploads the compressed asset
syncNow pushes the product row with image_asset_id
syncNow hydrates any missing cached assets
```

The product metadata and the image work are intentionally separated. The product can be saved before the compressed WebP asset exists.

## Durable State

The app persists actual units of work in SQLite. It does not persist "sync button was pressed" events.

Durable work sources:

- `pending_product_photo_jobs`: selected temp image path and product id waiting for compression.
- `assets.status = 'pending_upload'` plus `local_asset_cache`: compressed asset waiting for upload.
- `sync_outbox` plus `is_synced = 0`: local row changes waiting for push.
- `assets.status = 'ready'` plus missing local cache file: remote asset waiting for hydration.
- `sync_cursors`: server event cursor for pull.

Because the work itself is persisted, app restart does not need to remember that `syncNow()` had been requested. Startup or the periodic scheduler can reconstruct pending work from SQLite.

## Ownership Invariants

These rules are the important part.

- Product form owns picking and preview only.
- Product form may call `enqueue_product_photo_processing`.
- `enqueue_product_photo_processing` must only persist the job.
- `enqueue_product_photo_processing` must not start compression itself.
- `syncNow()` is the single owner of processing photo jobs, uploading assets, pushing product rows, and hydrating image cache.
- Rust startup may reset stale `processing` jobs to `pending`.
- Rust startup must not independently process photo jobs.
- No page, component, or feature code should call `processPendingProductPhotoJobs()` directly.

The reason is ordering. The product row must not be pushed to the server before the background job links `products.image_asset_id`.

Correct order:

```text
process pending photo jobs
upload pending image assets
push dirty DB rows
pull server changes when needed
hydrate missing local image cache
```

Incorrect order:

```text
push dirty DB rows
process pending photo jobs
```

That can upload a product with `image_asset_id = null`.

## Sync Is Single-Flight With A Follow-Up Pass

`syncNow()` is not a persisted queue. It is a serialized, coalesced sync orchestrator.

If no sync is running:

```text
syncNow()
-> starts sync pipeline
```

If a sync is already running:

```text
syncNow()
-> marks that a follow-up pass is needed
-> waits for the active sync promise
```

When the active sync finishes:

```text
if follow-up was requested
-> immediately run one more full sync pipeline
```

This matters for periodic sync timing. If the scheduler is already running and product form calls `syncNow()` after enqueueing a photo job, the active sync might already have passed the photo-job phase. The follow-up pass ensures the new job is processed immediately instead of waiting until the next scheduler interval.

This is intentionally not an unbounded queue. Many calls during one active sync collapse into one follow-up pass. That is enough because the sync pipeline is state-derived from SQLite.

## Product Form Flow

The product form should:

1. Pick a photo through the native photo picker.
2. Keep preview bytes in UI state for immediate display.
3. Save the product row immediately.
4. Insert a `pending_product_photo_jobs` row with:
   - `product_id`
   - `merchant_id`
   - temp image path
   - original filename
   - preview base64 and MIME type
5. Clear frontend ownership of the temp file after enqueue succeeds.
6. Call `syncNow()`.

The form should not wait for compression before navigating.

The form should not delete the temp file after the job is accepted. Ownership of that temp file moves to Rust once the job is persisted.

## Android Picker Ownership

Product photo picking has two Android paths:

- Gallery uses `tauri-plugin-android-fs`, called from Rust.
- Camera uses the custom Android photo plugin, called from Rust.

Frontend product code should only call `pickProductPhoto(source)` from `apps/pos-app/src/lib/assets.ts`. It should not import Android-FS directly, call custom plugin commands directly, or know which native implementation handles each source.

The reason is durability. Both picker paths must return a real app-private file path under `product_photo_inputs` so `pending_product_photo_jobs` can safely reference it after form submission. The selected file is not just a transient preview.

Startup cleanup must not delete `product_photo_inputs`. Those files may be referenced by persisted photo jobs. Startup cleanup may only delete explicitly transient picker files that cannot be referenced by SQLite jobs.

## Product List Preview Behavior

The product image component resolves images in this priority order:

```text
pending product photo preview
cached compressed asset
placeholder
```

This lets the product list show the picked photo immediately after redirect while compression is still pending.

Pending previews are durable enough for navigation because they are stored in `pending_product_photo_jobs`. They can also survive a normal app process restart if Android has not cleared the temp image and local SQLite remains intact.

After compression succeeds:

```text
Rust creates or reuses asset
Rust writes local asset cache
Rust updates products.image_asset_id
Rust records products update in sync_outbox
Rust deletes the temp file
Rust deletes the completed job row
```

At that point rendering should use the real cached WebP asset.

## Duplicate Images

Product image asset ids are content hashes of the processed WebP bytes. If the same processed image is picked again, it resolves to the same `asset_id`.

This is expected and useful:

- The local asset row can be reused.
- The R2 object key can be reused.
- Sync does not need to upload a duplicate object once the asset is already ready.
- A different product can point to the same image asset id.

Do not treat duplicate image hashes as an app error.

## Compression Settings

Product photos are thumbnails for POS grids, not original media backups.

Current target:

```text
max long edge: 400px
resize filter: Triangle
WebP quality: 75
WebP method: 6
```

The goal is a small, fast product-card image, generally in the 10KB to 25KB range depending on content.

Do not raise this toward original-photo quality without a specific UI need. Larger product-card images increase local storage, sync time, R2 traffic, and grid memory pressure.

## Cloudflare R2 Presigned URL Rules

The app never receives R2 secret keys. Upload and download use API-generated presigned URLs.

For presigned upload:

- The API signs the URL.
- The app sends only the headers returned by the API.
- The app must not add `Authorization`.
- The app must not add `x-amz-content-sha256`.
- `X-Amz-Content-Sha256=UNSIGNED-PAYLOAD` belongs in the presigned URL query string, not as a request header.

The known bad Cloudflare R2 errors were:

```text
Missing x-amz-content-sha256
No date provided in x-amz-date nor date header
SignatureDoesNotMatch
```

These came from mixing query-string SigV4 auth with physical `x-amz-*` headers or signing headers that the client did not send. Keep presigned requests minimal.

## App Kill And Recovery

If the app is killed:

- `pending_product_photo_jobs` survives in SQLite.
- A job that was `processing` may be stuck.
- On startup Rust resets stale `processing` jobs back to `pending`.
- The next `syncNow()` processes them.

If Android deletes the app cache temp file before recovery:

- The job can fail during processing.
- The product remains saved without the new photo.
- The job should be marked failed with `last_error`.

This is acceptable. Cache files are not guaranteed storage. The durable part is the job metadata and the already-saved product row.

## Why Sync Trigger Requests Are Not Persisted

Do not add a persisted `sync_requests` queue unless there is a separate, concrete requirement.

Persisting sync triggers adds stale rows, deduplication rules, cleanup policy, and ordering questions. It also duplicates state that already exists in domain tables.

The correct approach is:

```text
persist the work
derive sync work from SQLite state
coalesce sync triggers in memory
```

Examples of persisted work are photo jobs, asset upload status, outbox rows, and sync cursors. `syncNow()` is only a trigger to process that state.

## Failure Mode That This Design Prevents

The bug that motivated this design:

```text
product form enqueues photo job
Rust immediately claims job and marks it processing
product form also calls syncNow()
syncNow sees pending count = 0
syncNow uploads/pushes too early
product row can reach server before image_asset_id is linked
navigate away/back or pull from server shows product without photo
```

The fix:

```text
enqueue only persists the job
syncNow is the only processor
syncNow is serialized
syncNow runs a follow-up pass if called while active
```

## Logging

Useful Android logcat filter:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE '\[PHOTO-DEBUG\]|product_photo_job|product_photo_jobs|asset_sync|asset_upload|asset_hydration|hydrate_asset|upload_asset|presign|complete-upload|processing_failed|failed|error|query_failed|commit|rollback'
```

Expected successful photo flow:

```text
product_photo_job:enqueued
product_photo_jobs:start limit=20
product_photo_jobs:pending count=1
product_photo_job:start
prepare_local_product_image_asset:done
product_photo_job:done ... asset_id=...
upload_pending_product_images:pending count=1
upload_asset:put_done
upload_asset:complete_done
asset_upload_queue_finished uploadedCount=1
```

If you see `product_photo_jobs:pending count=0` immediately after enqueue, check whether the app has been rebuilt with the durable-only enqueue behavior.

## Rebuild And Restart Rules

Frontend-only TypeScript changes:

```text
Vite/Tauri dev reload is usually enough.
```

Rust command or Tauri native behavior changes:

```text
Rebuild/relaunch the Android app.
```

Local SQLite schema changes:

```text
Rebuild/relaunch the Android app.
If testing migration from a clean state, clear app data or reinstall.
```

API schema changes:

```bash
cd apps/api
bun run db:push
```

## Tests That Protect This

Important test coverage:

- `apps/pos-app/src/store/__test__/sync.test.ts`
  - photo jobs run before upload and push
  - concurrent sync calls are serialized
  - a sync request during active sync causes one follow-up pass
- `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`
  - product is saved immediately
  - photo job is enqueued after save
  - old image asset id is preserved while a replacement photo is pending
- `apps/pos-app/src/lib/__test__/assets.test.ts`
  - frontend wrappers call the correct Tauri commands
- `apps/pos-app/src-tauri/src/assets.rs`
  - Rust unit tests cover asset paths, processing, status validation, and cache path safety

When changing this pipeline, add or update tests before changing behavior. The race bugs here are easy to reintroduce with code that looks harmless.

## Code Touchpoints

Main frontend files:

- `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- `apps/pos-app/src/store/sync.ts`
- `apps/pos-app/src/components/product-image.tsx`
- `apps/pos-app/src/lib/assets.ts`
- `apps/pos-app/src/lib/product-images/pending.ts`

Main Rust files:

- `apps/pos-app/src-tauri/src/assets.rs`
- `apps/pos-app/src-tauri/src/lib.rs`
- `apps/pos-app/src-tauri/src/sync.rs`

Main schema files:

- `packages/database/src/local-schema.ts`
- `apps/pos-app/drizzle/*pending_product_photo_jobs*.sql`
