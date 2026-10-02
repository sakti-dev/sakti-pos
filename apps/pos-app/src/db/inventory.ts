import dayjs from "dayjs";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import {
  currentMerchantId,
  currentOutletId,
  currentUser,
} from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";

/** The drizzle transaction handle writeTransaction hands to callbacks. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const inventoryLogger = createLogger({
  domain: "INVENTORY",
  module: "inventory",
});

export type StockTargetType = "product" | "ingredient";

export type AdjustmentReason =
  | "rusak"
  | "hilang"
  | "expired"
  | "hadiah"
  | "sample"
  | "lainnya";

function requireOutletId(): string {
  const outletId = currentOutletId();
  if (!outletId) {
    throw new Error("inventory: no active outlet");
  }
  return outletId;
}

function requireMerchantId(): string {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("inventory: no active merchant");
  }
  return merchantId;
}

/* ── Reads ─────────────────────────────────────────────────────── */

export interface StockListItem {
  readonly id: string;
  readonly lowStockThreshold: number | null;
  readonly name: string;
  readonly onHandQty: number;
  /** Products: sale price. Ingredients: null (not sellable). */
  readonly priceMinorUnits: number | null;
  readonly targetType: StockTargetType;
  readonly tracked: boolean;
  /** Display unit — ingredient unit, or "Pcs" for products. */
  readonly unit: string;
}

async function balancesByTarget(
  targetType: StockTargetType
): Promise<
  Map<string, { onHandQty: number; lowStockThreshold: number | null }>
> {
  const rows = await db
    .select({
      targetId: TABLE.inventoryStocks.targetId,
      onHandQty: TABLE.inventoryStocks.onHandQty,
      lowStockThreshold: TABLE.inventoryStocks.lowStockThreshold,
    })
    .from(TABLE.inventoryStocks)
    .where(
      and(
        eq(TABLE.inventoryStocks.outletId, requireOutletId()),
        eq(TABLE.inventoryStocks.targetType, targetType),
        isNull(TABLE.inventoryStocks.deletedAt)
      )
    );
  const map = new Map<
    string,
    { onHandQty: number; lowStockThreshold: number | null }
  >();
  for (const row of rows) {
    map.set(row.targetId, {
      onHandQty: row.onHandQty,
      lowStockThreshold: row.lowStockThreshold,
    });
  }
  return map;
}

/** All active products with their stock state at the active outlet. */
export async function getProductStockList(): Promise<StockListItem[]> {
  const merchantId = requireMerchantId();
  const [products, balances] = await Promise.all([
    db
      .select({
        id: TABLE.products.id,
        name: TABLE.products.name,
        priceMinorUnits: TABLE.products.priceMinorUnits,
      })
      .from(TABLE.products)
      .where(
        and(
          eq(TABLE.products.merchantId, merchantId),
          eq(TABLE.products.isActive, true),
          isNull(TABLE.products.deletedAt)
        )
      )
      .orderBy(TABLE.products.sortOrder, TABLE.products.name),
    balancesByTarget("product"),
  ]);
  return products.map((p) => {
    const balance = balances.get(p.id);
    return {
      id: p.id,
      name: p.name,
      priceMinorUnits: p.priceMinorUnits,
      unit: "Pcs",
      targetType: "product" as const,
      tracked: balance !== undefined,
      onHandQty: balance?.onHandQty ?? 0,
      lowStockThreshold: balance?.lowStockThreshold ?? null,
    };
  });
}

/** All active ingredients with their stock state at the active outlet. */
export async function getIngredientStockList(): Promise<StockListItem[]> {
  const merchantId = requireMerchantId();
  const [ingredients, balances] = await Promise.all([
    db
      .select({
        id: TABLE.ingredients.id,
        name: TABLE.ingredients.name,
        unit: TABLE.ingredients.unit,
      })
      .from(TABLE.ingredients)
      .where(
        and(
          eq(TABLE.ingredients.merchantId, merchantId),
          eq(TABLE.ingredients.isActive, true),
          isNull(TABLE.ingredients.deletedAt)
        )
      )
      .orderBy(TABLE.ingredients.name),
    balancesByTarget("ingredient"),
  ]);
  return ingredients.map((i) => {
    const balance = balances.get(i.id);
    return {
      id: i.id,
      name: i.name,
      priceMinorUnits: null,
      unit: i.unit,
      targetType: "ingredient" as const,
      tracked: balance !== undefined,
      onHandQty: balance?.onHandQty ?? 0,
      lowStockThreshold: balance?.lowStockThreshold ?? null,
    };
  });
}

