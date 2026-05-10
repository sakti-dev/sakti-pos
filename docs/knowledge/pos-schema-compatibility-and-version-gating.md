# POS Schema Compatibility And Version Gating

Date: 2026-05-11

This note documents how to handle schema changes safely when the API updates before the POS client, or when some devices lag behind on app updates.

## Problem

The POS stack is not guaranteed to update atomically.

This can happen:

- API deploys first, client app updates later.
- One device is still on an older APK while another already updated.
- Local SQLite migrations are not yet applied on a device.
- Sync payloads contain a new field that older local schemas cannot store.

The main failure mode is not protobuf parsing. Unknown protobuf fields are usually safe. The real breakage happens when the client tries to upsert server data into a local table that does not yet have the new column.

## Rule Of Thumb

Use additive schema changes first, then gate usage.

1. Add the new field in a backward-compatible way.
2. Keep old code working.
3. Only start depending on the new field after the client side is ready.
4. After the rollout window, remove compatibility code.

## Recommended Rollout Pattern

### Phase 1: Expand

Add the new column or field with one of these properties:

- nullable
- defaulted
- ignored by older clients

For outlet timezone, the safe shape is:

- API schema gets `outlets.timezone`
- local schema gets `outlets.timezone`
- the field defaults to `Asia/Jakarta`

This ensures new writes have a value, and older rows can be backfilled.

### Phase 2: Backfill

Pre-fill existing rows in both API and local migrations.

This avoids a mixed state where:

- the schema exists
- new rows are correct
- old rows are still empty or null

### Phase 3: Gate Usage

Do not assume all clients understand the new field immediately.

If the API can serve both old and new clients, it should decide what to send based on client capability:

- app version
- schema version
- sync protocol version
- or a capability flag sent during auth/sync

The client should also avoid writing data paths that depend on the new column until the migration is known to be present.

### Phase 4: Remove Compatibility Branches

Once the minimum supported client version is above the rollout window, remove the legacy branch.

## What To Version

Use a client capability indicator that the API can trust enough to branch sync behavior.

Good options:

- `appVersion`
- `schemaVersion`
- `syncProtocolVersion`
- explicit feature flags

The important part is not the label. The important part is that the server can distinguish:

- old client, old schema
- new client, new schema

## Where To Apply The Gate

The compatibility boundary should be near the sync boundary, not deep inside business logic.

Recommended places:

- API sync serialization
- API upsert shape selection
- client sync decoding / local upsert

Avoid branching all over the codebase for every table.

## Practical Example: Outlet Timezone

If the API is updated before the client:

- API may start sending `timezone` in outlet payloads.
- An older client may receive that field and ignore it in protobuf.
- But the older client can still fail if it tries to upsert into a local SQLite table that does not yet have `timezone`.

To handle that safely:

- keep the local migration bundled with the client app
- make the API tolerant of older clients
- optionally omit the field from sync payloads sent to clients that do not advertise support yet

If the client is updated before the API:

- client can read the field if present
- client should default to `Asia/Jakarta` when the field is absent
- the API should continue accepting requests without the new field during the rollout window

## Compatibility Rules For This Repo

For schema changes in sakti-pos:

- Prefer additive changes over destructive ones.
- Default new business-time fields to `Asia/Jakarta` unless the outlet explicitly overrides them.
- Keep local SQLite migrations embedded in the Tauri app so the shipped client can apply them.
- Keep the API schema tolerant of older clients.
- Treat sync as version-aware when payload shape can outlive a rollout window.

## Operational Checklist

Before shipping a schema change:

1. Add the schema field on both API and local sides.
2. Add or update migrations with a backfill.
3. Make the API default the field when missing.
4. Make the client default the field when missing.
5. Ensure the POS app embeds the new local migration.
6. If needed, add a client capability version to sync/auth.
7. Verify one older-client path still works during the rollout window.

## Residual Risk

If a device runs an old APK with a stale local schema, the API cannot fully save it by itself. The safest mitigation is:

- ship the migration in the app bundle
- keep the API backward compatible
- avoid depending on the new column until all active clients have the new schema

