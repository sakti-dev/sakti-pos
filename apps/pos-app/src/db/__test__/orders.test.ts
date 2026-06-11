import { syncOutbox as syncOutboxTable } from "@sync-contract/local-schema";
import {
  orderItems as orderItemsTable,
  orders as ordersTable,
} from "@sync-contract/local-synced-schema";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, test, vi } from "vitest";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(
    "CREATE TABLE orders (" +
      "id TEXT PRIMARY KEY, outlet_id TEXT NOT NULL, register_id TEXT, " +
      "staff_id TEXT, order_number TEXT NOT NULL UNIQUE, " +
      "total_minor_units INTEGER NOT NULL, payment_method TEXT NOT NULL, " +
      "amount_paid_minor_units INTEGER, change_amount_minor_units INTEGER, " +
      "status TEXT NOT NULL, " +
      "deleted_at TEXT, is_synced INTEGER NOT NULL DEFAULT 0, " +
      "created_at TEXT NOT NULL, updated_at TEXT NOT NULL" +
      ")"
  );
  sqlite.exec(
    "CREATE TABLE order_items (" +
      "id TEXT PRIMARY KEY, order_id TEXT NOT NULL, outlet_id TEXT NOT NULL, " +
      "product_id TEXT, product_name TEXT NOT NULL, " +
      "quantity INTEGER NOT NULL, unit_price_minor_units INTEGER NOT NULL, " +
      "original_price_minor_units INTEGER, subtotal_minor_units INTEGER NOT NULL, " +
      "deleted_at TEXT, is_synced INTEGER NOT NULL DEFAULT 0, " +
      "created_at TEXT NOT NULL, updated_at TEXT NOT NULL" +
      ")"
  );
  sqlite.exec(
    "CREATE TABLE sync_outbox (" +
      "id TEXT PRIMARY KEY, table_name TEXT NOT NULL, row_id TEXT NOT NULL, " +
      "operation TEXT NOT NULL, payload TEXT, scope_id TEXT NOT NULL, " +
      "changed_at TEXT NOT NULL, synced_at TEXT" +
      ")"
  );
  return drizzle(sqlite);
}

const mocks = vi.hoisted(() => {
  let testDb: ReturnType<typeof createTestDb>;
  return {
    getTestDb: () => testDb,
    setTestDb: (db: ReturnType<typeof createTestDb>) => {
      testDb = db;
    },
  };
});

vi.mock("~/store/outlet", () => ({
  currentMerchantId: vi.fn(() => "merchant-1"),
  currentOutletId: vi.fn(() => "outlet-1"),
  currentRegisterId: vi.fn(() => "register-1"),
  currentOutletTimezone: vi.fn(() => "Asia/Jakarta"),
}));

vi.mock("~/lib/sync", () => ({
  getSyncClient: vi.fn(() => ({
    enqueueChange: vi.fn().mockImplementation(async (tx: any, opts: any) => {
      const tableName =
        opts.table?.[Symbol.for("drizzle:Name")] ??
        opts.table?.name ??
        "unknown";
      await tx.insert(syncOutboxTable).values({
        id:
          "outbox-" +
          opts.operation +
          "-" +
          tableName +
          "-" +
          opts.rowId +
          "-" +
          crypto.randomUUID(),
        tableName,
        rowId: opts.rowId,
        operation: opts.operation,
        scopeId: "",
        changedAt: new Date().toISOString(),
      });
    }),
    writeLocalChange: vi.fn().mockImplementation(async (tx: any, opts: any) => {
      await opts.write(tx);
      const tableName =
        opts.table?.[Symbol.for("drizzle:Name")] ??
        opts.table?.name ??
        "unknown";
      await tx.insert(syncOutboxTable).values({
        id:
          "outbox-" +
          opts.operation +
          "-" +
          tableName +
          "-" +
          opts.rowId +
          "-" +
          crypto.randomUUID(),
        tableName,
        rowId: opts.rowId,
        operation: opts.operation,
        scopeId: "",
        changedAt: new Date().toISOString(),
      });
    }),
    writeTransaction: vi
      .fn()
      .mockImplementation(async (_db: any, fn: any) => fn(mocks.getTestDb())),
  })),
}));

vi.mock("../index", () => ({
  get db() {
    return mocks.getTestDb();
  },
}));

const ORDER_NUMBER_PATTERN = /^\d{4}-\d{2}-\d{2}-001$/;

describe("createOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
  });

  test("inserts order and items, enqueues outbox entries, returns order number", async () => {
    const { createOrder } = await import("../orders");
    const orderNumber = await createOrder({
      amountPaidMinorUnits: 20_000,
      changeAmountMinorUnits: 0,
      items: [
        {
          priceMinorUnits: 10_000,
          product_id: "product-1",
          product_name: "Nasi Goreng",
          qty: 2,
        },
      ],
      paymentMethod: "cash",
      staffId: "staff-1",
      totalMinorUnits: 20_000,
    });

    expect(orderNumber).toMatch(ORDER_NUMBER_PATTERN);

    const db = mocks.getTestDb();

    const order = db.select().from(ordersTable).all()[0];
    expect(order).toBeDefined();
    expect(order!.orderNumber).toBe(orderNumber);
    expect(order!.status).toBe("completed");
    expect(order!.isSynced).toBe(false);

    const items = db.select().from(orderItemsTable).all();
    expect(items).toHaveLength(1);
    expect(items[0].productName).toBe("Nasi Goreng");
    expect(items[0].isSynced).toBe(false);

    const outboxEntries = db.select().from(syncOutboxTable).all();
    const orderOutbox = outboxEntries.find((o) => o.tableName === "orders");
    const itemOutbox = outboxEntries.find((o) => o.tableName === "order_items");

    expect(orderOutbox).toBeDefined();
    expect(orderOutbox!.operation).toBe("insert");
    expect(orderOutbox!.syncedAt).toBeNull();

    expect(itemOutbox).toBeDefined();
    expect(itemOutbox!.operation).toBe("insert");
    expect(itemOutbox!.syncedAt).toBeNull();
  });
});

describe("cancelOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
  });

  test("cancels order and enqueues outbox entry", async () => {
    const db = mocks.getTestDb();
    await db.insert(ordersTable).values({
      id: "order-1",
      outletId: "outlet-1",
      orderNumber: "2026-01-01-001",
      totalMinorUnits: 20_000,
      paymentMethod: "cash",
      status: "completed",
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { cancelOrder } = await import("../orders");
    await cancelOrder("order-1");

    const row = db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, "order-1"))
      .all()[0];
    expect(row!.status).toBe("cancelled");
    expect(row!.isSynced).toBe(false);

    const outbox = db
      .select()
      .from(syncOutboxTable)
      .where(eq(syncOutboxTable.rowId, "order-1"))
      .all()[0];
    expect(outbox).toBeDefined();
    expect(outbox!.tableName).toBe("orders");
    expect(outbox!.operation).toBe("update");
    expect(outbox!.syncedAt).toBeNull();
  });
});
