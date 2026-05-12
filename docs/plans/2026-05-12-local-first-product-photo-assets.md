# Local-First Product Photo Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move product photo upload out of the JS form path and into the Rust sync queue so product creation remains local-first and only compressed WebP files are persisted by the app.

**Architecture:** The product form should only process the selected image, create a local pending asset, and save the product with `image_asset_id`. Rust owns compressed file persistence, local asset/cache row creation, queued upload, and hydration. The original selected image may exist only in memory during processing and must never be persisted by the app after WebP compression succeeds.

**Tech Stack:** SolidJS, Vitest, Tauri v2 commands, Rust, SQLite via `sqlx`, Drizzle schemas, protobuf asset API, S3-compatible presigned URLs.

---

## Requirements

- Product creation and editing with a photo must work offline.
- The JS product form must not call `api/assets/presign-upload`.
- The JS product form must not `fetch()` a presigned object storage URL.
- The app must persist only the compressed WebP file.
- The original uncompressed image must not be saved to app storage, local DB, sync outbox, or object storage.
- If a temporary original fallback is ever introduced, it must be deleted immediately after compressed WebP persistence succeeds and also cleaned up on failure.
- Upload is a Rust sync job, not a form save prerequisite.
- R2 CORS should not be required for upload because Rust `reqwest` handles the object storage `PUT`.

## Current Problem

The current product form calls:

```ts
uploadProcessedAsset(...)
completeUploadedAsset(...)
persistCachedAsset(...)
```

That means JS asks the API for a presigned URL, uploads directly to object storage, and completes the asset before save. This weakens the local-first model because photo attachment depends on cloud availability during form interaction.

## Target Flow

```text
User picks photo
  -> JS reads selected File bytes into memory
  -> Rust decodes and compresses to WebP
  -> Rust writes only compressed WebP to app cache
  -> Rust inserts/updates local assets row as pending_upload
  -> Rust inserts/updates local_asset_cache row as pending_upload
  -> JS stores returned assetId in form state
  -> Product save writes imageAssetId locally
  -> Sync invokes Rust upload_pending_product_images
  -> Rust asks API for presigned URL
  -> Rust uploads compressed WebP to object storage
  -> Rust completes upload
  -> Rust marks asset/cache ready and queues sync metadata
```

---

### Task 1: Add Local-First Pending Asset Command Contract

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing Rust tests**

Add tests in `apps/pos-app/src-tauri/src/assets.rs`:

```rust
#[test]
fn build_pending_asset_object_key_uses_asset_id_only() {
    let object_key = build_pending_asset_object_key("merchant-1", "asset-1");
    assert_eq!(object_key, "merchant-1/assets/asset-1");
}

#[test]
fn compressed_asset_cache_path_rejects_parent_dir() {
    let root = PathBuf::from("/tmp/cache");
    let error = asset_cache_file_path_from_root(&root, "../original.jpg")
        .expect_err("parent paths must be rejected");
    assert!(error.contains("Invalid asset object key"));
}
```

These tests protect the local cache path and make clear that object keys are app-owned, not original filenames.

**Step 2: Run test to verify it fails**

Run from `apps/pos-app/src-tauri`:

```bash
cargo test --lib assets -- --nocapture
```

Expected: FAIL because `build_pending_asset_object_key` does not exist.

**Step 3: Implement minimal helper**

Add:

```rust
fn build_pending_asset_object_key(merchant_id: &str, asset_id: &str) -> String {
    format!("{merchant_id}/assets/{asset_id}")
}
```

Keep `validate_object_key` and `asset_cache_file_path_from_root` as the guard against unsafe paths.

**Step 4: Run test to verify it passes**

Run:

```bash
cargo test --lib assets -- --nocapture
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/src/assets.rs
git commit -m "test: cover local asset object key helpers"
```

---

### Task 2: Add Rust Command to Persist Compressed Pending Asset

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing Rust test**

Add a focused unit test for the pure input validation and compressed-only behavior:

```rust
#[test]
fn pending_asset_input_uses_webp_only() {
    assert!(is_supported_processed_content_type("image/webp"));
    assert!(!is_supported_processed_content_type("image/png"));
    assert!(!is_supported_processed_content_type("image/jpeg"));
}
```

**Step 2: Run test to verify it fails**

Run:

```bash
cargo test --lib assets -- --nocapture
```

Expected: FAIL because `is_supported_processed_content_type` does not exist.

**Step 3: Implement minimal validation**

Add:

```rust
fn is_supported_processed_content_type(content_type: &str) -> bool {
    content_type == "image/webp"
}
```

