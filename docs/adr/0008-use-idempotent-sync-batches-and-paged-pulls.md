---
id: 8
title: Use Idempotent Sync Batches And Paged Pulls
date: 2026-05-17
status: accepted
domains: [sync, api, protobuf, sqlite]
---

# 8. Use Idempotent Sync Batches And Paged Pulls

## Context

Sync now uses hardcut protobuf batch endpoints for the default `/api/sync/push`, `/api/sync/pull`, and `/api/sync/status` routes. The app has not launched, so there is no public legacy sync API compatibility layer to preserve.

Mobile and offline networks still retry requests, and server event sets can grow large enough that a single pull response is wasteful.

## Decision

Store batch push responses behind an outlet-scoped idempotency key in `sync_batch_requests`, and return the cached response when the same batch is retried.

Make pull cursor-paged by sync event id with a bounded page size so the client can advance through large event sets without fetching everything at once.

Treat typed protobuf field names as transport-only. API and POS mappers own conversion between typed money/count fields and database column names such as `price`, `total`, `unit_price`, and `subtotal`.

Treat full resync as a baseline pull from event cursor zero, not as a continuation from the locally stored event cursor.

Mark local push rows synced only when the server acknowledges the exact row id in the batch response. Rejected rows remain dirty/pending so conflict handling can surface them instead of silently clearing local work.

## Consequences

Push retries become safe without double-applying the same batch or generating duplicate batch acknowledgements.

Pulls can advance in smaller committed chunks, which reduces memory pressure and keeps the sync flow resilient when the event window is large.

Typed protobuf schemas can evolve without leaking transport field names into SQLite schemas, but every hot table needs explicit mapper coverage.

The API now depends on an additional SQLite-backed batch request cache, so schema migrations must accompany future sync protocol changes.
