use prost::Message;
use serde_json::Value;
use sqlx::{Column, Row, SqliteConnection, SqlitePool};
use tauri::{command, State};

use crate::db_utils;
use crate::drizzle_proxy::AppState;

#[allow(dead_code)]
mod sync_proto {
    include!(concat!(env!("OUT_DIR"), "/sakti.sync.v1.rs"));
}

use sync_proto::{
    SyncPullEventsRequest, SyncPullEventsResponse, SyncPullRequest, SyncPullResponse,
    SyncPushRequest, SyncPushResponse, SyncServerWin, SyncTableRows,
};

const SYNC_TABLES: &[&str] = &[
    "merchants",
    "outlets",
    "registers",
    "categories",
    "products",
    "orders",
    "order_items",
    "outlet_products",
    "staff",
];

const LOCAL_ONLY_COLUMNS: &[&str] = &["is_synced"];

fn build_client(session_token: &str) -> Result<reqwest::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::AUTHORIZATION,
        reqwest::header::HeaderValue::from_str(&format!("Bearer {}", session_token))
            .map_err(|e| format!("Invalid token: {}", e))?,
    );
    reqwest::Client::builder()
        .default_headers(headers)
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

fn get_table_filter_column(table: &str) -> &'static str {
    match table {
        "merchants" => "id",
        "categories" | "products" | "staff" | "outlets" => "merchant_id",
        _ => "outlet_id",
    }
}

fn get_filter_value<'a>(
    table: &str,
    outlet_id: &'a str,
    merchant_id: &'a Option<String>,
) -> Result<&'a str, String> {
    match get_table_filter_column(table) {
        "merchant_id" => merchant_id
            .as_deref()
            .ok_or("Cannot push merchant-scoped table: merchant_id not resolved".to_string()),
        "id" => merchant_id
            .as_deref()
            .ok_or("Cannot push merchant-scoped table: merchant_id not resolved".to_string()),
        _ => Ok(outlet_id),
    }
}

async fn read_unsynced_rows(
    pool: &SqlitePool,
    table: &str,
    filter_value: &str,
) -> Result<Vec<Value>, String> {
    let filter_col = get_table_filter_column(table);
    let query = format!(
        "SELECT * FROM {} WHERE {} = ?1 AND (is_synced = 0 OR id IN (SELECT row_id FROM sync_outbox WHERE table_name = ?2 AND synced_at IS NULL))",
        table, filter_col
    );
    let rows = sqlx::query(&query)
        .bind(filter_value)
        .bind(table)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to read unsynced rows for {}: {}", table, e))?;

    let mut result = Vec::new();
    for row in &rows {
        let mut obj = serde_json::Map::new();
        for (idx, col) in row.columns().iter().enumerate() {
            let name = col.name().to_string();
            if LOCAL_ONLY_COLUMNS.contains(&name.as_str()) {
                continue;
            }
            let val = match row.try_get_raw(idx) {
                Ok(_) => db_utils::sqlx_value_to_json(row, idx),
                Err(_) => Value::Null,
            };
            obj.insert(snake_to_camel(&name), val);
        }
        result.push(Value::Object(obj));
    }
    Ok(result)
}

async fn mark_rows_synced_tx(
    conn: &mut SqliteConnection,
    table: &str,
    filter_col: &str,
    filter_value: &str,
    skip_ids: &std::collections::HashSet<String>,
) -> Result<(), String> {
    let query = format!(
        "UPDATE {} SET is_synced = 1 WHERE {} = ?1 AND is_synced = 0",
        table, filter_col
    );
    sqlx::query(&query)
        .bind(filter_value)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to mark {} as synced: {}", table, e))?;

    if !skip_ids.is_empty() {
        let unmark_query = format!(
            "UPDATE {} SET is_synced = 0 WHERE id IN ({})",
            table,
            skip_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",")
        );
        let mut q = sqlx::query(&unmark_query);
        for id in skip_ids {
            q = q.bind(id);
        }
        q.execute(&mut *conn)
            .await
            .map_err(|e| format!("Failed to unmark server-wins rows for {}: {}", table, e))?;
    }

    Ok(())
}

