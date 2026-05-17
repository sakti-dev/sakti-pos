use prost::Message;
use serde_json::Value;
use sqlx::{Row, SqliteConnection, SqlitePool};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::time_utils::current_time_iso_string;

use super::http::build_client;
use super::protobuf::{
    build_asset_changes, build_category_changes, build_merchant_changes, build_order_changes,
    build_order_item_changes, build_outlet_changes, build_outlet_product_changes,
    build_product_changes, build_register_changes, build_staff_changes,
    build_sync_push_batch_request,
};
use super::schema::{
    camel_to_snake, get_filter_value, mark_rows_synced_by_id_tx,
    read_unsynced_table_changes_from_outbox,
};
use super::sync_proto::SyncPushBatchResponse;
use super::SYNC_TABLES;

#[derive(Debug, serde::Serialize)]
pub struct PushResult {
    pub tables_synced: Vec<String>,
    pub server_wins_count: usize,
    pub server_time: String,
}

pub(super) fn accepted_ids_by_table(
    response: &SyncPushBatchResponse,
) -> HashMap<String, HashSet<String>> {
    let mut result = HashMap::new();
    for ack in &response.tables {
        let ids = result.entry(ack.table.clone()).or_insert_with(HashSet::new);
        ids.extend(ack.accepted_created_ids.iter().cloned());
        ids.extend(ack.accepted_updated_ids.iter().cloned());
        ids.extend(ack.accepted_deleted_ids.iter().cloned());
    }
    result
}

