#[allow(dead_code)]
mod sync_proto {
    include!(concat!(env!("OUT_DIR"), "/sakti.sync.v1.rs"));
}

pub use self::pull::PullResult;
pub use self::push::PushResult;

pub mod commands;
pub mod dto;
pub mod http;
pub mod local_state;
pub mod outbox;
pub mod protobuf;
mod protobuf_generated;
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
    use super::pull::{resolve_pull_start_event_id, PullStartCursor};
    use super::push::build_upsert_query;
    use super::schema::{outbox_rows_to_table_changes, OutboxRowForSync};
    use super::sync_proto::{SyncPushBatchResponse, SyncRejectedRow, SyncTableAck};
    use serde_json::Value;
    use serde_json::json;
    use std::collections::BTreeMap;

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

    #[test]
    fn baseline_pull_start_cursor_uses_zero() {
        assert_eq!(resolve_pull_start_event_id(42, PullStartCursor::Baseline), 0);
        assert_eq!(resolve_pull_start_event_id(42, PullStartCursor::Stored), 42);
    }

    #[test]
    fn accepted_ids_by_table_uses_only_acknowledged_rows() {
        let response = SyncPushBatchResponse {
            tables: vec![SyncTableAck {
                table: "products".to_string(),
                accepted_created_ids: vec!["created-1".to_string()],
                accepted_updated_ids: vec!["updated-1".to_string()],
                accepted_deleted_ids: vec!["deleted-1".to_string()],
                rejected: vec![SyncRejectedRow {
                    id: "rejected-1".to_string(),
                    reason: "server_newer".to_string(),
                }],
            }],
            ..Default::default()
        };

        let accepted = super::push::accepted_ids_by_table(&response);

        assert!(accepted["products"].contains("created-1"));
        assert!(accepted["products"].contains("updated-1"));
        assert!(accepted["products"].contains("deleted-1"));
        assert!(!accepted["products"].contains("rejected-1"));
    }

    #[test]
    fn delete_outbox_row_with_payload_becomes_timestamped_tombstone_update() {
        let changes = outbox_rows_to_table_changes(vec![OutboxRowForSync {
            operation: "delete".to_string(),
            row_id: "product-1".to_string(),
            row: Some(json!({
                "id": "product-1",
                "deletedAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z"
            })),
        }])
        .expect("delete row should group");

        assert!(changes.created.is_empty());
        assert!(changes.deleted_ids.is_empty());
        assert_eq!(changes.updated.len(), 1);
        assert_eq!(changes.updated[0]["id"], json!("product-1"));
        assert_eq!(
            changes.updated[0]["deletedAt"],
            json!("2026-05-17T00:00:00.000Z")
        );
    }

    async fn test_pool() -> sqlx::SqlitePool {
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("test db should open");

        sqlx::query(
            "CREATE TABLE products (
                id TEXT PRIMARY KEY NOT NULL,
                merchant_id TEXT NOT NULL,
                category_id TEXT,
                name TEXT NOT NULL,
                price_minor_units INTEGER NOT NULL,
                image_url TEXT,
                image_asset_id TEXT,
                is_active INTEGER DEFAULT true NOT NULL,
                sort_order INTEGER DEFAULT 0 NOT NULL,
                deleted_at TEXT,
                is_synced INTEGER DEFAULT false NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("products table should create");

        sqlx::query(
            "CREATE TABLE sync_cursors (
                scope_type TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                last_server_event_id INTEGER DEFAULT 0 NOT NULL,
                last_server_watermark TEXT,
                updated_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("sync_cursors table should create");

        sqlx::query(
            "CREATE TABLE sync_meta (
                table_name TEXT NOT NULL,
                outlet_id TEXT NOT NULL,
                last_sync_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("sync_meta table should create");

        pool
    }

    #[test]
    fn apply_pull_batch_writes_typed_product_to_local_columns() {
        tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let mut tx = pool.begin().await.expect("transaction should begin");
        let mut tables_map = BTreeMap::new();
        tables_map.insert(
            "products".to_string(),
            json!([
                {
                    "id": "product-1",
                    "merchantId": "merchant-1",
                    "name": "Kopi",
                    "priceMinorUnits": 15000,
                    "isActive": true,
                    "sortOrder": 7,
                    "createdAt": "2026-05-17T00:00:00.000Z",
                    "updatedAt": "2026-05-17T00:00:00.000Z"
                }
            ]),
        );

        let applied = super::pull::apply_pull_batch_tables_tx(
            &mut tx,
            "outlet-1",
            &["products".to_string()],
            &tables_map,
            "2026-05-17T00:00:01.000Z",
            42,
        )
        .await
        .expect("pull batch should apply");
        tx.commit().await.expect("transaction should commit");

        let row = sqlx::query_as::<_, (i64, i64)>(
            "SELECT price_minor_units, is_synced FROM products WHERE id = 'product-1'",
        )
        .fetch_one(&pool)
        .await
        .expect("product should exist");
        let cursor = sqlx::query_scalar::<_, i64>(
            "SELECT last_server_event_id FROM sync_cursors WHERE scope_id = 'outlet-1'",
        )
        .fetch_one(&pool)
        .await
        .expect("cursor should exist");

        assert_eq!(applied, 1);
        assert_eq!(row, (15000, 1));
        assert_eq!(cursor, 42);
        });
    }

    #[test]
    fn apply_pull_batch_rolls_back_cursor_when_row_apply_fails() {
        tauri::async_runtime::block_on(async {
        let pool = test_pool().await;
        let mut tx = pool.begin().await.expect("transaction should begin");
        let mut tables_map = BTreeMap::<String, Value>::new();
        tables_map.insert(
            "products".to_string(),
            json!([
                {
                    "id": "product-1",
                    "name": "Kopi",
                    "priceMinorUnits": 15000,
                    "isActive": true,
                    "sortOrder": 7,
                    "createdAt": "2026-05-17T00:00:00.000Z",
                    "updatedAt": "2026-05-17T00:00:00.000Z"
                }
            ]),
        );

        let result = super::pull::apply_pull_batch_tables_tx(
            &mut tx,
            "outlet-1",
            &["products".to_string()],
            &tables_map,
            "2026-05-17T00:00:01.000Z",
            42,
        )
        .await;
        tx.rollback().await.expect("transaction should roll back");

        let cursor = sqlx::query_scalar::<_, i64>(
            "SELECT last_server_event_id FROM sync_cursors WHERE scope_id = 'outlet-1'",
        )
        .fetch_optional(&pool)
        .await
        .expect("cursor read should succeed");

        assert!(result.is_err());
        assert_eq!(cursor, None);
        });
    }
}
