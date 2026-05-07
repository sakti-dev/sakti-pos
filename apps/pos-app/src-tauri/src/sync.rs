use base64::engine::general_purpose;
use base64::Engine;
use serde_json::Value;
use sqlx::{Column, Row, SqlitePool, TypeInfo};
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager};

const SYNC_TABLES: &[&str] = &[
    "categories",
    "products",
    "orders",
    "order_items",
    "outlet_products",
    "staff",
    "merchants",
    "outlets",
    "registers",
];

fn build_client(session_cookie: &str) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::COOKIE,
        reqwest::header::HeaderValue::from_str(session_cookie)
            .map_err(|e| format!("Invalid cookie: {}", e))?,
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

fn get_app_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|p| p.join("sakti-pos.db"))
        .map_err(|_| "Could not resolve app config directory".to_string())
}

async fn get_pool(app: &AppHandle) -> Result<SqlitePool, String> {
    let db_path = get_app_db_path(app)?;
    let uri = format!("sqlite:{}?mode=rwc", db_path.display());
    SqlitePool::connect(&uri)
        .await
        .map_err(|e| format!("Failed to connect to DB: {}", e))
}

fn get_table_filter_column(table: &str) -> &'static str {
    match table {
        "merchants" | "categories" | "products" | "staff" => "merchant_id",
        _ => "outlet_id",
    }
}

async fn read_unsynced_rows(
    pool: &SqlitePool,
    table: &str,
    outlet_id: &str,
) -> Result<Vec<Value>, String> {
    let filter_col = get_table_filter_column(table);
    let query = format!(
        "SELECT * FROM {} WHERE {} = ?1 AND is_synced = 0",
        table, filter_col
    );
    let rows = sqlx::query(&query)
        .bind(outlet_id)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to read unsynced rows for {}: {}", table, e))?;

    let mut result = Vec::new();
    for row in &rows {
        let mut obj = serde_json::Map::new();
        for (idx, col) in row.columns().iter().enumerate() {
            let name = col.name().to_string();
            let val = match row.try_get_raw(idx) {
                Ok(_) => sqlx_value_to_json(row, idx),
                Err(_) => Value::Null,
            };
            obj.insert(name, val);
        }
        result.push(Value::Object(obj));
    }
    Ok(result)
}

