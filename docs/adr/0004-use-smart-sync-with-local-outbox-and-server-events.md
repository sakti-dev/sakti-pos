---
id: 4
title: Use Smart Sync With Local Outbox And Server Events
date: 2026-05-14
status: accepted
domains: [sync, sqlite, api, protobuf]
---

# 4. Use Smart Sync With Local Outbox And Server Events

## Context

Manual and startup sync should avoid unnecessary table reads and writes on unreliable networks. The app also needs to distinguish local changes, server changes, baseline sync after reinstall, and expired cursors.

## Decision

Use compact sync metadata:

- POS SQLite `sync_outbox` records local row changes.
- POS SQLite `sync_cursors` stores the latest applied server event id.
- API `sync_events` records compact server-side row changes.
- Sync transport uses protobuf request and response bodies.

The frontend sync store calls `get_sync_local_state`, posts to `/api/sync/status`, then chooses one native transfer mode: skipped, push-only, pull-only, or full.

Fresh installs use full baseline sync when local SQLite cannot resolve the selected outlet/merchant state yet.

## Consequences

No-op syncs can skip native transfer. Incremental pulls can fetch only rows referenced by server events.

`sync_push_outbox` currently reuses the existing row serializer before marking outbox entries synced, so this design is compatible with older row sync behavior while still giving smarter mode selection.
