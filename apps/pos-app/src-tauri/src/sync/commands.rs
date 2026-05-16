use prost::Message;
use tauri::{command, State};

use crate::app::state::AppState;
use crate::time_utils::current_time_iso_string;

use super::dto::SyncNowResult;
use super::local_state::{
    get_last_server_event_id, resolve_merchant_id, set_last_server_event_id_tx, LocalSyncState,
};
use super::outbox::{count_legacy_unsynced_rows, count_pending_outbox, mark_outbox_synced_tx};
use super::protobuf::{build_sync_pull_events_request, protobuf_tables_to_json_map};
use super::pull::{sync_pull_inner, PullResult};
use super::push::{debug_local_table_state, sync_push_inner, upsert_row, PushResult};
use super::schema::{get_filter_value, get_table_filter_column};
use super::{SyncPullEventsResponse, SYNC_TABLES};

#[command]
pub async fn get_sync_local_state(
    outlet_id: String,
    state: State<'_, AppState>,
) -> Result<LocalSyncState, String> {
    let pool = &state.db_pool;
    let merchant_id = resolve_merchant_id(pool, &outlet_id).await?;
    let needs_baseline_sync = merchant_id.is_none();
    let outbox_dirty_count = count_pending_outbox(pool, &outlet_id, &merchant_id).await?;
    let legacy_dirty_count = if needs_baseline_sync {
        0
    } else {
        count_legacy_unsynced_rows(pool, &outlet_id, &merchant_id).await?
    };
    let local_dirty_count = outbox_dirty_count.max(legacy_dirty_count);
    let last_server_event_id = get_last_server_event_id(pool, &outlet_id).await?;

    log::info!(
        "[RUST] [SYNC:TRACE] local_state: outlet_id={}, merchant_id={:?}, needs_baseline_sync={}, outbox_dirty_count={}, legacy_dirty_count={}, dirty_count={}, last_server_event_id={}",
        outlet_id,
        merchant_id,
        needs_baseline_sync,
        outbox_dirty_count,
        legacy_dirty_count,
        local_dirty_count,
        last_server_event_id
    );

    Ok(LocalSyncState {
        local_dirty_count,
        last_server_event_id,
        needs_baseline_sync,
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
    log::info!(
        "[RUST] [SYNC:TRACE] GC: outlet_id={}, merchant_id={:?}",
        outlet_id,
        merchant_id
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
pub async fn sync_push_outbox(
    outlet_id: String,
    api_url: String,
    session_token: String,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    log::info!(
        "[RUST] [SYNC:TRACE] sync_push_outbox: outlet_id={}, api_url={}",
        outlet_id,
        api_url
    );
    let pool = &state.db_pool;
    let merchant_id = resolve_merchant_id(pool, &outlet_id).await?;
    let push = sync_push_inner(pool, &outlet_id, &api_url, &session_token).await?;
    let synced_at = if push.server_time.is_empty() {
        current_time_iso_string()
    } else {
        push.server_time.clone()
    };

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin outbox transaction: {}", e))?;
    let marked = mark_outbox_synced_tx(&mut tx, &outlet_id, &merchant_id, &synced_at).await?;
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit outbox transaction: {}", e))?;
    log::info!(
        "[RUST] [SYNC:TRACE] sync_push_outbox: marked_outbox_synced={}",
        marked
    );

    Ok(SyncNowResult {
        pull: super::dto::empty_pull_result(),
        push,
        purged: 0,
    })
}

#[command]
pub async fn sync_pull_events(
    outlet_id: String,
    api_url: String,
    session_token: String,
    latest_event_id: i64,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    log::info!(
        "[RUST] [SYNC:TRACE] sync_pull_events: outlet_id={}, api_url={}, latest_event_id={}",
        outlet_id,
        api_url,
        latest_event_id
    );
    let pool = &state.db_pool;
    let client = super::http::build_client(&session_token)?;
    let after_event_id = get_last_server_event_id(pool, &outlet_id).await?;
    let url = format!("{}/api/sync/pull-events", api_url);
    log::info!("[RUST] [SYNC:TRACE] sync_pull_events: POST {}", url);
    let request = build_sync_pull_events_request(&outlet_id, after_event_id);
    let request_body = request.encode_to_vec();

    let response = client
        .post(&url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Sync event pull failed: {}", e))?;
    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        log::info!(
            "[RUST] [SYNC:TRACE] sync_pull_events FAILED: status={}, body={}",
            status,
            text
        );
        return Err(format!("Sync event pull failed ({}): {}", status, text));
    }

    let response_body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read event pull response: {}", e))?;
    let pull_response = SyncPullEventsResponse::decode(response_body)
        .map_err(|e| format!("Failed to decode event pull response: {}", e))?;
    if pull_response.needs_full_resync {
        return Err("Event cursor expired; full resync required".to_string());
    }

    let response_latest_event_id = if pull_response.latest_event_id == 0 {
        latest_event_id
    } else {
        pull_response.latest_event_id
    };
    let result = protobuf_tables_to_json_map(pull_response.tables)?;

    let mut total_rows = 0;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin event pull transaction: {}", e))?;
    for table in SYNC_TABLES {
        if let Some(rows) = result.get(table).and_then(|value| value.as_array()) {
            log::info!(
                "[RUST] [SYNC:TRACE] sync_pull_events: table={}, rows_from_server={}",
                table,
                rows.len()
            );
            for row in rows {
                log::info!(
                    "[RUST] [SYNC:TRACE] sync_pull_events row: table={}, row={}",
                    table,
                    super::push::debug_row_summary(row)
                );
                upsert_row(&mut tx, table, row).await?;
                total_rows += 1;
            }
        }
    }

    set_last_server_event_id_tx(&mut tx, &outlet_id, response_latest_event_id).await?;
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit event pull transaction: {}", e))?;

    Ok(SyncNowResult {
        pull: PullResult {
            rows_received: total_rows,
            server_time: String::new(),
        },
        push: super::dto::empty_push_result(),
        purged: 0,
    })
}

#[command]
pub async fn sync_full_resync(
    outlet_id: String,
    api_url: String,
    session_token: String,
    latest_event_id: i64,
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    let result = sync_now(outlet_id.clone(), api_url, session_token, state.clone()).await?;
    let mut tx = state
        .db_pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin full resync cursor transaction: {}", e))?;
    set_last_server_event_id_tx(&mut tx, &outlet_id, latest_event_id).await?;
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit full resync cursor transaction: {}", e))?;
    Ok(result)
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
    state: State<'_, AppState>,
) -> Result<SyncNowResult, String> {
    log::info!(
        "[RUST] [SYNC:TRACE] sync_now: outlet_id={}, api_url={}",
        outlet_id,
        api_url
    );
    let pool = &state.db_pool;
    let pull = sync_pull_inner(pool, &outlet_id, &api_url, &session_token).await?;
    log::info!(
        "[RUST] [SYNC:TRACE] sync_now: pull done, rows_received={}",
        pull.rows_received
    );
    let push = sync_push_inner(pool, &outlet_id, &api_url, &session_token).await?;
    log::info!(
        "[RUST] [SYNC:TRACE] sync_now: push done, server_wins={}",
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
        log::info!(
            "[RUST] [SYNC:TRACE] sync_now GC table: table={}, filter_col={}, filter_value={}, rows_purged={}",
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
