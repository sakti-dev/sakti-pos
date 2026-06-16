# Inventory & Stock Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Inventory page from a single mutable stock counter into a proper stock-management system built on an immutable **movement ledger**, with four operation surfaces: a live dashboard (with auditable inline adjustments), Stock Opname (stock take), Penerimaan Barang (restock), and Riwayat (audit history).

**Architecture:** Stock is no longer a mutable `number`. It is the **derived balance** of an append-only list of signed movements (`opening · adjustment · restock · stocktake · sale`), each recording `{ delta, qtyBefore, qtyAfter, reason, ref, user, createdAt }`. A module-scope SolidJS store (`src/lib/inventory/store.ts`) owns the ledger and exposes pure, fully unit-tested accessors (`currentStock`, `recordMovement`, `recordMovements`, stats). The `/inventory` page becomes a URL-driven (`?tab=`) tabbed shell; the two multi-step flows (`opname/new`, `terima/new`) are full-screen routes in the `"flow"` zone. Every UI change routes through the ledger — silent `+1/−1` mutation is gone.

**Tech Stack:** SolidJS (`solid-js/store`), `@solidjs/router`, Kobalte Tabs (`~/components/ui/tabs`), corvu `Sheet`/`AdaptiveDialog` (`~/components/ui/*`), Tailwind v4, Vitest + `@solidjs/testing-library` (jsdom). All data is in-memory (no DB yet) — the store is a module singleton so the whole app shares one source of truth.

**Design reference (wireframes):** the agreed tablet wireframes A–H (Dashboard, Adjustment Sheet, Opname list/count/summary, Terima list/receive, Riwayat).

---

## Conventions you MUST follow (read first)

- **Path alias:** `~` = `apps/pos-app/src`. Always import via `~/...`.
- **Tests location:** `src/**/__test__/*.{test,spec}.{ts,tsx}` (this is the ONLY glob vitest runs — see `vite.config.ts`). Put tests in an `__test__/` folder next to the module.
- **Tests use real globals** (`describe/it/expect` available) but the existing tests still `import { describe, expect, it, vi } from "vitest"` — follow that style. UI tests need `matchMedia`, `ResizeObserver`, and `element.animate` mocks; **copy the mock block from `src/components/ui/__test__/tabs.test.tsx`** into any UI test that touches Tabs/dialogs.
- **Read-only data + readonly props:** `Product` fields are `readonly`; SolidJS components take `props: { ... }` with `readonly` fields. Mutations go through the inventory store only.
- **Indonesian UI copy** (matching existing pages): `Stok`, `Stok Rendah`, `Habis`, `Tersedia`, `Penyesuaian`, `Penerimaan`, `Stock Opname`, `Riwayat`, `Alasan`, `Simpan`, `Batal`, `Selesai & Simpan`.
- **Commit after every task** (frequent commits). Use `feat:`/`refactor:`/`test:` prefixes.
- **Lint + typecheck before committing:** `pnpm lint` (ultracite) and `pnpm typecheck` (`tsc --noEmit`). Run `pnpm test` for the specific test file.
- **This is a Tauri/SolidJS monorepo** — run commands from `apps/pos-app`.

---

## Phase 1 — The movement ledger (foundation)

> Goal: a pure, fully-tested data layer. Nothing visual yet. Everything else depends on this.

### Task 1.1: Inventory domain types

**Files:**
- Create: `src/lib/inventory/types.ts`

**Step 1: Write the types file**

```ts
/* ── Inventory movement ledger domain types ─────────────────────── */

/** Kind of stock movement. `opening` = saldo awal (seed balance). */
export type MovementType =
  | "opening"
  | "adjustment"
  | "restock"
  | "stocktake"
  | "sale";

/** Reasons for a manual adjustment (and stocktake variance). */
export type AdjustmentReason =
  | "rusak" // damaged
  | "hilang" // lost
  | "expired"
  | "hadiah" // giveaway / free
  | "sample" // sampling
  | "lainnya"; // other

/** Human labels for AdjustmentReason, used in UI selects & history rows. */
export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  rusak: "Rusak",
  hilang: "Hilang",
  expired: "Expired",
  hadiah: "Hadiah",
  sample: "Sample",
  lainnya: "Lainnya",
};

/** Human labels + emoji for MovementType, used in Riwayat. */
export const MOVEMENT_TYPE_META: Record<
  MovementType,
  { label: string; emoji: string }
> = {
  opening: { label: "Saldo Awal", emoji: "🏦" },
  adjustment: { label: "Penyesuaian", emoji: "🔧" },
  restock: { label: "Penerimaan", emoji: "📦" },
  stocktake: { label: "Stock Opname", emoji: "📋" },
  sale: { label: "Penjualan", emoji: "🛒" },
};

/**
 * A single immutable ledger entry. `stock = Σ delta` over all movements
 * for a product. `qtyBefore`/`qtyAfter` are denormalized for fast history
 * rendering and always satisfy `qtyAfter === qtyBefore + delta`.
 */
export interface Movement {
  readonly id: string;
  readonly productId: number;
  readonly type: MovementType;
  /** Signed change. Clamped so qtyAfter never goes negative. */
  readonly delta: number;
  readonly qtyBefore: number;
  readonly qtyAfter: number;
  /** Required for `adjustment` and `stocktake` variance. */
  readonly reason?: AdjustmentReason;
  readonly note?: string;
  /** Free-form reference: PO number, order id, "OPN-017", "TRX-042". */
  readonly ref?: string;
  readonly supplier?: string;
  /** Purchase cost per unit, for restock (enables COGS reports later). */
  readonly costPrice?: number;
  readonly user: string;
  readonly createdAt: number; // epoch ms
}

/** Input to `recordMovement` — ledger fills id/qtyBefore/qtyAfter/createdAt. */
export type MovementInput = Omit<
  Movement,
  "id" | "qtyBefore" | "qtyAfter" | "user" | "createdAt"
> & { readonly user?: string };
```

**Step 2: Commit**

```bash
git add src/lib/inventory/types.ts
git commit -m "feat(inventory): add movement ledger domain types"
```

---

### Task 1.2: Movement store — seeding, accessors, single + batch append

**Files:**
- Create: `src/lib/inventory/store.ts`
- Test: `src/lib/inventory/__test__/store.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/inventory/__test__/store.test.ts
import { describe, expect, it } from "vitest";
import { products } from "~/lib/data/catalog";
import {
  currentStock,
  getMovements,
  recordMovement,
  recordMovements,
  resetInventoryStore,
} from "../store";

describe("inventory store", () => {
  it("seeds an opening movement per product so balances reconcile", () => {
    resetInventoryStore();
    expect(getMovements().filter((m) => m.type === "opening")).toHaveLength(
      products.length
    );
  });

  it("currentStock equals the product's seeded stock at start", () => {
    resetInventoryStore();
    for (const p of products) {
      expect(currentStock(p.id)).toBe(p.stock);
    }
  });

  it("recordMovement appends and shifts the balance", () => {
    resetInventoryStore();
    const before = currentStock(1); // Es Kopi Susu = 80
    const m = recordMovement({
      productId: 1,
      type: "adjustment",
      delta: -5,
      reason: "rusak",
    });
    expect(m.qtyBefore).toBe(before);
    expect(m.qtyAfter).toBe(before - 5);
    expect(m.delta).toBe(-5);
    expect(currentStock(1)).toBe(before - 5);
  });

  it("clamps negative stock to 0 and records the effective delta", () => {
    resetInventoryStore();
    // product 24 (Latte Art Special) starts at 5
    const m = recordMovement({
      productId: 24,
      type: "adjustment",
      delta: -20,
      reason: "hilang",
    });
    expect(m.qtyAfter).toBe(0);
    expect(m.delta).toBe(-5); // effective, not -20
    expect(currentStock(24)).toBe(0);
  });

  it("requires a reason for adjustment", () => {
    resetInventoryStore();
    expect(() =>
      recordMovement({ productId: 1, type: "adjustment", delta: -1 })
    ).toThrow(/reason/i);
  });

  it("records user + createdAt + unique id", () => {
    resetInventoryStore();
    const a = recordMovement({
      productId: 1,
      type: "restock",
      delta: 10,
      user: "Budi",
    });
    const b = recordMovement({
      productId: 2,
      type: "restock",
      delta: 10,
    });
    expect(a.user).toBe("Budi");
    expect(a.createdAt).toBeTypeOf("number");
    expect(a.id).not.toBe(b.id);
  });

  it("recordMovements chains qtyBefore across a batch (opname)", () => {
    resetInventoryStore();
    const start1 = currentStock(1);
    const start2 = currentStock(2);
    const ms = recordMovements([
      { productId: 1, type: "stocktake", delta: -5, reason: "lainnya" },
      { productId: 2, type: "stocktake", delta: -3, reason: "lainnya" },
      { productId: 1, type: "stocktake", delta: -2, reason: "lainnya" },
    ]);
    expect(ms).toHaveLength(3);
    expect(ms[0].qtyBefore).toBe(start1);
    expect(ms[0].qtyAfter).toBe(start1 - 5);
    // third entry is product 1 again, must chain off the new balance
    expect(ms[2].qtyBefore).toBe(start1 - 5);
    expect(ms[2].qtyAfter).toBe(start1 - 5 - 2);
    expect(currentStock(2)).toBe(start2 - 3);
  });

  it("getMovements returns newest-last (append order)", () => {
    resetInventoryStore();
    recordMovement({ productId: 1, type: "adjustment", delta: -1, reason: "rusak" });
    const all = getMovements();
    expect(all[all.length - 1].type).toBe("adjustment");
  });
});
```

**Step 2: Run the test to verify it fails**

```bash
pnpm test src/lib/inventory/__test__/store.test.ts
```
Expected: FAIL — module `../store` does not exist.

