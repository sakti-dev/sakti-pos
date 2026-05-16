use serde_json::Value;

use super::sync_proto::{
    SyncPullEventsRequest, SyncPullRequest, SyncPushRequest, SyncServerWin, SyncTableRows,
};
use super::SYNC_TABLES;

pub(super) fn protobuf_tables_to_json_map(tables: Vec<SyncTableRows>) -> Result<Value, String> {
    let mut map = serde_json::Map::new();
    for table in tables {
        let rows: Value = serde_json::from_str(&table.rows_json)
            .map_err(|e| format!("Failed to parse protobuf rows for {}: {}", table.table, e))?;
        map.insert(table.table, rows);
    }
    Ok(Value::Object(map))
}

pub(super) fn build_sync_push_request(outlet_id: &str, tables: Value) -> SyncPushRequest {
    SyncPushRequest {
        outlet_id: outlet_id.to_string(),
        payload_json: serde_json::to_string(&tables).unwrap_or_else(|_| "{}".to_string()),
    }
}

pub(super) fn server_wins_to_skip_map(
    server_wins: Vec<SyncServerWin>,
) -> std::collections::HashMap<String, std::collections::HashSet<String>> {
    let mut map = std::collections::HashMap::new();
    for win in server_wins {
        map.insert(win.table, win.ids.into_iter().collect());
    }
    map
}

pub(super) fn build_sync_pull_request(outlet_id: &str, since: &str) -> SyncPullRequest {
    SyncPullRequest {
        outlet_id: outlet_id.to_string(),
        tables: SYNC_TABLES.iter().map(|table| table.to_string()).collect(),
        since: since.to_string(),
    }
}

pub(super) fn build_sync_pull_events_request(
    outlet_id: &str,
    after_event_id: i64,
) -> SyncPullEventsRequest {
    SyncPullEventsRequest {
        outlet_id: outlet_id.to_string(),
        after_event_id,
    }
}

#[cfg(test)]
pub(super) fn cursor_gap_requires_full_resync(
    after_event_id: i64,
    oldest_available_event_id: Option<i64>,
) -> bool {
    oldest_available_event_id
        .map(|oldest| after_event_id > 0 && after_event_id + 1 < oldest)
        .unwrap_or(false)
}
