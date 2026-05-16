use sqlx::{SqliteConnection, SqlitePool};

use super::schema::{get_filter_value, get_table_filter_column};
use super::SYNC_TABLES;

pub(super) async fn count_pending_outbox(
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

pub(super) async fn count_legacy_unsynced_rows(
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

pub(super) async fn mark_outbox_synced_tx(
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
