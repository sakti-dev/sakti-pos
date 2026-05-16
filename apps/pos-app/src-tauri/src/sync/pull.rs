use prost::Message;
use sqlx::SqlitePool;

use super::http::build_client;
use super::local_state::{choose_pull_since, get_last_sync_at, set_last_sync_at_tx};
use super::protobuf::{build_sync_pull_request, protobuf_tables_to_json_map};
use super::push::{debug_row_summary, upsert_row};
use super::sync_proto::SyncPullResponse;
use super::SYNC_TABLES;

#[derive(Debug, serde::Serialize)]
pub struct PullResult {
    pub rows_received: usize,
    pub server_time: String,
}

pub(super) async fn sync_pull_inner(
    pool: &SqlitePool,
    outlet_id: &str,
    api_url: &str,
    session_token: &str,
) -> Result<PullResult, String> {
    let client = build_client(session_token)?;

    let mut timestamps = Vec::new();
    for table in SYNC_TABLES {
        timestamps.push(
            get_last_sync_at(pool, table, outlet_id)
                .await
                .unwrap_or(None),
        );
    }
    let since = choose_pull_since(timestamps);
    log::info!(
        "[RUST] [SYNC:TRACE] pull: outlet_id={}, since={}",
        outlet_id,
        since
    );

    let url = format!("{}/api/sync/pull", api_url);
    log::info!("[RUST] [SYNC:TRACE] pull: POST {}", url);
    let request = build_sync_pull_request(outlet_id, &since);
    let request_body = request.encode_to_vec();

    let response = client
        .post(&url)
        .header(reqwest::header::CONTENT_TYPE, "application/x-protobuf")
        .header(reqwest::header::ACCEPT, "application/x-protobuf")
        .body(request_body)
        .send()
        .await
        .map_err(|e| format!("Sync pull failed: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        log::info!(
            "[RUST] [SYNC:TRACE] pull FAILED: status={}, body={}",
            status,
            text
        );
        return Err(format!("Sync pull failed ({}): {}", status, text));
    }

    let response_body = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read pull response: {}", e))?;
    let pull_response = SyncPullResponse::decode(response_body)
        .map_err(|e| format!("Failed to decode pull response: {}", e))?;
    let server_time = pull_response.server_time.clone();
    let result = protobuf_tables_to_json_map(pull_response.tables)?;

    let mut total_rows = 0;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin pull transaction: {}", e))?;

    for table in SYNC_TABLES {
        if let Some(rows) = result.get(table).and_then(|v| v.as_array()) {
            log::info!(
                "[RUST] [SYNC:TRACE] pull: table={}, rows_from_server={}",
                table,
                rows.len()
            );
            for row in rows {
                log::info!(
                    "[RUST] [SYNC:TRACE] pull row: table={}, row={}",
                    table,
                    debug_row_summary(row)
                );
                upsert_row(&mut tx, table, row).await?;
                total_rows += 1;
            }
        } else {
            log::info!(
                "[RUST] [SYNC:TRACE] pull: table={}, no key in response",
                table
            );
        }
    }
    log::info!(
        "[RUST] [SYNC:TRACE] pull: total_rows_upserted={}",
        total_rows
    );

    for table in SYNC_TABLES {
        set_last_sync_at_tx(&mut tx, table, outlet_id, &server_time).await?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit pull transaction: {}", e))?;

    Ok(PullResult {
        rows_received: total_rows,
        server_time,
    })
}
