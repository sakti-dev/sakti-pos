import {
  assets,
  cashShifts,
  categories,
  goodsReceiptLines,
  goodsReceipts,
  ingredientCategories,
  ingredients,
  inventoryStocks,
  merchants,
  modifierGroups,
  modifierOptions,
  orderItemModifiers,
  orderItems,
  orders,
  outletProducts,
  outlets,
  paymentSettings,
  productIngredients,
  productModifierGroups,
  products,
  registers,
  staff,
  stockAdjustments,
  stocktakeLines,
  stocktakes,
  wallets,
  walletTransactions,
} from "@sync-contract/generated/2026-10-05/api-synced-schema";
import { createDrizzleSyncRepository } from "baresync/server/drizzle";
import { and, asc, eq, getTableColumns, gt, sql } from "drizzle-orm";
import { db } from "../db";

const NUMBER_STRING = /^-?\d+(?:\.\d+)?$/;

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
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && NUMBER_STRING.test(value)) {
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && NUMBER_STRING.test(value)) {
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
        businessType: requiredString(
          row.businessType,
          "merchants.businessType"
        ),
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
              businessType: sql.raw("excluded.business_type"),
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
        useTax: requiredBoolean(row.useTax),
        taxPercentage: requiredNumber(
          row.taxPercentage,
          "outlets.taxPercentage"
        ),
        useServiceCharge: requiredBoolean(row.useServiceCharge),
        serviceChargePercentage: requiredNumber(
          row.serviceChargePercentage,
          "outlets.serviceChargePercentage"
        ),
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
              useTax: sql.raw("excluded.use_tax"),
              taxPercentage: sql.raw("excluded.tax_percentage"),
              useServiceCharge: sql.raw("excluded.use_service_charge"),
              serviceChargePercentage: sql.raw(
                "excluded.service_charge_percentage"
              ),
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
          .select(getTableColumns(registers))
          .from(registers)
          .innerJoin(outlets, eq(registers.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${registers.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(registers))
          .from(registers)
          .innerJoin(outlets, eq(registers.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
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
        jobId: optionalString(row.jobId),
        objectKey: optionalString(row.objectKey),
        originalFilename: optionalString(row.originalFilename),
        contentType: requiredString(row.contentType, "assets.contentType"),
        byteSize: optionalNumber(row.byteSize),
        contentHash: optionalString(row.contentHash),
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
              jobId: sql.raw("excluded.job_id"),
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
    outlet_products: {
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
          .select(getTableColumns(outletProducts))
          .from(outletProducts)
          .innerJoin(outlets, eq(outletProducts.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${outletProducts.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(outletProducts))
          .from(outletProducts)
          .innerJoin(outlets, eq(outletProducts.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
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
    modifier_groups: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "modifier_groups.id"),
        merchantId: requiredString(
          row.merchantId,
          "modifier_groups.merchantId"
        ),
        name: requiredString(row.name, "modifier_groups.name"),
        selectionType: requiredString(
          row.selectionType,
          "modifier_groups.selectionType"
        ),
        isRequired: requiredBoolean(row.isRequired),
        sortOrder: requiredNumber(row.sortOrder, "modifier_groups.sortOrder"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "modifier_groups.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(modifierGroups)
          .where(eq(modifierGroups.merchantId, scopeId))
          .orderBy(sql`${modifierGroups.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(modifierGroups)
          .where(
            and(
              eq(modifierGroups.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(modifierGroups.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(modifierGroups.syncUpdatedAt), asc(modifierGroups.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(modifierGroups)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(modifierGroups.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(modifierGroups)
          .values(row as never)
          .onConflictDoUpdate({
            target: modifierGroups.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              name: sql.raw("excluded.name"),
              selectionType: sql.raw("excluded.selection_type"),
              isRequired: sql.raw("excluded.is_required"),
              sortOrder: sql.raw("excluded.sort_order"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    modifier_options: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "modifier_options.id"),
        merchantId: requiredString(
          row.merchantId,
          "modifier_options.merchantId"
        ),
        groupId: requiredString(row.groupId, "modifier_options.groupId"),
        label: requiredString(row.label, "modifier_options.label"),
        priceDeltaMinorUnits: requiredNumber(
          row.priceDeltaMinorUnits,
          "modifier_options.priceDeltaMinorUnits"
        ),
        sortOrder: requiredNumber(row.sortOrder, "modifier_options.sortOrder"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "modifier_options.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(modifierOptions)
          .where(eq(modifierOptions.merchantId, scopeId))
          .orderBy(sql`${modifierOptions.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(modifierOptions)
          .where(
            and(
              eq(modifierOptions.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(modifierOptions.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(modifierOptions.syncUpdatedAt), asc(modifierOptions.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(modifierOptions)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(modifierOptions.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(modifierOptions)
          .values(row as never)
          .onConflictDoUpdate({
            target: modifierOptions.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              groupId: sql.raw("excluded.group_id"),
              label: sql.raw("excluded.label"),
              priceDeltaMinorUnits: sql.raw("excluded.price_delta_minor_units"),
              sortOrder: sql.raw("excluded.sort_order"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    product_modifier_groups: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "product_modifier_groups.id"),
        merchantId: requiredString(
          row.merchantId,
          "product_modifier_groups.merchantId"
        ),
        productId: requiredString(
          row.productId,
          "product_modifier_groups.productId"
        ),
        groupId: requiredString(row.groupId, "product_modifier_groups.groupId"),
        sortOrder: requiredNumber(
          row.sortOrder,
          "product_modifier_groups.sortOrder"
        ),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(
          row.createdAt,
          "product_modifier_groups.createdAt"
        ),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(productModifierGroups)
          .where(eq(productModifierGroups.merchantId, scopeId))
          .orderBy(sql`${productModifierGroups.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(productModifierGroups)
          .where(
            and(
              eq(productModifierGroups.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(productModifierGroups.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(
            asc(productModifierGroups.syncUpdatedAt),
            asc(productModifierGroups.id)
          ),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(productModifierGroups)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(productModifierGroups.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(productModifierGroups)
          .values(row as never)
          .onConflictDoUpdate({
            target: productModifierGroups.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              productId: sql.raw("excluded.product_id"),
              groupId: sql.raw("excluded.group_id"),
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
        taxMinorUnits: optionalNumber(row.taxMinorUnits) ?? 0,
        serviceChargeMinorUnits:
          optionalNumber(row.serviceChargeMinorUnits) ?? 0,
        taxPercentage: optionalNumber(row.taxPercentage) ?? 0,
        serviceChargePercentage:
          optionalNumber(row.serviceChargePercentage) ?? 0,
        status: requiredString(row.status, "orders.status"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "orders.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(orders))
          .from(orders)
          .innerJoin(outlets, eq(orders.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${orders.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(orders))
          .from(orders)
          .innerJoin(outlets, eq(orders.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
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
              taxMinorUnits: sql.raw("excluded.tax_minor_units"),
              serviceChargeMinorUnits: sql.raw(
                "excluded.service_charge_minor_units"
              ),
              taxPercentage: sql.raw("excluded.tax_percentage"),
              serviceChargePercentage: sql.raw(
                "excluded.service_charge_percentage"
              ),
              status: sql.raw("excluded.status"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    order_items: {
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
          .select(getTableColumns(orderItems))
          .from(orderItems)
          .innerJoin(outlets, eq(orderItems.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${orderItems.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(orderItems))
          .from(orderItems)
          .innerJoin(outlets, eq(orderItems.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
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
    ingredients: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "ingredients.id"),
        merchantId: requiredString(row.merchantId, "merchantId"),
        name: requiredString(row.name, "name"),
        sku: optionalString(row.sku),
        unit: requiredString(row.unit, "unit"),
        category: optionalString(row.category),
        isActive: requiredBoolean(row.isActive),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "ingredients.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(ingredients)
          .where(eq(ingredients.merchantId, scopeId))
          .orderBy(sql`${ingredients.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(ingredients)
          .where(
            and(
              eq(ingredients.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(ingredients.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(ingredients.syncUpdatedAt), asc(ingredients.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(ingredients)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(ingredients.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(ingredients)
          .values(row as never)
          .onConflictDoUpdate({
            target: ingredients.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              name: sql.raw("excluded.name"),
              sku: sql.raw("excluded.sku"),
              unit: sql.raw("excluded.unit"),
              category: sql.raw("excluded.category"),
              isActive: sql.raw("excluded.is_active"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    ingredient_categories: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "ingredient_categories.id"),
        merchantId: requiredString(
          row.merchantId,
          "ingredient_categories.merchantId"
        ),
        name: requiredString(row.name, "name"),
        sortOrder: requiredNumber(row.sortOrder, "sortOrder"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(
          row.createdAt,
          "ingredient_categories.createdAt"
        ),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(ingredientCategories)
          .where(eq(ingredientCategories.merchantId, scopeId))
          .orderBy(sql`${ingredientCategories.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(ingredientCategories)
          .where(
            and(
              eq(ingredientCategories.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(ingredientCategories.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(
            asc(ingredientCategories.syncUpdatedAt),
            asc(ingredientCategories.id)
          ),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(ingredientCategories)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(ingredientCategories.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(ingredientCategories)
          .values(row as never)
          .onConflictDoUpdate({
            target: ingredientCategories.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              name: sql.raw("excluded.name"),
              sortOrder: sql.raw("excluded.sort_order"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    product_ingredients: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "product_ingredients.id"),
        merchantId: requiredString(
          row.merchantId,
          "product_ingredients.merchantId"
        ),
        productId: requiredString(row.productId, "productId"),
        ingredientId: requiredString(row.ingredientId, "ingredientId"),
        qtyPerUnit: requiredNumber(row.qtyPerUnit, "qtyPerUnit"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(
          row.createdAt,
          "product_ingredients.createdAt"
        ),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(productIngredients)
          .where(eq(productIngredients.merchantId, scopeId))
          .orderBy(sql`${productIngredients.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(productIngredients)
          .where(
            and(
              eq(productIngredients.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(productIngredients.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(
            asc(productIngredients.syncUpdatedAt),
            asc(productIngredients.id)
          ),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(productIngredients)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(productIngredients.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(productIngredients)
          .values(row as never)
          .onConflictDoUpdate({
            target: productIngredients.id,
            set: {
              productId: sql.raw("excluded.product_id"),
              ingredientId: sql.raw("excluded.ingredient_id"),
              qtyPerUnit: sql.raw("excluded.qty_per_unit"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    inventory_stocks: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "inventory_stocks.id"),
        outletId: requiredString(row.outletId, "outletId"),
        targetType: requiredString(row.targetType, "targetType"),
        targetId: requiredString(row.targetId, "targetId"),
        onHandQty: requiredNumber(row.onHandQty, "onHandQty"),
        lowStockThreshold: requiredNumber(
          row.lowStockThreshold,
          "lowStockThreshold"
        ),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "inventory_stocks.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(inventoryStocks))
          .from(inventoryStocks)
          .innerJoin(outlets, eq(inventoryStocks.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${inventoryStocks.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(inventoryStocks))
          .from(inventoryStocks)
          .innerJoin(outlets, eq(inventoryStocks.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(inventoryStocks.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(inventoryStocks.syncUpdatedAt), asc(inventoryStocks.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(inventoryStocks)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(inventoryStocks.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(inventoryStocks)
          .values(row as never)
          .onConflictDoUpdate({
            target: inventoryStocks.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              targetType: sql.raw("excluded.target_type"),
              targetId: sql.raw("excluded.target_id"),
              onHandQty: sql.raw("excluded.on_hand_qty"),
              lowStockThreshold: sql.raw("excluded.low_stock_threshold"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    stocktakes: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "stocktakes.id"),
        outletId: requiredString(row.outletId, "outletId"),
        staffId: requiredString(row.staffId, "staffId"),
        ref: requiredString(row.ref, "ref"),
        targetType: requiredString(row.targetType, "targetType"),
        reason: requiredString(row.reason, "reason"),
        countedAt: requiredString(row.countedAt, "countedAt"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "stocktakes.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(stocktakes))
          .from(stocktakes)
          .innerJoin(outlets, eq(stocktakes.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${stocktakes.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(stocktakes))
          .from(stocktakes)
          .innerJoin(outlets, eq(stocktakes.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(stocktakes.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(stocktakes.syncUpdatedAt), asc(stocktakes.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(stocktakes)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(stocktakes.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(stocktakes)
          .values(row as never)
          .onConflictDoUpdate({
            target: stocktakes.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              staffId: sql.raw("excluded.staff_id"),
              ref: sql.raw("excluded.ref"),
              targetType: sql.raw("excluded.target_type"),
              reason: sql.raw("excluded.reason"),
              countedAt: sql.raw("excluded.counted_at"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    stocktake_lines: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "stocktake_lines.id"),
        stocktakeId: requiredString(row.stocktakeId, "stocktakeId"),
        outletId: requiredString(row.outletId, "outletId"),
        targetId: requiredString(row.targetId, "targetId"),
        systemQtyBefore: requiredNumber(row.systemQtyBefore, "systemQtyBefore"),
        countedQty: requiredNumber(row.countedQty, "countedQty"),
        varianceQty: requiredNumber(row.varianceQty, "varianceQty"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "stocktake_lines.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(stocktakeLines))
          .from(stocktakeLines)
          .innerJoin(outlets, eq(stocktakeLines.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${stocktakeLines.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(stocktakeLines))
          .from(stocktakeLines)
          .innerJoin(outlets, eq(stocktakeLines.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(stocktakeLines.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(stocktakeLines.syncUpdatedAt), asc(stocktakeLines.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(stocktakeLines)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(stocktakeLines.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(stocktakeLines)
          .values(row as never)
          .onConflictDoUpdate({
            target: stocktakeLines.id,
            set: {
              stocktakeId: sql.raw("excluded.stocktake_id"),
              outletId: sql.raw("excluded.outlet_id"),
              targetId: sql.raw("excluded.target_id"),
              systemQtyBefore: sql.raw("excluded.system_qty_before"),
              countedQty: sql.raw("excluded.counted_qty"),
              varianceQty: sql.raw("excluded.variance_qty"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    goods_receipts: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "goods_receipts.id"),
        outletId: requiredString(row.outletId, "outletId"),
        staffId: requiredString(row.staffId, "staffId"),
        ref: requiredString(row.ref, "ref"),
        supplierName: optionalString(row.supplierName),
        note: optionalString(row.note),
        receivedAt: requiredString(row.receivedAt, "receivedAt"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "goods_receipts.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(goodsReceipts))
          .from(goodsReceipts)
          .innerJoin(outlets, eq(goodsReceipts.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${goodsReceipts.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(goodsReceipts))
          .from(goodsReceipts)
          .innerJoin(outlets, eq(goodsReceipts.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(goodsReceipts.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(goodsReceipts.syncUpdatedAt), asc(goodsReceipts.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(goodsReceipts)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(goodsReceipts.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(goodsReceipts)
          .values(row as never)
          .onConflictDoUpdate({
            target: goodsReceipts.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              staffId: sql.raw("excluded.staff_id"),
              ref: sql.raw("excluded.ref"),
              supplierName: sql.raw("excluded.supplier_name"),
              note: sql.raw("excluded.note"),
              receivedAt: sql.raw("excluded.received_at"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    goods_receipt_lines: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "goods_receipt_lines.id"),
        goodsReceiptId: requiredString(row.goodsReceiptId, "goodsReceiptId"),
        outletId: requiredString(row.outletId, "outletId"),
        targetId: requiredString(row.targetId, "targetId"),
        receivedQty: requiredNumber(row.receivedQty, "receivedQty"),
        unitCostMinorUnits: requiredNumber(
          row.unitCostMinorUnits,
          "unitCostMinorUnits"
        ),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(
          row.createdAt,
          "goods_receipt_lines.createdAt"
        ),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(goodsReceiptLines))
          .from(goodsReceiptLines)
          .innerJoin(outlets, eq(goodsReceiptLines.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${goodsReceiptLines.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(goodsReceiptLines))
          .from(goodsReceiptLines)
          .innerJoin(outlets, eq(goodsReceiptLines.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(goodsReceiptLines.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(
            asc(goodsReceiptLines.syncUpdatedAt),
            asc(goodsReceiptLines.id)
          ),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(goodsReceiptLines)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(goodsReceiptLines.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(goodsReceiptLines)
          .values(row as never)
          .onConflictDoUpdate({
            target: goodsReceiptLines.id,
            set: {
              goodsReceiptId: sql.raw("excluded.goods_receipt_id"),
              outletId: sql.raw("excluded.outlet_id"),
              targetId: sql.raw("excluded.target_id"),
              receivedQty: sql.raw("excluded.received_qty"),
              unitCostMinorUnits: sql.raw("excluded.unit_cost_minor_units"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    stock_adjustments: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "stock_adjustments.id"),
        outletId: requiredString(row.outletId, "outletId"),
        staffId: requiredString(row.staffId, "staffId"),
        targetType: requiredString(row.targetType, "targetType"),
        targetId: requiredString(row.targetId, "targetId"),
        qtyDelta: requiredNumber(row.qtyDelta, "qtyDelta"),
        reason: requiredString(row.reason, "reason"),
        note: optionalString(row.note),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "stock_adjustments.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(stockAdjustments))
          .from(stockAdjustments)
          .innerJoin(outlets, eq(stockAdjustments.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${stockAdjustments.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(stockAdjustments))
          .from(stockAdjustments)
          .innerJoin(outlets, eq(stockAdjustments.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(stockAdjustments.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(
            asc(stockAdjustments.syncUpdatedAt),
            asc(stockAdjustments.id)
          ),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(stockAdjustments)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(stockAdjustments.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(stockAdjustments)
          .values(row as never)
          .onConflictDoUpdate({
            target: stockAdjustments.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              staffId: sql.raw("excluded.staff_id"),
              targetType: sql.raw("excluded.target_type"),
              targetId: sql.raw("excluded.target_id"),
              qtyDelta: sql.raw("excluded.qty_delta"),
              reason: sql.raw("excluded.reason"),
              note: sql.raw("excluded.note"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    cash_shifts: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "cash_shifts.id"),
        outletId: requiredString(row.outletId, "outletId"),
        registerId: optionalString(row.registerId),
        openedByStaffId: requiredString(row.openedByStaffId, "openedByStaffId"),
        closedByStaffId: optionalString(row.closedByStaffId),
        openedAt: requiredString(row.openedAt, "openedAt"),
        closedAt: optionalString(row.closedAt),
        initialFloatMinorUnits: requiredNumber(
          row.initialFloatMinorUnits,
          "initialFloatMinorUnits"
        ),
        expectedCashMinorUnits: requiredNumber(
          row.expectedCashMinorUnits,
          "expectedCashMinorUnits"
        ),
        actualCashMinorUnits: optionalNumber(row.actualCashMinorUnits),
        differenceMinorUnits: optionalNumber(row.differenceMinorUnits),
        status: requiredString(row.status, "status"),
        note: optionalString(row.note),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "cash_shifts.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(cashShifts))
          .from(cashShifts)
          .innerJoin(outlets, eq(cashShifts.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${cashShifts.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(cashShifts))
          .from(cashShifts)
          .innerJoin(outlets, eq(cashShifts.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(cashShifts.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(cashShifts.syncUpdatedAt), asc(cashShifts.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(cashShifts)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(cashShifts.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(cashShifts)
          .values(row as never)
          .onConflictDoUpdate({
            target: cashShifts.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              registerId: sql.raw("excluded.register_id"),
              openedByStaffId: sql.raw("excluded.opened_by_staff_id"),
              closedByStaffId: sql.raw("excluded.closed_by_staff_id"),
              openedAt: sql.raw("excluded.opened_at"),
              closedAt: sql.raw("excluded.closed_at"),
              initialFloatMinorUnits: sql.raw(
                "excluded.initial_float_minor_units"
              ),
              expectedCashMinorUnits: sql.raw(
                "excluded.expected_cash_minor_units"
              ),
              actualCashMinorUnits: sql.raw("excluded.actual_cash_minor_units"),
              differenceMinorUnits: sql.raw("excluded.difference_minor_units"),
              status: sql.raw("excluded.status"),
              note: sql.raw("excluded.note"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    wallets: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "wallets.id"),
        outletId: requiredString(row.outletId, "wallets.outletId"),
        name: requiredString(row.name, "wallets.name"),
        type: requiredString(row.type, "wallets.type"),
        accountNumber: optionalString(row.accountNumber),
        isDefault: requiredBoolean(row.isDefault),
        currentBalanceMinorUnits: requiredNumber(
          row.currentBalanceMinorUnits,
          "wallets.currentBalanceMinorUnits"
        ),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "wallets.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(wallets))
          .from(wallets)
          .innerJoin(outlets, eq(wallets.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${wallets.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(wallets))
          .from(wallets)
          .innerJoin(outlets, eq(wallets.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(wallets.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(wallets.syncUpdatedAt), asc(wallets.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(wallets)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(wallets.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(wallets)
          .values(row as never)
          .onConflictDoUpdate({
            target: wallets.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              name: sql.raw("excluded.name"),
              type: sql.raw("excluded.type"),
              accountNumber: sql.raw("excluded.account_number"),
              isDefault: sql.raw("excluded.is_default"),
              currentBalanceMinorUnits: sql.raw(
                "excluded.current_balance_minor_units"
              ),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    wallet_transactions: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "wallet_transactions.id"),
        outletId: requiredString(row.outletId, "wallet_transactions.outletId"),
        walletId: requiredString(row.walletId, "wallet_transactions.walletId"),
        type: requiredString(row.type, "wallet_transactions.type"),
        amountMinorUnits: requiredNumber(
          row.amountMinorUnits,
          "wallet_transactions.amountMinorUnits"
        ),
        category: optionalString(row.category),
        referenceId: optionalString(row.referenceId),
        notes: optionalString(row.notes),
        createdByStaffId: requiredString(
          row.createdByStaffId,
          "wallet_transactions.createdByStaffId"
        ),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(
          row.createdAt,
          "wallet_transactions.createdAt"
        ),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(walletTransactions))
          .from(walletTransactions)
          .innerJoin(outlets, eq(walletTransactions.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${walletTransactions.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(walletTransactions))
          .from(walletTransactions)
          .innerJoin(outlets, eq(walletTransactions.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(walletTransactions.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(
            asc(walletTransactions.syncUpdatedAt),
            asc(walletTransactions.id)
          ),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(walletTransactions)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(walletTransactions.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(walletTransactions)
          .values(row as never)
          .onConflictDoUpdate({
            target: walletTransactions.id,
            set: {
              outletId: sql.raw("excluded.outlet_id"),
              walletId: sql.raw("excluded.wallet_id"),
              type: sql.raw("excluded.type"),
              amountMinorUnits: sql.raw("excluded.amount_minor_units"),
              category: sql.raw("excluded.category"),
              referenceId: sql.raw("excluded.reference_id"),
              notes: sql.raw("excluded.notes"),
              createdByStaffId: sql.raw("excluded.created_by_staff_id"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    order_item_modifiers: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "order_item_modifiers.id"),
        orderItemId: requiredString(row.orderItemId, "orderItemId"),
        outletId: requiredString(row.outletId, "outletId"),
        modifierName: requiredString(row.modifierName, "modifierName"),
        modifierGroup: optionalString(row.modifierGroup),
        priceDeltaMinorUnits: requiredNumber(
          row.priceDeltaMinorUnits,
          "priceDeltaMinorUnits"
        ),
        quantity: requiredNumber(row.quantity, "quantity"),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(
          row.createdAt,
          "order_item_modifiers.createdAt"
        ),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select(getTableColumns(orderItemModifiers))
          .from(orderItemModifiers)
          .innerJoin(outlets, eq(orderItemModifiers.outletId, outlets.id))
          .where(eq(outlets.merchantId, scopeId))
          .orderBy(sql`${orderItemModifiers.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select(getTableColumns(orderItemModifiers))
          .from(orderItemModifiers)
          .innerJoin(outlets, eq(orderItemModifiers.outletId, outlets.id))
          .where(
            and(
              eq(outlets.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(orderItemModifiers.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(
            asc(orderItemModifiers.syncUpdatedAt),
            asc(orderItemModifiers.id)
          ),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(orderItemModifiers)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(orderItemModifiers.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(orderItemModifiers)
          .values(row as never)
          .onConflictDoUpdate({
            target: orderItemModifiers.id,
            set: {
              orderItemId: sql.raw("excluded.order_item_id"),
              outletId: sql.raw("excluded.outlet_id"),
              modifierName: sql.raw("excluded.modifier_name"),
              modifierGroup: sql.raw("excluded.modifier_group"),
              priceDeltaMinorUnits: sql.raw("excluded.price_delta_minor_units"),
              quantity: sql.raw("excluded.quantity"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
    payment_settings: {
      buildRow: ({ row, scopeId: _scopeId, syncUpdatedAt, updatedAt }) => ({
        id: requiredString(row.id, "payment_settings.id"),
        merchantId: requiredString(
          row.merchantId,
          "payment_settings.merchantId"
        ),
        qrisStaticPayload: optionalString(row.qrisStaticPayload),
        qrisStatisEnabled: requiredBoolean(row.qrisStatisEnabled),
        qrisDinamisEnabled: requiredBoolean(row.qrisDinamisEnabled),
        deletedAt: optionalString(row.deletedAt),
        syncUpdatedAt,
        createdAt: requiredString(row.createdAt, "payment_settings.createdAt"),
        updatedAt,
      }),
      readLatestRow: async ({ scopeId }) => {
        const [row] = await db
          .select()
          .from(paymentSettings)
          .where(eq(paymentSettings.merchantId, scopeId))
          .orderBy(sql`${paymentSettings.syncUpdatedAt} DESC`)
          .limit(1);
        return row ?? null;
      },
      readRows: ({ cursorTimestamp, scopeId }) =>
        db
          .select()
          .from(paymentSettings)
          .where(
            and(
              eq(paymentSettings.merchantId, scopeId),
              cursorTimestamp > 0
                ? gt(paymentSettings.syncUpdatedAt, cursorTimestamp)
                : undefined
            )
          )
          .orderBy(asc(paymentSettings.syncUpdatedAt), asc(paymentSettings.id)),
      softDeleteRow: async ({ id, syncUpdatedAt, updatedAt }) => {
        await db
          .update(paymentSettings)
          .set({ deletedAt: updatedAt, syncUpdatedAt, updatedAt })
          .where(eq(paymentSettings.id, id));
      },
      upsertRow: async (row) => {
        await db
          .insert(paymentSettings)
          .values(row as never)
          .onConflictDoUpdate({
            target: paymentSettings.id,
            set: {
              merchantId: sql.raw("excluded.merchant_id"),
              qrisStaticPayload: sql.raw("excluded.qris_static_payload"),
              qrisStatisEnabled: sql.raw("excluded.qris_statis_enabled"),
              qrisDinamisEnabled: sql.raw("excluded.qris_dinamis_enabled"),
              deletedAt: sql.raw("excluded.deleted_at"),
              syncUpdatedAt: sql.raw("excluded.sync_updated_at"),
              updatedAt: sql.raw("excluded.updated_at"),
            },
          });
      },
    },
  },
});
