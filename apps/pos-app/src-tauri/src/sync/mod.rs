#[allow(dead_code)]
mod sync_proto {
    include!(concat!(env!("OUT_DIR"), "/sakti.sync.v1.rs"));
}

pub use self::pull::PullResult;
pub use self::push::PushResult;

pub mod client_identity;
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
    use super::pull::{resolve_pull_start_cursor_string, PullStartCursor};
    use super::protobuf::DecodedPullTable;
    use super::push::build_upsert_query;
    use super::schema::{outbox_rows_to_table_changes, OutboxRowForSync};
    use super::sync_proto::{SyncPushBatchResponse, SyncRejectedRow, SyncTableAck};
    use serde_json::json;
    use std::collections::{BTreeMap, HashMap};

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
        assert_eq!(
            resolve_pull_start_cursor_string("cursor-42", PullStartCursor::Baseline),
            ""
        );
        assert_eq!(
            resolve_pull_start_cursor_string("cursor-42", PullStartCursor::Stored),
            "cursor-42"
        );
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
    fn rejected_ids_by_table_collects_server_newer_rows() {
        let response = SyncPushBatchResponse {
            tables: vec![SyncTableAck {
                table: "products".to_string(),
                accepted_created_ids: vec![],
                accepted_updated_ids: vec![],
                accepted_deleted_ids: vec![],
                rejected: vec![SyncRejectedRow {
                    id: "product-1".to_string(),
                    reason: "server_newer".to_string(),
                }],
            }],
            server_time: "2026-05-18T00:00:00.000Z".to_string(),
        };

        let rejected = super::push::rejected_ids_by_table(&response);
        assert!(rejected
            .get("products")
            .expect("products rejected ids")
            .contains("product-1"));
    }

    #[test]
    fn idempotency_key_is_deterministic_from_outbox_ids() {
        let first = super::push::generate_idempotency_key_from_outbox_ids(&[
            "outbox-2".to_string(),
            "outbox-1".to_string(),
        ]);
        let second = super::push::generate_idempotency_key_from_outbox_ids(&[
            "outbox-1".to_string(),
            "outbox-2".to_string(),
        ]);
        let different = super::push::generate_idempotency_key_from_outbox_ids(&[
            "outbox-1".to_string(),
            "outbox-3".to_string(),
        ]);

        assert_eq!(first, second);
        assert_ne!(first, different);
    }

    #[test]
    fn sync_client_id_is_created_once_and_reused() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;

            super::client_identity::ensure_sync_client_identity_table(&pool)
                .await
                .expect("client identity table should create");
            let first = super::client_identity::get_or_create_sync_client_id(&pool)
                .await
                .expect("client id should create");
            let second = super::client_identity::get_or_create_sync_client_id(&pool)
                .await
                .expect("client id should load");

            assert_eq!(first, second);
            assert!(!first.trim().is_empty());
        });
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

        assert!(changes.deleted_ids.is_empty());
        assert_eq!(changes.changed_rows.len(), 1);
        assert_eq!(changes.changed_rows[0]["id"], json!("product-1"));
        assert_eq!(
            changes.changed_rows[0]["deletedAt"],
            json!("2026-05-17T00:00:00.000Z")
        );
    }

    async fn test_pool_with_outbox() -> sqlx::SqlitePool {
        let pool = test_pool().await;
        sqlx::query(
            "CREATE TABLE sync_outbox (
                id TEXT PRIMARY KEY NOT NULL,
                table_name TEXT NOT NULL,
                row_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                scope_type TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                changed_at TEXT NOT NULL,
                synced_at TEXT
            )",
        )
        .execute(&pool)
        .await
        .expect("sync_outbox table should create");
        pool
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
                DecodedPullTable {
                    changed_rows: vec![json!({
                        "id": "product-1",
                        "merchantId": "merchant-1",
                        "name": "Kopi",
                        "priceMinorUnits": 15000,
                        "isActive": true,
                        "sortOrder": 7,
                        "createdAt": "2026-05-17T00:00:00.000Z",
                        "updatedAt": "2026-05-17T00:00:00.000Z"
                    })],
                    deleted_ids: vec![],
                },
            );

            let applied = super::pull::apply_pull_batch_tables_tx(
                &mut tx,
                "outlet-1",
                &["products".to_string()],
                &tables_map,
                "2026-05-17T00:00:01.000Z",
                "cursor-42",
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
            let cursor = sqlx::query_scalar::<_, String>(
                "SELECT last_server_watermark FROM sync_cursors WHERE scope_id = 'outlet-1'",
            )
            .fetch_one(&pool)
            .await
            .expect("cursor should exist");

            assert_eq!(applied, 1);
            assert_eq!(row, (15000, 1));
            assert_eq!(cursor, "cursor-42");
        });
    }

    #[test]
    fn soft_delete_row_overwrites_dirty_local_row() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            sqlx::query(
                "INSERT INTO products (id, merchant_id, name, price_minor_units, is_active, sort_order, is_synced, created_at, updated_at)
                 VALUES ('product-1', 'merchant-1', 'Dirty', 15000, 1, 0, 0, '2026-05-17T00:00:00.000Z', '2026-05-19T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert product");

            let mut tx = pool.begin().await.expect("tx");
            super::push::soft_delete_row(
                &mut tx,
                "products",
                "product-1",
                "2026-05-18T00:00:00.000Z",
            )
            .await
            .expect("soft delete");
            tx.commit().await.expect("commit");

            let row = sqlx::query_as::<_, (Option<String>, i64)>(
                "SELECT deleted_at, is_synced FROM products WHERE id = 'product-1'"
            )
            .fetch_one(&pool)
            .await
            .expect("row");

            assert_eq!(row.0.as_deref(), Some("2026-05-18T00:00:00.000Z"));
            assert_eq!(row.1, 1);
        });
    }

    #[test]
    fn apply_pull_deleted_ids_clears_stale_outbox() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_outbox().await;

            sqlx::query(
                "INSERT INTO products (id, merchant_id, name, price_minor_units, is_active, sort_order, is_synced, created_at, updated_at)
                 VALUES ('product-1', 'merchant-1', 'Dirty', 15000, 1, 0, 0, '2026-05-17T00:00:00.000Z', '2026-05-19T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert product");

            sqlx::query(
                "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at)
                 VALUES ('outbox-1', 'products', 'product-1', 'update', 'merchant', 'merchant-1', '2026-05-19T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert outbox");

            let mut tables_map = BTreeMap::new();
            tables_map.insert(
                "products".to_string(),
                DecodedPullTable {
                    changed_rows: vec![],
                    deleted_ids: vec!["product-1".to_string()],
                },
            );

            let mut tx = pool.begin().await.expect("tx");
            let applied = super::pull::apply_pull_batch_tables_tx(
                &mut tx,
                "outlet-1",
                &["products".to_string()],
                &tables_map,
                "2026-05-18T00:00:00.000Z",
                "cursor-42",
            )
            .await
            .expect("apply");
            tx.commit().await.expect("commit");

            assert_eq!(applied, 1);

            let product = sqlx::query_as::<_, (Option<String>, i64)>(
                "SELECT deleted_at, is_synced FROM products WHERE id = 'product-1'"
            )
            .fetch_one(&pool)
            .await
            .expect("product");
            assert_eq!(product.0.as_deref(), Some("2026-05-18T00:00:00.000Z"));
            assert_eq!(product.1, 1);

            let outbox_synced = sqlx::query_scalar::<_, Option<String>>(
                "SELECT synced_at FROM sync_outbox WHERE id = 'outbox-1'"
            )
            .fetch_one(&pool)
            .await
            .expect("outbox row");
            assert!(outbox_synced.is_some());
        });
    }

    #[test]
    fn apply_pull_batch_rolls_back_cursor_when_row_apply_fails() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool().await;
            let mut tx = pool.begin().await.expect("transaction should begin");
            let mut tables_map = BTreeMap::new();
            tables_map.insert(
                "products".to_string(),
                DecodedPullTable {
                    changed_rows: vec![json!({
                        "id": "product-1",
                        "name": "Kopi",
                        "priceMinorUnits": 15000,
                        "isActive": true,
                        "sortOrder": 7,
                        "createdAt": "2026-05-17T00:00:00.000Z",
                        "updatedAt": "2026-05-17T00:00:00.000Z"
                    })],
                    deleted_ids: vec![],
                },
            );

            let result = super::pull::apply_pull_batch_tables_tx(
                &mut tx,
                "outlet-1",
                &["products".to_string()],
                &tables_map,
                "2026-05-17T00:00:01.000Z",
                "cursor-42",
            )
            .await;
            tx.rollback().await.expect("transaction should roll back");

            let cursor = sqlx::query_scalar::<_, Option<String>>(
                "SELECT last_server_watermark FROM sync_cursors WHERE scope_id = 'outlet-1'",
            )
            .fetch_optional(&pool)
            .await
            .expect("cursor read should succeed");

            assert!(result.is_err());
            assert_eq!(cursor, None);
        });
    }

    #[test]
    fn chunk_push_changes_splits_single_large_table() {
        let mut ids = HashMap::new();
        let mut changes = super::protobuf::TablePushChanges::default();

        for i in 0..2500 {
            let row_id = format!("product-{i}");
            changes.changed_rows.push(serde_json::json!({ "id": row_id }));
            ids.insert(row_id.clone(), vec![format!("outbox-{i}")]);
        }

        let chunks = super::push::chunk_pending_push_tables(
            vec![super::push::PendingTablePush {
                table: "products".to_string(),
                changes,
                outbox_ids_by_row_id: ids,
            }],
            2000,
        )
        .expect("chunking should work");

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0][0].changes.changed_rows.len(), 2000);
        assert_eq!(chunks[1][0].changes.changed_rows.len(), 500);
    }

    #[test]
    fn chunk_push_changes_keeps_outbox_ids_with_rows() {
        let mut ids = HashMap::new();
        let mut changes = super::protobuf::TablePushChanges::default();

        for i in 0..3 {
            let row_id = format!("product-{i}");
            changes.changed_rows.push(serde_json::json!({ "id": row_id }));
            ids.insert(row_id.clone(), vec![format!("outbox-{i}")]);
        }

        let chunks = super::push::chunk_pending_push_tables(
            vec![super::push::PendingTablePush {
                table: "products".to_string(),
                changes,
                outbox_ids_by_row_id: ids,
            }],
            2,
        )
        .expect("chunking should work");

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0][0].outbox_ids_by_row_id.len(), 2);
        assert_eq!(chunks[1][0].outbox_ids_by_row_id.len(), 1);
    }
}
