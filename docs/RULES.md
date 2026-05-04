# Rules

Guidelines for working on this codebase. Learn from past mistakes.

## Database

### Single source of truth for DB connections
- `run_sql` Rust command owns all queries via `sqlx`
- `tauri-plugin-sql` is ONLY for running migrations via `Database.load()`
- Never use `@tauri-apps/plugin-sql`'s JS API (`db.execute()`, `db.select()`) for queries

### Schema constraints
- Always add `UNIQUE` constraints on columns that identify a row (name, email, code, etc.)
- Always add `NOT NULL` on required columns
- Design for idempotency — `INSERT OR IGNORE` for seed data, unique constraints for safety

### Migrations
- After any `schema.ts` change, run `bun drizzle-kit generate` immediately
- Add the new migration to `src-tauri/src/lib.rs` with an incremented version number
- Test with a clean install (uninstall app) after migration changes

### Seed data
- Use `INSERT OR IGNORE` for all seed/initial data
- Never rely on `COUNT(*)` checks — aggregate functions return `Null` through our proxy due to untyped columns
- Never use `try/catch` to swallow real errors — only catch expected constraint violations

### Proxy quirks
- `sqlx_value_to_json` must use fallback chains (i64 → f64 → String → Null) because SQLite aggregate columns and expressions have no declared type
- Drizzle's `db.all(sql\`...\`)` with raw SQL returns `[[val1, val2]]` (array of arrays), NOT objects with named fields
- The `.get()` empty-result workaround (`return {} as { rows: unknown[] }`) is required — see drizzle-orm#4113

## Debugging

### Always add Rust-side logging first
- Use `eprintln!("[run_sql] ...")` in `drizzle_proxy.rs` — these show in logcat as `RustStdoutStderr`
- `console.log` from JS shows as `Tauri/Console` in logcat but may be filtered out by grep patterns
- When something fails, log: the input (sql, params), the output (result rows), and the error

### Logcat commands
```bash
# All app logs
adb logcat | grep -i "sakti"

# Rust + JS errors
adb logcat | grep -E "RustStdoutStderr|Tauri/Console"

# Only Rust proxy logs
adb logcat | grep "run_sql"
```

### Error chain
- Rust error (e.g. `"Query failed: no such table"`) → wrapped by Drizzle as `"Failed query: INSERT ..."` → the real cause is always in the `cause` property or the Rust log
- Never debug only from the JS error message — it's always wrapped

## Build & Deploy

### Rebuild vs Reinstall
- **Rebuild** (`./dev`): Code changes only. Keeps existing DB data.
- **Uninstall + Rebuild**: Required when migrations change or DB is corrupted
- Never assume a rebuild clears data — it doesn't

### After schema changes
1. Run `bun drizzle-kit generate`
2. Add migration to `src-tauri/src/lib.rs`
3. Uninstall app from device
4. Rebuild with `./dev`

## Code Style

### No comments unless asked
- Code should be self-documenting
- Only add comments for non-obvious workarounds (with issue links)

### Don't over-engineer
- If a simple solution exists (`INSERT OR IGNORE`), use it — don't build count checks, try/catch chains, or custom query wrappers
- YAGNI — don't add abstractions until they're needed

### Test incrementally
- After changing a layer (Rust proxy, TS proxy, schema), test it in isolation before wiring into the app
- One change at a time — don't stack 5 changes then debug all at once