**Step 3: Write the implementation**

```ts
// src/lib/inventory/store.ts
import { createStore, produce } from "solid-js/store";
import { products } from "~/lib/data/catalog";
import type { Movement, MovementInput } from "./types";

/* ── ID generation (no uuid dep) ── */
let idCounter = 0;
const genId = () => `mv_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

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
  if ((input.type === "adjustment" || input.type === "stocktake") && !input.reason) {
    throw new Error(
      `recordMovement: reason is required for type "${input.type}"`
    );
  }
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    throw new Error("recordMovement: delta must be a non-zero finite number");
  }
}

function buildMovement(input: MovementInput, balanceOf: (pid: number) => number): Movement {
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
      if (m.productId === pid) sum += m.delta;
    }
    let base = 0;
    for (const m of movements) {
      if (m.productId === pid) base += m.delta;
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
```

**Step 4: Run the test to verify it passes**

```bash
pnpm test src/lib/inventory/__test__/store.test.ts
```
Expected: PASS — all 7 tests.

**Step 5: Commit**

```bash
git add src/lib/inventory/store.ts src/lib/inventory/__test__/store.test.ts
git commit -m "feat(inventory): add movement ledger store with seeding + batch append"
```

---

### Task 1.3: Derived stats + history grouping (pure helpers, tested)

**Files:**
- Create: `src/lib/inventory/stats.ts`
- Test: `src/lib/inventory/__test__/stats.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/inventory/__test__/stats.test.ts
import { describe, expect, it } from "vitest";
import { products } from "~/lib/data/catalog";
import { recordMovement, resetInventoryStore } from "./store";
import {
  computeStockValue,
  countByStatus,
  groupMovementsByDay,
  stockStatus,
} from "../stats";

describe("inventory stats", () => {
  it("stockStatus classifies out / low / available with default min 10", () => {
    expect(stockStatus(0)).toMatchObject({ status: "out" });
    expect(stockStatus(8)).toMatchObject({ status: "low" });
    expect(stockStatus(10)).toMatchObject({ status: "low" });
    expect(stockStatus(11)).toMatchObject({ status: "available" });
  });

  it("stockStatus honours a custom minStock", () => {
    expect(stockStatus(20, 20)).toMatchObject({ status: "low" });
    expect(stockStatus(21, 20)).toMatchObject({ status: "available" });
  });

  it("countByStatus tallies products from a stock map", () => {
    resetInventoryStore();
    const counts = countByStatus(); // uses currentStock per product
    const total = counts.out + counts.low + counts.available;
    expect(total).toBe(products.length);
    expect(counts.out).toBe(products.filter((p) => p.stock === 0).length);
  });

  it("computeStockValue sums stock * price", () => {
    resetInventoryStore();
    const expected = products.reduce((s, p) => s + p.stock * p.price, 0);
    expect(computeStockValue()).toBe(expected);
  });

  it("groupMovementsByDay buckets by local date, newest-first", () => {
    resetInventoryStore();
    recordMovement({ productId: 1, type: "adjustment", delta: -1, reason: "rusak" });
    const groups = groupMovementsByDay();
    // first group is "today" (the adjustment), contains ≥1 non-opening movement
    expect(groups[0].items.at(-1)?.type).toBe("adjustment");
    // groups are ordered newest-first
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].ts >= groups[i].ts).toBe(true);
    }
  });
});
```

**Step 2: Run to verify it fails**

```bash
pnpm test src/lib/inventory/__test__/stats.test.ts
```
Expected: FAIL — `../stats` missing.

**Step 3: Write the implementation**

```ts
// src/lib/inventory/stats.ts
import { products } from "~/lib/data/catalog";
import { currentStock, getMovements } from "./store";
import type { Movement } from "./types";

export type StockStatusKind = "available" | "low" | "out";

export interface StockStatusInfo {
  status: StockStatusKind;
  label: string;
  badge: "success" | "warning" | "danger";
}

const DEFAULT_MIN = 10;

export function stockStatus(stock: number, minStock = DEFAULT_MIN): StockStatusInfo {
  if (stock <= 0) return { status: "out", label: "Habis", badge: "danger" };
  if (stock <= minStock) return { status: "low", label: "Stok Rendah", badge: "warning" };
  return { status: "available", label: "Tersedia", badge: "success" };
}

export function countByStatus(minStock = DEFAULT_MIN) {
  let out = 0;
  let low = 0;
  let available = 0;
  for (const p of products) {
    const s = stockStatus(currentStock(p.id), minStock).status;
    if (s === "out") out++;
    else if (s === "low") low++;
    else available++;
  }
  return { out, low, available };
}

/** Total retail value of on-hand stock (sum stock * price). */
export function computeStockValue(): number {
  let sum = 0;
  for (const p of products) {
    sum += currentStock(p.id) * p.price;
  }
  return sum;
}

export interface DayGroup {
  ts: number; // start-of-day epoch ms (local), for ordering
  label: string; // e.g. "17 Jun 2026"
  items: Movement[]; // newest-last within the day
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_LABEL = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Group all movements by local calendar day, newest day first. */
export function groupMovementsByDay(): DayGroup[] {
  const map = new Map<number, Movement[]>();
  for (const m of getMovements()) {
    const key = startOfDay(m.createdAt);
    (map.get(key) ?? map.set(key, []).get(key)!).push(m);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([ts, items]) => ({
      ts,
      label: DAY_LABEL.format(new Date(ts)),
      items,
    }));
}
```

**Step 4: Run to verify it passes**

```bash
pnpm test src/lib/inventory/__test__/stats.test.ts
```
Expected: PASS.

**Step 5: Run the full suite + typecheck**

```bash
pnpm test && pnpm typecheck
```

**Step 6: Commit**

```bash
git add src/lib/inventory/stats.ts src/lib/inventory/__test__/stats.test.ts
git commit -m "feat(inventory): add stock status, counts, value, and day grouping helpers"
```

---

## Phase 2 — Dashboard restructure + auditable adjustment sheet

> Goal: `/inventory` becomes a 4-tab shell. The dashboard keeps the fast inline stepper, but every +/− opens an **Adjustment Sheet** that writes a `movement`. The stepper no longer mutates silently.

### Task 2.1: Reusable `StatCards` component

**Files:**
- Create: `src/pages/inventory/components/stat-cards.tsx`

**Step 1: Write the component**

```tsx
// src/pages/inventory/components/stat-cards.tsx
import { Show } from "solid-js";
import { Card } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export interface StatCardsProps {
  readonly total: number;
  readonly low: number;
  readonly out: number;
  readonly value: number;
  readonly onLow?: () => void;
  readonly onOut?: () => void;
}

const formatJt = (n: number) => {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1).replace(".0", "")} jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1000)}rb`;
  return `Rp ${n}`;
};

export function StatCards(props: StatCardsProps) {
  const items = () => [
    { label: "Produk", value: String(props.total), dot: undefined, onClick: undefined },
    {
      label: "Stok Rendah",
      value: String(props.low),
      dot: "warning",
      onClick: props.onLow,
    },
    {
      label: "Habis",
      value: String(props.out),
      dot: "danger",
      onClick: props.onOut,
    },
    { label: "Nilai Stok", value: formatJt(props.value), dot: undefined, onClick: undefined },
  ];
  return (
    <div class="grid grid-cols-4 gap-2">
      {items().map((it) => (
        <Card
          class={cn(
            "p-3",
            it.onClick && "cursor-pointer transition-colors hover:border-primary/30"
          )}
          onClick={it.onClick}
        >
          <div class="flex items-center gap-1.5">
            <Show when={it.dot}>
              <span
                class={cn(
                  "inline-block size-1.5 rounded-full",
                  it.dot === "warning" && "bg-warning",
                  it.dot === "danger" && "bg-danger"
                )}
              />
            </Show>
            <span class="font-semibold text-body-sm text-foreground tabular-nums">
              {it.value}
            </span>
          </div>
          <p class="mt-0.5 text-caption-sm text-muted-foreground">{it.label}</p>
        </Card>
      ))}
    </div>
  );
}
```

> **Verify** `~/components/ui/card` exports `Card` and its props (it does — read it if unsure). If `Card` doesn't accept `onClick`, wrap with a `<button>` instead. Check before committing.

**Step 2: Commit**

```bash
git add src/pages/inventory/components/stat-cards.tsx
git commit -m "feat(inventory): add StatCards dashboard widget"
```

---

### Task 2.2: `AdjustmentSheet` — the auditable +/− flow (Screen B)

**Files:**
- Create: `src/pages/inventory/components/adjustment-sheet.tsx`

**Behavior:**
- Controlled `open`/`onOpenChange` (driven by the row, no internal trigger needed).
- Internal state: `direction: "in" | "out"` (default `"out"`), `qty` (number, default 1), `reason` (`AdjustmentReason | undefined`), `note` (string).
- Direction `in` (Tambah) → delta `+qty`. Direction `out` (Kurangi) → delta `−qty`. `reason` is required for BOTH directions (keeps every change auditable). `note` optional.
- Live preview: `before → after (±delta)` using `currentStock(product.id)`.
- Save calls `recordMovement({ productId, type: "adjustment", delta, reason, note })`, shows a `toast.success`, then `onOpenChange(false)`.

**Step 1: Write the component**

