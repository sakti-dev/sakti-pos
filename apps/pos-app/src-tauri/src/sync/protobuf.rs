use serde_json::Value;
use std::convert::TryFrom;

use super::sync_proto::{
    OrderChanges, OrderItemChanges, OrderItemRow, OrderRow, OutletProductChanges,
    OutletProductRow, ProductChanges, ProductRow, SyncJsonTableChanges, SyncPullBatchRequest,
    SyncPullBatchResponse, SyncPushBatchRequest,
};

#[derive(Debug, Clone, Default)]
pub(super) struct TablePushChanges {
    pub created: Vec<Value>,
    pub updated: Vec<Value>,
    pub deleted_ids: Vec<String>,
}

pub(super) fn build_json_table_changes(
    table: &str,
    changes: &TablePushChanges,
) -> SyncJsonTableChanges {
    SyncJsonTableChanges {
        table: table.to_string(),
        created_json: changes
            .created
            .iter()
            .map(|row| serde_json::to_string(row).unwrap_or_else(|_| "{}".to_string()))
            .collect(),
        updated_json: changes
            .updated
            .iter()
            .map(|row| serde_json::to_string(row).unwrap_or_else(|_| "{}".to_string()))
            .collect(),
        deleted_ids: changes.deleted_ids.clone(),
    }
}

fn value_to_string(row: &Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(value) = row.get(key) {
            if let Some(string) = value.as_str() {
                return string.to_string();
            }
            if let Some(number) = value.as_i64() {
                return number.to_string();
            }
            if let Some(number) = value.as_u64() {
                return number.to_string();
            }
            if let Some(boolean) = value.as_bool() {
                return boolean.to_string();
            }
        }
    }
    String::new()
}

fn value_to_bool(row: &Value, keys: &[&str]) -> bool {
    for key in keys {
        if let Some(value) = row.get(key) {
            if let Some(boolean) = value.as_bool() {
                return boolean;
            }
            if let Some(number) = value.as_i64() {
                return number != 0;
            }
            if let Some(string) = value.as_str() {
                if let Ok(parsed) = string.parse::<bool>() {
                    return parsed;
                }
                if let Ok(parsed) = string.parse::<i64>() {
                    return parsed != 0;
                }
            }
        }
    }
    false
}

fn value_to_i64(row: &Value, keys: &[&str]) -> i64 {
    for key in keys {
        if let Some(value) = row.get(key) {
            if let Some(number) = value.as_i64() {
                return number;
            }
            if let Some(number) = value.as_u64() {
                return i64::try_from(number).unwrap_or(0);
            }
            if let Some(string) = value.as_str() {
                if let Ok(parsed) = string.parse::<i64>() {
                    return parsed;
                }
            }
        }
    }
    0
}

fn product_row_from_value(row: &Value) -> ProductRow {
    ProductRow {
        id: value_to_string(row, &["id"]),
        merchant_id: value_to_string(row, &["merchantId", "merchant_id"]),
        category_id: value_to_string(row, &["categoryId", "category_id"]),
        name: value_to_string(row, &["name"]),
        price_minor_units: value_to_i64(row, &["priceMinorUnits", "price"]),
        image_url: value_to_string(row, &["imageUrl", "image_url"]),
        image_asset_id: value_to_string(row, &["imageAssetId", "image_asset_id"]),
        is_active: value_to_bool(row, &["isActive", "is_active"]),
        sort_order: value_to_i64(row, &["sortOrder", "sort_order"]),
        deleted_at: value_to_string(row, &["deletedAt", "deleted_at"]),
        created_at: value_to_string(row, &["createdAt", "created_at"]),
        updated_at: value_to_string(row, &["updatedAt", "updated_at"]),
    }
}

