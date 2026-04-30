use base64::engine::general_purpose;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{
    query::Query,
    sqlite::{SqliteArguments, SqliteRow},
    Column, Row, Sqlite, SqlitePool, TypeInfo,
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
                    Ok(_) => sqlx_value_to_json(row, i),
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
    app: AppHandle,
    statements: Vec<SqlStatement>,
) -> Result<BatchResult, String> {
    let db_path = get_app_db_path(&app)?;
    let uri = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePool::connect(&uri)
        .await
        .map_err(|e| format!("Failed to connect to DB: {}", e))?;

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

fn get_app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("sakti-pos.db"))
        .map_err(|_| "Could not resolve app config directory".to_string())
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
