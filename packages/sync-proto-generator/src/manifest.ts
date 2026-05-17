export type SyncScope = "merchant" | "outlet";

export interface FieldAlias {
  protoName: string;
  protoType: "bool" | "int64" | "string";
}

export interface SyncTableManifest {
  changeMessageName: string;
  currentlyManualTyped: boolean;
  fieldAliases?: Record<string, FieldAlias>;
  fieldOrder?: string[];
  protoFieldName: string;
  rowMessageName: string;
  rustFieldName: string;
  scope: SyncScope;
  serviceKey: string;
  tableName: string;
  tsProtoFieldName: string;
}

export interface SyncManifest {
  globalExcludeColumns: string[];
  packageName: string;
  requestTypedFieldStart: number;
  tables: SyncTableManifest[];
}

export const syncManifest: SyncManifest = {
  globalExcludeColumns: ["isSynced"],
  packageName: "sakti.sync.v1",
  requestTypedFieldStart: 10,
  tables: [
    {
      changeMessageName: "MerchantChanges",
      currentlyManualTyped: false,
      protoFieldName: "merchants",
      rowMessageName: "MerchantRow",
      rustFieldName: "merchants",
      scope: "merchant",
      serviceKey: "merchants",
      tableName: "merchants",
      tsProtoFieldName: "merchants",
    },
    {
      changeMessageName: "OutletChanges",
      currentlyManualTyped: false,
      protoFieldName: "outlets",
      rowMessageName: "OutletRow",
      rustFieldName: "outlets",
      scope: "merchant",
      serviceKey: "outlets",
      tableName: "outlets",
      tsProtoFieldName: "outlets",
    },
    {
      changeMessageName: "RegisterChanges",
      currentlyManualTyped: false,
      protoFieldName: "registers",
      rowMessageName: "RegisterRow",
      rustFieldName: "registers",
      scope: "outlet",
      serviceKey: "registers",
      tableName: "registers",
      tsProtoFieldName: "registers",
    },
    {
      changeMessageName: "CategoryChanges",
      currentlyManualTyped: false,
      protoFieldName: "categories",
      rowMessageName: "CategoryRow",
      rustFieldName: "categories",
      scope: "merchant",
      serviceKey: "categories",
      tableName: "categories",
      tsProtoFieldName: "categories",
    },
    {
      changeMessageName: "AssetChanges",
      currentlyManualTyped: false,
      protoFieldName: "assets",
      rowMessageName: "AssetRow",
      rustFieldName: "assets",
      scope: "merchant",
      serviceKey: "assets",
      tableName: "assets",
      tsProtoFieldName: "assets",
    },
    {
      changeMessageName: "ProductChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        price: { protoName: "price_minor_units", protoType: "int64" },
      },
      protoFieldName: "products",
      rowMessageName: "ProductRow",
      rustFieldName: "products",
      scope: "merchant",
      serviceKey: "products",
      tableName: "products",
      tsProtoFieldName: "products",
    },
    {
      changeMessageName: "OrderChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        amountPaid: {
          protoName: "amount_paid_minor_units",
          protoType: "int64",
        },
        changeAmount: {
          protoName: "change_amount_minor_units",
          protoType: "int64",
        },
        total: { protoName: "total_minor_units", protoType: "int64" },
      },
      protoFieldName: "orders",
      rowMessageName: "OrderRow",
      rustFieldName: "orders",
      scope: "outlet",
      serviceKey: "orders",
      tableName: "orders",
      tsProtoFieldName: "orders",
    },
    {
      changeMessageName: "OrderItemChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        originalPrice: {
          protoName: "original_price_minor_units",
          protoType: "int64",
        },
        subtotal: { protoName: "subtotal_minor_units", protoType: "int64" },
        unitPrice: { protoName: "unit_price_minor_units", protoType: "int64" },
      },
      fieldOrder: [
        "id",
        "orderId",
        "outletId",
        "productId",
        "productName",
        "quantity",
        "unitPrice",
        "originalPrice",
        "subtotal",
        "deletedAt",
        "createdAt",
        "updatedAt",
      ],
      protoFieldName: "order_items",
      rowMessageName: "OrderItemRow",
      rustFieldName: "order_items",
      scope: "outlet",
      serviceKey: "order_items",
      tableName: "order_items",
      tsProtoFieldName: "orderItems",
    },
    {
      changeMessageName: "OutletProductChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        price: { protoName: "price_minor_units", protoType: "int64" },
      },
      protoFieldName: "outlet_products",
      rowMessageName: "OutletProductRow",
      rustFieldName: "outlet_products",
      scope: "outlet",
      serviceKey: "outlet_products",
      tableName: "outlet_products",
      tsProtoFieldName: "outletProducts",
    },
    {
      changeMessageName: "StaffChanges",
      currentlyManualTyped: false,
      protoFieldName: "staff",
      rowMessageName: "StaffRow",
      rustFieldName: "staff",
      scope: "merchant",
      serviceKey: "staff",
      tableName: "staff",
      tsProtoFieldName: "staff",
    },
  ],
};
