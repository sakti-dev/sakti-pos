import { staff } from "@repo/database";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockFrom = vi.fn();
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockRecordLocalChange = vi.fn();
  const mockDb = {
    delete: mockDelete,
    insert: mockInsert,
    select: mockSelect,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn(mockDb),
    update: mockUpdate,
  };

  return {
    mockDb,
    mockDelete,
    mockFrom,
    mockInsert,
    mockRecordLocalChange,
    mockSelect,
    mockUpdate,
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  asc: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  count: vi.fn(() => "count_placeholder"),
  eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
  gt: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "gt" })),
  gte: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "gte" })),
  inArray: vi.fn((col: unknown, values: unknown[]) => ({ col, values })),
  isNull: vi.fn((col: unknown) => ({ col, op: "isNull" })),
  lt: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "lt" })),
  or: vi.fn((...args: unknown[]) => args),
  like: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "like" })),
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

const syncOutbox = await import("../sync-outbox");
let recordLocalChangeSpy: ReturnType<typeof vi.spyOn> | undefined;
const { mockFrom, mockInsert, mockRecordLocalChange, mockSelect, mockUpdate } =
  mocks;

vi.mock("../index", () => ({
  db: mocks.mockDb,
}));

vi.mock("~/store/outlet", () => ({
  currentMerchantId: vi.fn(() => null),
  currentOutletId: vi.fn(() => null),
  currentRegisterId: vi.fn(() => null),
  currentOutletTimezone: vi.fn(() => "Asia/Jakarta"),
}));

function mockFromQuery(data: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(data);
  const whereResult = Object.assign(Promise.resolve(data), {
    limit: limitFn,
  });
  return {
    where: vi.fn().mockReturnValue(whereResult),
    orderBy: vi.fn().mockResolvedValue(data),
  };
}

describe("staff db", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordLocalChangeSpy = vi
      .spyOn(syncOutbox, "recordLocalChange")
      .mockImplementation((...args: unknown[]) =>
        mockRecordLocalChange(...args)
      );
  });

  afterEach(() => {
    recordLocalChangeSpy?.mockRestore();
    recordLocalChangeSpy = undefined;
  });

  test("getStaff returns ordered staff", async () => {
    const fakeStaff = [
      { id: "staff-1", name: "Alice" },
      { id: "staff-2", name: "Bob" },
    ];
    mockFrom.mockReturnValue(mockFromQuery(fakeStaff));

    const { getStaff } = await import("../staff");
    const result = await getStaff();

    expect(result).toEqual(fakeStaff);
    expect(mockSelect).toHaveBeenCalled();
    expect(mockFrom).toHaveBeenCalledWith(staff);
  });

  test("getStaffMember returns a single staff by id", async () => {
    const fakeStaffMember = { id: "staff-1", name: "Alice" };
    mockFrom.mockReturnValue(mockFromQuery([fakeStaffMember]));

    const { getStaffMember } = await import("../staff");
    const result = await getStaffMember("staff-1");

    expect(result).toEqual(fakeStaffMember);
  });

  test("getStaffMember returns undefined when not found", async () => {
    mockFrom.mockReturnValue(mockFromQuery([]));

    const { getStaffMember } = await import("../staff");
    const result = await getStaffMember("nonexistent");

    expect(result).toBeUndefined();
  });

  test("createStaffMember inserts and returns the new staff", async () => {
    const newStaffMember = {
      id: "staff-3",
      merchantId: "merchant-1",
      name: "Charlie",
      role: "cashier",
    };
    const mockReturning = vi.fn().mockResolvedValue([newStaffMember]);
    const mockValues = vi.fn(() => ({ returning: mockReturning }));
    mockInsert.mockReturnValue({ values: mockValues });

    const { createStaffMember } = await import("../staff");
    const result = await createStaffMember({
      name: "Charlie",
      role: "cashier",
    } as never);

    expect(result).toEqual(newStaffMember);
    expect(mockValues).toHaveBeenCalledWith({
      name: "Charlie",
      role: "cashier",
    });
    expect(mockRecordLocalChange).toHaveBeenCalledWith(
      {
        operation: "insert",
        rowId: "staff-3",
        scopeId: "merchant-1",
        scopeType: "merchant",
        tableName: "staff",
      },
      expect.anything()
    );
  });

  test("updateStaffMember updates and returns the staff", async () => {
    const updatedStaffMember = {
      id: "staff-1",
      merchantId: "merchant-1",
      name: "Alice Updated",
      role: "manager",
    };
    const mockReturning = vi.fn().mockResolvedValue([updatedStaffMember]);
    const mockWhere = vi.fn(() => ({ returning: mockReturning }));
    const mockSet = vi.fn(() => ({ where: mockWhere }));
    mockUpdate.mockReturnValue({ set: mockSet });

    const { updateStaffMember } = await import("../staff");
    const result = await updateStaffMember("staff-1", {
      name: "Alice Updated",
    } as never);

    expect(result).toEqual(updatedStaffMember);
    expect(mockSet).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
    expect(mockRecordLocalChange).toHaveBeenCalledWith(
      {
        operation: "update",
        rowId: "staff-1",
        scopeId: "merchant-1",
        scopeType: "merchant",
        tableName: "staff",
      },
      expect.anything()
    );
  });

  test("countActiveManagers returns count from query", async () => {
    mockFrom.mockReturnValue(mockFromQuery([{ count: 3 }]));

    const { countActiveManagers } = await import("../staff");
    const result = await countActiveManagers();

    expect(result).toBe(3);
  });

  test("countActiveManagers returns 0 when no rows", async () => {
    mockFrom.mockReturnValue(mockFromQuery([]));

    const { countActiveManagers } = await import("../staff");
    const result = await countActiveManagers();

    expect(result).toBe(0);
  });

  test("getOwnerStaff returns owner staff for a merchant", async () => {
    const owner = { id: "owner-1", name: "Owner", role: "owner" };
    mockFrom.mockReturnValue(mockFromQuery([owner]));

    const { getOwnerStaff } = await import("../staff");
    const result = await getOwnerStaff("merchant-1");

    expect(result).toEqual(owner);
  });

  test("getOwnerStaff returns undefined when no owner exists", async () => {
    mockFrom.mockReturnValue(mockFromQuery([]));

    const { getOwnerStaff } = await import("../staff");
    const result = await getOwnerStaff("merchant-1");

    expect(result).toBeUndefined();
  });

  test("getStaffByCloudUserId returns matching active staff", async () => {
    const owner = {
      id: "owner-1",
      name: "Owner",
      role: "owner",
      cloudUserId: "cloud-user-1",
    };
    mockFrom.mockReturnValue(mockFromQuery([owner]));

    const { getStaffByCloudUserId } = await import("../staff");
    const result = await getStaffByCloudUserId("merchant-1", "cloud-user-1");

    expect(result).toEqual(owner);
  });
});
