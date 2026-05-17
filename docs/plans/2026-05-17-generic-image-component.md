# Generic Image Component + useImageUrl Hook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract the `createResource`-based image resolution logic from `ProductImage` into a reusable `useImageUrl` hook on the adapter factory, then create a generic `ImageBase` presentational component so new entity image components (e.g. `StaffImage`) require zero new logic.

**Architecture:** `createAssetAdapter` factory returns a `useImageUrl` hook (uses `createResource` internally). `components/image.tsx` has an internal `ImageBase` component that accepts an `Accessor<string | null>` for the image URL. Exported named components like `ProductImage` call the hook from their adapter and pass the result to `ImageBase`.

**Tech Stack:** SolidJS (`createResource`, `Show`, `Accessor`), Tauri asset protocol, Vitest

---

## Context for the Implementer

### Current State
- `components/product-image.tsx` has a `ProductImage` component that directly calls `productImageAdapter.resolveCachedImageUrl()` and `productImageAdapter.getPendingPreviewUrl()` inside `createResource`.
- `lib/assets/create-adapter.ts` is a factory that returns `{ resolveCachedImageUrl, getPendingPreviewUrl, startEventListeners, stopEventListeners }`. It has NO SolidJS dependency currently.
- `lib/assets/cache.ts` exports `getAssetCacheVersion`, `notifyAssetCacheReady`, `resolveAssetUrl`, `resolvePendingPreviewUrl`.

### Target State
- `create-adapter.ts` adds a `useImageUrl` method to the returned adapter object. This method takes two Accessors (`assetId`, `entityId`) and returns an `Accessor<string | null>`.
- `components/product-image.tsx` is deleted. Replaced by `components/image.tsx`.
- `components/image.tsx` has an internal `ImageBase` component (presentational only) and exports `ProductImage` (calls `productImageAdapter.useImageUrl`, passes result to `ImageBase`).
- All consumers update their import from `~/components/product-image` to `~/components/image`, and rename `productId` prop to `entityId`.

### Files Inventory
| File | Action |
|------|--------|
| `lib/assets/create-adapter.ts` | Add `useImageUrl` to returned object, add SolidJS import |
| `lib/assets/__test__/create-adapter.test.ts` | Add tests for `useImageUrl` hook |
| `components/image.tsx` | **Create** — `ImageBase` (internal) + `ProductImage` (export) |
| `components/product-image.tsx` | **Delete** |
| `components/__test__/image.test.tsx` | **Create** — tests for `ImageBase` and `ProductImage` |
| `components/__test__/product-image.test.tsx` | **Delete** |
| `components/pos/product-grid.tsx` | Update import, `productId` → `entityId` |
| `pages/settings/product-categories/product-list.tsx` | Update import, `productId` → `entityId` |
| `components/pos/__test__/product-grid.test.tsx` | Update import in mock |
| `pages/settings/product-categories/__test__/product-list.test.tsx` | Update import in mock |
| `pages/settings/product-categories/__test__/product-form.test.tsx` | Update import in mock |
| `lib/assets/types.ts` | Add `UseImageUrlHook` type if needed |

### Test Commands
```bash
# From monorepo root (.worktrees/image-upload-primitive/)
bun x vitest run apps/pos-app/src/lib/assets/__test__/create-adapter.test.ts
bun x vitest run apps/pos-app/src/components/__test__/image.test.tsx
bun x vitest run apps/pos-app/src/components/__test__/image-upload.test.tsx
bun x vitest run apps/pos-app/src/components/pos/__test__/product-grid.test.tsx
bun x vitest run apps/pos-app/src/pages/settings/product-categories/__test__/product-list.test.tsx
bun x vitest run apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx

# Full suite
bun x vitest run --project pos-app
bun x tsc -p apps/pos-app/tsconfig.json --noEmit
bun x ultracite check
```

---

### Task 1: Add `useImageUrl` to `AssetAdapter` interface and factory

**Files:**
- Modify: `apps/pos-app/src/lib/assets/create-adapter.ts`
- Test: `apps/pos-app/src/lib/assets/__test__/create-adapter.test.ts`

**Step 1: Write the failing test**

Add to `create-adapter.test.ts` — this test verifies the hook returns a reactive accessor that resolves cached URL first, then falls back to pending preview:

```ts
import { createRoot, createSignal } from "solid-js";
import { describe, expect, test, vi } from "vitest";

const mockInvoke = vi.fn();
const mockConvertFileSrc = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (...args: unknown[]) => mockConvertFileSrc(...args),
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

const leadingSlashRegex = /^\//;

const { createAssetAdapter } = await import("~/lib/assets/create-adapter");

describe("createAssetAdapter useImageUrl", () => {
  test("returns reactive accessor resolving cached then pending URL", () => {
    mockConvertFileSrc.mockImplementation(
      (path: string) =>
        `https://asset.localhost/${path.replace(leadingSlashRegex, "")}`
    );
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_cached_asset_path") {
        return Promise.resolve({
          localPath: "/data/asset-cache/assets/cached.webp",
          contentType: "image/webp",
        });
      }
      return Promise.resolve(null);
    });

    const adapter = createAssetAdapter({
      entityType: "product",
      field: "image_asset_id",
      pendingPreviewParamName: "productId",
    });

    const [assetId, setAssetId] = createSignal<string | null>("asset-1");
    const [entityId] = createSignal<string | null>("product-1");

    createRoot((dispose) => {
      const imageUrl = adapter.useImageUrl(assetId, entityId);

      expect(imageUrl()).toBeNull(); // initially loading

      setTimeout(() => {
        expect(imageUrl()).toContain("asset.localhost");
        expect(imageUrl()).toContain("cached.webp");
        dispose();
      }, 50);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun x vitest run apps/pos-app/src/lib/assets/__test__/create-adapter.test.ts`
Expected: FAIL — `adapter.useImageUrl is not a function`

**Step 3: Write minimal implementation**

In `create-adapter.ts`:

1. Add `import { createResource, type Accessor } from "solid-js";` at top
2. Add `useImageUrl` to the `AssetAdapter` interface:

```ts
export interface AssetAdapter {
  getPendingPreviewUrl: (
    entityId: string | null | undefined
  ) => Promise<string | null>;
  resolveCachedImageUrl: (
    assetId: string | null | undefined
  ) => Promise<string | null>;
  startEventListeners: () => Promise<void>;
  stopEventListeners: () => void;
  useImageUrl: (
    assetId: Accessor<string | null | undefined>,
    entityId: Accessor<string | null | undefined>
  ) => Accessor<string | null>;
}
```

3. Add the implementation inside `createAssetAdapter`, before the return:

```ts
const useImageUrl = (
  assetId: Accessor<string | null | undefined>,
  entityId: Accessor<string | null | undefined>
): Accessor<string | null> => {
  const [cached] = createResource(
    () => ({
      assetId: assetId(),
      version: getAssetCacheVersion(assetId()),
    }),
    ({ assetId: id }) => resolveCachedImageUrl(id)
  );
  const [pending] = createResource(
    () => ({
      assetId: assetId(),
      entityId: entityId(),
    }),
    ({ entityId: id }) => getPendingPreviewUrl(id)
  );
  return () => pending() ?? cached();
};
```

4. Add `useImageUrl` to the returned object.

**Step 4: Run test to verify it passes**

Run: `bun x vitest run apps/pos-app/src/lib/assets/__test__/create-adapter.test.ts`
Expected: PASS (all tests including new one)

**Step 5: Run existing tests to verify nothing broke**

Run: `bun x vitest run apps/pos-app/src/lib/assets/__test__/create-adapter.test.ts`
Expected: All 9 existing tests + new test pass

---

### Task 2: Create `ImageBase` component and `ProductImage` export in `components/image.tsx`

**Files:**
- Create: `apps/pos-app/src/components/image.tsx`
- Test: `apps/pos-app/src/components/__test__/image.test.tsx`

**Step 1: Write the failing test**

Create `components/__test__/image.test.tsx`:

```tsx
import { render, screen, waitFor } from "@solidjs/testing-library";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Accessor } from "solid-js";
import {
  notifyAssetCacheReady,
  resetAssetCacheVersionsForTest,
} from "~/lib/assets/cache";

const mockResolveCachedImageUrl = vi.fn();

vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    resolveCachedImageUrl: (...args: unknown[]) =>
      mockResolveCachedImageUrl(...args),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
    startEventListeners: vi.fn(() => Promise.resolve()),
    stopEventListeners: vi.fn(),
    useImageUrl: vi.fn(() => () => null),
  },
}));

import { ProductImage } from "../image";

