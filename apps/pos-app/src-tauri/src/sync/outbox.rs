use sqlx::{QueryBuilder, Sqlite, SqliteConnection, SqlitePool};
use std::collections::{HashMap, HashSet};

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

pub(super) async fn mark_outbox_synced_by_accepted_ids_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    accepted_ids_by_table: &HashMap<String, HashSet<String>>,
) -> Result<u64, String> {
    mark_outbox_synced_by_row_ids_tx(conn, synced_at, accepted_ids_by_table).await
}

pub(super) async fn mark_outbox_synced_by_row_ids_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    ids_by_table: &HashMap<String, HashSet<String>>,
) -> Result<u64, String> {
    let mut marked = 0_u64;
    for (table_name, row_ids) in ids_by_table {
        if row_ids.is_empty() {
            continue;
        }

        let mut builder: QueryBuilder<Sqlite> =
            QueryBuilder::new("UPDATE sync_outbox SET synced_at = ");
        builder
            .push_bind(synced_at)
            .push(" WHERE synced_at IS NULL AND table_name = ")
            .push_bind(table_name)
            .push(" AND row_id IN (");
        let mut separated = builder.separated(", ");
        for id in row_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");

        let result = builder.build().execute(&mut *conn).await.map_err(|e| {
            format!(
                "Failed to mark sync outbox rows synced for {}: {}",
                table_name, e
            )
        })?;
        marked += result.rows_affected();
    }

    Ok(marked)
}