fn sqlx_value_to_json(row: &sqlx::sqlite::SqliteRow, index: usize) -> Value {
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

async fn mark_table_synced(
    pool: &SqlitePool,
    table: &str,
    outlet_id: &str,
) -> Result<(), String> {
    let filter_col = get_table_filter_column(table);
    let query = format!(
        "UPDATE {} SET is_synced = 1 WHERE {} = ?1 AND is_synced = 0",
        table, filter_col
    );
    sqlx::query(&query)
        .bind(outlet_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to mark {} as synced: {}", table, e))?;
    Ok(())
}

async fn get_last_sync_at(
    pool: &SqlitePool,
    table: &str,
    outlet_id: &str,
) -> Result<Option<String>, String> {
    let query =
        "SELECT last_sync_at FROM sync_meta WHERE table_name = ?1 AND outlet_id = ?2";
    let row: Option<(String,)> = sqlx::query_as(query)
        .bind(table)
        .bind(outlet_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get last sync at: {}", e))?;
    Ok(row.map(|r| r.0))
}

async fn set_last_sync_at(
    pool: &SqlitePool,
    table: &str,
    outlet_id: &str,
    time: &str,
) -> Result<(), String> {
    let existing = get_last_sync_at(pool, table, outlet_id).await?;
    if existing.is_some() {
        let query =
            "UPDATE sync_meta SET last_sync_at = ?3 WHERE table_name = ?1 AND outlet_id = ?2";
        sqlx::query(query)
            .bind(table)
            .bind(outlet_id)
            .bind(time)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to update last sync at: {}", e))?;
    } else {
        let query =
            "INSERT INTO sync_meta (table_name, outlet_id, last_sync_at) VALUES (?1, ?2, ?3)";
        sqlx::query(query)
            .bind(table)
            .bind(outlet_id)
            .bind(time)
            .execute(pool)
            .await
            .map_err(|e| format!("Failed to insert last sync at: {}", e))?;
    }
    Ok(())
}

async fn upsert_row(
    pool: &SqlitePool,
    table: &str,
    row: &Value,
) -> Result<(), String> {
    let obj = row
        .as_object()
        .ok_or_else(|| format!("Row for {} is not a JSON object", table))?;

    let local_obj = obj.clone();

    let columns: Vec<String> = local_obj.keys().cloned().collect();
    if columns.is_empty() {
        return Ok(());
    }

    let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();

    let set_clause: Vec<String> = columns
        .iter()
        .filter(|c| *c != "id")
        .map(|c| format!("{} = excluded.{}", c, c))
        .collect();

    let query = if set_clause.is_empty() {
        format!(
            "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
            table,
            columns.join(", "),
            placeholders.join(", ")
        )
    } else {
        format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {}",
            table,
            columns.join(", "),
            placeholders.join(", "),
            set_clause.join(", ")
        )
    };

    let mut q = sqlx::query(&query);
    for col in &columns {
        let val = &local_obj[col];
        match val {
            Value::Null => q = q.bind(None::<String>),
            Value::Bool(b) => q = q.bind(*b),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q = q.bind(i);
                } else if let Some(f) = n.as_f64() {
                    q = q.bind(f);
                } else {
                    q = q.bind::<Option<i64>>(None);
                }
            }
            Value::String(s) => q = q.bind(s.clone()),
            Value::Array(_) | Value::Object(_) => {
                q = q.bind(serde_json::to_string(val).unwrap_or_default())
            }
        }
    }

    q.execute(pool)
        .await
        .map_err(|e| format!("Failed to upsert into {}: {}", table, e))?;
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct PushResult {
    tables_synced: Vec<String>,
    server_wins_count: usize,
    server_time: String,
}

async fn sync_push_inner(
    pool: &SqlitePool,
    outlet_id: &str,
    api_url: &str,
    session_cookie: &str,
) -> Result<PushResult, String> {
    let client = build_client(session_cookie)?;

    let mut tables_json = serde_json::Map::new();
    for table in SYNC_TABLES {
        let rows = read_unsynced_rows(pool, table, outlet_id).await?;
        tables_json.insert(table.to_string(), Value::Array(rows));
    }

    let body = serde_json::json!({
        "outletId": outlet_id,
        "tables": tables_json
    });

    let response = client
        .post(format!("{}/api/sync/push", api_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Sync push failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Sync push failed ({}): {}", status, text));
    }

    let result: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse push response: {}", e))?;

    for table in SYNC_TABLES {
        mark_table_synced(pool, table, outlet_id).await?;
    }

    let server_wins_count = result
        .get("serverWins")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let server_time = result
        .get("serverTime")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(PushResult {
        tables_synced: SYNC_TABLES.iter().map(|t| t.to_string()).collect(),
        server_wins_count,
        server_time,
    })
}

#[command]
pub async fn sync_push(
    app: AppHandle,
    outlet_id: String,
    api_url: String,
    session_cookie: String,
) -> Result<PushResult, String> {
    let pool = get_pool(&app).await?;
    sync_push_inner(&pool, &outlet_id, &api_url, &session_cookie).await
}

#[derive(Debug, serde::Serialize)]
pub struct PullResult {
    rows_received: usize,
    server_time: String,
}

async fn sync_pull_inner(
    pool: &SqlitePool,
    outlet_id: &str,
    api_url: &str,
    session_cookie: &str,
) -> Result<PullResult, String> {
    let client = build_client(session_cookie)?;

    let since = get_last_sync_at(pool, "orders", outlet_id)
        .await
        .unwrap_or(None)
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string());

    let tables = SYNC_TABLES.join(",");
    let url = format!(
        "{}/api/sync/pull?outletId={}&tables={}&since={}",
        api_url,
        outlet_id,
        tables,
        urlencoding::encode(&since)
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Sync pull failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Sync pull failed ({}): {}", status, text));
    }

    let result: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse pull response: {}", e))?;

    let mut total_rows = 0;

    for table in SYNC_TABLES {
        if let Some(rows) = result.get(table).and_then(|v| v.as_array()) {
            for row in rows {
                upsert_row(pool, table, row).await?;
                total_rows += 1;
            }
        }
    }

    let server_time = result
        .get("serverTime")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    for table in SYNC_TABLES {
        set_last_sync_at(pool, table, outlet_id, server_time).await?;
    }

    Ok(PullResult {
        rows_received: total_rows,
        server_time: server_time.to_string(),
    })
}

#[command]
pub async fn sync_pull(
    app: AppHandle,
    outlet_id: String,
    api_url: String,
    session_cookie: String,
) -> Result<PullResult, String> {
    let pool = get_pool(&app).await?;
    sync_pull_inner(&pool, &outlet_id, &api_url, &session_cookie).await
}

#[command]
pub async fn run_garbage_collection(
    app: AppHandle,
    outlet_id: String,
) -> Result<usize, String> {
    let pool = get_pool(&app).await?;
    let mut total_purged: usize = 0;

    for table in SYNC_TABLES {
        let filter_col = get_table_filter_column(table);
        let query = format!(
            "DELETE FROM {} WHERE {} = ?1 AND deleted_at IS NOT NULL AND is_synced = 1",
            table, filter_col
        );
        let result = sqlx::query(&query)
            .bind(&outlet_id)
            .execute(&pool)
            .await
            .map_err(|e| format!("GC failed for {}: {}", table, e))?;
        total_purged += result.rows_affected() as usize;
    }

    Ok(total_purged)
}

#[derive(Debug, serde::Serialize)]
pub struct SyncNowResult {
    pull: PullResult,
    push: PushResult,
    purged: usize,
}

#[command]
pub async fn sync_now(
    app: AppHandle,
    outlet_id: String,
    api_url: String,
    session_cookie: String,
) -> Result<SyncNowResult, String> {
    let pool = get_pool(&app).await?;
    let pull = sync_pull_inner(&pool, &outlet_id, &api_url, &session_cookie).await?;
    let push = sync_push_inner(&pool, &outlet_id, &api_url, &session_cookie).await?;
    let purged = run_garbage_collection(app, outlet_id).await?;
    Ok(SyncNowResult { pull, push, purged })
}
