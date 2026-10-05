import { localSyncColumns } from "baresync/schema";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    businessType: text("business_type", {
      enum: ["fnb", "retail", "hybrid"],
    })
      .notNull()
      .default("hybrid"),
    ...localSyncColumns(),
  },
  (table) => [index("merchants_is_synced_idx").on(table.isSynced)]
);

export const outlets = sqliteTable(
  "outlets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    timezone: text("timezone").notNull().default("Asia/Jakarta"),
    name: text("name").notNull(),
    address: text("address"),
    receiptName: text("receipt_name"),
    receiptAddress: text("receipt_address"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    useTax: integer("use_tax", { mode: "boolean" }).notNull().default(false),
    taxPercentage: integer("tax_percentage").notNull().default(0),
    useServiceCharge: integer("use_service_charge", { mode: "boolean" })
      .notNull()
      .default(false),
    serviceChargePercentage: integer("service_charge_percentage")
      .notNull()
      .default(0),
    ...localSyncColumns(),
  },
  (table) => [index("outlets_is_synced_idx").on(table.isSynced)]
);

export const registers = sqliteTable(
  "registers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    name: text("name").notNull(),
    shortId: text("short_id").notNull(),
    pairingCode: text("pairing_code"),
    pairingExpiresAt: text("pairing_expires_at"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastSeenAt: text("last_seen_at"),
    ...localSyncColumns(),
  },
  (table) => [index("registers_is_synced_idx").on(table.isSynced)]
);

export const staff = sqliteTable(
  "staff",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    cloudUserId: text("cloud_user_id"),
    outletId: text("outlet_id").references(() => outlets.id),
    name: text("name").notNull(),
    pin: text("pin"),
    role: text("role", { enum: ["cashier", "manager", "owner"] }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...localSyncColumns(),
  },
  (table) => [
    index("staff_is_synced_idx").on(table.isSynced),
    index("staff_merchant_active_idx").on(table.merchantId, table.isActive),
  ]
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...localSyncColumns(),
  },
  (table) => [
    index("categories_is_synced_idx").on(table.isSynced),
    index("categories_merchant_sort_idx").on(table.merchantId, table.sortOrder),
  ]
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    jobId: text("job_id"),
    objectKey: text("object_key"),
    originalFilename: text("original_filename"),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size"),
    contentHash: text("content_hash"),
    kind: text("kind").notNull(),
    width: integer("width"),
    height: integer("height"),
    status: text("status", {
      enum: ["pending", "compressed", "ready", "failed"],
    }).notNull(),
    createdByUserId: text("created_by_user_id"),
    ...localSyncColumns(),
  },
  (table) => [index("assets_is_synced_idx").on(table.isSynced)]
);

export const products = sqliteTable(
  "products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    categoryId: text("category_id").references(() => categories.id),
    name: text("name").notNull(),
    priceMinorUnits: integer("price_minor_units").notNull(),
    imageAssetId: text("image_asset_id").references(() => assets.id),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("products_is_synced_idx").on(table.isSynced),
    index("products_merchant_active_sort_idx").on(
      table.merchantId,
      table.isActive,
      table.sortOrder
    ),
  ]
);

export const outletProducts = sqliteTable(
  "outlet_products",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    priceMinorUnits: integer("price_minor_units"),
    isAvailable: integer("is_available", { mode: "boolean" })
      .notNull()
      .default(true),
    sortOrder: integer("sort_order"),
    ...localSyncColumns(),
  },
  (table) => [
    index("outlet_products_is_synced_idx").on(table.isSynced),
    index("outlet_products_outlet_product_idx").on(
      table.outletId,
      table.productId
    ),
  ]
);

export const modifierGroups = sqliteTable(
  "modifier_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    name: text("name").notNull(),
    selectionType: text("selection_type", {
      enum: ["single", "multi"],
    }).notNull(),
    isRequired: integer("is_required", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("modifier_groups_is_synced_idx").on(table.isSynced),
    index("modifier_groups_merchant_sort_idx").on(
      table.merchantId,
      table.sortOrder
    ),
  ]
);

export const modifierOptions = sqliteTable(
  "modifier_options",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    groupId: text("group_id")
      .notNull()
      .references(() => modifierGroups.id),
    label: text("label").notNull(),
    priceDeltaMinorUnits: integer("price_delta_minor_units")
      .notNull()
      .default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("modifier_options_is_synced_idx").on(table.isSynced),
    index("modifier_options_group_sort_idx").on(table.groupId, table.sortOrder),
  ]
);

