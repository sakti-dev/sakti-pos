use serde_json::Value;
#[allow(dead_code)]
mod sync_proto {
    include!(concat!(env!("OUT_DIR"), "/sakti.sync.v1.rs"));
}

use sync_proto::{SyncPullEventsResponse, SyncPushResponse, SyncServerWin, SyncTableRows};

use self::local_state::choose_pull_since;
use self::protobuf::{
    build_sync_pull_events_request, build_sync_pull_request, build_sync_push_request,
    cursor_gap_requires_full_resync, protobuf_tables_to_json_map, server_wins_to_skip_map,
};

pub use self::pull::PullResult;
pub use self::push::PushResult;

pub mod commands;
pub mod dto;
pub mod http;
pub mod local_state;
pub mod outbox;
pub mod protobuf;
pub mod pull;
pub mod push;
pub mod schema;

const SYNC_TABLES: &[&str] = &[
    "merchants",
    "outlets",
    "registers",
    "categories",
    "assets",
    "products",
    "orders",
    "order_items",
    "outlet_products",
    "staff",
];

const LOCAL_ONLY_COLUMNS: &[&str] = &["is_synced"];
#[cfg(test)]
mod tests {
    use super::push::build_upsert_query;
    use super::*;

    #[test]
    fn chooses_oldest_existing_last_sync_timestamp() {
        let timestamps = vec![
            Some("2026-05-09T11:10:00.000Z".to_string()),
            Some("2026-05-09T11:05:00.000Z".to_string()),
            Some("2026-05-09T11:08:00.000Z".to_string()),
        ];

        assert_eq!(choose_pull_since(timestamps), "2026-05-09T11:05:00.000Z");
    }

    #[test]
    fn falls_back_to_epoch_when_no_table_has_synced() {
        assert_eq!(
            choose_pull_since(vec![None, None]),
            "1970-01-01T00:00:00.000Z"
        );
    }

    #[test]
    fn protobuf_table_rows_decode_json_rows() {
        let tables = vec![SyncTableRows {
            table: "products".to_string(),
            rows_json: r#"[{"id":"product-1"}]"#.to_string(),
        }];

        let result = protobuf_tables_to_json_map(tables).expect("tables should decode");

        assert_eq!(
            result
                .get("products")
                .and_then(|value| value.as_array())
                .map(std::vec::Vec::len),
            Some(1)
        );
    }

    #[test]
    fn build_push_request_encodes_outlet_and_payload_json() {
        let mut tables = serde_json::Map::new();
        tables.insert(
            "products".to_string(),
            serde_json::json!([{ "id": "product-1" }]),
        );

        let request = build_sync_push_request("outlet-1", Value::Object(tables));

        assert_eq!(request.outlet_id, "outlet-1");
        assert!(request.payload_json.contains("product-1"));
    }

    #[test]
    fn push_response_server_wins_to_map_groups_ids_by_table() {
        let response = SyncPushResponse {
            server_time: "2026-05-10T00:00:00.000Z".to_string(),
            server_wins: vec![SyncServerWin {
                table: "products".to_string(),
                ids: vec!["product-1".to_string()],
            }],
        };

        let map = server_wins_to_skip_map(response.server_wins);

        assert!(map
            .get("products")
            .is_some_and(|ids| ids.contains("product-1")));
    }

    #[test]
    fn build_pull_request_carries_tables_and_since_cursor() {
        let request = build_sync_pull_request("outlet-1", "2026-05-10T00:00:00.000Z");

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.since, "2026-05-10T00:00:00.000Z");
        assert!(request.tables.contains(&"products".to_string()));
    }

    #[test]
    fn build_pull_events_request_uses_event_cursor() {
        let request = build_sync_pull_events_request("outlet-1", 42);

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.after_event_id, 42);
    }

    #[test]
    fn detects_cursor_gap_only_when_next_event_is_missing() {
        assert!(!cursor_gap_requires_full_resync(10, Some(11)));
        assert!(cursor_gap_requires_full_resync(10, Some(12)));
        assert!(!cursor_gap_requires_full_resync(0, Some(50)));
        assert!(!cursor_gap_requires_full_resync(10, None));
    }

    #[test]
    fn pull_upsert_keeps_newer_local_dirty_rows() {
        let columns = vec![
            "id".to_string(),
            "deleted_at".to_string(),
            "is_synced".to_string(),
            "updated_at".to_string(),
        ];

        let query = build_upsert_query("categories", &columns);

        assert!(query.contains(
            "WHERE categories.is_synced = 1 OR excluded.updated_at >= categories.updated_at"
        ));
    }
}
