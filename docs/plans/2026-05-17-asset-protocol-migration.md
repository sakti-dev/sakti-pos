# Asset Protocol Migration: Replace Base64 IPC with `convertFileSrc`

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all base64 image data transfer over the Tauri IPC bridge by serving local files through Tauri's Asset Protocol (`convertFileSrc`), reducing memory usage, eliminating UI stuttering, and removing ~200 lines of dead base64 utility code.

**Architecture:** Add new Rust commands that return file paths instead of base64-encoded bytes. The JS layer converts these paths to `asset://` URLs via Tauri's `convertFileSrc`. The `ProductImage` component and image upload primitive render these URLs directly in `<img>` tags. The WebView's native HTTP client handles binary file reading and WebP decoding — zero JS involvement. A cache-buster query param (`?v=N`) ensures invalidation when assets change.

**Tech Stack:** Tauri v2 (Android), SolidJS, TypeScript, Vitest, Rust/SQLx

**Working Directory:** All file paths are relative to `.worktrees/image-upload-primitive/` on branch `refactor/image-upload-headless-primitive`.

**Test Command:** `bun x vitest run <path>` from `apps/pos-app/`
**Typecheck Command:** `bun x tsc --noEmit` from `apps/pos-app/`
**Lint Command:** `bun x ultracite check` from `apps/pos-app/`
**Rust Test:** `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib`

---

## Background: How Tauri Asset Protocol Works

On Android, `convertFileSrc(absolutePath)` converts a filesystem path like `/data/data/com.sakti-dev.sakti-pos/config/asset-cache/merchant-1/assets/hash.webp` into a URL like `https://asset.localhost/...` that the WebView can fetch natively. The WebView's HTTP stack reads the binary file and decodes it — no JS parsing, no base64 inflation, no blob URLs.

**Requirements:**
1. The file must exist on the Android filesystem
2. The path must be under a directory the WebView is allowed to read (configured via Tauri capabilities)
3. `convertFileSrc` is imported from `@tauri-apps/api/core`

**Current state:** The app does NOT use `convertFileSrc` at all. Every image goes through base64.

---

## What Changes (High Level)

| Component | Before | After |
|-----------|--------|-------|
| **Cached image rendering** | Rust reads file → base64 encode → IPC → JS wraps as `data:` URL | Rust returns file path → IPC → JS calls `convertFileSrc(path)?v=N` |
| **Pending preview rendering** | Rust reads preview file → base64 → IPC → JS wraps as `data:` URL | Rust returns preview file path → IPC → JS calls `convertFileSrc(path)` |
| **Staged photo preview** | Rust returns `previewBase64` inline with pick result → JS wraps as `data:` URL | JS calls `convertFileSrc(picked.path)` directly (file already on disk) |
| **`processImageFile`** | Browser File → base64 → IPC → Rust decodes | **Deleted** — native picker gives us file paths, not browser Files |
| **`createWebpPreviewUrl`** | base64 → Uint8Array → Blob → `blob:` URL | **Deleted** — replaced by `convertFileSrc` |
| **`utils.ts` (base64 helpers)** | Used by cache + processing | **Deleted** — no more base64 conversion in JS |
| **`readCachedAssetData` JS** | Returns `{ contentType, dataBase64 }` | **Replaced** by `getCachedAssetPath` returning path string |
| **`readCachedAssetData` Rust** | Reads file, base64 encodes, returns | **New command** `get_cached_asset_path` returns just the path (SQL lookup, no file read) |
| **`get_pending_asset_preview` Rust** | Reads preview file, base64 encodes | **New command** returns preview path instead |
| **`pick_product_photo` Rust** | Returns `{ ..., previewBase64, previewMimeType }` | Returns `{ ..., path }` only — JS uses `convertFileSrc(path)` for preview |

---

## Target Structure (Delta)