fn outlet_product_row_from_value(row: &Value) -> OutletProductRow {
    OutletProductRow {
        id: value_to_string(row, &["id"]),
        outlet_id: value_to_string(row, &["outletId", "outlet_id"]),
        product_id: value_to_string(row, &["productId", "product_id"]),
        price_minor_units: value_to_i64(row, &["priceMinorUnits", "price"]),
        is_available: value_to_bool(row, &["isAvailable", "is_available"]),
        sort_order: value_to_i64(row, &["sortOrder", "sort_order"]),
        deleted_at: value_to_string(row, &["deletedAt", "deleted_at"]),
        created_at: value_to_string(row, &["createdAt", "created_at"]),
        updated_at: value_to_string(row, &["updatedAt", "updated_at"]),
    }
}

fn order_row_from_value(row: &Value) -> OrderRow {
    OrderRow {
        id: value_to_string(row, &["id"]),
        outlet_id: value_to_string(row, &["outletId", "outlet_id"]),
        register_id: value_to_string(row, &["registerId", "register_id"]),
        staff_id: value_to_string(row, &["staffId", "staff_id"]),
        order_number: value_to_string(row, &["orderNumber", "order_number"]),
        total_minor_units: value_to_i64(row, &["totalMinorUnits", "total"]),
        payment_method: value_to_string(row, &["paymentMethod", "payment_method"]),
        amount_paid_minor_units: value_to_i64(
            row,
            &["amountPaidMinorUnits", "amountPaid", "amount_paid"],
        ),
        change_amount_minor_units: value_to_i64(
            row,
            &["changeAmountMinorUnits", "changeAmount", "change_amount"],
        ),
        status: value_to_string(row, &["status"]),
        deleted_at: value_to_string(row, &["deletedAt", "deleted_at"]),
        created_at: value_to_string(row, &["createdAt", "created_at"]),
        updated_at: value_to_string(row, &["updatedAt", "updated_at"]),
    }
}

fn order_item_row_from_value(row: &Value) -> OrderItemRow {
    OrderItemRow {
        id: value_to_string(row, &["id"]),
        order_id: value_to_string(row, &["orderId", "order_id"]),
        outlet_id: value_to_string(row, &["outletId", "outlet_id"]),
        product_id: value_to_string(row, &["productId", "product_id"]),
        product_name: value_to_string(row, &["productName", "product_name"]),
        quantity: value_to_i64(row, &["quantity"]),
        unit_price_minor_units: value_to_i64(row, &["unitPriceMinorUnits", "unitPrice"]),
        original_price_minor_units: value_to_i64(
            row,
            &["originalPriceMinorUnits", "originalPrice"],
        ),
        subtotal_minor_units: value_to_i64(row, &["subtotalMinorUnits", "subtotal"]),
        deleted_at: value_to_string(row, &["deletedAt", "deleted_at"]),
        created_at: value_to_string(row, &["createdAt", "created_at"]),
        updated_at: value_to_string(row, &["updatedAt", "updated_at"]),
    }
}

pub(super) fn build_product_changes(changes: &TablePushChanges) -> ProductChanges {
    ProductChanges {
        created: changes
            .created
            .iter()
            .map(product_row_from_value)
            .collect::<Vec<_>>(),
        deleted_ids: changes.deleted_ids.clone(),
        updated: changes
            .updated
            .iter()
            .map(product_row_from_value)
            .collect::<Vec<_>>(),
    }
}

pub(super) fn build_outlet_product_changes(changes: &TablePushChanges) -> OutletProductChanges {
    OutletProductChanges {
        created: changes
            .created
            .iter()
            .map(outlet_product_row_from_value)
            .collect::<Vec<_>>(),
        deleted_ids: changes.deleted_ids.clone(),
        updated: changes
            .updated
            .iter()
            .map(outlet_product_row_from_value)
            .collect::<Vec<_>>(),
    }
}

pub(super) fn build_order_changes(changes: &TablePushChanges) -> OrderChanges {
    OrderChanges {
        created: changes
            .created
            .iter()
            .map(order_row_from_value)
            .collect::<Vec<_>>(),
        deleted_ids: changes.deleted_ids.clone(),
        updated: changes
            .updated
            .iter()
            .map(order_row_from_value)
            .collect::<Vec<_>>(),
    }
}

