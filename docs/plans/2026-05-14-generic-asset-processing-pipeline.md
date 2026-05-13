# Generic Asset Processing Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace product-photo-specific background processing with a generic persisted asset processing pipeline that can support product photos now and employee/category assets later.

**Architecture:** Asset processing becomes domain-agnostic: a pending job describes the source file, processing kind, and attachment target. Rust processes the file into a generic asset/cache entry, links the resulting asset to an allowlisted entity field, and emits generic readiness events. Solid listens once, updates per-asset cache invalidation and domain catalog invalidation, so UI pages refresh progressively without blocking DB sync or navigation.

**Tech Stack:** Tauri v2 commands/events, Rust/sqlx/SQLite, SolidJS `createStore`/`createSignal`, Solid `createResource`, Vitest, `@solidjs/testing-library`, Bun, Cargo tests.

---

## Why This Plan Replaces Product-Specific Jobs

Current product-specific names:

```txt
pending_product_photo_jobs
process_pending_product_photo_jobs
enqueue_product_photo_processing
product-photo-ready
```

These do not scale to employees/categories. The reusable core is:

```txt
source file -> process/compress -> create asset -> cache local file -> attach asset to entity
```

The only domain-specific step is attachment:

```txt
product.image_asset_id = asset_id
employee.image_asset_id = asset_id
category.icon_asset_id = asset_id
```

Use generic names:

```txt
pending_asset_processing_jobs
process_pending_asset_jobs
enqueue_asset_processing
asset-cache-ready
asset-attachment-ready
```

## Target Runtime Behavior

Clean reinstall / remote assets:

1. User logs in and selects merchant/outlet.
2. Critical DB sync completes and product rows render immediately.
3. Products with missing local image files show placeholders.
4. Asset hydration runs in the background.
5. Rust downloads `asset-a` and emits `asset-cache-ready`.
6. Only `ProductImage` components reading `asset-a` rerun cached-file lookup.
7. The image appears without navigation.

New product with new image:

1. Product form saves immediately.
2. Picked photo path is persisted in `pending_asset_processing_jobs`.
3. Product list/POS can render immediately using pending temp preview.
4. Background processor claims the generic asset job.
5. Rust compresses the image and writes the local WebP cache file.
6. Rust creates/updates generic `assets` and `local_asset_cache` rows.
7. Rust links the asset to allowlisted target `products.image_asset_id`.
8. Rust emits `asset-attachment-ready`.
9. Frontend invalidates product catalog resources and asset cache version.
10. Product rows refetch with real `imageAssetId`.
11. `ProductImage` reads the compressed WebP and replaces temp preview/placeholder.

Future employee asset:

```ts
enqueueAssetProcessing({
  sourcePath,
  originalFilename,
  sourceMimeType,
  processingKind: "image:webp-thumbnail",
  target: {
    entityType: "employee",
    entityId: employee.id,
    field: "image_asset_id",
  },
});
```

Only future work:

- add allowlisted Rust linker for `employee.image_asset_id`
- add frontend domain invalidation for `entityType === "employee"`

No duplicated upload/download/cache implementation.

## Event Contract

`asset-cache-ready`: local asset file is readable.

```ts
interface AssetCacheReadyPayload {
  asset_id: string;
}
```

Rules:

- Emit after file write and `local_asset_cache.status = 'ready'`.
- Event failure must not fail processing/hydration.
- Existing cached assets do not need events.

`asset-attachment-ready`: processed asset was linked to an entity.

```ts
type AssetEntityType = "product";
type AssetAttachmentField = "image_asset_id";

interface AssetAttachmentReadyPayload {
  entity_type: AssetEntityType;
  entity_id: string;
  field: AssetAttachmentField;
  asset_id: string;
}
```

Rules:

- Emit after attachment DB update and outbox/local-change recording succeed.
- Frontend calls `notifyAssetCacheReady(asset_id)`.
- Frontend routes domain invalidation by `entity_type`.
- Unsupported entity/field combinations fail the job safely. Never use dynamic SQL.

## Generic Job Schema

