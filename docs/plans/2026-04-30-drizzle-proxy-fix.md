# Drizzle SQLite Proxy Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix Drizzle ORM parameterized queries failing on Android by replacing `@tauri-apps/plugin-sql`'s JS API with a custom Rust command using `sqlx` directly — proven working approach from the reference project at `./tauri-drizzle-proxy`.

**Architecture:** Drizzle's sqlite-proxy JS driver calls `invoke("run_sql", { query })` via Tauri IPC to a custom Rust command that uses `sqlx::query()` directly against SQLite. The `tauri-plugin-sql` is kept **only** for running migrations. This eliminates the `?` vs `$N` placeholder mismatch entirely because `sqlx::query()` binds params positionally regardless of SQL syntax.

**Tech Stack:** Rust `sqlx` 0.8.6 (sqlite + runtime-tokio), Tauri IPC `invoke`, Drizzle sqlite-proxy, `base64` for BLOB encoding

**Why this works:** The reference project at `./tauri-drizzle-proxy` uses this exact pattern successfully. The root cause of our current failure is that `@tauri-apps/plugin-sql`'s JS `execute()`/`select()` methods don't properly handle Drizzle's `?` placeholders with parameter arrays. By using `sqlx` directly in Rust (via a Tauri command), we get native `?` placeholder support with positional `.bind()` calls.

---

### Task 1: Add Rust dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add sqlx and base64 to Cargo.toml**

Add these lines under `[dependencies]`:

```toml
sqlx = { version = "0.8.6", features = ["sqlite", "runtime-tokio"] }
base64 = "0.22.1"
```

The final `[dependencies]` section should look like:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri-plugin-safe-area-insets-css = "0.2.0"
tauri-plugin-sql = { version = "2.4.0", features = ["sqlite"] }
sqlx = { version = "0.8.6", features = ["sqlite", "runtime-tokio"] }
base64 = "0.22.1"
```

**Step 2: Verify cargo fetches dependencies**

Run: `cargo fetch`
Workdir: `src-tauri`
Expected: Downloads complete without errors. If sqlx fails to compile a build script, that's OK — we just need it fetched.

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add sqlx and base64 dependencies for custom Drizzle proxy"
```

---

### Task 2: Create the Rust proxy command

**Files:**
- Create: `src-tauri/src/drizzle_proxy.rs`
- Reference: `./tauri-drizzle-proxy/src-tauri/src/drizzle_proxy.rs` (proven working)

**Step 1: Create drizzle_proxy.rs**

Create `src-tauri/src/drizzle_proxy.rs` with this content:

```rust
use base64::engine::general_purpose;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{
    sqlite::{SqliteArguments, SqliteRow},
    Column, Row, Sqlite, SqlitePool, TypeInfo,
    query::Query,
};
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager};

#[derive(Debug, Deserialize)]
pub struct SqlQuery {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct SqlRow {
    pub columns: Vec<String>,
    pub values: Vec<serde_json::Value>,
}

#[command]
pub async fn run_sql(app: AppHandle, query: SqlQuery) -> Result<Vec<SqlRow>, String> {
    let db_path = get_app_db_path(&app)?;
    let uri = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePool::connect(&uri)
        .await
        .map_err(|e| format!("Failed to connect to DB: {}", e))?;

    let mut q = sqlx::query(&query.sql);
    for param in &query.params {
        q = bind_value(q, param);
    }

    let rows = q
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let result = rows
        .iter()
        .map(|row| {
            let columns = row
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();

            let values = (0..row.len())
                .map(|i| match row.try_get_raw(i) {
                    Ok(_) => sqlx_value_to_json(row, i),
                    Err(_) => Value::Null,
                })
                .collect::<Vec<_>>();

            SqlRow { columns, values }
        })
        .collect();

    Ok(result)
}

fn get_app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("sakti-pos.db"))
        .map_err(|_| "Could not resolve app data directory".to_string())
}

fn bind_value<'q>(
    query: Query<'q, Sqlite, SqliteArguments<'q>>,
    value: &'q Value,
) -> Query<'q, Sqlite, SqliteArguments<'q>> {
    match value {
        Value::Null => query.bind(None::<String>),
        Value::Bool(b) => query.bind(*b),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else if let Some(f) = n.as_f64() {
                query.bind(f)
            } else {
                query
            }
        }
        Value::String(s) => query.bind(s),
        _ => query,
    }
}

fn sqlx_value_to_json(row: &SqliteRow, index: usize) -> Value {
    let column = row.column(index);
    let type_name = column.type_info().name();

    match type_name {
        "INTEGER" => row
            .try_get::<i64, _>(index)
            .map(Value::from)
            .unwrap_or(Value::Null),
        "REAL" => row
            .try_get::<f64, _>(index)
            .map(Value::from)
            .unwrap_or(Value::Null),
        "TEXT" => row
            .try_get::<String, _>(index)
            .map(Value::String)
            .unwrap_or(Value::Null),
        "BLOB" => row
            .try_get::<Vec<u8>, _>(index)
            .map(|bytes| Value::String(general_purpose::STANDARD.encode(&bytes)))
            .unwrap_or(Value::Null),
        _ => row
            .try_get::<String, _>(index)
            .map(Value::String)
            .unwrap_or(Value::Null),
    }
}
```