async fn get_last_sync_at(
    pool: &SqlitePool,
    table: &str,
    outlet_id: &str,
) -> Result<Option<String>, String> {
    let query = "SELECT last_sync_at FROM sync_meta WHERE table_name = ?1 AND outlet_id = ?2";
    let row: Option<(String,)> = sqlx::query_as(query)
        .bind(table)
        .bind(outlet_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get last sync at: {}", e))?;
    Ok(row.map(|r| r.0))
}

async fn resolve_merchant_id(pool: &SqlitePool, outlet_id: &str) -> Result<Option<String>, String> {
    let query = "SELECT merchant_id FROM outlets WHERE id = ?1";
    sqlx::query_scalar::<_, String>(query)
        .bind(outlet_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to resolve merchant_id: {}", e))
}

fn choose_pull_since(timestamps: Vec<Option<String>>) -> String {
    timestamps
        .into_iter()
        .flatten()
        .min()
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string())
}

async fn get_last_server_event_id(pool: &SqlitePool, outlet_id: &str) -> Result<i64, String> {
    let query = "SELECT last_server_event_id FROM sync_cursors WHERE scope_type = 'outlet' AND scope_id = ?1 ORDER BY updated_at DESC LIMIT 1";
    let value = sqlx::query_scalar::<_, i64>(query)
        .bind(outlet_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get sync cursor: {}", e))?;
    Ok(value.unwrap_or(0))
}

async fn set_last_server_event_id_tx(
    conn: &mut SqliteConnection,
    outlet_id: &str,
    last_server_event_id: i64,
) -> Result<(), String> {
    let now = current_time_millis_string();
    let existing = sqlx::query_scalar::<_, i64>(
        "SELECT last_server_event_id FROM sync_cursors WHERE scope_type = 'outlet' AND scope_id = ?1 LIMIT 1",
    )
    .bind(outlet_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| format!("Failed to read sync cursor: {}", e))?;

    if existing.is_some() {
        sqlx::query(
            "UPDATE sync_cursors SET last_server_event_id = ?2, updated_at = ?3 WHERE scope_type = 'outlet' AND scope_id = ?1",
        )
        .bind(outlet_id)
        .bind(last_server_event_id)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to update sync cursor: {}", e))?;
    } else {
        sqlx::query(
            "INSERT INTO sync_cursors (scope_type, scope_id, last_server_event_id, updated_at) VALUES ('outlet', ?1, ?2, ?3)",
        )
        .bind(outlet_id)
        .bind(last_server_event_id)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to insert sync cursor: {}", e))?;
    }
    Ok(())
}

fn current_time_millis_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

async fn count_pending_outbox(
    pool: &SqlitePool,
    outlet_id: &str,
    merchant_id: &Option<String>,
) -> Result<i64, String> {
    let Some(merchant_id) = merchant_id else {
        let query = "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL AND scope_type = 'outlet' AND scope_id = ?1";
        return sqlx::query_scalar::<_, i64>(query)
            .bind(outlet_id)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to count sync outbox: {}", e));
    };

    let query = "SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL AND ((scope_type = 'outlet' AND scope_id = ?1) OR (scope_type = 'merchant' AND scope_id = ?2))";
    sqlx::query_scalar::<_, i64>(query)
        .bind(outlet_id)
        .bind(merchant_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count sync outbox: {}", e))
}

async fn count_legacy_unsynced_rows(
    pool: &SqlitePool,
    outlet_id: &str,
    merchant_id: &Option<String>,
) -> Result<i64, String> {
    let mut total = 0;
    for table in SYNC_TABLES {
        let filter_value = get_filter_value(table, outlet_id, merchant_id)?;
        let filter_col = get_table_filter_column(table);
        let query = format!(
            "SELECT COUNT(*) FROM {} WHERE {} = ?1 AND is_synced = 0",
            table, filter_col
        );
        let count = sqlx::query_scalar::<_, i64>(&query)
            .bind(filter_value)
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to count unsynced rows for {}: {}", table, e))?;
        total += count;
    }
    Ok(total)
}

async fn mark_outbox_synced_tx(
    conn: &mut SqliteConnection,
    outlet_id: &str,
    merchant_id: &Option<String>,
    synced_at: &str,
) -> Result<u64, String> {
    let result = if let Some(merchant_id) = merchant_id {
        sqlx::query(
            "UPDATE sync_outbox SET synced_at = ?3 WHERE synced_at IS NULL AND ((scope_type = 'outlet' AND scope_id = ?1) OR (scope_type = 'merchant' AND scope_id = ?2))",
        )
        .bind(outlet_id)
        .bind(merchant_id)
        .bind(synced_at)
        .execute(&mut *conn)
        .await
    } else {
        sqlx::query(
            "UPDATE sync_outbox SET synced_at = ?2 WHERE synced_at IS NULL AND scope_type = 'outlet' AND scope_id = ?1",
        )
        .bind(outlet_id)
        .bind(synced_at)
        .execute(&mut *conn)
        .await
    }
    .map_err(|e| format!("Failed to mark sync outbox rows synced: {}", e))?;

    Ok(result.rows_affected())
}

#[derive(Debug, serde::Serialize)]
pub struct LocalSyncState {
    local_dirty_count: i64,
    last_server_event_id: i64,
    needs_baseline_sync: bool,
}

fn protobuf_tables_to_json_map(tables: Vec<SyncTableRows>) -> Result<Value, String> {
    let mut map = serde_json::Map::new();
    for table in tables {
        let rows: Value = serde_json::from_str(&table.rows_json)
            .map_err(|e| format!("Failed to parse protobuf rows for {}: {}", table.table, e))?;
        map.insert(table.table, rows);
    }
    Ok(Value::Object(map))
}

fn build_sync_push_request(outlet_id: &str, tables: Value) -> SyncPushRequest {
    SyncPushRequest {
        outlet_id: outlet_id.to_string(),
        payload_json: serde_json::to_string(&tables).unwrap_or_else(|_| "{}".to_string()),
    }
}

fn server_wins_to_skip_map(
    server_wins: Vec<SyncServerWin>,
) -> std::collections::HashMap<String, std::collections::HashSet<String>> {
    let mut map = std::collections::HashMap::new();
    for win in server_wins {
        map.insert(win.table, win.ids.into_iter().collect());
    }
    map
}

fn build_sync_pull_request(outlet_id: &str, since: &str) -> SyncPullRequest {
    SyncPullRequest {
        outlet_id: outlet_id.to_string(),
        tables: SYNC_TABLES.iter().map(|table| table.to_string()).collect(),
        since: since.to_string(),
    }
}

fn build_sync_pull_events_request(outlet_id: &str, after_event_id: i64) -> SyncPullEventsRequest {
    SyncPullEventsRequest {
        outlet_id: outlet_id.to_string(),
        after_event_id,
    }
}

#[cfg(test)]
fn cursor_gap_requires_full_resync(
    after_event_id: i64,
    oldest_available_event_id: Option<i64>,
) -> bool {
    oldest_available_event_id
        .map(|oldest| after_event_id > 0 && after_event_id + 1 < oldest)
        .unwrap_or(false)
}

async fn set_last_sync_at_tx(
    conn: &mut SqliteConnection,
    table: &str,
    outlet_id: &str,
    time: &str,
) -> Result<(), String> {
    let existing = sqlx::query_as::<_, (String,)>(
        "SELECT last_sync_at FROM sync_meta WHERE table_name = ?1 AND outlet_id = ?2",
    )
    .bind(table)
    .bind(outlet_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| format!("Failed to get last sync at: {}", e))?;

    if existing.is_some() {
        let query =
            "UPDATE sync_meta SET last_sync_at = ?3 WHERE table_name = ?1 AND outlet_id = ?2";
        sqlx::query(query)
            .bind(table)
            .bind(outlet_id)
            .bind(time)
            .execute(&mut *conn)
            .await
            .map_err(|e| format!("Failed to update last sync at: {}", e))?;
    } else {
        let query =
            "INSERT INTO sync_meta (table_name, outlet_id, last_sync_at) VALUES (?1, ?2, ?3)";
        sqlx::query(query)
            .bind(table)
            .bind(outlet_id)
            .bind(time)
            .execute(&mut *conn)
            .await
            .map_err(|e| format!("Failed to insert last sync at: {}", e))?;
    }
    Ok(())
}

fn camel_to_snake(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() {
            if i > 0 {
                result.push('_');
            }
            result.extend(c.to_lowercase());
        } else {
            result.push(c);
        }
    }
    result
}

fn snake_to_camel(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = false;
    for c in s.chars() {
        if c == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            result.extend(c.to_uppercase());
            capitalize_next = false;
        } else {
            result.push(c);
        }
    }
    result
}

fn debug_row_summary(row: &Value) -> String {
    let Some(obj) = row.as_object() else {
        return "<non-object>".to_string();
    };

    let mut summary = serde_json::Map::new();
    for key in [
        "id",
        "merchantId",
        "merchant_id",
        "outletId",
        "outlet_id",
        "cloudUserId",
        "cloud_user_id",
        "role",
        "isActive",
        "is_active",
        "deletedAt",
        "deleted_at",
        "isSynced",
        "is_synced",
        "updatedAt",
        "updated_at",
    ] {
        if let Some(value) = obj.get(key) {
            summary.insert(key.to_string(), value.clone());
        }
    }

    serde_json::to_string(&Value::Object(summary)).unwrap_or_else(|_| "<invalid-json>".to_string())
}

fn build_upsert_query(table: &str, columns: &[String]) -> String {
    let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();

    let set_clause: Vec<String> = columns
        .iter()
        .filter(|c| *c != "id")
        .map(|c| format!("{} = excluded.{}", c, c))
        .collect();

    if set_clause.is_empty() {
        return format!(
            "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
            table,
            columns.join(", "),
            placeholders.join(", ")
        );
    }

    format!(
        "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT(id) DO UPDATE SET {} WHERE {}.is_synced = 1 OR excluded.updated_at >= {}.updated_at",
        table,
        columns.join(", "),
        placeholders.join(", "),
        set_clause.join(", "),
        table,
        table
    )
}

fn redact_debug_value(value: &Value) -> Value {
    let Some(obj) = value.as_object() else {
        return value.clone();
    };

    let redacted = obj
        .iter()
        .map(|(key, item)| {
            let lower_key = key.to_lowercase();
            if lower_key.contains("pin")
                || lower_key.contains("password")
                || lower_key.contains("token")
                || lower_key.contains("secret")
            {
                (key.clone(), Value::String("<redacted>".to_string()))
            } else {
                (key.clone(), item.clone())
            }
        })
        .collect();

    Value::Object(redacted)
}

async fn debug_local_table_state(
    conn: &mut SqliteConnection,
    table: &str,
    filter_col: &str,
    filter_value: &str,
    stage: &str,
) -> Result<(), String> {
    let query = format!(
        "SELECT id, deleted_at, is_synced FROM {} WHERE {} = ?1 ORDER BY updated_at DESC LIMIT 5",
        table, filter_col
    );
    let rows = sqlx::query(&query)
        .bind(filter_value)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| format!("Failed to inspect {} during {}: {}", table, stage, e))?;

    let summaries = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.try_get::<String, _>("id").ok(),
                "deleted_at": row.try_get::<String, _>("deleted_at").ok(),
                "is_synced": row.try_get::<i64, _>("is_synced").ok(),
            })
        })
        .collect::<Vec<_>>();

    println!(
        "[SYNC-DEBUG] local state: stage={}, table={}, filter_col={}, filter_value={}, rows={}",
        stage,
        table,
        filter_col,
        filter_value,
        serde_json::to_string(&summaries).unwrap_or_default()
    );

    Ok(())
}