```sql
CREATE TABLE IF NOT EXISTS pending_asset_processing_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  merchant_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  source_mime_type TEXT,
  processing_kind TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  attachment_field TEXT NOT NULL,
  preview_path TEXT,
  preview_mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Initial supported values:

```txt
processing_kind = image:webp-thumbnail
entity_type = product
attachment_field = image_asset_id
```

Because the app is experimental, prefer creating the new table and removing active use of `pending_product_photo_jobs`.

---

## Task 1: Add Generic Asset Processing TypeScript API

Files:

- Modify: `apps/pos-app/src/lib/assets.ts`
- Test: `apps/pos-app/src/lib/__test__/assets.test.ts`

Failing test:

```ts
test("enqueueAssetProcessing invokes the generic asset processing command", async () => {
  mockInvoke.mockResolvedValueOnce({ jobId: "job-1" });

  const { enqueueAssetProcessing } = await import("~/lib/assets");

  const result = await enqueueAssetProcessing({
    originalFilename: "nasi.jpg",
    processingKind: "image:webp-thumbnail",
    sourceMimeType: "image/jpeg",
    sourcePath: "/tmp/nasi.jpg",
    target: {
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    },
  });

  expect(result).toEqual({ jobId: "job-1" });
  expect(mockInvoke).toHaveBeenCalledWith("enqueue_asset_processing", {
    originalFilename: "nasi.jpg",
    processingKind: "image:webp-thumbnail",
    sourceMimeType: "image/jpeg",
    sourcePath: "/tmp/nasi.jpg",
    target: {
      entityId: "product-1",
      entityType: "product",
      field: "image_asset_id",
    },
  });
});
```

Run red:

```bash
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts
```

Implement:

```ts
export type AssetProcessingKind = "image:webp-thumbnail";
export type AssetEntityType = "product";
export type AssetAttachmentField = "image_asset_id";

export interface AssetProcessingTarget {
  entityId: string;
  entityType: AssetEntityType;
  field: AssetAttachmentField;
}

export interface EnqueueAssetProcessingInput {
  originalFilename: string;
  processingKind: AssetProcessingKind;
  sourceMimeType?: string | null;
  sourcePath: string;
  target: AssetProcessingTarget;
}

export interface EnqueueAssetProcessingResult {
  jobId: string;
}

export async function enqueueAssetProcessing(
  input: EnqueueAssetProcessingInput
): Promise<EnqueueAssetProcessingResult> {
  return await invoke<EnqueueAssetProcessingResult>(
    "enqueue_asset_processing",
    input
  );
}
```

Run green, then commit:

```bash
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts
git add apps/pos-app/src/lib/assets.ts apps/pos-app/src/lib/__test__/assets.test.ts
git commit -m "feat(pos): add generic asset processing client API"
```

---

## Task 2: Add Generic Asset Queue Schema And Rust Records

Files:

- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify schema/bootstrap file found by search
- Test: `apps/pos-app/src-tauri/src/assets.rs`

Find schema:

```bash
rg -n "pending_product_photo_jobs|CREATE TABLE|local_asset_cache" apps/pos-app/src-tauri/src apps/pos-app/src db packages
```

Failing tests:

```rust
#[test]
fn supported_asset_attachment_target_accepts_product_image() {
    let target = AssetAttachmentTarget {
        entity_type: "product".to_string(),
        entity_id: "product-1".to_string(),
        field: "image_asset_id".to_string(),
    };

    assert!(validate_asset_attachment_target(&target).is_ok());
}

#[test]
fn supported_asset_attachment_target_rejects_unknown_field() {
    let target = AssetAttachmentTarget {
        entity_type: "product".to_string(),
        entity_id: "product-1".to_string(),
        field: "avatar_asset_id".to_string(),
    };

    assert!(validate_asset_attachment_target(&target).is_err());
}

#[test]
fn asset_attachment_ready_payload_uses_generic_fields() {
    let payload = AssetAttachmentReadyPayload {
        asset_id: "asset-1".to_string(),
        entity_id: "product-1".to_string(),
        entity_type: "product".to_string(),
        field: "image_asset_id".to_string(),
    };
    let json = serde_json::to_value(payload).expect("payload serializes");

    assert_eq!(json["asset_id"], "asset-1");
    assert_eq!(json["entity_id"], "product-1");
    assert_eq!(json["entity_type"], "product");
    assert_eq!(json["field"], "image_asset_id");
}
```

Run red:

```bash
cd apps/pos-app/src-tauri && cargo test supported_asset_attachment_target asset_attachment_ready_payload
```

Implement:

```rust
#[derive(Clone, serde::Deserialize)]
pub struct AssetAttachmentTarget {
    entity_type: String,
    entity_id: String,
    field: String,
}

