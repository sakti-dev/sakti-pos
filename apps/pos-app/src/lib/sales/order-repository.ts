/**
 * Order repository — the backend integration seam.
 *
 * This is the ONLY module that changes when persistence lands. Today an
 * in-memory map; tomorrow a Drizzle/SQLite (Tauri) implementation that
 * honors the AGENTS.md `MinorUnits` money convention. The {@link OrderRepository}
 * interface is the stable contract the rest of the app depends on.
 *
 * Swap implementations at app bootstrap via {@link setOrderRepository}.
 */

import type { CompletedOrder } from "./types";

export interface OrderRepository {
  /** Persist a committed order. Idempotent on `order.id`. */
  commit(order: CompletedOrder): void;
  /** Fetch a single order by id, or undefined if unknown. */
  get(id: string): CompletedOrder | undefined;
  /** List all committed orders (oldest-first insertion order). */
  list(): readonly CompletedOrder[];
}

/** In-memory reference implementation (the current MVP backing store). */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, CompletedOrder>();

  commit(order: CompletedOrder): void {
    this.orders.set(order.id, order);
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
};

/** Inject a different repository implementation (e.g. a Drizzle-backed one). */
export function setOrderRepository(repo: OrderRepository): void {
  active = repo;
}
