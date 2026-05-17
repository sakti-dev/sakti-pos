use super::sync_proto::SyncPullBatchRequest;

pub(super) use super::protobuf_generated::{
    build_asset_changes, build_category_changes, build_merchant_changes, build_order_changes,
    build_order_item_changes, build_outlet_changes, build_outlet_product_changes,
    build_product_changes, build_register_changes, build_staff_changes,
    build_sync_push_batch_request, decode_pull_batch_response_tables, pull_batch_response_has_more,
    pull_batch_response_latest_event_id, pull_batch_response_needs_full_resync,
    pull_batch_response_next_cursor, pull_batch_response_server_time, TablePushChanges,
};

pub(super) fn build_sync_pull_batch_request(
    outlet_id: &str,
    after_event_id: i64,
    tables: &[String],
    limit: i32,
    page_cursor: &str,
) -> SyncPullBatchRequest {
    SyncPullBatchRequest {
        outlet_id: outlet_id.to_string(),
        after_event_id,
        tables: tables.to_vec(),
        limit,
        page_cursor: page_cursor.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn build_sync_push_batch_request_includes_idempotency_key() {
        let products = TablePushChanges {
            created: vec![json!({
                "id": "product-1",
                "merchantId": "merchant-1",
                "name": "Kopi",
                "price": 15_000,
                "isActive": true,
                "sortOrder": 1,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        };
        let request = build_sync_push_batch_request(
            "outlet-1",
            "sync-request-1",
            None,
            None,
            None,
            Some(build_category_changes(&TablePushChanges {
                created: vec![json!({
                    "id": "cat-1",
                    "merchantId": "merchant-1",
                    "name": "Minuman",
                    "sortOrder": 1,
                    "isActive": true,
                    "updatedAt": "2026-05-17T00:00:00.000Z",
                })],
                ..Default::default()
            })),
            None,
            Some(build_product_changes(&products)),
            None,
            None,
            None,
            None,
        );

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.idempotency_key, "sync-request-1");
        assert_eq!(
            request
                .categories
                .expect("categories should exist")
                .created
                .len(),
            1
        );
        assert_eq!(
            request
                .products
                .expect("products should exist")
                .created
                .len(),
            1
        );
    }

    #[test]
    fn product_changes_do_not_duplicate_rows_across_created_and_updated() {
        let products = TablePushChanges {
            created: vec![json!({
                "id": "product-1",
                "merchantId": "merchant-1",
                "name": "Kopi",
                "price": 15_000,
                "isActive": true,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        };

        let changes = build_product_changes(&products);

        assert_eq!(changes.created.len(), 1);
        assert!(changes.updated.is_empty());
        assert!(changes.deleted_ids.is_empty());
    }

    #[test]
    fn decode_pull_batch_response_turns_deleted_ids_into_tombstone_rows() {
        use super::super::sync_proto::{
            CategoryChanges, ProductChanges, SyncPullBatchResponse,
        };

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            products: Some(ProductChanges {
                created: Vec::new(),
                updated: Vec::new(),
                deleted_ids: vec!["product-deleted".to_string()],
            }),
            categories: Some(CategoryChanges {
                created: Vec::new(),
                updated: Vec::new(),
                deleted_ids: vec!["cat-deleted".to_string()],
            }),
            ..Default::default()
        };

        let tables = decode_pull_batch_response_tables(&response).expect("response should decode");

        assert_eq!(
            tables["products"][0],
            json!({
                "id": "product-deleted",
                "deletedAt": "2026-05-17T00:00:00.000Z"
            })
        );
        assert_eq!(
            tables["categories"][0],
            json!({
                "id": "cat-deleted",
                "deletedAt": "2026-05-17T00:00:00.000Z"
            })
        );
    }

    #[test]
    fn decode_pull_batch_response_maps_typed_product_to_local_db_columns() {
        use super::super::sync_proto::{ProductChanges, ProductRow, SyncPullBatchResponse};

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            products: Some(ProductChanges {
                created: vec![ProductRow {
                    id: "product-1".to_string(),
                    merchant_id: "merchant-1".to_string(),
                    name: "Kopi".to_string(),
                    price_minor_units: 15_000,
                    sort_order: 3,
                    is_active: true,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            ..Default::default()
        };

        let tables = decode_pull_batch_response_tables(&response).expect("response should decode");

        assert_eq!(tables["products"][0]["price"], json!(15_000));
        assert_eq!(tables["products"][0]["sortOrder"], json!(3));
        assert!(tables["products"][0].get("priceMinorUnits").is_none());
    }

    #[test]
    fn decode_pull_batch_response_maps_typed_order_item_to_local_db_columns() {
        use super::super::sync_proto::{OrderItemChanges, OrderItemRow, SyncPullBatchResponse};

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            order_items: Some(OrderItemChanges {
                created: vec![OrderItemRow {
                    id: "item-1".to_string(),
                    order_id: "order-1".to_string(),
                    outlet_id: "outlet-1".to_string(),
                    product_name: "Kopi".to_string(),
                    quantity: 2,
                    unit_price_minor_units: 15_000,
                    original_price_minor_units: 20_000,
                    subtotal_minor_units: 30_000,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            ..Default::default()
        };

        let tables = decode_pull_batch_response_tables(&response).expect("response should decode");

        assert_eq!(tables["order_items"][0]["unitPrice"], json!(15_000));
        assert_eq!(tables["order_items"][0]["originalPrice"], json!(20_000));
        assert_eq!(tables["order_items"][0]["subtotal"], json!(30_000));
        assert!(tables["order_items"][0].get("unitPriceMinorUnits").is_none());
    }

    #[test]
    fn decode_pull_batch_response_maps_typed_category_to_local_db_columns() {
        use super::super::sync_proto::{CategoryChanges, CategoryRow, SyncPullBatchResponse};

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            categories: Some(CategoryChanges {
                created: vec![CategoryRow {
                    id: "cat-1".to_string(),
                    merchant_id: "merchant-1".to_string(),
                    name: "Minuman".to_string(),
                    sort_order: 1,
                    is_active: true,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            ..Default::default()
        };

        let tables = decode_pull_batch_response_tables(&response).expect("response should decode");

        assert_eq!(tables["categories"][0]["name"], json!("Minuman"));
        assert_eq!(tables["categories"][0]["sortOrder"], json!(1));
        assert_eq!(tables["categories"][0]["isActive"], json!(true));
    }
}