export const productModifierGroups = sqliteTable(
  "product_modifier_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    groupId: text("group_id")
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("product_modifier_groups_is_synced_idx").on(table.isSynced),
    index("product_modifier_groups_product_idx").on(
      table.productId,
      table.sortOrder
    ),
    uniqueIndex("product_modifier_groups_product_group_unique").on(
      table.productId,
      table.groupId
    ),
  ]
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    registerId: text("register_id").references(() => registers.id),
    staffId: text("staff_id").references(() => staff.id),
    orderNumber: text("order_number").notNull(),
    totalMinorUnits: integer("total_minor_units").notNull(),
    paymentMethod: text("payment_method", {
      enum: ["cash", "qris", "qris_static", "qris_dynamic"],
    }).notNull(),
    amountPaidMinorUnits: integer("amount_paid_minor_units"),
    changeAmountMinorUnits: integer("change_amount_minor_units"),
    taxMinorUnits: integer("tax_minor_units").notNull().default(0),
    serviceChargeMinorUnits: integer("service_charge_minor_units")
      .notNull()
      .default(0),
    taxPercentage: integer("tax_percentage").notNull().default(0),
    serviceChargePercentage: integer("service_charge_percentage")
      .notNull()
      .default(0),
    status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
    /** Soft-ref to `wallets.id` — wallet the sale deposited into (resolved at checkout). */
    walletId: text("wallet_id"),
    ...localSyncColumns(),
  },
  (table) => [
    uniqueIndex("orders_outlet_number_unique").on(
      table.outletId,
      table.orderNumber
    ),
    index("orders_is_synced_idx").on(table.isSynced),
    index("orders_outlet_created_idx").on(table.outletId, table.createdAt),
  ]
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    productId: text("product_id"),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceMinorUnits: integer("unit_price_minor_units").notNull(),
    originalPriceMinorUnits: integer("original_price_minor_units"),
    subtotalMinorUnits: integer("subtotal_minor_units").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("order_items_is_synced_idx").on(table.isSynced),
    index("order_items_order_idx").on(table.orderId),
  ]
);

export const ingredients = sqliteTable(
  "ingredients",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    name: text("name").notNull(),
    sku: text("sku"),
    unit: text("unit").notNull().default("Pcs"),
    category: text("category"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    ...localSyncColumns(),
  },
  (table) => [
    index("ingredients_is_synced_idx").on(table.isSynced),
    index("ingredients_merchant_active_idx").on(
      table.merchantId,
      table.isActive
    ),
  ]
);

export const ingredientCategories = sqliteTable(
  "ingredient_categories",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("ingredient_categories_is_synced_idx").on(table.isSynced),
    index("ingredient_categories_merchant_sort_idx").on(
      table.merchantId,
      table.sortOrder
    ),
    uniqueIndex("ingredient_categories_merchant_name_unique").on(
      table.merchantId,
      table.name
    ),
  ]
);

export const productIngredients = sqliteTable(
  "product_ingredients",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    ingredientId: text("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    /** Bahan consumed per one unit of the product sold (fractional ok). */
    qtyPerUnit: real("qty_per_unit").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("product_ingredients_is_synced_idx").on(table.isSynced),
    index("product_ingredients_product_idx").on(table.productId),
    uniqueIndex("product_ingredients_product_ingredient_unique").on(
      table.productId,
      table.ingredientId
    ),
  ]
);

export const inventoryStocks = sqliteTable(
  "inventory_stocks",
  {
    id: text("id").primaryKey(),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    targetType: text("target_type", {
      enum: ["product", "ingredient"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    onHandQty: real("on_hand_qty").notNull().default(0),
    lowStockThreshold: real("low_stock_threshold").notNull().default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("inventory_stocks_is_synced_idx").on(table.isSynced),
    index("inventory_stocks_outlet_target_idx").on(
      table.outletId,
      table.targetType,
      table.targetId
    ),
    uniqueIndex("inventory_stocks_outlet_target_unique").on(
      table.outletId,
      table.targetType,
      table.targetId
    ),
  ]
);

export const stocktakes = sqliteTable(
  "stocktakes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    ref: text("ref").notNull(),
    targetType: text("target_type", {
      enum: ["product", "ingredient"],
    }).notNull(),
    reason: text("reason").notNull(),
    countedAt: text("counted_at").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("stocktakes_is_synced_idx").on(table.isSynced),
    index("stocktakes_outlet_counted_idx").on(table.outletId, table.countedAt),
  ]
);

export const stocktakeLines = sqliteTable(
  "stocktake_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    stocktakeId: text("stocktake_id")
      .notNull()
      .references(() => stocktakes.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    targetId: text("target_id").notNull(),
    systemQtyBefore: real("system_qty_before").notNull(),
    countedQty: real("counted_qty").notNull(),
    varianceQty: real("variance_qty").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("stocktake_lines_is_synced_idx").on(table.isSynced),
    index("stocktake_lines_stocktake_idx").on(table.stocktakeId),
  ]
);

export const goodsReceipts = sqliteTable(
  "goods_receipts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    ref: text("ref").notNull(),
    supplierName: text("supplier_name"),
    note: text("note"),
    receivedAt: text("received_at").notNull(),
    ...localSyncColumns(),
  },
  (table) => [
    index("goods_receipts_is_synced_idx").on(table.isSynced),
    index("goods_receipts_outlet_received_idx").on(
      table.outletId,
      table.receivedAt
    ),
  ]
);

export const goodsReceiptLines = sqliteTable(
  "goods_receipt_lines",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    targetId: text("target_id").notNull(),
    receivedQty: real("received_qty").notNull(),
    unitCostMinorUnits: integer("unit_cost_minor_units"),
    ...localSyncColumns(),
  },
  (table) => [
    index("goods_receipt_lines_is_synced_idx").on(table.isSynced),
    index("goods_receipt_lines_receipt_idx").on(table.goodsReceiptId),
  ]
);

