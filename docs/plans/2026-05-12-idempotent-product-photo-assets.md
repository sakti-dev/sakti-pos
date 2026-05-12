# Idempotent Product Photo Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make product photo upload content-addressed and idempotent so selecting the same image repeatedly never creates duplicate remote assets or crashes on unique constraints.

**Architecture:** The compressed WebP content hash is the asset id and object key suffix. The API must treat `merchant_id + content_hash` / `object_key` as an idempotency key: existing `ready` assets are reused without uploading again, and existing `pending_upload` or `failed` assets are retried against the same object key. The POS app must accept a presign response with an empty upload URL as "already ready" and mark its local row/cache ready without PUT or complete-upload.

**Tech Stack:** Bun tests, Elysia on Cloudflare Workers, Drizzle/libSQL, protobuf via `@repo/protobuf`, Rust/Tauri commands with `prost` generated protobuf types, SQLite local cache.

---

## Root Cause

The latest API log shows the real failure cause:

```text
SQLITE_CONSTRAINT: SQLite error: UNIQUE constraint failed: assets.object_key
```

The visible `created_by_user_id` in the insert SQL is Drizzle including nullable schema columns in the SQL statement; it is not the root cause. The root cause is duplicate photo content producing the same `content_hash`, `asset_id`, and `object_key`, while `/api/assets/presign-upload` always tries to insert a new `assets` row.

Expected behavior:

- Same image hash already `ready`: skip storing and skip uploading; return the existing asset.
- Same image hash already `failed` or `pending_upload`: reuse the existing row and return a signed PUT URL to retry upload.
- Same hash metadata mismatch: reject with `409`, because same hash with conflicting object key/size/type indicates bad client state or corruption.

---

### Task 1: Add API Tests For Duplicate Content Hash

**Files:**
- Modify: `apps/api/src/assets/__test__/routes.test.ts`

**Step 1: Add a helper for asset rows**

Near the existing `ASSET_OBJECT_KEY_REGEX`, add:

```ts
const EXISTING_READY_ASSET = {
  byteSize: 12_345,
  contentHash: "a".repeat(64),
  contentType: "image/webp",
  createdAt: "2026-05-10T00:00:00.000Z",
  createdByUserId: null,
  height: 600,
  id: "hash-1",
  kind: "product_photo",
  merchantId: "merchant-1",
  objectKey: "merchant-1/assets/hash-1",
  originalFilename: "coffee.webp",
  status: "ready",
  updatedAt: "2026-05-10T00:00:00.000Z",
  width: 800,
};
```

**Step 2: Write the failing ready-duplicate test**

Add this after `reuses a caller supplied asset id and object key for presign upload`:

```ts
test("reuses an existing ready asset for the same content hash without upload", async () => {
  mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
  mockSelect
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([EXISTING_READY_ASSET]),
        }),
      }),
    });

  const response = await makeProtobufRequest(
    "/api/assets/presign-upload",
    AssetPresignUploadRequest.encode(
      AssetPresignUploadRequest.create({
        assetId: "hash-1",
        byteSize: 12_345,
        contentHash: "a".repeat(64),
        contentType: "image/webp",
        height: 600,
        kind: "product_photo",
        merchantId: "merchant-1",
        objectKey: "merchant-1/assets/hash-1",
        originalFilename: "coffee.webp",
        width: 800,
      })
    ).finish()
  );

  expect(response.status).toBe(200);
  const decoded = AssetPresignUploadResponse.decode(
    new Uint8Array(await response.arrayBuffer())
  );
  expect(decoded.asset?.id).toBe("hash-1");
  expect(decoded.asset?.status).toBe("ready");
  expect(decoded.uploadUrl).toBe("");
  expect(decoded.requiredHeaders).toHaveLength(0);
  expect(mockInsert).not.toHaveBeenCalled();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(mockPresignUploadUrl).not.toHaveBeenCalled();
});
```

**Step 3: Write the failing failed-duplicate retry test**

Add:

```ts
test("retries an existing failed asset for the same content hash", async () => {
  mockGetSessionFromRequest.mockResolvedValue({ userId: "user-1" });
  mockPresignUploadUrl.mockResolvedValue("https://upload.example.test");
  const failedAsset = { ...EXISTING_READY_ASSET, status: "failed" };
  const pendingAsset = { ...EXISTING_READY_ASSET, status: "pending_upload" };
  mockSelect
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
        }),
      }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([failedAsset]),
        }),
      }),
    });

  mockUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([pendingAsset]),
      }),
    }),
  });

  const response = await makeProtobufRequest(
    "/api/assets/presign-upload",
    AssetPresignUploadRequest.encode(
      AssetPresignUploadRequest.create({
        assetId: "hash-1",
        byteSize: 12_345,
        contentHash: "a".repeat(64),
        contentType: "image/webp",
        height: 600,
        kind: "product_photo",
        merchantId: "merchant-1",
        objectKey: "merchant-1/assets/hash-1",
        originalFilename: "coffee.webp",
        width: 800,
      })
    ).finish()
  );

  expect(response.status).toBe(200);
  const decoded = AssetPresignUploadResponse.decode(
    new Uint8Array(await response.arrayBuffer())
  );
  expect(decoded.asset?.status).toBe("pending_upload");
  expect(decoded.uploadUrl).toBe("https://upload.example.test");
  expect(mockInsert).not.toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenCalledTimes(1);
});
```

**Step 4: Verify red**

Run:

```bash
cd apps/api && bun test src/assets/__test__/routes.test.ts
```

Expected: the new duplicate tests fail because the route still inserts immediately and does not check existing assets.

---

### Task 2: Implement API Idempotency

**Files:**
- Modify: `apps/api/src/assets/routes.ts`

**Step 1: Add content-hash lookup**

Change the import:

```ts
import { and, eq, or } from "drizzle-orm";
```

Before generating the presign URL, look for an existing asset:

```ts
const [existingAsset] = await db
  .select()
  .from(assets)
  .where(
    and(
      eq(assets.merchantId, merchantId),
      or(eq(assets.contentHash, contentHash), eq(assets.objectKey, objectKey))
    )
  )
  .limit(1);
```

**Step 2: Add metadata guard**

If `existingAsset` exists but any of these do not match, return `409`:

- `existingAsset.contentHash !== contentHash`
- `existingAsset.objectKey !== objectKey`
- `existingAsset.byteSize !== byteSize`
- `existingAsset.contentType !== contentType`
- `existingAsset.kind !== kind`

Use:

```ts
set.status = 409;
return { error: "Asset metadata conflicts with existing content hash" };
```

**Step 3: Reuse ready asset**

If `existingAsset.status === "ready"`, return:

```ts
return AssetPresignUploadResponse.create({
  asset: encodeAsset(existingAsset),
  requiredHeaders: [],
  uploadUrl: "",
});
```

This is the API signal that the object already exists remotely.

**Step 4: Retry existing non-ready asset**

If `existingAsset.status !== "ready"`, update its metadata back to `pending_upload`:

```ts
const [asset] = await db
  .update(assets)
  .set({
    byteSize,
    contentHash,
    contentType,
    deletedAt: null,
    kind,
    objectKey,
    originalFilename: normalizeOptionalString(request.originalFilename),
    status: "pending_upload",
    updatedAt: now,
    width: normalizeOptionalNumber(request.width),
    height: normalizeOptionalNumber(request.height),
  })
  .where(eq(assets.id, existingAsset.id))
  .returning();
```

Generate and return a PUT URL for `existingAsset.objectKey`.

**Step 5: Keep existing insert path for new assets**

Only run `.insert(assets)` when no existing asset was found.

**Step 6: Verify green**

Run:

```bash
cd apps/api && bun test src/assets/__test__/routes.test.ts
cd apps/api && bun run typecheck
cd apps/api && bun x ultracite check
```

Expected: all pass.

---

### Task 3: Teach POS Upload Loop To Skip Ready Duplicates

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write the smallest Rust-side behavior check if practical**

If there is an existing focused test module in `assets.rs`, add a helper-level unit test for a new pure function:

```rust
fn presign_response_means_already_ready(response: &asset_proto::AssetPresignUploadResponse) -> bool {
    response.upload_url.trim().is_empty()
}
```

Test:

```rust
#[test]
fn empty_presign_upload_url_means_asset_is_already_ready() {
    let response = asset_proto::AssetPresignUploadResponse {
        asset: None,
        upload_url: String::new(),
        required_headers: vec![],
    };

    assert!(presign_response_means_already_ready(&response));
}
```

**Step 2: Use the helper after presign**