```
lib/assets/
  types.ts              ← Remove: ProcessedImageAsset, ProcessedImageResponse, PendingAssetPreview,
                            PickedProductPhoto.previewBase64, PickedProductPhoto.previewMimeType
  picking.ts            ← Simplified: pickProductPhoto no longer returns preview fields
  processing.ts         ← Remove: processImageFile, fileToBase64, prepareLocalImageAsset (base64 version)
  cache.ts              ← Replace: readCachedAssetData → getCachedAssetPath (returns path string)
                            Remove: createWebpPreviewUrl
                            Add: resolveAssetUrl(assetId) → convertFileSrc(path)?v=N
  sync.ts               ← No change
  utils.ts              ← DELETED entirely
  image-upload.ts       ← Simplified: stagedPreviewUrl uses convertFileSrc(picked.path)
  create-adapter.ts     ← resolveCachedImageUrl uses cache.resolveAssetUrl
                            getPendingPreviewUrl uses convertFileSrc(previewPath)
  adapters/product-images.ts ← No change

src-tauri/src/assets/
  commands.rs           ← Add: get_cached_asset_path, get_pending_preview_path
                            Remove: read_cached_asset_data (keep for sync only)
  cache.rs              ← Add: get_cached_asset_path_inner (SQL only, no file read)
  processing_jobs.rs    ← Add: get_pending_preview_path_inner (SQL only, no file read)
  dto.rs                ← Add: CachedAssetPathResponse, PendingPreviewPathResponse
  mod.rs                ← No change
```

---

## Phase 1: Enable Asset Protocol in Tauri Config

### Task 1: Configure Tauri security for asset protocol

**Files:**
- Modify: `apps/pos-app/src-tauri/tauri.conf.json`
- Modify: `apps/pos-app/src-tauri/capabilities/default.json`

**Step 1: Update tauri.conf.json**

Add `dangerousDisableAssetCspModification: false` and ensure the security config allows asset loading:

```json
{
  "app": {
    "security": {
      "csp": null,
      "dangerousDisableAssetCspModification": false
    }
  }
}
```

Actually, for Tauri v2, the asset protocol is enabled by default when you use `convertFileSrc`. The key requirement is that the **scope** allows reading from the directories where we store files.

**Step 2: Update capabilities to allow filesystem reads**

The `app_config_dir` (where `asset-cache/` lives) and `app_cache_dir` (where `product_photo_inputs/` lives) need to be readable by the WebView.

In `capabilities/default.json`, add `fs` plugin scope for the asset directories:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "android-fs:default",
    "core:default",
    "log:default",
    "opener:default",
    {
      "identifier": "fs:allow-exists",
      "allow": [
        { "path": "$APPCONFIG/**" },
        { "path": "$APPCACHE/**" }
      ]
    },
    {
      "identifier": "fs:allow-read-file",
      "allow": [
        { "path": "$APPCONFIG/**" },
        { "path": "$APPCACHE/**" }
      ]
    }
  ]
}
```

**Important:** `$APPCONFIG` resolves to the Tauri app config dir (where `asset-cache/` lives). `$APPCACHE` resolves to the Tauri app cache dir (where `product_photo_inputs/` lives).

If the `fs` plugin is not installed, check if the asset protocol works without explicit scope in Tauri v2. In Tauri v2, `convertFileSrc` uses the core asset protocol which may not need the `fs` plugin — it's built into the webview. **Verify this during implementation.** If `convertFileSrc` works without any config changes, skip the capability changes and just commit the tauri.conf.json CSP update if needed.

**Step 3: Verify build compiles**

Run: `cargo check --manifest-path apps/pos-app/src-tauri/Cargo.toml`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/tauri.conf.json apps/pos-app/src-tauri/capabilities/default.json
git commit -m "chore(pos-app): enable Tauri asset protocol for local file serving"
```

---

## Phase 2: Add Rust Commands That Return Paths

### Task 2: Add `get_cached_asset_path` Rust command

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets/dto.rs`
- Modify: `apps/pos-app/src-tauri/src/assets/cache.rs`
- Modify: `apps/pos-app/src-tauri/src/assets/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write the failing Rust test**

Add to `apps/pos-app/src-tauri/src/assets/mod.rs` tests section:

```rust
#[sqlx::test(migrations = "db_migrations")]
async fn get_cached_asset_path_returns_path_for_known_asset(pool: SqlitePool) {
    let app = test_app_handle();
    let merchant_id = "test-merchant";
    let content_hash = "abc123";

    // Insert asset + cache row (use existing helpers)
    let local_path = setup_cached_asset(&app, &pool, merchant_id, content_hash).await;

    let result = cache::get_cached_asset_path_inner(
        "test-asset-1",
        &pool,
    )
    .await
    .unwrap();

    assert!(result.is_some());
    let response = result.unwrap();
    assert_eq!(response.local_path, local_path);
    assert_eq!(response.content_type, "image/webp");
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib get_cached_asset_path`
Expected: FAIL — function does not exist

