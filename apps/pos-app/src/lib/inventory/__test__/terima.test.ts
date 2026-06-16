import { describe, expect, it } from "vitest";
import { recordMovements, resetInventoryStore } from "../store";
import { listReceipts, nextReceiptNumber, receiptRef } from "../terima";

describe("terima helpers", () => {
  it("receiptRef pads to 4 digits", () => {
    expect(receiptRef(1)).toBe("TRX-0001");
    expect(receiptRef(42)).toBe("TRX-0042");
  });

  it("nextReceiptNumber is 1 with no prior receipts", () => {
    resetInventoryStore();
    expect(nextReceiptNumber()).toBe(1);
  });

  it("nextReceiptNumber follows existing", () => {
    resetInventoryStore();
    recordMovements([
      { productId: 1, type: "restock", delta: 5, ref: "TRX-0001" },
      { productId: 2, type: "restock", delta: 3, ref: "TRX-0002" },
    ]);
    expect(nextReceiptNumber()).toBe(3);
  });

  it("listReceipts groups by ref, newest-first, with totals", () => {
    resetInventoryStore();
    recordMovements([
      {
        productId: 1,
        type: "restock",
        delta: 50,
        ref: "TRX-0001",
        costPrice: 18_000,
      },
      {
        productId: 2,
        type: "restock",
        delta: 30,
        ref: "TRX-0001",
        costPrice: 12_000,
      },
      {
        productId: 1,
        type: "restock",
        delta: 10,
        ref: "TRX-0002",
        costPrice: 18_000,
      },
    ]);
    const list = listReceipts();
    expect(list[0].ref).toBe("TRX-0002");
    expect(list[1].ref).toBe("TRX-0001");
    expect(list[1].itemCount).toBe(2);
    expect(list[1].totalQty).toBe(80);
    expect(list[1].totalCost).toBe(50 * 18_000 + 30 * 12_000);
  });
});
