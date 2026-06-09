## Context

`tauri-plugin-image-pipeline` currently owns the full pick-preview-compress lifecycle in a single `pick_image` command. The command opens the native picker, stages the source file, generates a preview, and immediately starts background compression — emitting `image_pipeline://job_completed` when the final WebP is ready. The host app (`product-form.tsx`) listens for this event and only enables the save button after compression completes.

This design has several problems:

1. **Wasted work**: Compression runs immediately on pick, even if the user re-picks or cancels. A single image selection can trigger multiple compression jobs.
2. **Complex frontend lifecycle**: `createImageUpload` manages event listeners, race-condition buffers (`flushPendingJobEvents`), and `isReady` gating. This complexity exists because compression starts before the user commits.
3. **No submit-time ownership**: The product form can't save until compression finishes. The `imageAssetId` is only available after `job_completed` fires, creating a tight coupling between the plugin's internal timing and the host app's save flow.
4. **Recovery is fragile**: If the app restarts between pick and `job_completed`, the host app must re-attach listeners and hope the event fires again. The plugin's `get_completed_jobs` API exists but isn't wired into the host app's startup path.

The repo has working infrastructure for this: the `assets` table tracks upload lifecycle (`pending_upload` → `ready`), the API provides presigned S3 URLs, and the plugin already has job recovery APIs (`get_completed_jobs`, `get_failed_jobs`). The change is to restructure when compression happens and who owns the lifecycle state.

## Goals / Non-Goals

**Goals:**
- Defer compression to submit time so only committed images are processed.
- Let the `assets` table own the full lifecycle state (`pending` → `compressed` → `pending_upload` → `ready`).
- Set `products.imageAssetId` at submit time (no null gap on products).
- Gate S3 upload on compression completion.
- Provide startup recovery for interrupted compression and upload flows.
- Simplify the frontend by removing the event-listener lifecycle from `createImageUpload`.
- Add `deleteAsset` plugin command for manual asset cleanup.

**Non-Goals:**
- Change the compression math, output formats, or preview generation.
- Add cropping, rotation, or batch selection UI.
- Introduce application-specific concepts (e.g., `merchantId`) into the plugin's public API.
- Replace the existing baresync sync model beyond gating asset sync on `status = "ready"`.
- Implement reference-counted GC for compressed assets (manual `deleteAsset` replaces this).

## Decisions

### 1. Split `pick_image` into two commands

**Decision:** `pick_image` handles picker + staging + preview only. `compress_asset` handles background compression and emits `job_completed`.

**Why:** Separating concerns eliminates wasted compression work and removes the tight coupling between picker timing and save flow. The host app controls when compression starts.

**Alternatives considered:**
- Keep single command with a `deferCompression` flag. Rejected — adds branching complexity inside the plugin for a behavioral difference that belongs at the API boundary.
- `pick_image` + `enqueueCompression` as separate host-side calls. Rejected — reintroduces the split that the original design intentionally collapsed.

```ts
// pick_image — fast, no compression
const picked = await invoke("plugin:image-pipeline|pick_image", {
  request: { pickerMode: "image", compression: { previewMaxLongEdge: 320 } }
});
// → { jobId, stagedSourcePath, previewPath, previewMimeType }

// compress_asset — called at submit time, runs in background
await invoke("plugin:image-pipeline|compress_asset", {
  request: { jobId: picked.jobId, stagedSourcePath: picked.stagedSourcePath, maxLongEdge: 400, quality: 75 }
});
// → emits image_pipeline://job_completed(jobId, contentHash, assetPath, ...) when done
```

### 2. `jobId` minted on pick, reused as compression job ID

**Decision:** The `jobId` is minted by `pick_image` and flows through to `compress_asset`. One ID for the entire lifecycle.

**Why:** No mapping layer needed. The product row stores the ID, the assets row stores the ID, and the plugin uses the same ID for the compression job.

### 3. Assets table owns the lifecycle, `jobId` links to plugin

**Decision:** Add a `jobId` column to the `assets` table. Make `contentHash`, `byteSize`, `width`, `height` nullable. Create the assets row at submit time with `status = "pending"` and `jobId` set.

**Why:** The product table always has a valid `imageAssetId` (no null gap). The assets row progresses through statuses as work completes. The `jobId` is the bridge to the plugin's compression job for recovery.

