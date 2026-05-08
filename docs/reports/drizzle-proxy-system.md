# Sakti POS — Drizzle Proxy System: Complete Technical Report

> **Purpose:** Self-contained reference document for code review. No access to the codebase is needed to understand the system.

---

## 1. Project Context

**Sakti POS** is a point-of-sale application built with:

- **Frontend:** SolidJS + TypeScript
- **Backend:** Tauri v2 (Rust)
- **Database:** SQLite (local, offline-first)
- **ORM:** Drizzle ORM with `sqlite-proxy` driver
- **Targets:** macOS, Windows, Linux, Android (mobile tablets)
- **Sync:** Custom push/pull sync to a cloud API server

The app runs entirely offline. A local SQLite database stores all business data (merchants, outlets, products, orders, staff). Data syncs to a cloud server when network is available.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  TypeScript Frontend (SolidJS + Drizzle ORM)                    │
│                                                                  │
│  src/db/orders.ts, staff.ts, menu.ts, dashboard.ts, outlets.ts  │
│    │                                                             │
│    │  db.select().from(staff).where(eq(staff.id, "abc"))        │
│    ▼                                                             │
│  drizzle-orm/sqlite-proxy  (generates SQL)                       │
│    │  { sql: "SELECT ... WHERE id = ?", params: ["abc"] }       │
│    ▼                                                             │
│  invoke("run_sql", { query: { sql, params } })                   │
│    │  Tauri IPC bridge (JSON serialization)                      │
├────┼──────────────────────────────────────────────────────────────┤
│    ▼                                                             │
│  Rust Backend (Tauri v2)                                         │
│                                                                  │
│  drizzle_proxy.rs :: run_sql()                                   │
│    │  sqlx::query(sql).bind(params).fetch_all(&pool)            │
│    ▼                                                             │
│  SQLite (sakti-pos.db)                                           │
│    Location: {app_config_dir}/sakti-pos.db                       │
└─────────────────────────────────────────────────────────────────┘
```

### Why this pattern exists

The original approach used `@tauri-apps/plugin-sql` (the official Tauri SQL plugin), which provides a JavaScript `Database.load()` + `execute()`/`select()` API. This crashed on Android due to a `?` vs `$N` placeholder mismatch — Drizzle's `sqlite-proxy` driver generates `?` placeholders, but the plugin's internal sqlx layer expected `$N`-style parameters on Android, causing panics.

The fix: bypass the plugin's JS API entirely. Write a custom Rust Tauri command that uses `sqlx` directly, binding parameters positionally with `.bind()`. This works identically on all platforms because `sqlx::query()` handles `?` natively.

---

## 3. Complete Data Flow (Single Query)

```
1. App code: db.select().from(staff).where(eq(staff.id, "abc"))

2. Drizzle query builder generates:
   { sql: "SELECT \"id\", \"name\", ... FROM \"staff\" WHERE \"id\" = ?",
     params: ["abc"],
     method: "all" }

3. sqlite-proxy callback (src/db/index.ts):
   invoke<SqlRow[]>("run_sql", { query: { sql, params, method } })

4. Tauri IPC serializes to JSON, sends to Rust

5. Rust drizzle_proxy::run_sql():
   - Receives State<'_, AppState> containing the shared SqlitePool
   - method == "run" → sqlx::query(sql).bind("abc").execute(&pool) → return []
   - method != "run" → sqlx::query(sql).bind("abc").fetch_all(&pool)

6. SQLite executes query, returns rows

7. Rust maps each SqliteRow → SqlRow { columns: [...], values: [...] }
   via shared db_utils::sqlx_value_to_json():
   - INTEGER → i64 → serde_json::Number
   - REAL    → f64 → serde_json::Number
   - TEXT    → String → serde_json::String
   - BLOB    → Vec<u8> → base64 String

8. Tauri IPC serializes Vec<SqlRow> back to TypeScript

9. sqlite-proxy callback transforms:
   method === "get" → { rows: rows[0]?.values ?? [] }
   method === "all" → { rows: rows.map(r => r.values) }

