## Context

`tauri-plugin-image-pipeline` already owns compression and job recovery, but the POS app still owns the image-picker UX and temp-file staging. That split is the wrong boundary for a public plugin. The plugin should own the whole user-facing selection flow on every platform, while the host app should only render the preview, wait for completion, and persist the final asset into its own database.

The repo already has a working precedent for this shape in `tauri-plugin-dialog`: desktop uses native Rust dialogs, mobile registers a Kotlin/Swift plugin behind the same Rust API, and the JavaScript guest layer stays thin. This change should follow that pattern instead of inventing a second picker stack in app code.

The POS app also already uses local file paths plus `convertFileSrc(...)` to render cached files. That means the plugin does not need to invent its own URL layer. It should return stable local paths and let the host app convert them into asset URLs.

## Goals / Non-Goals

**Goals:**
- Move native image picking behind `tauri-plugin-image-pipeline` on desktop and Android.
- Return an immediate preview path and `jobId` from the picker result.
- Emit a public completion event when background compression finishes.
- Keep `jobId` as the only required correlation key.
- Preserve completed-job recovery so the host app can recover after restart.
- Make the host app wait for the completion event before persisting the final asset.
- Make the implementation easy to test with a red-green-refactor flow.

**Non-Goals:**
- Add cropping, rotation UI, or batch selection.
- Change the compression math or output formats beyond what the plugin already owns.
- Introduce an application-specific concept like `merchantId` into the public plugin API.
- Replace the existing asset cache or sync model beyond the event-driven handoff described here.

## Decisions

### 1. One public command, not a split picker/compress API

The public plugin surface should expose a single command:

```ts
pickImage(options) -> {
  jobId: string
  previewPath: string
  previewMimeType: string
  status: "pending" | "processing"
}
```

The command opens the native picker, stages a preview in the plugin cache, and starts background compression. The host app should not call a separate enqueue step after selection.

Why:
- The UX is simpler: one user action, one immediate preview, one later completion event.
- The app no longer has to orchestrate picker state and processing state separately.
- The public API stays small enough that a second LLM can implement it without inventing extra branches.

Alternative considered:
- `pickImage()` followed by `enqueueCompression()`. Rejected because it reintroduces the split that currently leaks into `apps/pos-app`.

### 2. Return local paths, not asset-protocol URLs

The plugin should return local file paths for `previewPath` and `assetPath`. The host app should convert them with `convertFileSrc(...)` or equivalent Tauri helpers.

Example host-side usage:

```ts
const result = await invoke<PickImageResponse>("plugin:image-pipeline|pick_image", {
  request: {
    pickerMode: "image",
    compression: { maxLongEdge: 400, previewMaxLongEdge: 320, quality: 75 },
  },
});

const previewUrl = convertFileSrc(result.previewPath);
```

Why:
- Tauri already standardizes URL conversion in the host app.
- Keeping the plugin path-based makes recovery and cleanup easier.
- The plugin remains reusable outside Sakti POS.

Alternative considered:
- Returning `asset://...` URLs directly from the plugin. Rejected because it couples the plugin to host-side protocol assumptions and makes testing harder.

### 3. Use `jobId` as the only required correlation key

The plugin should emit `image_pipeline://job_completed` and `image_pipeline://job_failed`, both keyed by `jobId`.

Example event payload shape:

```ts
type JobCompletedEvent = {
  jobId: string;
  assetPath: string;
  contentHash: string;
  contentType: string;
  byteSize: number;
  width: number;
  height: number;
  originalFilename: string;
};
```

Why:
- The plugin creates the job, so the job identifier is already the right correlation handle.
- A second opaque ID adds state without solving a real problem in `pos-app`.
- The host app can store `jobId` while the image is pending and match the event later.

Alternative considered:
- Adding `requestId`. Rejected because it duplicates `jobId` for the current app and complicates the public contract.

### 4. Keep recovery queryable after completion

The plugin should retain completed and failed jobs until the host app consumes or retries them. That means `get_completed_jobs`, `consume_completed_job`, `get_failed_jobs`, and `retry_failed_job` remain part of the public contract.

Why:
- Events can be missed if the app restarts or listeners are not attached yet.
- Recovery APIs let the app replay its state machine without guessing.
- This makes the event contract notification-only, not a source-of-truth replacement.

Alternative considered:
- Fire-and-forget events with no query path. Rejected because it is fragile across restarts.

### 5. Desktop and Android must stay behind the same Rust entrypoint

Desktop should follow the `tauri-plugin-dialog` pattern: thin Rust plugin API, native desktop dialog underneath. Android should keep the platform picker and compression code inside the plugin-owned Kotlin module, registered through the Rust plugin bridge.

Why:
- The repo already has a proven mobile plugin pattern.
- The host app should not become a platform dispatcher.
- The plugin boundary stays the only place where picking and compression differ by OS.

### 6. TDD-first implementation order

The implementation agent should write failing tests first in every layer:

1. Rust tests for `pick_image`, job recovery, and event payloads.
2. JavaScript tests for preview rendering, `jobId` tracking, and completion-event handling.
3. Kotlin unit tests for native picker behavior and background compression.
4. Host-app integration checks for the real Android runtime path.

Minimal test examples:

```rust
#[tokio::test]
async fn pick_image_returns_preview_path_and_job_id() {
    // arrange
    // act
    // assert
}
```

```ts
test("pickImage shows preview immediately and stores jobId", async () => {
  // arrange
  // act
  // assert
});
```

```kotlin
@Test
fun compressImage_returnsWebpAndRunsOffMainThread() = runTest {
    // arrange
    // act
    // assert
}
```

The key TDD rule for this change: do not implement any picker or completion logic until the corresponding test fails for the right reason.

## Risks / Trade-offs

- [Events can be missed if the app restarts] → Keep completed jobs queryable and consume them only after persistence.
- [The app could enable save too early] → Gate product persistence on the `job_completed` event or a ready flag derived from it.
- [Android picker behavior differs from desktop] → Keep the public contract path-based and status-based, not UI-framework-specific.
- [Preview files could outlive their usefulness] → Let the plugin own preview cleanup and avoid app-side temp-file deletion.
- [A dumb implementation agent could reintroduce app-owned picker logic] → Keep the spec explicit: `pick_image` is plugin-owned, `enqueueFor` is gone, and app code only listens and persists.

## Migration Plan

1. Add failing tests for the new plugin command, events, and job recovery APIs.
2. Update the guest JS wrappers and app-side image upload state to use the new plugin command.
3. Replace app-owned picker helpers with plugin-driven selection and preview handling.
4. Update the product form so it waits for `job_completed` before persisting the final asset-linked product state.
5. Keep the old app picker helpers only long enough to prove the new path; then remove them.
6. Verify the flow on desktop and Android using the repo's existing host-app/dev boot path.

## Open Questions

- No blocking open questions remain. The implementation can choose whether `createImageUpload` owns a per-instance event listener or shares a singleton listener, as long as listener cleanup is deterministic and the `jobId` match is explicit.