/** Stock state for one product at the active outlet (null = untracked). */
export async function getProductStock(productId: string): Promise<{
  lowStockThreshold: number | null;
  onHandQty: number;
  tracked: boolean;
} | null> {
  const rows = await db
    .select({
      onHandQty: TABLE.inventoryStocks.onHandQty,
      lowStockThreshold: TABLE.inventoryStocks.lowStockThreshold,
    })
    .from(TABLE.inventoryStocks)
    .where(
      and(
        eq(TABLE.inventoryStocks.outletId, requireOutletId()),
        eq(TABLE.inventoryStocks.targetType, "product"),
        eq(TABLE.inventoryStocks.targetId, productId),
        isNull(TABLE.inventoryStocks.deletedAt)
      )
    );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    lowStockThreshold: row.lowStockThreshold,
    onHandQty: row.onHandQty,
    tracked: true,
  };
}

/** Tracked items (products + ingredients) for the stocktake picker. */
export async function getTrackedItems(): Promise<StockListItem[]> {
  const [products, ingredients] = await Promise.all([
    getProductStockList(),
    getIngredientStockList(),
  ]);
  return [...products, ...ingredients].filter((item) => item.tracked);
}

/* ── Transaction helpers (caller owns writeTransaction) ─────────── */
/* Each helper enqueues its own balance-row change; callers enqueue
   their parent rows (receipts, stocktakes, adjustments). */

interface BalanceRow {
  readonly deletedAt: string | null;
  readonly id: string;
  readonly onHandQty: number;
}

async function findBalance(
  tx: DbTx,
  targetType: StockTargetType,
  targetId: string,
  outletId: string
): Promise<BalanceRow | undefined> {
  const [row] = await tx
    .select({
      id: TABLE.inventoryStocks.id,
      onHandQty: TABLE.inventoryStocks.onHandQty,
      deletedAt: TABLE.inventoryStocks.deletedAt,
    })
    .from(TABLE.inventoryStocks)
    .where(
      and(
        eq(TABLE.inventoryStocks.outletId, outletId),
        eq(TABLE.inventoryStocks.targetType, targetType),
        eq(TABLE.inventoryStocks.targetId, targetId)
      )
    );
  return row;
}

/**
 * Insert-or-resurrect-or-update a balance row and enqueue its change.
 * `nextQty` receives the live balance (0 for fresh/resurrected rows).
 */
async function writeBalance(
  tx: DbTx,
  targetType: StockTargetType,
  targetId: string,
  nextQty: number
): Promise<void> {
  const outletId = requireOutletId();
  const now = dayjs().toISOString();
  const existing = await findBalance(tx, targetType, targetId, outletId);
  if (existing && existing.deletedAt === null) {
    await tx
      .update(TABLE.inventoryStocks)
      .set({ onHandQty: nextQty, updatedAt: now, isSynced: false })
      .where(eq(TABLE.inventoryStocks.id, existing.id));
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: existing.id,
      table: TABLE.inventoryStocks,
    });
    return;
  }
  if (existing) {
    /* Resurrect a soft-deleted row (unique index blocks a fresh insert). */
    await tx
      .update(TABLE.inventoryStocks)
      .set({
        onHandQty: nextQty,
        deletedAt: null,
        updatedAt: now,
        isSynced: false,
      })
      .where(eq(TABLE.inventoryStocks.id, existing.id));
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: existing.id,
      table: TABLE.inventoryStocks,
    });
    return;
  }
  const [row] = await tx
    .insert(TABLE.inventoryStocks)
    .values({
      id: crypto.randomUUID(),
      outletId,
      targetType,
      targetId,
      onHandQty: nextQty,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: TABLE.inventoryStocks.id });
  await getSyncClient().enqueueChange(tx, {
    operation: "insert",
    rowId: row.id,
    table: TABLE.inventoryStocks,
  });
}