**Step 3: Add the DTO**

In `dto.rs`, add:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAssetPathResponse {
    pub local_path: String,
    pub content_type: String,
}
```

**Step 4: Add the implementation**

In `cache.rs`, add:

```rust
pub(super) async fn get_cached_asset_path(
    asset_id: String,
    pool: &SqlitePool,
) -> Result<Option<CachedAssetPathResponse>, String> {
    let row = sqlx::query(
        r#"
        SELECT c.local_path, COALESCE(a.content_type, 'image/webp') AS content_type
        FROM local_asset_cache c
        LEFT JOIN assets a ON a.id = c.asset_id
        WHERE c.asset_id = ?1
        LIMIT 1
        "#,
    )
    .bind(&asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to inspect cached asset: {}", error))?;

    let Some(row) = row else {
        return Ok(None);
    };

    let local_path: String = row
        .try_get("local_path")
        .map_err(|error| format!("Failed to read cached asset path: {}", error))?;
    let content_type: String = row
        .try_get("content_type")
        .map_err(|error| format!("Failed to read cached asset content type: {}", error))?;

    // Verify file exists before returning the path
    match fs::try_exists(&local_path).await {
        Ok(true) => Ok(Some(CachedAssetPathResponse {
            local_path,
            content_type,
        })),
        Ok(false) => {
            log::info!(
                "[RUST] [PHOTO:TRACE] get_cached_asset_path:missing asset_id={} local_path={}",
                asset_id,
                local_path
            );
            Ok(None)
        }
        Err(error) => Err(format!("Failed to check cached asset file: {}", error)),
    }
}
```

This is almost identical to the existing `read_cached_asset_data` but:
- Does NOT read the file into memory
- Does NOT base64 encode anything
- Uses `try_exists` to verify the file is present
- Returns just the path and content type

**Step 5: Add the command wrapper**

In `commands.rs`, add:

```rust
#[command]
pub async fn get_cached_asset_path(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<Option<CachedAssetPathResponse>, String> {
    super::cache::get_cached_asset_path(asset_id, &state.db_pool).await
}
```

**Step 6: Register the command in `lib.rs`**

Add `assets::commands::get_cached_asset_path,` to the `invoke_handler` list.

**Step 7: Run test to verify it passes**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib get_cached_asset_path`
Expected: PASS

**Step 8: Commit**

```bash
git add apps/pos-app/src-tauri/src/assets/ apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat(pos-app): add Rust get_cached_asset_path command"
```

---

### Task 3: Add `get_pending_preview_path` Rust command

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets/dto.rs`
- Modify: `apps/pos-app/src-tauri/src/assets/processing_jobs.rs`
- Modify: `apps/pos-app/src-tauri/src/assets/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Add the DTO**

In `dto.rs`, add:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPreviewPathResponse {
    pub preview_path: String,
    pub preview_mime_type: String,
}
```

**Step 2: Add the implementation**

In `processing_jobs.rs`, add a new function `get_pending_preview_path_inner` that returns the path instead of base64:

```rust
pub(super) async fn get_pending_preview_path_inner(
    pool: &SqlitePool,
    product_id: &str,
) -> Result<Option<PendingPreviewPathResponse>, String> {
    // Check the generic table first (new system stores preview_path on disk)
    let generic_row = sqlx::query(
        r#"
        SELECT preview_path, preview_mime_type
        FROM pending_asset_processing_jobs
        WHERE entity_type = 'product'
          AND entity_id = ?1
          AND attachment_field = 'image_asset_id'
          AND status IN ('pending', 'processing')
          AND preview_path IS NOT NULL
          AND preview_mime_type IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(product_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("Failed to inspect pending asset preview: {}", error))?;

    if let Some(row) = generic_row {
        let preview_path: String = row.try_get("preview_path")
            .map_err(|error| format!("Failed to read preview_path: {}", error))?;
        let preview_mime_type: String = row.try_get("preview_mime_type")
            .map_err(|error| format!("Failed to read preview_mime_type: {}", error))?;

        match fs::try_exists(&preview_path).await {
            Ok(true) => return Ok(Some(PendingPreviewPathResponse {
                preview_path,
                preview_mime_type,
            })),
            Ok(false) => {
                log::info!(
                    "[RUST] [PHOTO:TRACE] pending_preview_path:missing product_id={} path={}",
                    product_id, preview_path
                );
                return Ok(None);
            }
            Err(error) => return Err(format!("Failed to check pending preview file: {}", error)),
        }
    }

    // Fallback: legacy table stores preview_base64 inline — for these we still
    // need to return None since we can't serve them via asset protocol.
    // The legacy path will be removed once all jobs use the new table.
    Ok(None)
}
```

**Step 3: Add the command wrapper**

In `commands.rs`, add:

```rust
#[command]
pub async fn get_pending_preview_path(
    product_id: String,
    state: State<'_, AppState>,
) -> Result<Option<PendingPreviewPathResponse>, String> {
    super::processing_jobs::get_pending_preview_path_inner(&state.db_pool, &product_id).await
}
```

**Step 4: Register in `lib.rs`**

**Step 5: Run Rust tests**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib`
Expected: All pass

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(pos-app): add Rust get_pending_preview_path command"
```

---

## Phase 3: Update JS Cache Layer

### Task 4: Add `resolveAssetUrl` to `cache.ts` (TDD)

**Files:**
- Modify: `apps/pos-app/src/lib/assets/cache.ts`
- Modify: `apps/pos-app/src/lib/assets/__test__/cache.test.ts`

This function replaces `readCachedAssetData` for rendering purposes. It calls the new Rust command and returns an `asset://` URL with a cache-buster.

**Step 1: Write the failing test**

```typescript
test("resolves a cached asset URL via asset protocol", async () => {
  mockInvoke.mockResolvedValue({
    localPath: "/data/data/com.sakti-dev.sakti-pos/config/asset-cache/merchant-1/assets/abc123.webp",
    contentType: "image/webp",
  });

  const url = await resolveAssetUrl("asset-1");

  expect(url).toContain("asset.localhost");
  expect(url).toContain("merchant-1/assets/abc123.webp");
  expect(url).toContain("?v=0");
  expect(mockInvoke).toHaveBeenCalledWith("get_cached_asset_path", {
    assetId: "asset-1",
  });
});

test("returns null when cached asset path is missing", async () => {
  mockInvoke.mockResolvedValue(null);

  const url = await resolveAssetUrl("asset-missing");
  expect(url).toBeNull();
});

test("resolves URL with current cache version as cache buster", async () => {
  notifyAssetCacheReady("asset-1");
  mockInvoke.mockResolvedValue({
    localPath: "/data/data/com.sakti-dev.sakti-pos/config/asset-cache/merchant-1/assets/abc123.webp",
    contentType: "image/webp",
  });

  const url = await resolveAssetUrl("asset-1");
  expect(url).toContain("?v=1");
});
```

**Step 2: Run test to verify it fails**

Run: `bun x vitest run src/lib/assets/__test__/cache.test.ts`
Expected: FAIL — `resolveAssetUrl` not exported

**Step 3: Implement `resolveAssetUrl`**

In `cache.ts`, add:

```typescript
import { convertFileSrc } from "@tauri-apps/api/core";

export async function resolveAssetUrl(
  assetId: string | null | undefined
): Promise<string | null> {
  if (!assetId) {
    return null;
  }

  const result = await invoke<{
    localPath: string;
    contentType: string;
  } | null>("get_cached_asset_path", { assetId });

  if (!result) {
    return null;
  }

  const baseUrl = convertFileSrc(result.localPath);
  const version = getAssetCacheVersion(assetId);
  return `${baseUrl}?v=${version}`;
}
```

**Step 4: Run test to verify it passes**

Run: `bun x vitest run src/lib/assets/__test__/cache.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/assets/cache.ts apps/pos-app/src/lib/assets/__test__/cache.test.ts
git commit -m "feat(pos-app): add resolveAssetUrl using Tauri asset protocol"
```

---

### Task 5: Add `resolvePendingPreviewUrl` to `cache.ts` (TDD)

**Files:**
- Modify: `apps/pos-app/src/lib/assets/cache.ts`
- Modify: `apps/pos-app/src/lib/assets/__test__/cache.test.ts`

**Step 1: Write the failing test**

```typescript
test("resolves pending preview URL via asset protocol", async () => {
  mockInvoke.mockResolvedValue({
    previewPath: "/data/data/com.sakti-dev.sakti-pos/cache/product_photo_inputs/pending_preview_job1.jpg",
    previewMimeType: "image/jpeg",
  });

  const url = await resolvePendingPreviewUrl("product-1");

  expect(url).toContain("asset.localhost");
  expect(url).toContain("pending_preview_job1.jpg");
  expect(mockInvoke).toHaveBeenCalledWith("get_pending_preview_path", {
    productId: "product-1",
  });
});

test("returns null when no pending preview exists", async () => {
  mockInvoke.mockResolvedValue(null);

  const url = await resolvePendingPreviewUrl("product-missing");
  expect(url).toBeNull();
});
```

**Step 2: Run test to verify it fails**

**Step 3: Implement**

In `cache.ts`, add:

```typescript
export async function resolvePendingPreviewUrl(
  entityId: string | null | undefined
): Promise<string | null> {
  if (!entityId) {
    return null;
  }

  const result = await invoke<{
    previewPath: string;
    previewMimeType: string;
  } | null>("get_pending_preview_path", { productId: entityId });

  if (!result) {
    return null;
  }

  return convertFileSrc(result.previewPath);
}
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/assets/cache.ts apps/pos-app/src/lib/assets/__test__/cache.test.ts
git commit -m "feat(pos-app): add resolvePendingPreviewUrl using asset protocol"
```

---

## Phase 4: Update Adapter to Use Asset URLs

### Task 6: Update `create-adapter.ts` to use new path-based functions

**Files:**
- Modify: `apps/pos-app/src/lib/assets/create-adapter.ts`
- Modify: `apps/pos-app/src/lib/assets/__test__/create-adapter.test.ts`

**Step 1: Write the failing tests**

The adapter's `resolveCachedImageUrl` and `getPendingPreviewUrl` should now call the new `resolveAssetUrl` and `resolvePendingPreviewUrl` functions instead of `readCachedAssetData` + base64 wrapping.

Update existing tests to verify asset protocol URLs:

```typescript
test("resolves a cached image URL via asset protocol", async () => {
  mockInvoke.mockResolvedValue({
    localPath: "/data/config/asset-cache/merchant-1/assets/abc123.webp",
    contentType: "image/webp",
  });

  const adapter = createAssetAdapter({
    entityType: "product",
    field: "image_asset_id",
    pendingPreviewParamName: "productId",
  });

  const url = await adapter.resolveCachedImageUrl("asset-1");
  expect(url).toContain("asset.localhost");
  expect(url).toContain("abc123.webp");
  expect(url).toContain("?v=0");
  expect(mockInvoke).toHaveBeenCalledWith("get_cached_asset_path", {
    assetId: "asset-1",
  });
});

test("gets pending preview URL via asset protocol", async () => {
  mockInvoke.mockResolvedValue({
    previewPath: "/data/cache/product_photo_inputs/pending_preview_job1.jpg",
    previewMimeType: "image/jpeg",
  });

  const adapter = createAssetAdapter({
    entityType: "product",
    field: "image_asset_id",
    pendingPreviewParamName: "productId",
  });

  const url = await adapter.getPendingPreviewUrl("product-1");
  expect(url).toContain("asset.localhost");
  expect(url).toContain("pending_preview_job1.jpg");
  expect(mockInvoke).toHaveBeenCalledWith("get_pending_preview_path", {
    productId: "product-1",
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update the adapter factory**

Replace `resolveCachedImageUrl` and `getPendingPreviewUrl` implementations:

```typescript
import { resolveAssetUrl, resolvePendingPreviewUrl } from "./cache";

// Inside the factory:
const resolveCachedImageUrl = async (
  assetId: string | null | undefined
): Promise<string | null> => {
  return await resolveAssetUrl(assetId);
};

const getPendingPreviewUrl = async (
  entityId: string | null | undefined
): Promise<string | null> => {
  return await resolvePendingPreviewUrl(entityId);
};
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/assets/create-adapter.ts apps/pos-app/src/lib/assets/__test__/create-adapter.test.ts
git commit -m "refactor(pos-app): adapter uses asset protocol URLs instead of base64"
```

---

## Phase 5: Update Image Upload Primitive

### Task 7: Simplify `image-upload.ts` staged preview to use `convertFileSrc`

**Files:**
- Modify: `apps/pos-app/src/lib/assets/image-upload.ts`
- Modify: `apps/pos-app/src/lib/assets/__test__/image-upload.test.ts`

**Step 1: Write the failing test**

The staged preview URL should now be an `asset://` URL instead of a `data:` URL:

```typescript
test("pickImage stages a photo and returns asset protocol preview", async () => {
  mockPickProductPhoto.mockResolvedValue({
    path: "/data/cache/product_photo_inputs/camera_1234.jpg",
    mimeType: "image/jpeg",
    originalFilename: "photo_1.jpg",
    source: "camera",
  });

  const upload = createImageUpload({
    processingKind: "image:webp-thumbnail",
  });

  await upload.pickImage("camera");

  expect(upload.previewUrl()).toContain("asset.localhost");
  expect(upload.previewUrl()).toContain("camera_1234.jpg");
  expect(upload.fileName()).toBe("photo_1.jpg");
});
```

**Step 2: Run test to verify it fails**

**Step 3: Update the primitive**

In `image-upload.ts`:

1. Remove the `previewUrlForPickedPhoto` function entirely
2. Import `convertFileSrc` from `@tauri-apps/api/core`
3. In `pickImage`, change the staged preview URL:

```typescript
import { convertFileSrc } from "@tauri-apps/api/core";

// Inside pickImage:
cleanupPending();
setPendingImage(picked);
setFileName(picked.originalFilename);
setStagedPreviewUrl(convertFileSrc(picked.path));
```

The `previewUrl` accessor already returns `stagedPreviewUrl() ?? existingImageUrl() ?? null`, so no change needed there.

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```bash
git add apps/pos-app/src/lib/assets/image-upload.ts apps/pos-app/src/lib/assets/__test__/image-upload.test.ts
git commit -m "refactor(pos-app): staged preview uses convertFileSrc instead of base64"
```

---

## Phase 6: Update Components and Consumers

### Task 8: Update `ProductImage` component

**Files:**
- Modify: `apps/pos-app/src/components/product-image.tsx`
- Modify: `apps/pos-app/src/components/__test__/product-image.test.tsx`

The component now receives `asset://` URLs from the adapter — minimal change needed. The `<img src={url}>` already works with both `data:` and `asset://` URLs.

**Step 1: Verify the component works with new URLs**

The component should work without changes since it already calls `productImageAdapter.resolveCachedImageUrl(assetId)` which now returns an `asset://` URL. However, verify in the test that the mock returns an asset-style URL:

Update the test mock to match the new adapter behavior:

```typescript
vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    resolveCachedImageUrl: (...args: unknown[]) =>
      mockResolveCachedImageUrl(...args),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
    startEventListeners: vi.fn(() => Promise.resolve()),
    stopEventListeners: vi.fn(),
  },
}));
```

The test should still pass because `resolveCachedImageUrl` is already mocked. Verify the component renders the URL correctly.

**Step 2: Run test**

Run: `bun x vitest run src/components/__test__/product-image.test.tsx`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/pos-app/src/components/
git commit -m "test(pos-app): verify ProductImage works with asset protocol URLs"
```

---

### Task 9: Update remaining test mocks for asset protocol

**Files:**
- Modify: `apps/pos-app/src/components/__test__/image-upload.test.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`
- Modify: `apps/pos-app/src/components/pos/__test__/product-grid.test.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-list.test.tsx`
- Modify: `apps/pos-app/src/pages/pos/__test__/pos.test.tsx`

All test files that mock `resolveCachedImageUrl` need to return `asset://` style URLs instead of `data:` URLs.

**Step 1: Update all test mocks**

For each test file that mocks the adapter's `resolveCachedImageUrl`, change the return value from `data:image/webp;base64,...` to `https://asset.localhost/...` style URLs.

For tests that mock `convertFileSrc`, add the mock:

```typescript
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `https://asset.localhost/${path.replace(/^\//, "")}`,
}));
```

**Step 2: Run full test suite**

Run: `bun x vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add apps/pos-app/src/
git commit -m "test(pos-app): update all test mocks for asset protocol URLs"
```

---

## Phase 7: Delete Dead Code

### Task 10: Remove `utils.ts` and dead functions

**Files:**
- Delete: `apps/pos-app/src/lib/assets/utils.ts`
- Delete: `apps/pos-app/src/lib/assets/__test__/utils.test.ts`
- Modify: `apps/pos-app/src/lib/assets/processing.ts` — remove `processImageFile`, `fileToBase64`
- Modify: `apps/pos-app/src/lib/assets/__test__/processing.test.ts` — remove `processImageFile` test
- Modify: `apps/pos-app/src/lib/assets/cache.ts` — remove `createWebpPreviewUrl`, `readCachedAssetData`, `persistCachedAsset`
- Modify: `apps/pos-app/src/lib/assets/__test__/cache.test.ts` — remove tests for deleted functions
- Modify: `apps/pos-app/src/lib/assets/types.ts` — remove `ProcessedImageAsset`, `ProcessedImageResponse`, `PresignedDownloadAsset`, `CachedAssetData`, `PendingAssetPreview`
- Modify: `apps/pos-app/src/lib/assets/picking.ts` — no change (still used for IPC calls)
- Modify: `apps/pos-app/src/lib/assets/image-upload.ts` — remove base64 preview helper

**What stays:**
- `processing.ts`: `enqueueAssetProcessing`, `processPendingAssetJobs`, `prepareLocalImageAssetFromPath` — these are still used
- `processing.ts`: `prepareLocalImageAsset` — **check if still used**. If not, remove.
- `cache.ts`: `getAssetCacheVersion`, `notifyAssetCacheReady`, `resetAssetCacheVersionsForTest`, `resolveAssetUrl`, `resolvePendingPreviewUrl`, domain catalog functions
- `picking.ts`: `pickProductPhoto`, `deleteTempProductPhoto` — still used

**What gets deleted:**
- `utils.ts` entirely (`bytesToBase64`, `base64ToUint8Array`, `toBase64FromBytes`)
- `utils.test.ts` entirely
- `processImageFile` function (browser File → base64 → Rust)
- `fileToBase64` helper
- `createWebpPreviewUrl` (base64 → Blob → URL)
- `readCachedAssetData` (replaced by `resolveAssetUrl` + `getCachedAssetPath`)
- `persistCachedAsset` — **check if still used** for sync/hydration. If Rust hydration writes directly to disk, this may be dead.
- `processImageFile` test
- Tests for deleted cache functions
- Types: `ProcessedImageAsset`, `ProcessedImageResponse`, `PresignedDownloadAsset`, `CachedAssetData`, `PendingAssetPreview`

**Before deleting, verify no remaining consumers:**

```bash
rg "processImageFile|createWebpPreviewUrl|readCachedAssetData|persistCachedAsset|base64ToUint8Array|toBase64FromBytes|bytesToBase64|CachedAssetData|ProcessedImageResponse|ProcessedImageAsset|PresignedDownloadAsset|PendingAssetPreview" apps/pos-app/src/ --type ts
```

Must return zero results (or only the definition files being deleted).

**Step 1: Remove dead code from processing.ts**

Remove `processImageFile`, `fileToBase64`, and the `bytesToBase64` import. Also remove `prepareLocalImageAsset` if unused.

**Step 2: Remove dead code from cache.ts**

Remove `createWebpPreviewUrl`, `readCachedAssetData`, `persistCachedAsset`, and the `base64ToUint8Array` import.

**Step 3: Delete utils.ts and its test**

**Step 4: Clean up types.ts**

Remove types that are no longer referenced by any file.

**Step 5: Update processing.test.ts**

Remove tests for `processImageFile`.

**Step 6: Update cache.test.ts**

Remove tests for `readCachedAssetData`, `persistCachedAsset`.

**Step 7: Run full verification**

```bash
bun x tsc --noEmit
bun x ultracite check
bun x vitest run
```

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor(pos-app): remove dead base64 code (utils, processImageFile, createWebpPreviewUrl)"
```

