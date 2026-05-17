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
  rowMessageName: string;
  scope: SyncScope;
  tableName: string;
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
      rowMessageName: "MerchantRow",
      scope: "merchant",
      tableName: "merchants",
    },
    {
      changeMessageName: "OutletChanges",
      currentlyManualTyped: false,
      rowMessageName: "OutletRow",
      scope: "merchant",
      tableName: "outlets",
    },
    {
      changeMessageName: "RegisterChanges",
      currentlyManualTyped: false,
      rowMessageName: "RegisterRow",
      scope: "outlet",
      tableName: "registers",
    },
    {
      changeMessageName: "CategoryChanges",
      currentlyManualTyped: false,
      rowMessageName: "CategoryRow",
      scope: "merchant",
      tableName: "categories",
    },
    {
      changeMessageName: "AssetChanges",
      currentlyManualTyped: false,
      rowMessageName: "AssetRow",
      scope: "merchant",
      tableName: "assets",
    },
    {
      changeMessageName: "ProductChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        price: { protoName: "price_minor_units", protoType: "int64" },
      },
      rowMessageName: "ProductRow",
      scope: "merchant",
      tableName: "products",
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
      rowMessageName: "OrderRow",
      scope: "outlet",
      tableName: "orders",
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
      rowMessageName: "OrderItemRow",
      scope: "outlet",
      tableName: "order_items",
    },
    {
      changeMessageName: "OutletProductChanges",
      currentlyManualTyped: true,
      fieldAliases: {
        price: { protoName: "price_minor_units", protoType: "int64" },
      },
      rowMessageName: "OutletProductRow",
      scope: "outlet",
      tableName: "outlet_products",
    },
    {
      changeMessageName: "StaffChanges",
      currentlyManualTyped: false,
      rowMessageName: "StaffRow",
      scope: "merchant",
      tableName: "staff",
    },
  ],
};