10. Drizzle ORM maps values back to typed objects using schema definitions
```

---

## 4. Source Code — Complete

### 4.1 TypeScript Proxy Bridge (`src/db/index.ts`)

This is the only file that connects Drizzle ORM to the Rust backend.

```typescript
import * as schema from "@repo/database";
import { invoke } from "@tauri-apps/api/core";
import { drizzle } from "drizzle-orm/sqlite-proxy";

interface SqlRow {
    columns: string[];
    values: unknown[];
}

export const db = drizzle(
    async (sql, params, method) => {
        try {
            const rows = await invoke<SqlRow[]>("run_sql", {
                query: { sql, params, method },
            });

            if (rows.length === 0 && method === "get") {
                return {} as { rows: unknown[] };
            }

            return method === "get"
                ? { rows: rows[0]?.values ?? [] }
                : { rows: rows.map((r) => r.values) };
        } catch (err) {
            console.error("[auth] DB query failed:", sql, "params:", JSON.stringify(params), "error:", err);
            throw err;
        }
    },
    { schema },
);

export type DatabaseType = typeof db;
```

**Key design decisions:**
- `method` is passed in the IPC payload so Rust can use `execute()` for `"run"` and `fetch_all()` for reads
- `method === "get"` with empty results returns `{}` — workaround for a Drizzle ORM bug where `{ rows: [] }` causes incorrect type inference
- `method === "get"` with results uses `rows[0]?.values ?? []` for null safety
- `method === "all"` returns all rows' values
- The `method === "run"` case is handled by Rust returning an empty `Vec` after `execute()`

### 4.2 Rust Proxy Engine (`src-tauri/src/drizzle_proxy.rs`)

```rust
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{
    query::Query,
    sqlite::SqliteArguments,
    Column, Row, Sqlite, SqlitePool,
};
use tauri::{command, AppHandle, State};
use tokio::fs;

use crate::db_utils;

pub struct AppState {
    pub db_pool: SqlitePool,
}

const MIGRATIONS: &[(&str, &str)] = &[(
    "0000_certain_mole_man",
    include_str!("../../drizzle/0000_certain_mole_man.sql"),
)];

#[derive(Debug, Deserialize)]
pub struct SqlQuery {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
    pub method: String,
}

#[derive(Debug, Serialize)]
pub struct SqlRow {
    pub columns: Vec<String>,
    pub values: Vec<serde_json::Value>,
}

pub async fn init_db(app: &AppHandle) -> Result<SqlitePool, String> {
    let db_path = db_utils::get_app_db_path(app)?;
    let uri = format!("sqlite:{}?mode=rwc", db_path.display());
    let pool = SqlitePool::connect(&uri)
        .await
        .map_err(|e| format!("Failed to connect to DB: {}", e))?;

    run_migrations(&pool).await?;
    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), String> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL
        )",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to create migration tracking table: {}", e))?;

    for (name, sql) in MIGRATIONS {
        let applied: bool = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM __drizzle_migrations WHERE hash = $1",
        )
        .bind(name)
        .fetch_one(pool)
        .await
        .map(|c| c > 0)
        .unwrap_or(false);

        if applied {
            continue;
        }

        let mut tx = pool
            .begin()
            .await
            .map_err(|e| format!("Failed to begin migration transaction: {}", e))?;

        for statement in sql.split("--> statement-breakpoint") {
            let stmt = statement.trim();
            if !stmt.is_empty() {
                sqlx::query(stmt)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Migration {} failed: {}", name, e))?;
            }
        }

        sqlx::query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ($1, $2)")
            .bind(name)
            .bind(chrono_now_ms())
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to record migration {}: {}", name, e))?;

        tx.commit()
            .await
            .map_err(|e| format!("Failed to commit migration {}: {}", name, e))?;
    }

    Ok(())
}

fn chrono_now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[command]
pub async fn run_sql(
    query: SqlQuery,
    state: State<'_, AppState>,
) -> Result<Vec<SqlRow>, String> {
    let pool = &state.db_pool;

    let mut q = sqlx::query(&query.sql);
    for param in &query.params {
        q = bind_value(q, param);
    }

    if query.method == "run" {
        q.execute(pool)
            .await
            .map_err(|e| format!("Query failed: {}", e))?;
        return Ok(vec![]);
    }

    let rows = q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Query failed: {}", e))?;

    let result: Vec<SqlRow> = rows
        .iter()
        .map(|row| {
            let columns = row
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect::<Vec<_>>();

            let values = (0..row.len())
                .map(|i| match row.try_get_raw(i) {
                    Ok(_) => db_utils::sqlx_value_to_json(row, i),
                    Err(_) => Value::Null,
                })
                .collect::<Vec<_>>();

            SqlRow { columns, values }
        })
        .collect();

    Ok(result)
}