**Step 4: Add the Tauri command**

Add a command that persists the already compressed WebP result and creates pending local rows:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingImageAssetResponse {
    pub asset_id: String,
    pub object_key: String,
    pub local_path: String,
}

#[command]
pub async fn create_pending_product_image_asset(
    app: AppHandle,
    merchant_id: String,
    original_filename: String,
    content_hash: String,
    content_type: String,
    byte_size: i64,
    width: i64,
    height: i64,
    data_base64: String,
    state: State<'_, AppState>,
) -> Result<PendingImageAssetResponse, String>
```

Implementation requirements:

- Reject non-`image/webp` content type.
- Decode `data_base64` as compressed WebP bytes.
- Verify `sha256_hex(bytes) == content_hash`.
- Generate a new asset id in Rust.
- Build `object_key` with `build_pending_asset_object_key`.
- Write only the compressed WebP bytes to the asset cache.
- Insert or replace `assets` with `status = 'pending_upload'`.
- Insert or replace `local_asset_cache` with `status = 'pending_upload'`.
- Record a local sync outbox row for `assets`.
- Return `{ assetId, objectKey, localPath }`.

Do not write original image bytes anywhere.

**Step 5: Register the command**

In `apps/pos-app/src-tauri/src/lib.rs`, add:

```rust
assets::create_pending_product_image_asset,
```

to the invoke handler list.

**Step 6: Run tests**

Run:

```bash
cargo test --lib assets -- --nocapture
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/src-tauri/src/assets.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat: persist pending product photo assets locally"
```

---

### Task 3: Replace JS Upload Helper With Local Pending Asset Helper

**Files:**
- Modify: `apps/pos-app/src/lib/assets.ts`
- Modify: `apps/pos-app/src/lib/__test__/assets.test.ts`

**Step 1: Write the failing test**

In `apps/pos-app/src/lib/__test__/assets.test.ts`, add:

```ts
test("createPendingProductImageAsset invokes rust and does not call fetch", async () => {
  globalThis.fetch = vi.fn();
  mockInvoke.mockResolvedValue({
    assetId: "asset-1",
    objectKey: "merchant-1/assets/asset-1",
    localPath: "/tmp/asset-cache/asset-1.webp",
  });

  const result = await createPendingProductImageAsset({
    byteSize: 10,
    contentHash: "a".repeat(64),
    contentType: "image/webp",
    dataBase64: "d2VicA==",
    height: 600,
    merchantId: "merchant-1",
    originalFilename: "coffee.png",
    width: 800,
  });

  expect(result.assetId).toBe("asset-1");
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(mockInvoke).toHaveBeenCalledWith("create_pending_product_image_asset", {
    byteSize: 10,
    contentHash: "a".repeat(64),
    contentType: "image/webp",
    dataBase64: "d2VicA==",
    height: 600,
    merchantId: "merchant-1",
    originalFilename: "coffee.png",
    width: 800,
  });
});
```

**Step 2: Run test to verify it fails**

Run from `apps/pos-app`:

```bash
bun run test -- src/lib/__test__/assets.test.ts
```

Expected: FAIL because `createPendingProductImageAsset` does not exist.

**Step 3: Implement minimal helper**

In `apps/pos-app/src/lib/assets.ts`, add:

```ts
export interface PendingProductImageAsset {
  assetId: string;
  localPath: string;
  objectKey: string;
}

export async function createPendingProductImageAsset(input: {
  byteSize: number;
  contentHash: string;
  contentType: string;
  dataBase64: string;
  height: number;
  merchantId: string;
  originalFilename: string;
  width: number;
}): Promise<PendingProductImageAsset> {
  return await invoke<PendingProductImageAsset>(
    "create_pending_product_image_asset",
    input
  );
}
```

Keep `processImageFile` and `createWebpPreviewUrl`.

**Step 4: Remove direct upload exports if unused**

After product form migration, remove or deprecate:

- `uploadProcessedAsset`
- `completeUploadedAsset`

Only remove them if no remaining call sites use them.

**Step 5: Run test to verify it passes**

Run:

```bash
bun run test -- src/lib/__test__/assets.test.ts
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src/lib/assets.ts apps/pos-app/src/lib/__test__/assets.test.ts
git commit -m "feat: add local pending product photo helper"
```

---

### Task 4: Make Product Form Local-First

**Files:**
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`

**Step 1: Write the failing tests**

Replace the current photo tests with local-first expectations:

```ts
test("selecting a photo creates a local pending asset without direct upload", async () => {
  mockProcessImageFile.mockResolvedValue({
    byteSize: 10,
    contentHash: "a".repeat(64),
    contentType: "image/webp",
    dataBase64: "d2VicA==",
    height: 600,
    width: 800,
  });
  mockCreatePendingProductImageAsset.mockResolvedValue({
    assetId: "asset-1",
    objectKey: "merchant-1/assets/asset-1",
    localPath: "/tmp/asset-cache/asset-1.webp",
  });

  render(() => <ProductForm />);
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], "coffee.png", {
    type: "image/png",
  });

  await user.upload(fileInput, file);

  expect(mockCreatePendingProductImageAsset).toHaveBeenCalledWith(
    expect.objectContaining({
      contentType: "image/webp",
      merchantId: "merchant-1",
      originalFilename: "coffee.png",
    })
  );
  expect(mockUploadProcessedAsset).not.toHaveBeenCalled();
  expect(mockCompleteUploadedAsset).not.toHaveBeenCalled();
});
```

Add:

```ts
test("saving with a local pending photo stores imageAssetId and navigates without waiting for cloud upload")
```

Expected assertions:

- `createProduct` receives `imageAssetId: "asset-1"`.
- Toast says `Foto akan diupload saat online`.
- No presign/upload helper is called.

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: FAIL because the form still calls `uploadProcessedAsset` and `completeUploadedAsset`.

**Step 3: Update the form implementation**

In `product-form.tsx`:

- Remove imports for `uploadProcessedAsset`, `completeUploadedAsset`, and `persistCachedAsset`.
- Import `createPendingProductImageAsset`.
- In `handleFileChange`, keep:

```ts
const processed = await processImageFile(file);
const previewUrl = createWebpPreviewUrl(processed.dataBase64);
```

- Replace direct upload with:

```ts
const pendingAsset = await createPendingProductImageAsset({
  byteSize: processed.byteSize,
  contentHash: processed.contentHash,
  contentType: processed.contentType,
  dataBase64: processed.dataBase64,
  height: processed.height,
  merchantId,
  originalFilename: file.name,
  width: processed.width,
});
setImageAssetId(pendingAsset.assetId);
```

- Keep the selected `File` scoped to `handleFileChange`; do not store it in signal/state.
- Keep `target.value = ""` in `finally` so the browser input releases the selected file.

**Step 4: Run tests**

Run:

```bash
bun run test -- src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/settings/product-categories/product-form.tsx apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx
git commit -m "feat: make product photo form local first"
```

---

### Task 5: Ensure Sync Upload Owns Cloud Transfer

**Files:**
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`
- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write the failing sync test**

In `apps/pos-app/src/store/__test__/sync.test.ts`, assert upload queue runs before local sync state is read:

```ts
test("uploads pending product images before reading local sync state", async () => {
  const calls: string[] = [];
  mockRequestUploadPendingProductImages.mockImplementation(async () => {
    calls.push("upload-images");
    return 1;
  });
  mockInvoke.mockImplementation(async (command: string) => {
    if (command === "get_sync_local_state") {
      calls.push("read-local-state");
      return emptyLocalState;
    }
    return defaultSyncResult;
  });

  await syncNow();

  expect(calls).toEqual(["upload-images", "read-local-state"]);
});
```

**Step 2: Run test to verify it fails if ordering is wrong**

Run:

```bash
bun run test -- src/store/__test__/sync.test.ts
```

Expected: PASS if already implemented correctly, FAIL if the order regressed.

If it passes immediately, keep the test as regression coverage.

**Step 3: Review Rust queue assumptions**

Confirm `upload_pending_product_images`:

- reads from `local_asset_cache.local_path`
- uploads only the cached compressed WebP file
- validates content hash before upload
- never reads original image files

If missing, add a Rust test:

```rust
#[test]
fn upload_queue_status_filter_only_selects_pending_compressed_assets() {
    assert!(is_valid_asset_status("pending_upload"));
}
```

**Step 4: Run tests**

Run:

```bash
bun run test -- src/store/__test__/sync.test.ts
cargo test --lib assets -- --nocapture
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts apps/pos-app/src-tauri/src/assets.rs
git commit -m "test: cover product photo upload queue ownership"
```

---

### Task 6: Remove JS Direct Upload Surface

**Files:**
- Modify: `apps/pos-app/src/lib/assets.ts`
- Modify: `apps/pos-app/src/lib/__test__/assets.test.ts`

**Step 1: Write the failing static check**

Add or update tests so no production code imports direct upload helpers from `~/lib/assets`.

At minimum, run:

```bash
rg -n "uploadProcessedAsset|completeUploadedAsset|fetch\\(response\\.uploadUrl" apps/pos-app/src -S
```

Expected after implementation: no production matches.

**Step 2: Remove unused code**

If no production code uses these functions, remove:

- `uploadProcessedAsset`
- `completeUploadedAsset`
- direct object storage `fetch` from `apps/pos-app/src/lib/assets.ts`

Keep:

- `processImageFile`
- `createPendingProductImageAsset`
- `presignAssetDownload`
- `persistCachedAsset` only if hydration still needs it from JS
- `createWebpPreviewUrl`

**Step 3: Run tests**

Run:

```bash
bun run test -- src/lib/__test__/assets.test.ts
rg -n "uploadProcessedAsset|completeUploadedAsset|fetch\\(response\\.uploadUrl" apps/pos-app/src -S
```

Expected: tests PASS and `rg` returns no production direct upload path.

**Step 4: Commit**

```bash
git add apps/pos-app/src/lib/assets.ts apps/pos-app/src/lib/__test__/assets.test.ts
git commit -m "refactor: remove browser object storage upload path"
```

---

### Task 7: Document Compressed-Only Storage Rule

**Files:**
- Modify: `docs/plans/2026-05-11-product-photo-assets.md`
- Modify: `docs/plans/2026-05-12-local-first-product-photo-assets.md`

**Step 1: Update docs**

Add a short invariant section:

```markdown
## Storage Invariants

