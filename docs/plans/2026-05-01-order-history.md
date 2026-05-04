# Order History Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement order history view with expandable order cards, date/status filters, daily summary, and cancel action.

**Architecture:** Single page at `/orders` with a summary bar at top, filter controls below, and a chronological list of expandable order cards. Data layer queries orders joined with users (for cashier name) and order_items (for line items). Cancel action updates order status via Drizzle.

**Tech Stack:** SolidJS (`createResource`, `createSignal`, `For`, `Show`), Drizzle ORM (joins, filters), TailwindCSS, existing `ConfirmDrawer`, `Select`, `PageHeader` components.

---

## Task 1: DB — Order history queries (`src/db/orders.ts`)

Add query functions to the existing `src/db/orders.ts`.

**Files:**
- Modify: `src/db/orders.ts`

**Step 1: Add order history types and query functions**

Append to `src/db/orders.ts`:

```typescript
import { and, desc, eq, gte, like, lt, sql } from "drizzle-orm";
import { orderItems, orders, users } from "./schema";

export type OrderRow = {
  amountPaid: number | null;
  changeAmount: number | null;
  createdAt: string;
  id: number;
  orderNumber: string;
  paymentMethod: "cash" | "qris";
  status: "completed" | "cancelled";
  total: number;
  userId: number;
  userName: string;
};

export type OrderItemRow = {
  id: number;
  productName: string;
  quantity: number;
  subtotal: number;
  unitPrice: number;
};

export type OrderWithItems = OrderRow & { items: OrderItemRow[] };

export async function getOrders(filter: {
  dateFrom?: string;
  dateTo?: string;
  status?: "completed" | "cancelled";
}): Promise<OrderRow[]> {
  const conditions = [];
  if (filter.status) {
    conditions.push(eq(orders.status, filter.status));
  }
  if (filter.dateFrom) {
    conditions.push(gte(orders.createdAt, filter.dateFrom));
  }
  if (filter.dateTo) {
    const nextDay = new Date(filter.dateTo);
    nextDay.setDate(nextDay.getDate() + 1);
    conditions.push(lt(orders.createdAt, nextDay.toISOString().slice(0, 10)));
  }

  const rows = await db
    .select({
      amountPaid: orders.amountPaid,
      changeAmount: orders.changeAmount,
      createdAt: orders.createdAt,
      id: orders.id,
      orderNumber: orders.orderNumber,
      paymentMethod: orders.paymentMethod,
      status: orders.status,
      total: orders.total,
      userId: orders.userId,
      userName: users.name,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt));

  return rows.map((r) => ({
    ...r,
    paymentMethod: r.paymentMethod as "cash" | "qris",
    status: r.status as "completed" | "cancelled",
  }));
}

export async function getOrderItems(orderId: number): Promise<OrderItemRow[]> {
  return await db
    .select({
      id: orderItems.id,
      productName: orderItems.productName,
      quantity: orderItems.quantity,
      subtotal: orderItems.subtotal,
      unitPrice: orderItems.unitPrice,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
}

export async function cancelOrder(orderId: number): Promise<void> {
  await db
    .update(orders)
    .set({ status: "cancelled", updatedAt: new Date().toISOString() })
    .where(eq(orders.id, orderId));
}

export type DailySummary = {
  cashTotal: number;
  orderCount: number;
  qrisTotal: number;
  totalRevenue: number;
};

export async function getDailySummary(date: string): Promise<DailySummary> {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().slice(0, 10);

  const rows = await db
    .select({
      cashTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'cash' THEN ${orders.total} ELSE 0 END), 0)`,
      orderCount: sql<number>`CAST(COUNT(*) AS INTEGER)`,
      qrisTotal: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentMethod} = 'qris' THEN ${orders.total} ELSE 0 END), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${orders.total}), 0)`,
    })
    .from(orders)
    .where(
      and(
        gte(orders.createdAt, date),
        lt(orders.createdAt, nextDayStr),
        eq(orders.status, "completed"),
      ),
    );

  return rows[0] ?? { cashTotal: 0, orderCount: 0, qrisTotal: 0, totalRevenue: 0 };
}
```

