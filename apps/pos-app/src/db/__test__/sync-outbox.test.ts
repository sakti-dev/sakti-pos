import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
  gt: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "gt" })),
  gte: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "gte" })),
  inArray: vi.fn((col: unknown, values: unknown[]) => ({ col, values })),
  isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
  like: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "like" })),
  lt: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "lt" })),
  or: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
    {
      raw: (value: string) => ({ raw: value }),
    }
  ),
}));

const pendingRows: Record<string, OutboxRow> = {};

interface OutboxRow {
  changedAt: string;
  id: string;
  operation: "insert" | "update" | "delete";
  rowId: string;
  scopeId: string;
  scopeType: "merchant" | "outlet";
  syncedAt: string | null;
  tableName: string;
}

function pendingKey(tableName: string, rowId: string) {
  return `${tableName}:${rowId}`;
}

const mockDeleteWhere = vi.fn((conditions: unknown[]) => {
  const rowId = findConditionValue(conditions, "row_id");
  const tableName = findConditionValue(conditions, "table_name");
  if (rowId && tableName) {
    delete pendingRows[pendingKey(tableName, rowId)];
  }
});
const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

const mockInsertValues = vi.fn((row: Partial<OutboxRow>) => {
  const normalized = {
    ...row,
    syncedAt: row.syncedAt ?? null,
  } as OutboxRow;
  pendingRows[pendingKey(normalized.tableName, normalized.rowId)] = normalized;
});
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockSelect = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn((conditions: unknown[]) => {
      const rows = filterRows(conditions);
      return Object.assign(rows, {
        limit: vi.fn(() => rows),
      });
    }),
  })),
}));

const mockUpdateSet = vi.fn((patch: Partial<OutboxRow>) => ({
  where: vi.fn((conditions: unknown[]) => {
    const rowId = findConditionValue(conditions, "row_id");
    const tableName = findConditionValue(conditions, "table_name");
    if (rowId && tableName) {
      const key = pendingKey(tableName, rowId);
      pendingRows[key] = { ...pendingRows[key], ...patch };
    }
  }),
}));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

const mockTransaction = vi.fn(
  async (fn: (tx: typeof mockDb) => unknown) => await fn(mockDb)
);

const mockDb = {
  delete: mockDelete,
  insert: mockInsert,
  select: mockSelect,
  transaction: mockTransaction,
  update: mockUpdate,
};

vi.mock("../index", () => ({
  db: mockDb,
}));

function findConditionValue(
  conditions: unknown[],
  column: string
): string | null {
  for (const condition of conditions.flat()) {
    if (
      condition &&
      typeof condition === "object" &&
      "a" in condition &&
      "b" in condition &&
      getColumnName(condition.a) === column &&
      typeof condition.b === "string"
    ) {
      return condition.b;
    }
  }
  return null;
}

function getColumnName(column: unknown): unknown {
  if (typeof column === "string") {
    return column;
  }
  if (column && typeof column === "object" && "name" in column) {
    return column.name;
  }
  return column;
}

function filterRows(conditions: unknown[]): OutboxRow[] {
  const rowId = findConditionValue(conditions, "row_id");
  const tableName = findConditionValue(conditions, "table_name");
  const scopeId = findConditionValue(conditions, "scope_id");
  const scopeType = findConditionValue(conditions, "scope_type");

  return Object.values(pendingRows).filter((row) => {
    if (rowId && row.rowId !== rowId) {
      return false;
    }
    if (tableName && row.tableName !== tableName) {
      return false;
    }
    if (scopeId && row.scopeId !== scopeId) {
      return false;
    }
    if (scopeType && row.scopeType !== scopeType) {
      return false;
    }
    return row.syncedAt === null;
  });
}

describe("recordLocalChange", () => {
  beforeEach(() => {
    for (const key of Object.keys(pendingRows)) {
      delete pendingRows[key];
    }
    vi.clearAllMocks();
    mockTransaction.mockImplementation(
      async (fn: (tx: typeof mockDb) => unknown) => await fn(mockDb)
    );
  });

  test("coalesces multiple updates for the same row into one latest event", async () => {
    const { listPendingOutbox, recordLocalChange } = await import(
      "../sync-outbox"
    );

    await recordLocalChange({
      operation: "update",
      rowId: "prod-1",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    await recordLocalChange({
      operation: "update",
      rowId: "prod-1",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    const rows = await listPendingOutbox("merchant", "merchant-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("update");
  });

  test("removes unsynced insert when same row is deleted before sync", async () => {
    const { listPendingOutbox, recordLocalChange } = await import(
      "../sync-outbox"
    );

    await recordLocalChange({
      operation: "insert",
      rowId: "prod-2",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    await recordLocalChange({
      operation: "delete",
      rowId: "prod-2",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    expect(await listPendingOutbox("merchant", "merchant-1")).toHaveLength(0);
  });

  test("delete overrides pending update for existing server row", async () => {
    const { listPendingOutbox, recordLocalChange } = await import(
      "../sync-outbox"
    );

    await recordLocalChange({
      operation: "update",
      rowId: "prod-3",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    await recordLocalChange({
      operation: "delete",
      rowId: "prod-3",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    const rows = await listPendingOutbox("merchant", "merchant-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("delete");
  });

  test("recordLocalChange uses a transaction when no external transaction is provided", async () => {
    const { recordLocalChange } = await import("../sync-outbox");

    await recordLocalChange({
      operation: "insert",
      rowId: "product-new",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  test("recordLocalChange uses external transaction without nesting", async () => {
    const { recordLocalChange } = await import("../sync-outbox");

    await recordLocalChange(
      {
        operation: "insert",
        rowId: "product-external",
        scopeId: "merchant-1",
        scopeType: "merchant",
        tableName: "products",
      },
      mockDb as never
    );

    expect(mockTransaction).not.toHaveBeenCalled();

    const { listPendingOutbox } = await import("../sync-outbox");
    const rows = await listPendingOutbox("merchant", "merchant-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].rowId).toBe("product-external");
  });

  test("delete then insert coalesces to update", async () => {
    const { listPendingOutbox, recordLocalChange } = await import(
      "../sync-outbox"
    );

    await recordLocalChange({
      operation: "delete",
      rowId: "prod-recreate",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });
    await recordLocalChange({
      operation: "insert",
      rowId: "prod-recreate",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    const rows = await listPendingOutbox("merchant", "merchant-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("update");
  });

  test("delete then update coalesces to update", async () => {
    const { listPendingOutbox, recordLocalChange } = await import(
      "../sync-outbox"
    );

    await recordLocalChange({
      operation: "delete",
      rowId: "prod-update-after-delete",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });
    await recordLocalChange({
      operation: "update",
      rowId: "prod-update-after-delete",
      scopeId: "merchant-1",
      scopeType: "merchant",
      tableName: "products",
    });

    const rows = await listPendingOutbox("merchant", "merchant-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("update");
  });
});
