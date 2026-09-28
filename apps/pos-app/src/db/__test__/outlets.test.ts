import { outlets } from "@sync-contract/local-synced-schema";
import { afterEach, describe, expect, test, vi } from "vitest";

const NO_OUTLET_RE = /no active outlet/;
const PHANTOM_UPDATE_RE = /phantom update/;
const TAX_PERCENT_RE = /taxPercentage/;

const mockSelect = vi.fn();
const updateCalls: unknown[][] = [];
const setPayloads: unknown[] = [];
let updateMatchedRows = 1;
const mockUpdate = vi.fn((...args: unknown[]) => {
  updateCalls.push(args);
  return {
    set: (values: unknown) => {
      setPayloads.push(values);
      return {
        where: () => ({
          returning: () =>
            Promise.resolve(
              Array.from({ length: updateMatchedRows }, () => ({
                id: "outlet-1",
              }))
            ),
        }),
      };
    },
  };
});

const tx = {
  select: mockSelect,
  update: mockUpdate,
};

vi.mock("~/db", () => ({
  TABLE: { outlets },
  db: { select: mockSelect },
}));

vi.mock("~/lib/api/sync", () => ({
  getSyncClient: () => ({
    enqueueChange: vi.fn(),
    writeTransaction: async (_db: unknown, fn: (t: unknown) => unknown) =>
      await fn(tx),
  }),
}));

let mockOutletId: string | null = "outlet-1";
let savedConfig: unknown = null;

vi.mock("~/lib/auth/session", () => ({
  get DEFAULT_CHARGE_CONFIG() {
    return {
      useTax: false,
      taxPercentage: 0,
      useServiceCharge: false,
      serviceChargePercentage: 0,
    };
  },
  currentOutletId: () => mockOutletId,
  setChargeConfig: (config: unknown) => {
    savedConfig = config;
  },
}));

const { hydrateChargeConfigFromDb, isValidPercent, saveChargeConfig } =
  await import("../outlets");

describe("isValidPercent", () => {
  test.each([
    [0, true],
    [11, true],
    [100, true],
    [-1, false],
    [101, false],
    [10.5, false],
    ["10", false],
  ])("%p -> %p", (value, expected) => {
    expect(isValidPercent(value)).toBe(expected);
  });
});

describe("saveChargeConfig", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockOutletId = "outlet-1";
    savedConfig = null;
    updateMatchedRows = 1;
  });

  test("rejects when no outlet is active", async () => {
    mockOutletId = null;
    await expect(
      saveChargeConfig({
        useTax: true,
        taxPercentage: 10,
        useServiceCharge: false,
        serviceChargePercentage: 0,
      })
    ).rejects.toThrow(NO_OUTLET_RE);
  });

  test("rejects out-of-range percentages", async () => {
    await expect(
      saveChargeConfig({
        useTax: true,
        taxPercentage: 101,
        useServiceCharge: false,
        serviceChargePercentage: 0,
      })
    ).rejects.toThrow(TAX_PERCENT_RE);
  });

  test("refuses to enqueue when the outlet row is missing locally", async () => {
    updateMatchedRows = 0;
    await expect(
      saveChargeConfig({
        useTax: true,
        taxPercentage: 11,
        useServiceCharge: false,
        serviceChargePercentage: 0,
      })
    ).rejects.toThrow(PHANTOM_UPDATE_RE);
    expect(savedConfig).toBeNull();
  });

  test("zeroes disabled charges before persisting", async () => {
    updateCalls.length = 0;
    setPayloads.length = 0;
    await saveChargeConfig({
      useTax: false,
      taxPercentage: 10, // ignored: useTax off
      useServiceCharge: true,
      serviceChargePercentage: 5,
    });

    expect(updateCalls[0]?.[0]).toBe(outlets);
    expect(setPayloads[0]).toMatchObject({
      useTax: false,
      taxPercentage: 0,
      useServiceCharge: true,
      serviceChargePercentage: 5,
    });
    expect(savedConfig).toEqual({
      useTax: false,
      taxPercentage: 0,
      useServiceCharge: true,
      serviceChargePercentage: 5,
    });
  });
});

describe("hydrateChargeConfigFromDb", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("loads the outlet row into the session config", async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            serviceChargePercentage: 5,
            taxPercentage: 11,
            useServiceCharge: true,
            useTax: true,
          },
        ]),
      }),
    });

    await hydrateChargeConfigFromDb();

    expect(savedConfig).toEqual({
      useTax: true,
      taxPercentage: 11,
      useServiceCharge: true,
      serviceChargePercentage: 5,
    });
  });

  test("keeps the cached config when the read fails", async () => {
    savedConfig = null;
    mockSelect.mockImplementation(() => {
      throw new Error("db down");
    });

    await expect(hydrateChargeConfigFromDb()).resolves.toBeUndefined();
    expect(savedConfig).toBeNull();
  });
});
