import { describe, expect, it } from "vitest";
import {
  recordMovements,
  resetInventoryStore,
} from "../../../components/lib/store";
import {
  listStocktakes,
  nextStocktakeNumber,
  stocktakeRef,
  varianceRows,
} from "../utils";

describe("stocktake helpers", () => {
  it("nextStocktakeNumber is 1 with no prior stocktakes", () => {
    resetInventoryStore();
    expect(nextStocktakeNumber()).toBe(1);
  });

  it("stocktakeRef pads to 3 digits", () => {
    expect(stocktakeRef(1)).toBe("OPN-001");
    expect(stocktakeRef(42)).toBe("OPN-042");
  });

  it("lists stocktakes grouped by ref with net delta", () => {
    resetInventoryStore();
    recordMovements([
      {
        productId: 1,
        type: "stocktake",
        delta: -5,
        reason: "lainnya",
        ref: "OPN-001",
      },
      {
        productId: 2,
        type: "stocktake",
        delta: -3,
        reason: "lainnya",
        ref: "OPN-001",
      },
      {
        productId: 1,
        type: "stocktake",
        delta: 2,
        reason: "lainnya",
        ref: "OPN-002",
      },
    ]);
    const list = listStocktakes();
    expect(list).toHaveLength(2);
    // newest-first
    expect(list[0].ref).toBe("OPN-002");
    expect(list[0].netDelta).toBe(2);
    expect(list[1].ref).toBe("OPN-001");
    expect(list[1].netDelta).toBe(-8);
    expect(list[1].itemCount).toBe(2);
  });

  it("varianceRows maps counted qty to {product, system, counted, diff}", () => {
    resetInventoryStore();
    const rows = varianceRows([
      { productId: 1, counted: 75 },
      { productId: 2, counted: 60 },
    ]);
    // product 1 system stock = 80 (seed), 2 = 60
    expect(rows[0]).toMatchObject({
      productId: 1,
      system: 80,
      counted: 75,
      diff: -5,
    });
    expect(rows[1]).toMatchObject({
      productId: 2,
      system: 60,
      counted: 60,
      diff: 0,
    });
  });
});