- The app never persists the original uncompressed selected image.
- The selected original file may exist only as browser/Rust memory during processing.
- App storage contains only compressed WebP assets.
- If a temporary fallback original is ever added, it must be deleted immediately after WebP persistence succeeds and must be cleaned up on failure.
- Object storage receives only compressed WebP assets for product photos.
```

**Step 2: Run markdown sanity check**

Run:

```bash
rg -n "original uncompressed|Storage Invariants|uploadProcessedAsset|completeUploadedAsset" docs/plans -S
```

Expected: docs mention the invariant and do not describe JS direct upload as the desired flow.

**Step 3: Commit**

```bash
git add docs/plans/2026-05-11-product-photo-assets.md docs/plans/2026-05-12-local-first-product-photo-assets.md
git commit -m "docs: record local first product photo asset flow"
```

---

### Task 8: End-to-End Verification

**Files:**
- No new files unless failures require focused fixes.

**Step 1: POS focused tests**

Run from `apps/pos-app`:

```bash
bun run test -- src/lib/__test__/assets.test.ts src/pages/settings/product-categories/__test__/product-form.test.tsx src/store/__test__/sync.test.ts
```

Expected: PASS.

**Step 2: POS full tests**

Run:

```bash
bun run test
```

Expected: PASS.

**Step 3: API tests**

Run from `apps/api`:

```bash
bun test
```

Expected: PASS.

**Step 4: Typechecks**

Run:

```bash
bun run typecheck
```

from:

- `apps/pos-app`
- `apps/api`

Expected: PASS.

**Step 5: Lint**

Run:

```bash
bun x ultracite check
```

from:

- `apps/pos-app`
- `apps/api`

Expected: PASS.

**Step 6: Rust tests**

Run inside `distrobox dev` from `apps/pos-app/src-tauri`:

```bash
cargo test --lib assets -- --nocapture
cargo fmt --all --check
```

Expected: PASS.

**Step 7: Manual smoke test**

Run API and app dev with R2 env configured.

Manual scenario:

- Disable network or stop API.
- Create product with photo.
- Confirm product saves locally and preview remains.
- Confirm no R2 object appears while offline.
- Restore API/network and trigger sync.
- Confirm Rust upload queue uploads compressed WebP to R2.
- Confirm asset becomes `ready`.
- Refresh app and confirm thumbnail resolves from local cache.

**Step 8: Commit verification fixes**

If verification required fixes:

```bash
git add <changed-files>
git commit -m "fix: stabilize local first product photo flow"
```

---

## Success Criteria

- Product photo selection and product save work without internet.
- No JS production code calls `api/assets/presign-upload`.
- No JS production code uploads to `response.uploadUrl`.
- Rust upload queue is the only product photo cloud upload path.
- App storage contains only compressed WebP photo files.
- Original selected image bytes are not persisted by the app.
- Sync eventually uploads pending assets when API/object storage are available.

## Future Cleanup

- Consider moving the file bytes from JS to Rust without base64 if Tauri exposes a cleaner binary command path.
- Add an admin/debug view for failed `local_asset_cache` jobs if support needs it.
- Add cache eviction limits for old ready assets.
