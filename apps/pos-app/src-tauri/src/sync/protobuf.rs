use super::sync_proto::SyncPullBatchRequest;

pub(super) use super::protobuf_generated::{
    build_assets_row_changes as build_asset_changes,
    build_categories_row_changes as build_category_changes,
    build_merchants_row_changes as build_merchant_changes,
    build_order_items_row_changes as build_order_item_changes,
    build_orders_row_changes as build_order_changes,
    build_outlet_products_row_changes as build_outlet_product_changes,
    build_outlets_row_changes as build_outlet_changes,
    build_products_row_changes as build_product_changes,
    build_registers_row_changes as build_register_changes, build_staff_row_changes as build_staff_changes,
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
            changed_rows: vec![json!({
                "id": "product-1",
                "merchantId": "merchant-1",
                "name": "Kopi",
                "priceMinorUnits": 15_000,
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
            Some(build_category_changes(&TablePushChanges {
                changed_rows: vec![json!({
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
            None,
            None,
            None,
            None,
            Some(build_product_changes(&products)),
            None,
            None,
        );

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.idempotency_key, "sync-request-1");
        assert_eq!(
            request
                .categories
                .expect("categories should exist")
                .changed_rows
                .len(),
            1
        );
        assert_eq!(
            request
                .products
                .expect("products should exist")
                .changed_rows
                .len(),
            1
        );
    }

    #[test]
    fn product_changes_do_not_duplicate_rows_across_changed_rows() {
        let products = TablePushChanges {
            changed_rows: vec![json!({
                "id": "product-1",
                "merchantId": "merchant-1",
                "name": "Kopi",
                "priceMinorUnits": 15_000,
                "isActive": true,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        };

        let changes = build_product_changes(&products);

        assert_eq!(changes.changed_rows.len(), 1);
        assert!(changes.deleted_ids.is_empty());
    }

    #[test]
    fn decode_pull_batch_response_turns_deleted_ids_into_tombstone_rows() {
        use super::super::sync_proto::{
            CategoriesChanges as CategoryChanges, ProductsChanges as ProductChanges,
            SyncPullBatchResponse,
        };

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            products: Some(ProductChanges {
                changed_rows: Vec::new(),
                deleted_ids: vec!["product-deleted".to_string()],
            }),
            categories: Some(CategoryChanges {
                changed_rows: Vec::new(),
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
        use super::super::sync_proto::{
            ProductsChanges as ProductChanges, ProductsRow as ProductRow, SyncPullBatchResponse,
        };

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            products: Some(ProductChanges {
                changed_rows: vec![ProductRow {
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

        assert_eq!(tables["products"][0]["priceMinorUnits"], json!(15_000));
        assert_eq!(tables["products"][0]["sortOrder"], json!(3));
        assert!(tables["products"][0].get("price").is_none());
    }

    #[test]
    fn decode_pull_batch_response_maps_typed_order_item_to_local_db_columns() {
        use super::super::sync_proto::{
            OrderItemsChanges as OrderItemChanges, OrderItemsRow as OrderItemRow,
            SyncPullBatchResponse,
        };

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            order_items: Some(OrderItemChanges {
                changed_rows: vec![OrderItemRow {
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

        assert_eq!(
            tables["order_items"][0]["unitPriceMinorUnits"],
            json!(15_000)
        );
        assert_eq!(
            tables["order_items"][0]["originalPriceMinorUnits"],
            json!(20_000)
        );
        assert_eq!(
            tables["order_items"][0]["subtotalMinorUnits"],
            json!(30_000)
        );
        assert!(tables["order_items"][0].get("unitPrice").is_none());
    }

    #[test]
    fn build_sync_push_batch_request_maps_all_sync_tables() {
        let merchants = build_merchant_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "merchant-1",
                "name": "Toko",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let outlets = build_outlet_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "outlet-1",
                "merchantId": "merchant-1",
                "timezone": "Asia/Jakarta",
                "name": "Outlet",
                "isActive": true,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let registers = build_register_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "register-1",
                "outletId": "outlet-1",
                "name": "Kasir",
                "shortId": "R1",
                "isActive": true,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let categories = build_category_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "cat-1",
                "merchantId": "merchant-1",
                "name": "Minuman",
                "sortOrder": 1,
                "isActive": true,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let assets = build_asset_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "asset-1",
                "merchantId": "merchant-1",
                "objectKey": "assets/1",
                "contentType": "image/jpeg",
                "byteSize": 123,
                "contentHash": "hash",
                "kind": "product_photo",
                "width": 10,
                "height": 20,
                "status": "ready",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let products = build_product_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "product-1",
                "merchantId": "merchant-1",
                "name": "Kopi",
                "priceMinorUnits": 15_000,
                "isActive": true,
                "sortOrder": 1,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let orders = build_order_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "order-1",
                "outletId": "outlet-1",
                "orderNumber": "001",
                "totalMinorUnits": 15_000,
                "paymentMethod": "cash",
                "amountPaidMinorUnits": 20_000,
                "changeAmountMinorUnits": 5_000,
                "status": "paid",
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let order_items = build_order_item_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "item-1",
                "orderId": "order-1",
                "outletId": "outlet-1",
                "productName": "Kopi",
                "quantity": 1,
                "unitPriceMinorUnits": 15_000,
                "originalPriceMinorUnits": 15_000,
                "subtotalMinorUnits": 15_000,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let outlet_products = build_outlet_product_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "op-1",
                "outletId": "outlet-1",
                "productId": "product-1",
                "priceMinorUnits": 15_000,
                "isAvailable": true,
                "sortOrder": 1,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });
        let staff = build_staff_changes(&TablePushChanges {
            changed_rows: vec![json!({
                "id": "staff-1",
                "merchantId": "merchant-1",
                "name": "Owner",
                "role": "owner",
                "isActive": true,
                "createdAt": "2026-05-17T00:00:00.000Z",
                "updatedAt": "2026-05-17T00:00:00.000Z",
            })],
            ..Default::default()
        });

        let request = build_sync_push_batch_request(
            "outlet-1",
            "sync-all-tables",
            Some(assets),
            Some(categories),
            Some(merchants),
            Some(order_items),
            Some(orders),
            Some(outlet_products),
            Some(outlets),
            Some(products),
            Some(registers),
            Some(staff),
        );

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.idempotency_key, "sync-all-tables");
        assert!(request.merchants.is_some());
        assert!(request.outlets.is_some());
        assert!(request.registers.is_some());
        assert!(request.categories.is_some());
        assert!(request.assets.is_some());
        assert!(request.products.is_some());
        assert!(request.orders.is_some());
        assert!(request.order_items.is_some());
        assert!(request.outlet_products.is_some());
        assert!(request.staff.is_some());

        assert_eq!(request.merchants.unwrap().changed_rows.len(), 1);
        assert_eq!(request.outlets.unwrap().changed_rows.len(), 1);
        assert_eq!(request.registers.unwrap().changed_rows.len(), 1);
        assert_eq!(request.categories.unwrap().changed_rows.len(), 1);
        assert_eq!(request.assets.unwrap().changed_rows.len(), 1);
        assert_eq!(request.products.unwrap().changed_rows.len(), 1);
        assert_eq!(request.orders.unwrap().changed_rows.len(), 1);
        assert_eq!(request.order_items.unwrap().changed_rows.len(), 1);
        assert_eq!(request.outlet_products.unwrap().changed_rows.len(), 1);
        assert_eq!(request.staff.unwrap().changed_rows.len(), 1);
    }

    #[test]
    fn decode_pull_batch_response_maps_all_sync_tables() {
        use super::super::sync_proto::{
            AssetsChanges as AssetChanges, AssetsRow as AssetRow,
            CategoriesChanges as CategoryChanges, CategoriesRow as CategoryRow,
            MerchantsChanges as MerchantChanges, MerchantsRow as MerchantRow,
            OrderItemsChanges as OrderItemChanges, OrderItemsRow as OrderItemRow,
            OrdersChanges as OrderChanges, OrdersRow as OrderRow,
            OutletProductsChanges as OutletProductChanges, OutletProductsRow as OutletProductRow,
            OutletsChanges as OutletChanges, OutletsRow as OutletRow,
            ProductsChanges as ProductChanges, ProductsRow as ProductRow,
            RegistersChanges as RegisterChanges, RegistersRow as RegisterRow, StaffChanges,
            StaffRow, SyncPullBatchResponse,
        };

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            merchants: Some(MerchantChanges {
                changed_rows: vec![MerchantRow {
                    id: "merchant-1".to_string(),
                    name: "Toko".to_string(),
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            outlets: Some(OutletChanges {
                changed_rows: vec![OutletRow {
                    id: "outlet-1".to_string(),
                    merchant_id: "merchant-1".to_string(),
                    timezone: "Asia/Jakarta".to_string(),
                    name: "Outlet".to_string(),
                    is_active: true,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            registers: Some(RegisterChanges {
                changed_rows: vec![RegisterRow {
                    id: "register-1".to_string(),
                    outlet_id: "outlet-1".to_string(),
                    name: "Kasir".to_string(),
                    short_id: "R1".to_string(),
                    is_active: true,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            categories: Some(CategoryChanges {
                changed_rows: vec![CategoryRow {
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
            assets: Some(AssetChanges {
                changed_rows: vec![AssetRow {
                    id: "asset-1".to_string(),
                    merchant_id: "merchant-1".to_string(),
                    object_key: "assets/1".to_string(),
                    content_type: "image/jpeg".to_string(),
                    byte_size: 123,
                    content_hash: "hash".to_string(),
                    kind: "product_photo".to_string(),
                    width: 10,
                    height: 20,
                    status: "ready".to_string(),
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            products: Some(ProductChanges {
                changed_rows: vec![ProductRow {
                    id: "product-1".to_string(),
                    merchant_id: "merchant-1".to_string(),
                    name: "Kopi".to_string(),
                    price_minor_units: 15_000,
                    is_active: true,
                    sort_order: 1,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            orders: Some(OrderChanges {
                changed_rows: vec![OrderRow {
                    id: "order-1".to_string(),
                    outlet_id: "outlet-1".to_string(),
                    order_number: "001".to_string(),
                    total_minor_units: 15_000,
                    payment_method: "cash".to_string(),
                    amount_paid_minor_units: 20_000,
                    change_amount_minor_units: 5_000,
                    status: "paid".to_string(),
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            order_items: Some(OrderItemChanges {
                changed_rows: vec![OrderItemRow {
                    id: "item-1".to_string(),
                    order_id: "order-1".to_string(),
                    outlet_id: "outlet-1".to_string(),
                    product_name: "Kopi".to_string(),
                    quantity: 1,
                    unit_price_minor_units: 15_000,
                    original_price_minor_units: 15_000,
                    subtotal_minor_units: 15_000,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            outlet_products: Some(OutletProductChanges {
                changed_rows: vec![OutletProductRow {
                    id: "op-1".to_string(),
                    outlet_id: "outlet-1".to_string(),
                    product_id: "product-1".to_string(),
                    price_minor_units: 15_000,
                    is_available: true,
                    sort_order: 1,
                    created_at: "2026-05-17T00:00:00.000Z".to_string(),
                    updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            staff: Some(StaffChanges {
                changed_rows: vec![StaffRow {
                    id: "staff-1".to_string(),
                    merchant_id: "merchant-1".to_string(),
                    name: "Owner".to_string(),
                    role: "owner".to_string(),
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

        assert!(tables.contains_key("merchants"));
        assert!(tables.contains_key("outlets"));
        assert!(tables.contains_key("registers"));
        assert!(tables.contains_key("categories"));
        assert!(tables.contains_key("assets"));
        assert!(tables.contains_key("products"));
        assert!(tables.contains_key("orders"));
        assert!(tables.contains_key("order_items"));
        assert!(tables.contains_key("outlet_products"));
        assert!(tables.contains_key("staff"));

        assert_eq!(tables["merchants"][0]["name"], json!("Toko"));
        assert_eq!(tables["products"][0]["priceMinorUnits"], json!(15_000));
        assert_eq!(tables["orders"][0]["totalMinorUnits"], json!(15_000));
        assert_eq!(
            tables["order_items"][0]["unitPriceMinorUnits"],
            json!(15_000)
        );
        assert_eq!(
            tables["outlet_products"][0]["priceMinorUnits"],
            json!(15_000)
        );
        assert_eq!(tables["assets"][0]["byteSize"], json!(123));
        assert_eq!(tables["categories"][0]["sortOrder"], json!(1));
        assert_eq!(tables["staff"][0]["role"], json!("owner"));
    }

    #[test]
    fn decode_pull_batch_response_maps_typed_category_to_local_db_columns() {
        use super::super::sync_proto::{
            CategoriesChanges as CategoryChanges, CategoriesRow as CategoryRow,
            SyncPullBatchResponse,
        };

        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            categories: Some(CategoryChanges {
                changed_rows: vec![CategoryRow {
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
