use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{
    query::Query,
    sqlite::{
        SqliteArguments, SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions,
        SqliteSynchronous,
    },
    Column, Row, Sqlite, SqlitePool,
};
use std::str::FromStr;
use std::time::Duration;
use tauri::{command, AppHandle, State};
use tokio::fs;

use crate::app::state::AppState;
use crate::db::sqlite;
include!(concat!(env!("OUT_DIR"), "/drizzle_migrations.rs"));

const SQLITE_POOL_MAX_CONNECTIONS: u32 = 1;

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
    let db_path = sqlite::get_app_db_path(app)?;

    let options = SqliteConnectOptions::from_str(&format!("sqlite:{}", db_path.display()))
        .map_err(|e| format!("Invalid DB URI: {}", e))?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5))
        .pragma("foreign_keys", "ON");

    let pool = SqlitePoolOptions::new()
        // Drizzle sqlite-proxy transaction commands must stay on one SQLite
        // connection or BEGIN/COMMIT/ROLLBACK can land on different sessions.
        .max_connections(SQLITE_POOL_MAX_CONNECTIONS)
        .acquire_timeout(Duration::from_secs(3))
        .connect_with(options)
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

    for migration in MIGRATIONS {
        let name = migration.name;
        let sql = migration.sql;
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
                if let Err(e) = sqlx::query(stmt).execute(&mut *tx).await {
                    let msg = e.to_string();
                    if msg.contains("already exists") || msg.contains("duplicate column") {
                        crate::pos_log!(
                            info,
                            "DB",
                            "MIGRATION:SKIP",
                            "Migration statement skipped",
                            "reason" => msg
                        );
                    } else {
                        return Err(format!("Migration {} failed: {}", name, e));
                    }
                }
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
pub async fn run_sql(query: SqlQuery, state: State<'_, AppState>) -> Result<Vec<SqlRow>, String> {
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
                    Ok(_) => sqlite::sqlx_value_to_json(row, i),
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
    let db_path = sqlite::get_app_db_path(&app)?;
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

#[cfg(test)]
mod tests {
    use super::SQLITE_POOL_MAX_CONNECTIONS;

    #[test]
    fn sqlite_proxy_uses_a_single_connection() {
        assert_eq!(SQLITE_POOL_MAX_CONNECTIONS, 1);
    }
}
