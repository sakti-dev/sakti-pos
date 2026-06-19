## 1. Apply spec corrections

- [ ] 1.1 Apply the 7 MODIFIED requirements (Asset Metadata Schema, Asset Object Key, Image Picking, Image Processing, API Presign Upload, Upload Queue, Asset Events) to `openspec/specs/assets/spec.md`, replacing the existing requirement blocks.
- [ ] 1.2 Remove the 3 REMOVED requirements (Pending Asset Processing Jobs, Local Asset Cache, API Complete Upload) from `openspec/specs/assets/spec.md`.
- [ ] 1.3 Leave the 8 unchanged requirements (Image URL Resolution, Asset Attachment Targets, Asset Adapter, API Presign Download, Asset Hydration, Sync Pipeline Order, Image Upload State, Presigned URL Security) untouched.

## 2. Verify the corrected spec against source of truth

- [ ] 2.1 Confirm the status enum in the spec matches `packages/sync-contract/src/local-synced-schema.ts` (`pending` default; `compressed`/`ready`/`failed` transitions).
- [ ] 2.2 Confirm the `presign-upload` contract in the spec matches `apps/api/src/assets/routes.ts` and `apps/api/src/assets/assets.model.ts` (request fields, response shape, no DB writes).
- [ ] 2.3 Confirm the plugin command/event surface in the spec matches `vendor/tauri-plugin-image-pipeline/src/{lib.rs,commands.rs,dto.rs}` (four commands, one event, exact DTO field names).
- [ ] 2.4 Confirm no remaining reference to `complete-upload`, `pending_asset_processing_jobs`, `local_asset_cache`, `asset-cache-ready`, or `asset-attachment-ready` anywhere in `openspec/specs/assets/`.

## 3. No code changes

- [ ] 3.1 Confirm `apps/api`, `packages/sync-contract`, `vendor/tauri-plugin-image-pipeline`, and `apps/pos-app/src-old` are unmodified by this change (documentation-only).
