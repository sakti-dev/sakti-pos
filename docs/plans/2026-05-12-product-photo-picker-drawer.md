# Product Photo Picker Drawer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single photo picker with a drawer that lets the user choose camera or gallery, while keeping the local-first compressed-only image flow and preventing stale cached files from crashing image rendering.

**Architecture:** The photo UI will split acquisition from processing. The drawer only chooses the source, while a single shared processing path still sends the selected image bytes to Rust for WebP compression, local cache write, and pending asset creation. Cached product images must be treated defensively: if the local file is missing, the UI should fall back to a placeholder and log a clear cache-miss instead of surfacing a generic file error.

**Tech Stack:** SolidJS, Tauri commands, Rust image processing, existing `@corvu/drawer` UI, Drizzle local DB, Vitest, Bun, Ultracite.

---

### Task 1: Add failing tests for the photo source drawer flow

**Files:**
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`
- Modify: `apps/pos-app/src/components/product-image.tsx` if the test needs image placeholder behavior to be covered indirectly

**Step 1: Write the failing test**

Add tests that prove the current single-button flow is incomplete:
- clicking `Pilih Foto` should open a drawer
- the drawer should expose `Ambil Foto` and `Pilih dari Galeri`
- selecting either action should not submit the form
- the drawer should dismiss after a choice is made

Add a second test that covers the stale-cache case:
- when the cached image file is missing, the product image should render the placeholder instead of attempting to use a broken file URL

**Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/pages/settings/product-categories/__test__/product-form.test.tsx src/lib/product-images/__test__/cache.test.ts
```

Expected:
- the new drawer assertions fail because the drawer does not exist yet
- the missing-file test fails because cached images are returned without checking file existence

**Step 3: Write minimal implementation**

Do not implement yet. This task is only for the tests.

**Step 4: Run the test to verify it still fails for the right reason**

Run the same command and confirm the failures are about missing behavior, not syntax or setup.

---

### Task 2: Add a reusable bottom drawer for photo source selection

**Files:**
- Create: `apps/pos-app/src/components/photo-source-drawer.tsx`
- Modify: `apps/pos-app/src/components/ui/drawer.tsx` only if the existing drawer API needs a small prop passthrough
- Test: `apps/pos-app/src/components/__test__/photo-source-drawer.test.tsx`

**Step 1: Write the failing test**

Create a focused component test that proves:
- the drawer renders a title like `Pilih Foto`
- it shows only two actions: `Ambil Foto` and `Pilih dari Galeri`
- it does not render a `Batal` button
- clicking either action calls the expected callback and closes the drawer

Use the existing drawer test style in the repo as the reference pattern.

**Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/components/__test__/photo-source-drawer.test.tsx
```

Expected:
- fail because the component does not exist yet

**Step 3: Write minimal implementation**

Implement a small presentational component that:
- uses the existing `Drawer` primitives
- accepts `open`, `onOpenChange`, `onPickCamera`, and `onPickGallery`
- renders only the two source actions
- leaves closing to tap-outside / back / swipe-down and action handling

**Step 4: Run the test to verify it passes**

Run the same command.

Expected:
- component test passes
- no lint or type errors from the new component

---

### Task 3: Wire the product form to the drawer and split camera vs gallery input

**Files:**
- Modify: `apps/pos-app/src/pages/settings/product-categories/product-form.tsx`
- Modify: `apps/pos-app/src/pages/settings/product-categories/__test__/product-form.test.tsx`
- Modify: `apps/pos-app/src/lib/assets.ts` only if a small helper is needed for source-specific input handling

**Step 1: Write the failing test**

Add form tests that prove:
- the main button still says `Pilih Foto`
- tapping it opens the new drawer
- choosing `Ambil Foto` triggers the camera flow
- choosing `Pilih dari Galeri` triggers the gallery flow
- both flows still end up in the same Rust image processing path
- the original image is not saved anywhere in app storage

For the camera path, the first implementation can use a hidden file input with `accept="image/*"` and `capture="environment"` so Android/Waydroid opens the camera intent when supported.

**Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/pages/settings/product-categories/__test__/product-form.test.tsx
```

Expected:
- drawer source selection assertions fail until the wiring is implemented

**Step 3: Write minimal implementation**