**Status progression:**
```
pending → compressed → pending_upload → ready
  │           │              │            │
  │           │              │            └─ synced to server, downloadable
  │           │              └─ S3 presigned URL obtained, uploading
  │           └─ local compression done, metadata filled in
  └─ created at submit time, no contentHash yet
```

**Schema change (local-synced-schema.ts):**
```ts
export const assets = sqliteTable("assets", {
  id: text("id").primaryKey().$defaultFn(() => uuidv7()),
  merchantId: text("merchant_id").notNull(),
  jobId: text("job_id"),                              // NEW: links to plugin compression job
  objectKey: text("object_key"),                       // nullable until upload
  originalFilename: text("original_filename"),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size"),                      // nullable until compression
  contentHash: text("content_hash"),                   // nullable until compression
  kind: text("kind").notNull(),
  width: integer("width"),                             // nullable until compression
  height: integer("height"),                           // nullable until compression
  status: text("status").notNull().default("pending"),
  createdByUserId: text("created_by_user_id"),
  ...localSyncColumns(),
});
```

**Alternatives considered:**
- Overload `imageAssetId` to store jobId when pending. Rejected — fragile type discrimination by string length.
- Store `pendingJobId` on products table. Rejected — product has a null gap for `imageAssetId`, and the assets table is the natural owner of file lifecycle.

### 4. S3 upload gated on compression completion

**Decision:** Presign-upload and complete-upload only run after `assets.contentHash` is populated (status = "compressed" or later).

**Why:** The presign-upload API requires `contentHash` and `byteSize`. These aren't available until compression finishes. The upload queue already handles `status = "pending_upload"` assets, so the flow is: compression fills in metadata → status becomes "compressed" → presign → upload → complete → "ready".

### 5. Manual `deleteAsset` replaces reference-counted GC for compressed assets

**Decision:** Add a `deleteAsset(assetPath)` plugin command. The host app calls it when a product's image changes or the product is deleted. The plugin deletes the local file. Staging and preview files use TTL-based GC (30 min after last access).

**Why:** For a public-facing plugin, the host app should own the lifecycle of committed assets. The plugin should never decide what to evict. TTL handles the ephemeral files (staging sources, previews) that were never committed.

**Cleanup matrix:**
| File type | Cleanup strategy |
|---|---|
| Staging sources (`picked/*.source`) | TTL: 30 min after last access |
| Previews (`previews/*.jpg`) | TTL: 30 min after last access |
| Compressed assets (`assets/*.webp`) | Manual `deleteAsset` from host app |
| Orphaned assets rows (no product ref) | Host app GC on startup |

### 6. Startup recovery uses plugin APIs

**Decision:** On app startup, query `assets` where `status IN ("pending", "compressed")`:
- `"pending"` → call `plugin.get_completed_job(jobId)`. If found, update asset metadata. If failed, retry or mark failed. If still in-progress, leave it.
- `"compressed"` → resume from presign-upload (local file exists in cache).

**Why:** The plugin already has `get_completed_jobs` and `get_failed_jobs` APIs. Recovery is just querying the assets table and checking the plugin.

### 7. Frontend removes event-listener lifecycle

**Decision:** `createImageUpload` no longer manages `listen()`, `flushPendingJobEvents`, or `isReady`. The `pickImage()` call returns `{ jobId, previewPath }` immediately. The form's `handleSave` calls `compress_asset` and saves the product. The button is enabled as soon as the preview is available.

**Why:** The complex listener lifecycle existed because compression started on pick. With deferred compression, the frontend only needs the preview for display and the `jobId` for the assets row.

### 8. Object key generated at asset creation time

**Decision:** `objectKey = "{merchantId}/assets/{assets.id}"`. Generated when the assets row is created at submit time.

**Why:** The `objectKey` is the S3 path. It doesn't depend on `contentHash` — it just needs to be unique per asset. Using the asset ID ensures uniqueness and allows presign-upload to run as soon as compression fills in the metadata.

**Note:** This changes the current `objectKey` derivation from `{merchantId}/assets/{contentHash}` to `{merchantId}/assets/{assets.id}`. This is a deliberate change — the content-hash-based key was useful for deduplication, but the presign-upload endpoint already handles deduplication by checking for existing assets with the same `merchantId` + `objectKey`.

## Stale Code Removal

The move to deferred compression eliminates the old `enqueue_asset_processing` / `process_pending_asset_jobs` system entirely. The following code is dead and must be removed:

### `apps/pos-app/src/lib/assets/` cleanup

