use prost::Message;
use serde_json::Value;
use sqlx::{SqliteConnection, SqlitePool};
use std::collections::BTreeMap;

use super::http::build_client;
use super::local_state::{
    get_last_server_event_id, set_last_server_event_id_tx, set_last_sync_at_tx,
};
use super::protobuf::{
    build_sync_pull_batch_request, decode_pull_batch_response_tables,
    pull_batch_response_has_more, pull_batch_response_latest_event_id,
    pull_batch_response_needs_full_resync, pull_batch_response_next_cursor,
    pull_batch_response_server_time,
};
use super::push::{debug_row_summary, upsert_row};
use super::sync_proto::SyncPullBatchResponse;

#[derive(Debug, serde::Serialize)]
pub struct PullResult {
    pub rows_received: usize,
    pub server_time: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum PullStartCursor {
    Baseline,
    Stored,
}

pub(super) fn resolve_pull_start_event_id(
    stored_event_id: i64,
    start_cursor: PullStartCursor,
) -> i64 {
    match start_cursor {
        PullStartCursor::Baseline => 0,
        PullStartCursor::Stored => stored_event_id,
    }
}

pub(super) async fn apply_pull_batch_tables_tx(
    tx: &mut SqliteConnection,
    outlet_id: &str,
    tables: &[String],
    tables_map: &BTreeMap<String, Value>,
    server_time: &str,
    latest_event_id: i64,
) -> Result<usize, String> {
    let mut rows_received = 0usize;

    for table in tables {
        if let Some(rows) = tables_map.get(table).and_then(|value| value.as_array()) {
            log::info!(
                "[RUST] [SYNC:TRACE] pull_batch: table={}, rows_from_server={}",
                table,
                rows.len()
            );
            for row in rows {
                log::info!(
                    "[RUST] [SYNC:TRACE] pull_batch row: table={}, row={}",
                    table,
                    debug_row_summary(row)
                );
                upsert_row(tx, table, row).await?;
                rows_received += 1;
            }
        }
        set_last_sync_at_tx(tx, table, outlet_id, server_time).await?;
    }

    set_last_server_event_id_tx(tx, outlet_id, latest_event_id).await?;
    Ok(rows_received)
}

pub(super) async fn sync_pull_batch_inner(
    pool: &SqlitePool,
    outlet_id: &str,
    api_url: &str,
    session_token: &str,
    tables: &[String],
    start_cursor: PullStartCursor,
) -> Result<PullResult, String> {
    let client = build_client(session_token)?;
    let stored_event_id = get_last_server_event_id(pool, outlet_id).await?;
    let after_event_id = resolve_pull_start_event_id(stored_event_id, start_cursor);
    let mut total_rows = 0usize;
    let mut page_cursor = String::new();
    let mut server_time = String::new();

    loop {
        log::info!(
            "[RUST] [SYNC:TRACE] pull_batch: outlet_id={}, after_event_id={}, page_cursor={}, tables={}",
            outlet_id,
            after_event_id,
            page_cursor,
            tables.len()
        );

        let url = format!("{}/api/sync/pull", api_url);
        log::info!("[RUST] [SYNC:TRACE] pull_batch: POST {}", url);
        let request =
            build_sync_pull_batch_request(outlet_id, after_event_id, tables, 250, &page_cursor);
        let request_body = request.encode_to_vec();

        let response = client
            .post(&url)
            .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
            .header(reqwest::header::ACCEPT, "application/x-protobuf")
            .body(request_body)
            .send()
            .await
            .map_err(|e| format!("Sync pull batch failed: {}", e))?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            log::info!(
                "[RUST] [SYNC:TRACE] pull_batch FAILED: status={}, body={}",
                status,
                text
            );
            return Err(format!("Sync pull batch failed ({}): {}", status, text));
        }

        let response_body = response
            .bytes()
            .await
            .map_err(|e| format!("Failed to read pull batch response: {}", e))?;
        let pull_response = SyncPullBatchResponse::decode(response_body)
            .map_err(|e| format!("Failed to decode pull batch response: {}", e))?;
        if pull_batch_response_needs_full_resync(&pull_response) {
            return Err("Event cursor expired; full resync required".to_string());
        }

        let page_server_time = pull_batch_response_server_time(&pull_response);
        let page_latest_event_id = pull_batch_response_latest_event_id(&pull_response);
        let has_more = pull_batch_response_has_more(&pull_response);
        let next_cursor = pull_batch_response_next_cursor(&pull_response);
        let tables_map = decode_pull_batch_response_tables(&pull_response)?;

        let mut tx = pool
            .begin()
            .await
            .map_err(|e| format!("Failed to begin pull batch transaction: {}", e))?;

        total_rows += apply_pull_batch_tables_tx(
            &mut tx,
            outlet_id,
            tables,
            &tables_map,
            &page_server_time,
            page_latest_event_id,
        )
        .await?;
        tx.commit()
            .await
            .map_err(|e| format!("Failed to commit pull batch transaction: {}", e))?;

        let _ = server_time.is_empty();
        server_time = page_server_time;
        if !has_more {
            break;
        }
        page_cursor = next_cursor;
    }

    Ok(PullResult {
        rows_received: total_rows,
        server_time,
    })
}
