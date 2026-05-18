# DB Snapshot Inspection

This note captures the dev-only SQLite snapshot workflow used to inspect the live POS device database without Android Studio.

## Purpose

The device app can export a consistent SQLite snapshot on demand. The host then copies that snapshot into the repo so tools like Drizzle Studio can open it locally.

This is meant for debugging sync, assets, and local state on Waydroid or real Android devices.

## Primary Command

Use the host-side sync script:

```bash
bun app:db-snapshot-sync
```

That command now does the whole flow:

1. Starts the app via the dev deep-link URL.
2. Waits for the device snapshot to appear.
3. Copies the snapshot into `apps/pos-app/.db-snapshots/latest.sqlite`.
4. Overwrites any previous host snapshot automatically.

## Snapshot Location

- Device snapshot path: `/data/user/0/com.sakti_dev.sakti_pos/db-snapshots/latest.sqlite`
- Host snapshot path: `apps/pos-app/.db-snapshots/latest.sqlite`

The host copy is intentionally repo-relative so every contributor gets the same path inside their own checkout.

## Ownership And Permissions

The host sync script writes the snapshot back with normal user ownership and `0644` permissions.

That matters because the first exported copy was root-owned and unreadable from a normal shell session. The current script now uses a fresh file write so Drizzle Studio and `sqlite3` can open the snapshot without sudo.

If you already have an old root-owned snapshot from before the fix, re-run:

```bash
bun app:db-snapshot-sync
```

The new copy should be user-owned and readable.

## Manual Debug Flow

1. Rebuild/reinstall the app so the deep-link handler is present.
2. Reproduce the issue on device.
3. Run `bun app:db-snapshot-sync`.
4. Open `apps/pos-app/.db-snapshots/latest.sqlite` in Drizzle Studio or `sqlite3`.
5. Compare the snapshot data with `logs/app.log` and the API database.

## Verification

The sync script is covered by:

```bash
bash apps/pos-app/scripts/__test__/sync-db-snapshot.test.sh
```

And the snapshot itself can be checked with:

```bash
sqlite3 apps/pos-app/.db-snapshots/latest.sqlite "PRAGMA integrity_check;"
```

## Related Files

- `apps/pos-app/scripts/sync-db-snapshot`
- `apps/pos-app/scripts/__test__/sync-db-snapshot.test.sh`
- `apps/pos-app/src-tauri/src/db/snapshot.rs`
- `apps/pos-app/src-tauri/src/app/startup.rs`
