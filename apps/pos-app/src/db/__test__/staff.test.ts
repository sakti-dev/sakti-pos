import { syncOutbox as syncOutboxTable } from "@sync-contract/local-schema";
import { staff as staffTable } from "@sync-contract/local-synced-schema";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, test, vi } from "vitest";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(
    "CREATE TABLE staff (" +
      "id TEXT PRIMARY KEY, merchant_id TEXT NOT NULL, cloud_user_id TEXT, " +
      "outlet_id TEXT, name TEXT NOT NULL, pin TEXT, " +
      "role TEXT NOT NULL, is_active INTEGER NOT NULL DEFAULT 1, " +
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

describe("staff db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setTestDb(createTestDb());
  });

  test("getStaff returns ordered staff", async () => {
    const db = mocks.getTestDb();
    await db.insert(staffTable).values([
      {
        id: "staff-1",
        merchantId: "merchant-1",
        name: "Alice",
        role: "cashier",
        isActive: true,
        isSynced: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "staff-2",
        merchantId: "merchant-1",
        name: "Bob",
        role: "manager",
        isActive: true,
        isSynced: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ]);

    const { getStaff } = await import("../staff");
    const result = await getStaff();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Alice");
  });

  test("getStaffMember returns a single staff by id", async () => {
    const db = mocks.getTestDb();
    await db.insert(staffTable).values({
      id: "staff-1",
      merchantId: "merchant-1",
      name: "Alice",
      role: "cashier",
      isActive: true,
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { getStaffMember } = await import("../staff");
    const result = await getStaffMember("staff-1");

    expect(result).toBeDefined();
    expect(result!.name).toBe("Alice");
  });

  test("createStaffMember inserts row and enqueues outbox entry", async () => {
    const { createStaffMember } = await import("../staff");
    const result = await createStaffMember({
      merchantId: "merchant-1",
      name: "Charlie",
      role: "cashier",
    } as never);

    const db = mocks.getTestDb();

    const row = db
      .select()
      .from(staffTable)
      .where(eq(staffTable.id, result.id))
      .all()[0];
    expect(row).toBeDefined();
    expect(row!.name).toBe("Charlie");
    expect(row!.isSynced).toBe(false);

    const outbox = db
      .select()
      .from(syncOutboxTable)
      .where(eq(syncOutboxTable.rowId, result.id))
      .all()[0];
    expect(outbox).toBeDefined();
    expect(outbox!.tableName).toBe("staff");
    expect(outbox!.operation).toBe("insert");
    expect(outbox!.syncedAt).toBeNull();
  });

  test("updateStaffMember updates row and enqueues outbox entry", async () => {
    const db = mocks.getTestDb();
    await db.insert(staffTable).values({
      id: "staff-1",
      merchantId: "merchant-1",
      name: "Alice",
      role: "cashier",
      isActive: true,
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { updateStaffMember } = await import("../staff");
    const result = await updateStaffMember("staff-1", {
      name: "Alice Updated",
    });

    expect(result.name).toBe("Alice Updated");

    const row = db
      .select()
      .from(staffTable)
      .where(eq(staffTable.id, "staff-1"))
      .all()[0];
    expect(row!.name).toBe("Alice Updated");
    expect(row!.isSynced).toBe(false);

    const outbox = db
      .select()
      .from(syncOutboxTable)
      .where(eq(syncOutboxTable.rowId, "staff-1"))
      .all()[0];
    expect(outbox).toBeDefined();
    expect(outbox!.tableName).toBe("staff");
    expect(outbox!.operation).toBe("update");
    expect(outbox!.syncedAt).toBeNull();
  });

  test("countActiveManagers returns count from query", async () => {
    const db = mocks.getTestDb();
    await db.insert(staffTable).values([
      {
        id: "s-1",
        merchantId: "merchant-1",
        name: "M1",
        role: "manager",
        isActive: true,
        isSynced: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "s-2",
        merchantId: "merchant-1",
        name: "M2",
        role: "manager",
        isActive: true,
        isSynced: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
      {
        id: "s-3",
        merchantId: "merchant-1",
        name: "O1",
        role: "owner",
        isActive: true,
        isSynced: true,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
      },
    ]);

    const { countActiveManagers } = await import("../staff");
    const result = await countActiveManagers();

    expect(result).toBe(3);
  });

  test("getOwnerStaff returns owner staff for a merchant", async () => {
    const db = mocks.getTestDb();
    await db.insert(staffTable).values({
      id: "owner-1",
      merchantId: "merchant-1",
      name: "Owner",
      role: "owner",
      isActive: true,
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { getOwnerStaff } = await import("../staff");
    const result = await getOwnerStaff("merchant-1");

    expect(result).toBeDefined();
    expect(result!.role).toBe("owner");
  });

  test("getStaffByCloudUserId returns matching active staff", async () => {
    const db = mocks.getTestDb();
    await db.insert(staffTable).values({
      id: "staff-1",
      merchantId: "merchant-1",
      name: "Alice",
      role: "cashier",
      isActive: true,
      cloudUserId: "cloud-1",
      isSynced: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    const { getStaffByCloudUserId } = await import("../staff");
    const result = await getStaffByCloudUserId("merchant-1", "cloud-1");

    expect(result).toBeDefined();
    expect(result!.name).toBe("Alice");
  });
});
