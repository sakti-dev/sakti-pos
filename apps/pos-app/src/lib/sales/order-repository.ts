/**
 * Order repository — the backend integration seam.
 *
 * The active binding persists committed orders to the local synced database
 * (`db/orders.ts` → `orders` + `order_items`); the in-memory implementation
 * remains for tests. Swap implementations via {@link setOrderRepository}.
 */

import type { CompletedOrder } from "./types";

export interface OrderRepository {
  /** Persist a committed order. Idempotent on `order.id`. */
  commit(order: CompletedOrder): void | Promise<void>;
  /** Fetch a single order by id, or undefined if unknown. */
  get(
    id: string
  ): CompletedOrder | undefined | Promise<CompletedOrder | undefined>;
  /** List all committed orders (oldest-first insertion order). */
  list(): readonly CompletedOrder[] | Promise<readonly CompletedOrder[]>;
  /** Next order number (`YYYY-MM-DD-NNN`, spec orders R4). */
  nextOrderNumber(): Promise<string>;
}

/** In-memory reference implementation (tests and dev fallback). */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, CompletedOrder>();
  private readonly seqByDate = new Map<string, number>();

  commit(order: CompletedOrder): void {
    this.orders.set(order.id, order);
  }

  nextOrderNumber(): Promise<string> {
    const date = new Date().toISOString().slice(0, 10);
    const next = (this.seqByDate.get(date) ?? 0) + 1;
    this.seqByDate.set(date, next);
    return Promise.resolve(`${date}-${String(next).padStart(3, "0")}`);
  }

  get(id: string): CompletedOrder | undefined {
    return this.orders.get(id);
  }

  list(): readonly CompletedOrder[] {
    return [...this.orders.values()];
  }
}

/**
 * Active repository. Methods forward to the current binding so callers can
 * import `orderRepository` once and still pick up a bootstrap-time swap.
 */
let active: OrderRepository = new InMemoryOrderRepository();

export const orderRepository: OrderRepository = {
  commit: (order) => active.commit(order),
  get: (id) => active.get(id),
  list: () => active.list(),
  nextOrderNumber: () => active.nextOrderNumber(),
};

/** Inject a different repository implementation (e.g. a Drizzle-backed one). */
export function setOrderRepository(repo: OrderRepository): void {
  active = repo;
}
