---
id: 2
title: Use Hybrid Native Product Photo Picker
date: 2026-05-14
status: superseded
domains: [photo, android, tauri, assets]
---

# 2. Use Hybrid Native Product Photo Picker

## Context

This ADR recorded the old app-owned product photo picker design. It has been superseded by the plugin-owned image pipeline picker flow, where `tauri-plugin-image-pipeline` owns native picking, preview staging, and completion events across platforms.

## Decision

The new architecture uses a single plugin-owned picker entrypoint:

- `pick_image`
- immediate preview staging in the plugin cache
- `image_pipeline://job_completed` and `image_pipeline://job_failed` for async completion
- the host app converts returned local paths with `convertFileSrc()`

## Consequences

Frontend code no longer owns image selection for this flow.

Historical note: the old `product_photo_inputs` staging directory and the app-side photo picker command are no longer part of the current implementation.