---

### Task 11: Clean up Rust side — remove `read_cached_asset_data` base64 command

**Files:**
- Modify: `apps/pos-app/src-tauri/src/assets/commands.rs`
- Modify: `apps/pos-app/src-tauri/src/assets/cache.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`
- Modify: `apps/pos-app/src-tauri/src/assets/dto.rs`

**Only do this if no JS consumer remains that calls `read_cached_asset_data`.**

After Task 10, verify:

```bash
rg "read_cached_asset_data" apps/pos-app/src/ --type ts
rg "readCachedAssetData" apps/pos-app/src/ --type ts
```

If zero results, remove:
1. The `read_cached_asset_data` command from `commands.rs`
2. The `read_cached_asset_data_impl` import and the function from `cache.rs` (or keep as `pub(super)` if used internally by Rust)
3. The command registration from `lib.rs`
4. The `CachedAssetDataResponse` DTO if no longer used

**Note:** `cache_asset_webp` (the `persistCachedAsset` equivalent) may still be needed if the Rust hydration pipeline uses it internally. Check before removing.

**Step 1: Remove command registration and wrapper**

**Step 2: Run Rust tests**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib`
Expected: All pass

**Step 3: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "refactor(pos-app): remove Rust read_cached_asset_data base64 command"
```

---

