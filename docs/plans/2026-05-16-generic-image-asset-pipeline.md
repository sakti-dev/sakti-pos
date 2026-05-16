# Generic Image Asset Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the POS image asset pipeline generic end-to-end so future image uploads can reuse the same picker, compression, local cache, pending job, and upload flow without product-specific helper names.

**Architecture:** Keep the current target-specific attachment safety: Rust still explicitly resolves and links supported targets such as `product.image_asset_id`. Generalize the reusable image asset preparation and frontend helper surfaces so callers use named target keys and generic image asset APIs. Product-specific behavior should remain only in the target registry/linker and product UI copy.

**Tech Stack:** SolidJS, Tauri commands, Rust `sqlx`, Vitest, Cargo tests, Ultracite/Biome.

---

### Task 1: Rename Frontend Local Image Asset Preparation Helpers

**Files:**
- Modify: `apps/pos-app/src/lib/assets.ts`
- Modify: `apps/pos-app/src/lib/__test__/assets.test.ts`

**Step 1: Write the failing test**

In `apps/pos-app/src/lib/__test__/assets.test.ts`, update imports and tests to use generic names:

```ts
const {
  prepareLocalImageAsset,
  prepareLocalImageAssetFromPath,
} = await import("../assets");

test("prepareLocalImageAsset stores a compressed image asset locally", async () => {
  mockInvoke.mockResolvedValue({
    asset: {
      id: "hash-1",
      merchantId: "merchant-1",
      objectKey: "merchant-1/assets/hash-1",
      contentHash: "hash-1",
      contentType: "image/webp",
      byteSize: 5,
      kind: "product_photo",
      originalFilename: "coffee.webp",
      status: "pending_upload",
      createdAt: "2026-05-12T00:00:00.000Z",
      createdByUserId: "",
      deletedAt: "",
      height: 600,
      updatedAt: "2026-05-12T00:00:00.000Z",
      width: 800,
    },
    localPath: "/tmp/cache/merchant-1/assets/hash-1.webp",
  });

  const result = await prepareLocalImageAsset({
    byteSize: 5,
    contentHash: "hash-1",
    contentType: "image/webp",
    dataBase64: "SGVsbG8=",
    height: 600,
    kind: "product_photo",
    merchantId: "merchant-1",
    originalFilename: "coffee.webp",
    width: 800,
  });

  expect(result.localPath).toContain("hash-1.webp");
  expect(mockInvoke).toHaveBeenCalledWith(
    "prepare_local_image_asset",
    expect.objectContaining({
      byteSize: 5,
      contentHash: "hash-1",
      contentType: "image/webp",
      kind: "product_photo",
      merchantId: "merchant-1",
      originalFilename: "coffee.webp",
    })
  );
});

test("prepareLocalImageAssetFromPath sends generic path metadata to Rust", async () => {
  mockInvoke.mockResolvedValue({
    asset: { id: "asset-1", objectKey: "merchant-1/assets/asset-1" },
    localPath: "/tmp/cache/merchant-1/assets/asset-1.webp",
  });

  const result = await prepareLocalImageAssetFromPath({
    kind: "product_photo",
    merchantId: "merchant-1",
    originalFilename: "photo_1.jpg",
    path: "/tmp/product_photo_inputs/photo_1.jpg",
  });

  expect(result.asset.id).toBe("asset-1");
  expect(mockInvoke).toHaveBeenCalledWith("prepare_local_image_asset_from_path", {
    kind: "product_photo",
    merchantId: "merchant-1",
    originalFilename: "photo_1.jpg",
    path: "/tmp/product_photo_inputs/photo_1.jpg",
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
rtk bun --filter @repo/pos-app test src/lib/__test__/assets.test.ts
```

Expected: FAIL because `prepareLocalImageAsset` and `prepareLocalImageAssetFromPath` are not exported, or because they still invoke product-named commands.

**Step 3: Write minimal implementation**

In `apps/pos-app/src/lib/assets.ts`, rename:

```ts
export async function prepareLocalProductImageAsset(...)
```

to:

```ts
export async function prepareLocalImageAsset(input: {
  byteSize: number;
  contentHash: string;
  contentType: string;
  dataBase64: string;
  height: number;
  kind: string;
  merchantId: string;
  originalFilename: string;
  width: number;
}): Promise<PreparedLocalAsset> {
  return await invoke<PreparedLocalAsset>("prepare_local_image_asset", {
    byteSize: input.byteSize,
    contentHash: input.contentHash,
    contentType: input.contentType,
    dataBase64: input.dataBase64,
    height: input.height,
    kind: input.kind,
    merchantId: input.merchantId,
    originalFilename: input.originalFilename,
    width: input.width,
  });
}
```

Rename:

```ts
export async function prepareLocalProductImageAssetFromPath(...)
```

to:

```ts
export async function prepareLocalImageAssetFromPath(input: {
  kind: string;
  merchantId: string;
  originalFilename: string;
  path: string;
}): Promise<PreparedLocalAsset> {
  return await invoke<PreparedLocalAsset>("prepare_local_image_asset_from_path", {
    kind: input.kind,
    merchantId: input.merchantId,
    originalFilename: input.originalFilename,
    path: input.path,
  });
}
```

Do not keep product-named aliases unless a real current import requires them.

**Step 4: Run test to verify it passes**

Run:

```bash
rtk bun --filter @repo/pos-app test src/lib/__test__/assets.test.ts
```

Expected: PASS.

---

### Task 2: Rename Rust Local Image Asset Preparation Commands

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing Rust test**

In `apps/pos-app/src-tauri/src/assets.rs`, update existing tests that refer to product-named preparation functions to use generic names. Add or modify a focused test around the path helper:

```rust
#[tokio::test]
async fn prepare_local_image_asset_from_path_inner_processes_generic_image_asset() {
    // Reuse the existing fixture style in assets.rs tests.
    // The assertion should call prepare_local_image_asset_from_path_inner,
    // not prepare_local_product_image_asset_from_path_inner.
}
```

If an existing test already calls `prepare_local_product_image_asset_from_path_inner`, rename that call and test name instead of duplicating setup.

**Step 2: Run test to verify it fails**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::prepare_local_image_asset_from_path_inner_processes_generic_image_asset
```

Expected: FAIL because `prepare_local_image_asset_from_path_inner` does not exist yet.

**Step 3: Write minimal implementation**

In `apps/pos-app/src-tauri/src/assets.rs`, rename:

```rust
async fn prepare_local_product_image_asset_inner(...)
pub async fn prepare_local_product_image_asset(...)
async fn prepare_local_product_image_asset_from_path_inner(...)
pub async fn prepare_local_product_image_asset_from_path(...)
```

to:

```rust
async fn prepare_local_image_asset_inner(...)
pub async fn prepare_local_image_asset(...)
async fn prepare_local_image_asset_from_path_inner(...)
pub async fn prepare_local_image_asset_from_path(...)
```

Update internal calls accordingly:

```rust
prepare_local_image_asset_inner(...)
prepare_local_image_asset_from_path_inner(...)
```

In `apps/pos-app/src-tauri/src/lib.rs`, update command registration:

```rust
assets::prepare_local_image_asset,
assets::prepare_local_image_asset_from_path,
```

Remove:

```rust
assets::prepare_local_product_image_asset,
assets::prepare_local_product_image_asset_from_path,
```

**Step 4: Run test to verify it passes**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests::prepare_local_image_asset_from_path_inner_processes_generic_image_asset
```

Expected: PASS.

---

