## Context

`apps/pos-app/src/lib/api/sync.ts` (created earlier this session by merging `store/sync.ts` into `lib/api/sync.ts`) currently carries three placeholder stubs marking where the real asset pipeline plugs in:

```ts
// --- Asset pipeline (TODO: port lib/assets/* in a separate change) ---
function uploadPendingAssets(_merchantId, _sessionToken): Promise<number> { return Promise.resolve(0); }
function hydrateMissingAssets(): Promise<number> { return Promise.resolve(0); }
function recoverAssets(): Promise<void> { return Promise.resolve(); }
```

The real implementations already exist, tested on-device, in `apps/pos-app/src-old/lib/assets/`:

- `upload.ts` (162 LOC) — `uploadSingleAsset` and `uploadPendingAssets`. Requests a presigned PUT URL from `/api/assets/presign-upload`, resolves the local compressed file via the `plugin:image-pipeline|get_asset_path` Tauri command, PUTs the bytes to R2, then transitions the `assets` row to `status = 'ready'` via a baresync `writeTransaction` + `enqueueChange`. Depends only on `~/db/index`, `~/lib/api/eden`, `~/lib/logger`, `~/lib/sync` — all already relocated to final paths this session except `lib/sync` → `lib/api/sync` and `lib/logger` → `lib/utils`.
- `lifecycle.ts` (83 LOC) — `startAssetLifecycleListener`. Subscribes to the plugin's `image_pipeline://job_completed` Tauri event; on each event, transitions the matching `assets` row to `status = 'compressed'` and kicks off `uploadSingleAsset`. Imports `uploadSingleAsset` from `./upload`.
- `recovery.ts` (88 LOC) — `recoverAssets`. At startup: marks `status = 'pending'` rows as `failed` (staged source is already cleaned up, re-compression impossible), and retries upload for `status = 'compressed'` rows. Imports `uploadSingleAsset` from `./upload` and `currentMerchantId` from `~/store/outlet` (→ now `~/lib/auth/session`).

The plugin (`vendor/tauri-plugin-image-pipeline`) exposes four commands (`pick_image`, `compress_asset`, `get_asset_path`, `delete_asset`) and emits one event (`image_pipeline://job_completed`); its contract surface was verified in this session against `lib.rs`/`commands.rs`/`dto.rs`. The ported code invokes only `get_asset_path` (from `upload.ts`); the other three commands belong to the deferred UI trio.

## Goals / Non-Goals

**Goals:**
- Port the three backend-cluster files verbatim (import-path rewrites only) into `apps/pos-app/src/lib/assets/`.
- Wire them into `lib/api/sync.ts` (replace 2 of 3 stubs with real imports) and `SyncClientProvider` (mount the lifecycle listener).
- Land the infrastructure ahead of the product form so that form work can plug in directly.

**Non-Goals:**
- No port of the UI trio (`cache.ts`, `plugin-bridge.ts`, `image-upload.ts`). Deferred until the product form is rebuilt; their data structure is still in flux.
- No real implementation of `hydrateMissingAssets` — it stays stubbed. No cloud→local image hydration exists in src-old either (its `lib/assets/sync.ts` is also a `Promise.resolve(0)` stub).
- No changes to the `assets` schema, API endpoints, or plugin.
- No spec changes — see `correct-asset-spec-to-client-owned-architecture`.

## Decisions

### D1: One `lib/assets/` directory, three files — not a single flat file

Earlier in this session we considered a single `lib/api/assets.ts`, but assets are a vertical concept (Tauri plugin + DB + presigned upload + lifecycle events), not a horizontal API layer like `lib/api/`. A `lib/assets/` directory holding `upload.ts`/`lifecycle.ts`/`recovery.ts` matches the one-concept-per-directory grain used elsewhere in `lib/` (e.g. `lib/auth/`, `lib/api/`) and mirrors the src-old layout that the team already validated. The trio, when eventually ported, lands in the same directory.

### D2: Verbatim port with import-path rewrites only

The src-old implementations are on-device-correct; rewriting them risks regressing working code for no benefit. The only edits are the mechanical path rewrites that result from this session's relocations:
- `~/lib/logger` → `~/lib/utils` (the `createLogger` factory lives there)
- `~/lib/sync` → `~/lib/api/sync` (the sync client singleton moved)
- `~/store/outlet` → `~/lib/auth/session` (device context moved)
The `~/db/index`, `~/lib/api/eden`, and `~/lib/auth/storage` imports are already correct.

### D3: Mount the lifecycle listener in `SyncClientProvider`, not a new aggregator

src-old wires `startAssetLifecycleListener()` through a separate `lib/app/listeners.ts` aggregator. The new app has no such aggregator, and `SyncClientProvider` is already the root-level side-effect component that wires native Tauri events (the two `baresync://` listeners). Adding the `image_pipeline://job_completed` subscription there keeps all native-event wiring in one place and avoids introducing a new lifecycle mount. The listener's `onCleanup` is folded into the provider's existing `onCleanup`.

### D4: Keep `hydrateMissingAssets` as an inline stub in `sync.ts`

`hydrateMissingAssets` is orchestration glue called from `syncNow()`. Moving a one-line `Promise.resolve(0)` stub into its own `lib/assets/hydrate.ts` file would be premature ceremony. When a real R2→local download is built, it becomes a real `lib/assets/hydrate.ts` module; until then the inline stub documents the gap honestly. (This matches the design decision recorded in the corrected assets spec, where hydration is explicitly noted as still-stubbed.)

## Risks / Trade-offs

- **[Ported code ships with no consumer]** → Accepted. The product form is the first consumer; landing infrastructure ahead of demand matches the existing pattern in this codebase (`use-drizzle-query.ts`, `SyncClientProvider` both landed ahead of consumers this session). The ported files are exercised by the `syncNow`/startup path even without the form, so they are not strictly dead.
- **[Verbatim port may carry latent bugs from src-old]** → Low risk: src-old is verified on-device for upload/sync/compress. The port does not change logic, only import paths, so the regression surface is the path rewrites themselves — caught by `tsc --noEmit` and the existing vitest suite.
- **[Tauri command names are string literals, not type-checked]** → The ported code invokes `plugin:image-pipeline|get_asset_path` via `invoke<...>()`. A typo would fail at runtime, not compile time. Mitigation: the strings are copied verbatim from src-old and match the plugin's `generate_handler!` registration verified this session. No additional type-safety work is in scope.
- **[Listener mount in provider couples asset wiring to sync wiring]** → Accepted trade-off for D3. If asset wiring grows to need its own lifecycle (e.g. conditional enablement, per-merchant scoping), extract a dedicated `AssetLifecycleProvider` then; not worth it for a single event subscription today.