pub(super) fn debug_row_summary(row: &Value) -> String {
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

pub(super) fn build_upsert_query(table: &str, columns: &[String]) -> String {
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

pub(super) fn redact_debug_value(value: &Value) -> Value {
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

pub(super) async fn debug_local_table_state(
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

    log::info!(
        "[RUST] [SYNC:TRACE] local state: stage={}, table={}, filter_col={}, filter_value={}, rows={}",
        stage,
        table,
        filter_col,
        filter_value,
        serde_json::to_string(&summaries).unwrap_or_default()
    );

    Ok(())
}

pub(super) async fn upsert_row(
    conn: &mut SqliteConnection,
    table: &str,
    row: &Value,
) -> Result<(), String> {
    let obj = row
        .as_object()
        .ok_or_else(|| format!("Row for {} is not a JSON object", table))?;

    let mut local_obj: serde_json::Map<String, Value> = obj
        .iter()
        .filter(|(k, _)| !super::LOCAL_ONLY_COLUMNS.contains(&k.as_str()))
        .map(|(k, v)| (camel_to_snake(k), v.clone()))
        .collect();
    local_obj.insert("is_synced".to_string(), Value::Bool(true));

    let columns: Vec<String> = local_obj.keys().cloned().collect();
    if columns.is_empty() {
        return Ok(());
    }
    log::info!(
        "[RUST] [SYNC:TRACE] upsert_row: table={}, source={}, local={}",
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
        log::info!(
            "[RUST] [SYNC:TRACE] upsert_row FAILED: table={}, columns={}, error={}",
            table,
            columns.join(","),
            e
        );
        format!("Failed to upsert into {}: {}", table, e)
    })?;
    log::info!(
        "[RUST] [SYNC:TRACE] upsert_row OK: table={}, id={}",
        table,
        local_obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("<missing>")
    );
    Ok(())
}

pub(super) async fn sync_push_batch_inner(
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
    log::info!(
        "[RUST] [SYNC:TRACE] push_batch: outlet_id={}, merchant_id={:?}",
        outlet_id,
        merchant_id
    );

    let mut merchant_changes = super::protobuf::TablePushChanges::default();
    let mut outlet_changes = super::protobuf::TablePushChanges::default();
    let mut register_changes = super::protobuf::TablePushChanges::default();
    let mut category_changes = super::protobuf::TablePushChanges::default();
    let mut asset_changes = super::protobuf::TablePushChanges::default();
    let mut product_changes = super::protobuf::TablePushChanges::default();
    let mut order_changes = super::protobuf::TablePushChanges::default();
    let mut order_item_changes = super::protobuf::TablePushChanges::default();
    let mut outlet_product_changes = super::protobuf::TablePushChanges::default();
    let mut staff_changes = super::protobuf::TablePushChanges::default();
    for table in SYNC_TABLES {
        let filter_value = get_filter_value(table, outlet_id, &merchant_id)?;
        let changes = read_unsynced_table_changes_from_outbox(pool, table, filter_value).await?;
        let row_count = changes.created.len() + changes.updated.len() + changes.deleted_ids.len();
        log::info!(
            "[RUST] [SYNC:TRACE] push_batch: table={}, created={}, updated={}, deleted={}",
            table,
            changes.created.len(),
            changes.updated.len(),
            changes.deleted_ids.len()
        );
        for row in changes.created.iter().chain(changes.updated.iter()) {
            log::info!(
                "[RUST] [SYNC:TRACE] push_batch row: table={}, row={}",
                table,
                debug_row_summary(row)
            );
        }
        if row_count == 0 {
            continue;
        }
        match *table {
            "merchants" => merchant_changes = changes,
            "outlets" => outlet_changes = changes,
            "registers" => register_changes = changes,
            "categories" => category_changes = changes,
            "assets" => asset_changes = changes,
            "products" => product_changes = changes,
            "orders" => order_changes = changes,
            "order_items" => order_item_changes = changes,
            "outlet_products" => outlet_product_changes = changes,
            "staff" => staff_changes = changes,
            _ => {}
        }
    }

    log::info!(
        "[RUST] [SYNC:TRACE] push_batch: sending to {}/api/sync/push",
        api_url
    );
    let idempotency_key = Uuid::new_v4().to_string();
    let request = build_sync_push_batch_request(
        outlet_id,
        &idempotency_key,
        Some(build_merchant_changes(&merchant_changes)),
        Some(build_outlet_changes(&outlet_changes)),
        Some(build_register_changes(&register_changes)),
        Some(build_category_changes(&category_changes)),
        Some(build_asset_changes(&asset_changes)),
        Some(build_product_changes(&product_changes)),
        Some(build_order_changes(&order_changes)),
        Some(build_order_item_changes(&order_item_changes)),
        Some(build_outlet_product_changes(&outlet_product_changes)),
        Some(build_staff_changes(&staff_changes)),
    );
    let request_body = request.encode_to_vec();

    let response = client
        .post(format!("{}/api/sync/push", api_url))
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Sync push batch failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        log::info!(
            "[RUST] [SYNC:TRACE] push_batch FAILED: status={}, body={}",
            status,
            text
        );
        return Err(format!("Sync push batch failed ({}): {}", status, text));
    }

    let response_body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read push batch response: {}", e))?;
    let result = SyncPushBatchResponse::decode(response_body)
        .map_err(|e| format!("Failed to decode push batch response: {}", e))?;
    log::info!(
        "[RUST] [SYNC:TRACE] push_batch response: tables={}, server_time={}",
        result.tables.len(),
        result.server_time
    );

    let mut server_wins_count = 0usize;
    let accepted_ids_by_table = accepted_ids_by_table(&result);
    let mut rejected_ids_by_table: HashMap<String, HashSet<String>> = HashMap::new();
    for ack in &result.tables {
        let rejected_ids = rejected_ids_by_table.entry(ack.table.clone()).or_default();
        for rejected in &ack.rejected {
            rejected_ids.insert(rejected.id.clone());
            server_wins_count += 1;
        }
    }

    let server_time = result.server_time.clone();
    let tables_synced = result
        .tables
        .iter()
        .map(|ack| ack.table.clone())
        .collect::<Vec<_>>();

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin push batch transaction: {}", e))?;
    for table in SYNC_TABLES {
        let accepted_ids = accepted_ids_by_table
            .get(*table)
            .cloned()
            .unwrap_or_default();
        mark_rows_synced_by_id_tx(&mut tx, table, &accepted_ids).await?;
    }
    let synced_at = if server_time.is_empty() {
        current_time_iso_string()
    } else {
        server_time.clone()
    };
    let marked_outbox = super::outbox::mark_outbox_synced_by_accepted_ids_tx(
        &mut tx,
        &synced_at,
        &accepted_ids_by_table,
    )
    .await?;
    log::info!(
        "[RUST] [SYNC:TRACE] push_batch: marked_outbox_synced={}",
        marked_outbox
    );
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit push batch transaction: {}", e))?;

    Ok(PushResult {
        tables_synced,
        server_wins_count,
        server_time,
    })
}
