import { paymentSettings } from "@sync-contract/local-synced-schema";
import { afterEach, describe, expect, test, vi } from "vitest";

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const tx = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
};

vi.mock("~/db", () => ({
  TABLE: { paymentSettings },
  db: { select: mockSelect },
}));

vi.mock("~/lib/api/sync", () => ({
  getSyncClient: () => ({
    enqueueChange: vi.fn(),
    writeTransaction: async (_db: unknown, fn: (t: unknown) => unknown) =>
      await fn(tx),
  }),
}));

vi.mock("~/lib/auth/session", () => ({
  currentMerchantId: () => "merchant-1",
}));

const { getPaymentSettings, upsertPaymentSettings } = await import(
  "../payment-settings"
);

const row = {
  createdAt: "2026-09-28T00:00:00.000Z",
  id: "ps-1",
  merchantId: "merchant-1",
  qrisDinamisEnabled: true,
  qrisStatisEnabled: true,
  qrisStaticPayload: "0002010102116304ABCD",
  updatedAt: "2026-09-28T00:00:00.000Z",
};

function selectQueue(rowsByCall: unknown[][]) {
  let callIndex = 0;
  mockSelect.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(() => {
          const rows = rowsByCall[callIndex] ?? [];
          callIndex += 1;
          return rows;
        }),
      }),
    }),
  }));
}

describe("payment-settings repo", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("getPaymentSettings returns the merchant row", async () => {
    selectQueue([[row]]);
    await expect(getPaymentSettings()).resolves.toEqual(row);
  });

  test("getPaymentSettings returns undefined when absent", async () => {
    selectQueue([[]]);
    await expect(getPaymentSettings()).resolves.toBeUndefined();
  });

  test("upsertPaymentSettings inserts on first write", async () => {
    selectQueue([[]]);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([row]),
      }),
    });

    const result = await upsertPaymentSettings({
      qrisStatisEnabled: true,
      qrisStaticPayload: "0002010102116304ABCD",
    });

    expect(result.id).toBe("ps-1");
    expect(mockUpdate).not.toHaveBeenCalled();
    const valuesArg = mockInsert.mock.calls[0]?.[0];
    expect(valuesArg?.values ?? valuesArg).toBeDefined();
  });

  test("upsertPaymentSettings updates provided fields only", async () => {
    selectQueue([
      [{ ...row, qrisStatisEnabled: false, qrisStaticPayload: null }],
    ]);

    const setArg = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([row]),
      }),
    });
    mockUpdate.mockReturnValue({ set: setArg });

    const result = await upsertPaymentSettings({ qrisStatisEnabled: true });

    expect(result.qrisStatisEnabled).toBe(true);
    expect(mockInsert).not.toHaveBeenCalled();

    const passedSet = setArg.mock.calls[0][0] as Record<string, unknown>;
    expect(passedSet.qrisStatisEnabled).toBe(true);
    expect(passedSet.qrisStaticPayload).toBeNull();
    expect(passedSet.qrisDinamisEnabled).toBe(true);
    expect(passedSet.isSynced).toBe(false);
  });
});
