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
import { outletChargeConfig } from "~/lib/auth/session";
import { orderRepository } from "./order-repository";
import {
  type CartLine,
  type CompletedOrder,
  categoryLabel,
  computeTotals,
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

/** Subtotal/charges/total for the current cart. Recomputed per read;
 * charge rates come from the outlet's persisted configuration. */
export function totals(): OrderTotals {
  const config = outletChargeConfig();
  return computeTotals(cart, {
    taxPercent: config.useTax ? config.taxPercentage : 0,
    servicePercent: config.useServiceCharge
      ? config.serviceChargePercentage
      : 0,
  });
}

/* ── cart mutations ────────────────────────────────────────────── */

/** Add a product (or bump its qty if already in the cart). */
export function addToCart(product: Product, categoryName: string): void {
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
        category: categoryLabel(categoryName),
        imageAssetId: product.imageAssetId,
        qty: 1,
      });
    })
  );
}

/** Increment a line's quantity by product id. */
export function increment(productId: string): void {
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
export function decrement(productId: string): void {
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
export function removeLine(productId: string): void {
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
 * order (also kept in memory for the receipt). Caller is responsible for
 * confirming cash tendered covers the total for cash payments before
 * calling. Persists through the active repository — a rejected promise
 * means the sale did NOT complete.
 *
 * @throws if the cart is empty.
 */
export async function commit(): Promise<CompletedOrder> {
  if (cart.length === 0) {
    throw new Error("commit: cannot commit an empty sale");
  }
  const t = totals();
  const isCash = payment.method === "cash";
  const paid = isCash ? (payment.cashTendered ?? 0) : t.total;
  const order: CompletedOrder = {
    id: await orderRepository.nextOrderNumber(),
    lines: cart.map((l) => ({ ...l })),
    payment: { ...payment },
    subtotal: t.subtotal,
    tax: t.tax,
    taxRate: t.taxRate,
    serviceCharge: t.serviceCharge,
    serviceChargeRate: t.serviceChargeRate,
    total: t.total,
    paid,
    change: Math.max(0, paid - t.total),
    createdAt: Date.now(),
  };
  await orderRepository.commit(order);
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
