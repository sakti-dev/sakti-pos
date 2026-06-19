## Context

The `assets` spec (`openspec/specs/assets/spec.md`) describes an architecture that was superseded by two changes the spec never absorbed:

1. **The baresync cutover** moved asset-row ownership from the API to the client. The API became a thin presign gateway (it hands out PUT/GET URLs and never writes the `assets` table); asset rows are now ordinary baresync records whose status transitions happen client-side via `writeTransaction` + `enqueueChange`, then sync like any other row.
2. **The pipeline extraction** moved pick/compress/cache out of the app and into `vendor/tauri-plugin-image-pipeline`. The plugin is a stateless-per-call compute service (state is just `app` + `cache_root`); it exposes four commands and emits one event. The app no longer owns a SQL table for pending jobs or local cache — the app's own `assets` table is the job ledger via its `status` column, and the plugin's filesystem cache is opaque.

The implementation that already runs on-device (`apps/pos-app/src-old/lib/assets/`, `apps/api/src/assets/routes.ts`, `vendor/tauri-plugin-image-pipeline`, `packages/sync-contract`) is the source of truth. This change is documentation-only: it rewrites the spec to match the implementation so that future asset work (including the upcoming frontend port) builds against an accurate contract.

## Goals / Non-Goals

**Goals:**
- Bring all 8 drifted requirements (R1, R2, R5, R6, R10, R11, R13, R17) back into agreement with the working code.
- Restate R3/R4 to describe the plugin's contract surface rather than in-app pipeline internals, so the spec does not rot a second time when the plugin's internals change.
- Keep every requirement that is still accurate (R7, R8, R9, R12, R14, R15, R16, R18) untouched.

**Non-Goals:**
- No code changes anywhere. The implementation is already correct and tested on-device.
- No changes to the plugin's command/event surface — the spec conforms to what exists, not the reverse.
- No porting of `src-old/lib/assets/` into the new app's `lib/assets/`. That is a separate change that depends on this spec being correct first.
- No re-specification of the deferred UI trio (`cache.ts`/`plugin-bridge.ts`/`image-upload.ts`); their corresponding spec requirements (R7, R9, R16) are left as-is because they remain conceptually accurate even though the files live only in `src-old` for now.

## Decisions

### D1: Describe the plugin by contract, not by internals

The spec's R3/R4 currently re-describe pipeline internals (EXIF orientation, FilterType::Triangle, WebP method 6, preview dimensions). This is the rot mechanism: every internal change forces a spec edit, and when the extraction happened nobody updated it. The corrected R3/R4 describe only what the app observes — the four commands' input/output shapes, the single event's payload, and the file-system contract — and reference `vendor/tauri-plugin-image-pipeline` as the implementation boundary.

**Alternative considered**: maintain a separate spec inside the plugin package. Rejected for this change — it expands scope and the plugin has no OpenSpec presence today. The pos-app spec pointing at the plugin as an external boundary is sufficient and rot-resistant.

### D2: Pending jobs and local cache are removed, not "moved"

R5 (`pending_asset_processing_jobs`) and R6 (`local_asset_cache`) are not relocated into the plugin. They are removed as application-visible concepts:
- Job tracking is the `assets` table's `status` column. The app inserts a row at `pending`, the `job_completed` event transitions it to `compressed`, the upload transitions it to `ready`. There is no separate jobs table.
- The plugin's filesystem cache is opaque to the app and is queried only through `get_asset_path`. The app holds no schema for it.

**Alternative considered**: re-describe the plugin's filesystem cache layout in R6. Rejected — it would re-introduce the same rot mechanism D1 avoids.

### D3: Status transitions belong client-side, in the spec

R10 is corrected to reflect that `presign-upload` is a pure presign service (it never touches the `assets` table). R11 (`complete-upload`) is removed because the endpoint never existed in this architecture and the client never calls it. R13 is restated as client-side: the TS `uploadSingleAsset` function owns the PUT-to-R2 + mark-ready flow. These three corrections express one decision — the API does not own asset-row lifecycle.

### D4: Single event, not three

R17 is corrected to the single event the plugin actually emits (`image_pipeline://job_completed`). The phantom `asset-cache-ready` and `asset-attachment-ready` events are removed. The app reacts to `job_completed` by updating the `assets` row; UI re-render is driven by the existing sync data-change invalidation path, not by dedicated asset events.

## Risks / Trade-offs

- **[Spec readers expect a `complete-upload` step]** → The REMOVED R11 entry carries an explicit Migration note pointing to the client-side `uploadSingleAsset` flow, so the reader is not left wondering where the "mark ready" step went.
- **[Future plugin command additions won't auto-flow into the spec]** → Accepted as the price of D1/D2. The plugin is referenced as a boundary; if its command surface changes, that is a separate spec change rather than a silent drift. This is strictly better than the current silent drift.
- **[The UI-layer requirements R7/R9/R16 reference code that currently only exists in `src-old/`]** → Left as-is deliberately. They are conceptually accurate and will be re-validated when the UI trio is ported. Flagging here so the reader does not mistake them for currently-wired code.
