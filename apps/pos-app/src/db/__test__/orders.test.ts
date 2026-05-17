import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
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

vi.mock("drizzle-orm/sqlite-proxy", () => ({
  drizzle: vi.fn(),
}));

const mockDbSelect = vi.fn();
const mockRecordLocalChange = vi.fn();
const syncOutbox = await import("../sync-outbox");
let recordLocalChangeSpy: ReturnType<typeof vi.spyOn> | undefined;
vi.mock("../index", () => ({
  db: {
    select: mockDbSelect,
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

vi.mock("~/store/outlet", () => ({
  currentMerchantId: vi.fn(() => "merchant-1"),
  currentOutletId: vi.fn(() => "outlet-1"),
  currentRegisterId: vi.fn(() => "register-1"),
  currentOutletTimezone: vi.fn(() => "Asia/Jakarta"),
}));

const ORDER_NUMBER_PATTERN = /^\d{4}-\d{2}-\d{2}-001$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

interface MockedInvoke {
  mock: {
    calls: [string, { statements: { params: unknown[] }[] }][];
  };
  mockResolvedValue(value: unknown): void;
}

describe("createOrder", () => {
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

  test("calls invoke with correct SQL statements and returns order number", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const mockedInvoke = invoke as unknown as MockedInvoke;

    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => []),
        })),
      })),
    } as never);

    mockedInvoke.mockResolvedValue({ last_insert_id: 1, rows_affected: 1 });

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
    expect(mockedInvoke).toHaveBeenCalledWith("run_sql_batch", {
      statements: expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("INSERT INTO orders"),
        }),
        expect.objectContaining({
          sql: expect.stringContaining("INSERT INTO order_items"),
        }),
        expect.objectContaining({
          sql: expect.stringContaining("INSERT INTO sync_outbox"),
        }),
      ]),
    });

    const statements = mockedInvoke.mock.calls[0]?.[1];
    const orderParams = statements?.statements?.[0]?.params;
    expect(orderParams?.[9]).toMatch(UTC_TIMESTAMP_PATTERN);
    expect(orderParams?.[10]).toBe(orderParams?.[9]);
  });
});