/**
 * Incremental stock delta (sales, receipts, adjustments). Creates the
 * balance row from zero when absent — the first stock event starts
 * tracking (row-exists convention).
 */
export async function applyStockDelta(
  tx: DbTx,
  targetType: StockTargetType,
  targetId: string,
  delta: number
): Promise<void> {
  const outletId = requireOutletId();
  const existing = await findBalance(tx, targetType, targetId, outletId);
  const current = existing?.deletedAt === null ? existing.onHandQty : 0;
  await writeBalance(tx, targetType, targetId, current + delta);
}

/**
 * Absolute stock set (stock opname). Creates the balance row when
 * absent — opname is a valid tracking start.
 */
export async function setStockCount(
  tx: DbTx,
  targetType: StockTargetType,
  targetId: string,
  countedQty: number
): Promise<void> {
  await writeBalance(tx, targetType, targetId, countedQty);
}

/** Ensure a balance row exists at zero — "Mulai Lacak Stok". */
export async function ensureTracked(
  tx: DbTx,
  targetType: StockTargetType,
  targetId: string
): Promise<void> {
  const existing = await findBalance(
    tx,
    targetType,
    targetId,
    requireOutletId()
  );
  if (existing && existing.deletedAt === null) {
    return;
  }
  await writeBalance(tx, targetType, targetId, 0);
}

/* ── User-facing stock operations (own their transaction) ───────── */

export async function startTracking(
  targetType: StockTargetType,
  targetId: string
): Promise<void> {
  await getSyncClient().writeTransaction(db, async (tx) => {
    await ensureTracked(tx, targetType, targetId);
  });
  inventoryLogger.info("tracking_started", { targetId, targetType });
}

export async function stopTracking(
  targetType: StockTargetType,
  targetId: string
): Promise<void> {
  const outletId = requireOutletId();
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    const existing = await findBalance(tx, targetType, targetId, outletId);
    if (!existing || existing.deletedAt !== null) {
      return;
    }
    /* Soft-delete: hard deletes never sync and would pull-resurrect. */
    await tx
      .update(TABLE.inventoryStocks)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(eq(TABLE.inventoryStocks.id, existing.id));
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: existing.id,
      table: TABLE.inventoryStocks,
    });
  });
  inventoryLogger.info("tracking_stopped", { targetId, targetType });
}

export async function setLowStockThreshold(
  targetType: StockTargetType,
  targetId: string,
  threshold: number | null
): Promise<void> {
  const outletId = requireOutletId();
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    const existing = await findBalance(tx, targetType, targetId, outletId);
    if (!existing || existing.deletedAt !== null) {
      throw new Error("setLowStockThreshold: item is not tracked");
    }
    await tx
      .update(TABLE.inventoryStocks)
      .set({ lowStockThreshold: threshold, updatedAt: now, isSynced: false })
      .where(eq(TABLE.inventoryStocks.id, existing.id));
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: existing.id,
      table: TABLE.inventoryStocks,
    });
  });
}

/**
 * Guarded checkout decrement: no-op when the target has no live
 * balance row (untracked). Never blocks a sale. Used for both tracked
 * products and recipe-linked ingredients.
 */
export async function decrementStockForSale(
  tx: DbTx,
  targetType: StockTargetType,
  targetId: string,
  quantity: number
): Promise<void> {
  const outletId = requireOutletId();
  const existing = await findBalance(tx, targetType, targetId, outletId);
  if (!existing || existing.deletedAt !== null) {
    return;
  }
  const now = dayjs().toISOString();
  await tx
    .update(TABLE.inventoryStocks)
    .set({
      onHandQty: existing.onHandQty - quantity,
      updatedAt: now,
      isSynced: false,
    })
    .where(eq(TABLE.inventoryStocks.id, existing.id));
  await getSyncClient().enqueueChange(tx, {
    operation: "update",
    rowId: existing.id,
    table: TABLE.inventoryStocks,
  });
}