```tsx
// src/pages/inventory/components/adjustment-sheet.tsx
import { createMemo, createSignal, Show } from "solid-js";
import { toast } from "solid-sonner";
import { Button } from "~/components/ui/button";
import {
  AdaptiveDialog,
  AdaptiveDialogContent,
  AdaptiveDialogDescription,
  AdaptiveDialogFooter,
  AdaptiveDialogHeader,
  AdaptiveDialogTitle,
} from "~/components/ui/adaptive-dialog";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { TextField, TextFieldInput, TextFieldLabel } from "~/components/ui/text-field";
import { type Product, formatRupiah } from "~/lib/data/catalog";
import { ADJUSTMENT_REASON_LABELS, type AdjustmentReason } from "~/lib/inventory/types";
import { currentStock, recordMovement } from "~/lib/inventory/store";
import { cn } from "~/lib/utils";

const REASONS = Object.keys(ADJUSTMENT_REASON_LABELS) as AdjustmentReason[];

export interface AdjustmentSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly product: Product;
}

export function AdjustmentSheet(props: AdjustmentSheetProps) {
  const [direction, setDirection] = createSignal<"in" | "out">("out");
  const [qty, setQty] = createSignal(1);
  const [reason, setReason] = createSignal<AdjustmentReason | undefined>(undefined);
  const [note, setNote] = createSignal("");

  // Reset transient state whenever the sheet opens for a fresh product.
  let lastOpen = false;
  createEffect(() => {
    if (props.open && !lastOpen) {
      setDirection("out");
      setQty(1);
      setReason(undefined);
      setNote("");
    }
    lastOpen = props.open;
  });

  const balance = () => currentStock(props.product.id);
  const delta = createMemo(() => (direction() === "in" ? qty() : -qty()));
  const after = createMemo(() => Math.max(0, balance() + delta()));
  const canSave = () => qty() > 0 && reason() !== undefined;

  const handleSave = () => {
    if (!canSave()) return;
    recordMovement({
      productId: props.product.id,
      type: "adjustment",
      delta: delta(),
      reason: reason(),
      note: note().trim() || undefined,
    });
    toast.success("Penyesuaian tersimpan");
    props.onOpenChange(false);
  };

  return (
    <AdaptiveDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AdaptiveDialogContent class="max-w-md">
        <AdaptiveDialogHeader>
          <AdaptiveDialogTitle>{props.product.name}</AdaptiveDialogTitle>
          <AdaptiveDialogDescription>
            {props.product.sku} · {formatRupiah(props.product.price)} · {props.product.unit}
          </AdaptiveDialogDescription>
        </AdaptiveDialogHeader>

        <div class="flex flex-col gap-4">
          <div class="rounded-lg border border-border bg-muted/40 p-3 text-center">
            <p class="text-caption-sm text-muted-foreground">Stok saat ini</p>
            <p class="font-bold text-subheading text-foreground tabular-nums">{balance()}</p>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <Button
              look={direction() === "in" ? "solid" : "outline"}
              tone="primary"
              onClick={() => setDirection("in")}
              type="button"
            >
              ➕ Tambah
            </Button>
            <Button
              look={direction() === "out" ? "solid" : "outline"}
              tone={direction() === "out" ? "danger" : "neutral"}
              onClick={() => setDirection("out")}
              type="button"
            >
              ➖ Kurangi
            </Button>
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="font-medium text-body-sm text-foreground">Jumlah</span>
            <QuantityStepper
              ariaLabel={`Jumlah ${props.product.name}`}
              editable
              onDecrement={() => setQty((q) => Math.max(1, q - 1))}
              onIncrement={() => setQty((q) => q + 1)}
              onInput={(v) => setQty(Math.max(1, v))}
              value={qty()}
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="font-medium text-body-sm text-foreground">Alasan</span>
            <div class="flex flex-wrap gap-2">
              {REASONS.map((r) => (
                <button
                  class={cn(
                    "rounded-full border-2 px-3 py-1.5 font-semibold text-[13px] transition-colors",
                    reason() === r
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/30"
                  )}
                  onClick={() => setReason(r)}
                  type="button"
                >
                  {ADJUSTMENT_REASON_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <TextField class="gap-1.5" onChange={setNote} value={note()}>
            <TextFieldLabel>Catatan (opsional)</TextFieldLabel>
            <TextFieldInput placeholder="Contoh: ganti toples baru" />
          </TextField>

          <div class="rounded-lg border border-border p-3 text-center font-medium text-body-sm text-foreground tabular-nums">
            Pratinjau: {balance()} <span class="text-muted-foreground">→</span> {after()}{" "}
            <span class={delta() < 0 ? "text-danger" : "text-success"}>
              ({delta() > 0 ? "+" : ""}
              {delta()})
            </span>
          </div>
        </div>

        <AdaptiveDialogFooter>
          <Button look="outline" onClick={() => props.onOpenChange(false)} tone="neutral" type="button">
            Batal
          </Button>
          <Button
            disabled={!canSave()}
            look="solid"
            onClick={handleSave}
            tone="primary"
            type="button"
          >
            Simpan
          </Button>
        </AdaptiveDialogFooter>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}
```

> **Note:** `createEffect` is used but not imported in the snippet above — add `createEffect` to the `solid-js` import. Fix the import line to: `import { createEffect, createMemo, createSignal, Show } from "solid-js";`. (`Show` is imported but unused — drop it if lint complains.)

**Step 2: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors in this file. (Resolve any prop mismatches by reading the referenced component — `Button`, `TextField`, `QuantityStepper`.)

**Step 3: Commit**

```bash
git add src/pages/inventory/components/adjustment-sheet.tsx
git commit -m "feat(inventory): add AdjustmentSheet (auditable +/− via ledger)"
```

---

### Task 2.3: Refactor `product-row.tsx` to open the sheet instead of silent mutation

**Files:**
- Modify: `src/pages/inventory/product-row.tsx`

**Step 1: Read current file** (already known, but re-read to get exact text for the edit):

```bash
# (in editor) read src/pages/inventory/product-row.tsx
```

**Step 2: Replace the whole file** with a version whose stepper buttons + the editable input **open the sheet** (with a preselected direction) rather than calling `onAdjustStock`/`onSetStock`:

```tsx
// src/pages/inventory/product-row.tsx
import { Badge } from "~/components/ui/badge";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { type Product } from "~/lib/data/catalog";
import { currentStock } from "~/lib/inventory/store";
import { stockStatus } from "~/lib/inventory/stats";
import { formatRupiah } from "~/lib/utils";

export interface InventoryRowProps {
  readonly product: Product;
  readonly onAdjust: (direction: "in" | "out") => void;
}

export function InventoryRow(props: InventoryRowProps) {
  const stock = () => currentStock(props.product.id);
  const s = () => stockStatus(stock());
  const dotClass = () =>
    s().status === "out"
      ? "bg-danger"
      : s().status === "low"
        ? "bg-warning"
        : "bg-success";
  return (
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/20 lg:gap-4">
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.product.sku} · {formatRupiah(props.product.price)}
        </p>
        <div class="mt-1 flex items-center gap-1.5">
          <span class={`inline-block size-1.5 rounded-full ${dotClass()}`} />
          <Badge size="sm" variant={s().badge}>
            {s().label}
          </Badge>
        </div>
      </div>
      <div class="flex shrink-0 flex-col items-center gap-1">
        <QuantityStepper
          ariaLabel={`Stok ${props.product.name}`}
          editable
          onDecrement={() => props.onAdjust("out")}
          onIncrement={() => props.onAdjust("in")}
          onInput={() => props.onAdjust("out")}
          value={stock()}
        />
        <span class="font-medium text-caption-sm text-faint-foreground">
          {props.product.unit}
        </span>
      </div>
    </div>
  );
}
```

Key change: stock is **read from the ledger** (`currentStock`), not a prop; the old `A href="#"` edit link is removed (editing product details lives in Catalog); the stepper no longer mutates — it calls `onAdjust(direction)` which the parent wires to open the sheet.

**Step 3: Commit** (the page wiring in 2.4 will make it compile — `index.tsx` still passes the old props until 2.4).

```bash
git add src/pages/inventory/product-row.tsx
git commit -m "refactor(inventory): row reads stock from ledger, stepper opens sheet"
```

---

### Task 2.4: Turn `/inventory` into a 4-tab shell + Dashboard tab (Screen A)

**Files:**
- Modify: `src/pages/inventory/index.tsx`
- Create: `src/pages/inventory/components/dashboard-tab.tsx`

**Step 1: Create the Dashboard tab**