Key differences from reference:
- DB path uses `sakti-pos.db` (matching our migration config)
- URI includes `?mode=rwc` (read-write-create) to ensure DB is created if missing
- Otherwise identical proven logic from reference project

**Step 2: Commit**

```bash
git add src-tauri/src/drizzle_proxy.rs
git commit -m "feat: add run_sql Rust command using sqlx for Drizzle proxy"
```

---

### Task 3: Wire up the Rust command in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Update lib.rs**

Replace the entire content of `src-tauri/src/lib.rs` with:

```rust
mod drizzle_proxy;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "init",
        sql: include_str!("../../drizzle/0000_woozy_hulk.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_safe_area_insets_css::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:sakti-pos.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![drizzle_proxy::run_sql])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Changes from current:
- Added `mod drizzle_proxy;` at top
- Added `.invoke_handler(tauri::generate_handler![drizzle_proxy::run_sql])` to the builder chain

**Step 2: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register run_sql Tauri command in lib.rs"
```

---

### Task 4: Rewrite the Drizzle proxy in TypeScript

**Files:**
- Modify: `src/db/index.ts`

**Step 1: Replace db/index.ts with invoke-based proxy**

Replace the entire content of `src/db/index.ts` with:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

type SqlRow = {
  columns: string[];
  values: unknown[];
};

const db = drizzle(
  async (sql, params, method) => {
    const rows = await invoke<SqlRow[]>("run_sql", {
      query: { sql, params },
    });

    if (rows.length === 0 && method === "get") {
      return {} as { rows: unknown[] };
    }

    return method === "get"
      ? { rows: rows[0].values }
      : { rows: rows.map((r) => r.values) };
  },
  { schema },
);

export type DatabaseType = typeof db;
export default db;
```

Key changes from current:
- Removed `Database.load()` / `getDb()` — no longer using `@tauri-apps/plugin-sql` JS API for queries
- Removed `convertPlaceholders()` — `sqlx` handles `?` natively
- Uses `invoke<SqlRow[]>("run_sql", { query: { sql, params } })` to call Rust command
- Returns `{ rows }` format Drizzle expects
- Handles Drizzle `.get()` bug (empty rows) — same workaround as reference project
- Still exports `DatabaseType` type for other modules

**IMPORTANT:** Other files import `db` from `"~/db"` — the named export `db` is still there, so no other imports need changing. But `getDb()` was exported and used in `src/index.tsx` — we need to handle that in Task 5.

**Step 2: Commit**

```bash
git add src/db/index.ts
git commit -m "feat: rewrite Drizzle proxy to use invoke('run_sql') instead of plugin-sql JS API"
```

---

### Task 5: Update bootstrap to remove getDb() dependency

**Files:**
- Modify: `src/index.tsx`

**Step 1: Remove getDb() call from bootstrap**

The current `index.tsx` calls `await getDb()` before `seedDefaultOwner()`. Since we no longer have `getDb()` exported (the DB is now managed entirely by the Rust side — migrations via plugin, queries via `run_sql` command), we can remove that call.

Replace `src/index.tsx` with:

```tsx
/* @refresh reload */
import "@saurl/tauri-plugin-safe-area-insets-css-api";
import { render } from "solid-js/web";
import { initSafeArea } from "./lib/safe-area";
import { seedDefaultOwner } from "./lib/auth-provider";
import "./index.css";
import App from "./App";

