import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OrderRepository,
  orderRepository,
  setOrderRepository,
} from "../order-repository";
import {
  addToCart,
  clearCart,
  commit,
  decrement,
  getCart,
  getPayment,
  increment,
  lastCommittedOrder,
  removeLine,
  resetSaleSession,
  setPayment,
  totals,
} from "../sale-session";
import type { CompletedOrder, Product } from "../types";

let mockChargeConfig = {
  useTax: false,
  taxPercentage: 0,
  useServiceCharge: false,
  serviceChargePercentage: 0,
};

vi.mock("~/lib/auth/session", () => ({
  outletChargeConfig: () => mockChargeConfig,
}));

// Top-level regex avoids biome's useTopLevelRegex perf lint.
const ORDER_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{3}$/;
const EMPTY_SALE_RE = /empty sale/;

const product = (over: Partial<Product> = {}): Product => ({
  categoryId: "cat-1",
  id: "prod-1",
  imageAssetId: null,
  name: "Es Kopi Susu",
  price: 18_000,
  ...over,
});

// A fake repository so tests can assert the seam independently of the
// in-memory default and prove setOrderRepository wiring works.
let committed: CompletedOrder[] = [];
let fakeSeq = 0;
const fakeRepo: OrderRepository = {
  commit: (order) => {
    committed.push(order);
  },
  get: (id) => committed.find((o) => o.id === id),
  list: () => committed,
  nextOrderNumber: () => {
    fakeSeq += 1;
    return Promise.resolve(`2026-09-28-${String(fakeSeq).padStart(3, "0")}`);
  },
};