```tsx
// src/pages/inventory/components/dashboard-tab.tsx
import { createMemo, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { SearchBar } from "~/components/search-bar";
import { FadeIn } from "~/components/ui/fade-in";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { categories, products } from "~/lib/data/catalog";
import { useOrientation } from "~/lib/use-orientation";
import { computeStockValue, countByStatus } from "~/lib/inventory/stats";
import { InventoryRow } from "../product-row";
import { AdjustmentSheet } from "./adjustment-sheet";
import { StatCards } from "./stat-cards";

export function DashboardTab() {
  const navigate = useNavigate();
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();

  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");
  // For low/out-only filter triggered by stat cards.
  const [statusFilter, setStatusFilter] = createSignal<"all" | "low" | "out">("all");

  // Adjustment sheet state.
  const [adjustProductId, setAdjustProductId] = createSignal<number | null>(null);
  const [adjustDir, setAdjustDir] = createSignal<"in" | "out">("out");
  const adjustProduct = () =>
    products.find((p) => p.id === adjustProductId()) ?? null;

  const openSheet = (productId: number, direction: "in" | "out") => {
    setAdjustDir(direction);
    setAdjustProductId(productId);
  };

  const counts = createMemo(() => countByStatus());
  const value = createMemo(() => computeStockValue());

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    const cat = activeCat();
    const sf = statusFilter();
    return products.filter((p) => {
      const matchCat = cat === "all" || p.category === cat;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      if (!matchCat || !matchQ) return false;
      return true;
    });
  });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-3 px-4 pt-4 lg:px-6">
        <StatCards
          total={products.length}
          low={counts().low}
          out={counts().out}
          value={value()}
          onLow={() => setStatusFilter("low")}
          onOut={() => setStatusFilter("out")}
        />

        {/* Primary action tiles */}
        <div class="grid grid-cols-2 gap-2">
          <button
            class="flex flex-col gap-0.5 rounded-xl border-2 border-border bg-card p-3 text-left transition-colors hover:border-primary/30"
            onClick={() => navigate("/inventory/terima/new")}
            type="button"
          >
            <span class="font-semibold text-body-sm text-foreground">➕ Terima Barang</span>
            <span class="text-caption-sm text-muted-foreground">Restock dari supplier</span>
          </button>
          <button
            class="flex flex-col gap-0.5 rounded-xl border-2 border-border bg-card p-3 text-left transition-colors hover:border-primary/30"
            onClick={() => navigate("/inventory/opname/new")}
            type="button"
          >
            <span class="font-semibold text-body-sm text-foreground">📋 Mulai Stock Opname</span>
            <span class="text-caption-sm text-muted-foreground">Hitung stok fisik</span>
          </button>
        </div>

        <div class="flex items-center gap-2">
          <SearchBar
            class="flex-1"
            onInput={setSearch}
            placeholder="Cari produk atau SKU..."
            value={search()}
          />
          <Show when={statusFilter() !== "all"}>
            <button
              class="font-medium text-caption-sm text-primary"
              onClick={() => setStatusFilter("all")}
              type="button"
            >
              ✕ Reset filter
            </button>
          </Show>
        </div>

        <Tabs
          class="scrollbar-none overflow-x-auto"
          onChange={setActiveCat}
          value={activeCat()}
        >
          <TabsList class="flex gap-2">
            <TabsTrigger shape="pill" tone="accent" value="all" variant="pill">
              Semua <span class="text-caption-sm opacity-70">({products.length})</span>
            </TabsTrigger>
            <For each={categories}>
              {(cat) => (
                <TabsTrigger shape="pill" tone="accent" value={cat.id} variant="pill">
                  {cat.name}
                  <span class="text-caption-sm opacity-70">
                    ({products.filter((p) => p.category === cat.id).length})
                  </span>
                </TabsTrigger>
              )}
            </For>
          </TabsList>
        </Tabs>
      </div>

      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pb-28 pt-2 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <div class="flex flex-col items-center justify-center gap-1 py-20 text-center">
              <p class="text-body-sm text-muted-foreground">Produk tidak ditemukan</p>
              <p class="text-caption text-faint-foreground">Coba ubah filter atau kata kunci</p>
            </div>
          }
          when={filtered().length > 0}
        >
          <div class="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
            <For each={filtered()}>
              {(product, i) => (
                <FadeIn delay={0.1 + i() * 0.03} duration={0.35} enable={enable()} y={12}>
                  <InventoryRow
                    onAdjust={(dir) => openSheet(product.id, dir)}
                    product={product}
                  />
                </FadeIn>
              )}
            </For>
          </div>
        </Show>
      </div>

      {/* The adjustment overlay */}
      <Show when={adjustProduct()}>
        {(p) => (
          <AdjustmentSheet
            open={adjustProductId() !== null}
            product={p()}
            onOpenChange={(o) => !o && setAdjustProductId(null)}
          />
        )}
      </Show>
    </div>
  );
}
```

> **`statusFilter` note:** the memo above filters by category + search but **not** by status. To honor the low/out stat-card filter, also gate on status inside `filtered()`. Add inside the filter callback, before `return true`:
> ```ts
> import { currentStock } from "~/lib/inventory/store";
> import { stockStatus } from "~/lib/inventory/stats";
> // ...
> if (sf !== "all") {
>   const st = stockStatus(currentStock(p.id)).status;
>   if (st !== sf) return false;
> }
> ```
> Add `currentStock` to the imports and wire this block. Do this before committing.

**Step 2: Rewrite `index.tsx` as a URL-driven tab shell**

```tsx
// src/pages/inventory/index.tsx
import { useSearchParams } from "@solidjs/router";
import { For, Show, createMemo, type JSX } from "solid-js";
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DashboardTab } from "./components/dashboard-tab";
import { OpnameTab } from "./components/opname-tab";
import { TerimaTab } from "./components/terima-tab";
import { RiwayatTab } from "./components/riwayat-tab";

type TabKey = "dashboard" | "opname" | "terima" | "riwayat";

const TABS: { value: TabKey; label: string }[] = [
  { value: "dashboard", label: "Daftar Stok" },
  { value: "opname", label: "Opname" },
  { value: "terima", label: "Terima Barang" },
  { value: "riwayat", label: "Riwayat" },
];

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const active = createMemo<TabKey>(() => {
    const t = (params.tab as TabKey) ?? "dashboard";
    return TABS.some((x) => x.value === t) ? t : "dashboard";
  });

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/inventory"
    >
      <div class="relative shrink-0 border-border border-b">
        <Tabs
          class="flex flex-1 flex-col overflow-hidden"
          value={active()}
          onChange={(v) => setParams({ tab: v })}
        >
          <TabsList class="relative flex w-full">
            <For each={TABS}>
              {(t) => (
                <TabsTrigger class="flex-1" value={t.value}>
                  {t.label}
                </TabsTrigger>
              )}
            </For>
            <TabsIndicator class="bg-primary" />
          </TabsList>
        </Tabs>
      </div>

      <Show when={active() === "dashboard"}>
        <DashboardTab />
      </Show>
      <Show when={active() === "opname"}>
        <OpnameTab />
      </Show>
      <Show when={active() === "terima"}>
        <TerimaTab />
      </Show>
      <Show when={active() === "riwayat"}>
        <RiwayatTab />
      </Show>
    </div>
  );
}
```

> `JSX` import is unused — drop it if lint flags it. `TabsContent` is unused here (we use `Show` per tab to avoid mounting all four at once); remove unused imports.

**Step 3: Typecheck**

```bash
pnpm typecheck
```
Expected: no errors. (Fix the unused-import notes above so ultracite passes.)

**Step 4: Manual smoke test**

```bash
pnpm dev
```
Visit `/inventory`: tabs switch via URL; tapping +/− on a row opens the sheet; saving adjusts the number and it persists across tab switches (shared store). Stat cards reflect changes.

**Step 5: Commit**

```bash
git add src/pages/inventory/index.tsx src/pages/inventory/components/dashboard-tab.tsx
git commit -m "feat(inventory): tabbed shell + dashboard tab wired to ledger"
```

---

## Phase 3 — Riwayat (proves the ledger works)

### Task 3.1: `RiwayatTab` — day-grouped movement ledger (Screen H)

**Files:**
- Create: `src/pages/inventory/components/riwayat-tab.tsx`

**Behavior:** renders `groupMovementsByDay()`; each row shows emoji + time + type label + product name + `qtyBefore → qtyAfter (±delta)` + reason/user. A type filter dropdown (use a simple `<select>` or `TabButton` row) and a product search.

**Step 1: Write the component**

```tsx
// src/pages/inventory/components/riwayat-tab.tsx
import { createMemo, createSignal, For, Show } from "solid-js";
import { SearchBar } from "~/components/search-bar";
import { products } from "~/lib/data/catalog";
import { groupMovementsByDay } from "~/lib/inventory/stats";
import { MOVEMENT_TYPE_META, type MovementType } from "~/lib/inventory/types";
import { TabButton } from "~/components/ui/tabs";
import { formatRupiah } from "~/lib/utils";

const FILTERS: { value: "all" | MovementType; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "sale", label: "🛒 Penjualan" },
  { value: "restock", label: "📦 Penerimaan" },
  { value: "stocktake", label: "📋 Opname" },
  { value: "adjustment", label: "🔧 Penyesuaian" },
];

function timeOf(ts: number) {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(ts)
  );
}

export function RiwayatTab() {
  const [q, setQ] = createSignal("");
  const [typeFilter, setTypeFilter] = createSignal<"all" | MovementType>("all");

  const productName = (id: number) => products.find((p) => p.id === id)?.name ?? "—";

  const groups = createMemo(() => {
    const query = q().toLowerCase();
    const tf = typeFilter();
    return groupMovementsByDay()
      .map((g) => ({
        ...g,
        items: g.items.filter((m) => {
          if (tf !== "all" && m.type !== tf) return false;
          if (!query) return true;
          return productName(m.productId).toLowerCase().includes(query);
        }),
      }))
      .filter((g) => g.items.length > 0);
  });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 space-y-2 px-4 pt-4 lg:px-6">
        <SearchBar onInput={setQ} placeholder="Cari produk..." value={q()} />
        <div class="scrollbar-none flex gap-2 overflow-x-auto">
          <For each={FILTERS}>
            {(f) => (
              <TabButton
                active={typeFilter() === f.value}
                onClick={() => setTypeFilter(f.value)}
                shape="pill"
                tone="accent"
              >
                {f.label}
              </TabButton>
            )}
          </For>
        </div>
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
        <For each={groups()} fallback={<p class="py-20 text-center text-body-sm text-muted-foreground">Belum ada aktivitas</p>}>
          {(g) => (
            <div class="mb-4">
              <p class="mb-1.5 font-semibold text-caption-sm text-muted-foreground">
                {g.label}
              </p>
              <div class="overflow-hidden rounded-xl border border-border">
                <For each={g.items}>
                  {(m) => {
                    const meta = MOVEMENT_TYPE_META[m.type];
                    return (
                      <div class="flex items-start gap-3 border-border border-b p-3 last:border-b-0">
                        <span class="text-lg leading-none">{meta.emoji}</span>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-baseline justify-between gap-2">
                            <span class="truncate font-semibold text-body-sm text-foreground">
                              {productName(m.productId)}
                            </span>
                            <span class="shrink-0 font-semibold text-body-sm tabular-nums text-foreground">
                              {m.qtyBefore} → {m.qtyAfter}
                              <span class={m.delta < 0 ? "text-danger" : "text-success"}>
                                {" "}
                                ({m.delta > 0 ? "+" : ""}
                                {m.delta})
                              </span>
                            </span>
                          </div>
                          <p class="text-caption-sm text-muted-foreground">
                            {timeOf(m.createdAt)} · {meta.label}
                            <Show when={m.ref}> · {m.ref}</Show>
                          </p>
                          <p class="text-caption-sm text-faint-foreground">
                            <Show when={m.reason} fallback={m.note ?? ""}>
                              Alasan: {m.reason}
                            </Show>
                            {" · oleh "}
                            {m.user}
                          </p>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
```

