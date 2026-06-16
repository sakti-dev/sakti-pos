import { describe, expect, it } from "vitest";
import { products } from "~/lib/data/catalog";
import {
  currentStock,
  getMovements,
  recordMovement,
  recordMovements,
  resetInventoryStore,
} from "../store";

// Top-level regex avoids biome's useTopLevelRegex perf lint.
const REASON_REQUIRED_RE = /reason/i;

describe("inventory store", () => {
  it("seeds an opening movement per product so balances reconcile", () => {
    resetInventoryStore();
    expect(getMovements().filter((m) => m.type === "opening")).toHaveLength(
      products.length
    );
  });

  it("currentStock equals the product's seeded stock at start", () => {
    resetInventoryStore();
    for (const p of products) {
      expect(currentStock(p.id)).toBe(p.stock);
    }
  });

  it("recordMovement appends and shifts the balance", () => {
    resetInventoryStore();
    const before = currentStock(1); // Es Kopi Susu = 80
    const m = recordMovement({
      productId: 1,
      type: "adjustment",
      delta: -5,
      reason: "rusak",
    });
    expect(m.qtyBefore).toBe(before);
    expect(m.qtyAfter).toBe(before - 5);
    expect(m.delta).toBe(-5);
    expect(currentStock(1)).toBe(before - 5);
  });

  it("clamps negative stock to 0 and records the effective delta", () => {
    resetInventoryStore();
    // product 24 (Latte Art Special) starts at 5
    const m = recordMovement({
      productId: 24,
      type: "adjustment",
      delta: -20,
      reason: "hilang",
    });
    expect(m.qtyAfter).toBe(0);
    expect(m.delta).toBe(-5); // effective, not -20
    expect(currentStock(24)).toBe(0);
  });

  it("requires a reason for adjustment", () => {
    resetInventoryStore();
    expect(() =>
      recordMovement({ productId: 1, type: "adjustment", delta: -1 })
    ).toThrow(REASON_REQUIRED_RE);
  });

  it("records user + createdAt + unique id", () => {
    resetInventoryStore();
    const a = recordMovement({
      productId: 1,
      type: "restock",
      delta: 10,
      user: "Budi",
    });
    const b = recordMovement({
      productId: 2,
      type: "restock",
      delta: 10,
    });
    expect(a.user).toBe("Budi");
    expect(a.createdAt).toBeTypeOf("number");
    expect(a.id).not.toBe(b.id);
  });

  it("recordMovements chains qtyBefore across a batch (opname)", () => {
    resetInventoryStore();
    const start1 = currentStock(1);
    const start2 = currentStock(2);
    const ms = recordMovements([
      { productId: 1, type: "stocktake", delta: -5, reason: "lainnya" },
      { productId: 2, type: "stocktake", delta: -3, reason: "lainnya" },
      { productId: 1, type: "stocktake", delta: -2, reason: "lainnya" },
    ]);
    expect(ms).toHaveLength(3);
    expect(ms[0].qtyBefore).toBe(start1);
    expect(ms[0].qtyAfter).toBe(start1 - 5);
    // third entry is product 1 again, must chain off the new balance
    expect(ms[2].qtyBefore).toBe(start1 - 5);
    expect(ms[2].qtyAfter).toBe(start1 - 5 - 2);
    expect(currentStock(2)).toBe(start2 - 3);
  });

  it("getMovements returns newest-last (append order)", () => {
    resetInventoryStore();
    recordMovement({
      productId: 1,
      type: "adjustment",
      delta: -1,
      reason: "rusak",
    });
    const all = getMovements();
    expect(all.at(-1)?.type).toBe("adjustment");
  });
});
