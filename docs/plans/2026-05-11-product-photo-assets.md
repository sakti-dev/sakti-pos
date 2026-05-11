# Product Photo Assets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the product image URL text field with a photo picker that processes images to small WebP files, uploads them to S3-compatible object storage, syncs only image metadata, and caches images locally on every device.

**Architecture:** Product rows store metadata only: `image_key`, `image_status`, and `image_updated_at`. The Tauri/Rust layer owns image processing, local cache files, upload/download queues, and direct HTTP transfer to presigned S3-compatible URLs. The API owns object-key validation and presigned URL generation for R2 or Backblaze, with normal sync carrying product metadata after uploads complete.

**Tech Stack:** SolidJS, Formisch, Valibot, Tauri v2, Rust `image`/WebP encoding crates, `reqwest`, SQLite via `sqlx` and Drizzle schemas, Elysia on Cloudflare Workers, S3-compatible presigned URLs, protobuf API requests.

---

## Decisions Locked In

- UI field shape: richer side-by-side preview card, no drag-and-drop.
- Button copy: `Pilih Foto`, `Ganti Foto`, `Hapus`.
- Image processing: Rust/Tauri, max long edge `800px`, WebP, visually acceptable compression.
- Cloud storage: S3-compatible object storage, expected providers R2 or Backblaze B2.
- Upload path: API returns presigned `PUT`; app uploads directly from Rust using `reqwest`.
- Download path: API returns presigned `GET`; app downloads into local cache.
- Sync path: normal row sync only carries product image metadata, never binary image bytes.
- New device behavior: after sync, enqueue/cache ready image keys in the background; UI falls back to placeholder until cached.

## Important Implementation Notes

- Keep the existing `imageUrl` column for backward compatibility during the migration. New UI should use `imageKey`/local cache resolution. Existing `imageUrl` can remain unused until a later cleanup.
- Use content-addressed object keys so add-product can process an image before the product has a database ID:

```text
merchants/{merchantId}/assets/{sha256}.webp
```

- Product image replacement creates a new object key. Do not delete old objects synchronously. Add cleanup later after no products reference the old key.
- `image_status = "pending_upload"` may sync to the server. Other devices must render placeholder and should only hydrate assets with `image_status = "ready"`.
- The local asset/cache table is local-only. Do not include it in `SYNC_TABLES`.

## Data Model

Add these columns to `products` in both local and API schemas:

```text
image_key TEXT
image_status TEXT NOT NULL DEFAULT 'none'
image_updated_at TEXT
```

Allowed `image_status` values:

```text
none | pending_upload | ready | failed
```

Add a local-only cache/upload table:

```text
product_image_assets
  id TEXT PRIMARY KEY
  merchant_id TEXT NOT NULL
  object_key TEXT NOT NULL UNIQUE
  local_path TEXT NOT NULL
  content_hash TEXT NOT NULL
  byte_size INTEGER NOT NULL
  width INTEGER NOT NULL
  height INTEGER NOT NULL
  mime_type TEXT NOT NULL DEFAULT 'image/webp'
  status TEXT NOT NULL
  upload_attempts INTEGER NOT NULL DEFAULT 0
  download_attempts INTEGER NOT NULL DEFAULT 0
  last_error TEXT
  cached_at TEXT
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

Allowed asset `status` values:

```text
pending_upload | uploading | ready | pending_download | downloading | failed
```

---

### Task 1: Add Product Image Metadata and Local Asset Schema

**Files:**
- Modify: `packages/database/src/local-schema.ts`
- Modify: `packages/database/src/api-schema.ts`
- Modify: `apps/pos-app/src/db/index.ts`
- Test: `apps/pos-app/src/db/__test__/sync-schema.test.ts`
- Create migration: `apps/pos-app/drizzle/<next>_product_image_assets.sql`
- Create migration: `apps/api/drizzle/<next>_product_image_metadata.sql`

**Step 1: Write the failing test**

Extend `apps/pos-app/src/db/__test__/sync-schema.test.ts`:

```ts
import { productImageAssets, products } from "@repo/database";
import { describe, expect, test } from "vitest";