**Step 2: Typecheck + smoke**

```bash
pnpm typecheck
```
> `formatRupiah` import unused — remove if flagged.

**Step 3: Commit**

```bash
git add src/pages/inventory/components/riwayat-tab.tsx
git commit -m "feat(inventory): add Riwayat movement-ledger tab"
```

---

## Phase 4 — Stock Opname (flagship flow)

> Two pieces: the **Opname tab** (list of past counts — Screen C) and the **full-screen counting flow** at `/inventory/opname/new` (Screens D→E). Past opnames are derived from the ledger by grouping `stocktake` movements by their `ref` (e.g. `OPN-017`).

### Task 4.1: Opname helpers — derive past opnames + compute next number

**Files:**
- Create: `src/lib/inventory/opname.ts`
- Test: `src/lib/inventory/__test__/opname.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/inventory/__test__/opname.test.ts
import { describe, expect, it } from "vitest";
import { recordMovements, resetInventoryStore } from "./store";
import { listOpnames, nextOpnameNumber, varianceRows } from "../opname";

describe("opname helpers", () => {
  it("nextOpnameNumber is 1 with no prior opnames", () => {
    resetInventoryStore();
    expect(nextOpnameNumber()).toBe(1);
  });

  it("lists opnames grouped by ref with net delta", () => {
    resetInventoryStore();
    recordMovements([
      { productId: 1, type: "stocktake", delta: -5, reason: "lainnya", ref: "OPN-001" },
      { productId: 2, type: "stocktake", delta: -3, reason: "lainnya", ref: "OPN-001" },
      { productId: 1, type: "stocktake", delta: 2, reason: "lainnya", ref: "OPN-002" },
    ]);
    const list = listOpnames();
    expect(list).toHaveLength(2);
    // newest-first
    expect(list[0].ref).toBe("OPN-002");
    expect(list[0].netDelta).toBe(2);
    expect(list[1].ref).toBe("OPN-001");
    expect(list[1].netDelta).toBe(-8);
    expect(list[1].itemCount).toBe(2);
  });

  it("varianceRows maps counted qty to {product, system, counted, diff}", () => {
    resetInventoryStore();
    const rows = varianceRows([
      { productId: 1, counted: 75 },
      { productId: 2, counted: 60 },
    ]);
    // product 1 system stock = 80 (seed), 2 = 60
    expect(rows[0]).toMatchObject({ productId: 1, system: 80, counted: 75, diff: -5 });
    expect(rows[1]).toMatchObject({ productId: 2, system: 60, counted: 60, diff: 0 });
  });
});
```

**Step 2: Run to verify it fails**

```bash
pnpm test src/lib/inventory/__test__/opname.test.ts
```

**Step 3: Write the implementation**

```ts
// src/lib/inventory/opname.ts
import { products } from "~/lib/data/catalog";
import { currentStock, getMovements } from "./store";
import type { Movement } from "./types";

const OPN_RE = /^OPN-(\d+)$/;

/** Next opname sequence number, derived from existing refs. */
export function nextOpnameNumber(): number {
  let max = 0;
  for (const m of getMovements()) {
    const match = m.ref?.match(OPN_RE);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return max + 1;
}

export function opnameRef(n: number): string {
  return `OPN-${String(n).padStart(3, "0")}`;
}

export interface OpnameSummary {
  readonly ref: string;
  readonly createdAt: number;
  readonly itemCount: number; // distinct products counted
  readonly netDelta: number; // Σ delta (negative = shrinkage)
  readonly movements: Movement[];
}

/** Past opnames, newest-first, grouped by OPN-### ref. */
export function listOpnames(): OpnameSummary[] {
  const map = new Map<string, Movement[]>();
  for (const m of getMovements()) {
    if (m.type !== "stocktake" || !m.ref) continue;
    (map.get(m.ref) ?? map.set(m.ref, []).get(m.ref)!).push(m);
  }
  return [...map.entries()]
    .map(([ref, ms]) => ({
      ref,
      createdAt: ms[0].createdAt,
      itemCount: new Set(ms.map((m) => m.productId)).size,
      netDelta: ms.reduce((s, m) => s + m.delta, 0),
      movements: ms,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface VarianceRow {
  readonly productId: number;
  readonly system: number;
  readonly counted: number;
  readonly diff: number; // counted - system
}

/** Map counted quantities to variance rows using current system stock. */
export function varianceRows(
  counted: readonly { productId: number; counted: number }[]
): VarianceRow[] {
  return counted.map((c) => {
    const system = currentStock(c.productId);
    return { productId: c.productId, system, counted: c.counted, diff: c.counted - system };
  });
}

/** Value of a set of variances (diff * product price). */
export function varianceValue(rows: readonly VarianceRow[]): number {
  let sum = 0;
  for (const r of rows) {
    const p = products.find((x) => x.id === r.productId);
    sum += (p?.price ?? 0) * r.diff;
  }
  return sum;
}
```

**Step 4: Run to verify it passes**

```bash
pnpm test src/lib/inventory/__test__/opname.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/inventory/opname.ts src/lib/inventory/__test__/opname.test.ts
git commit -m "feat(inventory): opname helpers (list, numbering, variance)"
```

---

### Task 4.2: `OpnameTab` — past counts list (Screen C)

**Files:**
- Create: `src/pages/inventory/components/opname-tab.tsx`

**Step 1: Write the component**

```tsx
// src/pages/inventory/components/opname-tab.tsx
import { useNavigate } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { listOpnames } from "~/lib/inventory/opname";
import { formatRupiah } from "~/lib/utils";

const dateLabel = (ts: number) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

export function OpnameTab() {
  const navigate = useNavigate();
  const opnames = createMemo(() => listOpnames());

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 px-4 pt-4 lg:px-6">
        <Button
          class="w-full"
          look="solid"
          onClick={() => navigate("/inventory/opname/new")}
          tone="primary"
          type="button"
        >
          📋 Mulai Opname Baru
        </Button>
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
        <p class="mb-2 font-semibold text-caption-sm text-muted-foreground">Riwayat Opname</p>
        <Show
          fallback={<p class="py-16 text-center text-body-sm text-muted-foreground">Belum ada opname</p>}
          when={opnames().length > 0}
        >
          <div class="overflow-hidden rounded-xl border border-border">
            <For each={opnames()}>
              {(o) => (
                <div class="flex items-center gap-3 border-border border-b p-3 last:border-b-0">
                  <span class="text-lg">📋</span>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-body-sm text-foreground">{o.ref}</p>
                    <p class="text-caption-sm text-muted-foreground">
                      {o.itemCount} item dihitung · {dateLabel(o.createdAt)}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class={`font-semibold text-body-sm tabular-nums ${o.netDelta < 0 ? "text-danger" : "text-foreground"}`}>
                      {o.netDelta > 0 ? "+" : ""}
                      {o.netDelta} item
                    </p>
                    <p class="text-caption-sm text-faint-foreground">✓ Selesai</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
```

> Remove unused `formatRupiah` import if not used.

**Step 2: Commit**

```bash
git add src/pages/inventory/components/opname-tab.tsx
git commit -m "feat(inventory): add Opname list tab"
```

---

### Task 4.3: Counting flow — `/inventory/opname/new` (Screen D + E)

**Files:**
- Create: `src/pages/inventory/components/opname-count.tsx`
- Create: `src/pages/inventory/pages/opname-new.tsx`
- Modify: `src/routes.tsx` (register route)
- Modify: `src/components/layout/app-shell/index.tsx` (mark zone as `"flow"`)

**Behavior:**
- Full-screen. Header: `✕ Stock Opname #00N` · `X / Y telah dihitung` · `Simpan Draft` (no-op for now / `toast.info`).
- Category pills with per-category progress (`Kopi 3/6`).
- Per product row: name + SKU · `system | [counted input] | diff` with state color (🔴 big, 🟡 small, ✓ match, ⏳ belum).
- Counted input: number input, `Enter` focuses next empty input (keyboard counting).
- Footer summary: total diff count + value; a required `Alasan opname` field; warning note; `Selesai & Simpan`.
- On confirm: compute variance rows (only items where counted is filled), `recordMovements` with `type: "stocktake"`, `ref: opnameRef(n)`, `delta: diff`, `reason` (the opname reason), then `navigate("/inventory?tab=opname")`.

**Step 1: Register the route + zone**

In `src/routes.tsx`, add imports + route near the inventory route:

```tsx
import InventoryOpnameNewPage from "./pages/inventory/pages/opname-new";
// ...
<Route component={InventoryOpnameNewPage} path="/inventory/opname/new" />
```

In `src/components/layout/app-shell/index.tsx`, extend zone detection so the opname/terima flows are `"flow"` (full-screen). Add an `INVENTORY_FORM_RE` and use it like `CATALOG_FORM_RE`:

```ts
const INVENTORY_FORM_RE = /^\/inventory\/(opname|terima)\//;
// inside zone():
if (CATALOG_FORM_RE.test(pathname()) || INVENTORY_FORM_RE.test(pathname())) {
  return "flow";
}
```

**Step 2: Write the counting component**

