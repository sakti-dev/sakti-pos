use sqlx::{QueryBuilder, Sqlite, SqliteConnection, SqlitePool};
use std::collections::{HashMap, HashSet};

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

pub(super) async fn mark_outbox_synced_by_accepted_ids_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    accepted_ids_by_table: &HashMap<String, HashSet<String>>,
) -> Result<u64, String> {
    let mut marked = 0_u64;
    for (table_name, accepted_ids) in accepted_ids_by_table {
        if accepted_ids.is_empty() {
            continue;
        }

        let mut builder: QueryBuilder<Sqlite> = QueryBuilder::new(
            "UPDATE sync_outbox SET synced_at = ",
        );
        builder
            .push_bind(synced_at)
            .push(" WHERE synced_at IS NULL AND table_name = ")
            .push_bind(table_name)
            .push(" AND row_id IN (");
        let mut separated = builder.separated(", ");
        for id in accepted_ids {
            separated.push_bind(id);
        }
        separated.push_unseparated(")");

        let result = builder.build().execute(&mut *conn).await.map_err(|e| {
            format!(
                "Failed to mark accepted sync outbox rows synced for {}: {}",
                table_name, e
            )
        })?;
        marked += result.rows_affected();
    }

    Ok(marked)
}
