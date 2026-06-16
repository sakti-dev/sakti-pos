import { createStore, produce } from "solid-js/store";
import { products } from "~/lib/data/catalog";
import type { Movement, MovementInput } from "./types";

/* ── ID generation (no uuid dep) ── */
let idCounter = 0;
const genId = () =>
  `mv_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

/** Default actor when a movement doesn't specify one. */
const DEFAULT_USER = "Andi";

/**
 * Seed the ledger with one `opening` movement per product so balances
 * reconcile from day 1. Seeded in the past so Riwayat shows them under a
 * "Saldo Awal" date, separate from today's live ops.
 */
function seedMovements(): Movement[] {
  // 2 days before "now", at 08:00 local, so it groups cleanly in history.
  const seedAt = Date.now() - 2 * 86_400_000;
  return products.map((p) => ({
    id: genId(),
    productId: p.id,
    type: "opening" as const,
    delta: p.stock,
    qtyBefore: 0,
    qtyAfter: p.stock,
    reason: undefined,
    note: "Saldo awal",
    user: "Sistem",
    createdAt: seedAt,
  }));
}

/* Module-scope singleton store. Shared across the whole app while the
   module is loaded (sufficient for in-memory demo). */
let [movements, setMovements] = createStore<Movement[]>(seedMovements());

/** TEST-ONLY: reset the singleton to seeded state. */
export function resetInventoryStore() {
  idCounter = 0;
  [movements, setMovements] = createStore<Movement[]>(seedMovements());
}

/** Read the whole ledger (newest-last / append order). Reactive. */
export function getMovements(): readonly Movement[] {
  return movements;
}

/** Current on-hand stock for a product = Σ delta. Reactive (reads store). */
export function currentStock(productId: number): number {
  let sum = 0;
  for (const m of movements) {
    if (m.productId === productId) {
      sum += m.delta;
    }
  }
  return sum;
}

function assertValid(input: MovementInput) {
  if (
    (input.type === "adjustment" || input.type === "stocktake") &&
    !input.reason
  ) {
    throw new Error(
      `recordMovement: reason is required for type "${input.type}"`
    );
  }
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    throw new Error("recordMovement: delta must be a non-zero finite number");
  }
}

function buildMovement(
  input: MovementInput,
  balanceOf: (pid: number) => number
): Movement {
  assertValid(input);
  const before = balanceOf(input.productId);
  const after = Math.max(0, before + input.delta); // clamp: no negative stock
  return {
    id: genId(),
    productId: input.productId,
    type: input.type,
    delta: after - before, // effective delta (equals input unless clamped)
    qtyBefore: before,
    qtyAfter: after,
    reason: input.reason,
    note: input.note,
    ref: input.ref,
    supplier: input.supplier,
    costPrice: input.costPrice,
    user: input.user ?? DEFAULT_USER,
    createdAt: Date.now(),
  };
}

/** Append a single movement. Returns the stored (immutable) entry. */
export function recordMovement(input: MovementInput): Movement {
  const m = buildMovement(input, currentStock);
  setMovements(produce((arr) => arr.push(m)));
  return m;
}

/**
 * Append many movements atomically. `qtyBefore` chains correctly even when
 * the same product appears multiple times. Use for opname + restock.
 */
export function recordMovements(inputs: readonly MovementInput[]): Movement[] {
  // Balance lookup that reads the local working array so a batch chains.
  const balanceOf = (pid: number) => {
    let sum = 0;
    for (const m of work) {
      if (m.productId === pid) {
        sum += m.delta;
      }
    }
    let base = 0;
    for (const m of movements) {
      if (m.productId === pid) {
        base += m.delta;
      }
    }
    return base + sum;
  };
  const work: Movement[] = [];
  for (const input of inputs) {
    work.push(buildMovement(input, balanceOf));
  }
  setMovements(produce((arr) => arr.push(...work)));
  return work;
}
