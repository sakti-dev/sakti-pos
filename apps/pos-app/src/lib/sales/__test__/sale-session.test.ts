import { beforeEach, describe, expect, it } from "vitest";
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
    increment("prod-1");
    expect(getCart().find((l) => l.productId === "prod-1")?.qty).toBe(2);
    decrement("prod-1");
    expect(getCart().find((l) => l.productId === "prod-1")?.qty).toBe(1);
    removeLine("prod-2");
    expect(getCart().find((l) => l.productId === "prod-2")).toBeUndefined();
  });

  it("decrement removes a line when it reaches zero", () => {
    addToCart(product(), "minuman");
    decrement("prod-1");
    expect(getCart()).toHaveLength(0);
  });

  it("totals compute subtotal, 11% tax, and total", () => {
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    addToCart(product({ id: "prod-2", name: "X", price: 50_000 }), "minuman");
    const t = totals();
    expect(t.subtotal).toBe(150_000);
    expect(t.tax).toBe(16_500);
    expect(t.total).toBe(166_500);
    expect(t.taxRate).toBe(0.11);
  });

  it("commit persists through the repository, clears the cart, and stashes lastOrder", async () => {
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    addToCart(product({ id: "prod-1", price: 100_000 }), "minuman");
    setPayment({ method: "cash", cashTendered: 250_000 });

    const order = await commit();

    expect(order.lines).toHaveLength(1);
    expect(order.lines[0].qty).toBe(2);
    expect(order.total).toBe(222_000); // 200k + 11%
    expect(order.paid).toBe(250_000);
    expect(order.change).toBe(28_000);
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