/* ── History feed ───────────────────────────────────────────────── */

export type StockHistoryKind = "receipt" | "stocktake" | "adjustment" | "sale";

export interface StockHistoryEntry {
  /** ISO timestamp for ordering/grouping. */
  readonly at: string;
  readonly id: string;
  readonly kind: StockHistoryKind;
  readonly note?: string;
  readonly orderNumber?: string;
  readonly qtyDelta: number;
  readonly reason?: string;
  readonly ref?: string;
  readonly supplierName?: string;
  readonly targetId: string;
  readonly targetName: string;
  readonly targetType: StockTargetType;
}

async function targetNames(
  ids: readonly string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) {
    return map;
  }
  const [products, ingredients] = await Promise.all([
    db
      .select({ id: TABLE.products.id, name: TABLE.products.name })
      .from(TABLE.products)
      .where(inArray(TABLE.products.id, [...ids])),
    db
      .select({ id: TABLE.ingredients.id, name: TABLE.ingredients.name })
      .from(TABLE.ingredients)
      .where(inArray(TABLE.ingredients.id, [...ids])),
  ]);
  for (const row of products) {
    map.set(row.id, row.name);
  }
  for (const row of ingredients) {
    map.set(row.id, row.name);
  }
  return map;
}

/**
 * Merged stock history: goods receipts, stocktakes, adjustments, and
 * product sales from completed orders — newest first.
 */
export async function getStockHistory(): Promise<StockHistoryEntry[]> {
  const outletId = requireOutletId();

  const [receiptLines, stocktakeLines, adjustments, saleLines] =
    await Promise.all([
      db
        .select({
          id: TABLE.goodsReceiptLines.id,
          targetId: TABLE.goodsReceiptLines.targetId,
          qty: TABLE.goodsReceiptLines.receivedQty,
          supplierName: TABLE.goodsReceipts.supplierName,
          ref: TABLE.goodsReceipts.ref,
          receivedAt: TABLE.goodsReceipts.receivedAt,
        })
        .from(TABLE.goodsReceiptLines)
        .innerJoin(
          TABLE.goodsReceipts,
          eq(TABLE.goodsReceiptLines.goodsReceiptId, TABLE.goodsReceipts.id)
        )
        .where(eq(TABLE.goodsReceiptLines.outletId, outletId)),
      db
        .select({
          id: TABLE.stocktakeLines.id,
          targetId: TABLE.stocktakeLines.targetId,
          variance: TABLE.stocktakeLines.varianceQty,
          reason: TABLE.stocktakes.reason,
          ref: TABLE.stocktakes.ref,
          countedAt: TABLE.stocktakes.countedAt,
        })
        .from(TABLE.stocktakeLines)
        .innerJoin(
          TABLE.stocktakes,
          eq(TABLE.stocktakeLines.stocktakeId, TABLE.stocktakes.id)
        )
        .where(
          and(
            eq(TABLE.stocktakeLines.outletId, outletId),
            isNull(TABLE.stocktakes.deletedAt)
          )
        ),
      db
        .select({
          id: TABLE.stockAdjustments.id,
          targetType: TABLE.stockAdjustments.targetType,
          targetId: TABLE.stockAdjustments.targetId,
          qtyDelta: TABLE.stockAdjustments.qtyDelta,
          reason: TABLE.stockAdjustments.reason,
          note: TABLE.stockAdjustments.note,
          createdAt: TABLE.stockAdjustments.createdAt,
        })
        .from(TABLE.stockAdjustments)
        .where(eq(TABLE.stockAdjustments.outletId, outletId)),
      db
        .select({
          id: TABLE.orderItems.id,
          productId: TABLE.orderItems.productId,
          productName: TABLE.orderItems.productName,
          quantity: TABLE.orderItems.quantity,
          orderNumber: TABLE.orders.orderNumber,
          createdAt: TABLE.orders.createdAt,
        })
        .from(TABLE.orderItems)
        .innerJoin(TABLE.orders, eq(TABLE.orderItems.orderId, TABLE.orders.id))
        .where(
          and(
            eq(TABLE.orderItems.outletId, outletId),
            eq(TABLE.orders.status, "completed")
          )
        ),
    ]);

  const names = await targetNames([
    ...new Set([
      ...receiptLines.map((l) => l.targetId),
      ...stocktakeLines.map((l) => l.targetId),
      ...adjustments.map((l) => l.targetId),
    ]),
  ]);

  const entries: StockHistoryEntry[] = [];
  for (const line of receiptLines) {
    entries.push({
      id: line.id,
      kind: "receipt",
      targetType: "product",
      targetId: line.targetId,
      targetName: names.get(line.targetId) ?? "—",
      qtyDelta: line.qty,
      at: line.receivedAt,
      supplierName: line.supplierName ?? undefined,
      ref: line.ref,
    });
  }
  for (const line of stocktakeLines) {
    entries.push({
      id: line.id,
      kind: "stocktake",
      targetType: "product",
      targetId: line.targetId,
      targetName: names.get(line.targetId) ?? "—",
      qtyDelta: line.variance,
      at: line.countedAt,
      reason: line.reason,
      ref: line.ref,
    });
  }
  for (const line of adjustments) {
    entries.push({
      id: line.id,
      kind: "adjustment",
      targetType: line.targetType as StockTargetType,
      targetId: line.targetId,
      targetName: names.get(line.targetId) ?? "—",
      qtyDelta: line.qtyDelta,
      at: line.createdAt,
      reason: line.reason,
      note: line.note ?? undefined,
    });
  }
  for (const line of saleLines) {
    if (!line.productId) {
      continue;
    }
    entries.push({
      id: line.id,
      kind: "sale",
      targetType: "product",
      targetId: line.productId,
      targetName: line.productName,
      qtyDelta: -line.quantity,
      at: line.createdAt,
      orderNumber: line.orderNumber,
    });
  }

  entries.sort((a, b) => b.at.localeCompare(a.at));
  return entries.slice(0, 500);
}