Note: The existing imports in the file need updating. The full import line for drizzle-orm operators should be:
```typescript
import { and, desc, eq, gte, like, lt, sql } from "drizzle-orm";
```
And schema imports need `orderItems` and `users` added:
```typescript
import { categories, orderItems, orders, products, users } from "./schema";
```

**Step 2: Run lint fix**

```bash
bun x ultracite fix
```

**Step 3: Commit**

```bash
git add src/db/orders.ts
git commit -m "feat: add order history queries to orders data layer"
```

---

## Task 2: OrderCard component (`src/components/order-card.tsx`)

**Files:**
- Create: `src/components/order-card.tsx`

**Step 1: Create expandable order card component**

```tsx
import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { formatIDR } from "~/lib/utils";
import type { OrderRow, OrderItemRow } from "~/db/orders";
import { cn } from "~/lib/utils";

interface OrderCardProps {
  items: OrderItemRow[];
  onCancel?: () => void;
  order: OrderRow;
}

const OrderCard: Component<OrderCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const time = () => {
    const d = new Date(props.order.createdAt);
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div class="rounded-xl border  bg-card">
      <button
        class="flex w-full items-center gap-3 p-3 text-left active:bg-accent/80"
        onClick={() => setExpanded(!expanded())}
        type="button"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="font-medium text-sm">{props.order.orderNumber}</span>
            <span class="text-muted-foreground text-xs">{time()}</span>
          </div>
          <div class="text-muted-foreground text-xs">{props.order.userName}</div>
        </div>
        <div class="flex items-center gap-2">
          <span
            class={cn(
              "shrink-0 rounded-full px-2 py-0.5 font-medium text-xs",
              props.order.status === "completed"
                ? "bg-success text-success-foreground"
                : "bg-destructive text-destructive-foreground"
            )}
          >
            {props.order.status === "completed" ? "Selesai" : "Batal"}
          </span>
          <span class="font-semibold text-sm">{formatIDR(props.order.total)}</span>
        </div>
      </button>

      <Show when={expanded()}>
        <div class=" border-t px-3 pb-3">
          <div class="py-2">
            <For each={props.items}>
              {(item) => (
                <div class="flex justify-between py-1 text-sm">
                  <span class="truncate">
                    {item.productName} ×{item.quantity}
                  </span>
                  <span class="shrink-0 text-muted-foreground">
                    {formatIDR(item.subtotal)}
                  </span>
                </div>
              )}
            </For>
          </div>

          <div class=" border-t py-2">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Metode</span>
              <span class="font-medium">
                {props.order.paymentMethod === "cash" ? "Tunai" : "QRIS"}
              </span>
            </div>
            <Show when={props.order.paymentMethod === "cash" && props.order.amountPaid != null}>
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">Dibayar</span>
                <span>{formatIDR(props.order.amountPaid!)}</span>
              </div>
              <Show when={props.order.changeAmount != null && props.order.changeAmount > 0}>
                <div class="flex justify-between text-sm">
                  <span class="text-muted-foreground">Kembalian</span>
                  <span>{formatIDR(props.order.changeAmount!)}</span>
                </div>
              </Show>
            </Show>
          </div>

          <Show when={props.onCancel && props.order.status === "completed"}>
            <button
              class="mt-1 w-full rounded-lg border border-destructive/30 py-2 font-medium text-destructive text-sm active:bg-destructive/10"
              onClick={props.onCancel}
              type="button"
            >
              Batalkan Pesanan
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export { OrderCard };
```

**Step 2: Commit**

```bash
git add src/components/order-card.tsx
git commit -m "feat: add OrderCard component with expandable details and cancel action"
```

---

## Task 3: DailySummary component (`src/components/daily-summary.tsx`)