### Task 3: Rename Product-Specific Preparation Log Prefix Actions

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets.rs`
- Modify: `docs/DOCUMENTED-LOG-PREFIX.md`

**Step 1: Write the failing test/search check**

Run:

```bash
rtk rg -n "prepare_local_product_image_asset|prepareLocalProductImageAsset" apps/pos-app/src apps/pos-app/src-tauri/src docs/DOCUMENTED-LOG-PREFIX.md
```

Expected before implementation: output still contains old product-specific names.

**Step 2: Rename log action names**

In `apps/pos-app/src-tauri/src/assets.rs`, update logs:

```rust
"[RUST] [PHOTO:TRACE] prepare_local_product_image_asset:start ..."
"[RUST] [PHOTO:TRACE] prepare_local_product_image_asset:done ..."
```

to:

```rust
"[RUST] [PHOTO:TRACE] prepare_local_image_asset:start ..."
"[RUST] [PHOTO:TRACE] prepare_local_image_asset:done ..."
```

Keep `kind=product_photo` as data, because that is asset classification, not pipeline ownership.

**Step 3: Update logging docs**

In `docs/DOCUMENTED-LOG-PREFIX.md`, replace old action names with:

```text
[RUST] [PHOTO:TRACE] prepare_local_image_asset:start
[RUST] [PHOTO:TRACE] prepare_local_image_asset:done
```

If old names are not documented, add these generic names under the PHOTO/ASSET pipeline section.

**Step 4: Verify no old names remain**

Run:

```bash
rtk rg -n "prepare_local_product_image_asset|prepareLocalProductImageAsset" apps/pos-app/src apps/pos-app/src-tauri/src docs/DOCUMENTED-LOG-PREFIX.md
```

Expected: no output.

---

### Task 4: Remove Product-Specific Dead Test Mocks From Product Form Tests

**Files:**
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`

**Step 1: Write the failing search check**

Run:

```bash
rtk rg -n "prepareLocalProductImageAsset|prepareLocalImageAsset" apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected before implementation: old unused mock references still exist.

**Step 2: Remove stale mocks**

In `product-form.test.tsx`, remove:

```ts
const mockPrepareLocalProductImageAssetFromPath = vi.fn();
prepareLocalProductImageAssetFromPath: (...args: unknown[]) =>
  mockPrepareLocalProductImageAssetFromPath(...args),
```

Remove assertions that only prove the old path is not called, for example:

```ts
expect(mockPrepareLocalProductImageAssetFromPath).not.toHaveBeenCalled();
```

Keep behavior assertions for:

```ts
mockPickProductPhoto
mockEnqueueAssetProcessing
mockDeleteTempProductPhoto
mockSyncNow
```

**Step 3: Run ProductForm tests**

Run:

```bash
rtk bun --filter @repo/pos-app test src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: PASS.

**Step 4: Verify stale names are gone**

Run:

```bash
rtk rg -n "prepareLocalProductImageAsset|prepareLocalImageAsset" apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: no output.

---

### Task 5: Keep Generic Target Registry As The Public Integration Surface

**Files:**
- Modify: `apps/pos-app/src/lib/asset-targets.ts`
- Modify: `apps/pos-app/src/lib/__test__/asset-targets.test.ts`
- Modify: `apps/pos-app/src/components/image-upload.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`

**Step 1: Write the failing test**

In `apps/pos-app/src/lib/__test__/asset-targets.test.ts`, add a test documenting that forms should use a target key instead of raw fields:

```ts
test("documents productImage as the product image upload integration key", () => {
  expect(createAssetProcessingTarget("productImage", "product-1")).toEqual({
    entityId: "product-1",
    entityType: "product",
    field: "image_asset_id",
  });
});
```

If this test already exists from earlier work, keep it and do not duplicate it.

**Step 2: Verify ProductForm uses the helper**

Run:

```bash
rtk rg -n "entityType: \"product\"|field: \"image_asset_id\"" apps/pos-app/src/pages/settings/product-categories/product-form.tsx
```

Expected: no output. ProductForm should use:

```ts
createAssetProcessingTarget("productImage", savedProductId)
```

**Step 3: Run target and form tests**

Run:

```bash
rtk bun --filter @repo/pos-app test src/lib/__test__/asset-targets.test.ts src/components/__test__/image-upload.test.tsx src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: PASS.

---