async fn upsert_row(conn: &mut SqliteConnection, table: &str, row: &Value) -> Result<(), String> {
    let obj = row
        .as_object()
        .ok_or_else(|| format!("Row for {} is not a JSON object", table))?;

    let mut local_obj: serde_json::Map<String, Value> = obj
        .iter()
        .filter(|(k, _)| !LOCAL_ONLY_COLUMNS.contains(&k.as_str()))
        .map(|(k, v)| (camel_to_snake(k), v.clone()))
        .collect();
    local_obj.insert("is_synced".to_string(), Value::Bool(true));

    let columns: Vec<String> = local_obj.keys().cloned().collect();
    if columns.is_empty() {
        return Ok(());
    }
    println!(
        "[SYNC-DEBUG] upsert_row: table={}, source={}, local={}",
        table,
        debug_row_summary(row),
        serde_json::to_string(&redact_debug_value(&Value::Object(local_obj.clone())))
            .unwrap_or_default()
    );

    let query = build_upsert_query(table, &columns);

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

    q.execute(conn).await.map_err(|e| {
        println!(
            "[SYNC-DEBUG] upsert_row FAILED: table={}, columns={}, error={}",
            table,
            columns.join(","),
            e
        );
        format!("Failed to upsert into {}: {}", table, e)
    })?;
    println!(
        "[SYNC-DEBUG] upsert_row OK: table={}, id={}",
        table,
        local_obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("<missing>")
    );
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
    session_token: &str,
) -> Result<PushResult, String> {
    let client = build_client(session_token)?;

    let merchant_id: Option<String> = {
        let query = "SELECT merchant_id FROM outlets WHERE id = ?1";
        sqlx::query_scalar::<_, String>(query)
            .bind(outlet_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to resolve merchant_id: {}", e))?
    };
    println!(
        "[SYNC-DEBUG] push: outlet_id={}, merchant_id={:?}",
        outlet_id, merchant_id
    );

    let mut tables_json = serde_json::Map::new();
    for table in SYNC_TABLES {
        let filter_value = get_filter_value(table, outlet_id, &merchant_id)?;
        let rows = read_unsynced_rows(pool, table, filter_value).await?;
        println!(
            "[SYNC-DEBUG] push: table={}, unsynced_rows={}",
            table,
            rows.len()
        );
        for row in &rows {
            println!(
                "[SYNC-DEBUG] push row: table={}, row={}",
                table,
                debug_row_summary(row)
            );
        }
        tables_json.insert(table.to_string(), Value::Array(rows));
    }

    println!("[SYNC-DEBUG] push: sending to {}/api/sync/push", api_url);
    let request = build_sync_push_request(outlet_id, Value::Object(tables_json));
    let request_body = request.encode_to_vec();

    let response = client
        .post(format!("{}/api/sync/push", api_url))
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Sync push failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        println!("[SYNC-DEBUG] push FAILED: status={}, body={}", status, text);
        return Err(format!("Sync push failed ({}): {}", status, text));
    }

    let response_body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read push response: {}", e))?;
    let result = SyncPushResponse::decode(response_body)
        .map_err(|e| format!("Failed to decode push response: {}", e))?;
    println!(
        "[SYNC-DEBUG] push response: server_wins={}, server_time={}",
        result.server_wins.len(),
        result.server_time
    );

    let server_wins_count = result.server_wins.len();
    let server_time = result.server_time.clone();
    let server_wins_map = server_wins_to_skip_map(result.server_wins);

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin push transaction: {}", e))?;
    for table in SYNC_TABLES {
        let filter_value = get_filter_value(table, outlet_id, &merchant_id)?;
        let filter_col = get_table_filter_column(table);
        let skip_ids = server_wins_map
            .get(table.to_string().as_str())
            .cloned()
            .unwrap_or_default();
        mark_rows_synced_tx(&mut tx, table, filter_col, filter_value, &skip_ids).await?;
    }
    let synced_at = if server_time.is_empty() {
        current_time_millis_string()
    } else {
        server_time.clone()
    };
    let marked_outbox = mark_outbox_synced_tx(&mut tx, outlet_id, &merchant_id, &synced_at).await?;
    println!("[SYNC-DEBUG] push: marked_outbox_synced={}", marked_outbox);
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit push transaction: {}", e))?;

    Ok(PushResult {
        tables_synced: SYNC_TABLES.iter().map(|t| t.to_string()).collect(),
        server_wins_count,
        server_time,
    })
}