describe("sale session", () => {
  beforeEach(() => {
    mockChargeConfig = {
      useTax: false,
      taxPercentage: 0,
      useServiceCharge: false,
      serviceChargePercentage: 0,
    };
    resetSaleSession();
    committed = [];
    fakeSeq = 0;
    setOrderRepository(fakeRepo);
  });

  it("addToCart adds a new line and bumps an existing one", () => {
    addToCart(product(), "minuman");
    addToCart(product(), "minuman");
    expect(getCart()).toHaveLength(1);
    expect(getCart()[0].qty).toBe(2);
    expect(getCart()[0].price).toBe(18_000);
    expect(getCart()[0].category).toBe("Minuman");
  });

  it("increment / decrement / removeLine mutate the right line", () => {
    addToCart(product({ id: "prod-1" }), "minuman");
    addToCart(product({ id: "prod-2", name: "Cappuccino" }), "minuman");
    const line1 = getCart().find((l) => l.productId === "prod-1")!;
    const line2 = getCart().find((l) => l.productId === "prod-2")!;
    increment(line1.lineId);
    expect(getCart().find((l) => l.productId === "prod-1")?.qty).toBe(2);
    decrement(line1.lineId);
    expect(getCart().find((l) => l.productId === "prod-1")?.qty).toBe(1);
    removeLine(line2.lineId);
    expect(getCart().find((l) => l.productId === "prod-2")).toBeUndefined();
  });

  it("same product with different modifiers lands on separate lines", () => {
    const mods = (delta: number) => [
      {
        groupId: "g1",
        groupName: "Size",
        label: "Large",
        optionId: `opt-${delta}`,
        priceDelta: delta,
      },
    ];
    addToCart(product(), "minuman", mods(5000));
    addToCart(product(), "minuman", mods(5000));
    addToCart(product(), "minuman", mods(0));
    expect(getCart()).toHaveLength(2);
    expect(getCart().find((l) => l.price === 23_000)?.qty).toBe(2); // 18k base + 5k
    expect(getCart().find((l) => l.price === 18_000)?.qty).toBe(1);
  });

  it("decrement removes a line when it reaches zero", () => {
    addToCart(product(), "minuman");
    decrement(getCart()[0].lineId);
    expect(getCart()).toHaveLength(0);
  });

  it("totals add no charges when the outlet config is off", () => {
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    addToCart(product({ id: "prod-2", name: "X", price: 50_000 }), "minuman");
    const t = totals();
    expect(t.subtotal).toBe(150_000);
    expect(t.tax).toBe(0);
    expect(t.serviceCharge).toBe(0);
    expect(t.total).toBe(150_000);
  });

  it("totals apply configured tax and service charge on the subtotal", () => {
    mockChargeConfig = {
      useTax: true,
      taxPercentage: 10,
      useServiceCharge: true,
      serviceChargePercentage: 5,
    };
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    addToCart(product({ id: "prod-2", name: "X", price: 50_000 }), "minuman");
    const t = totals();
    expect(t.subtotal).toBe(150_000);
    expect(t.serviceCharge).toBe(7500); // 5% of subtotal
    expect(t.tax).toBe(15_000); // 10% of subtotal, not compounding
    expect(t.total).toBe(172_500);
    expect(t.taxRate).toBe(0.1);
    expect(t.serviceChargeRate).toBe(0.05);
  });

  it("totals round per charge and disable zeroes the rate", () => {
    mockChargeConfig = {
      useTax: true,
      taxPercentage: 11,
      useServiceCharge: false,
      serviceChargePercentage: 5, // ignored while disabled
    };
    addToCart(product({ id: "prod-1", price: 99_999 }), "minuman");
    const t = totals();
    expect(t.tax).toBe(11_000); // Math.round(99999 * 0.11)
    expect(t.serviceCharge).toBe(0);
    expect(t.total).toBe(110_999);
  });

  it("commit persists through the repository, clears the cart, and stashes lastOrder", async () => {
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    setPayment({ method: "cash", cashTendered: 250_000 });

    const order = await commit();

    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].qty).toBe(2);
    expect(order.total).toBe(200_000); // no charges configured
    expect(order.paid).toBe(250_000);
    expect(order.change).toBe(50_000); // 250k - 200k, no charges
    expect(order.id).toMatch(ORDER_ID_RE);
    expect(getCart()).toHaveLength(0); // cleared
    expect(getPayment().method).toBe("cash"); // reset to default
    expect(committed).toContain(order); // went through the seam
    expect(lastCommittedOrder()).toBe(order); // available for the receipt
  });

  it("commit for a QRIS Statis method pays exactly the total", async () => {
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    setPayment({ method: "qris_static" });
    const order = await commit();
    expect(order.paid).toBe(order.total);
    expect(order.change).toBe(0);
    expect(order.payment.method).toBe("qris_static");
  });

  it("commit for a QRIS Dinamis method pays exactly the total", async () => {
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    setPayment({ method: "qris_dynamic" });
    const order = await commit();
    expect(order.paid).toBe(order.total);
    expect(order.change).toBe(0);
    expect(order.payment.method).toBe("qris_dynamic");
  });

  it("commit throws on an empty cart", async () => {
    await expect(commit()).rejects.toThrow(EMPTY_SALE_RE);
  });

  it("canConfirm-equivalent guard: cash must cover the total", async () => {
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    setPayment({ method: "cash", cashTendered: 50_000 });
    const order = await commit(); // caller guards before commit; commit trusts
    expect(order.paid).toBe(50_000);
    expect(order.change).toBe(0); // clamped, never negative
  });

  it("clearCart resets both cart and payment", () => {
    addToCart(product(), "minuman");
    setPayment({ method: "qris_dynamic", customerName: "Budi" });
    clearCart();
    expect(getCart()).toHaveLength(0);
    expect(getPayment().customerName).toBeUndefined();
    expect(getPayment().method).toBe("cash");
  });

  it("orderRepository.get retrieves a committed order by id", async () => {
    addToCart(product(), "minuman");
    setPayment({ method: "cash", cashTendered: 20_000 });
    const order = await commit();
    expect((await orderRepository.get(order.id))?.id).toBe(order.id);
    expect(await orderRepository.get("nope")).toBeUndefined();
  });
});
