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
    fn server_wins_rejected_push_is_reconciled_by_followup_pull() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_outbox().await;
            sqlx::query(
                "INSERT INTO products (id, merchant_id, name, price_minor_units, is_active, sort_order, is_synced, created_at, updated_at)
                 VALUES ('product-1', 'merchant-1', 'Local Stale', 15000, 1, 0, 0, '2026-05-17T00:00:00.000Z', '2026-05-18T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert dirty local product");
            sqlx::query(
                "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at)
                 VALUES ('outbox-stale', 'products', 'product-1', 'update', 'merchant', 'merchant-1', '2026-05-18T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert stale outbox");

            let response = SyncPushBatchResponse {
                tables: vec![SyncTableAck {
                    table: "products".to_string(),
                    rejected: vec![SyncRejectedRow {
                        id: "product-1".to_string(),
                        reason: "server_newer".to_string(),
                    }],
                    ..Default::default()
                }],
                server_time: "2026-05-19T00:00:00.000Z".to_string(),
            };
            let rejected_by_table = super::push::rejected_ids_by_table(&response);
            let rejected_outbox_ids =
                super::push::outbox_ids_for_row_ids_for_test("products", "product-1", &[
                    "outbox-stale".to_string(),
                ], &rejected_by_table);

            let mut tx = pool.begin().await.expect("tx");
            super::outbox::mark_outbox_synced_by_outbox_ids_tx(
                &mut tx,
                &response.server_time,
                &rejected_outbox_ids,
            )
            .await
            .expect("mark rejected outbox synced");

            let mut tables_map = BTreeMap::new();
            tables_map.insert(
                "products".to_string(),
                DecodedPullTable {
                    changed_rows: vec![json!({
                        "id": "product-1",
                        "merchantId": "merchant-1",
                        "name": "Server Winner",
                        "priceMinorUnits": 25000,
                        "isActive": true,
                        "sortOrder": 0,
                        "createdAt": "2026-05-17T00:00:00.000Z",
                        "updatedAt": "2026-05-19T00:00:00.000Z"
                    })],
                    deleted_ids: vec![],
                },
            );
            let applied = super::pull::apply_pull_batch_tables_tx(
                &mut tx,
                "outlet-1",
                &["products".to_string()],
                &tables_map,
                "2026-05-19T00:00:01.000Z",
                "sync:1779235200000:products:product-1",
                "2026-05-19T00:00:00.000Z",
                true,
            )
            .await
            .expect("follow-up pull should apply server row");
            tx.commit().await.expect("commit");

            assert_eq!(applied, 1);
            let product = sqlx::query_as::<_, (String, i64, i64)>(
                "SELECT name, price_minor_units, is_synced FROM products WHERE id = 'product-1'",
            )
            .fetch_one(&pool)
            .await
            .expect("product should exist");
            assert_eq!(product, ("Server Winner".to_string(), 25000, 1));

            let outbox_synced = sqlx::query_scalar::<_, Option<String>>(
                "SELECT synced_at FROM sync_outbox WHERE id = 'outbox-stale'",
            )
            .fetch_one(&pool)
            .await
            .expect("outbox row should exist");
            assert_eq!(
                outbox_synced.as_deref(),
                Some("2026-05-19T00:00:00.000Z")
            );

            let pending_outbox =
                sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sync_outbox WHERE synced_at IS NULL")
                    .fetch_one(&pool)
                    .await
                    .expect("count pending outbox");
            assert_eq!(pending_outbox, 0);

            let cursor = sqlx::query_scalar::<_, String>(
                "SELECT last_server_watermark FROM sync_cursors WHERE scope_id = 'outlet-1'",
            )
            .fetch_one(&pool)
            .await
            .expect("cursor should exist");
            assert_eq!(cursor, "sync:1779235200000:products:product-1");
        });
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
                "2026-05-17T00:00:00.000Z",
                true,
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
                "2026-05-19T00:00:00.000Z",
                true,
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
    fn apply_pull_deleted_ids_keeps_outbox_rows_newer_than_pull_start() {
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
                 VALUES
                 ('outbox-before-pull', 'products', 'product-1', 'update', 'merchant', 'merchant-1', '2026-05-19T00:00:00.000Z'),
                 ('outbox-after-pull', 'products', 'product-1', 'update', 'merchant', 'merchant-1', '2026-05-19T00:00:02.000Z')"
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
            super::pull::apply_pull_batch_tables_tx(
                &mut tx,
                "outlet-1",
                &["products".to_string()],
                &tables_map,
                "2026-05-18T00:00:00.000Z",
                "cursor-42",
                "2026-05-19T00:00:01.000Z",
                true,
            )
            .await
            .expect("apply");
            tx.commit().await.expect("commit");

            let rows = sqlx::query_as::<_, (String, Option<String>)>(
                "SELECT id, synced_at FROM sync_outbox ORDER BY id"
            )
            .fetch_all(&pool)
            .await
            .expect("read outbox");

            assert_eq!(rows[0].0, "outbox-after-pull");
            assert!(rows[0].1.is_none());
            assert_eq!(rows[1].0, "outbox-before-pull");
            assert!(rows[1].1.is_some());
        });
    }

    #[test]
    fn mark_outbox_synced_by_outbox_ids_keeps_newer_same_row_pending() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_outbox().await;
            sqlx::query(
                "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at)
                 VALUES
                 ('outbox-snapshot', 'products', 'product-1', 'update', 'merchant', 'merchant-1', '2026-05-19T00:00:00.000Z'),
                 ('outbox-newer', 'products', 'product-1', 'update', 'merchant', 'merchant-1', '2026-05-19T00:00:01.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert outbox rows");

            let mut tx = pool.begin().await.expect("tx");
            let marked = super::outbox::mark_outbox_synced_by_outbox_ids_tx(
                &mut tx,
                "2026-05-19T00:00:02.000Z",
                &["outbox-snapshot".to_string()],
            )
            .await
            .expect("mark snapshot outbox");
            tx.commit().await.expect("commit");

            assert_eq!(marked, 1);

            let rows = sqlx::query_as::<_, (String, Option<String>)>(
                "SELECT id, synced_at FROM sync_outbox ORDER BY id"
            )
            .fetch_all(&pool)
            .await
            .expect("read outbox rows");

            assert_eq!(rows[0].0, "outbox-newer");
            assert!(rows[0].1.is_none());
            assert_eq!(rows[1].0, "outbox-snapshot");
            assert_eq!(rows[1].1.as_deref(), Some("2026-05-19T00:00:02.000Z"));
        });
    }

    #[test]
    fn mark_rows_synced_by_id_skips_rows_with_pending_outbox() {
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
                 VALUES ('outbox-newer', 'products', 'product-1', 'update', 'merchant', 'merchant-1', '2026-05-19T00:00:01.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert outbox");

            let mut accepted = std::collections::HashSet::new();
            accepted.insert("product-1".to_string());

            let mut tx = pool.begin().await.expect("tx");
            super::schema::mark_rows_synced_by_id_tx(&mut tx, "products", &accepted)
                .await
                .expect("mark row synced");
            tx.commit().await.expect("commit");

            let is_synced = sqlx::query_scalar::<_, i64>(
                "SELECT is_synced FROM products WHERE id = 'product-1'",
            )
            .fetch_one(&pool)
            .await
            .expect("read product");

            assert_eq!(is_synced, 0);
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
                "2026-05-17T00:00:00.000Z",
                true,
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
    fn gc_query_deletes_synced_soft_deleted_rows() {
        tauri::async_runtime::block_on(async {
            let pool = gc_test_pool().await;

            sqlx::query(
                "INSERT INTO products (id, merchant_id, name, price_minor_units, is_active, sort_order, is_synced, created_at, updated_at, deleted_at)
                 VALUES ('p-active', 'merchant-1', 'Active', 100, 1, 0, 1, '2026-05-17T00:00:00.000Z', '2026-05-19T00:00:00.000Z', NULL)"
            )
            .execute(&pool)
            .await
            .expect("insert active product");

            sqlx::query(
                "INSERT INTO products (id, merchant_id, name, price_minor_units, is_active, sort_order, is_synced, created_at, updated_at, deleted_at)
                 VALUES ('p-deleted', 'merchant-1', 'Deleted', 100, 1, 0, 1, '2026-05-17T00:00:00.000Z', '2026-05-19T00:00:00.000Z', '2026-05-18T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("insert deleted product");

            sqlx::query(
                "INSERT INTO orders (id, outlet_id, total_minor_units, status, created_at, updated_at, deleted_at, is_synced)
                 VALUES ('o-deleted', 'outlet-1', 5000, 'completed', '2026-05-17T00:00:00.000Z', '2026-05-19T00:00:00.000Z', '2026-05-18T00:00:00.000Z', 1)"
            )
            .execute(&pool)
            .await
            .expect("insert deleted order");

            let purged = super::commands::run_garbage_collection_for_tables(
                &pool,
                "outlet-1",
                &["products", "orders"],
            )
            .await
            .expect("gc");

            assert_eq!(purged, 2);

            let products: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products")
                .fetch_one(&pool)
                .await
                .expect("count");
            assert_eq!(products, 1);

            let orders: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM orders")
                .fetch_one(&pool)
                .await
                .expect("count");
            assert_eq!(orders, 0);
        });
    }

    async fn gc_test_pool() -> sqlx::SqlitePool {
        let pool = test_pool().await;
        sqlx::query(
            "CREATE TABLE outlets (
                id TEXT PRIMARY KEY NOT NULL,
                merchant_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("outlets table");
        sqlx::query(
            "INSERT INTO outlets (id, merchant_id, name, created_at, updated_at)
             VALUES ('outlet-1', 'merchant-1', 'Test Outlet', '2026-05-17T00:00:00.000Z', '2026-05-17T00:00:00.000Z')"
        )
        .execute(&pool)
        .await
        .expect("insert outlet");

        sqlx::query(
            "CREATE TABLE orders (
                id TEXT PRIMARY KEY NOT NULL,
                outlet_id TEXT NOT NULL,
                total_minor_units INTEGER NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                is_synced INTEGER DEFAULT false NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .expect("orders table");

        pool
    }

    #[test]
    fn read_unsynced_changes_accepts_transaction_connection() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_outbox().await;
            sqlx::query(
                "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at)
                 VALUES ('o1', 'products', 'p1', 'insert', 'merchant', 'merchant-1', '2026-05-17T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("outbox insert");

            let mut tx = pool.begin().await.expect("tx");
            let result = super::schema::read_unsynced_table_changes_from_outbox_tx(
                &mut tx,
                "products",
                "merchant-1",
            )
            .await
            .expect("read");

            assert_eq!(result.outbox_ids_by_row_id.len(), 1);
            tx.rollback().await.expect("rollback");
        });
    }

    #[test]
    fn sync_outbox_pending_unique_index_rejects_duplicate_pending_row() {
        tauri::async_runtime::block_on(async {
            let pool = test_pool_with_outbox().await;
            sqlx::query(
                "CREATE UNIQUE INDEX sync_outbox_pending_row_unique
                 ON sync_outbox (table_name, row_id)
                 WHERE synced_at IS NULL",
            )
            .execute(&pool)
            .await
            .expect("create unique index");

            sqlx::query(
                "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at)
                 VALUES ('o1', 'products', 'p1', 'update', 'merchant', 'merchant-1', '2026-05-17T00:00:00.000Z')"
            )
            .execute(&pool)
            .await
            .expect("first pending insert");

            let duplicate_result = sqlx::query(
                "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at)
                 VALUES ('o2', 'products', 'p1', 'update', 'merchant', 'merchant-1', '2026-05-17T00:00:01.000Z')"
            )
            .execute(&pool)
            .await;

            assert!(duplicate_result.is_err());

            sqlx::query("UPDATE sync_outbox SET synced_at = '2026-05-17T00:00:02.000Z' WHERE id = 'o1'")
                .execute(&pool)
                .await
                .expect("mark synced");

            sqlx::query(
                "INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_type, scope_id, changed_at)
                 VALUES ('o3', 'products', 'p1', 'update', 'merchant', 'merchant-1', '2026-05-17T00:00:03.000Z')"
            )
            .execute(&pool)
            .await
            .expect("new pending insert after sync");
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
            usize::MAX,
            "outlet-1",
            "client-1",
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
            usize::MAX,
            "outlet-1",
            "client-1",
        )
        .expect("chunking should work");

        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0][0].outbox_ids_by_row_id.len(), 2);
        assert_eq!(chunks[1][0].outbox_ids_by_row_id.len(), 1);
    }

    #[test]
    fn chunk_push_changes_splits_by_encoded_bytes() {
        let mut ids = HashMap::new();
        let mut changes = super::protobuf::TablePushChanges::default();

        for i in 0..3 {
            let row_id = format!("product-{i}");
            changes.changed_rows.push(serde_json::json!({
                "id": row_id,
                "merchantId": "merchant-1",
                "name": "x".repeat(512),
                "priceMinorUnits": 15_000,
                "isActive": true,
                "sortOrder": i,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z"
            }));
            ids.insert(row_id.clone(), vec![format!("outbox-{i}")]);
        }

        let chunks = super::push::chunk_pending_push_tables(
            vec![super::push::PendingTablePush {
                table: "products".to_string(),
                changes,
                outbox_ids_by_row_id: ids,
            }],
            2000,
            900,
            "outlet-1",
            "client-1",
        )
        .expect("chunking should work");

        assert!(chunks.len() > 1);
        for chunk in &chunks {
            let bytes = super::push::encoded_push_chunk_len(chunk, "outlet-1", "client-1");
            assert!(bytes <= 900);
        }
    }

    #[test]
    fn split_push_chunk_for_retry_halves_rows_and_preserves_outbox_ids() {
        let mut ids = HashMap::new();
        let mut changes = super::protobuf::TablePushChanges::default();

        for i in 0..4 {
            let row_id = format!("product-{i}");
            changes.changed_rows.push(serde_json::json!({ "id": row_id }));
            ids.insert(row_id.clone(), vec![format!("outbox-{i}")]);
        }

        let split = super::push::split_push_chunk_for_retry(vec![super::push::PendingTablePush {
            table: "products".to_string(),
            changes,
            outbox_ids_by_row_id: ids,
        }])
        .expect("chunk should split");

        assert_eq!(split.len(), 2);
        assert_eq!(split[0][0].changes.changed_rows.len(), 2);
        assert_eq!(split[1][0].changes.changed_rows.len(), 2);
        assert_eq!(split[0][0].outbox_ids_by_row_id.len(), 2);
        assert_eq!(split[1][0].outbox_ids_by_row_id.len(), 2);
    }
}