const root = document.getElementById("root");

async function bootstrap() {
  initSafeArea();
  try {
    await seedDefaultOwner();
    render(() => <App />, root!);
  } catch (err) {
    console.error("[sakti-pos] Bootstrap FAILED:", err);
    alert("Bootstrap failed: " + String(err));
  }
}

bootstrap();
```

Changes:
- Removed `import { getDb } from "./db"` (no longer exported/needed)
- Removed `await getDb()` call — migrations run automatically via `tauri-plugin-sql`, and `seedDefaultOwner()` will trigger `invoke("run_sql")` which connects to the DB

**Step 2: Verify no other files import getDb**

Run: `rg "getDb" src/`
Expected: No matches (we already removed the only usage in index.tsx)

**Step 3: Commit**

```bash
git add src/index.tsx
git commit -m "refactor: remove getDb() call from bootstrap, DB managed by Rust side"
```

---

### Task 6: Build and verify frontend compiles

**Files:** None (verification only)

**Step 1: Run frontend build**

Run: `bun run build`
Expected: Build succeeds with no errors. The Drizzle proxy now uses `invoke` from `@tauri-apps/api/core` which is already installed.

**Step 2: Fix any TypeScript errors if they arise**

If the build fails, check:
- Is `@tauri-apps/api` installed? (It should be — it's a Tauri dependency)
- Are there any remaining imports of `getDb` from `"~/db"`?
- Run `rg "from.*['\"].*~/db['\"]" src/` and `rg "getDb" src/` to find stale references

---

### Task 7: Android build test

**Files:** None (verification only)

**Step 1: Clear previous app data on device**

Run: `adb shell pm clear com.sakti-dev.sakti-pos`
Why: The old database may have partially applied migrations or corrupted state from previous failed attempts.

**Step 2: Build and run on Android**

Run: `bun run tauri android dev`
Expected: App builds, installs, and launches without crash.

**Step 3: Monitor logcat for bootstrap success**

Run (in separate terminal): `adb logcat | grep -i "sakti-pos\|chromium\|console"`
Expected:
- No "Bootstrap FAILED" error
- No "Failed query" error
- App renders the login page with the Owner user

**Step 4: Verify login works**

On the device:
1. Tap the "Owner" user card
2. Enter PIN: `1234`
3. Expected: Redirects to the menu/home page

**Step 5: If errors occur, check logcat carefully**

Common issues:
- **"Failed to connect to DB"**: The `app_data_dir` path is wrong or permissions issue
- **"Query failed"**: SQL syntax error — check the actual SQL in logcat
- **"command run_sql not found"**: The `.invoke_handler` is missing or command name is wrong
- **App crashes on launch**: Check `adb logcat | grep -i "panic\|fatal"` for Rust panics

---

### Task 8: Final commit and cleanup

**Files:**
- Potentially modify: various if debug logs need removal

**Step 1: Remove any debug logging if present**

Check `src/db/index.ts` — it should be clean (no console.log).
Check `src/lib/auth-provider.ts` — should be clean.

**Step 2: Verify git status**

Run: `git status`
Expected: Only files modified by this plan should show changes.

**Step 3: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore: cleanup after Drizzle proxy migration"
```

---

## Summary of changes

| File | Action | Why |
|------|--------|-----|
| `src-tauri/Cargo.toml` | Add `sqlx` + `base64` | Direct SQLite access from Rust |
| `src-tauri/src/drizzle_proxy.rs` | Create | Custom Tauri command using sqlx |
| `src-tauri/src/lib.rs` | Add `mod` + `invoke_handler` | Register the command |
| `src/db/index.ts` | Rewrite | Use `invoke("run_sql")` instead of plugin JS API |
| `src/index.tsx` | Remove `getDb()` | No longer needed |

## What stays the same

- `tauri-plugin-sql` — still used for **migrations only** (`.add_migrations()`)
- `drizzle.config.ts` — no changes
- `src/db/schema.ts` — no changes
- `drizzle/0000_woozy_hulk.sql` — no changes
- All auth code (`auth-provider.ts`, `auth.ts`, `PinPad.tsx`, `Login.tsx`) — no changes
- `src-tauri/capabilities/default.json` — no changes needed (Tauri commands don't need capability permissions)
