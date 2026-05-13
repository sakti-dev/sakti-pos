---
id: 3
title: Use Generic Asset Processing For Product Photos
date: 2026-05-14
status: accepted
domains: [assets, photo, sync, sqlite, r2]
---

# 3. Use Generic Asset Processing For Product Photos

## Context

Saving a product should feel instant, but image compression, local cache writes, upload, domain row updates, and hydration cross SolidJS, Rust, SQLite, the API, and Cloudflare R2.

The old risk was pushing a product row before `image_asset_id` was linked, which could leave the product list without a photo until later work completed.

## Decision

Use `pending_asset_processing_jobs` as the durable queue for product photo work.

The product form saves the product row, enqueues a generic asset processing job targeting `product.image_asset_id`, and then triggers `syncNow()`. The form does not compress or upload the image directly.

`syncNow()` owns the ordered pipeline:

```text
process pending asset jobs
upload pending image assets
push dirty DB rows
pull server changes when needed
start missing local image cache hydration
```

For immediate UI feedback, `enqueue_asset_processing` writes a small JPEG pending preview and stores `preview_path` on `pending_asset_processing_jobs`. `get_pending_product_photo_preview` reads the generic job preview first and falls back to the legacy pending photo job table only for compatibility.

## Consequences

Product list and edit form can show the selected photo immediately while the final WebP asset catches up.

New attachment targets must be explicitly allowlisted. The current code links product photos only through `product.image_asset_id`; it does not use dynamic SQL for arbitrary attachment fields.