describe("ProductImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAssetCacheVersionsForTest();
    mockResolveCachedImageUrl.mockResolvedValue(null);
  });

  test("renders fallback when no image URL is available", () => {
    render(() => (
      <ProductImage
        alt="Nasi goreng"
        class="size-12"
        imageAssetId={null}
        entityId={null}
      />
    ));

    expect(screen.getByText("Foto")).toBeInTheDocument();
    expect(screen.getByText("Foto").classList.toString()).toContain("size-12");
  });

  test("reruns cached image lookup when an asset cache event arrives", async () => {
    const mockUseImageUrl = vi.fn(() => {
      let resolvedUrl: string | null = null;
      mockResolveCachedImageUrl.mockImplementation(async () => {
        resolvedUrl = "https://asset.localhost/cached.webp?v=1";
        return resolvedUrl;
      });
      return () => resolvedUrl;
    });

    const { productImageAdapter } = await import(
      "~/lib/assets/adapters/product-images"
    );
    (productImageAdapter as Record<string, unknown>).useImageUrl =
      mockUseImageUrl;

    render(() => (
      <ProductImage
        alt="Nasi goreng"
        imageAssetId="asset-1"
        entityId="product-1"
      />
    ));

    await waitFor(() =>
      expect(mockResolveCachedImageUrl).toHaveBeenCalledWith("asset-1")
    );

    notifyAssetCacheReady("asset-1");

    await waitFor(() =>
      expect(mockResolveCachedImageUrl).toHaveBeenCalledTimes(2)
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun x vitest run apps/pos-app/src/components/__test__/image.test.tsx`
Expected: FAIL — module `~/components/image` not found

**Step 3: Write minimal implementation**

Create `components/image.tsx`:

```tsx
import type { Accessor } from "solid-js";
import { createResource, Show } from "solid-js";
import { productImageAdapter } from "~/lib/assets/adapters/product-images";
import { getAssetCacheVersion } from "~/lib/assets/cache";

interface ImageBaseProps {
  alt: string;
  class?: string;
  imageUrl: Accessor<string | null>;
}

function ImageBase(props: ImageBaseProps) {
  return (
    <Show
      fallback={
        <div
          class={`flex items-center justify-center rounded-lg bg-muted text-muted-foreground text-xs ${props.class ?? ""}`}
        >
          Foto
        </div>
      }
      when={props.imageUrl()}
    >
      {(src) => (
        <img
          alt={props.alt}
          class={`object-cover ${props.class ?? ""}`}
          height={64}
          src={src()}
          width={64}
        />
      )}
    </Show>
  );
}

interface ProductImageProps {
  alt: string;
  class?: string;
  entityId?: string | null;
  imageAssetId?: string | null;
}

export function ProductImage(props: ProductImageProps) {
  const imageUrl = productImageAdapter.useImageUrl(
    () => props.imageAssetId,
    () => props.entityId
  );
  return <ImageBase alt={props.alt} class={props.class} imageUrl={imageUrl} />;
}
```

**Step 4: Run test to verify it passes**

Run: `bun x vitest run apps/pos-app/src/components/__test__/image.test.tsx`
Expected: PASS

---

### Task 3: Delete `product-image.tsx` and its test, update all consumers

**Files:**
- Delete: `apps/pos-app/src/components/product-image.tsx`
- Delete: `apps/pos-app/src/components/__test__/product-image.test.tsx`
- Modify: `apps/pos-app/src/components/pos/product-grid.tsx` — import from `~/components/image`, `productId` → `entityId`
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-list.tsx` — same changes

**Step 1: Update product-grid.tsx**

Change line:
```ts
import { ProductImage } from "~/components/product-image";
```
to:
```ts
import { ProductImage } from "~/components/image";
```

Change prop `productId={product.id}` to `entityId={product.id}`.

**Step 2: Update product-list.tsx**

Change line:
```ts
import { ProductImage } from "~/components/product-image";
```
to:
```ts
import { ProductImage } from "~/components/image";
```

Change prop `productId={product.id}` to `entityId={product.id}`.

**Step 3: Delete old files**

```bash
rm apps/pos-app/src/components/product-image.tsx
rm apps/pos-app/src/components/__test__/product-image.test.tsx
```

**Step 4: Run full test suite**

Run: `bun x vitest run` (from `apps/pos-app`)
Expected: ALL PASS (one fewer test file)

---

### Task 4: Update mock imports in test files

**Files:**
- Modify: `apps/pos-app/src/components/pos/__test__/product-grid.test.tsx` — update mock for `useImageUrl` on adapter
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-list.test.tsx` — update mock for `useImageUrl` on adapter
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx` — update mock for `useImageUrl` on adapter

**Step 1: Update product-grid test mock**

In the `vi.mock("~/lib/assets/adapters/product-images", ...)` block, add `useImageUrl` to the mock object:

```ts
vi.mock("~/lib/assets/adapters/product-images", () => ({
  productImageAdapter: {
    resolveCachedImageUrl: vi.fn(() => Promise.resolve(null)),
    getPendingPreviewUrl: vi.fn(() => Promise.resolve(null)),
    startEventListeners: vi.fn(() => Promise.resolve()),
    stopEventListeners: vi.fn(),
    useImageUrl: vi.fn(() => () => null),
  },
}));
```

**Step 2: Update product-list test mock — same pattern**

**Step 3: Update product-form test mock — same pattern**

**Step 4: Run all affected tests**

Run:
```bash
bun x vitest run src/components/pos/__test__/product-grid.test.tsx
bun x vitest run src/pages/settings/product-categories/__test__/product-list.test.tsx
bun x vitest run src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected: ALL PASS

---

### Task 5: Full verification suite

**Step 1: Run typecheck**

Run: `bun x tsc -p apps/pos-app/tsconfig.json --noEmit`
Expected: Clean

**Step 2: Run lint**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Run all JS tests**

Run: `bun x vitest run` (from `apps/pos-app`)
Expected: ALL PASS

**Step 4: Run Rust tests (sanity check)**

Run: `cargo test --manifest-path apps/pos-app/src-tauri/Cargo.toml --lib -- --test-threads=1`
Expected: 50 passed

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract useImageUrl hook into adapter factory, create generic ImageBase component"
```