/* ── Goods receipt write (Penerimaan) ───────────────────────────── */

export interface ReceiptLineInput {
  readonly qty: number;
  readonly targetId: string;
  readonly targetType: StockTargetType;
  readonly unitCostMinorUnits: number | null;
}

async function nextRef(prefix: "GR" | "SO"): Promise<string> {
  const outletId = requireOutletId();
  const table = prefix === "GR" ? TABLE.goodsReceipts : TABLE.stocktakes;
  const column =
    prefix === "GR" ? TABLE.goodsReceipts.ref : TABLE.stocktakes.ref;
  const rows = await db
    .select({ ref: column })
    .from(table)
    .where(eq(table.outletId, outletId));
  const today = dayjs().format("YYYYMMDD");
  const prefixToday = `${prefix}-${today}-`;
  let max = 0;
  for (const row of rows) {
    if (row.ref.startsWith(prefixToday)) {
      const n = Number.parseInt(row.ref.slice(prefixToday.length), 10);
      if (Number.isFinite(n) && n > max) {
        max = n;
      }
    }
  }
  return `${prefixToday}-${String(max + 1).padStart(3, "0")}`;
}

export async function nextGoodsReceiptRef(): Promise<string> {
  return await nextRef("GR");
}

export async function nextStocktakeRef(): Promise<string> {
  return await nextRef("SO");
}

