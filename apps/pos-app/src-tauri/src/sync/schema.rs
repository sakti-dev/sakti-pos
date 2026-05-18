use serde_json::Value;
use sqlx::{Column, Row, SqliteConnection, SqlitePool};

use crate::db::sqlite;

use super::protobuf::TablePushChanges;
use super::LOCAL_ONLY_COLUMNS;

pub(super) fn get_table_filter_column(table: &str) -> &'static str {
    match table {
        "merchants" => "id",
        "categories" | "assets" | "products" | "staff" | "outlets" => "merchant_id",
        _ => "outlet_id",
    }
}

pub(super) fn get_filter_value<'a>(
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

pub(super) fn camel_to_snake(s: &str) -> String {
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

pub(super) fn snake_to_camel(s: &str) -> String {
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

#[derive(Debug)]
pub(super) struct OutboxRowForSync {
    pub operation: String,
    pub row_id: String,
    pub row: Option<Value>,
}

#[derive(Debug)]
pub(super) struct TableOutboxChanges {
    pub changes: TablePushChanges,
    pub outbox_ids: Vec<String>,
    pub outbox_ids_by_row_id: std::collections::HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone)]
struct CoalescedOutboxRow {
    operation: String,
    row: Option<Value>,
}

fn coalesce_operation(previous: Option<&str>, next: &str) -> Result<Option<String>, String> {
    match (previous, next) {
        (None, "insert" | "update" | "delete") => Ok(Some(next.to_string())),
        (Some("insert"), "update") => Ok(Some("insert".to_string())),
        (Some("insert"), "delete") => Ok(None),
        (Some("update"), "update") => Ok(Some("update".to_string())),
        (Some("update"), "delete") => Ok(Some("delete".to_string())),
        (Some("delete"), "insert") => Ok(Some("update".to_string())),
        (Some("delete"), "update") => Ok(Some("update".to_string())),
        (Some("delete"), "delete") => Ok(Some("delete".to_string())),
        (_, "insert" | "update" | "delete") => Ok(Some(next.to_string())),
        (_, other) => Err(format!("Unknown sync outbox operation: {}", other)),
    }
}

pub(super) fn outbox_rows_to_table_changes(
    rows: Vec<OutboxRowForSync>,
) -> Result<TablePushChanges, String> {
    let mut order: Vec<String> = Vec::new();
    let mut by_id = std::collections::HashMap::<String, CoalescedOutboxRow>::new();

    for item in rows {
        if !by_id.contains_key(&item.row_id) {
            order.push(item.row_id.clone());
        }
        let previous = by_id
            .get(&item.row_id)
            .map(|entry| entry.operation.as_str());
        match coalesce_operation(previous, &item.operation)? {
            Some(operation) => {
                by_id.insert(
                    item.row_id,
                    CoalescedOutboxRow {
                        operation,
                        row: item.row,
                    },
                );
            }
            None => {
                by_id.remove(&item.row_id);
            }
        }
    }

    let mut changes = TablePushChanges::default();
    for row_id in order {
        let Some(entry) = by_id.remove(&row_id) else {
            continue;
        };
        match entry.operation.as_str() {
            "insert" => {
                let row = entry
                    .row
                    .ok_or_else(|| format!("Inserted sync row {} is missing payload", row_id))?;
                changes.changed_rows.push(row);
            }
            "update" => {
                let row = entry
                    .row
                    .ok_or_else(|| format!("Updated sync row {} is missing payload", row_id))?;
                changes.changed_rows.push(row);
            }
            "delete" => {
                if let Some(row) = entry.row {
                    changes.changed_rows.push(row);
                } else {
                    changes.deleted_ids.push(row_id);
                }
            }
            other => return Err(format!("Unknown sync outbox operation: {}", other)),
        }
    }

    Ok(changes)
}

pub(super) async fn read_unsynced_table_changes_from_outbox_tx(
    conn: &mut SqliteConnection,
    table: &str,
    filter_value: &str,
) -> Result<TableOutboxChanges, String> {
    let query = format!(
        "SELECT t.*, o.id AS __sync_outbox_id, o.operation AS __sync_operation, o.row_id AS __sync_row_id
         FROM sync_outbox o
         LEFT JOIN {table} t ON t.id = o.row_id
         WHERE o.table_name = ?1 AND o.scope_id = ?2 AND o.synced_at IS NULL
         ORDER BY o.changed_at ASC, o.id ASC"
    );
    let rows = sqlx::query(&query)
        .bind(table)
        .bind(filter_value)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| {
            format!(
                "Failed to read unsynced outbox changes for {}: {}",
                table, e
            )
        })?;

    let mut result = Vec::new();
    let mut outbox_ids = Vec::new();
    let mut outbox_ids_by_row_id: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for row in &rows {
        let outbox_id = row
            .try_get::<String, _>("__sync_outbox_id")
            .map_err(|e| format!("Failed to read sync outbox id for {}: {}", table, e))?;
        let operation = row
            .try_get::<String, _>("__sync_operation")
            .map_err(|e| format!("Failed to read sync operation for {}: {}", table, e))?;
        let row_id = row
            .try_get::<String, _>("__sync_row_id")
            .map_err(|e| format!("Failed to read sync row id for {}: {}", table, e))?;
        let mut obj = serde_json::Map::new();
        let mut has_source_row = false;
        for (idx, col) in row.columns().iter().enumerate() {
            let name = col.name().to_string();
            if name.starts_with("__sync_") || LOCAL_ONLY_COLUMNS.contains(&name.as_str()) {
                continue;
            }
            let val = match row.try_get_raw(idx) {
                Ok(_) => sqlite::sqlx_value_to_json(row, idx),
                Err(_) => Value::Null,
            };
            if name == "id" && !val.is_null() {
                has_source_row = true;
            }
            obj.insert(snake_to_camel(&name), val);
        }
        outbox_ids.push(outbox_id.clone());
        outbox_ids_by_row_id
            .entry(row_id.clone())
            .or_default()
            .push(outbox_id);
        result.push(OutboxRowForSync {
            operation,
            row_id,
            row: has_source_row.then_some(Value::Object(obj)),
        });
    }

    Ok(TableOutboxChanges {
        changes: outbox_rows_to_table_changes(result)?,
        outbox_ids,
        outbox_ids_by_row_id,
    })
}

pub(super) async fn mark_rows_synced_by_id_tx(
    conn: &mut SqliteConnection,
    table: &str,
    accepted_ids: &std::collections::HashSet<String>,
) -> Result<(), String> {
    if accepted_ids.is_empty() {
        return Ok(());
    }

    let query = format!(
        "UPDATE {} SET is_synced = 1 WHERE id IN ({})",
        table,
        accepted_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",")
    );
    let mut q = sqlx::query(&query);
    for id in accepted_ids {
        q = q.bind(id);
    }
    q.execute(&mut *conn).await.map_err(|e| {
        format!(
            "Failed to mark accepted rows for {} as synced: {}",
            table, e
        )
    })?;

    Ok(())
}
