use sqlx::{SqliteConnection, SqlitePool};

use crate::time_utils::current_time_iso_string;

#[derive(Debug, serde::Serialize)]
pub struct LocalSyncState {
    pub local_dirty_count: i64,
    pub last_server_watermark: String,
    pub needs_baseline_sync: bool,
}

pub(super) async fn resolve_merchant_id(
    pool: &SqlitePool,
    outlet_id: &str,
) -> Result<Option<String>, String> {
    let query = "SELECT merchant_id FROM outlets WHERE id = ?1";
    sqlx::query_scalar::<_, String>(query)
        .bind(outlet_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to resolve merchant_id: {}", e))
}

pub(super) async fn get_last_server_watermark(
    pool: &SqlitePool,
    outlet_id: &str,
) -> Result<String, String> {
    let query = "SELECT last_server_watermark FROM sync_cursors WHERE scope_type = 'outlet' AND scope_id = ?1 ORDER BY updated_at DESC LIMIT 1";
    let value = sqlx::query_scalar::<_, Option<String>>(query)
        .bind(outlet_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get sync cursor: {}", e))?;
    Ok(value.flatten().unwrap_or_default())
}

pub(super) async fn set_last_server_watermark_tx(
    conn: &mut SqliteConnection,
    outlet_id: &str,
    last_server_watermark: &str,
) -> Result<(), String> {
    let now = current_time_iso_string();
    let existing = sqlx::query_scalar::<_, Option<String>>(
        "SELECT last_server_watermark FROM sync_cursors WHERE scope_type = 'outlet' AND scope_id = ?1 LIMIT 1",
    )
    .bind(outlet_id)
    .fetch_optional(&mut *conn)
    .await
    .map_err(|e| format!("Failed to read sync cursor: {}", e))?;

    if existing.is_some() {
        sqlx::query(
            "UPDATE sync_cursors SET last_server_watermark = ?2, updated_at = ?3 WHERE scope_type = 'outlet' AND scope_id = ?1",
        )
        .bind(outlet_id)
        .bind(last_server_watermark)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to update sync cursor: {}", e))?;
    } else {
        sqlx::query(
            "INSERT INTO sync_cursors (scope_type, scope_id, last_server_watermark, updated_at) VALUES ('outlet', ?1, ?2, ?3)",
        )
        .bind(outlet_id)
        .bind(last_server_watermark)
        .bind(&now)
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to insert sync cursor: {}", e))?;
    }
    Ok(())
}

pub(super) async fn set_last_sync_at_tx(
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
