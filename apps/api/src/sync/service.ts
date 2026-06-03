import {
  assets,
  categories,
  merchants,
  orderItems,
  orders,
  outletProducts,
  outlets,
  products,
  registers,
  staff,
} from "@repo/database/api-schema";
import { createDrizzleSyncRepository } from "baresync/server/drizzle";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";

const DIGITS_ONLY = /^\d+$/;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && DIGITS_ONLY.test(value)) {
    return Number(value);
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  throw new Error(`${field} is required and must be a valid number`);
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === "string" && DIGITS_ONLY.test(value)) {
    return Number(value);
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return null;
}

function requiredBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

export const repository = createDrizzleSyncRepository({
  tables: {
    merchants: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "merchants.id"),
        name: requiredString(row.name, "merchants.name"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "merchants.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(merchants)
          .where(eq(merchants.id, scopeId))
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(merchants)
          .where(
            and(
              eq(merchants.id, scopeId),
              cursorTimestamp > 0
                ? gt(merchants.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(merchants.syncUpdatedAt), asc(merchants.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(merchants)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(merchants.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(merchants)
          .values(row as never)
          .onConflictDoUpdate({
            target: merchants.id,
            set: {
              name: sql.raw("excluded.name"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    outlets: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "outlets.id"),
        merchantId: requiredString(row.merchantId, "outlets.merchantId"),
        timezone: requiredString(row.timezone, "outlets.timezone"),
        name: requiredString(row.name, "outlets.name"),
        address: optionalString(row.address),
        receiptName: optionalString(row.receiptName),
        receiptAddress: optionalString(row.receiptAddress),
        isActive: requiredBoolean(row.isActive),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "outlets.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(outlets)
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${outlets.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(outlets)
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(outlets.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(outlets.syncUpdatedAt), asc(outlets.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(outlets)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(outlets.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(outlets)
          .values(row as never)
          .onConflictDoUpdate({
            target: outlets.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              timezone: sql.raw("excluded.timezone"),
              name: sql.raw("excluded.name"),
              address: sql.raw("excluded.address"),
              receiptName: sql.raw("excluded.receipt_name"),
              receiptAddress: sql.raw("excluded.receipt_address"),
              isActive: sql.raw("excluded.is_active"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    registers: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "registers.id"),
        outletId: requiredString(row.outletId, "registers.outletId"),
        name: requiredString(row.name, "registers.name"),
        shortId: requiredString(row.shortId, "registers.shortId"),
        pairingCode: optionalString(row.pairingCode),
        pairingExpiresAt: optionalString(row.pairingExpiresAt),
        isActive: requiredBoolean(row.isActive),
        lastSeenAt: optionalString(row.lastSeenAt),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "registers.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(registers)
          .where(eq(registers.outletId, scopeId))
          .orderBy(sql`${registers.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(registers)
          .where(
            and(
              eq(registers.outletId, scopeId),
              cursorTimestamp > 0
                ? gt(registers.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(registers.syncUpdatedAt), asc(registers.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(registers)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(registers.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(registers)
          .values(row as never)
          .onConflictDoUpdate({
            target: registers.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              name: sql.raw("excluded.name"),
              shortId: sql.raw("excluded.short_id"),
              pairingCode: sql.raw("excluded.pairing_code"),
              pairingExpiresAt: sql.raw("excluded.pairing_expires_at"),
              isActive: sql.raw("excluded.is_active"),
              lastSeenAt: sql.raw("excluded.last_seen_at"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    staff: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "staff.id"),
        merchantId: requiredString(row.merchantId, "staff.merchantId"),
        cloudUserId: optionalString(row.cloudUserId),
        outletId: optionalString(row.outletId),
        name: requiredString(row.name, "staff.name"),
        pin: optionalString(row.pin),
        role: requiredString(row.role, "staff.role"),
        isActive: requiredBoolean(row.isActive),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "staff.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(staff)
          .where(eq(staff.merchantId, scopeId))
          .orderBy(sql`${staff.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(staff)
          .where(
            and(
              eq(staff.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(staff.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(staff.syncUpdatedAt), asc(staff.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(staff)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(staff.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(staff)
          .values(row as never)
          .onConflictDoUpdate({
            target: staff.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              cloudUserId: sql.raw("excluded.cloud_user_id"),
              outletId: sql.raw("excluded.outlet_id"),
              name: sql.raw("excluded.name"),
              pin: sql.raw("excluded.pin"),
              role: sql.raw("excluded.role"),
              isActive: sql.raw("excluded.is_active"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    categories: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "categories.id"),
        merchantId: requiredString(row.merchantId, "categories.merchantId"),
        name: requiredString(row.name, "categories.name"),
        sortOrder: requiredNumber(row.sortOrder, "categories.sortOrder"),
        isActive: requiredBoolean(row.isActive),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "categories.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(categories)
          .where(eq(categories.merchantId, scopeId))
          .orderBy(sql`${categories.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(categories.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(categories.syncUpdatedAt), asc(categories.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(categories)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(categories.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(categories)
          .values(row as never)
          .onConflictDoUpdate({
            target: categories.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              name: sql.raw("excluded.name"),
              sortOrder: sql.raw("excluded.sort_order"),
              isActive: sql.raw("excluded.is_active"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    assets: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "assets.id"),
        merchantId: requiredString(row.merchantId, "assets.merchantId"),
        objectKey: requiredString(row.objectKey, "assets.objectKey"),
        originalFilename: optionalString(row.originalFilename),
        contentType: requiredString(row.contentType, "assets.contentType"),
        byteSize: requiredNumber(row.byteSize, "assets.byteSize"),
        contentHash: requiredString(row.contentHash, "assets.contentHash"),
        kind: requiredString(row.kind, "assets.kind"),
        width: optionalNumber(row.width),
        height: optionalNumber(row.height),
        status: requiredString(row.status, "assets.status"),
        createdByUserId: optionalString(row.createdByUserId),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "assets.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(assets)
          .where(eq(assets.merchantId, scopeId))
          .orderBy(sql`${assets.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(assets.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(assets.syncUpdatedAt), asc(assets.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(assets)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(assets.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(assets)
          .values(row as never)
          .onConflictDoUpdate({
            target: assets.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              objectKey: sql.raw("excluded.object_key"),
              originalFilename: sql.raw("excluded.original_filename"),
              contentType: sql.raw("excluded.content_type"),
              byteSize: sql.raw("excluded.byte_size"),
              contentHash: sql.raw("excluded.content_hash"),
              kind: sql.raw("excluded.kind"),
              width: sql.raw("excluded.width"),
              height: sql.raw("excluded.height"),
              status: sql.raw("excluded.status"),
              createdByUserId: sql.raw("excluded.created_by_user_id"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    products: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "products.id"),
        merchantId: requiredString(row.merchantId, "products.merchantId"),
        categoryId: optionalString(row.categoryId),
        name: requiredString(row.name, "products.name"),
        priceMinorUnits: requiredNumber(
          row.priceMinorUnits,
          "products.priceMinorUnits"
        ),
        imageUrl: optionalString(row.imageUrl),
        imageAssetId: optionalString(row.imageAssetId),
        isActive: requiredBoolean(row.isActive),
        sortOrder: requiredNumber(row.sortOrder, "products.sortOrder"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "products.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(products)
          .where(eq(products.merchantId, scopeId))
          .orderBy(sql`${products.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(products)
          .where(
            and(
              eq(products.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(products.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(products.syncUpdatedAt), asc(products.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(products)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(products.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(products)
          .values(row as never)
          .onConflictDoUpdate({
            target: products.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              categoryId: sql.raw("excluded.category_id"),
              name: sql.raw("excluded.name"),
              priceMinorUnits: sql.raw("excluded.price_minor_units"),
              imageUrl: sql.raw("excluded.image_url"),
              imageAssetId: sql.raw("excluded.image_asset_id"),
              isActive: sql.raw("excluded.is_active"),
              sortOrder: sql.raw("excluded.sort_order"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    outletProducts: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "outletProducts.id"),
        outletId: requiredString(row.outletId, "outletProducts.outletId"),
        productId: requiredString(row.productId, "outletProducts.productId"),
        priceMinorUnits: optionalNumber(row.priceMinorUnits),
        isAvailable: requiredBoolean(row.isAvailable),
        sortOrder: optionalNumber(row.sortOrder),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "outletProducts.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(outletProducts)
          .where(eq(outletProducts.outletId, scopeId))
          .orderBy(sql`${outletProducts.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(outletProducts)
          .where(
            and(
              eq(outletProducts.outletId, scopeId),
              cursorTimestamp > 0
                ? gt(outletProducts.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(outletProducts.syncUpdatedAt), asc(outletProducts.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(outletProducts)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(outletProducts.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(outletProducts)
          .values(row as never)
          .onConflictDoUpdate({
            target: outletProducts.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              productId: sql.raw("excluded.product_id"),
              priceMinorUnits: sql.raw("excluded.price_minor_units"),
              isAvailable: sql.raw("excluded.is_available"),
              sortOrder: sql.raw("excluded.sort_order"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    orders: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "orders.id"),
        outletId: requiredString(row.outletId, "orders.outletId"),
        registerId: optionalString(row.registerId),
        staffId: optionalString(row.staffId),
        orderNumber: requiredString(row.orderNumber, "orders.orderNumber"),
        totalMinorUnits: requiredNumber(
          row.totalMinorUnits,
          "orders.totalMinorUnits"
        ),
        paymentMethod: requiredString(
          row.paymentMethod,
          "orders.paymentMethod"
        ),
        amountPaidMinorUnits: optionalNumber(row.amountPaidMinorUnits),
        changeAmountMinorUnits: optionalNumber(row.changeAmountMinorUnits),
        status: requiredString(row.status, "orders.status"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "orders.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(orders)
          .where(eq(orders.outletId, scopeId))
          .orderBy(sql`${orders.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.outletId, scopeId),
              cursorTimestamp > 0
                ? gt(orders.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(orders.syncUpdatedAt), asc(orders.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(orders)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(orders.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(orders)
          .values(row as never)
          .onConflictDoUpdate({
            target: orders.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              registerId: sql.raw("excluded.register_id"),
              staffId: sql.raw("excluded.staff_id"),
              orderNumber: sql.raw("excluded.order_number"),
              totalMinorUnits: sql.raw("excluded.total_minor_units"),
              paymentMethod: sql.raw("excluded.payment_method"),
              amountPaidMinorUnits: sql.raw("excluded.amount_paid_minor_units"),
              changeAmountMinorUnits: sql.raw(
                "excluded.change_amount_minor_units"
              ),
              status: sql.raw("excluded.status"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    orderItems: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "orderItems.id"),
        orderId: requiredString(row.orderId, "orderItems.orderId"),
        outletId: requiredString(row.outletId, "orderItems.outletId"),
        productId: optionalString(row.productId),
        productName: requiredString(row.productName, "orderItems.productName"),
        quantity: requiredNumber(row.quantity, "orderItems.quantity"),
        unitPriceMinorUnits: requiredNumber(
          row.unitPriceMinorUnits,
          "orderItems.unitPriceMinorUnits"
        ),
        originalPriceMinorUnits: optionalNumber(row.originalPriceMinorUnits),
        subtotalMinorUnits: requiredNumber(
          row.subtotalMinorUnits,
          "orderItems.subtotalMinorUnits"
        ),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "orderItems.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.outletId, scopeId))
          .orderBy(sql`${orderItems.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(orderItems)
          .where(
            and(
              eq(orderItems.outletId, scopeId),
              cursorTimestamp > 0
                ? gt(orderItems.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(orderItems.syncUpdatedAt), asc(orderItems.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(orderItems)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(orderItems.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(orderItems)
          .values(row as never)
          .onConflictDoUpdate({
            target: orderItems.id,
            set: {
              orderId: sql.raw("excluded.order_id"),
              outletId: sql.raw("excluded.outlet_id"),
              productId: sql.raw("excluded.product_id"),
              productName: sql.raw("excluded.product_name"),
              quantity: sql.raw("excluded.quantity"),
              unitPriceMinorUnits: sql.raw("excluded.unit_price_minor_units"),
              originalPriceMinorUnits: sql.raw(
                "excluded.original_price_minor_units"
              ),
              subtotalMinorUnits: sql.raw("excluded.subtotal_minor_units"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
  },
});
