use serde_json::Value;
use sqlx::{Column, Row, SqliteConnection, SqlitePool};
use tauri::{command, State};

use crate::db_utils;
use crate::drizzle_proxy::AppState;

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
        "SELECT * FROM {} WHERE {} = ?1 AND is_synced = 0",
        table, filter_col
    );
    let rows = sqlx::query(&query)
        .bind(filter_value)
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

    let body = serde_json::json!({
        "outletId": outlet_id,
        "tables": tables_json
    });
    println!("[SYNC-DEBUG] push: sending to {}/api/sync/push", api_url);

    let response = client
        .post(format!("{}/api/sync/push", api_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Sync push failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        println!("[SYNC-DEBUG] push FAILED: status={}, body={}", status, text);
        return Err(format!("Sync push failed ({}): {}", status, text));
    }

    let result: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse push response: {}", e))?;
    println!(
        "[SYNC-DEBUG] push response: {}",
        serde_json::to_string(&result).unwrap_or_default()
    );

    let server_wins_map: std::collections::HashMap<String, std::collections::HashSet<String>> = {
        let mut map = std::collections::HashMap::new();
        if let Some(sw) = result.get("serverWins").and_then(|v| v.as_array()) {
            for entry in sw {
                if let (Some(table), Some(ids)) = (
                    entry.get("table").and_then(|v| v.as_str()),
                    entry.get("ids").and_then(|v| v.as_array()),
                ) {
                    let set: std::collections::HashSet<String> = ids
                        .iter()
                        .filter_map(|id| id.as_str().map(|s| s.to_string()))
                        .collect();
                    map.insert(table.to_string(), set);
                }
            }
        }
        map
    };

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
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit push transaction: {}", e))?;

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

    let mut earliest_since = "1970-01-01T00:00:00.000Z".to_string();
    for table in SYNC_TABLES {
        if let Some(ts) = get_last_sync_at(pool, table, outlet_id)
            .await
            .unwrap_or(None)
        {
            if ts < earliest_since {
                earliest_since = ts;
            }
        }
    }
    let since = earliest_since;
    println!(
        "[SYNC-DEBUG] pull: outlet_id={}, since={}",
        outlet_id, since
    );

    let tables = SYNC_TABLES.join(",");
    let url = format!(
        "{}/api/sync/pull?outletId={}&tables={}&since={}",
        api_url,
        outlet_id,
        tables,
        urlencoding::encode(&since)
    );
    println!("[SYNC-DEBUG] pull: GET {}", url);

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Sync pull failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        println!("[SYNC-DEBUG] pull FAILED: status={}, body={}", status, text);
        return Err(format!("Sync pull failed ({}): {}", status, text));
    }

    let result: Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse pull response: {}", e))?;

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

    let server_time = result
        .get("serverTime")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    for table in SYNC_TABLES {
        set_last_sync_at_tx(&mut tx, table, outlet_id, server_time).await?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit pull transaction: {}", e))?;

    Ok(PullResult {
        rows_received: total_rows,
        server_time: server_time.to_string(),
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
