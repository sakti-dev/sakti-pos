import { describe, expect, it } from "vitest";
import { products } from "~/lib/data/catalog";
import {
  computeStockValue,
  countByStatus,
  groupMovementsByDay,
  stockStatus,
} from "../stats";
import { recordMovement, resetInventoryStore } from "../store";

describe("inventory stats", () => {
  it("stockStatus classifies out / low / available with default min 10", () => {
    expect(stockStatus(0)).toMatchObject({ status: "out" });
    expect(stockStatus(8)).toMatchObject({ status: "low" });
    expect(stockStatus(10)).toMatchObject({ status: "low" });
    expect(stockStatus(11)).toMatchObject({ status: "available" });
  });

  it("stockStatus honours a custom minStock", () => {
    expect(stockStatus(20, 20)).toMatchObject({ status: "low" });
    expect(stockStatus(21, 20)).toMatchObject({ status: "available" });
  });

  it("countByStatus tallies products from a stock map", () => {
    resetInventoryStore();
    const counts = countByStatus(); // uses currentStock per product
    const total = counts.out + counts.low + counts.available;
    expect(total).toBe(products.length);
    expect(counts.out).toBe(products.filter((p) => p.stock === 0).length);
  });

  it("computeStockValue sums stock * price", () => {
    resetInventoryStore();
    const expected = products.reduce((s, p) => s + p.stock * p.price, 0);
    expect(computeStockValue()).toBe(expected);
  });

  it("groupMovementsByDay buckets by local date, newest-first", () => {
    resetInventoryStore();
    recordMovement({
      productId: 1,
      type: "adjustment",
      delta: -1,
      reason: "rusak",
    });
    const groups = groupMovementsByDay();
    // first group is "today" (the adjustment), contains the adjustment last
    expect(groups[0].items.at(-1)?.type).toBe("adjustment");
    // groups are ordered newest-first
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].ts >= groups[i].ts).toBe(true);
    }
  });
});
