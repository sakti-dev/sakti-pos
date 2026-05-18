import { afterEach, describe, expect, test, vi } from "bun:test";

const mockSelect = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../../db/script", () => ({
  scriptDb: {
    select: (...args: unknown[]) => mockSelect(...args),
    transaction: (fn: unknown) => mockTransaction(fn),
  },
}));

const { simulateProductChange } = await import("../sync-simulator");

describe("simulateProductChange", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("creates random sync test menu data for the single scope", async () => {
    const insertedRows: unknown[] = [];
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockResolvedValue([{ id: "merchant-1" }]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "outlet-1" }]),
        }),
      });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn((rows: unknown) => {
              insertedRows.push(rows);
              return Promise.resolve();
            }),
          }),
        };
        await fn(tx);
      }
    );

    const result = await simulateProductChange({
      now: new Date("2026-05-09T13:00:00.000Z"),
    });

    expect(result.merchantId).toBe("merchant-1");
    expect(result.outletId).toBe("outlet-1");
    expect(result.categoryName).toStartWith("SYNC TEST Category ");
    expect(result.productName).toStartWith("SYNC TEST Product ");
    expect(insertedRows).toHaveLength(3);
    expect(insertedRows[0]).toEqual(
      expect.objectContaining({
        id: result.categoryId,
        merchantId: "merchant-1",
        name: result.categoryName,
      })
    );
    expect(insertedRows[1]).toEqual(
      expect.objectContaining({
        categoryId: result.categoryId,
        id: result.productId,
        merchantId: "merchant-1",
        name: result.productName,
      })
    );
    expect(insertedRows[2]).toEqual(
      expect.objectContaining({
        id: result.outletProductId,
        outletId: "outlet-1",
        productId: result.productId,
      })
    );
  });

  test("refuses to simulate when the database does not have exactly one merchant", async () => {
    mockSelect.mockReturnValueOnce({
      from: vi
        .fn()
        .mockResolvedValue([{ id: "merchant-1" }, { id: "merchant-2" }]),
    });

    await expect(simulateProductChange()).rejects.toThrow(
      "Expected exactly one merchant"
    );
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
