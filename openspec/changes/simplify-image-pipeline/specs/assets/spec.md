## MODIFIED Requirements

### Requirement: R7 — Image URL Resolution (Frontend)

The system SHALL provide a single `resolveAssetUrl(assetId)` function that invokes the plugin's `get_asset_path(assetId)` command, converts the returned local path via `convertFileSrc()`, and returns the URL or `null`.

**WHEN** `resolveAssetUrl(assetId)` is called
**THEN** the system SHALL invoke `get_asset_path({ assetId })` on the plugin, and if a path is returned, convert it via `convertFileSrc()` and return the URL.

**WHEN** the plugin returns `null`
**THEN** `resolveAssetUrl` SHALL return `null`.

**WHEN** the assetId is `null` or `undefined`
**THEN** `resolveAssetUrl` SHALL return `null` immediately without invoking the plugin.

#### Scenario: Asset is compressed — returns compressed URL
- **WHEN** `resolveAssetUrl` is called for a compressed asset
- **THEN** the plugin returns the compressed file path, which is converted to a URL

#### Scenario: Asset is pending — returns preview URL
- **WHEN** `resolveAssetUrl` is called for a pending asset
- **THEN** the plugin returns the preview file path (fallback), which is converted to a URL

#### Scenario: Asset has no files — returns null
- **WHEN** `resolveAssetUrl` is called for an asset with no files
- **THEN** the plugin returns null, and `resolveAssetUrl` returns null

### Requirement: R9 — Asset Adapter (SolidJS)

~~The system SHALL provide a `createAssetAdapter(config)` factory that creates a reactive adapter for a specific entity type and field.~~

**REMOVED**: The reactive cache layer (version counters, adapter factory, event listeners) is no longer needed. Components render `<img>` using `resolveAssetUrl(assetId)` directly. Navigation-based re-render handles staleness.

**Reason**: With `convertFileSrc` and stable `imageAssetId`, the browser keeps images in memory. No reactive cache busting needed.

**Migration**: Components that used `useImageUrl` from the adapter SHALL call `resolveAssetUrl(assetId)` directly.

## REMOVED Requirements

### Requirement: R17 — Asset Events

**REMOVED**: `asset-cache-ready` and `asset-attachment-ready` events are no longer emitted or consumed. The reactive version counters that responded to these events are deleted.

**Reason**: These events existed to bump version counters for reactive re-render in the base64 era. With `convertFileSrc`, the URL is deterministic and navigation handles re-render.

**Migration**: No consumer needs these events. All Solid stores (`assetVersions`, `domainVersions`, `pendingPreviewVersions`), the `notifyAssetCacheReady` function, the `createAssetAdapter` factory, and the `adapters/` directory are deleted.

### Requirement: R5 — Pending Asset Processing Jobs

**REMOVED**: The `pending_asset_processing_jobs` table and related Rust functions (`enqueue_asset_processing`, `process_pending_asset_jobs`) are deleted.

**Reason**: The plugin's `compress_asset` command handles compression directly. No intermediate job table needed.

**Migration**: Assets with `status = 'pending'` are recovered at startup by invoking `compress_asset` directly.

### Requirement: R6 — Local Asset Cache

**REMOVED**: The `local_asset_cache` table and related Rust functions are deleted.

**Reason**: The plugin manages its own file cache internally. The app doesn't need a separate cache table — it queries the plugin via `get_asset_path` for file resolution.

**Migration**: `get_cached_asset_path` is replaced by the plugin's smart `get_asset_path`.

### Requirement: R13 — Upload Queue (Rust)

**REMOVED**: The Rust `upload_pending_assets` command is deleted.

**Reason**: Upload logic moves to JS (`upload.ts`). Uses `fetch()` instead of `reqwest`.

**Migration**: `sync.ts` calls the JS `uploadPendingAssets` function instead of invoking a Rust command.

### Requirement: R14 — Asset Hydration (Rust)

**REMOVED**: The Rust `hydrate_missing_assets` command is deleted.

**Reason**: Hydration remains a stub and will be reimplemented in JS when needed (post-baresync cutover).

**Migration**: `hydrateMissingAssets` in `sync.ts` returns a stub result until reimplemented.