**Files:**
- Create: `src/components/daily-summary.tsx`

**Step 1: Create daily summary bar**

```tsx
import type { Component } from "solid-js";
import { Show } from "solid-js";
import type { DailySummary } from "~/db/orders";
import { formatIDR } from "~/lib/utils";

interface DailySummaryBarProps {
  data: DailySummary | undefined;
}

const DailySummaryBar: Component<DailySummaryBarProps> = (props) => {
  return (
    <Show when={props.data}>
      {(data) => (
        <div class="grid grid-cols-3 gap-2 rounded-xl bg-card border  p-3">
          <div class="text-center">
            <p class="font-bold text-lg">{data().orderCount}</p>
            <p class="text-muted-foreground text-xs">Pesanan</p>
          </div>
          <div class="text-center">
            <p class="font-bold text-lg text-primary">{formatIDR(data().totalRevenue)}</p>
            <p class="text-muted-foreground text-xs">Total</p>
          </div>
          <div class="text-center">
            <p class="text-muted-foreground text-xs">Tunai / QRIS</p>
            <p class="text-xs">
              <span class="font-medium">{formatIDR(data().cashTotal)}</span>
              {" / "}
              <span class="font-medium">{formatIDR(data().qrisTotal)}</span>
            </p>
          </div>
        </div>
      )}
    </Show>
  );
};

export { DailySummaryBar };
```

**Step 2: Commit**

```bash
git add src/components/daily-summary.tsx
git commit -m "feat: add DailySummaryBar component for order history"
```

---

## Task 4: Order History page (`src/pages/order-history.tsx`)

Replace the placeholder page with the full implementation.

**Files:**
- Modify: `src/pages/order-history.tsx`

**Step 1: Replace `src/pages/order-history.tsx`**

```tsx
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { DailySummaryBar } from "~/components/daily-summary";
import { OrderCard } from "~/components/order-card";
import { Select, type SelectOption } from "~/components/ui/select";
import {
  cancelOrder,
  getDailySummary,
  getOrderItems,
  getOrders,
  type OrderRow,
  type OrderItemRow,
} from "~/db/orders";
import { currentUserRole } from "~/lib/auth";
import { cn, formatIDR } from "~/lib/utils";

const statusOptions: SelectOption[] = [
  { label: "Semua", value: "" },
  { label: "Selesai", value: "completed" },
  { label: "Batal", value: "cancelled" },
];

export default function OrderHistory() {
  const today = () => new Date().toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = createSignal(today());
  const [dateTo, setDateTo] = createSignal(today());
  const [statusFilter, setStatusFilter] = createSignal<string>("");

  const filter = createMemo(() => ({
    dateFrom: dateFrom(),
    dateTo: dateTo(),
    status: statusFilter() === "" ? undefined : (statusFilter() as "completed" | "cancelled"),
  }));

  const [orders, { refetch }] = createResource(filter, getOrders);
  const [summary] = createResource(dateFrom, getDailySummary);

  const [expandedOrderId, setExpandedOrderId] = createSignal<number | null>(null);
  const [orderItemsCache, setOrderItemsCache] = createSignal<Record<number, OrderItemRow[]>>({});
  const [cancelTarget, setCancelTarget] = createSignal<OrderRow | undefined>();

  const canCancel = () => {
    const role = currentUserRole();
    return role === "owner" || role === "manager";
  };

  const toggleExpand = async (order: OrderRow) => {
    if (expandedOrderId() === order.id) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(order.id);
    if (!orderItemsCache()[order.id]) {
      const items = await getOrderItems(order.id);
      setOrderItemsCache((prev) => ({ ...prev, [order.id]: items }));
    }
  };

  const handleCancel = async () => {
    const target = cancelTarget();
    if (!target) return;
    await cancelOrder(target.id);
    setCancelTarget(undefined);
    setOrderItemsCache((prev) => {
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
    await refetch();
  };

  return (
    <div class="flex h-full flex-col">
      <div class=" border-b bg-card px-4 py-3">
        <h1 class="font-semibold text-lg">Riwayat Pesanan</h1>
      </div>

      <div class="space-y-3 overflow-y-auto p-4">
        <DailySummaryBar data={summary()} />

        <div class="flex items-center gap-2">
          <input
            class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
            max={today()}
            onChange={(e) => setDateFrom(e.currentTarget.value)}
            type="date"
            value={dateFrom()}
          />
          <span class="text-muted-foreground text-sm">s/d</span>
          <input
            class="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
            max={today()}
            onChange={(e) => setDateTo(e.currentTarget.value)}
            type="date"
            value={dateTo()}
          />
          <div class="w-28">
            <Select
              onChange={(v) => setStatusFilter(String(v))}
              options={statusOptions}
              value={statusFilter()}
            />
          </div>
        </div>

        <Show
          fallback={
            <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>Belum ada pesanan</p>
            </div>
          }
          when={orders() && orders()!.length > 0}
        >
          <div class="space-y-2">
            <For each={orders()}>
              {(order) => (
                <OrderCard
                  items={orderItemsCache()[order.id] ?? []}
                  onCancel={
                    canCancel()
                      ? () => setCancelTarget(order)
                      : undefined
                  }
                  order={order}
                />
              )}
            </For>
          </div>
        </Show>
      </div>

      <ConfirmDrawer
        confirmLabel="Batalkan"
        message={`Batalkan pesanan ${cancelTarget()?.orderNumber}?`}
        onClose={() => setCancelTarget(undefined)}
        onConfirm={handleCancel}
        open={!!cancelTarget()}
        title="Batalkan Pesanan"
        variant="destructive"
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/order-history.tsx
git commit -m "feat: implement Order History page with filters, summary, and cancel"
```