```tsx
// src/pages/inventory/components/opname-count.tsx
import { createMemo, createSignal, For, Show } from "solid-js";
import { categories, products } from "~/lib/data/catalog";
import { currentStock } from "~/lib/inventory/store";
import {
  nextOpnameNumber,
  opnameRef,
  varianceRows,
  varianceValue,
} from "~/lib/inventory/opname";
import { cn } from "~/lib/utils";

interface CountEntry {
  productId: number;
  counted: number | null; // null = belum dihitung
}

export interface OpnameCountProps {
  /** Called with the opname ref + the committed variance rows on confirm. */
  readonly onConfirm: (ref: string, reason: string) => void;
  readonly onCancel: () => void;
}

export function OpnameCount(props: OpnameCountProps) {
  const opnum = nextOpnameNumber();
  const ref = opnameRef(opnum);

  const [activeCat, setActiveCat] = createSignal<string>("all");
  const [counts, setCounts] = createSignal<Record<number, number | null>>({});
  const [reason, setReason] = createSignal("");

  const setCount = (id: number, raw: string) => {
    const n = raw === "" ? null : Number.parseInt(raw, 10);
    setCounts((prev) => ({ ...prev, [id]: Number.isFinite(n) && n !== null ? Math.max(0, n!) : null }));
  };

  const countedList = createMemo(() =>
    Object.entries(counts())
      .filter(([, c]) => c !== null)
      .map(([id, c]) => ({ productId: Number(id), counted: c! }))
  );

  const rows = createMemo(() => varianceRows(countedList()));
  const totalDiff = createMemo(() => rows().reduce((s, r) => s + r.diff, 0));
  const totalValue = createMemo(() => varianceValue(rows()));
  const withVariance = createMemo(() => rows().filter((r) => r.diff !== 0));

  const progress = createMemo(() => {
    const inCat = activeCat() === "all" ? products : products.filter((p) => p.category === activeCat());
    const done = inCat.filter((p) => counts()[p.id] !== null && counts()[p.id] !== undefined).length;
    return { done, total: inCat.length };
  });

  const catProgress = (catId: string) => {
    const inCat = products.filter((p) => p.category === catId);
    return `${inCat.filter((p) => counts()[p.id] != null).length}/${inCat.length}`;
  };

  const canConfirm = createMemo(() => reason().trim().length > 0 && countedList().length > 0);

  const diffState = (diff: number | null) =>
    diff === null ? "pending" : diff === 0 ? "match" : Math.abs(diff) <= 2 ? "small" : "big";

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div class="flex shrink-0 items-center justify-between border-border border-b px-4 py-3 lg:px-6">
        <div>
          <button class="font-medium text-body-sm text-muted-foreground" onClick={props.onCancel} type="button">
            ✕
          </button>
          <span class="ml-3 font-semibold text-body-sm text-foreground">
            Stock Opname {ref}
          </span>
        </div>
        <span class="font-medium text-caption-sm text-muted-foreground">
          {progress().done} / {progress().total} telah dihitung
        </span>
      </div>

      {/* Category pills w/ progress */}
      <div class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 py-2 lg:px-6">
        <button
          class={cn("rounded-full border-2 px-3 py-1.5 text-[13px]", activeCat() === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}
          onClick={() => setActiveCat("all")}
          type="button"
        >
          Semua {progress().done}/{progress().total}
        </button>
        <For each={categories}>
          {(c) => (
            <button
              class={cn("rounded-full border-2 px-3 py-1.5 text-[13px]", activeCat() === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground")}
              onClick={() => setActiveCat(c.id)}
              type="button"
            >
              {c.name} {catProgress(c.id)}
            </button>
          )}
        </For>
      </div>

      {/* Counting grid */}
      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-2 lg:px-6">
        <div class="mb-2 grid grid-cols-[1fr_64px_80px_64px] gap-2 px-2 font-medium text-caption-sm text-muted-foreground">
          <span>Produk</span>
          <span class="text-center">Sistem</span>
          <span class="text-center">Dihitung</span>
          <span class="text-center">Selisih</span>
        </div>
        <div class="overflow-hidden rounded-xl border border-border">
          <For each={products.filter((p) => activeCat() === "all" || p.category === activeCat())}>
            {(p, i) => {
              const system = () => currentStock(p.id);
              const counted = () => counts()[p.id] ?? null;
              const diff = () => (counted() === null ? null : counted()! - system());
              const st = () => diffState(diff());
              return (
                <div
                  class="grid grid-cols-[1fr_64px_80px_64px] items-center gap-2 border-border border-b p-2.5 last:border-b-0"
                  data-index={i()}
                >
                  <div class="min-w-0">
                    <p class="truncate font-semibold text-body-sm text-foreground">{p.name}</p>
                    <p class="text-caption-sm text-faint-foreground">{p.sku}</p>
                  </div>
                  <span class="text-center font-medium text-body-sm tabular-nums text-muted-foreground">{system()}</span>
                  <input
                    aria-label={`Dihitung ${p.name}`}
                    class="h-9 w-full rounded-md border border-border bg-muted text-center font-semibold text-[13px] text-foreground tabular-nums outline-none focus:border-primary"
                    inputMode="numeric"
                    onInput={(e) => setCount(p.id, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") focusNextInput(e.currentTarget);
                    }}
                    type="number"
                    value={counted() ?? ""}
                  />
                  <Show
                    fallback={<span class="text-center text-caption-sm text-faint-foreground">⏳</span>}
                    when={counted() !== null}
                  >
                    <span
                      class={cn(
                        "text-center font-semibold text-body-sm tabular-nums",
                        st() === "match" && "text-success",
                        st() === "small" && "text-warning",
                        st() === "big" && "text-danger"
                      )}
                    >
                      {diff()! > 0 ? "+" : ""}
                      {diff()}
                    </span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Summary + actions */}
      <div class="shrink-0 space-y-2 border-border border-t px-4 py-3 lg:px-6">
        <div class="flex items-center justify-between font-medium text-body-sm">
          <span class="text-muted-foreground">
            {countedList().length} dihitung · {withVariance().length} ada selisih
          </span>
          <span class="tabular-nums text-foreground">
            Total selisih:{" "}
            <span class={totalDiff() < 0 ? "text-danger" : "text-foreground"}>
              {totalDiff() > 0 ? "+" : ""}
              {totalDiff()} ({formatRupiah(totalValue(), { prefix: true })})
            </span>
          </span>
        </div>
        <input
          class="h-10 w-full rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary"
          onInput={(e) => setReason(e.currentTarget.value)}
          placeholder="Alasan opname (wajib)..."
          type="text"
        />
        <p class="text-caption-sm text-faint-foreground">
          ⚠ Tindakan ini akan menyesuaikan stok & tidak bisa dibatalkan. Setiap selisih direkam sebagai penyesuaian.
        </p>
        <div class="flex justify-end gap-2">
          <button class="rounded-md px-4 py-2 font-medium text-body-sm text-muted-foreground" onClick={props.onCancel} type="button">
            Batal
          </button>
          <button
            class="rounded-md bg-primary px-4 py-2 font-semibold text-body-sm text-primary-foreground disabled:opacity-40"
            disabled={!canConfirm()}
            onClick={() => props.onConfirm(ref, reason().trim())}
            type="button"
          >
            Selesai & Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

/** Focus the next empty counted input in DOM order (keyboard counting). */
function focusNextInput(current: HTMLInputElement) {
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[aria-label^="Dihitung "]')
  );
  const idx = all.indexOf(current);
  const next = all.slice(idx + 1).find((el) => el.value === "");
  (next ?? all[idx + 1])?.focus();
}
```

**Step 3: Write the page wrapper that owns confirm logic**

```tsx
// src/pages/inventory/pages/opname-new.tsx
import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { OpnameCount } from "../components/opname-count";
import { recordMovements } from "~/lib/inventory/store";
import { varianceRows } from "~/lib/inventory/opname";
import { currentStock } from "~/lib/inventory/store";

export default function InventoryOpnameNewPage() {
  const navigate = useNavigate();
  return (
    <SubPageShell
      backHref="/inventory?tab=opname"
      data-ssgoi-transition="/inventory/opname/new"
      title="Stock Opname"
    >
      <OpnameCount
        onCancel={() => navigate("/inventory?tab=opname")}
        onConfirm={(ref, reason) => {
          // Re-read counted from the DOM is wrong; instead the count state
          // lives in OpnameCount. Move confirm math into a callback that
          // receives rows — see note below.
          void ref;
          void reason;
        }}
      />
    </SubPageShell>
  );
}
```

