# POS Cloud Login, PIN, Staff Mapping, And Sync Flow

Date: 2026-05-09

This note documents the intended behavior and the debugging lessons from the cloud login + POS session flow.

## Mental Model

The POS app has two different authentication concepts:

- **Cloud account session**: email/password login against the API. This identifies a cloud `users` row and authorizes access to merchants/outlets through `user_merchants`.
- **Local POS staff session**: the staff identity used inside the POS app for permissions and order attribution. This is stored locally in SQLite after sync.
- **PIN**: local staff unlock credential. It is not the cloud login credential. It is used for later local unlocks and staff switching, not immediately after a successful cloud email/password login.

For a returning cloud user on a fresh install, the app should not ask for PIN creation if the cloud user already maps to an existing active staff row. It should resolve that staff row from the API, sync it locally, and enter the app directly.

## Staff Ownership

PIN belongs to a `staff` row.

The cloud user to staff mapping is:

```text
users.id -> staff.cloud_user_id
```

This is scoped by merchant:

```text
staff.merchant_id = selected merchant
staff.cloud_user_id = current cloud user id
staff.is_active = true
```

Owner bootstrap behavior:

- If an owner cloud account has no mapped staff yet and there is exactly one active unclaimed owner staff row for the merchant, `/staff/me` can claim it by setting `staff.cloud_user_id`.
- If there are multiple unclaimed owner rows, the mapping is ambiguous and should fall back to PIN login or manual resolution.
- Non-owner memberships should not auto-claim staff.

## Expected Login Flow

1. User logs in with cloud email/password.
2. API returns session token and app stores it via `AuthStorage`.
3. App loads merchants from `GET /api/merchants`.
4. User selects merchant.
5. App loads outlets from `GET /api/merchants/:merchantId/outlets`.
6. User selects outlet.
7. App stores outlet context locally:

```text
sakti-pos:current-outlet-id
sakti-pos:current-merchant-id
sakti-pos:current-register-id, if known
```

8. App calls `POST /api/merchants/:merchantId/staff/me`.
9. App runs native `sync_now` for the selected outlet.
10. App logs in locally with the synced staff id using `loginWithCloudStaff(staffId)`.
11. Route by role:

```text
cashier -> /pos
owner/manager -> /
```

If `/staff/me` returns no staff and there are no active local staff rows, onboarding/PIN creation is allowed only when a cloud session exists.

## API Requirements

The API database must include:

```sql
ALTER TABLE staff ADD cloud_user_id text REFERENCES users(id);
```

When this column is missing, `POST /api/merchants/:merchantId/staff/me` fails with a query containing:

```text
"staff"."cloud_user_id"
```

After changing the API schema, always apply the API DB schema to the same database the running API uses:

```bash
cd apps/api
bun run db:push
```

For local API development, restarting the dev script also pushes schema:

```bash
cd apps/api
bun run dev
```

Do not skip this after migrations. The Android app can be rebuilt correctly but still fail if the API database is stale.

## Local Sync Sequence

Native sync runs in `apps/pos-app/src-tauri/src/sync.rs`.

High-level sequence:

1. Pull server rows for all sync tables.
2. Upsert pulled rows into local SQLite.
3. Mark pulled server rows as locally synced.
4. Push local unsynced rows.
5. Run local garbage collection for soft-deleted synced rows.

Important details:

- Server payload uses camelCase fields.
- Local SQLite uses snake_case columns.
- Sync converts server camelCase to local snake_case before upsert.
- `is_synced` is local-only and must not be sent to the API.
- Rows pulled from the server should be inserted with `is_synced = true`; otherwise they are immediately considered local unsynced rows and may be pushed back.
- Merchant-scoped tables must sync by `merchant_id`, not outlet id.
- Outlet-scoped tables sync by `outlet_id`.
- `merchants` filters by `id` using the selected merchant id.

## GC Bug Found

We found a bug where sync pulled active rows and then immediately deleted them.

Observed log pattern:

```text
pull: table=staff, rows_from_server=1
upsert_row OK: table=staff, id=...
syncNow result ... "purged":4
loginWithCloudStaff local staff sample {"count":0,"rows":[]}
```

Root cause:

- API rows had `deletedAt` as an empty string (`""`) rather than SQL `NULL`.
- Local upsert converted that to `deleted_at = ''`.
- GC used `deleted_at IS NOT NULL`, so active rows with `deleted_at = ''` were treated as deleted.

GC must only purge real soft-delete values:

```sql
deleted_at IS NOT NULL
AND deleted_at != ''
AND lower(deleted_at) != 'null'
AND is_synced = 1
```

Expected healthy log pattern:

```text
pull row: table=staff ... "deletedAt":""
upsert_row OK: table=staff, id=...
sync_now GC table: table=staff ... rows_purged=0
[AUTH] loginWithCloudStaff result {"found":true,"isActive":true,"role":"owner",...}
```

## Useful Diagnostics

Preferred Android logcat command:

```bash
adb logcat -c && adb logcat -s "Tauri/Console:*" "RustStdoutStderr:*" | grep -E "\[CLOUD-AUTH\]|\[CLOUD-LOGIN\]|\[SYNC-DEBUG\]|\[AUTH\]|FAILED|Failed|Error"
```

For deeper sync row inspection:

```bash
adb logcat -c && adb logcat -s "Tauri/Console:*" "RustStdoutStderr:*" | grep -E "\[SYNC-DEBUG\] pull row|\[SYNC-DEBUG\] upsert_row|\[SYNC-DEBUG\] push row|\[SYNC-DEBUG\] local state|\[SYNC-DEBUG\] sync_now GC table|\[AUTH\]|\[CLOUD-LOGIN\]|FAILED|Failed|Error"
```

Do not log raw secrets. Row diagnostics should redact keys containing:

```text
pin
password
token
secret
```

## Debugging Checklist

If outlet selection fails:

1. Check `POST /api/merchants/:merchantId/staff/me`.
2. If it returns 500 with `cloud_user_id`, run API DB schema push.
3. Check `syncNow result`.
4. If pull succeeds but local staff is missing, inspect GC purge count.
5. If `purged > 0` immediately after pulling active rows, inspect `deletedAt/deleted_at` values.
6. If local staff exists but login fails, inspect `is_active` and staff id mismatch.
7. Rebuild/reinstall Android after Rust changes:

```bash
cd apps/pos-app
bun run tauri android dev
```

## Files To Know

- `apps/pos-app/src/pages/cloud-login.tsx`: cloud login and outlet selection flow.
- `apps/pos-app/src/store/auth.ts`: local auth and `loginWithCloudStaff`.
- `apps/pos-app/src/store/sync.ts`: JS wrapper for native `sync_now`.
- `apps/pos-app/src-tauri/src/sync.rs`: native pull/push/GC sync implementation.
- `apps/api/src/routes/staff.ts`: `/api/merchants/:merchantId/staff/me`.
- `apps/api/src/lib/sync.ts`: API pull/push handlers.
- `packages/database/src/api-schema.ts`: API database schema.
- `packages/database/src/local-schema.ts`: POS local SQLite schema.
