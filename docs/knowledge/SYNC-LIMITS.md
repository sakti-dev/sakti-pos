# Sync Limits

This project keeps sync push batches intentionally below platform hard limits. The POS app chunks outbound protobuf push requests before sending them, and the API chunks database writes again before executing SQL.

## Current Defaults

| Limit | Value | Owner | Reason |
| --- | ---: | --- | --- |
| POS target push request size | `256 KiB` | POS app | Conservative Cloudflare Workers Free CPU profile and low memory pressure |
| API hard push request size | `2 MiB` | API | Prevents excessive protobuf decode/mapping memory and rejects oversized requests before DB work |
| API hard push row count | `2000` rows | API | Keeps per-request work bounded |
| API DB bind parameter budget | `30,000` params | API | Below SQLite/libSQL `32766`, and below PostgreSQL `65,535` |

## Platform Notes

- Cloudflare Workers Free has a very small CPU budget. The `256 KiB` POS target is chosen for Worker compatibility, not maximum throughput.
- Cloudflare Workers memory is `128 MB`; keep API protobuf bodies small enough that decode, mapping, validation, and DB payloads fit comfortably.
- Turso Cloud currently runs on libSQL, which is SQLite-compatible. SQLite defaults to `32766` host parameters in modern versions.
- PostgreSQL supports up to `65,535` query parameters. The SQLite/libSQL parameter budget is stricter, so using `30,000` keeps a future PostgreSQL move safe.

## Runtime Behavior

- POS builds chunks by actual encoded protobuf bytes, not JSON estimates.
- POS also respects the `2000` row ceiling.
- If the API still returns `413`, POS splits that chunk in half and retries each half with a new deterministic idempotency key derived from that subchunk's outbox IDs.
- If a single row still returns `413`, POS stops retrying and raises `payload_too_large_single_row`.
- API still validates the hard byte and row limits before processing the push.
- API write adapters separately chunk SQL writes by bind-parameter count.

## Sources

- Cloudflare Workers limits: `https://developers.cloudflare.com/workers/platform/limits/`
- Turso/libSQL compatibility: `https://docs.turso.tech/libsql`
- SQLite limits: `https://www.sqlite.org/limits.html`
- PostgreSQL limits: `https://www.postgresql.org/docs/17/limits.html`