#[command]
pub async fn get_sync_local_state(
    outlet_id: String,
    state: State<'_, AppState>,
) -> Result<LocalSyncState, String> {
    let pool = &state.db_pool;
    let merchant_id = resolve_merchant_id(pool, &outlet_id).await?;
    let needs_baseline_sync = merchant_id.is_none();
    let outbox_dirty_count = count_pending_outbox(pool, &outlet_id, &merchant_id).await?;
    let legacy_dirty_count = if needs_baseline_sync {
        0
    } else {
        count_legacy_unsynced_rows(pool, &outlet_id, &merchant_id).await?
    };
    let local_dirty_count = outbox_dirty_count.max(legacy_dirty_count);
    let last_server_event_id = get_last_server_event_id(pool, &outlet_id).await?;

    println!(
        "[SYNC-DEBUG] local_state: outlet_id={}, merchant_id={:?}, needs_baseline_sync={}, outbox_dirty_count={}, legacy_dirty_count={}, dirty_count={}, last_server_event_id={}",
        outlet_id,
        merchant_id,
        needs_baseline_sync,
        outbox_dirty_count,
        legacy_dirty_count,
        local_dirty_count,
        last_server_event_id
    );

    Ok(LocalSyncState {
        local_dirty_count,
        last_server_event_id,
        needs_baseline_sync,
    })
}

