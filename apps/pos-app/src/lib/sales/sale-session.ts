/**
 * Sale session — the live, in-progress sale.
 *
 * Module-scope reactive singleton (matches the convention in
 * `pages/inventory/components/lib/store.ts`). The cart naturally survives
 * navigation across the sale loop (cash-register → payment → receipt),
 * which is exactly the gap this module closes.
 *
 * Ephemeral by design: even with a backend, the in-progress cart lives in
 * memory until {@link commit} persists a {@link CompletedOrder} through the
 * {@link OrderRepository} seam.
 */

import { createStore, produce, reconcile } from "solid-js/store";
import { orderRepository } from "./order-repository";
import {
  type CartLine,
  type CompletedOrder,
  categoryLabel,
  computeTotals,
  generateOrderId,
  type OrderTotals,
  type PayMethod,
  type PaymentDetails,
  type Product,
} from "./types";

const DEFAULT_PAYMENT: PaymentDetails = { method: "cash" };

const [cart, setCart] = createStore<CartLine[]>([]);
const [payment, setPaymentState] = createStore<PaymentDetails>({
  ...DEFAULT_PAYMENT,
});
let lastOrder: CompletedOrder | undefined;

/* ── reads ─────────────────────────────────────────────────────── */

/** Current cart lines. Reactive. */
export function getCart(): readonly CartLine[] {
  return cart;
}

/** Current payment details. Reactive. */
export function getPayment(): PaymentDetails {
  return payment;
}

/** The most recently committed order (for the receipt after a commit). */
export function lastCommittedOrder(): CompletedOrder | undefined {
  return lastOrder;
}

/** Subtotal/tax/total for the current cart. Recomputed per read. */
export function totals(): OrderTotals {
  return computeTotals(cart);
}

/* ── cart mutations ────────────────────────────────────────────── */

/** Add a product (or bump its qty if already in the cart). */
export function addToCart(product: Product): void {
  setCart(
    produce((lines) => {
      const existing = lines.find((l) => l.productId === product.id);
      if (existing) {
        existing.qty += 1;
        return;
      }
      lines.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        category: categoryLabel(product.cat),
        img: product.img,
        qty: 1,
      });
    })
  );
}

/** Increment a line's quantity by product id. */
export function increment(productId: number): void {
  setCart(
    produce((lines) => {
      const line = lines.find((l) => l.productId === productId);
      if (line) {
        line.qty += 1;
      }
    })
  );
}

/** Decrement a line's quantity, removing it when it hits zero. */
export function decrement(productId: number): void {
  setCart(
    produce((lines) => {
      const i = lines.findIndex((l) => l.productId === productId);
      if (i === -1) {
        return;
      }
      if (lines[i].qty <= 1) {
        lines.splice(i, 1);
        return;
      }
      lines[i].qty -= 1;
    })
  );
}

/** Remove a line outright. */
export function removeLine(productId: number): void {
  setCart(
    produce((lines) => {
      const i = lines.findIndex((l) => l.productId === productId);
      if (i !== -1) {
        lines.splice(i, 1);
      }
    })
  );
}

/* ── payment mutations ─────────────────────────────────────────── */

/** Merge a patch into the current payment details. */
export function setPayment(patch: Partial<PaymentDetails>): void {
  setPaymentState(patch);
}

/** Switch the active payment method. */
export function setMethod(method: PayMethod): void {
  setPaymentState({ method });
}

/* ── lifecycle ─────────────────────────────────────────────────── */

/** Clear the cart and reset payment details (start a fresh sale). */
export function clearCart(): void {
  setCart([]);
  setPaymentState(reconcile({ ...DEFAULT_PAYMENT }));
}

/**
 * Validate, persist, and clear the current sale. Returns the committed
 * order. Caller is responsible for confirming cash tendered covers the
 * total for cash payments before calling.
 *
 * @throws if the cart is empty.
 */
export function commit(): CompletedOrder {
  if (cart.length === 0) {
    throw new Error("commit: cannot commit an empty sale");
  }
  const t = computeTotals(cart);
  const isCash = payment.method === "cash";
  const paid = isCash ? (payment.cashTendered ?? 0) : t.total;
  const order: CompletedOrder = {
    id: generateOrderId(),
    lines: cart.map((l) => ({ ...l })),
    payment: { ...payment },
    subtotal: t.subtotal,
    tax: t.tax,
    taxRate: t.taxRate,
    total: t.total,
    paid,
    change: Math.max(0, paid - t.total),
    createdAt: Date.now(),
  };
  orderRepository.commit(order);
  lastOrder = order;
  clearCart();
  return order;
}

/* ── test-only ─────────────────────────────────────────────────── */

/** TEST-ONLY: reset the singleton to a pristine empty sale. */
export function resetSaleSession(): void {
  setCart([]);
  setPaymentState(reconcile({ ...DEFAULT_PAYMENT }));
  lastOrder = undefined;
}