#[derive(Clone, serde::Serialize)]
struct AssetAttachmentReadyPayload {
    asset_id: String,
    entity_id: String,
    entity_type: String,
    field: String,
}

#[derive(Clone, serde::Serialize)]
struct AssetCacheReadyPayload {
    asset_id: String,
}

fn validate_asset_attachment_target(target: &AssetAttachmentTarget) -> Result<(), String> {
    match (target.entity_type.as_str(), target.field.as_str()) {
        ("product", "image_asset_id") => Ok(()),
        _ => Err(format!(
            "Unsupported asset attachment target {}.{}",
            target.entity_type, target.field
        )),
    }
}
```

Add record:

```rust
struct PendingAssetProcessingJobRecord {
    id: String,
    merchant_id: String,
    source_path: String,
    original_filename: String,
    source_mime_type: Option<String>,
    processing_kind: String,
    entity_type: String,
    entity_id: String,
    attachment_field: String,
    preview_path: Option<String>,
    preview_mime_type: Option<String>,
    status: String,
    attempts: i64,
}
```

Add `pending_asset_processing_jobs` schema in the same local schema layer. Do not remove old table yet.

Run green and commit:

```bash
cd apps/pos-app/src-tauri && cargo test --lib
git add apps/pos-app/src-tauri/src apps/pos-app/src
git commit -m "feat(pos): add generic asset processing queue schema"
```

---

## Task 3: Implement Generic Enqueue Command

Files:

- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

Implement structs:

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueAssetProcessingRequest {
    original_filename: String,
    processing_kind: String,
    source_mime_type: Option<String>,
    source_path: String,
    target: AssetAttachmentTarget,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueAssetProcessingResponse {
    job_id: String,
}
```

Command:

```rust
#[command]
pub async fn enqueue_asset_processing(
    state: State<'_, AppState>,
    request: EnqueueAssetProcessingRequest,
) -> Result<EnqueueAssetProcessingResponse, String> {
    validate_asset_attachment_target(&request.target)?;
    // insert pending_asset_processing_jobs
}
```

If Tauri does not deserialize nested command payloads as expected, use flattened command args and match the TS wrapper.

Register in `apps/pos-app/src-tauri/src/lib.rs`:

```rust
assets::enqueue_asset_processing
```

Run and commit:

```bash
cd apps/pos-app/src-tauri && cargo test --lib
git add apps/pos-app/src-tauri/src/assets.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat(pos): enqueue generic asset processing jobs"
```

---

## Task 4: Replace Product Form Enqueue With Generic Enqueue

Files:

- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`

Update tests to expect:

```ts
expect(mockEnqueueAssetProcessing).toHaveBeenCalledWith({
  originalFilename: "nasi.jpg",
  processingKind: "image:webp-thumbnail",
  sourceMimeType: "image/jpeg",
  sourcePath: "/tmp/nasi.jpg",
  target: {
    entityId: createdProduct.id,
    entityType: "product",
    field: "image_asset_id",
  },
});
```

Run red:

```bash
cd apps/pos-app && bun run test src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Replace product-specific enqueue with:

```ts
enqueueAssetProcessing({
  originalFilename: pendingPhoto.filename,
  processingKind: "image:webp-thumbnail",
  sourceMimeType: pendingPhoto.mimeType,
  sourcePath: pendingPhoto.path,
  target: {
    entityId: savedProduct.id,
    entityType: "product",
    field: "image_asset_id",
  },
});
```

Keep immediate navigation. Do not await compression.

Run green and commit:

```bash
cd apps/pos-app && bun run test src/pages/settings/product-categories/__test__/product-form.test.tsx
git add apps/pos-app/src/pages/settings/product-categories/product-form.tsx apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx
git commit -m "feat(pos): use generic asset jobs for product photos"
```

---

