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
const ORDER_ID_RE = /^TX-\d{8}-\d{3}$/;
const EMPTY_SALE_RE = /empty sale/;

const product = (over: Partial<Product> = {}): Product => ({
  cat: "minuman",
  id: 1,
  img: 1,
  name: "Es Kopi Susu",
  price: 18_000,
  ...over,
});

// A fake repository so tests can assert the seam independently of the
// in-memory default and prove setOrderRepository wiring works.
let committed: CompletedOrder[] = [];
const fakeRepo: OrderRepository = {
  commit: (order) => {
    committed.push(order);
  },
  get: (id) => committed.find((o) => o.id === id),
  list: () => committed,
};

describe("sale session", () => {
  beforeEach(() => {
    resetSaleSession();
    committed = [];
    setOrderRepository(fakeRepo);
  });

  it("addToCart adds a new line and bumps an existing one", () => {
    addToCart(product());
    addToCart(product());
    expect(getCart()).toHaveLength(1);
    expect(getCart()[0].qty).toBe(2);
    expect(getCart()[0].price).toBe(18_000);
    expect(getCart()[0].category).toBe("Minuman");
  });

  it("increment / decrement / removeLine mutate the right line", () => {
    addToCart(product({ id: 1 }));
    addToCart(product({ id: 2, name: "Cappuccino" }));
    increment(1);
    expect(getCart().find((l) => l.productId === 1)?.qty).toBe(2);
    decrement(1);
    expect(getCart().find((l) => l.productId === 1)?.qty).toBe(1);
    removeLine(2);
    expect(getCart().find((l) => l.productId === 2)).toBeUndefined();
  });

  it("decrement removes a line when it reaches zero", () => {
    addToCart(product());
    decrement(1);
    expect(getCart()).toHaveLength(0);
  });

  it("totals compute subtotal, 11% tax, and total", () => {
    addToCart(product({ id: 1, price: 100_000 }));
    addToCart(product({ id: 2, name: "X", price: 50_000 }));
    const t = totals();
    expect(t.subtotal).toBe(150_000);
    expect(t.tax).toBe(16_500);
    expect(t.total).toBe(166_500);
    expect(t.taxRate).toBe(0.11);
  });

  it("commit persists through the repository, clears the cart, and stashes lastOrder", () => {
    addToCart(product({ id: 1, price: 100_000 }));
    addToCart(product({ id: 1, price: 100_000 }));
    setPayment({ method: "cash", cashTendered: 250_000 });

    const order = commit();

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

  it("commit for a non-cash method pays exactly the total", () => {
    addToCart(product({ id: 1, price: 100_000 }));
    setPayment({ method: "qris" });
    const order = commit();
    expect(order.paid).toBe(order.total);
    expect(order.change).toBe(0);
  });

  it("commit throws on an empty cart", () => {
    expect(() => commit()).toThrow(EMPTY_SALE_RE);
  });

  it("canConfirm-equivalent guard: cash must cover the total", () => {
    addToCart(product({ id: 1, price: 100_000 }));
    setPayment({ method: "cash", cashTendered: 50_000 });
    const order = commit(); // caller guards before commit; commit trusts
    expect(order.paid).toBe(50_000);
    expect(order.change).toBe(0); // clamped, never negative
  });

  it("clearCart resets both cart and payment", () => {
    addToCart(product());
    setPayment({ method: "card", customerName: "Budi" });
    clearCart();
    expect(getCart()).toHaveLength(0);
    expect(getPayment().customerName).toBeUndefined();
    expect(getPayment().method).toBe("cash");
  });

  it("orderRepository.get retrieves a committed order by id", () => {
    addToCart(product());
    setPayment({ method: "cash", cashTendered: 20_000 });
    const order = commit();
    expect(orderRepository.get(order.id)?.id).toBe(order.id);
    expect(orderRepository.get("nope")).toBeUndefined();
  });
});