In `upload_pending_product_images`, immediately after `presign_response` succeeds:

```rust
if presign_response_means_already_ready(&presign_response) {
    mark_asset_ready(pool, &asset.asset_id, &asset.merchant_id).await?;
    eprintln!(
        "[PHOTO-DEBUG] upload_asset:already_ready asset_id={}",
        asset.asset_id
    );
    processed += 1;
    continue;
}
```

This skips PUT and complete-upload for duplicate images that already exist remotely.

**Step 3: Verify Rust**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test assets --lib
```

Expected: pass.

---

### Task 4: Ensure Local Preparation Does Not Re-Dirty Ready Duplicate Assets

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Context:** `prepare_local_product_image_asset_inner` currently uses `ON CONFLICT(id) DO UPDATE SET status = 'pending_upload'`, which means picking the same image after it is already ready makes it pending again. That causes unnecessary upload attempts.

**Step 1: Adjust local asset upsert status**

In the `ON CONFLICT(id) DO UPDATE SET` for `assets`, replace:

```sql
status = 'pending_upload',
```

with:

```sql
status = CASE
  WHEN assets.status = 'ready' THEN 'ready'
  ELSE 'pending_upload'
END,
```

**Step 2: Adjust local cache upsert status**

In the `ON CONFLICT(asset_id) DO UPDATE SET` for `local_asset_cache`, replace:

```sql
status = 'pending_upload',
```

with:

```sql
status = CASE
  WHEN local_asset_cache.status = 'ready' THEN 'ready'
  ELSE 'pending_upload'
END,
cached_at = CASE
  WHEN local_asset_cache.status = 'ready' THEN COALESCE(local_asset_cache.cached_at, excluded.cached_at)
  ELSE excluded.cached_at
END,
```

**Step 3: Prevent unnecessary sync outbox insert for ready duplicate if needed**

If local SQL can detect no status change cleanly, only call `insert_sync_outbox` when the asset is not already ready. If that is too invasive, leave it: syncing an unchanged ready row is acceptable, but re-uploading is not.

**Step 4: Verify local behavior**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test assets --lib
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: pass.

---

### Task 5: Manual Verification On Device / Waydroid

**Files:**
- No code edits.

**Step 1: Restart API cleanly**

Run:

```bash
rm -rf apps/api/.wrangler && bun api:dev
```

**Step 2: Watch API log**

Run in another terminal:

```bash
tail -f /home/eekrain/CODE/sakti-pos/apps/api/.logs/api.log
```

**Step 3: Watch app log**

Run:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "SaktiPhotoPicker:V" "*:S" | grep -iE "\[PHOTO-DEBUG\]|product-photo|product-images|asset_sync|asset_upload|upload_pending|upload_asset|presign-upload|complete-upload|processing_failed|failed|error|already_ready"
```

**Step 4: Test duplicate upload**

1. Pick `food_1.jpg` and submit product.
2. Wait for upload to finish.
3. Pick the same `food_1.jpg` again for another product or edit.

Expected first upload:

```text
upload_asset:presign_request
upload_asset:put_done
upload_asset:complete_done
```

Expected duplicate after the asset is ready:

```text
upload_asset:presign_request
upload_asset:already_ready
```

Expected API:

```text
POST /api/assets/presign-upload 200 OK
```

No `UNIQUE constraint failed: assets.object_key`.

---

### Task 6: Full Verification

Run:

```bash
cd apps/api && bun test src/assets/__test__/routes.test.ts && bun run typecheck && bun x ultracite check
cd apps/pos-app && bun run test src/lib/__test__/assets.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx src/store/__test__/sync.test.ts
cd apps/pos-app && bun run typecheck && bun x ultracite check
cd apps/pos-app/src-tauri && cargo test assets --lib
```

Expected: all pass.

---

## Notes

- No API migration is required for this plan. The `assets` table and unique `object_key` already exist in `apps/api/drizzle/0007_assets.sql`.
- This plan intentionally does not introduce duplicate physical objects in R2. Same compressed bytes mean same `content_hash`, same object key, and one remote object.
- The API must not infer that a `failed` row means the remote object exists. Only `ready` can skip PUT.
- If a `ready` asset exists in the API DB but the R2 object is missing, download/display will fail later. That should be handled as a separate repair/hydration problem, not by re-uploading every duplicate image by default.