## Task 5: Implement Generic Asset Job Processor

Files:

- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src/lib/assets.ts`
- Test: `apps/pos-app/src/lib/__test__/assets.test.ts`

Failing TS wrapper test:

```ts
test("processPendingAssetJobs invokes generic processor", async () => {
  mockInvoke.mockResolvedValueOnce(1);

  const { processPendingAssetJobs } = await import("~/lib/assets");

  const result = await processPendingAssetJobs({ limit: 20 });

  expect(result).toBe(1);
  expect(mockInvoke).toHaveBeenCalledWith("process_pending_asset_jobs", {
    limit: 20,
  });
});
```

Add wrapper:

```ts
export async function processPendingAssetJobs(input: {
  limit?: number;
} = {}): Promise<number> {
  return await invoke<number>("process_pending_asset_jobs", {
    limit: input.limit ?? 20,
  });
}
```

Rust processor helpers:

```txt
load_pending_asset_processing_jobs
claim_pending_asset_processing_job
mark_pending_asset_processing_job_failed
delete_pending_asset_processing_job
process_pending_asset_jobs_inner
```

Algorithm:

```txt
load pending jobs
for each job:
  claim pending -> processing
  validate processing_kind
  validate attachment target
  prepare local image asset from path
  link asset to target via allowlisted function
  clear preview if any
  delete temp input if safe
  delete job row
  emit asset-cache-ready
  emit asset-attachment-ready
```

Initial linker:

```rust
async fn link_asset_to_attachment_target(
    pool: &SqlitePool,
    target: &AssetAttachmentTarget,
    merchant_id: &str,
    asset_id: &str,
) -> Result<(), String> {
    match (target.entity_type.as_str(), target.field.as_str()) {
        ("product", "image_asset_id") => {
            update_product_image_asset_id(pool, &target.entity_id, merchant_id, asset_id).await
        }
        _ => Err(format!(
            "Unsupported asset attachment target {}.{}",
            target.entity_type, target.field
        )),
    }
}
```

Emit:

```rust
emit_asset_cache_ready(&app, &asset_id);
emit_asset_attachment_ready(
    &app,
    &AssetAttachmentReadyPayload {
        asset_id: asset_id.clone(),
        entity_id: target.entity_id.clone(),
        entity_type: target.entity_type.clone(),
        field: target.field.clone(),
    },
);
```

Register:

```rust
assets::process_pending_asset_jobs
```

Run and commit:

```bash
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts
cd apps/pos-app/src-tauri && cargo test --lib
git add apps/pos-app/src/lib/assets.ts apps/pos-app/src/lib/__test__/assets.test.ts apps/pos-app/src-tauri/src/assets.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat(pos): process generic asset jobs"
```

---

## Task 6: Switch Sync Orchestrator To Generic Asset Jobs

Files:

- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`

Update tests to mock/expect:

```ts
processPendingAssetJobs({ limit: 20 })
```

instead of product-specific job processing.

Implement:

```ts
async function processPendingAssetProcessingJobs(): Promise<void> {
  try {
    syncLogger.info("asset_processing_jobs_started", {});
    const processedCount = await processPendingAssetJobs({ limit: 20 });
    syncLogger.info("asset_processing_jobs_finished", { processedCount });
  } catch (error) {
    syncLogger.error("asset_processing_jobs_failed", error, {});
  }
}
```

Keep order inside serialized `syncNow()`:

```txt
process asset jobs -> upload assets -> push DB rows
```

Run and commit:

```bash
cd apps/pos-app && bun run test src/store/__test__/sync.test.ts
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts
git commit -m "feat(pos): sync generic asset processing jobs"
```

---

## Task 7: Add Frontend Asset Event Stores And Listeners

Files:

- Create: `apps/pos-app/src/store/asset-cache.ts`
- Create: `apps/pos-app/src/store/domain-catalog.ts`
- Create: `apps/pos-app/src/lib/product-images/asset-events.ts`
- Tests:
  - `apps/pos-app/src/store/__test__/asset-cache.test.ts`
  - `apps/pos-app/src/store/__test__/domain-catalog.test.ts`
  - `apps/pos-app/src/lib/product-images/__test__/asset-events.test.ts`

Asset cache store:

```ts
import { createStore } from "solid-js/store";

const [assetVersions, setAssetVersions] = createStore<Record<string, number>>(
  {}
);

export function getAssetCacheVersion(assetId: string | null | undefined) {
  if (!assetId) {
    return 0;
  }

  return assetVersions[assetId] ?? 0;
}

export function notifyAssetCacheReady(assetId: string) {
  if (!assetId) {
    return;
  }

  setAssetVersions(assetId, (version) => (version ?? 0) + 1);
}

export function resetAssetCacheVersionsForTest() {
  for (const assetId of Object.keys(assetVersions)) {
    setAssetVersions(assetId, undefined as never);
  }
}
```

Domain catalog store:

```ts
import { createStore } from "solid-js/store";

export type AssetEntityType = "product";
export type AssetAttachmentField = "image_asset_id";

interface AssetAttachmentReadyInput {
  assetId: string;
  entityId: string;
  entityType: AssetEntityType;
  field: AssetAttachmentField;
}

const [domainVersions, setDomainVersions] = createStore<
  Partial<Record<AssetEntityType, number>>
>({});

export function getDomainCatalogVersion(entityType: AssetEntityType) {
  return domainVersions[entityType] ?? 0;
}

export function notifyAssetAttachmentReady(input: AssetAttachmentReadyInput) {
  if (input.entityType === "product") {
    setDomainVersions("product", (version) => (version ?? 0) + 1);
  }
}

export function resetDomainCatalogVersionsForTest() {
  setDomainVersions("product", undefined);
}
```

Event listener:

```ts
import { listen } from "@tauri-apps/api/event";
import { notifyAssetCacheReady } from "~/store/asset-cache";
import { notifyAssetAttachmentReady } from "~/store/domain-catalog";

interface AssetCacheReadyPayload {
  asset_id: string;
}

interface AssetAttachmentReadyPayload {
  asset_id: string;
  entity_id: string;
  entity_type: "product";
  field: "image_asset_id";
}

let unsubscribeAssetEvents: (() => void)[] = [];

export async function startAssetEventListeners() {
  if (unsubscribeAssetEvents.length > 0) {
    return;
  }

  const unsubscribeAssetCacheReady = await listen<AssetCacheReadyPayload>(
    "asset-cache-ready",
    (event) => notifyAssetCacheReady(event.payload.asset_id)
  );

  const unsubscribeAssetAttachmentReady =
    await listen<AssetAttachmentReadyPayload>(
      "asset-attachment-ready",
      (event) => {
        notifyAssetCacheReady(event.payload.asset_id);
        notifyAssetAttachmentReady({
          assetId: event.payload.asset_id,
          entityId: event.payload.entity_id,
          entityType: event.payload.entity_type,
          field: event.payload.field,
        });
      }
    );

  unsubscribeAssetEvents = [
    unsubscribeAssetCacheReady,
    unsubscribeAssetAttachmentReady,
  ];
}

export function stopAssetEventListeners() {
  for (const unsubscribe of unsubscribeAssetEvents) {
    unsubscribe();
  }
  unsubscribeAssetEvents = [];
}
```

Run and commit:

```bash
cd apps/pos-app && bun run test \
  src/store/__test__/asset-cache.test.ts \
  src/store/__test__/domain-catalog.test.ts \
  src/lib/product-images/__test__/asset-events.test.ts
git add apps/pos-app/src/store/asset-cache.ts apps/pos-app/src/store/domain-catalog.ts apps/pos-app/src/store/__test__/asset-cache.test.ts apps/pos-app/src/store/__test__/domain-catalog.test.ts apps/pos-app/src/lib/product-images/asset-events.ts apps/pos-app/src/lib/product-images/__test__/asset-events.test.ts
git commit -m "feat(pos): add generic asset readiness events"
```

---

## Task 8: Wire UI Resources To Generic Invalidation

Files:

- Modify: `apps/pos-app/src/components/product-image.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-list.tsx`
- Modify: `apps/pos-app/src/pages/pos/use-pos.ts`
- Tests:
  - `apps/pos-app/src/components/__test__/product-image.test.tsx`
  - relevant product list/POS tests

`ProductImage` source:

