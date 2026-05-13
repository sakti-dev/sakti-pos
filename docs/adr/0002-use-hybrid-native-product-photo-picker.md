---
id: 2
title: Use Hybrid Native Product Photo Picker
date: 2026-05-14
status: accepted
domains: [photo, android, tauri, assets]
---

# 2. Use Hybrid Native Product Photo Picker

## Context

Product photo picking must produce a durable app-private file path because the selected image becomes input for a persisted asset processing job.

Gallery selection is generic Android Storage Access Framework work. Camera capture is tied to the product-photo lifecycle because it must create an app-owned capture target and return a stable path for later processing.

## Decision

Use a hybrid native picker:

- Gallery selection uses `tauri-plugin-android-fs`.
- Camera capture stays in the project-specific Android plugin.
- Rust exposes one stable command, `pick_product_photo`.
- Frontend product code calls `pickProductPhoto(source)` from `apps/pos-app/src/lib/assets.ts`.

Both picker paths write under `product_photo_inputs` so persisted jobs can safely reference the selected file after form submission.

## Consequences

Frontend code does not depend directly on Android-FS or the custom camera plugin.

Startup cleanup must not delete `product_photo_inputs`, because files there may be referenced by `pending_asset_processing_jobs`.