| File | Status | Reason |
|---|---|---|
| `processing.ts` | DELETE | `enqueueAssetProcessing` and `processPendingAssetJobs` call Rust commands that operate on the removed `pending_asset_processing_jobs` table. Replaced by `compress_asset`. |
| `types.ts` | DELETE | `EnqueueAssetProcessingInput`, `EnqueueAssetProcessingResult`, `AssetProcessingKind` — only imported by `processing.ts`. |
| `targets.ts` | DELETE | `ASSET_ATTACHMENT_TARGETS`, `createAssetProcessingTarget` — only imported by `processing.ts` and its test. |
| `__test__/processing.test.ts` | DELETE | Tests for removed `processing.ts`. |
| `__test__/targets.test.ts` | DELETE | Tests for removed `targets.ts`. |
| `plugin-bridge.ts` | KEEP + UPDATE | Add `pluginCompressAsset`, `pluginDeleteAsset`. Update `PickImageResponse`. |
| `image-upload.ts` | KEEP + SIMPLIFY | Remove event listeners, `isReady`, `flushPendingJobEvents`. |
| `cache.ts` | KEEP + UPDATE | Handle `assets.status = "pending"` → show preview; `assets.status = "ready"` → show cached WebP. |
| `create-adapter.ts` | KEEP | May need minor update for new asset status flow. |
| `sync.ts` | KEEP | `uploadPendingAssets` and `hydrateMissingAssets` still needed. |
| `adapters/product-images.ts` | KEEP | Still the product image adapter. |

### `store/sync.ts` cleanup

The `processPendingAssetProcessingJobs` function and its call in `syncNow()` must be removed. Compression is no longer part of the sync pipeline — it runs at submit time via `compress_asset`. The sync pipeline order becomes:

1. `uploadPendingProductImages()` — upload assets with `status = "compressed"`
2. `syncNow()` core — push dirty rows, pull server changes
3. `hydrateProductImagesInBackground()` — download missing assets

### Schema cleanup

| File | Table/Column | Action |
|---|---|---|
| `local-synced-schema.ts` | `products.imageUrl` | Remove (dead column) |
| `api-synced-schema.ts` | `products.imageUrl` | Remove (dead column) |
| `local-schema.ts` | `localAssetCache` | Remove definition + drop table migration |
| `local-schema.ts` | `pendingProductPhotoJobs` | Remove definition (table already dropped by migration `0001`) |

## Risks / Trade-offs

- **[App restart between "pending" and "compressed"]** → Mitigated by startup recovery: query plugin for completed jobs, update asset metadata. Plugin already has `get_completed_jobs` API.

- **[App restart between "compressed" and "ready"]** → Mitigated by startup recovery: resume upload from local cache. The compressed file is still on disk.

- **[New pick before old compression finishes]** → Let the old job finish. When `job_completed` fires, the handler checks if the assets row still exists. If the product was updated with a new `imageAssetId`, the old assets row is orphaned and cleaned up by GC.

- **[Cache cleared with pending asset]** → Let compression fail naturally. The plugin emits `job_failed` when the source file is missing. The handler marks the asset as `failed`.

- **[Sync contract change]** → Making `contentHash` and `byteSize` nullable in the `assets` table changes the sync contract. The API schema must also accept nullable values for these columns when `status = "pending"`. This is a coordinated change across `packages/sync-contract/`, `apps/api/`, and the local schema.

- **[Upload queue timing]** → The upload queue currently runs during `syncNow()`. With deferred compression, assets may reach `status = "compressed"` between syncs. The upload queue should also run after a `job_completed` event is processed, not just during sync.

## Migration Plan

1. Update the `assets` table schema (nullable columns, `jobId`) in both local and API sync contracts.
2. Add `compress_asset` and `deleteAsset` plugin commands.
3. Modify `pick_image` to stop emitting `job_completed` (preview-only).
4. Update `product-form.tsx` to create assets row at submit time and call `compress_asset`.
5. Add startup recovery logic for pending and compressed assets.
6. Remove event-listener lifecycle from `createImageUpload`.
7. Update upload queue to trigger on `job_completed` in addition to sync time.
8. Update existing specs (`assets`, `menu`, `sync`) with the new requirements.

## Open Questions

- Should `compress_asset` be synchronous (blocks until done) or async (returns immediately, emits event)? Recommendation: async with event emission — the existing pattern works and keeps the IPC non-blocking.
- Should the `assets` table on the API side also accept `jobId`, or is it local-only? Recommendation: local-only — the API doesn't need to know about plugin job IDs.