```tsx
const [cachedImageUrl] = createResource(
  () => {
    const assetId = props.imageAssetId;
    return {
      assetId,
      version: getAssetCacheVersion(assetId),
    };
  },
  ({ assetId }) => resolveCachedProductImageUrl(assetId)
);
```

Product list resource:

```tsx
const [products, { refetch }] = createResource(
  () => ({
    filter: filterCategoryId(),
    version: getDomainCatalogVersion("product"),
  }),
  ({ filter }) => getProducts(filter)
);
```

POS resource:

```ts
const [groupedData] = createResource(
  () => getDomainCatalogVersion("product"),
  () => getActiveProductsByCategory()
);
```

Run and commit:

```bash
cd apps/pos-app && bun run test \
  src/components/__test__/product-image.test.tsx \
  src/pages/settings/product-categories/__test__/product-form.test.tsx \
  src/pages/pos/__test__/pos.test.tsx
git add apps/pos-app/src/components/product-image.tsx apps/pos-app/src/pages/settings/product-categories/product-list.tsx apps/pos-app/src/pages/pos/use-pos.ts apps/pos-app/src
git commit -m "feat(pos): refresh UI from generic asset events"
```

---

## Task 9: Start Generic Asset Event Listeners On App Startup

Files:

- Inspect/modify: `apps/pos-app/src/main.tsx`
- Create if useful: `apps/pos-app/src/lib/app/listeners.ts`

Find bootstrap:

```bash
rg -n "render\\(|startSyncScheduler|App" apps/pos-app/src/main.tsx apps/pos-app/src
```

Preferred helper:

```ts
import { startAssetEventListeners } from "~/lib/product-images/asset-events";

export function startAppEventListeners() {
  void startAssetEventListeners();
}
```

Call once from app bootstrap:

```ts
startAppEventListeners();
```

Do not await before rendering.

Run and commit:

```bash
cd apps/pos-app && bun run test src/lib/product-images/__test__/asset-events.test.ts
git add apps/pos-app/src
git commit -m "feat(pos): start generic asset event listeners"
```

---

## Task 10: Background Asset Hydration, Single-Flight

Files:

- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`

Tests:

1. `syncNow()` resolves without awaiting `hydrateMissingProductImages`.
2. Repeated sync calls do not start overlapping hydration.
3. Hydration failure logs but does not reject sync.

Implementation outline:

```ts
let inFlightAssetHydration: Promise<void> | null = null;
let followUpAssetHydrationRequested = false;

function hydrateProductImagesInBackground(
  merchantId: string,
  sessionToken: string
) {
  if (inFlightAssetHydration) {
    followUpAssetHydrationRequested = true;
    return;
  }

  inFlightAssetHydration = drainAssetHydrationRequests(
    merchantId,
    sessionToken
  ).finally(() => {
    inFlightAssetHydration = null;
  });
}
```

Keep generic asset processing/upload/DB push serialized. Only remote download hydration becomes background.

Run and commit:

```bash
cd apps/pos-app && bun run test src/store/__test__/sync.test.ts
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts
git commit -m "feat(pos): run asset hydration in background"
```

---

## Task 11: Remove Or Deprecate Product-Specific Job API

Files:

- Modify: `apps/pos-app/src/lib/assets.ts`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

Search:

```bash
rg -n "product_photo_jobs|pending_product_photo_jobs|enqueueProductPhotoProcessing|processPendingProductPhotoJobs|process_pending_product_photo_jobs|enqueue_product_photo_processing|product-photo-ready" apps/pos-app/src apps/pos-app/src-tauri/src docs
```

Remove active TS exports/imports:

```txt
enqueueProductPhotoProcessing
processPendingProductPhotoJobs
```

Remove old Rust command registration:

```rust
assets::enqueue_product_photo_processing
assets::process_pending_product_photo_jobs
```

Keep unregistered Rust internals only if needed temporarily. Prefer removal because the app is experimental.

Run and commit:

```bash
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts src/store/__test__/sync.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx
cd apps/pos-app/src-tauri && cargo test --lib
git add apps/pos-app/src apps/pos-app/src-tauri/src
git commit -m "refactor(pos): remove product-specific asset job API"
```

---

## Task 12: Update Knowledge Documentation

Files:

- Modify: `docs/knowledge/pos-product-photo-jobs-and-asset-sync.md`
- Modify: `docs/knowledge/android-photo-picker-and-filesystem.md`
- Possibly create: `docs/knowledge/pos-generic-asset-processing-and-sync.md`

Document:

```md
## Generic Asset Processing Pipeline

