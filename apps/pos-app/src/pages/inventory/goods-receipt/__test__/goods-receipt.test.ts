import { describe, expect, it } from "vitest";
import {
  createBlankItem,
  displaySubtotal,
  onCostPriceChange,
  onQtyChange,
  onSubtotalChange,
  type SyncableItem,
} from "../receipts";

const blank = (id = 1): SyncableItem => createBlankItem(id);

describe("item-sync", () => {
  describe("displaySubtotal", () => {
    it("returns qty × costPrice when sourceField is costPrice", () => {
      const item: SyncableItem = {
        ...blank(),
        costPrice: 8000,
        qty: 20,
        sourceField: "costPrice",
        subtotalValue: 0,
      };
      expect(displaySubtotal(item)).toBe(160_000);
    });

    it("returns subtotalValue when sourceField is subtotal", () => {
      const item: SyncableItem = {
        ...blank(),
        costPrice: 10_000,
        qty: 20,
        sourceField: "subtotal",
        subtotalValue: 200_000,
      };
      expect(displaySubtotal(item)).toBe(200_000);
    });

    it("returns 0 when everything is zero", () => {
      expect(displaySubtotal(blank())).toBe(0);
    });
  });

  describe("onSubtotalChange (user types subtotal)", () => {
    it("derives costPrice from subtotal / qty", () => {
      const item: SyncableItem = { ...blank(), qty: 20 };
      const result = onSubtotalChange(item, 200_000);
      expect(result.sourceField).toBe("subtotal");
      expect(result.subtotalValue).toBe(200_000);
      expect(result.costPrice).toBe(10_000);
      expect(displaySubtotal(result)).toBe(200_000);
    });

    it("handles rounding (odd division)", () => {
      const item: SyncableItem = { ...blank(), qty: 3 };
      const result = onSubtotalChange(item, 100_000);
      expect(result.costPrice).toBe(33_333);
      expect(result.subtotalValue).toBe(100_000);
    });

    it("does nothing when qty is 0", () => {
      const item: SyncableItem = { ...blank(), qty: 0 };
      const result = onSubtotalChange(item, 50_000);
      expect(result).toBe(item);
    });

    it("overrides previous costPrice source", () => {
      const item: SyncableItem = {
        ...blank(),
        costPrice: 8000,
        qty: 20,
        sourceField: "costPrice",
        subtotalValue: 0,
      };
      const result = onSubtotalChange(item, 200_000);
      expect(result.sourceField).toBe("subtotal");
      expect(result.costPrice).toBe(10_000);
    });
  });

  describe("onCostPriceChange (user types harga beli)", () => {
    it("sets costPrice and clears subtotal source", () => {
      const item: SyncableItem = {
        ...blank(),
        costPrice: 10_000,
        qty: 20,
        sourceField: "subtotal",
        subtotalValue: 200_000,
      };
      const result = onCostPriceChange(item, 8000);
      expect(result.costPrice).toBe(8000);
      expect(result.sourceField).toBe("costPrice");
      expect(result.subtotalValue).toBe(0);
      expect(displaySubtotal(result)).toBe(160_000); // 20 × 8000
    });

    it("works from blank state", () => {
      const result = onCostPriceChange(blank(), 5000);
      expect(result.costPrice).toBe(5000);
      expect(result.sourceField).toBe("costPrice");
      expect(displaySubtotal(result)).toBe(5000); // 1 × 5000
    });
  });

  describe("onQtyChange (user changes qty)", () => {
    it("when subtotal source: recalculates costPrice, keeps subtotalValue", () => {
      const item: SyncableItem = {
        ...blank(),
        qty: 10,
        costPrice: 20_000,
        sourceField: "subtotal",
        subtotalValue: 200_000,
      };
      const result = onQtyChange(item, 20);
      expect(result.qty).toBe(20);
      expect(result.costPrice).toBe(10_000); // 200000 / 20
      expect(result.sourceField).toBe("subtotal");
      expect(result.subtotalValue).toBe(200_000);
      expect(displaySubtotal(result)).toBe(200_000); // subtotal unchanged!
    });

    it("when subtotal source with rounding", () => {
      const item: SyncableItem = {
        ...blank(),
        qty: 1,
        costPrice: 100_000,
        sourceField: "subtotal",
        subtotalValue: 100_000,
      };
      const result = onQtyChange(item, 3);
      expect(result.costPrice).toBe(33_333); // 100000 / 3
      expect(result.subtotalValue).toBe(100_000);
    });

    it("when costPrice source: just updates qty, subtotal recalculates naturally", () => {
      const item: SyncableItem = {
        ...blank(),
        qty: 10,
        costPrice: 8000,
        sourceField: "costPrice",
        subtotalValue: 0,
      };
      const result = onQtyChange(item, 20);
      expect(result.qty).toBe(20);
      expect(result.costPrice).toBe(8000); // unchanged
      expect(result.sourceField).toBe("costPrice");
      expect(displaySubtotal(result)).toBe(160_000); // 20 × 8000
    });
  });

  describe("end-to-end flows", () => {
    it("flow: type subtotal 200k → change qty 20 → edit harga beli 8000 → subtotal becomes 160k", () => {
      let item = blank();
      // Step 1: type subtotal 200000 (qty=1 → costPrice=200000)
      item = onSubtotalChange(item, 200_000);
      expect(item.costPrice).toBe(200_000);
      expect(displaySubtotal(item)).toBe(200_000);

      // Step 2: change qty to 20 → costPrice recalcs to 10000, subtotal stays 200000
      item = onQtyChange(item, 20);
      expect(item.costPrice).toBe(10_000);
      expect(item.qty).toBe(20);
      expect(displaySubtotal(item)).toBe(200_000);

      // Step 3: edit harga beli to 8000 → subtotal now = 20 × 8000 = 160000
      item = onCostPriceChange(item, 8000);
      expect(item.costPrice).toBe(8000);
      expect(displaySubtotal(item)).toBe(160_000);
    });

    it("flow: type harga beli 8000 → change qty 20 → type subtotal 200k → harga beli becomes 10000", () => {
      let item = blank();
      // Step 1: type harga beli 8000
      item = onCostPriceChange(item, 8000);
      expect(item.costPrice).toBe(8000);
      expect(displaySubtotal(item)).toBe(8000); // 1 × 8000

      // Step 2: change qty to 20 → subtotal = 160000
      item = onQtyChange(item, 20);
      expect(displaySubtotal(item)).toBe(160_000); // 20 × 8000

      // Step 3: type subtotal 200000 → costPrice = 10000
      item = onSubtotalChange(item, 200_000);
      expect(item.costPrice).toBe(10_000);
      expect(displaySubtotal(item)).toBe(200_000);

      // Step 4: change qty to 25 → costPrice = 8000, subtotal stays 200000
      item = onQtyChange(item, 25);
      expect(item.costPrice).toBe(8000); // 200000 / 25
      expect(displaySubtotal(item)).toBe(200_000);
    });

    it("flow: type subtotal with odd numbers → qty change → rounding is consistent", () => {
      let item = blank();
      item = onSubtotalChange(item, 100_000);
      item = onQtyChange(item, 7);
      expect(item.costPrice).toBe(14_286); // 100000 / 7 = 14285.71 → 14286
      expect(item.subtotalValue).toBe(100_000);
      expect(displaySubtotal(item)).toBe(100_000);
    });
  });
});
