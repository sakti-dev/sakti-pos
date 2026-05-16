use serde_json::Value;
use sqlx::{Column, Row, SqliteConnection, SqlitePool};

use crate::db::sqlite;

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

pub(super) async fn read_unsynced_rows(
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
                Ok(_) => sqlite::sqlx_value_to_json(row, idx),
                Err(_) => Value::Null,
            };
            obj.insert(snake_to_camel(&name), val);
        }
        result.push(Value::Object(obj));
    }
    Ok(result)
}

pub(super) async fn mark_rows_synced_tx(
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
