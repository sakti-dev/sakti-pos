import { syncOutbox as syncOutboxTable } from "@sync-contract/local-schema";
import {
  categories as categoriesTable,
  products as productsTable,
} from "@sync-contract/local-synced-schema";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, test, vi } from "vitest";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(
    "CREATE TABLE categories (" +
      "id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, name TEXT NOT NULL, " +
      "sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, " +
      "deleted_at TEXT, is_synced INTEGER NOT NULL DEFAULT 0, " +
      "created_at TEXT NOT NULL, updated_at TEXT NOT NULL" +
      ")"
  );
  sqlite.exec(
    "CREATE TABLE products (" +
      "id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, category_id TEXT, " +
      "name TEXT NOT NULL, price_minor_units INTEGER NOT NULL, " +
      "image_url TEXT, image_asset_id TEXT, " +
      "is_active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, " +
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
  syncClient: {
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
  },
}));

vi.mock("../index", () => ({
  get db() {
    return mocks.getTestDb();
  },
}));

describe("menu db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
  });

  test("getCategories returns ordered categories", async () => {
    const db = mocks.getTestDb();
    await db.insert(categoriesTable).values([
      {
        id: "cat-1",
        merchantId: "merchant-1",
        name: "Food",
        isSynced: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "cat-2",
        merchantId: "merchant-1",
        name: "Drink",
        isSynced: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ]);

    const { getCategories } = await import("../menu");
    const result = await getCategories();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Drink");
  });

  test("getCategory returns a single category by id", async () => {
    const db = mocks.getTestDb();
    await db.insert(categoriesTable).values({
      id: "cat-1",
      merchantId: "merchant-1",
      name: "Food",
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { getCategory } = await import("../menu");
    const result = await getCategory("cat-1");

    expect(result).toBeDefined();
    expect(result!.name).toBe("Food");
  });

  test("createCategory inserts row and enqueues outbox entry", async () => {
    const { createCategory } = await import("../menu");
    const result = await createCategory({ name: "Dessert" } as never);

    const db = mocks.getTestDb();

    const row = db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, result.id))
      .all()[0];
    expect(row).toBeDefined();
    expect(row!.name).toBe("Dessert");
    expect(row!.isSynced).toBe(false);

    const outbox = db
      .select()
      .from(syncOutboxTable)
      .where(eq(syncOutboxTable.rowId, result.id))
      .all()[0];
    expect(outbox).toBeDefined();
    expect(outbox!.tableName).toBe("categories");
    expect(outbox!.operation).toBe("insert");
    expect(outbox!.syncedAt).toBeNull();
  });

  test("deleteCategory soft-deletes and enqueues outbox entry", async () => {
    const db = mocks.getTestDb();
    await db.insert(categoriesTable).values({
      id: "cat-1",
      merchantId: "merchant-1",
      name: "Food",
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { deleteCategory } = await import("../menu");
    await deleteCategory("cat-1");

    const row = db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, "cat-1"))
      .all()[0];
    expect(row!.deletedAt).toBeDefined();
    expect(row!.isSynced).toBe(false);

    const outbox = db
      .select()
      .from(syncOutboxTable)
      .where(eq(syncOutboxTable.rowId, "cat-1"))
      .all()[0];
    expect(outbox).toBeDefined();
    expect(outbox!.tableName).toBe("categories");
    expect(outbox!.operation).toBe("update");
    expect(outbox!.syncedAt).toBeNull();
  });

  test("createProduct inserts row and enqueues outbox entry", async () => {
    const { createProduct } = await import("../menu");
    const result = await createProduct({
      name: "Nasi Goreng",
      priceMinorUnits: 15_000,
    } as never);

    const db = mocks.getTestDb();

    const row = db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, result.id))
      .all()[0];
    expect(row).toBeDefined();
    expect(row!.name).toBe("Nasi Goreng");
    expect(row!.isSynced).toBe(false);

    const outbox = db
      .select()
      .from(syncOutboxTable)
      .where(eq(syncOutboxTable.rowId, result.id))
      .all()[0];
    expect(outbox).toBeDefined();
    expect(outbox!.tableName).toBe("products");
    expect(outbox!.operation).toBe("insert");
    expect(outbox!.syncedAt).toBeNull();
  });

  test("deleteProduct soft-deletes and enqueues outbox entry", async () => {
    const db = mocks.getTestDb();
    await db.insert(productsTable).values({
      id: "prod-1",
      merchantId: "merchant-1",
      name: "Nasi Goreng",
      priceMinorUnits: 15_000,
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { deleteProduct } = await import("../menu");
    await deleteProduct("prod-1");

    const row = db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, "prod-1"))
      .all()[0];
    expect(row!.deletedAt).toBeDefined();
    expect(row!.isSynced).toBe(false);

    const outbox = db
      .select()
      .from(syncOutboxTable)
      .where(eq(syncOutboxTable.rowId, "prod-1"))
      .all()[0];
    expect(outbox).toBeDefined();
    expect(outbox!.tableName).toBe("products");
    expect(outbox!.operation).toBe("update");
    expect(outbox!.syncedAt).toBeNull();
  });
});