export const stockAdjustments = sqliteTable(
  "stock_adjustments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    staffId: text("staff_id")
      .notNull()
      .references(() => staff.id),
    targetType: text("target_type", {
      enum: ["product", "ingredient"],
    }).notNull(),
    targetId: text("target_id").notNull(),
    qtyDelta: real("qty_delta").notNull(),
    reason: text("reason", {
      enum: ["rusak", "hilang", "expired", "hadiah", "sample", "lainnya"],
    }).notNull(),
    note: text("note"),
    ...localSyncColumns(),
  },
  (table) => [
    index("stock_adjustments_is_synced_idx").on(table.isSynced),
    index("stock_adjustments_outlet_target_idx").on(
      table.outletId,
      table.targetId
    ),
  ]
);

export const cashShifts = sqliteTable(
  "cash_shifts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    registerId: text("register_id").references(() => registers.id),
    openedByStaffId: text("opened_by_staff_id")
      .notNull()
      .references(() => staff.id),
    closedByStaffId: text("closed_by_staff_id").references(() => staff.id),
    openedAt: text("opened_at").notNull(),
    closedAt: text("closed_at"),
    initialFloatMinorUnits: integer("initial_float_minor_units")
      .notNull()
      .default(0),
    expectedCashMinorUnits: integer("expected_cash_minor_units")
      .notNull()
      .default(0),
    actualCashMinorUnits: integer("actual_cash_minor_units"),
    differenceMinorUnits: integer("difference_minor_units"),
    status: text("status", { enum: ["open", "closed"] }).notNull(),
    note: text("note"),
    ...localSyncColumns(),
  },
  (table) => [
    index("cash_shifts_is_synced_idx").on(table.isSynced),
    index("cash_shifts_outlet_status_idx").on(table.outletId, table.status),
  ]
);

export const orderItemModifiers = sqliteTable(
  "order_item_modifiers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    orderItemId: text("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    modifierName: text("modifier_name").notNull(),
    modifierGroup: text("modifier_group"),
    priceDeltaMinorUnits: integer("price_delta_minor_units")
      .notNull()
      .default(0),
    quantity: integer("quantity").notNull().default(1),
    ...localSyncColumns(),
  },
  (table) => [
    index("order_item_modifiers_is_synced_idx").on(table.isSynced),
    index("order_item_modifiers_order_item_idx").on(table.orderItemId),
  ]
);

export const paymentSettings = sqliteTable(
  "payment_settings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    qrisStaticPayload: text("qris_static_payload"),
    qrisStatisEnabled: integer("qris_statis_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    qrisDinamisEnabled: integer("qris_dinamis_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    ...localSyncColumns(),
  },
  (table) => [
    index("payment_settings_is_synced_idx").on(table.isSynced),
    uniqueIndex("payment_settings_merchant_idx").on(table.merchantId),
  ]
);

export const wallets = sqliteTable(
  "wallets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    name: text("name").notNull(),
    type: text("type", { enum: ["cash", "bank", "qris"] }).notNull(),
    accountNumber: text("account_number"),
    isDefault: integer("is_default", { mode: "boolean" })
      .notNull()
      .default(false),
    currentBalanceMinorUnits: integer("current_balance_minor_units")
      .notNull()
      .default(0),
    ...localSyncColumns(),
  },
  (table) => [
    index("wallets_is_synced_idx").on(table.isSynced),
    index("wallets_outlet_type_idx").on(table.outletId, table.type),
  ]
);

export const walletTransactions = sqliteTable(
  "wallet_transactions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    outletId: text("outlet_id")
      .notNull()
      .references(() => outlets.id),
    walletId: text("wallet_id")
      .notNull()
      .references(() => wallets.id),
    type: text("type", {
      enum: ["sale", "cash_in", "cash_out", "transfer_in", "transfer_out", "reconciliation"],
    }).notNull(),
    amountMinorUnits: integer("amount_minor_units").notNull(),
    category: text("category"),
    referenceId: text("reference_id"),
    notes: text("notes"),
    createdByStaffId: text("created_by_staff_id")
      .notNull()
      .references(() => staff.id),
    ...localSyncColumns(),
  },
  (table) => [
    index("wallet_transactions_is_synced_idx").on(table.isSynced),
    index("wallet_transactions_outlet_created_idx").on(
      table.outletId,
      table.createdAt
    ),
    index("wallet_transactions_wallet_created_idx").on(
      table.walletId,
      table.createdAt
    ),
  ]
);
