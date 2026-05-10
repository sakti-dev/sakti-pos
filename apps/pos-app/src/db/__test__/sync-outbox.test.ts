import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@repo/database", () => ({
  syncOutbox: {
    changedAt: "changed_at",
    id: "id",
    operation: "operation",
    rowId: "row_id",
    scopeId: "scope_id",
    scopeType: "scope_type",
    syncedAt: "synced_at",
    tableName: "table_name",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
  isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
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

vi.mock("../index", () => ({
  db: {
    delete: mockDelete,
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
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
});