describe("local smart sync schema", () => {
  test("defines product image metadata and local asset cache table", () => {
    expect(products.imageKey).toBeDefined();
    expect(products.imageStatus).toBeDefined();
    expect(products.imageUpdatedAt).toBeDefined();
    expect(productImageAssets).toBeDefined();
    expect(productImageAssets.objectKey).toBeDefined();
    expect(productImageAssets.localPath).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/db/__test__/sync-schema.test.ts
```

from `apps/pos-app`.

Expected: FAIL because `productImageAssets` and product image metadata columns do not exist.

**Step 3: Write minimal implementation**

In `packages/database/src/local-schema.ts`, add:

```ts
export const products = sqliteTable("products", {
  // existing columns...
  imageUrl: text("image_url"),
  imageKey: text("image_key"),
  imageStatus: text("image_status").notNull().default("none"),
  imageUpdatedAt: text("image_updated_at"),
  // existing columns...
});

export const productImageAssets = sqliteTable("product_image_assets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  merchantId: text("merchant_id").notNull(),
  objectKey: text("object_key").notNull().unique(),
  localPath: text("local_path").notNull(),
  contentHash: text("content_hash").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  mimeType: text("mime_type").notNull().default("image/webp"),
  status: text("status").notNull(),
  uploadAttempts: integer("upload_attempts").notNull().default(0),
  downloadAttempts: integer("download_attempts").notNull().default(0),
  lastError: text("last_error"),
  cachedAt: text("cached_at"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
```

In `packages/database/src/api-schema.ts`, add only the product metadata columns to `products`; do not add `productImageAssets`.

In `apps/pos-app/src/db/index.ts`, import and include `productImageAssets` in the Drizzle schema object.

Create SQL migrations:

```sql
ALTER TABLE `products` ADD COLUMN `image_key` text;
ALTER TABLE `products` ADD COLUMN `image_status` text NOT NULL DEFAULT 'none';
ALTER TABLE `products` ADD COLUMN `image_updated_at` text;
```

Local app migration also creates `product_image_assets`.

**Step 4: Run test to verify it passes**

Run:

```bash
bun run test -- src/db/__test__/sync-schema.test.ts
```

Expected: PASS.

**Step 5: Verify schemas**

Run:

```bash
bun run typecheck
```

from `apps/pos-app`.

Run:

```bash
bun run typecheck
```

from `apps/api`.

Expected: both pass.

**Step 6: Commit**

```bash
git add packages/database/src/local-schema.ts packages/database/src/api-schema.ts apps/pos-app/src/db/index.ts apps/pos-app/src/db/__test__/sync-schema.test.ts apps/pos-app/drizzle apps/api/drizzle
git commit -m "feat: add product image asset schema"
```

---

### Task 2: Add Protobuf Asset API Contracts

**Files:**
- Create: `packages/protobuf/proto/assets.proto`
- Modify: `packages/protobuf/package.json`
- Generated: `packages/protobuf/src/assets.ts`
- Test: `apps/api/src/assets/__test__/protobuf.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/assets/__test__/protobuf.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  AssetCompleteUploadRequest,
  AssetPresignDownloadRequest,
  AssetPresignUploadRequest,
} from "@repo/protobuf/assets";

describe("asset protobuf contracts", () => {
  test("encodes upload, complete, and download requests", () => {
    const upload = AssetPresignUploadRequest.create({
      byteSize: 1234,
      contentHash: "a".repeat(64),
      merchantId: "merchant-1",
      mimeType: "image/webp",
    });
    const decodedUpload = AssetPresignUploadRequest.decode(
      AssetPresignUploadRequest.encode(upload).finish()
    );

    expect(decodedUpload.contentHash).toBe("a".repeat(64));
    expect(decodedUpload.mimeType).toBe("image/webp");

    expect(
      AssetCompleteUploadRequest.create({
        byteSize: 1234,
        contentHash: "a".repeat(64),
        merchantId: "merchant-1",
        objectKey: "merchants/merchant-1/assets/hash.webp",
      }).objectKey
    ).toContain("merchant-1");

    expect(
      AssetPresignDownloadRequest.create({
        merchantId: "merchant-1",
        objectKeys: ["merchants/merchant-1/assets/hash.webp"],
      }).objectKeys
    ).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun test src/assets/__test__/protobuf.test.ts
```

from `apps/api`.

Expected: FAIL because `@repo/protobuf/assets` does not exist.

**Step 3: Write minimal implementation**

Create `packages/protobuf/proto/assets.proto`:

```proto
syntax = "proto3";

package sakti.assets.v1;

message AssetPresignUploadRequest {
  string merchant_id = 1;
  string content_hash = 2;
  int64 byte_size = 3;
  string mime_type = 4;
}

message AssetPresignUploadResponse {
  string object_key = 1;
  string upload_url = 2;
  int64 expires_at_epoch_seconds = 3;
  repeated AssetHeader required_headers = 4;
}

message AssetHeader {
  string name = 1;
  string value = 2;
}

message AssetCompleteUploadRequest {
  string merchant_id = 1;
  string object_key = 2;
  string content_hash = 3;
  int64 byte_size = 4;
}

message AssetCompleteUploadResponse {
  string object_key = 1;
  string status = 2;
}

message AssetPresignDownloadRequest {
  string merchant_id = 1;
  repeated string object_keys = 2;
}

message AssetDownloadUrl {
  string object_key = 1;
  string download_url = 2;
  int64 expires_at_epoch_seconds = 3;
}

message AssetPresignDownloadResponse {
  repeated AssetDownloadUrl urls = 1;
}
```

Modify `packages/protobuf/package.json`:

```json
"./assets": "./src/assets.ts"
```

Add `proto/assets.proto` to the `generate` script.

Run:

```bash
bun run generate
```

from `packages/protobuf`.

**Step 4: Run test to verify it passes**

Run:

```bash
bun test src/assets/__test__/protobuf.test.ts
```

from `apps/api`.

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/protobuf apps/api/src/assets/__test__/protobuf.test.ts
git commit -m "feat: add asset protobuf contracts"
```

---

### Task 3: Add API Object Storage Presigning Service

**Files:**
- Create: `apps/api/src/assets/storage.ts`
- Create: `apps/api/src/assets/__test__/storage.test.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/wrangler.jsonc`

**Step 1: Add dependencies**

Use the AWS SDK S3-compatible client on the API side only:

```bash
bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner --filter=@repo/api
```

**Step 2: Write the failing tests**

Create `apps/api/src/assets/__test__/storage.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
  buildAssetObjectKey,
  isValidSha256,
  validateAssetObjectKey,
} from "../storage";

describe("asset storage key validation", () => {
  test("builds content-addressed object keys under the merchant prefix", () => {
    const hash = "a".repeat(64);

    expect(buildAssetObjectKey("merchant-1", hash)).toBe(
      `merchants/merchant-1/assets/${hash}.webp`
    );
  });

  test("accepts only lowercase sha256 hashes", () => {
    expect(isValidSha256("a".repeat(64))).toBe(true);
    expect(isValidSha256("A".repeat(64))).toBe(false);
    expect(isValidSha256("a".repeat(63))).toBe(false);
    expect(isValidSha256("../bad")).toBe(false);
  });

  test("rejects object keys outside the merchant prefix", () => {
    expect(() =>
      validateAssetObjectKey("merchant-1", "merchants/other/assets/x.webp")
    ).toThrow("Invalid asset object key");
  });
});
```

**Step 3: Run test to verify it fails**

Run:

```bash
bun test src/assets/__test__/storage.test.ts
```

from `apps/api`.

Expected: FAIL because `assets/storage.ts` does not exist.

**Step 4: Write minimal implementation**

Create `apps/api/src/assets/storage.ts` with:

```ts
import { PutObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "cloudflare:workers";
import { BadRequestError } from "../lib/validation";

const SHA256_REGEX = /^[a-f0-9]{64}$/;
const UPLOAD_EXPIRES_SECONDS = 15 * 60;
const DOWNLOAD_EXPIRES_SECONDS = 60 * 60;

export function isValidSha256(value: string): boolean {
  return SHA256_REGEX.test(value);
}

export function buildAssetObjectKey(merchantId: string, contentHash: string): string {
  if (!isValidSha256(contentHash)) {
    throw new BadRequestError("contentHash must be a lowercase sha256 hex digest");
  }
  return `merchants/${merchantId}/assets/${contentHash}.webp`;
}

export function validateAssetObjectKey(merchantId: string, objectKey: string): string {
  const prefix = `merchants/${merchantId}/assets/`;
  if (!(objectKey.startsWith(prefix) && objectKey.endsWith(".webp"))) {
    throw new BadRequestError("Invalid asset object key");
  }
  const hash = objectKey.slice(prefix.length, -".webp".length);
  if (!isValidSha256(hash)) {
    throw new BadRequestError("Invalid asset object key");
  }
  return objectKey;
}
```

Then add S3 client helpers:

```ts
function getS3Client(): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    region: env.S3_REGION,
  });
}
```

Add exported functions:

- `createPresignedUploadUrl(input)`
- `createPresignedDownloadUrls(input)`
- `headAssetObject(objectKey)`

Use `PutObjectCommand` with:

```ts
ContentType: "image/webp"
```

**Step 5: Add environment placeholders**

Add to `apps/api/.env.example` and `apps/api/wrangler.jsonc` vars:

```text
S3_ENDPOINT=
S3_REGION=auto
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
```

For R2:

```text
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_FORCE_PATH_STYLE=false
```

For Backblaze:

```text
S3_ENDPOINT=https://s3.<region>.backblazeb2.com
S3_REGION=<region>
```

**Step 6: Run test to verify it passes**

Run:

```bash
bun test src/assets/__test__/storage.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/package.json bun.lock apps/api/src/assets/storage.ts apps/api/src/assets/__test__/storage.test.ts apps/api/.env.example apps/api/wrangler.jsonc
git commit -m "feat: add object storage presigning service"
```

---

### Task 4: Add Authenticated Asset API Routes

**Files:**
- Create: `apps/api/src/assets/routes.ts`
- Create: `apps/api/src/assets/__test__/routes.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/sync/service.ts`

**Step 1: Write failing route tests**

Create `apps/api/src/assets/__test__/routes.test.ts` using the existing route-test pattern from `merchants/__test__/routes.test.ts`.

Cover:

```ts
test("returns 401 when upload presign request has no session")
test("rejects non-webp uploads")
test("returns a presigned PUT URL for an accessible merchant")
test("returns presigned GET URLs for accessible object keys")
test("rejects object keys outside the merchant prefix")
```

Mock:

- `narvik.validateSession`
- database lookup for `user_merchants`
- `createPresignedUploadUrl`
- `createPresignedDownloadUrls`

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test src/assets/__test__/routes.test.ts
```

from `apps/api`.

Expected: FAIL because routes do not exist.

**Step 3: Implement merchant access helper**

In `apps/api/src/sync/service.ts`, either export a new `verifyMerchantAccess(userId, merchantId)` helper or move shared access checks to a new file `apps/api/src/lib/access.ts`.

Implementation shape:

```ts
export async function verifyMerchantAccess(
  userId: string,
  merchantId: string
): Promise<boolean> {
  const [row] = await db
    .select({ merchantId: userMerchants.merchantId })
    .from(userMerchants)
    .where(and(eq(userMerchants.userId, userId), eq(userMerchants.merchantId, merchantId)))
    .limit(1);

  return !!row;
}
```

**Step 4: Implement routes**

Create `apps/api/src/assets/routes.ts`:

```ts
export const assetsRoutes = new Elysia({ prefix: "/api/assets" })
  .use(tsProtoPlugin)
  .use(authenticated)
  .post("/presign-upload", async ({ body, session, set }) => {
    // validate merchant access, mimeType image/webp, byteSize > 0, hash format
    // return AssetPresignUploadResponse
  }, { proto: { req: AssetPresignUploadRequest, res: AssetPresignUploadResponse } })
  .post("/complete-upload", async ({ body, session, set }) => {
    // validate access and key, HEAD object, return status ready
  }, { proto: { req: AssetCompleteUploadRequest, res: AssetCompleteUploadResponse } })
  .post("/presign-download", async ({ body, session, set }) => {
    // validate access and keys, return batch GET URLs
  }, { proto: { req: AssetPresignDownloadRequest, res: AssetPresignDownloadResponse } });
```

Register in `apps/api/src/app.ts`:

```ts
import { assetsRoutes } from "./assets/routes";
// ...
.use(assetsRoutes)
```

**Step 5: Run tests to verify they pass**

Run:

```bash
bun test src/assets/__test__/routes.test.ts
```

Expected: PASS.

**Step 6: Run API test suite**

Run:

```bash
bun test
```

from `apps/api`.

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/api/src/assets apps/api/src/app.ts apps/api/src/sync/service.ts
git commit -m "feat: add asset presign API routes"
```

---

### Task 5: Add Rust Image Processing Command

**Files:**
- Modify: `apps/pos-app/src-tauri/Cargo.toml`
- Create: `apps/pos-app/src-tauri/src/product_images.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Add dependencies**

Add Rust crates:

```toml
image = { version = "0.25", default-features = false, features = ["jpeg", "png", "webp"] }
webp = "0.3"
sha2 = "0.10"
hex = "0.4"
```

If the `webp` crate API is unsuitable on the current toolchain, use the current stable WebP encoder crate and keep the command contract unchanged.

**Step 2: Write failing Rust tests**

In `apps/pos-app/src-tauri/src/product_images.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageBuffer, Rgba};

    #[test]
    fn resize_dimensions_caps_long_edge_at_800() {
        assert_eq!(resize_dimensions(1600, 1200, 800), (800, 600));
        assert_eq!(resize_dimensions(600, 1600, 800), (300, 800));
        assert_eq!(resize_dimensions(400, 300, 800), (400, 300));
    }

    #[test]
    fn object_key_uses_merchant_and_hash() {
        let hash = "a".repeat(64);
        assert_eq!(
            build_object_key("merchant-1", &hash),
            format!("merchants/merchant-1/assets/{hash}.webp")
        );
    }

    #[test]
    fn processed_image_returns_webp_metadata() {
        let img = DynamicImage::ImageRgba8(ImageBuffer::from_pixel(
            1200,
            900,
            Rgba([240, 120, 40, 255]),
        ));

        let result = encode_product_webp(img, 800).expect("image should encode");

        assert_eq!(result.width, 800);
        assert_eq!(result.height, 600);
        assert_eq!(result.mime_type, "image/webp");
        assert!(result.bytes.len() > 0);
        assert_eq!(result.content_hash.len(), 64);
    }
}
```

**Step 3: Run tests to verify they fail**

Run:

```bash
cargo test product_images
```

from `apps/pos-app/src-tauri`.

Expected: FAIL because module/functions do not exist.

**Step 4: Implement minimal processing**

Create:

```rust
#[derive(Debug, serde::Serialize)]
pub struct ProcessedProductImage {
    object_key: String,
    local_path: String,
    content_hash: String,
    byte_size: i64,
    width: u32,
    height: u32,
    mime_type: String,
}
```

Add helpers:

- `resize_dimensions(width, height, max_long_edge) -> (u32, u32)`
- `encode_product_webp(image, max_long_edge) -> EncodedImage`
- `build_object_key(merchant_id, hash) -> String`
- `write_asset_file(app_handle, merchant_id, hash, bytes) -> PathBuf`

Add Tauri command:

```rust
#[tauri::command]
pub async fn process_product_image(
    app: tauri::AppHandle,
    merchant_id: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<ProcessedProductImage, String> {
    // decode, resize, encode webp, hash, write to app_data_dir/product-assets
}
```

Register it in `apps/pos-app/src-tauri/src/lib.rs`.

**Step 5: Run tests to verify they pass**

Run:

```bash
cargo test product_images
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/Cargo.toml apps/pos-app/src-tauri/Cargo.lock apps/pos-app/src-tauri/src/product_images.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat: process product photos as webp"
```

---

### Task 6: Add Rust Asset Upload and Download Queue Commands

**Files:**
- Modify: `apps/pos-app/src-tauri/src/product_images.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Write failing Rust unit tests**

Add tests for pure helpers:

```rust
#[test]
fn pending_ready_statuses_are_valid() {
    assert!(is_valid_asset_status("pending_upload"));
    assert!(is_valid_asset_status("ready"));
    assert!(!is_valid_asset_status("unknown"));
}

#[test]
fn download_cache_path_uses_hash_filename() {
    let path = asset_relative_path("merchant-1", &"a".repeat(64));
    assert!(path.ends_with(".webp"));
    assert!(path.contains("merchant-1"));
}
```

**Step 2: Run tests to verify they fail**

Run:

```bash
cargo test product_images
```

Expected: FAIL.

**Step 3: Implement queue commands**

Add commands:

```rust
#[tauri::command]
pub async fn upload_pending_product_images(
    api_url: String,
    session_token: String,
    merchant_id: String,
    state: State<'_, AppState>,
) -> Result<AssetTransferResult, String>
```

Behavior:

- Select `product_image_assets` rows with `status = 'pending_upload'`.
- Mark one row `uploading`.
- POST protobuf `AssetPresignUploadRequest` to `/api/assets/presign-upload`.
- PUT local WebP bytes to `upload_url` with required headers.
- POST `AssetCompleteUploadRequest`.
- Mark asset `ready`.
- Update local `products` rows with matching `image_key`:

```sql
UPDATE products
SET image_status = 'ready', image_updated_at = ?, is_synced = 0, updated_at = ?
WHERE merchant_id = ? AND image_key = ?
```

- Insert one `sync_outbox` row per updated product.

Add command:

```rust
#[tauri::command]
pub async fn hydrate_product_images(
    api_url: String,
    session_token: String,
    merchant_id: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<AssetTransferResult, String>
```

Behavior:

- Find `products.image_key` where `image_status = 'ready'`.
- Exclude keys already cached in `product_image_assets` with `status = 'ready'` and existing file.
- Insert or update `product_image_assets` rows to `pending_download`.
- Batch request `AssetPresignDownloadRequest`.
- Download each file with `reqwest`.
- Validate response bytes hash matches object key hash.
- Write local file.
- Mark asset `ready`.

**Step 4: Run tests to verify they pass**

Run:

```bash
cargo test product_images
```

Expected: PASS.

**Step 5: Add integration smoke test if practical**

If adding SQL integration is fast, add an in-memory SQLite test for:

- asset row pending upload
- product referencing key
- command helper marks product `ready`
- sync outbox row is created

Run:

```bash
cargo test product_images
```

**Step 6: Commit**

```bash
git add apps/pos-app/src-tauri/src/product_images.rs apps/pos-app/src-tauri/src/lib.rs
git commit -m "feat: add product image asset transfer queue"
```

---

### Task 7: Add TypeScript Asset API Client and Local DB Helpers

**Files:**
- Create: `apps/pos-app/src/lib/api/assets.ts`
- Create: `apps/pos-app/src/lib/api/__test__/assets.test.ts`
- Create: `apps/pos-app/src/db/product-images.ts`
- Create: `apps/pos-app/src/db/__test__/product-images.test.ts`

**Step 1: Write failing API client test**

Create `apps/pos-app/src/lib/api/__test__/assets.test.ts`:

```ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../client", () => ({
  protoFetch: vi.fn(async () => ({
    objectKey: "merchants/merchant-1/assets/hash.webp",
    uploadUrl: "https://upload.example",
    requiredHeaders: [{ name: "Content-Type", value: "image/webp" }],
    expiresAtEpochSeconds: 123,
  })),
}));

import { presignProductImageUpload } from "../assets";

describe("asset API client", () => {
  test("requests a product image upload URL", async () => {
    const result = await presignProductImageUpload({
      byteSize: 1200,
      contentHash: "a".repeat(64),
      merchantId: "merchant-1",
    });

    expect(result.uploadUrl).toBe("https://upload.example");
    expect(result.requiredHeaders[0]?.name).toBe("Content-Type");
  });
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/lib/api/__test__/assets.test.ts
```

from `apps/pos-app`.

Expected: FAIL.

**Step 3: Implement API client**

Create `apps/pos-app/src/lib/api/assets.ts` with:

- `presignProductImageUpload`
- `completeProductImageUpload`
- `presignProductImageDownloads`

Use `protoFetch` and `@repo/protobuf/assets`.

**Step 4: Add DB helper failing tests**

Create `apps/pos-app/src/db/__test__/product-images.test.ts` using existing DB mock style.

Cover:

```ts
test("saves pending processed image asset")
test("marks products using image key as pending upload")
test("clears product image")
```

**Step 5: Implement DB helpers**

Create `apps/pos-app/src/db/product-images.ts`:

```ts
export async function savePendingProductImageAsset(input: {
  merchantId: string;
  objectKey: string;
  localPath: string;
  contentHash: string;
  byteSize: number;
  width: number;
  height: number;
}): Promise<void>
```

```ts
export async function setProductImagePending(productId: string, imageKey: string): Promise<void>
```

```ts
export async function clearProductImage(productId: string): Promise<void>
```

Each product mutation must set `isSynced: false`, update timestamps, and call `recordLocalChange` with table `products`.

**Step 6: Run tests**

Run:

```bash
bun run test -- src/lib/api/__test__/assets.test.ts src/db/__test__/product-images.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add apps/pos-app/src/lib/api/assets.ts apps/pos-app/src/lib/api/__test__/assets.test.ts apps/pos-app/src/db/product-images.ts apps/pos-app/src/db/__test__/product-images.test.ts
git commit -m "feat: add product image asset client helpers"
```

---

### Task 8: Add Product Photo Field Component

**Files:**
- Create: `apps/pos-app/src/components/form/product-photo-field.tsx`
- Create: `apps/pos-app/src/components/form/__test__/product-photo-field.test.tsx`

**Step 1: Write failing component tests**

Create tests for:

```ts
test("renders empty photo picker with Pilih Foto")
test("renders selected preview with Ganti Foto and Hapus")
test("shows processing state")
test("calls onPick when a webp/jpeg/png file is selected")
test("shows validation error for unsupported file type")
```

Use Testing Library and mock `URL.createObjectURL`.

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/components/form/__test__/product-photo-field.test.tsx
```

from `apps/pos-app`.

Expected: FAIL because component does not exist.

**Step 3: Implement component**

Component API:

```ts
interface ProductPhotoFieldProps {
  error?: string;
  fileName?: string;
  localPreviewUrl?: string;
  onPick: (file: File) => void;
  onRemove: () => void;
  processing?: boolean;
}
```

UI shape:

```text
Foto Produk

+------------------+  Foto terpilih / Tap untuk upload foto
| preview 1:1      |  filename / JPG/PNG, max 5 MB
|                  |  [Pilih Foto|Ganti Foto] [Hapus]
+------------------+
```

Accept:

```text
image/jpeg,image/png,image/webp
```

Use existing `Button`, existing icon library `solid-icons/tb`, and restrained settings-form styling.

**Step 4: Run test to verify it passes**

Run:

```bash
bun run test -- src/components/form/__test__/product-photo-field.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/components/form/product-photo-field.tsx apps/pos-app/src/components/form/__test__/product-photo-field.test.tsx
git commit -m "feat: add product photo field"
```

---

### Task 9: Integrate Photo Field Into Product Form

**Files:**
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`
- Modify: `apps/pos-app/src/lib/schema/product-form.ts`

**Step 1: Write failing form tests**

Extend product form tests:

```ts
test("shows product photo picker instead of image URL text input")
test("processes selected photo before save")
test("creates product with pending image metadata")
test("can remove an existing product image")
test("shows an error when image processing fails")
```

Mock:

- `@tauri-apps/api/core` `invoke`
- `savePendingProductImageAsset`
- product image DB helpers

**Step 2: Run tests to verify they fail**

Run:

```bash
bun run test -- src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: FAIL.

**Step 3: Update form schema**

Remove `imageUrl` URL validation from `ProductSchema` or keep it internal-only if needed. New form output should not ask the user for a URL.

**Step 4: Integrate processing**

When user selects file:

```ts
const bytes = new Uint8Array(await file.arrayBuffer());
const processed = await invoke<ProcessedProductImage>("process_product_image", {
  bytes: Array.from(bytes),
  fileName: file.name,
  merchantId: currentMerchantId() ?? "",
});
```

Then:

- Store returned preview path via `convertFileSrc(processed.localPath)`.
- Save pending local asset row.
- Set form-level `pendingImageKey`.

On create/update save:

- Include `imageKey: pendingImageKey()`.
- Include `imageStatus: "pending_upload"` when there is a pending image.
- Include `imageUpdatedAt: new Date().toISOString()`.
- Use `imageUrl: null`.

After successful save:

- Invoke `upload_pending_product_images`.
- Navigate after the local product save succeeds; do not block navigation on upload if the upload fails. Show toast/log if upload fails.

**Step 5: Run tests to verify they pass**

Run:

```bash
bun run test -- src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src/pages/settings/product-categories/product-form.tsx apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx apps/pos-app/src/lib/schema/product-form.ts
git commit -m "feat: upload processed product photos from form"
```

---

### Task 10: Resolve Cached Product Images in UI

**Files:**
- Create: `apps/pos-app/src/lib/product-images/cache.ts`
- Create: `apps/pos-app/src/lib/product-images/__test__/cache.test.ts`
- Modify: `apps/pos-app/src/components/pos/product-grid.tsx`
- Modify: `apps/pos-app/src/components/pos/__test__/product-grid.test.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-list.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-list.test.tsx`

**Step 1: Write failing cache tests**

Create tests for:

```ts
test("returns cached file URL when image key exists locally")
test("returns null and starts hydration when image key is missing")
test("does not hydrate pending_upload images")
```

Mock `invoke` and `convertFileSrc`.

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/lib/product-images/__test__/cache.test.ts
```

Expected: FAIL.

**Step 3: Implement cache resolver**

Create:

```ts
export async function resolveProductImageUrl(input: {
  imageKey: string | null;
  imageStatus: string;
}): Promise<string | null>
```

Behavior:

- Return `null` unless `imageKey` exists and `imageStatus === "ready"`.
- Invoke Rust `get_cached_product_image` command.
- If found, return `convertFileSrc(localPath)`.
- If missing, start `hydrate_product_images` in the background and return `null`.

Add Rust command `get_cached_product_image(image_key, state)` if needed.

**Step 4: Update UI**

Show image thumbnails in:

- POS product grid
- settings product list

Fallback remains the existing product/card placeholder.

**Step 5: Run tests**

Run:

```bash
bun run test -- src/lib/product-images/__test__/cache.test.ts src/components/pos/__test__/product-grid.test.tsx src/pages/settings/product-categories/__test__/product-list.test.tsx
```

Expected: PASS.

**Step 6: Commit**

```bash
git add apps/pos-app/src/lib/product-images apps/pos-app/src/components/pos/product-grid.tsx apps/pos-app/src/components/pos/__test__/product-grid.test.tsx apps/pos-app/src/pages/settings/product-categories/product-list.tsx apps/pos-app/src/pages/settings/product-categories/__test__/product-list.test.tsx
git commit -m "feat: render cached product photos"
```

---

### Task 11: Trigger Uploads and Hydration From Sync

**Files:**
- Modify: `apps/pos-app/src/store/sync.ts`
- Modify: `apps/pos-app/src/store/__test__/sync.test.ts`

**Step 1: Write failing sync tests**

Extend `apps/pos-app/src/store/__test__/sync.test.ts`:

```ts
test("uploads pending product images before pushing local row changes")
test("hydrates product images after pulling server changes")
test("does not fail sync when image hydration fails")
```

Mock `invoke` calls and assert order:

```text
upload_pending_product_images
get_sync_local_state
sync transfer command
hydrate_product_images
```

**Step 2: Run tests to verify they fail**

Run:

```bash
bun run test -- src/store/__test__/sync.test.ts
```

Expected: FAIL.

**Step 3: Implement sync triggers**

In `syncNow()`:

- Resolve `merchantId` from store or local state.
- Before deciding/pushing, call `upload_pending_product_images` when session and merchant exist.
- After any successful pull/full/event sync, call `hydrate_product_images`.
- Catch hydration errors, log them, and keep sync status `idle` if row sync succeeded.

Do not let a failed image download turn the whole sync into `offline`.

**Step 4: Run tests to verify they pass**

Run:

```bash
bun run test -- src/store/__test__/sync.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/store/sync.ts apps/pos-app/src/store/__test__/sync.test.ts
git commit -m "feat: hydrate product image cache during sync"
```

---

### Task 12: Ensure Product Sync Carries Image Metadata

**Files:**
- Modify: `apps/api/src/sync/__test__/service.test.ts`
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Write failing tests**

In API sync service tests, add:

```ts
test("push preserves product image metadata")
test("pull returns product image metadata")
```

For local Rust sync tests, add:

```rust
#[test]
fn debug_row_summary_includes_image_status() {
    let row = serde_json::json!({
        "id": "product-1",
        "imageKey": "merchants/m/assets/hash.webp",
        "imageStatus": "ready",
        "imageUpdatedAt": "2026-05-11T00:00:00.000Z"
    });

    let summary = debug_row_summary(&row);
    assert!(summary.contains("imageStatus"));
}
```

**Step 2: Run tests to verify they fail if metadata is dropped**

Run:

```bash
bun test src/sync/__test__/service.test.ts
```

from `apps/api`.

Run:

```bash
cargo test sync
```

from `apps/pos-app/src-tauri`.

Expected: Any missing mapping fails.

**Step 3: Implement minimal fixes**

The generic sync path should already carry new `products` columns because it serializes `SELECT *` and upserts all row keys. Only update explicit debug summaries and any tests/mocks that use product row shapes.

**Step 4: Run tests**

Run:

```bash
bun test src/sync/__test__/service.test.ts
cargo test sync
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/api/src/sync/__test__/service.test.ts apps/pos-app/src-tauri/src/sync.rs
git commit -m "test: cover product image metadata sync"
```

---

### Task 13: Add Upload Failure UX and Retry Behavior

**Files:**
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`
- Modify: `apps/pos-app/src/components/sync-status.tsx`
- Modify: `apps/pos-app/src/components/__test__/layout.test.tsx` if status is surfaced in layout

**Step 1: Write failing tests**

Cover:

```ts
test("product save succeeds when image upload fails after local save")
test("shows image pending copy when upload is queued")
test("retry upload runs on next sync")
```

**Step 2: Run test to verify it fails**

Run:

```bash
bun run test -- src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: FAIL.

**Step 3: Implement UX**

Rules:

- If processing fails before save, block save and show field error.
- If local save succeeds but upload fails, navigate normally and show toast: `Foto akan diupload saat online`.
- Product list/POS should show local cached photo on the creating device even while `pending_upload`.
- Other devices only hydrate when `image_status = "ready"`.

**Step 4: Run tests**

Run:

```bash
bun run test -- src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/pos-app/src/pages/settings/product-categories/product-form.tsx apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx apps/pos-app/src/components/sync-status.tsx
git commit -m "feat: handle product photo upload retries"
```

---

### Task 14: End-to-End Verification

**Files:**
- No new files unless failures require focused fixes.

**Step 1: Run format/lint**

Run:

```bash
bun x ultracite check
```

Expected: no issues.

If there are auto-fixable issues:

```bash
bun x ultracite fix
```

Then rerun check.

**Step 2: Run app tests**

Run:

```bash
bun run test
```

from `apps/pos-app`.

Expected: PASS.

**Step 3: Run API tests**

Run:

```bash
bun test
```

from `apps/api`.

Expected: PASS.

**Step 4: Run typechecks**

Run:

```bash
bun run typecheck
```

from:

- `apps/pos-app`
- `apps/api`
- `packages/protobuf`
- `packages/database`

Expected: PASS.

**Step 5: Run Rust tests**

Run:

```bash
cargo test
```

from `apps/pos-app/src-tauri`.

Expected: PASS.

**Step 6: Manual scenario test**

Run the app and API locally:

```bash
bun run api:dev
bun run app:dev
```

Manual checks:

- Add product with JPEG photo larger than 800px.
- Confirm preview appears.
- Save product offline or with upload disabled; product saves and local preview remains.
- Re-enable API/object storage; sync uploads image and product becomes `ready`.
- Login/pair another device or clear local cache; sync downloads product row, hydrates image cache, and renders thumbnail.
- Replace image; old image remains until cleanup, new image appears after upload.
- Remove image; product syncs with `image_status = "none"` and no thumbnail.

**Step 7: Commit verification fixes**

If verification required fixes:

```bash
git add <changed-files>
git commit -m "fix: stabilize product photo asset flow"
```

---

## Rollout Notes

- R2 presigned URLs work with the R2 S3 API endpoint, not custom public domains.
- Backblaze B2 buckets must be S3-compatible buckets.
- Keep upload URL expiry short, around 15 minutes.
- Keep download URL expiry around 1 hour.
- Treat presigned URLs as bearer tokens in logs: never log the full URL.
- Do not store object storage credentials in the Tauri app or frontend.
- Do not include `product_image_assets` in sync tables.

## Future Cleanup

- Add object cleanup for unreferenced old product images after product replacement.
- Add local LRU eviction after cache grows beyond a configured size.
- Add a small admin/debug screen for failed image upload jobs if support needs it.
- Consider moving from one-by-one download to batched concurrent downloads with a low concurrency limit such as `3`.