### Task 6: Verify Rust Attachment Registry Is The Only Target-Metadata Source

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets.rs`

**Step 1: Write or keep the registry test**

Ensure this test exists:

```rust
#[test]
fn supported_asset_attachment_target_metadata_is_centralized() {
    let target = AssetAttachmentTarget {
        entity_type: "product".to_string(),
        entity_id: "product-1".to_string(),
        field: "image_asset_id".to_string(),
    };

    let supported_target =
        supported_asset_attachment_target(&target).expect("target is supported");

    assert_eq!(supported_target.asset_kind, "product_photo");
    assert_eq!(supported_target.entity_type, "product");
    assert_eq!(supported_target.field, "image_asset_id");
}
```

**Step 2: Verify no duplicate product target matches remain**

Run:

```bash
rtk rg -n "\\(\"product\", \"image_asset_id\"\\)" apps/pos-app/src-tauri/src/assets.rs
```

Expected: no output, or only one occurrence inside the registry constant if tuple-style metadata is used. The current preferred style is a struct registry, so expected output should be empty.

**Step 3: Run Rust asset tests**

Run:

```bash
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml assets::tests
```

Expected: PASS.

---

### Task 7: Full Verification

**Files:**
- No code changes unless verification finds an issue.

**Step 1: Run frontend focused tests**

```bash
rtk bun --filter @repo/pos-app test src/lib/__test__/assets.test.ts src/lib/__test__/asset-targets.test.ts src/components/__test__/image-upload.test.tsx src/pages/settings/product-categories/__test__/product-form.test.tsx src/store/__test__/domain-catalog.test.ts
```

Expected: all tests pass.

**Step 2: Run full frontend test suite**

```bash
rtk bun --filter @repo/pos-app test
```

Expected: all tests pass.

**Step 3: Run TypeScript typecheck**

```bash
rtk bun --filter @repo/pos-app typecheck
```

Expected: exit 0.

**Step 4: Run Ultracite on touched TS files**

```bash
rtk bun x ultracite check apps/pos-app/src/lib/assets.ts apps/pos-app/src/lib/asset-targets.ts apps/pos-app/src/lib/__test__/assets.test.ts apps/pos-app/src/lib/__test__/asset-targets.test.ts apps/pos-app/src/components/image-upload.tsx apps/pos-app/src/components/__test__/image-upload.test.tsx apps/pos-app/src/pages/settings/product-categories/product-form.tsx apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx apps/pos-app/src/store/domain-catalog.ts docs/DOCUMENTED-LOG-PREFIX.md
```

Expected: no errors.

**Step 5: Run Rust formatting and tests**

```bash
rtk cargo fmt --manifest-path apps/pos-app/src-tauri/Cargo.toml --check
rtk cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

Expected: format check exits 0 and all lib tests pass.

**Step 6: Final stale-name scan**

```bash
rtk rg -n "prepareLocalProductImageAsset|prepare_local_product_image_asset" apps/pos-app/src apps/pos-app/src-tauri/src docs/DOCUMENTED-LOG-PREFIX.md
```

Expected: no output.

**Step 7: Manual Android verification**

Run app, create product, pick gallery/camera image, save, and watch logs:

```bash
PID="$(adb shell pidof -s com.sakti_dev.sakti_pos | tr -d '\r')" && adb logcat -v brief --pid="$PID" | grep --line-buffered -iE '\[(JS|RUST)\] \[(PHOTO|ASSET|SYNC):|native_picker|path_processing|enqueue_asset_processing|prepare_local_image_asset|asset_processing_job|product_image_link|resolve_cached_image'
```

Expected:
- `[JS] [PHOTO:NATIVE_PICKER_FINISHED]`
- `[JS] [ASSET:ENQUEUE_ASSET_PROCESSING_INVOKE]`
- `[RUST] [PHOTO:TRACE] enqueue_asset_processing:enqueued`
- `[RUST] [PHOTO:TRACE] asset_processing_job:done`
- product list shows the image immediately or after the pending preview/cache event.

---
