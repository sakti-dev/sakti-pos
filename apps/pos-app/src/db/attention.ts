import { and, eq } from "drizzle-orm";
import { currentOutletId } from "~/lib/auth/session";
import { db, TABLE } from "./index";

/* ── Low-stock (attention) ──────────────────────────────────────── */

export interface StockRow {
  readonly deletedAt: string | null;
  readonly lowStockThreshold: number;
  readonly onHandQty: number;
}

/** A tracked product row is "menipis" when its on-hand quantity has
 *  reached the threshold (<= — at-threshold already needs reordering).
 *  Default threshold is 0, so an empty balance counts as low stock. */
export function isLowStock(row: StockRow): boolean {
  if (row.deletedAt != null) {
    return false;
  }
  return row.onHandQty <= row.lowStockThreshold;
}

/** Count of product stock rows at/below their low-stock threshold for
 *  the active outlet. 0 when stock is not tracked yet. */
export async function getLowStockCount(): Promise<number> {
  const outletId = currentOutletId();
  if (!outletId) {
    return 0;
  }

  const rows = await db
    .select({
      deletedAt: TABLE.inventoryStocks.deletedAt,
      lowStockThreshold: TABLE.inventoryStocks.lowStockThreshold,
      onHandQty: TABLE.inventoryStocks.onHandQty,
    })
    .from(TABLE.inventoryStocks)
    .where(
      and(
        eq(TABLE.inventoryStocks.outletId, outletId),
        eq(TABLE.inventoryStocks.targetType, "product")
      )
    );

  return rows.filter(isLowStock).length;
}

/* ── Unsynced orders (offline queue) ───────────────────────────── */

export interface OrderSyncRow {
  readonly deletedAt: string | null;
  readonly isSynced: boolean;
}

/** An order needs upload when it exists locally and the server has
 *  not acknowledged it yet (is_synced flips to true on push). */
export function isUnsyncedOrder(row: OrderSyncRow): boolean {
  return row.deletedAt == null && !row.isSynced;
}

/** Count of orders captured on this device but not yet on the server —
 *  the offline-first "trust check" for the home attention list. */
export async function getUnsyncedOrderCount(): Promise<number> {
  const outletId = currentOutletId();
  if (!outletId) {
    return 0;
  }

  const rows = await db
    .select({
      deletedAt: TABLE.orders.deletedAt,
      isSynced: TABLE.orders.isSynced,
    })
    .from(TABLE.orders)
    .where(eq(TABLE.orders.outletId, outletId));

  return rows.filter(isUnsyncedOrder).length;
}
