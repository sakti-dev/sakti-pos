# POS Ordering Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the complete POS ordering flow — browse products by category, manage cart, checkout with cash/QRIS payment, and persist orders to SQLite.

**Architecture:** The POS page is a full-screen mobile layout with three layers: category tabs at top, scrollable product grid in the middle, and a collapsible cart drawer at the bottom. Cart state lives in a SolidJS reactive store (`src/lib/cart.ts`). Order submission wraps multiple SQL statements in a Rust-side transaction via a new `run_sql_batch` command.

**Tech Stack:** SolidJS (reactive stores, `createResource`, `For`), Drizzle ORM (sqlite-proxy), Rust/sqlx (transaction support), TailwindCSS, `@corvu/drawer` (cart slide-up).

---

## Task 1: Rust — Add `run_sql_batch` command for transactions

Order creation requires inserting into `orders` + multiple `order_items` in a single transaction. The current `run_sql` command creates a new pool connection per call and executes a single statement. We need a batch variant.

**Files:**
- Modify: `src-tauri/src/drizzle_proxy.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add `run_sql_batch` command to `drizzle_proxy.rs`**

Append to `src-tauri/src/drizzle_proxy.rs`:

```rust
#[derive(Debug, Deserialize)]
pub struct SqlStatement {
    pub sql: String,
    pub params: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct BatchResult {
    pub last_insert_id: i64,
    pub rows_affected: u64,
}

#[command]
pub async fn run_sql_batch(
    app: AppHandle,
    statements: Vec<SqlStatement>,
) -> Result<BatchResult, String> {
    let db_path = get_app_db_path(&app)?;
    let uri = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePool::connect(&uri)
        .await
        .map_err(|e| format!("Failed to connect to DB: {}", e))?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    let mut last_insert_id: i64 = 0;
    let mut total_rows_affected: u64 = 0;

    for stmt in &statements {
        let mut q = sqlx::query(&stmt.sql);
        for param in &stmt.params {
            q = bind_value(q, param);
        }
        let result = q
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Batch statement failed: {}", e))?;
        last_insert_id = result.last_insert_rowid();
        total_rows_affected += result.rows_affected();
    }

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(BatchResult {
        last_insert_id,
        rows_affected: total_rows_affected,
    })
}
```

**Step 2: Register the new command in `lib.rs`**

Change the `invoke_handler` line in `src-tauri/src/lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    drizzle_proxy::run_sql,
    drizzle_proxy::run_sql_batch
])
```

**Step 3: Commit**

```bash
git add src-tauri/src/drizzle_proxy.rs src-tauri/src/lib.rs
git commit -m "feat: add run_sql_batch Rust command for transactional order creation"
```

---

## Task 2: DB — Order data layer (`src/db/orders.ts`)

**Files:**
- Create: `src/db/orders.ts`

**Step 1: Create `src/db/orders.ts`**

```typescript
import { and, eq, gte, like, lt, sql } from "drizzle-orm";
import { invoke } from "@tauri-apps/api/core";
import { db } from "./index";
import { categories, orderItems, orders, products } from "./schema";
import type { Product } from "./menu";

interface SqlStatement {
  params: unknown[];
  sql: string;
}

interface BatchResult {
  last_insert_id: number;
  rows_affected: number;
}

export async function createOrder(data: {
  amountPaid: number | null;
  changeAmount: number | null;
  items: { price: number; product_id: number; product_name: string; qty: number }[];
  paymentMethod: "cash" | "qris";
  total: number;
  userId: number;
}): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const orderNumber = await getNextOrderNumber(today);

  const now = new Date().toISOString();

  const insertOrder: SqlStatement = {
    sql: `INSERT INTO orders (order_number, user_id, total, payment_method, amount_paid, change_amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)`,
    params: [
      orderNumber,
      data.userId,
      data.total,
      data.paymentMethod,
      data.amountPaid,
      data.changeAmount,
      now,
      now,
    ],
  };

  const itemStatements: SqlStatement[] = data.items.map(
    (item) => ({
      sql: `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, subtotal, created_at) VALUES (LAST_INSERT_ROWID(), ?, ?, ?, ?, ?, ?)`,
      params: [
        item.product_id,
        item.product_name,
        item.qty,
        item.price,
        item.qty * item.price,
        now,
      ],
    })
  );

  await invoke<BatchResult>("run_sql_batch", {
    statements: [insertOrder, ...itemStatements],
  });

  return orderNumber;
}