---

## Task 5: Update MILESTONES.md and verify

**Files:**
- Modify: `docs/MILESTONES.md`

**Step 1: Mark Milestone 6 items as complete**

Update Milestone 6 section to check all boxes:

```markdown
## Milestone 6: Order History ✅

View and browse past orders.

- [x] Create `src/pages/order-history.tsx`
- [x] Order list: date, order number, total, payment method, cashier name, status badge
- [x] Default view: today's orders
- [x] Date range filter (simple date inputs)
- [x] Status filter (all / completed / cancelled)
- [x] Create `src/components/order-card.tsx` — expandable order card
  - [x] Header: order number, time, total, status
  - [x] Expanded: line items (product name, qty, unit price, subtotal)
  - [x] Payment details: method, amount paid, change
  - [x] Cashier name
- [x] Daily summary bar at top: total orders count, total revenue, cash vs QRIS breakdown
- [x] Cancel order action (owner/manager only) — sets status to `cancelled`
```

**Step 2: Run lint, typecheck, tests**

```bash
bun x ultracite fix
bun x tsc --noEmit
bun test --path-ignore-patterns 'docs/external/**'
```

**Step 3: Commit**

```bash
git add docs/MILESTONES.md
git commit -m "docs: mark Milestone 6 complete in MILESTONES.md"
```

---

## Key Design Decisions

1. **Lazy-load order items** — Items are only fetched when a card is expanded, cached in a signal map. Avoids loading all items for all orders upfront.

2. **Date inputs use native `<input type="date">`** — Mobile browsers provide good date pickers. No need for custom date component.

3. **Summary queries only completed orders** — `getDailySummary` filters by `status = 'completed'` so cancelled orders don't inflate revenue.

4. **Cancel restricted to owner/manager** — `canCancel()` checks `currentUserRole()`. The cancel button is hidden entirely for cashiers (not just disabled).

5. **Order card items cached** — `orderItemsCache` signal prevents re-fetching items when expanding/collapsing the same order. Cache is cleared on cancel (since the order might change).

6. **Order data layer extends existing file** — `src/db/orders.ts` already exists from Milestone 5. We add query functions to it rather than creating a new file.