#[command]
pub async fn sync_push(
    outlet_id: String,
    api_url: String,
    session_token: String,
    state: State<'_, AppState>,
) -> Result<PushResult, String> {
    sync_push_inner(&state.db_pool, &outlet_id, &api_url, &session_token).await
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
    session_token: &str,
) -> Result<PullResult, String> {
    let client = build_client(session_token)?;

    let mut timestamps = Vec::new();
    for table in SYNC_TABLES {
        timestamps.push(
            get_last_sync_at(pool, table, outlet_id)
                .await
                .unwrap_or(None),
        );
    }
    let since = choose_pull_since(timestamps);
    println!(
        "[SYNC-DEBUG] pull: outlet_id={}, since={}",
        outlet_id, since
    );

    let url = format!("{}/api/sync/pull", api_url);
    println!("[SYNC-DEBUG] pull: POST {}", url);
    let request = build_sync_pull_request(outlet_id, &since);
    let request_body = request.encode_to_vec();

    let response = client
        .post(&url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Sync pull failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        println!("[SYNC-DEBUG] pull FAILED: status={}, body={}", status, text);
        return Err(format!("Sync pull failed ({}): {}", status, text));
    }

    let response_body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read pull response: {}", e))?;
    let pull_response = SyncPullResponse::decode(response_body)
        .map_err(|e| format!("Failed to decode pull response: {}", e))?;
    let server_time = pull_response.server_time.clone();
    let result = protobuf_tables_to_json_map(pull_response.tables)?;

    let mut total_rows = 0;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin pull transaction: {}", e))?;

    for table in SYNC_TABLES {
        if let Some(rows) = result.get(table).and_then(|v| v.as_array()) {
            println!(
                "[SYNC-DEBUG] pull: table={}, rows_from_server={}",
                table,
                rows.len()
            );
            for row in rows {
                println!(
                    "[SYNC-DEBUG] pull row: table={}, row={}",
                    table,
                    debug_row_summary(row)
                );
                upsert_row(&mut tx, table, row).await?;
                total_rows += 1;
            }
        } else {
            println!("[SYNC-DEBUG] pull: table={}, no key in response", table);
        }
    }
    println!("[SYNC-DEBUG] pull: total_rows_upserted={}", total_rows);

    for table in SYNC_TABLES {
        set_last_sync_at_tx(&mut tx, table, outlet_id, &server_time).await?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit pull transaction: {}", e))?;

    Ok(PullResult {
        rows_received: total_rows,
        server_time,
    })
}

#[command]
pub async fn sync_pull(
    outlet_id: String,
    api_url: String,
    session_token: String,
    state: State<'_, AppState>,
) -> Result<PullResult, String> {
    sync_pull_inner(&state.db_pool, &outlet_id, &api_url, &session_token).await
}

#[command]
pub async fn run_garbage_collection(
    outlet_id: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pool = &state.db_pool;

    let merchant_id: Option<String> = {
        let query = "SELECT merchant_id FROM outlets WHERE id = ?1";
        sqlx::query_scalar::<_, String>(query)
            .bind(&outlet_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to resolve merchant_id: {}", e))?
    };
    println!(
        "[SYNC-DEBUG] GC: outlet_id={}, merchant_id={:?}",
        outlet_id, merchant_id
    );

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin GC transaction: {}", e))?;
    let mut total_purged: usize = 0;

    for table in SYNC_TABLES {
        let filter_col = get_table_filter_column(table);
        let filter_value = get_filter_value(table, &outlet_id, &merchant_id)?;
        debug_local_table_state(&mut tx, table, filter_col, filter_value, "gc-before").await?;
        let query = format!(
            "DELETE FROM {} WHERE {} = ?1 AND deleted_at IS NOT NULL AND deleted_at != '' AND lower(deleted_at) != 'null' AND is_synced = 1",
            table, filter_col
        );
        let result = sqlx::query(&query)
            .bind(filter_value)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("GC failed for {}: {}", table, e))?;
        println!(
            "[SYNC-DEBUG] GC table: table={}, filter_col={}, filter_value={}, rows_purged={}",
            table,
            filter_col,
            filter_value,
            result.rows_affected()
        );
        total_purged += result.rows_affected() as usize;
        debug_local_table_state(&mut tx, table, filter_col, filter_value, "gc-after").await?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit GC transaction: {}", e))?;
    Ok(total_purged)
}

#[derive(Debug, serde::Serialize)]
pub struct SyncNowResult {
    pull: PullResult,
    push: PushResult,
    purged: usize,
}

fn empty_pull_result() -> PullResult {
    PullResult {
        rows_received: 0,
        server_time: String::new(),
    }
}

fn empty_push_result() -> PushResult {
    PushResult {
        tables_synced: Vec::new(),
        server_wins_count: 0,
        server_time: String::new(),
    }
}

#[command]
pub async fn sync_push_outbox(
    outlet_id: String,
    api_url: String,
    session_token: String,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    println!(
        "[SYNC-DEBUG] sync_push_outbox: outlet_id={}, api_url={}",
        outlet_id, api_url
    );
    let pool = &state.db_pool;
    let merchant_id = resolve_merchant_id(pool, &outlet_id).await?;
    let push = sync_push_inner(pool, &outlet_id, &api_url, &session_token).await?;
    let synced_at = if push.server_time.is_empty() {
        current_time_millis_string()
    } else {
        push.server_time.clone()
    };

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin outbox transaction: {}", e))?;
    let marked = mark_outbox_synced_tx(&mut tx, &outlet_id, &merchant_id, &synced_at).await?;
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit outbox transaction: {}", e))?;
    println!(
        "[SYNC-DEBUG] sync_push_outbox: marked_outbox_synced={}",
        marked
    );

    Ok(SyncNowResult {
        pull: empty_pull_result(),
        push,
        purged: 0,
    })
}

#[command]
pub async fn sync_pull_events(
    outlet_id: String,
    api_url: String,
    session_token: String,
    latest_event_id: i64,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    println!(
        "[SYNC-DEBUG] sync_pull_events: outlet_id={}, api_url={}, latest_event_id={}",
        outlet_id, api_url, latest_event_id
    );
    let pool = &state.db_pool;
    let client = build_client(&session_token)?;
    let after_event_id = get_last_server_event_id(pool, &outlet_id).await?;
    let url = format!("{}/api/sync/pull-events", api_url);
    println!("[SYNC-DEBUG] sync_pull_events: POST {}", url);
    let request = build_sync_pull_events_request(&outlet_id, after_event_id);
    let request_body = request.encode_to_vec();

    let response = client
        .post(&url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Sync event pull failed: {}", e))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        println!(
            "[SYNC-DEBUG] sync_pull_events FAILED: status={}, body={}",
            status, text
        );
        return Err(format!("Sync event pull failed ({}): {}", status, text));
    }

    let response_body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read event pull response: {}", e))?;
    let pull_response = SyncPullEventsResponse::decode(response_body)
        .map_err(|e| format!("Failed to decode event pull response: {}", e))?;
    if pull_response.needs_full_resync {
        return Err("Event cursor expired; full resync required".to_string());
    }

    let response_latest_event_id = if pull_response.latest_event_id == 0 {
        latest_event_id
    } else {
        pull_response.latest_event_id
    };
    let result = protobuf_tables_to_json_map(pull_response.tables)?;

    let mut total_rows = 0;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin event pull transaction: {}", e))?;
    for table in SYNC_TABLES {
        if let Some(rows) = result.get(table).and_then(|value| value.as_array()) {
            println!(
                "[SYNC-DEBUG] sync_pull_events: table={}, rows_from_server={}",
                table,
                rows.len()
            );
            for row in rows {
                println!(
                    "[SYNC-DEBUG] sync_pull_events row: table={}, row={}",
                    table,
                    debug_row_summary(row)
                );
                upsert_row(&mut tx, table, row).await?;
                total_rows += 1;
            }
        }
    }

    set_last_server_event_id_tx(&mut tx, &outlet_id, response_latest_event_id).await?;
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit event pull transaction: {}", e))?;

    Ok(SyncNowResult {
        pull: PullResult {
            rows_received: total_rows,
            server_time: String::new(),
        },
        push: empty_push_result(),
        purged: 0,
    })
}

#[command]
pub async fn sync_full_resync(
    outlet_id: String,
    api_url: String,
    session_token: String,
    latest_event_id: i64,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    let result = sync_now(outlet_id.clone(), api_url, session_token, state.clone()).await?;
    let mut tx = state
        .db_pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin full resync cursor transaction: {}", e))?;
    set_last_server_event_id_tx(&mut tx, &outlet_id, latest_event_id).await?;
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit full resync cursor transaction: {}", e))?;
    Ok(result)
}

#[command]
pub async fn purge_synced_outbox(
    older_than: String,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    let result =
        sqlx::query("DELETE FROM sync_outbox WHERE synced_at IS NOT NULL AND synced_at < ?1")
            .bind(&older_than)
            .execute(&state.db_pool)
            .await
            .map_err(|e| format!("Failed to purge synced outbox: {}", e))?;

    println!(
        "[SYNC-DEBUG] purge_synced_outbox: older_than={}, rows_purged={}",
        older_than,
        result.rows_affected()
    );
    Ok(result.rows_affected())
}

#[command]
pub async fn sync_now(
    outlet_id: String,
    api_url: String,
    session_token: String,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    println!(
        "[SYNC-DEBUG] sync_now: outlet_id={}, api_url={}",
        outlet_id, api_url
    );
    let pool = &state.db_pool;
    let pull = sync_pull_inner(pool, &outlet_id, &api_url, &session_token).await?;
    println!(
        "[SYNC-DEBUG] sync_now: pull done, rows_received={}",
        pull.rows_received
    );
    let push = sync_push_inner(pool, &outlet_id, &api_url, &session_token).await?;
    println!(
        "[SYNC-DEBUG] sync_now: push done, server_wins={}",
        push.server_wins_count
    );

    let merchant_id: Option<String> = {
        let query = "SELECT merchant_id FROM outlets WHERE id = ?1";
        sqlx::query_scalar::<_, String>(query)
            .bind(&outlet_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Failed to resolve merchant_id: {}", e))?
    };

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin GC transaction: {}", e))?;
    let mut total_purged: usize = 0;
    for table in SYNC_TABLES {
        let filter_col = get_table_filter_column(table);
        let filter_value = get_filter_value(table, &outlet_id, &merchant_id)?;
        debug_local_table_state(
            &mut tx,
            table,
            filter_col,
            filter_value,
            "sync-now-gc-before",
        )
        .await?;
        let query = format!(
            "DELETE FROM {} WHERE {} = ?1 AND deleted_at IS NOT NULL AND deleted_at != '' AND lower(deleted_at) != 'null' AND is_synced = 1",
            table, filter_col
        );
        let result = sqlx::query(&query)
            .bind(filter_value)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("GC failed for {}: {}", table, e))?;
        println!(
            "[SYNC-DEBUG] sync_now GC table: table={}, filter_col={}, filter_value={}, rows_purged={}",
            table,
            filter_col,
            filter_value,
            result.rows_affected()
        );
        total_purged += result.rows_affected() as usize;
        debug_local_table_state(
            &mut tx,
            table,
            filter_col,
            filter_value,
            "sync-now-gc-after",
        )
        .await?;
    }
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit GC transaction: {}", e))?;
    Ok(SyncNowResult {
        pull,
        push,
        purged: total_purged,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chooses_oldest_existing_last_sync_timestamp() {
        let timestamps = vec![
            Some("2026-05-09T11:10:00.000Z".to_string()),
            Some("2026-05-09T11:05:00.000Z".to_string()),
            Some("2026-05-09T11:08:00.000Z".to_string()),
        ];

        assert_eq!(choose_pull_since(timestamps), "2026-05-09T11:05:00.000Z");
    }

    #[test]
    fn falls_back_to_epoch_when_no_table_has_synced() {
        assert_eq!(
            choose_pull_since(vec![None, None]),
            "1970-01-01T00:00:00.000Z"
        );
    }

    #[test]
    fn protobuf_table_rows_decode_json_rows() {
        let tables = vec![SyncTableRows {
            table: "products".to_string(),
            rows_json: r#"[{"id":"product-1"}]"#.to_string(),
        }];

        let result = protobuf_tables_to_json_map(tables).expect("tables should decode");

        assert_eq!(
            result
                .get("products")
                .and_then(|value| value.as_array())
                .map(std::vec::Vec::len),
            Some(1)
        );
    }

    #[test]
    fn build_push_request_encodes_outlet_and_payload_json() {
        let mut tables = serde_json::Map::new();
        tables.insert(
            "products".to_string(),
            serde_json::json!([{ "id": "product-1" }]),
        );

        let request = build_sync_push_request("outlet-1", Value::Object(tables));

        assert_eq!(request.outlet_id, "outlet-1");
        assert!(request.payload_json.contains("product-1"));
    }

    #[test]
    fn push_response_server_wins_to_map_groups_ids_by_table() {
        let response = SyncPushResponse {
            server_time: "2026-05-10T00:00:00.000Z".to_string(),
            server_wins: vec![SyncServerWin {
                table: "products".to_string(),
                ids: vec!["product-1".to_string()],
            }],
        };

        let map = server_wins_to_skip_map(response.server_wins);

        assert!(map
            .get("products")
            .is_some_and(|ids| ids.contains("product-1")));
    }

    #[test]
    fn build_pull_request_carries_tables_and_since_cursor() {
        let request = build_sync_pull_request("outlet-1", "2026-05-10T00:00:00.000Z");

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.since, "2026-05-10T00:00:00.000Z");
        assert!(request.tables.contains(&"products".to_string()));
    }

    #[test]
    fn build_pull_events_request_uses_event_cursor() {
        let request = build_sync_pull_events_request("outlet-1", 42);

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.after_event_id, 42);
    }

    #[test]
    fn detects_cursor_gap_only_when_next_event_is_missing() {
        assert!(!cursor_gap_requires_full_resync(10, Some(11)));
        assert!(cursor_gap_requires_full_resync(10, Some(12)));
        assert!(!cursor_gap_requires_full_resync(0, Some(50)));
        assert!(!cursor_gap_requires_full_resync(10, None));
    }

    #[test]
    fn pull_upsert_keeps_newer_local_dirty_rows() {
        let columns = vec![
            "id".to_string(),
            "deleted_at".to_string(),
            "is_synced".to_string(),
            "updated_at".to_string(),
        ];

        let query = build_upsert_query("categories", &columns);

        assert!(query.contains(
            "WHERE categories.is_synced = 1 OR excluded.updated_at >= categories.updated_at"
        ));
    }
}