Update the form so that:
- `Pilih Foto` opens the drawer instead of the file input directly
- `Ambil Foto` clicks a hidden camera input
- `Pilih dari Galeri` clicks a hidden gallery input
- both inputs feed the same `handleFileChange` pipeline
- the selected file is processed in memory only
- the post-process flow still creates a pending local asset through Rust

Keep the original compressed-only rule intact:
- do not persist the original file
- clear the input value after each selection
- keep the preview logic on the compressed WebP result only

**Step 4: Run the test to verify it passes**

Run the same `bun test` command.

**Step 5: Sanity-check the app behavior**

Confirm the form still:
- saves a product without blocking on upload
- shows the queued upload toast when a photo exists
- preserves the existing local-first sync path

---

### Task 4: Guard cached product image resolution against missing files

**Files:**
- Modify: `apps/pos-app/src/lib/product-images/cache.ts`
- Modify: `apps/pos-app/src/lib/product-images/__test__/cache.test.ts`
- Modify: `apps/pos-app/src/components/product-image.tsx` if needed to keep fallback behavior clean

**Step 1: Write the failing test**

Add a test that simulates a cache row pointing to a file that no longer exists.

Expected behavior:
- `resolveCachedProductImageUrl()` returns `null`
- the UI falls back to the placeholder instead of producing a broken file URL
- a clear cache-miss log is emitted for debugging

**Step 2: Run the test to verify it fails**

Run:

```bash
cd apps/pos-app && bun test src/lib/product-images/__test__/cache.test.ts
```

Expected:
- fail because the code currently trusts `localPath` without checking the file exists

**Step 3: Write minimal implementation**

Update the resolver so it:
- checks `fs`/Tauri file existence before returning a URL
- logs a clear cache-miss event when the path is missing
- returns `null` on missing files

Keep it small:
- do not introduce a new cache manager yet
- do not download in the resolver
- only make render-time behavior safe

**Step 4: Run the test to verify it passes**

Run the same `bun test` command.

**Step 5: Verify the UI fallback**

Confirm product cards and product lists still render the placeholder when the cache is absent.

---

### Task 5: Verify the end-to-end flow on Waydroid

**Files:**
- No code changes expected unless a test reveals a real bug

**Step 1: Run the focused tests**

Run:

```bash
cd apps/pos-app && bun run typecheck
cd apps/pos-app && bun x ultracite check
cd apps/pos-app/src-tauri && cargo test --lib assets -- --nocapture
```

Expected:
- typecheck passes
- Ultracite passes
- Rust asset tests pass in the distrobox dev shell

**Step 2: Smoke test on device**

In Waydroid:
- tap `Pilih Foto`
- confirm the drawer opens
- choose `Ambil Foto`
- take a photo
- confirm the preview uses the compressed WebP
- choose `Pilih dari Galeri`
- choose an image from the gallery
- confirm it follows the same compressed-only local flow

**Step 3: Check logs**

Use the existing sync log pattern:

```bash
adb logcat -c && adb logcat -v brief "Tauri/Console:V" "RustStdoutStderr:V" "*:S" | grep -iE "\\[SYNC-DEBUG\\]|asset|upload|cache|photo|camera|gallery|webp|error|failed|panic"
```

Expected:
- no silent file-not-found crash
- no unexpected browser-side upload path
- any cache miss should show a readable app log

---

### Task 6: Final regression pass

**Files:**
- Modify only if a bug is found in smoke testing

**Step 1: Run the full relevant test set**

Run:

```bash
cd apps/pos-app && bun test src/components/__test__/photo-source-drawer.test.tsx src/pages/settings/product-categories/__test__/product-form.test.tsx src/lib/product-images/__test__/cache.test.ts src/lib/__test__/assets.test.ts
cd apps/pos-app && bun run typecheck
cd apps/pos-app && bun x ultracite check
```

**Step 2: Run Rust verification**

Run:

```bash
cd apps/pos-app/src-tauri && cargo test --lib assets -- --nocapture
```

**Step 3: Confirm the behavioral checklist**

Verify:
- the drawer is the entry point for photo selection
- camera and gallery are explicit choices
- the original image is not persisted by the app
- compressed WebP remains the only stored asset
- missing cached files fall back safely
- sync still works normally