### Task 12: Remove `previewBase64` from `PickedProductPhoto`

**Files:**
- Modify: `apps/pos-app/src-tauri/src/android/photo_picker.rs` — stop generating/returning preview_base64
- Modify: `apps/pos-app/src/lib/assets/types.ts` — remove `previewBase64` and `previewMimeType` from `PickedProductPhoto`
- Modify: `apps/pos-app/src/lib/assets/__test__/picking.test.ts` — remove preview fields from mock returns
- Modify: `apps/pos-app/src/lib/assets/image-upload.ts` — remove any reference to `previewBase64`/`previewMimeType`

Since staged previews now use `convertFileSrc(picked.path)`, the `previewBase64` field is dead weight. The Rust side currently generates a JPEG preview and returns it as base64 — this work can be skipped entirely, saving CPU on every photo pick.

**Step 1: Update the Rust DTO**

In `photo_picker.rs`, the `PickedProductPhoto` struct has `preview_base64: Option<String>` and `preview_mime_type: Option<String>`. Remove these fields (or set them to `None` / remove the generation code).

**Important:** Don't remove the preview *generation* if it's also used by `enqueue_asset_processing` (which generates `pending_preview_*.jpg` files). Check first. The preview in `pick_product_photo` is a separate inline preview — the one for processing jobs is written to disk as a file. They're different code paths.