> **IMPORTANT — fix the confirm wiring before committing.** The count state lives inside `OpnameCount`, but committing must call `recordMovements` at the page level (keep components dumb, logic in the page). **Refactor so `OpnameCount` exposes the rows via its `onConfirm`:**
> 1. Change `OpnameCountProps.onConfirm` to: `readonly onConfirm: (ref: string, reason: string, rows: VarianceRow[]) => void;` (import `VarianceRow` from `~/lib/inventory/opname`).
> 2. Inside `OpnameCount`'s confirm button `onClick`, call `props.onConfirm(ref, reason().trim(), rows())`.
> 3. Rewrite the page's `onConfirm` to actually record:
> ```tsx
> onConfirm={(ref, reason, rows) => {
>   recordMovements(
>     rows.map((r) => ({
>       productId: r.productId,
>       type: "stocktake" as const,
>       delta: r.diff,
>       reason: "lainnya" as const, // or map from a typed reason enum
>       ref,
>       note: reason,
>     }))
>   );
>   toast.success(`${ref} tersimpan`);
>   navigate("/inventory?tab=opname");
> }}
> ```
> Remove the now-unused `currentStock`/`varianceRows` imports from the page (they're used inside `OpnameCount`). Make the final `onConfirm` signature match.

**Step 4: Typecheck + smoke**

```bash
pnpm typecheck && pnpm dev
```
Visit `/inventory` → Opname tab → "Mulai Opname Baru" → counts update summary live → confirm writes stocktake movements → returns to Opname tab with the new entry listed. Verify the affected products' stock changed on the Dashboard.

**Step 5: Commit**

```bash
git add src/pages/inventory/components/opname-count.tsx src/pages/inventory/pages/opname-new.tsx src/routes.tsx src/components/layout/app-shell/index.tsx
git commit -m "feat(inventory): stock opname counting + confirm flow"
```

---

## Phase 5 — Penerimaan Barang (restock)

> Mirror of Opname: a **Terima tab** (Screen F) + a **full-screen receive flow** at `/inventory/terima/new` (Screen G). Restocks write `type: "restock"` movements with `delta: +qty`, optional `supplier`, `ref` (PO), and `costPrice`.

### Task 5.1: Terima helpers — list receipts + numbering

**Files:**
- Create: `src/lib/inventory/terima.ts`
- Test: `src/lib/inventory/__test__/terima.test.ts`

**Step 1: Write the failing test**

```ts
// src/lib/inventory/__test__/terima.test.ts
import { describe, expect, it } from "vitest";
import { recordMovements, resetInventoryStore } from "./store";
import { listReceipts, nextReceiptNumber, receiptRef } from "../terima";

describe("terima helpers", () => {
  it("receiptRef pads to 4 digits", () => {
    expect(receiptRef(1)).toBe("TRX-0001");
    expect(receiptRef(42)).toBe("TRX-0042");
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
      { productId: 1, type: "restock", delta: 50, ref: "TRX-0001", costPrice: 18000 },
      { productId: 2, type: "restock", delta: 30, ref: "TRX-0001", costPrice: 12000 },
      { productId: 1, type: "restock", delta: 10, ref: "TRX-0002", costPrice: 18000 },
    ]);
    const list = listReceipts();
    expect(list[0].ref).toBe("TRX-0002");
    expect(list[1].ref).toBe("TRX-0001");
    expect(list[1].itemCount).toBe(2);
    expect(list[1].totalQty).toBe(80);
    expect(list[1].totalCost).toBe(50 * 18000 + 30 * 12000);
  });
});
```

**Step 2: Run to verify it fails**

```bash
pnpm test src/lib/inventory/__test__/terima.test.ts
```

**Step 3: Write the implementation**

```ts
// src/lib/inventory/terima.ts
import { getMovements } from "./store";
import type { Movement } from "./types";

const TRX_RE = /^TRX-(\d+)$/;

export function receiptRef(n: number): string {
  return `TRX-${String(n).padStart(4, "0")}`;
}

export function nextReceiptNumber(): number {
  let max = 0;
  for (const m of getMovements()) {
    const match = m.ref?.match(TRX_RE);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return max + 1;
}

export interface ReceiptSummary {
  readonly ref: string;
  readonly createdAt: number;
  readonly supplier?: string;
  readonly itemCount: number;
  readonly totalQty: number;
  readonly totalCost: number;
  readonly movements: Movement[];
}

export function listReceipts(): ReceiptSummary[] {
  const map = new Map<string, Movement[]>();
  for (const m of getMovements()) {
    if (m.type !== "restock" || !m.ref) continue;
    (map.get(m.ref) ?? map.set(m.ref, []).get(m.ref)!).push(m);
  }
  return [...map.entries()]
    .map(([ref, ms]) => ({
      ref,
      createdAt: ms[0].createdAt,
      supplier: ms[0].supplier,
      itemCount: new Set(ms.map((m) => m.productId)).size,
      totalQty: ms.reduce((s, m) => s + m.delta, 0),
      totalCost: ms.reduce((s, m) => s + m.delta * (m.costPrice ?? 0), 0),
      movements: ms,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}
```

**Step 4: Run to verify it passes**

```bash
pnpm test src/lib/inventory/__test__/terima.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/inventory/terima.ts src/lib/inventory/__test__/terima.test.ts
git commit -m "feat(inventory): terima helpers (receipt list + numbering)"
```

---

### Task 5.2: `TerimaTab` — past receipts list (Screen F)

**Files:**
- Create: `src/pages/inventory/components/terima-tab.tsx`

**Step 1: Write the component** (mirror of `OpnameTab`):

```tsx
// src/pages/inventory/components/terima-tab.tsx
import { useNavigate } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { listReceipts } from "~/lib/inventory/terima";
import { formatRupiah } from "~/lib/utils";

const dateLabel = (ts: number) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts));

export function TerimaTab() {
  const navigate = useNavigate();
  const receipts = createMemo(() => listReceipts());

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="shrink-0 px-4 pt-4 lg:px-6">
        <Button
          class="w-full"
          look="solid"
          onClick={() => navigate("/inventory/terima/new")}
          tone="primary"
          type="button"
        >
          ➕ Terima Barang Baru
        </Button>
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
        <p class="mb-2 font-semibold text-caption-sm text-muted-foreground">Riwayat Penerimaan</p>
        <Show
          fallback={<p class="py-16 text-center text-body-sm text-muted-foreground">Belum ada penerimaan</p>}
          when={receipts().length > 0}
        >
          <div class="overflow-hidden rounded-xl border border-border">
            <For each={receipts()}>
              {(r) => (
                <div class="flex items-center gap-3 border-border border-b p-3 last:border-b-0">
                  <span class="text-lg">📦</span>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-body-sm text-foreground">{r.ref}</p>
                    <p class="text-caption-sm text-muted-foreground">
                      {r.supplier ?? "Tanpa supplier"} · {r.itemCount} item · {dateLabel(r.createdAt)}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-semibold text-body-sm tabular-nums text-foreground">+{r.totalQty}</p>
                    <p class="text-caption-sm text-faint-foreground">{formatRupiah(r.totalCost)}</p>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/inventory/components/terima-tab.tsx
git commit -m "feat(inventory): add Terima list tab"
```

---

### Task 5.3: Receive flow — `/inventory/terima/new` (Screen G)

**Files:**
- Create: `src/pages/inventory/components/terima-receive.tsx`
- Create: `src/pages/inventory/pages/terima-new.tsx`
- Modify: `src/routes.tsx` (register route — the `INVENTORY_FORM_RE` from Task 4.3 already covers the zone)

**Behavior:**
- Header fields: Supplier (text input), No. PO (optional text), Tanggal (default today).
- Line items: a list of selected products, each with qty stepper + harga beli (cost price) input + subtotal. Start empty; `➕ Tambah item dari katalog` opens a simple product picker (reuse `PickerField` or a `Sheet`-based multi-select — keep MVP: a `Sheet` listing products with checkboxes).
- Footer: catatan, total qty + total cost, `Batal` / `Simpan Penerimaan`.
- On save: `recordMovements` with `type: "restock"`, `delta: qty`, `costPrice`, `supplier`, `ref: receiptRef(n)`, `note`, then navigate back to `?tab=terima`.

**Step 1: Register the route** in `src/routes.tsx`:

```tsx
import InventoryTerimaNewPage from "./pages/inventory/pages/terima-new";
// ...
<Route component={InventoryTerimaNewPage} path="/inventory/terima/new" />
```

**Step 2: Write the receive component**

```tsx
// src/pages/inventory/components/terima-receive.tsx
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { Sheet } from "~/components/ui/sheet";
import { products } from "~/lib/data/catalog";
import { currentStock } from "~/lib/inventory/store";
import { nextReceiptNumber, receiptRef } from "~/lib/inventory/terima";
import { formatRupiah } from "~/lib/utils";

interface LineItem {
  productId: number;
  qty: number;
  costPrice: number;
}

export interface TerimaReceiveProps {
  readonly onConfirm: (input: {
    ref: string;
    supplier: string | undefined;
    note: string | undefined;
    items: { productId: number; qty: number; costPrice: number }[];
  }) => void;
  readonly onCancel: () => void;
}

export function TerimaReceive(props: TerimaReceiveProps) {
  const ref = receiptRef(nextReceiptNumber());
  const [supplier, setSupplier] = createSignal("");
  const [po, setPo] = createSignal("");
  const [note, setNote] = createSignal("");
  const [items, setItems] = createSignal<LineItem[]>([]);
  const [pickerOpen, setPickerOpen] = createSignal(false);

  const addProduct = (productId: number) => {
    setItems((prev) =>
      prev.some((i) => i.productId === productId)
        ? prev
        : [...prev, { productId, qty: 1, costPrice: 0 }]
    );
    setPickerOpen(false);
  };

  const updateItem = (productId: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, ...patch } : i)));
  const removeItem = (productId: number) =>
    setItems((prev) => prev.filter((i) => i.productId !== productId));

  const totalQty = createMemo(() => items().reduce((s, i) => s + i.qty, 0));
  const totalCost = createMemo(() => items().reduce((s, i) => s + i.qty * i.costPrice, 0));
  const canSave = createMemo(() => items().length > 0);

  const productName = (id: number) => products.find((p) => p.id === id)?.name ?? "—";
  const productUnit = (id: number) => products.find((p) => p.id === id)?.unit ?? "";

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center justify-between border-border border-b px-4 py-3 lg:px-6">
        <button class="font-medium text-body-sm text-muted-foreground" onClick={props.onCancel} type="button">
          ✕
        </button>
        <span class="font-semibold text-body-sm text-foreground">Terima Barang {ref}</span>
        <span />
      </div>

      <div class="scrollbar-none flex-1 overflow-y-auto px-4 py-3 lg:px-6">
        <div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption-sm text-muted-foreground">Supplier</span>
            <input class="h-10 rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary" onInput={(e) => setSupplier(e.currentTarget.value)} placeholder="Toko Kopi Maju Jaya" type="text" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption-sm text-muted-foreground">No. PO (opsional)</span>
            <input class="h-10 rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary" onInput={(e) => setPo(e.currentTarget.value)} placeholder="PO-2026-0042" type="text" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-medium text-caption-sm text-muted-foreground">Tanggal</span>
            <input class="h-10 rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary" disabled type="text" value={new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(new Date())} />
          </label>
        </div>

        <div class="overflow-hidden rounded-xl border border-border">
          <For each={items()} fallback={<p class="p-4 text-center text-body-sm text-muted-foreground">Belum ada item. Ketuk "Tambah item".</p>}>
            {(it) => (
              <div class="border-border border-b p-3 last:border-b-0">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-semibold text-body-sm text-foreground">{productName(it.productId)}</p>
                    <p class="text-caption-sm text-faint-foreground">stok saat ini: {currentStock(it.productId)} {productUnit(it.productId)}</p>
                  </div>
                  <button class="text-caption-sm text-danger" onClick={() => removeItem(it.productId)} type="button">✕ hapus</button>
                </div>
                <div class="mt-2 flex items-center gap-3">
                  <QuantityStepper
                    ariaLabel={`Qty ${productName(it.productId)}`}
                    editable
                    onDecrement={() => updateItem(it.productId, { qty: Math.max(1, it.qty - 1) })}
                    onIncrement={() => updateItem(it.productId, { qty: it.qty + 1 })}
                    onInput={(v) => updateItem(it.productId, { qty: Math.max(1, v) })}
                    value={it.qty}
                  />
                  <label class="flex flex-1 items-center gap-1.5">
                    <span class="text-caption-sm text-muted-foreground">Harga beli</span>
                    <input
                      class="h-9 flex-1 rounded-md border border-border bg-muted px-2 text-right text-body-sm tabular-nums outline-none focus:border-primary"
                      inputMode="numeric"
                      onInput={(e) => updateItem(it.productId, { costPrice: Number.parseInt(e.currentTarget.value, 10) || 0 })}
                      placeholder="0"
                      type="number"
                      value={it.costPrice || ""}
                    />
                  </label>
                  <span class="w-24 text-right font-semibold text-body-sm tabular-nums text-foreground">
                    {formatRupiah(it.qty * it.costPrice)}
                  </span>
                </div>
              </div>
            )}
          </For>
        </div>

        <button
          class="mt-2 w-full rounded-xl border-2 border-border border-dashed py-2.5 font-medium text-body-sm text-muted-foreground hover:border-primary/30"
          onClick={() => setPickerOpen(true)}
          type="button"
        >
          ➕ Tambah item dari katalog
        </button>

        <label class="mt-3 block">
          <span class="font-medium text-caption-sm text-muted-foreground">Catatan</span>
          <input class="mt-1 h-10 w-full rounded-md border border-border bg-card px-3 text-body-sm outline-none focus:border-primary" onInput={(e) => setNote(e.currentTarget.value)} type="text" />
        </label>
      </div>

      <div class="flex shrink-0 items-center justify-between border-border border-t px-4 py-3 lg:px-6">
        <div class="font-medium text-body-sm">
          <span class="text-muted-foreground">{totalQty()} item · </span>
          <span class="tabular-nums text-foreground">{formatRupiah(totalCost())}</span>
        </div>
        <div class="flex gap-2">
          <Button look="outline" onClick={props.onCancel} tone="neutral" type="button">Batal</Button>
          <Button
            disabled={!canSave()}
            look="solid"
            onClick={() =>
              props.onConfirm({
                ref,
                supplier: supplier().trim() || undefined,
                note: [po().trim(), note().trim()].filter(Boolean).join(" · ") || undefined,
                items: items().map((i) => ({ productId: i.productId, qty: i.qty, costPrice: i.costPrice })),
              })
            }
            tone="primary"
            type="button"
          >
            Simpan Penerimaan
          </Button>
        </div>
      </div>

      {/* Product picker */}
      <Sheet onOpenChange={setPickerOpen} open={pickerOpen()}>
        {() => (
          <div class="max-h-[60vh] overflow-y-auto p-2">
            <For each={products.filter((p) => !items().some((i) => i.productId === p.id))}>
              {(p) => (
                <button
                  class="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                  onClick={() => addProduct(p.id)}
                  type="button"
                >
                  <div>
                    <p class="font-semibold text-body-sm text-foreground">{p.name}</p>
                    <p class="text-caption-sm text-faint-foreground">{p.sku} · {formatRupiah(p.price)}</p>
                  </div>
                  <span class="text-primary">＋</span>
                </button>
              )}
            </For>
          </div>
        )}
      </Sheet>
    </div>
  );
}
```

**Step 3: Write the page wrapper**

```tsx
// src/pages/inventory/pages/terima-new.tsx
import { useNavigate } from "@solidjs/router";
import { toast } from "solid-sonner";
import { SubPageShell } from "~/components/layout/sub-page-shell/sub-page-shell";
import { TerimaReceive } from "../components/terima-receive";
import { recordMovements } from "~/lib/inventory/store";

export default function InventoryTerimaNewPage() {
  const navigate = useNavigate();
  return (
    <SubPageShell
      backHref="/inventory?tab=terima"
      data-ssgoi-transition="/inventory/terima/new"
      title="Terima Barang"
    >
      <TerimaReceive
        onCancel={() => navigate("/inventory?tab=terima")}
        onConfirm={({ ref, supplier, note, items }) => {
          recordMovements(
            items.map((i) => ({
              productId: i.productId,
              type: "restock" as const,
              delta: i.qty,
              costPrice: i.costPrice,
              supplier,
              ref,
              note,
            }))
          );
          toast.success(`${ref} tersimpan`);
          navigate("/inventory?tab=terima");
        }}
      />
    </SubPageShell>
  );
}
```

**Step 4: Typecheck + smoke**

```bash
pnpm typecheck && pnpm dev
```
Visit `/inventory` → Terima tab → "Terima Barang Baru" → add items, set qty + cost → save → receipt appears in Terima tab; dashboard stock increased; Riwayat shows the 📦 entries.

**Step 5: Commit**

```bash
git add src/pages/inventory/components/terima-receive.tsx src/pages/inventory/pages/terima-new.tsx src/routes.tsx
git commit -m "feat(inventory): penerimaan barang receive flow"
```

---

## Phase 6 — Kill the duplicate source of truth

### Task 6.1: Remove the editable stock field from the product edit form

**Files:**
- Modify: `src/pages/catalog/product-form.tsx`

**Rationale (from review):** stock is editable in two places (catalog form + inventory). Decide: catalog sets **initial** stock only (on create); ongoing changes happen in Inventory via movements. On **edit**, the stock field is removed and replaced with a read-only note linking to `/inventory`.

**Step 1:** In `product-form.tsx`:
- Delete the `stock` signal and its `NumberField` block.
- The create flow needs initial stock still — keep a single `initialStock` signal that only renders when `!isEditing()`.
- When `isEditing()`, replace the stock field with an info note:

```tsx
<Show
  when={!isEditing()}
  fallback={
    <div class="flex flex-col gap-1.5">
      <span class={labelClass}>Stok</span>
      <p class="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-body-sm text-muted-foreground">
        Stok dikelola di menu <A class="font-medium text-primary" href="/inventory">Stok</A>.
      </p>
    </div>
  }
>
  <NumberField class="gap-1.5">
    <NumberFieldLabel>Stok Awal</NumberFieldLabel>
    <NumberFieldInput
      onChange={(v) => setInitialStock(v > 0 ? String(v) : "")}
      placeholder="50"
      value={initialStock() ? Number.parseInt(initialStock(), 10) : 0}
    />
  </NumberField>
</Show>
```

- Ensure `A` is imported from `@solidjs/router` (it already is).
- The `handleSave` no longer validates stock (it's optional on create). Leave existing validations for name/sku/category/price.

**Step 2: Typecheck + smoke** the catalog create/edit flow.

```bash
pnpm typecheck && pnpm dev
```
Open `/catalog/product/new` → "Stok Awal" field shows. Open an existing product → read-only note with link to `/inventory`.

**Step 3: Commit**

```bash
git add src/pages/catalog/product-form.tsx
git commit -m "refactor(catalog): stock field initial-only on create; edit links to Inventory"
```

---

## Final verification

```bash
pnpm test          # all unit tests pass
pnpm typecheck     # no TS errors
pnpm lint          # ultracite clean
pnpm dev           # manual: Dashboard +/− opens sheet; Opname + Terima flows commit; Riwayat shows all; Catalog edit has no stock field
```

**Manual acceptance checklist:**
- [ ] Dashboard stat cards reflect ledger state; tapping "Stok Rendah"/"Habis" filters the list.
- [ ] Row +/− opens Adjustment Sheet; saving shows in Riwayat as 🔧 with reason + user.
- [ ] "Mulai Stock Opname" → count → confirm → stock changes + new OPN-### in Opname tab + 📋 rows in Riwayat.
- [ ] "Terima Barang" → add items → save → stock rises + TRX-#### in Terima tab + 📦 rows in Riwayat.
- [ ] Switching Inventory tabs via URL (`?tab=`) works and survives navigation back from flows.
- [ ] Catalog edit product shows read-only stock note linking to `/inventory`.
- [ ] Stock never goes negative (adjustment beyond balance clamps to 0).

---

## Out of scope (explicit follow-ups)

- **Automatic sale movements (`type: "sale`)**: wiring the POS checkout to decrement stock via `recordMovement`. The model supports it; the Kasir flow doesn't call it yet.
- **Per-product `minStock` / reorder points**: currently hardcoded `min = 10`. Add a field to `Product` later.
- **Persistence**: ledger is in-memory (module singleton). Migrate to `baresync`/SQLite when ready — the store's public API (`recordMovement(s)`, `getMovements`, `currentStock`) stays stable; only seeding + backing changes.
- **Draft opname / multi-session counting**: the current flow commits in one sitting.
- **Supplier + PO management entities**: currently free-text fields.
