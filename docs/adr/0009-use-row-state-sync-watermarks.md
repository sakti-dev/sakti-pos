---
id: 9
title: Use Row State Sync Watermarks
date: 2026-05-19
status: accepted
domains: [sync, sqlite, api, protobuf]
---

# 9. Use Row State Sync Watermarks

## Context

The original smart sync design used an API `sync_events` table and event-id
cursors. The sync pipeline now stores change visibility on each synced row via
`sync_updated_at`, and POS clients keep opaque table/id watermarks after pulls.

Keeping event-id compatibility fields after removing `sync_events` creates
misleading state. In particular, `sync_batch_requests.latest_event_id` can only
remain `0` because there is no event log left to advance it.

## Decision

Use row-state watermarks as the only server-side incremental sync model:

- Synced API rows carry `sync_updated_at`.
- POS pull cursors store opaque row-state watermarks.
- POS local writes are pushed from `sync_outbox`.
- POS `sync_cursors` does not store event ids.
- API push idempotency stores the request hash, cached response JSON, server
  time, and request timestamps only.
- Do not reintroduce `sync_events`, event-id cursors, or
  `sync_batch_requests.latest_event_id` compatibility fields.

## Consequences

Pull correctness depends on updating `sync_updated_at` for inserts, updates,
and conflict upserts on every synced API table.

Push idempotency remains independent from pull cursor generation. A push retry
returns the cached response, while the next pull uses row-state watermarks to
discover server-visible changes.

Operational checks should inspect `sync_updated_at`, pull cursor values, and
pending outbox rows. They should not expect event ids.
