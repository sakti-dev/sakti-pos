use sqlx::SqlitePool;
use tauri::{command, State};

use crate::app::state::AppState;

use super::dto::SyncNowResult;
use super::local_state::{get_last_server_watermark, resolve_merchant_id, LocalSyncState};
use super::outbox::count_pending_outbox;
use super::pull::{
    sync_pull_batch_inner, sync_pull_batch_inner_without_watermark_update, PullStartCursor,
};
use super::push::{debug_local_table_state, sync_push_batch_inner};
use super::schema::{get_filter_value, get_table_filter_column};
use super::SYNC_TABLES;

#[command]
pub async fn get_sync_local_state(
    outlet_id: String,
    state: State<'_, AppState>,
) -> Result<LocalSyncState, String> {
    let pool = &state.db_pool;
    let merchant_id = resolve_merchant_id(pool, &outlet_id).await?;
    let needs_baseline_sync = merchant_id.is_none();
    let outbox_dirty_count = count_pending_outbox(pool, &outlet_id, &merchant_id).await?;
    let local_dirty_count = outbox_dirty_count;
    let last_server_watermark = get_last_server_watermark(pool, &outlet_id).await?;

    log::info!(
        "[RUST] [SYNC:TRACE] local_state: outlet_id={}, merchant_id={:?}, needs_baseline_sync={}, outbox_dirty_count={}, dirty_count={}, last_server_watermark={}",
        outlet_id,
        merchant_id,
        needs_baseline_sync,
        outbox_dirty_count,
        local_dirty_count,
        last_server_watermark
    );

    Ok(LocalSyncState {
        local_dirty_count,
        last_server_watermark,
        needs_baseline_sync,
    })
}

#[command]
pub async fn sync_push(
    outlet_id: String,
    api_url: String,
    session_token: String,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    log::info!(
        "[RUST] [SYNC:TRACE] sync_push: outlet_id={}, api_url={}",
        outlet_id,
        api_url
    );
    let push = sync_push_batch_inner(&state.db_pool, &outlet_id, &api_url, &session_token).await?;
    let pull = if push.server_wins_count > 0 {
        log::info!(
            "[RUST] [SYNC:TRACE] sync_push: rejected push rows detected, pulling server versions count={}",
            push.server_wins_count
        );
        sync_pull_batch_inner_without_watermark_update(
            &state.db_pool,
            &outlet_id,
            &api_url,
            &session_token,
            &push.rejected_tables,
            PullStartCursor::Baseline,
        )
        .await?
    } else {
        super::dto::empty_pull_result()
    };
    Ok(SyncNowResult {
        pull,
        push,
        purged: 0,
    })
}

#[command]
pub async fn sync_pull(
    outlet_id: String,
    api_url: String,
    session_token: String,
    tables: Vec<String>,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    log::info!(
        "[RUST] [SYNC:TRACE] sync_pull: outlet_id={}, api_url={}, tables={}",
        outlet_id,
        api_url,
        tables.len()
    );
    let pool = &state.db_pool;
    let pull = sync_pull_batch_inner(
        pool,
        &outlet_id,
        &api_url,
        &session_token,
        &tables,
        PullStartCursor::Stored,
    )
    .await?;
    Ok(SyncNowResult {
        pull,
        push: super::dto::empty_push_result(),
        purged: 0,
    })
}

pub(super) async fn run_garbage_collection_for_tables(
    pool: &SqlitePool,
    outlet_id: &str,
    tables: &[&str],
) -> Result<usize, String> {
    let merchant_id: Option<String> = sqlx::query_scalar::<_, String>(
        "SELECT merchant_id FROM outlets WHERE id = ?1",
    )
    .bind(outlet_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to resolve merchant_id: {}", e))?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin GC transaction: {}", e))?;
    let mut total_purged: usize = 0;

    for table in tables {
        let filter_col = get_table_filter_column(table);
        let filter_value = get_filter_value(table, outlet_id, &merchant_id)?;
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
        log::info!(
            "[RUST] [SYNC:TRACE] GC table: table={}, filter_col={}, filter_value={}, rows_purged={}",
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

#[command]
pub async fn run_garbage_collection(
    outlet_id: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let merchant_id: Option<String> = {
        let query = "SELECT merchant_id FROM outlets WHERE id = ?1";
        sqlx::query_scalar::<_, String>(query)
            .bind(&outlet_id)
            .fetch_optional(&state.db_pool)
            .await
            .map_err(|e| format!("Failed to resolve merchant_id: {}", e))?
    };
    log::info!(
        "[RUST] [SYNC:TRACE] GC: outlet_id={}, merchant_id={:?}",
        outlet_id,
        merchant_id
    );

    let total_purged = run_garbage_collection_for_tables(
        &state.db_pool,
        &outlet_id,
        SYNC_TABLES,
    )
    .await?;

    Ok(total_purged)
}

#[command]
pub async fn sync_full_resync(
    outlet_id: String,
    api_url: String,
    session_token: String,
    tables: Vec<String>,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    log::info!(
        "[RUST] [SYNC:TRACE] sync_full_resync: outlet_id={}, api_url={}, tables={}",
        outlet_id,
        api_url,
        tables.len()
    );
    let effective_tables = if tables.is_empty() {
        SYNC_TABLES.iter().map(|table| table.to_string()).collect()
    } else {
        tables
    };
    let pull = sync_pull_batch_inner(
        &state.db_pool,
        &outlet_id,
        &api_url,
        &session_token,
        &effective_tables,
        PullStartCursor::Baseline,
    )
    .await?;
    let push = sync_push_batch_inner(&state.db_pool, &outlet_id, &api_url, &session_token).await?;

    let total_purged = run_garbage_collection_for_tables(
        &state.db_pool,
        &outlet_id,
        SYNC_TABLES,
    )
    .await?;

    Ok(SyncNowResult {
        pull,
        push,
        purged: total_purged,
    })
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

    log::info!(
        "[RUST] [SYNC:TRACE] purge_synced_outbox: older_than={}, rows_purged={}",
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
    tables: Vec<String>,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    log::info!(
        "[RUST] [SYNC:TRACE] sync_now: outlet_id={}, api_url={}, tables={}",
        outlet_id,
        api_url,
        tables.len()
    );
    let pull = sync_pull_batch_inner(
        &state.db_pool,
        &outlet_id,
        &api_url,
        &session_token,
        &tables,
        PullStartCursor::Stored,
    )
    .await?;
    let push = sync_push_batch_inner(&state.db_pool, &outlet_id, &api_url, &session_token).await?;

    let pull = if push.server_wins_count > 0 {
        log::info!(
            "[RUST] [SYNC:TRACE] sync_now: rejected push rows detected, pulling server versions count={}",
            push.server_wins_count
        );
        sync_pull_batch_inner_without_watermark_update(
            &state.db_pool,
            &outlet_id,
            &api_url,
            &session_token,
            &push.rejected_tables,
            PullStartCursor::Baseline,
        )
        .await?
    } else {
        pull
    };

    let total_purged = run_garbage_collection_for_tables(
        &state.db_pool,
        &outlet_id,
        SYNC_TABLES,
    )
    .await?;

    Ok(SyncNowResult {
        pull,
        push,
        purged: total_purged,
    })
}