pub(super) fn build_order_item_changes(changes: &TablePushChanges) -> OrderItemChanges {
    OrderItemChanges {
        created: changes
            .created
            .iter()
            .map(order_item_row_from_value)
            .collect::<Vec<_>>(),
        deleted_ids: changes.deleted_ids.clone(),
        updated: changes
            .updated
            .iter()
            .map(order_item_row_from_value)
            .collect::<Vec<_>>(),
    }
}

pub(super) fn build_sync_push_batch_request(
    outlet_id: &str,
    idempotency_key: &str,
    json_tables: Vec<SyncJsonTableChanges>,
    products: Option<ProductChanges>,
    outlet_products: Option<OutletProductChanges>,
    orders: Option<OrderChanges>,
    order_items: Option<OrderItemChanges>,
) -> SyncPushBatchRequest {
    SyncPushBatchRequest {
        outlet_id: outlet_id.to_string(),
        idempotency_key: idempotency_key.to_string(),
        json_tables,
        products,
        outlet_products,
        orders,
        order_items,
    }
}

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

fn empty_string_to_null(value: &str) -> Value {
    if value.is_empty() {
        Value::Null
    } else {
        Value::String(value.to_string())
    }
}

fn product_row_to_value(row: &ProductRow) -> Value {
    serde_json::json!({
        "id": row.id,
        "merchantId": row.merchant_id,
        "categoryId": empty_string_to_null(&row.category_id),
        "name": row.name,
        "price": row.price_minor_units,
        "imageUrl": empty_string_to_null(&row.image_url),
        "imageAssetId": empty_string_to_null(&row.image_asset_id),
        "isActive": row.is_active,
        "sortOrder": row.sort_order,
        "deletedAt": empty_string_to_null(&row.deleted_at),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn outlet_product_row_to_value(row: &OutletProductRow) -> Value {
    serde_json::json!({
        "id": row.id,
        "outletId": row.outlet_id,
        "productId": row.product_id,
        "price": row.price_minor_units,
        "isAvailable": row.is_available,
        "sortOrder": row.sort_order,
        "deletedAt": empty_string_to_null(&row.deleted_at),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn order_row_to_value(row: &OrderRow) -> Value {
    serde_json::json!({
        "id": row.id,
        "outletId": row.outlet_id,
        "registerId": row.register_id,
        "staffId": row.staff_id,
        "orderNumber": row.order_number,
        "total": row.total_minor_units,
        "paymentMethod": row.payment_method,
        "amountPaid": row.amount_paid_minor_units,
        "changeAmount": row.change_amount_minor_units,
        "status": row.status,
        "deletedAt": empty_string_to_null(&row.deleted_at),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn order_item_row_to_value(row: &OrderItemRow) -> Value {
    serde_json::json!({
        "id": row.id,
        "orderId": row.order_id,
        "outletId": row.outlet_id,
        "productId": empty_string_to_null(&row.product_id),
        "productName": row.product_name,
        "quantity": row.quantity,
        "unitPrice": row.unit_price_minor_units,
        "originalPrice": row.original_price_minor_units,
        "subtotal": row.subtotal_minor_units,
        "deletedAt": empty_string_to_null(&row.deleted_at),
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    })
}

fn typed_rows_to_json_values<T>(
    created: &[T],
    updated: &[T],
    deleted_ids: &[String],
    server_time: &str,
    mapper: impl Fn(&T) -> Value,
) -> Vec<Value> {
    let mut rows = created.iter().chain(updated.iter()).map(mapper).collect::<Vec<_>>();
    rows.extend(
        deleted_ids
            .iter()
            .map(|id| serde_json::json!({ "id": id, "deletedAt": server_time })),
    );
    rows
}

pub(super) fn decode_pull_batch_response_tables(
    response: &SyncPullBatchResponse,
) -> Result<std::collections::BTreeMap<String, Value>, String> {
    let mut map = std::collections::BTreeMap::new();

    for table in &response.json_tables {
        let created_rows: Vec<Value> = table
            .created_json
            .iter()
            .map(|row| {
                serde_json::from_str(row).map_err(|e| {
                    format!(
                        "Failed to parse created JSON row for {}: {}",
                        table.table, e
                    )
                })
            })
            .collect::<Result<_, _>>()?;
        let updated_rows: Vec<Value> = table
            .updated_json
            .iter()
            .map(|row| {
                serde_json::from_str(row).map_err(|e| {
                    format!(
                        "Failed to parse updated JSON row for {}: {}",
                        table.table, e
                    )
                })
            })
            .collect::<Result<_, _>>()?;

        let mut rows = created_rows;
        rows.extend(updated_rows);
        rows.extend(
            table
                .deleted_ids
                .iter()
                .map(|id| serde_json::json!({ "id": id, "deletedAt": response.server_time })),
        );
        map.insert(table.table.clone(), Value::Array(rows));
    }

    if let Some(changes) = &response.products {
        map.insert(
            "products".to_string(),
            Value::Array(typed_rows_to_json_values(
                &changes.created,
                &changes.updated,
                &changes.deleted_ids,
                &response.server_time,
                product_row_to_value,
            )),
        );
    }
    if let Some(changes) = &response.outlet_products {
        map.insert(
            "outlet_products".to_string(),
            Value::Array(typed_rows_to_json_values(
                &changes.created,
                &changes.updated,
                &changes.deleted_ids,
                &response.server_time,
                outlet_product_row_to_value,
            )),
        );
    }
    if let Some(changes) = &response.orders {
        map.insert(
            "orders".to_string(),
            Value::Array(typed_rows_to_json_values(
                &changes.created,
                &changes.updated,
                &changes.deleted_ids,
                &response.server_time,
                order_row_to_value,
            )),
        );
    }
    if let Some(changes) = &response.order_items {
        map.insert(
            "order_items".to_string(),
            Value::Array(typed_rows_to_json_values(
                &changes.created,
                &changes.updated,
                &changes.deleted_ids,
                &response.server_time,
                order_item_row_to_value,
            )),
        );
    }

    Ok(map)
}

pub(super) fn pull_batch_response_has_more(response: &SyncPullBatchResponse) -> bool {
    response.has_more
}

pub(super) fn pull_batch_response_next_cursor(response: &SyncPullBatchResponse) -> String {
    response.next_page_cursor.clone()
}

pub(super) fn pull_batch_response_latest_event_id(response: &SyncPullBatchResponse) -> i64 {
    response.latest_event_id
}

pub(super) fn pull_batch_response_server_time(response: &SyncPullBatchResponse) -> String {
    response.server_time.clone()
}

pub(super) fn pull_batch_response_needs_full_resync(response: &SyncPullBatchResponse) -> bool {
    response.needs_full_resync
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn build_sync_push_batch_request_includes_idempotency_key() {
        let json_tables = vec![build_json_table_changes(
            "categories",
            &TablePushChanges {
                created: vec![json!({ "id": "cat-1" })],
                ..Default::default()
            },
        )];
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
            json_tables,
            Some(build_product_changes(&products)),
            None,
            None,
            None,
        );

        assert_eq!(request.outlet_id, "outlet-1");
        assert_eq!(request.idempotency_key, "sync-request-1");
        assert_eq!(request.json_tables.len(), 1);
        assert_eq!(request.products.expect("products should exist").created.len(), 1);
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
        let response = SyncPullBatchResponse {
            server_time: "2026-05-17T00:00:00.000Z".to_string(),
            products: Some(ProductChanges {
                created: Vec::new(),
                updated: Vec::new(),
                deleted_ids: vec!["product-deleted".to_string()],
            }),
            json_tables: vec![SyncJsonTableChanges {
                table: "categories".to_string(),
                created_json: Vec::new(),
                updated_json: Vec::new(),
                deleted_ids: vec!["cat-deleted".to_string()],
            }],
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
}
