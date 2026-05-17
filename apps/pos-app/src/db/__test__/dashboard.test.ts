import { describe, expect, test, vi } from "vitest";

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
  or: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((a: unknown, b: unknown) => ({ a, b, op: "lt" })),
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

vi.mock("drizzle-orm/sqlite-proxy", () => ({
  drizzle: vi.fn(),
}));

const mockDbSelect = vi.fn();
vi.mock("../index", () => ({
  db: {
    select: mockDbSelect,
  },
}));

describe("getDashboardSummary", () => {
  test("returns zero summary when db returns no rows", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    } as never);

    const { getDashboardSummary } = await import("../dashboard");
    const result = await getDashboardSummary("2026-05-01", "2026-05-04");
    expect(result).toEqual({
      orderCount: 0,
      totalRevenue: 0,
      avgOrderValue: 0,
    });
  });
});

describe("getPaymentBreakdown", () => {
  test("returns zero breakdown when db returns no rows", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    } as never);

    const { getPaymentBreakdown } = await import("../dashboard");
    const result = await getPaymentBreakdown("2026-05-01", "2026-05-04");
    expect(result).toEqual({
      cashCount: 0,
      cashTotal: 0,
      qrisCount: 0,
      qrisTotal: 0,
    });
  });
});

describe("getHourlyBreakdown", () => {
  test("returns 24-hour array with all zeros when no data", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => []),
        })),
      })),
    } as never);

    const { getHourlyBreakdown } = await import("../dashboard");
    const result = await getHourlyBreakdown("2026-05-01", "2026-05-04");
    expect(result).toHaveLength(24);
    expect(result[0]).toEqual({ hour: 0, revenue: 0 });
    expect(result[23]).toEqual({ hour: 23, revenue: 0 });
  });
});

describe("getTopProducts", () => {
  test("calls query chain with innerJoin and groupBy", async () => {
    const mockOrderBy = vi.fn(() => ({
      limit: vi.fn(() => []),
    }));
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(() => ({
              orderBy: mockOrderBy,
            })),
          })),
        })),
      })),
    } as never);

    const { getTopProducts } = await import("../dashboard");
    await getTopProducts("2026-05-01", "2026-05-04");
    expect(mockOrderBy).toHaveBeenCalled();
  });

  test("passes custom limit to query", async () => {
    const mockLimit = vi.fn(() => []);
    const mockOrderBy = vi.fn(() => ({
      limit: mockLimit,
    }));
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            groupBy: vi.fn(() => ({
              orderBy: mockOrderBy,
            })),
          })),
        })),
      })),
    } as never);

    const { getTopProducts } = await import("../dashboard");
    await getTopProducts("2026-05-01", "2026-05-04", 5);
    expect(mockLimit).toHaveBeenCalledWith(5);
  });
});

describe("getSalesByCategory", () => {
  test("calls query chain with triple innerJoin", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                groupBy: vi.fn(() => ({
                  orderBy: vi.fn(() => []),
                })),
              })),
            })),
          })),
        })),
      })),
    } as never);

    const { getSalesByCategory } = await import("../dashboard");
    await getSalesByCategory("2026-05-01", "2026-05-04");
  });
});

describe("getDailyBreakdown", () => {
  test("returns daily revenue grouped by date", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => []),
        })),
      })),
    } as never);

    const { getDailyBreakdown } = await import("../dashboard");
    const result = await getDailyBreakdown("2026-05-01", "2026-05-07");
    expect(result).toEqual([]);
  });
});

describe("getWeeklyBreakdown", () => {
  test("returns weekly revenue grouped by week", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => []),
        })),
      })),
    } as never);

    const { getWeeklyBreakdown } = await import("../dashboard");
    const result = await getWeeklyBreakdown("2026-05-01", "2026-05-31");
    expect(result).toEqual([]);
  });
});

describe("getMonthlyBreakdown", () => {
  test("returns monthly revenue grouped by month", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => []),
        })),
      })),
    } as never);

    const { getMonthlyBreakdown } = await import("../dashboard");
    const result = await getMonthlyBreakdown("2026-01-01", "2026-12-31");
    expect(result).toEqual([]);
  });
});
