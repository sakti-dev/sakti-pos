# Product Photo Assets Implementation Record

> This document started as a task-by-task plan. The work is now implemented and verified, so it has been collapsed into a completion record.

## Goal

Replace the product image URL field with a photo picker that processes images to small WebP files, uploads them to S3-compatible object storage, syncs generic asset metadata, and caches files locally on every device.

## Architecture

- Generic `assets` rows store reusable cloud file metadata for images, CSV files, XLSX imports, and future upload types.
- Product rows reference `assets.id` through `image_asset_id`.
- The Tauri/Rust layer owns image processing, local cache files, upload and download queues, and direct HTTP transfer to presigned S3-compatible URLs.
- The API owns asset registry rows, object-key validation, and presigned URL generation for R2 or Backblaze.
- Normal sync carries asset and product metadata after uploads complete. Binary file bytes stay out of sync.

## Decisions

- UI field shape: richer side-by-side preview card, no drag-and-drop.
- Button copy: `Pilih Foto`, `Ganti Foto`, `Hapus`.
- Image processing: Rust/Tauri, max long edge `800px`, WebP, visually acceptable compression.
- Cloud storage: S3-compatible object storage, expected providers R2 or Backblaze B2.
- Upload path: API returns presigned `PUT`; app uploads directly from Rust using `reqwest`.
- Download path: API returns presigned `GET`; app downloads into local cache.
- Sync path: normal row sync carries product and asset metadata, never binary file bytes.
- New device behavior: after sync, enqueue/cache ready asset IDs in the background; UI falls back to placeholder until cached.

## Delivered Scope

- Generic synced `assets` plus local-only `local_asset_cache` were added to the database layer.
- Product rows now reference `imageAssetId` instead of the old image URL field.
- Protobuf asset contracts were added and the asset API boundary now uses protobuf.
- The API exposes authenticated asset routes and S3-compatible presigned URL generation.
- Rust image processing was added to resize photos to 800px long edge and encode WebP.
- Rust upload and hydration queue commands move assets to and from object storage.
- POS helpers now save pending asset metadata, resolve cached images, and render thumbnails in product surfaces.
- Product form integration now uses the richer photo picker and upload retry UX.
- Sync now triggers upload and hydration work at the right points.
- End-to-end verification passed across the POS app, API, typechecks, lint, and Rust tests.

## Verification

Passed checks:

- `bun run test` in `apps/pos-app`
- `bun test` in `apps/api`
- `bun run typecheck` in `apps/pos-app`
- `bun run typecheck` in `apps/api`
- `bun x ultracite check` in `apps/api`
- `cargo test --lib assets -- --nocapture` in `apps/pos-app/src-tauri` inside `distrobox dev`

## Rollout Notes

- R2 presigned URLs work with the R2 S3 API endpoint, not custom public domains.
- Backblaze B2 buckets must be S3-compatible buckets.
- Keep upload URL expiry short, around 15 minutes.
- Keep download URL expiry around 1 hour.
- Treat presigned URLs as bearer tokens in logs: never log the full URL.
- Do not store object storage credentials in the Tauri app or frontend.
- Include `assets` in sync tables.
- Do not include `local_asset_cache` in sync tables.

## Future Cleanup

- Add object cleanup for unreferenced old product images after product replacement.
- Add local LRU eviction after cache grows beyond a configured size.
- Add a small admin/debug screen for failed image upload jobs if support needs it.
- Consider moving from one-by-one download to batched concurrent downloads with a low concurrency limit such as `3`.