**Step 2: Update the JS type**

Remove `previewBase64` and `previewMimeType` from `PickedProductPhoto` in `types.ts`.

**Step 3: Update tests**

Remove preview fields from mock returns in picking tests.

**Step 4: Verify**

```bash
bun x tsc --noEmit
bun x vitest run
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(pos-app): remove previewBase64 from pick result, use convertFileSrc instead"
```

---

## Phase 8: Final Verification

### Task 13: Full verification suite

```bash
bun x tsc --noEmit
bun x ultracite check
bun x ultracite fix
bun x vitest run
cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib
```

**Final commit:**

```bash
git add -A
git commit -m "style(pos-app): fix formatting after asset protocol migration"
```

---

## Open Questions for Implementation

1. **Tauri Asset Protocol scope:** Does `convertFileSrc` in Tauri v2 on Android work without explicit capability/permission config? Need to test. If it requires `fs` plugin scope, add it in Task 1.

2. **`prepareLocalImageAsset` (base64 version):** Is this still used by any consumer? The native picker uses `prepareLocalImageAssetFromPath`. Check before removing.

3. **`persistCachedAsset` (`cache_asset_webp`):** Is this still used by the JS sync layer? Rust hydration may write directly to disk. Check before removing.

4. **Legacy pending_product_photo_jobs table:** The `get_pending_preview_path` only handles the new `pending_asset_processing_jobs` table. Legacy jobs with inline `preview_base64` will return `null`. This is acceptable — legacy jobs will age out. If needed, we can write those previews to disk during migration.

5. **Cache-busting for pending previews:** Pending preview paths include a job ID in the filename, so they're naturally unique. No cache-buster needed. But if a user picks multiple photos for the same product before sync, the path changes anyway.

6. **`content_type` in `get_cached_asset_path`:** We return it for potential future use (e.g., `<picture>` element with type attribute), but the `<img>` tag doesn't need it since the browser detects the format from the file bytes. Consider whether to keep it.

7. **Android file permissions:** On Android 10+, scoped storage may restrict WebView access to certain paths. Since Tauri's asset protocol is served by the app's own HTTP server, this should be fine — the server runs in-app and has access to its own data directories.

8. **Memory usage measurement:** After migration, measure memory reduction. Before: every product image list holds N base64 strings in memory (each ~33% larger than the binary). After: only N short URL strings. This should be dramatic for product lists with many items.
