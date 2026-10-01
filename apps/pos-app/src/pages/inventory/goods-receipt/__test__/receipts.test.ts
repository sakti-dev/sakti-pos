import { describe, expect, it } from "vitest";
import {
  createBlankItem,
  displaySubtotal,
  onQtyChange,
  onSubtotalChange,
} from "../receipts";

const BLANK = createBlankItem("t1", "ingredient");

describe("terima helpers", () => {
  it("createBlankItem seeds qty 1 with target typing", () => {
    expect(BLANK).toMatchObject({
      costPrice: 0,
      qty: 1,
      targetId: "t1",
      targetType: "ingredient",
    });
  });

  it("displaySubtotal derives from costPrice × qty", () => {
    expect(displaySubtotal({ ...BLANK, costPrice: 2500, qty: 4 })).toBe(10_000);
  });

  it("editing subtotal re-derives costPrice per unit", () => {
    const next = onSubtotalChange({ ...BLANK, qty: 4 }, 10_000);
    expect(next.costPrice).toBe(2500);
    expect(next.sourceField).toBe("subtotal");
    expect(displaySubtotal(next)).toBe(10_000);
  });

  it("qty change keeps subtotal source fixed and re-derives costPrice", () => {
    const viaSubtotal = onSubtotalChange({ ...BLANK, qty: 4 }, 10_000);
    const next = onQtyChange(viaSubtotal, 5);
    expect(next.qty).toBe(5);
    expect(next.costPrice).toBe(2000);
  });
});