#[derive(Debug, Deserialize)]
pub struct SqlStatement {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct BatchResult {
    pub last_insert_id: i64,
    pub rows_affected: u64,
}

#[command]
pub async fn run_sql_batch(
    statements: Vec<SqlStatement>,
    state: State<'_, AppState>,
) -> Result<BatchResult, String> {
    let pool = &state.db_pool;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let mut last_insert_id: i64 = 0;
    let mut total_rows_affected: u64 = 0;

    for stmt in &statements {
        let mut q = sqlx::query(&stmt.sql);
        for param in &stmt.params {
            q = bind_value(q, param);
        }
        let result = q
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Batch statement failed: {}", e))?;
        last_insert_id = result.last_insert_rowid();
        total_rows_affected += result.rows_affected();
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(BatchResult {
        last_insert_id,
        rows_affected: total_rows_affected,
    })
}

fn format_file_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

#[derive(Debug, Serialize)]
pub struct DbInfo {
    pub db_path: String,
    pub size_bytes: u64,
    pub size_formatted: String,
}

#[command]
pub async fn get_db_info(app: AppHandle) -> Result<DbInfo, String> {
    let db_path = db_utils::get_app_db_path(&app)?;
    let metadata = fs::metadata(&db_path)
        .await
        .map_err(|e| format!("Failed to get DB file info: {}", e))?;
    let size = metadata.len();
    let size_formatted = format_file_size(size);
    Ok(DbInfo {
        db_path: db_path.display().to_string(),
        size_bytes: size,
        size_formatted,
    })
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
```

### 4.2b Shared Utilities (`src-tauri/src/db_utils.rs`)

Extracted from `drizzle_proxy.rs` to eliminate duplication with `sync.rs`.

```rust
use base64::engine::general_purpose;
use base64::Engine;
use serde_json::Value;
use sqlx::sqlite::SqliteRow;
use sqlx::{Column, Row, TypeInfo};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub fn get_app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("sakti-pos.db"))
        .map_err(|_| "Could not resolve app config directory".to_string())
}

pub fn sqlx_value_to_json(row: &SqliteRow, index: usize) -> Value {
    let column = row.column(index);
    let type_name = column.type_info().name();

    match type_name {
        "INTEGER" => {
            if let Ok(v) = row.try_get::<i64, _>(index) {
                Value::from(v)
            } else if let Ok(v) = row.try_get::<f64, _>(index) {
                Value::from(v)
            } else if let Ok(v) = row.try_get::<String, _>(index) {
                Value::String(v)
            } else {
                Value::Null
            }
        }
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
        _ => {
            if let Ok(v) = row.try_get::<i64, _>(index) {
                Value::from(v)
            } else if let Ok(v) = row.try_get::<f64, _>(index) {
                Value::from(v)
            } else if let Ok(v) = row.try_get::<String, _>(index) {
                Value::String(v)
            } else {
                Value::Null
            }
        }
    }
}
```

### 4.3 Rust App Entry (`src-tauri/src/lib.rs`)

```rust
mod db_utils;
mod drizzle_proxy;
mod sync;

use argon2::{hash_raw, Config, Variant, Version};
use tauri::Manager;
use tauri_plugin_stronghold::Builder;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match drizzle_proxy::init_db(&handle).await {
                    Ok(pool) => {
                        handle.manage(drizzle_proxy::AppState { db_pool: pool });
                    }
                    Err(e) => {
                        eprintln!("CRITICAL: Failed to initialize database: {}", e);
                    }
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(Builder::new(|password| {
            let config = Config {
                lanes: 4,
                mem_cost: 10_000,
                time_cost: 2,
                variant: Variant::Argon2id,
                version: Version::Version13,
                ..Default::default()
            };
            let salt = b"sakti-pos-secure-salt-2026";
            let key = hash_raw(password.as_bytes(), salt, &config)
                .expect("failed to hash password");
            key.to_vec()
        })
        .build())
        .invoke_handler(tauri::generate_handler![
            drizzle_proxy::run_sql,
            drizzle_proxy::run_sql_batch,
            drizzle_proxy::get_db_info,
            sync::sync_push,
            sync::sync_pull,
            sync::run_garbage_collection,
            sync::sync_now
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Key design decisions:**
- DB initialization + migrations run in `.setup()` via `tauri::async_runtime::block_on()`, guaranteeing the schema is ready before any command is invoked
- `AppState { db_pool }` is injected via `app.manage()`, making it available as `State<'_, AppState>` in all commands
- If DB init fails, the error is logged but the app continues (commands will fail with a missing state error)

### 4.4 Rust Dependencies (`src-tauri/Cargo.toml`)

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tauri-plugin-stronghold = "2"
sqlx = { version = "0.8.6", features = ["sqlite", "runtime-tokio"] }
base64 = "0.22.1"
reqwest = { version = "0.12", features = ["rustls-tls", "json"], default-features = false }
urlencoding = "2"
rust-argon2 = "3"
tokio = { version = "1", features = ["fs"] }
```

**Notable:** `tauri-plugin-sql` is completely removed. `tokio` with `fs` feature was added for async file metadata in `get_db_info`.

### 4.5 Database Schema (`packages/database/src/local-schema.ts`)

10 tables defined using Drizzle's `sqliteTable`:

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `merchants` | Business/tenant records | `id` (UUID v7 PK), `name` |
| `outlets` | Physical store locations | `id`, `merchant_id`, `name`, `address`, `is_active` |
| `registers` | POS terminal devices | `id`, `outlet_id`, `name`, `short_id`, `pairing_code` |
| `staff` | Employee accounts with PIN auth | `id`, `merchant_id`, `name`, `pin` (bcrypt hash), `role` |
| `sync_meta` | Sync timestamps per table/outlet | `table_name`, `outlet_id`, `last_sync_at` |
| `categories` | Product categories | `id`, `merchant_id`, `name`, `sort_order`, `deleted_at` |
| `products` | Product catalog | `id`, `merchant_id`, `category_id`, `name`, `price` |
| `outlet_products` | Per-outlet product overrides | `id`, `outlet_id`, `product_id`, `price`, `is_available` |
| `orders` | Sales orders | `id`, `outlet_id`, `staff_id`, `order_number` (unique), `total`, `payment_method`, `status` |
| `order_items` | Line items within orders | `id`, `order_id`, `product_name`, `quantity`, `unit_price`, `subtotal` |

**Design patterns across all tables:**
- **UUID v7 primary keys** via `.$defaultFn(() => uuidv7())` — time-sortable
- **ISO text timestamps** for `createdAt`/`updatedAt` — stored as `text`, not native datetime
- **Soft deletes** via nullable `deletedAt: text("deleted_at")`
- **Sync flags** via `isSynced: integer("is_synced", { mode: "boolean" }).default(false)`
- **No foreign key constraints** — intentional for offline-first sync (avoids constraint violations during partial syncs)
- **Multi-tenancy** via `merchantId` on most tables

### 4.6 Migration SQL (`drizzle/0000_certain_mole_man.sql`)

Generated by `drizzle-kit generate`. Contains `CREATE TABLE` for all 10 tables plus one unique index. Statements separated by `--> statement-breakpoint` markers which the migration runner splits on.

### 4.7 Drizzle Config (`drizzle.config.ts`)

```typescript
import { defineConfig } from "drizzle-kit";
export default defineConfig({
    dialect: "sqlite",
    schema: "../../packages/database/src/local-schema.ts",
    out: "./drizzle",
});
```

---

## 5. Tauri Commands Exposed

| Command | Input | Output | Purpose |
|---------|-------|--------|---------|
| `run_sql` | `{ sql, params, method }` | `Vec<SqlRow>` (reads) or `[]` (writes) | Method-aware query: `"run"` → `execute()`, else → `fetch_all()` |
| `run_sql_batch` | `Vec<{ sql, params }>` | `{ last_insert_id: i64, rows_affected: u64 }` | Atomic multi-statement transaction |
| `get_db_info` | (none) | `{ db_path, size_bytes, size_formatted }` | DB file metadata for settings UI (async `tokio::fs`) |
| `sync_push` | `{ outlet_id, api_url, session_token }` | `{ tables_synced, server_wins_count, server_time }` | Push unsynced local rows to cloud |
| `sync_pull` | `{ outlet_id, api_url, session_token }` | `{ rows_received, server_time }` | Pull changed rows from cloud |
| `run_garbage_collection` | `{ outlet_id }` | `usize` (purged count) | Delete soft-deleted rows that are synced |
| `sync_now` | `{ outlet_id, api_url, session_token }` | `{ pull, push, purged }` | Full sync cycle: pull → push → GC |

---

## 6. Query Patterns (TypeScript Side)

All query modules import `db` from `./index` and use standard Drizzle query builder syntax. The proxy is transparent.

### 6.1 Simple SELECT with filtering
```typescript
// src/db/staff.ts
const [row] = await db.select().from(staff).where(eq(staff.id, id));
```

### 6.2 INSERT with .returning()
```typescript
const [row] = await db.insert(staff).values(data).returning();
```

### 6.3 UPDATE with soft delete
```typescript
await db.update(categories)
    .set({ deletedAt: now, updatedAt: now, isSynced: false })
    .where(eq(categories.id, id));
```

### 6.4 JOINs
```typescript
// src/db/orders.ts — orders joined with staff
const rows = await db.select({
    id: orders.id,
    staffName: staff.name,
    total: orders.total,
    // ...
})
.from(orders)
.innerJoin(staff, eq(orders.staffId, staff.id))
.where(and(...conditions))
.orderBy(desc(orders.createdAt));
```

### 6.5 Aggregations with raw SQL
```typescript
// src/db/dashboard.ts
const rows = await db.select({
    orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
    totalRevenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
})
.from(orders)
.where(and(...conditions));
```

### 6.6 Raw SQL batch with params (bypasses Drizzle)
```typescript
// src/db/orders.ts — createOrder uses invoke("run_sql_batch") directly
const insertOrder: SqlStatement = {
    sql: `INSERT INTO orders (...) VALUES (?, ?, ?, ...)` ,
    params: [orderNumber, data.staffId, registerId, ...],
};

const itemStatements: SqlStatement[] = data.items.map((item) => ({
    sql: "INSERT INTO order_items (...) VALUES (LAST_INSERT_ROWID(), ?, ...)",
    params: [outletId, item.product_id, item.product_name, ...],
}));

await invoke<BatchResult>("run_sql_batch", {
    statements: [insertOrder, ...itemStatements],
});
```

This is the **only** place in the codebase that bypasses Drizzle's query builder and uses raw SQL via `invoke("run_sql_batch")`. It uses SQLite's `LAST_INSERT_ROWID()` to atomically link order items to the parent order.

---

## 7. Connection Pool Management

```
Tauri managed state: AppState { db_pool: SqlitePool }
```

- **Eager initialization:** Pool created in `lib.rs` `.setup()` before any commands can run, via `tauri::async_runtime::block_on()`
- **Shared state:** `AppState` is injected via `app.manage()` and accessed as `State<'_, AppState>` in all Tauri commands
- **Single pool:** Both `drizzle_proxy.rs` and `sync.rs` share the same `SqlitePool` — no duplicated connections
- **Migration on init:** `run_migrations()` runs inside `init_db()` before the pool is stored, guaranteeing all subsequent queries see the full schema
- **DB path:** `{app_config_dir}/sakti-pos.db` with `?mode=rwc` (read-write-create)
- **No Mutex needed:** Tauri's managed state is immutable after setup — no poisoning risk

---

## 8. Migration System

### How it works

1. During `lib.rs` `.setup()`, `init_db()` → `run_migrations()` executes
2. Creates `__drizzle_migrations` tracking table if not exists:
    ```sql
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    )
    ```
3. Iterates over the `MIGRATIONS` const array
4. For each migration, checks if its name already exists in `__drizzle_migrations`
5. If not applied: opens a transaction (`BEGIN`), splits SQL by `--> statement-breakpoint`, executes each statement, records the migration, commits (`COMMIT`)
6. If already applied: skips
7. **Transactional guarantee:** Each migration runs in its own transaction. If any statement fails, the transaction rolls back — no partial state

### Adding a new migration

```rust
const MIGRATIONS: &[(&str, &str)] = &[
    ("0000_certain_mole_man", include_str!("../../drizzle/0000_certain_mole_man.sql")),
    ("0001_add_new_column", include_str!("../../drizzle/0001_add_new_column.sql")),  // add this line
];
```

### Migration SQL generation

Run `npx drizzle-kit generate` after modifying the schema in `packages/database/src/local-schema.ts`. This creates a new numbered `.sql` file in `apps/pos-app/drizzle/`.

---

## 9. Type Conversion (Rust ↔ TypeScript)

### JSON → SQLite (`bind_value`)

| TypeScript (JSON) | Rust `serde_json::Value` | SQLite (sqlx) |
|-------------------|--------------------------|---------------|
| `null` | `Value::Null` | `None::<String>` |
| `true`/`false` | `Value::Bool(b)` | `bool` → stored as 0/1 |
| `42` | `Value::Number` (i64) | `i64` |
| `3.14` | `Value::Number` (f64) | `f64` |
| `"hello"` | `Value::String(s)` | `&str` |
| Arrays/Objects | `_` (fallthrough) | **Silently ignored** (not bound) |

### SQLite → JSON (`sqlx_value_to_json`)

| SQLite Type | Rust Type | JSON Type |
|-------------|-----------|-----------|
| `INTEGER` | `i64` → fallback `f64` → fallback `String` | `number` → fallback `string` |
| `REAL` | `f64` | `number` |
| `TEXT` | `String` | `string` |
| `BLOB` | `Vec<u8>` → base64 encoded | `string` (base64) |
| Unknown | `i64` → `f64` → `String` → `null` | best-effort |

**Notable:** BLOB values are base64-encoded because JSON has no binary type. The INTEGER fallback chain handles edge cases where SQLite stores text in an INTEGER column.

---

## 10. Sync System (`sync.rs`)

The sync system bypasses Drizzle ORM entirely — it uses `sqlx` directly in Rust with the shared `AppState.db_pool` to read/write the same SQLite database. This avoids Drizzle overhead for bulk operations.

### Sync flow

```
1. sync_now() called from frontend — receives State<'_, AppState>
2. sync_pull_inner(pool, ...):
    - GET /api/sync/pull?outletId=X&tables=...&since=Y
    - Upsert received rows using INSERT ... ON CONFLICT(id) DO UPDATE
    - Update sync_meta timestamps
3. sync_push_inner(pool, ...):
    - SELECT * FROM each table WHERE is_synced = 0
    - POST /api/sync/push with { outletId, tables: { table_name: [rows] } }
    - Mark all pushed rows as is_synced = 1
4. GC logic inlined in sync_now():
    - DELETE FROM each table WHERE deleted_at IS NOT NULL AND is_synced = 1
```

### Synced tables

`categories`, `products`, `orders`, `order_items`, `outlet_products`, `staff`, `merchants`, `outlets`, `registers`

### Conflict resolution

Uses `INSERT INTO ... ON CONFLICT(id) DO UPDATE SET ...` (upsert). Non-id columns are updated from the server value. This is a "server wins" strategy — the server's version of a row always overwrites the local version on pull.

---

## 11. Auth System

PIN-based authentication for staff:

1. Frontend calls `db.select().from(staff).where(eq(staff.id, staffId))` to fetch the staff record
2. PIN hash is stored in the `staff.pin` column (bcrypt, generated client-side via `bcryptjs`)
3. `bcrypt.compare(pin, row.pin)` verifies the PIN client-side
4. PIN changes: `db.update(staff).set({ pin: hashed })`

---

## 12. Identified Concerns & Resolved Issues

### 12.1 ~~Duplicated `sqlx_value_to_json` function~~ — RESOLVED

Extracted to `db_utils.rs`. Both `drizzle_proxy.rs` and `sync.rs` now import from `crate::db_utils`.

### 12.2 ~~Duplicated `get_pool` function~~ — RESOLVED

Replaced entirely. Both modules now receive `State<'_, AppState>` containing a single shared `SqlitePool` initialized eagerly in `lib.rs` `.setup()`.

### 12.3 ~~`std::sync::Mutex` poisoning~~ — RESOLVED

Eliminated. The `static DB_POOL: Mutex<Option<SqlitePool>>` is gone. Tauri managed state (`AppState`) is immutable after setup — no Mutex, no poisoning risk.

### 12.4 ~~Migration not run in transaction~~ — RESOLVED

Each migration now runs inside `pool.begin()` / `tx.commit()`. If any statement fails, the transaction rolls back — no partial migration state.

### 12.5 `bind_value` silently ignores Arrays and Objects

The fallthrough `_` arm in `bind_value` does not bind the value — it returns the query unchanged. This means if Drizzle ever passes an array or object as a parameter, it will silently be dropped. This hasn't been observed in practice but is a latent bug.

**Note:** `sync.rs` `upsert_row()` handles `Array`/`Object` by serializing them to JSON strings, but `bind_value` in `drizzle_proxy.rs` does not.

### 12.6 ~~`run_sql` uses `fetch_all` for all queries~~ — RESOLVED

`run_sql` now checks `query.method == "run"` and calls `.execute()` for write operations, returning an empty `Vec<SqlRow>`. Read operations continue using `.fetch_all()`.

### 12.7 No connection pool cleanup

The `SqlitePool` is never explicitly closed. It relies on `Drop` when the process exits. This is fine for a desktop/mobile app but could cause issues if the DB file needs to be moved or backed up while the app is running.

### 12.8 ~~`sync.rs` creates a new pool per sync call~~ — RESOLVED

`sync.rs` now receives `State<'_, AppState>` and uses the shared `db_pool`. No more per-call pool creation.

### 12.9 Error type is `String` everywhere

All Rust commands return `Result<T, String>`. This loses structured error information. A proper error enum with `thiserror` + `Serialize` (like `tauri-plugin-libsql` does) would improve error handling and debuggability.

### 12.10 ~~`get_db_info` reads file metadata synchronously~~ — RESOLVED

Replaced `std::fs::metadata()` with `tokio::fs::metadata()`. The function is now fully async and won't block the tokio runtime.

### 12.11 `sync_now` inlines GC logic instead of calling `run_garbage_collection`

`sync_now` duplicates the GC delete loop instead of calling the `run_garbage_collection` command. This is because Tauri commands can't pass `State` to other commands. The duplication is minor but should be extracted to a shared helper function.

---

## 13. Dependencies Summary

### Rust (Cargo.toml)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | 2 | App framework |
| `tauri-plugin-opener` | 2 | Open URLs/files |
| `tauri-plugin-stronghold` | 2 | Encrypted key storage |
| `sqlx` | 0.8.6 | SQLite driver + connection pool |
| `serde` + `serde_json` | 1 | JSON serialization for IPC |
| `base64` | 0.22.1 | BLOB encoding |
| `reqwest` | 0.12 | HTTP client for sync |
| `urlencoding` | 2 | URL encoding for sync API |
| `rust-argon2` | 3 | Argon2id key derivation for Stronghold |
| `tokio` | 1 (features: `fs`) | Async file system ops (`get_db_info`) |

### TypeScript (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| `drizzle-orm` | ^0.45.2 | ORM with sqlite-proxy driver |
| `drizzle-kit` | ^0.31.10 | Migration generation CLI |
| `@tauri-apps/api` | ^2 | Tauri IPC (`invoke`) |
| `bcryptjs` | ^3.0.3 | Client-side PIN hashing |
| `dayjs` | ^1.11.20 | Date formatting |
| `uuid` | (via `@repo/database`) | UUID v7 generation |

**Notable absences:**
- `@tauri-apps/plugin-sql` — **removed**. Was the original DB access layer, replaced by the custom proxy. Also removed from `tauri.conf.json` (`plugins.sql`) and `capabilities/default.json` (`sql:*` permissions).
- Any SQLite WASM library — all DB operations go through Rust IPC.