/** Persist a goods receipt and increment balances in one transaction. */
export async function recordGoodsReceipt(input: {
  ref: string;
  supplierName: string | null;
  note: string | null;
  lines: readonly ReceiptLineInput[];
}): Promise<void> {
  if (input.lines.length === 0) {
    throw new Error("recordGoodsReceipt: at least one line is required");
  }
  const outletId = requireOutletId();
  const staffId = requireStaffId();
  const now = dayjs().toISOString();

  await getSyncClient().writeTransaction(db, async (tx) => {
    const [receipt] = await tx
      .insert(TABLE.goodsReceipts)
      .values({
        outletId,
        staffId,
        ref: input.ref,
        supplierName: input.supplierName,
        note: input.note,
        receivedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: TABLE.goodsReceipts.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: receipt.id,
      table: TABLE.goodsReceipts,
    });

    for (const line of input.lines) {
      const [row] = await tx
        .insert(TABLE.goodsReceiptLines)
        .values({
          goodsReceiptId: receipt.id,
          outletId,
          targetId: line.targetId,
          receivedQty: line.qty,
          unitCostMinorUnits: line.unitCostMinorUnits,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: TABLE.goodsReceiptLines.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: row.id,
        table: TABLE.goodsReceiptLines,
      });
      await applyStockDelta(tx, line.targetType, line.targetId, line.qty);
    }
    inventoryLogger.info("goods_receipt_recorded", {
      ref: input.ref,
      lines: input.lines.length,
    });
  });
}

/* ── Stocktake write (Stock Opname) ─────────────────────────────── */

export interface StocktakeLineInput {
  readonly countedQty: number;
  readonly systemQtyBefore: number;
  readonly targetId: string;
  readonly targetType: StockTargetType;
  readonly varianceQty: number;
}

/** Persist a stocktake (variance lines) and set balances absolutely. */
export async function recordStocktake(input: {
  ref: string;
  reason: string;
  targetType: StockTargetType;
  lines: readonly StocktakeLineInput[];
}): Promise<void> {
  if (input.lines.length === 0) {
    throw new Error("recordStocktake: at least one line is required");
  }
  const outletId = requireOutletId();
  const staffId = requireStaffId();
  const now = dayjs().toISOString();

  await getSyncClient().writeTransaction(db, async (tx) => {
    const [stocktake] = await tx
      .insert(TABLE.stocktakes)
      .values({
        outletId,
        staffId,
        ref: input.ref,
        targetType: input.targetType,
        reason: input.reason,
        countedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: TABLE.stocktakes.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: stocktake.id,
      table: TABLE.stocktakes,
    });

    for (const line of input.lines) {
      const [row] = await tx
        .insert(TABLE.stocktakeLines)
        .values({
          stocktakeId: stocktake.id,
          outletId,
          targetId: line.targetId,
          systemQtyBefore: line.systemQtyBefore,
          countedQty: line.countedQty,
          varianceQty: line.varianceQty,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: TABLE.stocktakeLines.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: row.id,
        table: TABLE.stocktakeLines,
      });
      await setStockCount(tx, line.targetType, line.targetId, line.countedQty);
    }
    inventoryLogger.info("stocktake_recorded", {
      ref: input.ref,
      lines: input.lines.length,
    });
  });
}

/* ── Adjustment write (Penyesuaian) ─────────────────────────────── */

export async function createStockAdjustment(input: {
  targetType: StockTargetType;
  targetId: string;
  qtyDelta: number;
  reason: AdjustmentReason;
  note?: string;
}): Promise<string> {
  if (!Number.isFinite(input.qtyDelta) || input.qtyDelta === 0) {
    throw new Error("createStockAdjustment: qtyDelta must be non-zero");
  }
  const outletId = requireOutletId();
  const staffId = requireStaffId();
  const now = dayjs().toISOString();

  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(TABLE.stockAdjustments)
      .values({
        outletId,
        staffId,
        targetType: input.targetType,
        targetId: input.targetId,
        qtyDelta: input.qtyDelta,
        reason: input.reason,
        note: input.note ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: TABLE.stockAdjustments.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.stockAdjustments,
    });
    await applyStockDelta(tx, input.targetType, input.targetId, input.qtyDelta);
    inventoryLogger.info("adjustment_created", {
      targetId: input.targetId,
      qtyDelta: input.qtyDelta,
      reason: input.reason,
    });
    return row.id;
  });
}

function requireStaffId(): string {
  const staff = currentUser();
  if (!staff) {
    throw new Error("inventory: no active staff session");
  }
  return staff.id;
}