Do not add new domain-specific asset queues like `pending_employee_photo_jobs`.

Use `pending_asset_processing_jobs` with:

- `processing_kind`
- `entity_type`
- `entity_id`
- `attachment_field`

The processor creates a generic asset, writes local cache, links to an allowlisted entity field, and emits `asset-attachment-ready`.

Current supported attachment:

- `product.image_asset_id`

Future attachments should add allowlisted linker branches, not dynamic SQL.
```

Events:

```md
- `asset-cache-ready`: local asset file is readable.
- `asset-attachment-ready`: processed asset is linked to a domain entity.
```

Warning:

```md
Asset hydration/download may run in the background. UI must not assume image files are ready just because `image_asset_id` exists.
```

ADB command:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE '\[PHOTO-DEBUG\]|asset_processing_job|asset_processing_jobs|asset-cache-ready|asset-attachment-ready|asset_cache_ready|asset_attachment_ready|asset_hydration|hydrate_asset|download_done|upload_asset|failed|error'
```

Commit:

```bash
git add docs/knowledge
git commit -m "docs: document generic asset processing pipeline"
```

---

## Task 13: Full Verification

Frontend:

```bash
cd apps/pos-app && bun run test \
  src/lib/__test__/assets.test.ts \
  src/store/__test__/asset-cache.test.ts \
  src/store/__test__/domain-catalog.test.ts \
  src/lib/product-images/__test__/asset-events.test.ts \
  src/components/__test__/product-image.test.tsx \
  src/store/__test__/sync.test.ts \
  src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Rust:

```bash
cd apps/pos-app/src-tauri && cargo test --lib
```

Ultracite:

```bash
bun x ultracite check \
  apps/pos-app/src/lib/assets.ts \
  apps/pos-app/src/lib/__test__/assets.test.ts \
  apps/pos-app/src/store/asset-cache.ts \
  apps/pos-app/src/store/domain-catalog.ts \
  apps/pos-app/src/lib/product-images/asset-events.ts \
  apps/pos-app/src/components/product-image.tsx \
  apps/pos-app/src/store/sync.ts \
  apps/pos-app/src/pages/settings/product-categories/product-form.tsx \
  apps/pos-app/src/pages/settings/product-categories/product-list.tsx \
  apps/pos-app/src/pages/pos/use-pos.ts
```

Diff:

```bash
git diff --check
```

Android logs:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE '\[PHOTO-DEBUG\]|asset_processing_job|asset_processing_jobs|asset-cache-ready|asset-attachment-ready|asset_cache_ready|asset_attachment_ready|asset_hydration|hydrate_asset|download_done|upload_asset|failed|error'
```

Manual flow:

1. Reinstall app with clean data.
2. Login and select merchant/outlet.
3. Open POS/product list immediately.
4. Confirm rows render before all image downloads finish.
5. Confirm placeholders progressively become images as hydration events arrive.
6. Create product with gallery photo.
7. Confirm form submits immediately.
8. Confirm generic asset job logs appear.
9. Confirm `asset-attachment-ready` is emitted.
10. Confirm POS/product list updates without navigation.
11. Confirm asset uploads to R2.
12. Reinstall again and confirm remote image hydrates back.

Final commit if needed:

```bash
git add .
git commit -m "fix(pos): stabilize generic asset pipeline"
```

---

## Naming Rules Going Forward

Generic asset lifecycle names:

```txt
asset_processing_job
pending_asset_processing_jobs
enqueue_asset_processing
process_pending_asset_jobs
asset-cache-ready
asset-attachment-ready
```

Domain names only at UI/domain boundaries:

```txt
product catalog invalidation
employee catalog invalidation
link_product_image_asset
link_employee_image_asset
```

Do not add these unless the process truly cannot fit the generic pipeline:

```txt
pending_employee_photo_jobs
process_pending_employee_photo_jobs
employee-photo-ready
```