async function getNextOrderNumber(date: string): Promise<string> {
  const prefix = `${date}-`;
  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(like(orders.orderNumber, `${prefix}%`))
    .orderBy(sql`LENGTH(${orders.orderNumber})`, orders.orderNumber);

  const maxNum = rows.reduce((max, row) => {
    const suffix = row.orderNumber.slice(prefix.length);
    const n = Number.parseInt(suffix, 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);

  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export type ProductWithCategory = Product & { categoryName: string };

export async function getActiveProductsByCategory(): Promise<
  { categoryName: string; products: ProductWithCategory[] }[]
> {
  const rows = await db
    .select({
      categoryId: products.categoryId,
      categoryIsActive: categories.isActive,
      categoryName: categories.name,
      createdAt: products.createdAt,
      id: products.id,
      imageUrl: products.imageUrl,
      isActive: products.isActive,
      name: products.name,
      price: products.price,
      sortOrder: products.sortOrder,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.isActive, true), eq(categories.isActive, true)))
    .orderBy(categories.name, products.name, products.id);

  const grouped = new Map<string, ProductWithCategory[]>();
  for (const row of rows) {
    const list = grouped.get(row.categoryName) ?? [];
    list.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      createdAt: row.createdAt,
      id: row.id,
      imageUrl: row.imageUrl,
      isActive: row.isActive,
      name: row.name,
      price: row.price,
      sortOrder: row.sortOrder,
      updatedAt: row.updatedAt,
    });
    grouped.set(row.categoryName, list);
  }

  return Array.from(grouped.entries()).map(([categoryName, prods]) => ({
    categoryName,
    products: prods,
  }));
}
```

**Step 2: Commit**

```bash
git add src/db/orders.ts
git commit -m "feat: add order data layer with createOrder and getActiveProductsByCategory"
```

---

## Task 3: Cart state management (`src/lib/cart.ts`)

**Files:**
- Create: `src/lib/cart.ts`

**Step 1: Create `src/lib/cart.ts`**

```typescript
import { createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { Product } from "~/db/menu";

export interface CartItem {
  product: Product;
  quantity: number;
}

const [items, setItems] = createStore<CartItem[]>([]);

export const cartItems = () => items;

export const cartTotal = createMemo(() =>
  items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
);

export const cartCount = createMemo(() =>
  items.reduce((sum, item) => sum + item.quantity, 0)
);

export function addToCart(product: Product) {
  const index = items.findIndex((i) => i.product.id === product.id);
  if (index === -1) {
    setItems(items.length, { product, quantity: 1 });
  } else {
    setItems(index, "quantity", (q) => q + 1);
  }
}

export function updateQuantity(productId: number, quantity: number) {
  if (quantity <= 0) {
    removeFromCart(productId);
    return;
  }
  const index = items.findIndex((i) => i.product.id === productId);
  if (index !== -1) {
    setItems(index, { quantity });
  }
}

export function removeFromCart(productId: number) {
  setItems(
    produce((current) => {
      const index = current.findIndex((i) => i.product.id === productId);
      if (index !== -1) {
        current.splice(index, 1);
      }
    })
  );
}

export function clearCart() {
  setItems([]);
}
```

**Step 2: Commit**

```bash
git add src/lib/cart.ts
git commit -m "feat: add cart state management with SolidJS reactive store"
```

---

## Task 4: CategoryTabs component (`src/components/pos/category-tabs.tsx`)

**Files:**
- Create: `src/components/pos/category-tabs.tsx`

**Step 1: Create `src/components/pos/category-tabs.tsx`**

Horizontal scrollable category tab bar. "Semua" (All) tab shows all active products. Tapping a category filters the product grid.

```tsx
import type { Component } from "solid-js";
import { For } from "solid-js";
import { cn } from "~/lib/utils";

interface CategoryTabsProps {
  categories: string[];
  selected: string | null;
  onChange: (category: string | null) => void;
}

const CategoryTabs: Component<CategoryTabsProps> = (props) => {
  const allTabs = () => [null, ...props.categories];

  return (
    <div class="flex gap-1.5 overflow-x-auto px-4 py-2 scrollbar-none">
      <For each={allTabs()}>
        {(category) => {
          const isActive = () => props.selected === category;
          const label = () => category ?? "Semua";
          return (
            <button
              class={cn(
                "shrink-0 rounded-full px-4 py-2 font-medium text-sm transition-colors",
                isActive()
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
              onClick={() => props.onChange(category)}
              type="button"
            >
              {label()}
            </button>
          );
        }}
      </For>
    </div>
  );
};

export { CategoryTabs };
```

**Step 2: Commit**

```bash
git add src/components/pos/category-tabs.tsx
git commit -m "feat: add CategoryTabs component for POS product browsing"
```

---

## Task 5: ProductGrid component (`src/components/pos/product-grid.tsx`)

**Files:**
- Create: `src/components/pos/product-grid.tsx`

**Step 1: Create `src/components/pos/product-grid.tsx`**

Grid of large tap-friendly buttons. Each shows product name + price. Tap adds to cart.

```tsx
import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { type ProductWithCategory } from "~/db/orders";
import { addToCart } from "~/lib/cart";
import { formatIDR } from "~/lib/utils";

interface ProductGridProps {
  products: ProductWithCategory[];
  grouped: boolean;
}

const ProductGrid: Component<ProductGridProps> = (props) => {
  return (
    <Show
      fallback={
        <div class="flex flex-1 items-center justify-center py-12 text-muted-foreground">
          Tidak ada produk
        </div>
      }
      when={props.products.length > 0}
    >
      <div class="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3">
        <For each={props.products}>
          {(product) => (
            <button
              class="flex min-h-[80px] flex-col items-start justify-between rounded-xl border  bg-card p-3 text-left active:bg-accent/80"
              onClick={() => addToCart(product)}
              type="button"
            >
              <span class="line-clamp-2 w-full font-medium text-sm leading-snug">
                {product.name}
              </span>
              <span class="text-primary font-semibold text-xs">
                {formatIDR(product.price)}
              </span>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
};

export { ProductGrid };
```

**Step 2: Commit**

```bash
git add src/components/pos/product-grid.tsx
git commit -m "feat: add ProductGrid component for POS product browsing"
```

---

## Task 6: CartPanel component (`src/components/pos/cart-panel.tsx`)

**Files:**
- Create: `src/components/pos/cart-panel.tsx`

**Step 1: Create `src/components/pos/cart-panel.tsx`**

Collapsible cart panel at bottom of POS screen. Shows items with +/- controls, running total, and "Bayar" button. Uses `@corvu/drawer` to slide up.

```tsx
import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";
import {
  addToCart,
  cartCount,
  cartItems,
  cartTotal,
  clearCart,
  removeFromCart,
  updateQuantity,
} from "~/lib/cart";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { createSignal } from "solid-js";
import { formatIDR } from "~/lib/utils";

interface CartPanelProps {
  onPay: () => void;
}

const CartPanel: Component<CartPanelProps> = (props) => {
  const [showClearConfirm, setShowClearConfirm] = createSignal(false);
  const [drawerOpen, setDrawerOpen] = createSignal(false);

  return (
    <>
      <div class=" border-t bg-card">
        <Show
          fallback={
            <div class="flex items-center justify-center py-4 text-muted-foreground text-sm">
              Keranjang kosong
            </div>
          }
          when={cartCount() > 0}
        >
          <button
            class="flex w-full items-center justify-between px-4 py-3 active:bg-accent/80"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <span class="font-medium text-sm">
              {cartCount()} item
            </span>
            <span class="font-bold text-primary">
              {formatIDR(cartTotal())}
            </span>
          </button>
          <div class="flex gap-2 px-4 pb-4">
            <Button
              class="flex-1"
              onClick={() => setShowClearConfirm(true)}
              variant="outline"
            >
              Kosongkan
            </Button>
            <Button class="flex-1" onClick={props.onPay}>
              Bayar
            </Button>
          </div>
        </Show>
      </div>

      <Show when={drawerOpen()}>
        <Drawer
          closeOnEscapeKeyDown={false}
          closeOnOutsideFocus={false}
          modal={false}
          onOpenChange={(open) => {
            if (!open) setDrawerOpen(false);
          }}
          open={drawerOpen()}
          trapFocus={false}
        >
          <DrawerPortal>
            <DrawerOverlay />
            <DrawerContent class="max-h-[70vh]">
              <DrawerTitle>Keranjang</DrawerTitle>
              <div class="flex-1 overflow-y-auto px-4 pb-2">
                <For each={cartItems()}>
                  {(item) => (
                    <div class="flex items-center gap-3 border-b  py-3">
                      <div class="min-w-0 flex-1">
                        <p class="truncate font-medium text-sm">
                          {item.product.name}
                        </p>
                        <p class="text-muted-foreground text-xs">
                          {formatIDR(item.product.price)} × {item.quantity} ={" "}
                          {formatIDR(item.product.price * item.quantity)}
                        </p>
                      </div>
                      <div class="flex items-center gap-1.5">
                        <button
                          class="flex size-8 items-center justify-center rounded-lg bg-muted font-mono text-lg active:bg-accent"
                          onClick={() =>
                            item.quantity === 1
                              ? removeFromCart(item.product.id)
                              : updateQuantity(item.product.id, item.quantity - 1)
                          }
                          type="button"
                        >
                          −
                        </button>
                        <span class="w-8 text-center font-medium text-sm">
                          {item.quantity}
                        </span>
                        <button
                          class="flex size-8 items-center justify-center rounded-lg bg-muted font-mono text-lg active:bg-accent"
                          onClick={() => addToCart(item.product)}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
              <div class=" border-t px-4 py-3">
                <div class="flex items-center justify-between">
                  <span class="font-medium">Total</span>
                  <span class="font-bold text-primary text-lg">
                    {formatIDR(cartTotal())}
                  </span>
                </div>
              </div>
            </DrawerContent>
          </DrawerPortal>
        </Drawer>
      </Show>

      <ConfirmDrawer
        confirmLabel="Kosongkan"
        message="Semua item di keranjang akan dihapus."
        onClose={() => setShowClearConfirm(false)}
        onConfirm={clearCart}
        open={showClearConfirm()}
        title="Kosongkan Keranjang"
      />
    </>
  );
};

export { CartPanel };
```

**Step 2: Commit**

```bash
git add src/components/pos/cart-panel.tsx
git commit -m "feat: add CartPanel component with drawer, quantity controls, and clear confirm"
```

---

## Task 7: PaymentDialog component (`src/components/pos/payment-dialog.tsx`)

**Files:**
- Create: `src/components/pos/payment-dialog.tsx`

**Step 1: Create `src/components/pos/payment-dialog.tsx`**

Full-screen drawer for payment. Shows order summary, payment method toggle (Tunai/QRIS), cash input with change calculation, confirm/cancel.

```tsx
import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";
import { cartItems, cartTotal } from "~/lib/cart";
import { cn, formatIDR } from "~/lib/utils";

type PaymentMethod = "cash" | "qris";

interface PaymentDialogProps {
  onClose: () => void;
  onConfirm: (data: {
    amountPaid: number | null;
    changeAmount: number | null;
    paymentMethod: PaymentMethod;
  }) => void;
  open: boolean;
}

const PaymentDialog: Component<PaymentDialogProps> = (props) => {
  const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod>("cash");
  const [amountInput, setAmountInput] = createSignal("");

  const changeAmount = createMemo(() => {
    const paid = Number(amountInput());
    const total = cartTotal();
    if (Number.isNaN(paid) || paid < total) return -1;
    return paid - total;
  });

  const isValid = createMemo(() => {
    if (paymentMethod() === "qris") return true;
    const paid = Number(amountInput());
    return !Number.isNaN(paid) && paid >= cartTotal();
  });

  const handleConfirm = () => {
    const method = paymentMethod();
    if (method === "cash") {
      const paid = Number(amountInput());
      props.onConfirm({
        amountPaid: paid,
        changeAmount: paid - cartTotal(),
        paymentMethod: "cash",
      });
    } else {
      props.onConfirm({
        amountPaid: cartTotal(),
        changeAmount: 0,
        paymentMethod: "qris",
      });
    }
  };

  const appendDigit = (d: string) => {
    const current = amountInput();
    if (current === "0") {
      setAmountInput(d);
    } else {
      setAmountInput(current + d);
    }
  };

  const deleteLast = () => {
    const current = amountInput();
    if (current.length <= 1) {
      setAmountInput("");
    } else {
      setAmountInput(current.slice(0, -1));
    }
  };

  const numpadKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "del"];

  return (
    <Show when={props.open}>
      <Drawer
        closeOnEscapeKeyDown={false}
        closeOnOutsideFocus={false}
        modal={false}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
        open={props.open}
        trapFocus={false}
      >
        <DrawerPortal>
          <DrawerOverlay />
          <DrawerContent class="max-h-[95vh]">
            <DrawerTitle>Pembayaran</DrawerTitle>
            <div class="flex-1 overflow-y-auto px-4">
              <div class="space-y-1 py-2">
                <For each={cartItems()}>
                  {(item) => (
                    <div class="flex justify-between text-sm">
                      <span class="truncate">
                        {item.product.name} ×{item.quantity}
                      </span>
                      <span class="shrink-0 font-medium">
                        {formatIDR(item.product.price * item.quantity)}
                      </span>
                    </div>
                  )}
                </For>
              </div>

              <div class=" border-t py-3">
                <div class="flex justify-between font-bold">
                  <span>Total</span>
                  <span class="text-primary">{formatIDR(cartTotal())}</span>
                </div>
              </div>

              <div class="flex gap-2 py-3">
                <button
                  class={cn(
                    "flex-1 rounded-lg py-2.5 font-medium text-sm transition-colors",
                    paymentMethod() === "cash"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => setPaymentMethod("cash")}
                  type="button"
                >
                  Tunai
                </button>
                <button
                  class={cn(
                    "flex-1 rounded-lg py-2.5 font-medium text-sm transition-colors",
                    paymentMethod() === "qris"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => setPaymentMethod("qris")}
                  type="button"
                >
                  QRIS
                </button>
              </div>

              <Show when={paymentMethod() === "cash"}>
                <div class="space-y-2 pb-3">
                  <div class="flex items-center justify-between rounded-lg border  bg-muted px-3 py-2">
                    <span class="text-muted-foreground text-sm">Dibayar</span>
                    <span class="font-bold text-lg">
                      {amountInput() ? formatIDR(Number(amountInput())) : "Rp 0"}
                    </span>
                  </div>
                  <div class="grid grid-cols-3 gap-1.5">
                    <For each={numpadKeys}>
                      {(key) => (
                        <button
                          class="flex h-12 items-center justify-center rounded-lg bg-card font-mono text-lg active:bg-accent"
                          onClick={() =>
                            key === "del" ? deleteLast() : appendDigit(key)
                          }
                          type="button"
                        >
                          {key === "del" ? "⌫" : key}
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={changeAmount() >= 0}>
                    <div class="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2">
                      <span class="text-sm">Kembalian</span>
                      <span class="font-bold text-success">
                        {formatIDR(changeAmount())}
                      </span>
                    </div>
                  </Show>
                </div>
              </Show>
            </div>

            <div class="flex gap-2  border-t p-4">
              <Button class="flex-1" onClick={props.onClose} variant="outline">
                Batal
              </Button>
              <Button class="flex-1" disabled={!isValid()} onClick={handleConfirm}>
                Konfirmasi
              </Button>
            </div>
          </DrawerContent>
        </DrawerPortal>
      </Drawer>
    </Show>
  );
};

export { PaymentDialog };
export type { PaymentMethod };
```

**Step 2: Commit**

```bash
git add src/components/pos/payment-dialog.tsx
git commit -m "feat: add PaymentDialog component with cash/QRIS toggle and numpad"
```

---

## Task 8: POS page (`src/pages/pos.tsx`)

**Files:**
- Modify: `src/pages/pos.tsx` (replace placeholder)

**Step 1: Replace `src/pages/pos.tsx` with full POS implementation**

```tsx
import { createResource, createSignal, Show } from "solid-js";
import { CategoryTabs } from "~/components/pos/category-tabs";
import { CartPanel } from "~/components/pos/cart-panel";
import { PaymentDialog } from "~/components/pos/payment-dialog";
import { getActiveProductsByCategory, type ProductWithCategory } from "~/db/orders";
import { clearCart, cartTotal, cartItems } from "~/lib/cart";
import { currentUser } from "~/lib/auth";
import { createOrder } from "~/db/orders";
import { formatIDR } from "~/lib/utils";
import { ProductGrid } from "~/components/pos/product-grid";

export default function POS() {
  const [groupedData] = createResource(getActiveProductsByCategory);
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(null);
  const [paymentOpen, setPaymentOpen] = createSignal(false);
  const [orderResult, setOrderResult] = createSignal<string | null>(null);

  const categories = () =>
    groupedData()?.map((g) => g.categoryName) ?? [];

  const filteredProducts = (): ProductWithCategory[] => {
    const data = groupedData();
    if (!data) return [];
    const selected = selectedCategory();
    if (!selected) {
      return data.flatMap((g) => g.products);
    }
    return data.find((g) => g.categoryName === selected)?.products ?? [];
  };

  const handlePayment = async (data: {
    amountPaid: number | null;
    changeAmount: number | null;
    paymentMethod: "cash" | "qris";
  }) => {
    const user = currentUser();
    if (!user) return;

    const orderNumber = await createOrder({
      amountPaid: data.amountPaid,
      changeAmount: data.changeAmount,
      items: cartItems().map((item) => ({
        price: item.product.price,
        product_id: item.product.id,
        product_name: item.product.name,
        qty: item.quantity,
      })),
      paymentMethod: data.paymentMethod,
      total: cartTotal(),
      userId: user.id,
    });

    setPaymentOpen(false);
    clearCart();
    setOrderResult(orderNumber);
    setTimeout(() => setOrderResult(null), 2000);
  };

  return (
    <div class="flex h-full flex-col">
      <Show when={orderResult()}>
        {(num) => (
          <div class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background/95">
            <span class="font-bold text-4xl text-primary">Selesai!</span>
            <span class="text-muted-foreground text-lg">{num()}</span>
          </div>
        )}
      </Show>

      <CategoryTabs
        categories={categories()}
        onChange={setSelectedCategory}
        selected={selectedCategory()}
      />

      <div class="flex-1 overflow-y-auto">
        <ProductGrid products={filteredProducts()} />
      </div>

      <CartPanel onPay={() => setPaymentOpen(true)} />
      <PaymentDialog
        onClose={() => setPaymentOpen(false)}
        onConfirm={handlePayment}
        open={paymentOpen()}
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/pos.tsx
git commit -m "feat: implement POS page with product browsing, cart, and payment flow"
```

---

## Task 9: Verify and fix

**Step 1: Run lint and typecheck**

```bash
bun x ultracite check
bun x tsc --noEmit
```

Fix any issues found. Common things to watch for:
- Unused imports
- Type mismatches on `LAST_INSERT_ROWID()` (Rust's `last_insert_rowid()` returns `i64` but order items need the order ID from the first insert — this is handled by the batch executing sequentially)
- SolidJS reactivity: ensure signals are called inside tracking scopes

**Step 2: Run tests**

```bash
bun test
```

**Step 3: Test on device**

```bash
./dev
```

Verify:
1. POS page loads with category tabs and product grid
2. Tapping product adds to cart (cart count appears)
3. Tapping cart summary opens cart drawer
4. +/- buttons work, item can be removed
5. "Bayar" opens payment dialog
6. Cash flow: enter amount, see change, confirm
7. QRIS flow: tap QRIS, confirm
8. Order number appears briefly after payment
9. Cart clears after payment
10. Category tab filtering works

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address lint/typecheck issues in POS ordering flow"
```

---

## Key Design Decisions

1. **`run_sql_batch` for transactions** — Order creation needs atomic multi-table inserts. Current `run_sql` opens a new pool per call and runs single statements. The batch variant wraps all statements in a single transaction and uses `LAST_INSERT_ROWID()` to link order_items to the order.

2. **Cart as global reactive store** — `src/lib/cart.ts` uses `createStore` at module scope so the cart persists across navigation (if user accidentally navigates away and back). Not persisted to DB — cart is ephemeral.

3. **`getActiveProductsByCategory` joins products + categories** — Only returns products from active categories with `is_active = true`. Returns grouped by category name for easy tab rendering.

4. **Full-screen drawer for payment** — Not a small modal. The payment dialog takes 95% of the screen height with a numpad for cash input. Mobile-native feel.

5. **Daily order numbers** — Format `YYYY-MM-DD-NNN`. Query all orders for today, find max NNN, increment. Padded to 3 digits (supports 999 orders/day).

6. **File naming** — All new files follow kebab-case convention. POS-specific components in `src/components/pos/` subdirectory (not in `ui/` since they're business components).

7. **No `scrollbar-none` class** — If Tailwind doesn't have it, may need to add to CSS or use `overflow-x-auto` with `-webkit-overflow-scrolling: touch`. Check if it works; if not, add a utility class.
