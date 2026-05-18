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

pub(super) async fn mark_outbox_synced_by_outbox_ids_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    outbox_ids: &[String],
) -> Result<u64, String> {
    if outbox_ids.is_empty() {
        return Ok(0);
    }

    let mut builder: QueryBuilder<Sqlite> =
        QueryBuilder::new("UPDATE sync_outbox SET synced_at = ");
    builder
        .push_bind(synced_at)
        .push(" WHERE synced_at IS NULL AND id IN (");
    let mut separated = builder.separated(", ");
    for id in outbox_ids {
        separated.push_bind(id);
    }
    separated.push_unseparated(")");

    let result = builder
        .build()
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Failed to mark sync outbox rows synced by id: {}", e))?;

    Ok(result.rows_affected())
}

pub(super) async fn mark_outbox_synced_by_row_ids_changed_at_or_before_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    ids_by_table: &HashMap<String, HashSet<String>>,
    changed_at_cutoff: &str,
) -> Result<u64, String> {
    mark_outbox_synced_by_row_ids_with_cutoff_tx(
        conn,
        synced_at,
        ids_by_table,
        Some(changed_at_cutoff),
    )
    .await
}

async fn mark_outbox_synced_by_row_ids_with_cutoff_tx(
    conn: &mut SqliteConnection,
    synced_at: &str,
    ids_by_table: &HashMap<String, HashSet<String>>,
    changed_at_cutoff: Option<&str>,
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
        if let Some(cutoff) = changed_at_cutoff {
            builder.push(" AND changed_at <= ").push_bind(cutoff);
        }

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
