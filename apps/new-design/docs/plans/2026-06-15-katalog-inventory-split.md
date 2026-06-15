# Katalog / Inventory Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split product management (Katalog) and stock management (Inventory) into two separate pages — Katalog accessible from the dashboard quick actions, Inventory replacing Katalog in the sidebar and notch nav.

**Architecture:** Shared catalog data moves to `src/lib/data/catalog.ts` so both pages import it. The Inventory page is a standalone shell route with inline stock steppers (the current `tab-produk.tsx` logic, extracted). The Katalog page keeps its 3-tab structure (Produk / Varian / Kategori) but the Produk tab reverts to read-only stock display — no inline editing. Nav items, routing, SSGOI config, and zone detection all swap `katalog` → `inventory`.

**Tech Stack:** SolidJS, @solidjs/router, Tailwind v4, solid-js/store, SSGOI transitions.

---

## Context for the engineer

### Current state
- `src/pages/katalog/data.ts` — types + sample data + helpers (shared, needs to move)
- `src/pages/katalog/index.tsx` — 3-tab page shell
- `src/pages/katalog/tab-produk.tsx` — product list with inline QuantityStepper (editable)
- `src/pages/katalog/tab-varian.tsx` — variant list
- `src/pages/katalog/tab-kategori.tsx` — category list
- `src/components/layout/app-shell/sidebar.tsx` — desktop nav, has `NavKey` type
- `src/components/layout/app-shell/notch-nav.tsx` — mobile nav, duplicates nav items
- `src/components/layout/app-shell/index.tsx` — `ZONE_MAP`, `navFromPath()`, zone detection
- `src/routes.tsx` — route definitions
- `src/lib/ssgoi-config.ts` — SSGOI transition config, has `SHELL_PATHS`
- `src/pages/dashboard/components/quick-actions.tsx` — dashboard shortcuts (Katalog exists but is a plain button)

### What changes
- **Inventory page** (new) = the current `tab-produk.tsx` logic, but standalone with `FadeIn`, `data-ssgoi-transition="/inventory"`
- **Katalog Produk tab** (simplified) = read-only list, no stepper, no `createStore`. Shows stock as number + status badge. Tap row → edit form.
- **Nav** = `katalog` entry replaced by `inventory` entry (BoxPackageIcon, label "Stok")
- **Routes** = add `/inventory`, keep `/katalog`
- **Quick actions** = Katalog button becomes `<A href="/katalog">`

### Design rules (from DESIGN.md / PRODUCT.md)
- Use semantic tokens, not arbitrary values
- Mobile-first: `sm:` `lg:` `xl:` (no `max-[]`)
- Icons on LEFT of button text
- Use `<Button>`, `<Tab>`, `<Badge>` components — never hand-roll
- `--no-verify` on all git commits
- Biome linter via `bun x ultracite fix` then `bun x ultracite check`
- Build check via `npx vite build`

---

### Task 1: Move shared data to `src/lib/data/catalog.ts`

**Files:**
- Move: `src/pages/katalog/data.ts` → `src/lib/data/catalog.ts`
- Modify: `src/pages/katalog/tab-produk.tsx` (import path)
- Modify: `src/pages/katalog/tab-varian.tsx` (import path)
- Modify: `src/pages/katalog/tab-kategori.tsx` (import path)

**Step 1: Create the new data file**

Create `src/lib/data/catalog.ts` with the exact contents of `src/pages/katalog/data.ts`.

```bash
mkdir -p src/lib/data
cp src/pages/katalog/data.ts src/lib/data/catalog.ts
```

Then delete the original:
```bash
rm src/pages/katalog/data.ts
```

**Step 2: Update all import paths**

In `src/pages/katalog/tab-produk.tsx`, change:
```ts
import { ... } from "./data";
```
to:
```ts
import { ... } from "~/lib/data/catalog";
```

Do the same in `src/pages/katalog/tab-varian.tsx` and `src/pages/katalog/tab-kategori.tsx`.

**Step 3: Verify build**

Run: `npx vite build`
Expected: builds successfully, no import errors.

**Step 4: Lint**

Run: `bun x ultracite fix && bun x ultracite check`
Expected: no errors.

**Step 5: Commit**

```bash
git add -A
git commit --no-verify -m "refactor: move catalog data to src/lib/data/catalog.ts"
```

---

### Task 2: Create Inventory page

**Files:**
- Create: `src/pages/inventory/index.tsx`
- Create: `src/pages/inventory/product-row.tsx`

**Step 1: Create `src/pages/inventory/product-row.tsx`**

Extract the `ProductRow` component from the current `tab-produk.tsx`. It should be identical — the inline stepper row with editable stock.

```tsx
import { A } from "@solidjs/router";
import { Badge } from "~/components/ui/badge";
import { QuantityStepper } from "~/components/ui/quantity-stepper";
import { formatRupiah } from "~/lib/utils";
import { type Product, stockStatus } from "~/lib/data/catalog";

export function InventoryRow(props: {
  onAdjustStock: (delta: number) => void;
  onSetStock: (value: number) => void;
  product: Product;
  stock: number;
}) {
  const s = () => stockStatus(props.stock);
  return (
    <div class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/20 lg:gap-4">
      <A
        aria-label={`Edit ${props.product.name}`}
        class="min-w-0 flex-1 no-underline"
        href="#"
      >
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.product.sku} · {formatRupiah(props.product.price)}
        </p>
        <Badge class="mt-1" size="sm" variant={s().badge}>
          {s().label}
        </Badge>
      </A>
      <div class="flex shrink-0 flex-col items-center gap-1">
        <QuantityStepper
          ariaLabel={`Stok ${props.product.name}`}
          editable
          onDecrement={() => props.onAdjustStock(-1)}
          onIncrement={() => props.onAdjustStock(1)}
          onInput={(v) => props.onSetStock(v)}
          value={props.stock}
        />
        <span class="font-medium text-caption-sm text-faint-foreground">
          {props.product.unit}
        </span>
      </div>
    </div>
  );
}
```

**Step 2: Create `src/pages/inventory/index.tsx`**

This is the standalone Inventory page. It contains: title, search, category filter pills, and the product list with inline steppers. Uses `createStore` for mutable stock overlay (same pattern as current `tab-produk.tsx`).

```tsx
import { For, Show, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { SearchIcon } from "~/assets";
import { Tab } from "~/components/ui/tab";
import { FadeIn } from "~/components/ui/fade-in";
import { useOrientation } from "~/lib/use-orientation";
import {
  categories,
  products,
} from "~/lib/data/catalog";
import { InventoryRow } from "./product-row";

export default function Inventory() {
  const isPortrait = useOrientation();
  const enable = () => !isPortrait();
  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");

  const [stockMap, setStockMap] = createStore<Record<number, number>>(
    Object.fromEntries(products.map((p) => [p.id, p.stock])),
  );

  const effectiveStock = (id: number) => stockMap[id] ?? 0;
  const adjustStock = (id: number, delta: number) =>
    setStockMap(id, (prev) => Math.max(0, (prev ?? 0) + delta));
  const setStock = (id: number, value: number) =>
    setStockMap(id, Math.max(0, value));

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    const cat = activeCat();
    return products.filter((p) => {
      const matchCat = cat === "all" || p.category === cat;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  });

  return (
    <div
      class="flex flex-1 flex-col overflow-hidden"
      data-ssgoi-transition="/inventory"
    >
      <FadeIn
        class="shrink-0 px-4 pt-5 pb-3 lg:px-6"
        duration={0.35}
        enable={enable()}
        y={-8}
      >
        <h1 class="font-bold font-display text-foreground text-heading-sm">
          Stok
        </h1>
        <p class="mt-0.5 text-body-sm text-muted-foreground">
          Kelola stok produk Anda
        </p>
      </FadeIn>

      <FadeIn
        class="flex shrink-0 items-center gap-2.5 px-4 pb-2 lg:px-6"
        delay={0.05}
        duration={0.4}
        enable={enable()}
        y={8}
      >
        <label class="flex flex-1 items-center gap-2 rounded-xl bg-card px-3.5 py-2 shadow-card">
          <SearchIcon class="h-4 w-4 shrink-0 text-faint-foreground" />
          <input
            class="w-full bg-transparent text-body-sm text-foreground outline-none placeholder:text-faint-foreground"
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Cari produk atau SKU..."
            type="text"
            value={search()}
          />
        </label>
      </FadeIn>

      <FadeIn
        class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 lg:px-6"
        delay={0.1}
        duration={0.4}
        enable={enable()}
        y={8}
      >
        <Tab
          active={activeCat() === "all"}
          class="flex items-center gap-1.5"
          onClick={() => setActiveCat("all")}
          shape="pill"
          tone="accent"
        >
          Semua
          <span class="text-caption-sm opacity-70">{products.length}</span>
        </Tab>
        <For each={categories}>
          {(cat) => (
            <Tab
              active={activeCat() === cat.id}
              class="flex items-center gap-1.5"
              onClick={() => setActiveCat(cat.id)}
              shape="pill"
              tone="accent"
            >
              {cat.name}
              <span class="text-caption-sm opacity-70">
                {products.filter((p) => p.category === cat.id).length}
              </span>
            </Tab>
          )}
        </For>
      </FadeIn>

      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <div class="flex flex-col items-center justify-center gap-1 py-20 text-center">
              <p class="text-body-sm text-muted-foreground">
                Produk tidak ditemukan
              </p>
              <p class="text-caption text-faint-foreground">
                Coba ubah filter atau kata kunci
              </p>
            </div>
          }
          when={filtered().length > 0}
        >
          <div class="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
            <For each={filtered()}>
              {(product) => (
                <InventoryRow
                  onAdjustStock={(delta) => adjustStock(product.id, delta)}
                  onSetStock={(v) => setStock(product.id, v)}
                  product={product}
                  stock={effectiveStock(product.id)}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
```

**Step 3: Verify build**

Run: `npx vite build`
Expected: builds successfully (route not wired yet, but files compile).

**Step 4: Lint**

Run: `bun x ultracite fix && bun x ultracite check`

**Step 5: Commit**

```bash
git add -A
git commit --no-verify -m "feat(inventory): create inventory page with inline stock steppers"
```

---

### Task 3: Simplify Katalog Produk tab (read-only stock)

**Files:**
- Modify: `src/pages/katalog/tab-produk.tsx`

**Step 1: Remove inline editing, revert to read-only**

Rewrite `tab-produk.tsx` to remove:
- `createStore` import and stock overlay logic
- `QuantityStepper` import and usage
- `onAdjustStock` / `onSetStock` props on `ProductRow`

The `ProductRow` becomes a simple read-only row. Stock shows as a number + status badge. The whole row is a tap target to the edit form (`href="#"`).

```tsx
import { A } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { PlusIcon, SearchIcon } from "~/assets";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tab } from "~/components/ui/tab";
import { formatRupiah } from "~/lib/utils";
import {
  categories,
  type Product,
  products,
  stockStatus,
} from "~/lib/data/catalog";

export function TabProduk() {
  const [search, setSearch] = createSignal("");
  const [activeCat, setActiveCat] = createSignal("all");

  const filtered = createMemo(() => {
    const q = search().toLowerCase();
    const cat = activeCat();
    return products.filter((p) => {
      const matchCat = cat === "all" || p.category === cat;
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  });

  return (
    <div class="flex flex-1 flex-col overflow-hidden">
      {/* Search + add */}
      <div class="flex shrink-0 items-center gap-2.5 px-4 pt-3 pb-2 lg:px-6">
        <label class="flex flex-1 items-center gap-2 rounded-xl bg-card px-3.5 py-2 shadow-card">
          <SearchIcon class="h-4 w-4 shrink-0 text-faint-foreground" />
          <input
            class="w-full bg-transparent text-body-sm text-foreground outline-none placeholder:text-faint-foreground"
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Cari produk atau SKU..."
            type="text"
            value={search()}
          />
        </label>
        <Button as={A} href="#" size="sm">
          <PlusIcon class="h-4 w-4" />
          <span class="hidden sm:inline">Tambah Produk</span>
        </Button>
      </div>

      {/* Category filter pills */}
      <div class="scrollbar-none flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 lg:px-6">
        <Tab
          active={activeCat() === "all"}
          class="flex items-center gap-1.5"
          onClick={() => setActiveCat("all")}
          shape="pill"
          tone="accent"
        >
          Semua
          <span class="text-caption-sm opacity-70">{products.length}</span>
        </Tab>
        <For each={categories}>
          {(cat) => (
            <Tab
              active={activeCat() === cat.id}
              class="flex items-center gap-1.5"
              onClick={() => setActiveCat(cat.id)}
              shape="pill"
              tone="accent"
            >
              {cat.name}
              <span class="text-caption-sm opacity-70">
                {products.filter((p) => p.category === cat.id).length}
              </span>
            </Tab>
          )}
        </For>
      </div>

      {/* Product list — read-only stock */}
      <div class="@container scrollbar-none flex-1 overflow-y-auto px-4 pb-28 lg:px-6 lg:pb-6">
        <Show
          fallback={
            <EmptyState
              message="Produk tidak ditemukan"
              subtitle="Coba ubah filter atau kata kunci"
            />
          }
          when={filtered().length > 0}
        >
          <div class="grid grid-cols-1 gap-2 @2xl:grid-cols-2">
            <For each={filtered()}>
              {(product) => <ProductRow product={product} />}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}

function ProductRow(props: { product: Product }) {
  const s = () => stockStatus(props.product.stock);
  return (
    <A
      aria-label={`Edit ${props.product.name}`}
      class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 no-underline transition-colors hover:border-primary/20 lg:gap-4"
      href="#"
    >
      <div class="min-w-0 flex-1">
        <h3 class="truncate font-semibold text-body-sm text-foreground">
          {props.product.name}
        </h3>
        <p class="mt-0.5 truncate text-caption-sm text-faint-foreground">
          {props.product.sku} · {formatRupiah(props.product.price)}
        </p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <span class="font-bold text-body-sm text-foreground tabular-nums">
          {props.product.stock}
        </span>
        <Badge size="sm" variant={s().badge}>
          {s().label}
        </Badge>
      </div>
    </A>
  );
}

function EmptyState(props: { message: string; subtitle: string }) {
  return (
    <div class="flex flex-col items-center justify-center gap-1 py-20 text-center">
      <p class="text-body-sm text-muted-foreground">{props.message}</p>
      <p class="text-caption text-faint-foreground">{props.subtitle}</p>
    </div>
  );
}
```

**Step 2: Verify build**

Run: `npx vite build`
Expected: builds successfully.

**Step 3: Lint**

Run: `bun x ultracite fix && bun x ultracite check`

**Step 4: Commit**

```bash
git add -A
git commit --no-verify -m "refactor(katalog): produk tab read-only stock, remove inline editing"
```

---

### Task 4: Update NavKey type and nav items

**Files:**
- Modify: `src/components/layout/app-shell/sidebar.tsx`
- Modify: `src/components/layout/app-shell/notch-nav.tsx`

**Step 1: Update sidebar nav items**

In `src/components/layout/app-shell/sidebar.tsx`:

1. Change the `NavKey` type:
```ts
export type NavKey = "home" | "transactions" | "inventory" | "settings";
```

2. Change the `navItems` array — replace the katalog entry:
```ts
{
  key: "inventory",
  Icon: BoxPackageIcon,
  label: "Stok",
  href: "/inventory",
},
```

3. Update the import to include `BoxPackageIcon`:
```ts
import {
  BoxPackageIcon,
  FileIcon,
  HomeIcon,
  LogoutIcon,
  SettingsIcon,
} from "~/assets";
```
Remove the `GridIcon` import if it's no longer used.

**Step 2: Update notch-nav nav items**

In `src/components/layout/app-shell/notch-nav.tsx`:

1. Change `rightTabs` — replace the katalog entry:
```ts
const rightTabs = [
  {
    key: "inventory" as NavKey,
    Icon: BoxPackageIcon,
    label: "Stok",
    href: "/inventory",
  },
  {
    key: "settings" as NavKey,
    Icon: SettingsIcon,
    label: "Setting",
    href: "/pengaturan",
  },
];
```

2. Update imports — add `BoxPackageIcon`, remove `GridIcon` if unused.

**Step 3: Verify build**

Run: `npx vite build`
Expected: builds successfully.

**Step 4: Lint**

Run: `bun x ultracite fix && bun x ultracite check`

**Step 5: Commit**

```bash
git add -A
git commit --no-verify -m "refactor(nav): replace Katalog with Inventory (Stok) in sidebar and notch nav"
```

---

### Task 5: Update routing, zone detection, and SSGOI config

**Files:**
- Modify: `src/routes.tsx`
- Modify: `src/components/layout/app-shell/index.tsx`
- Modify: `src/lib/ssgoi-config.ts`

**Step 1: Add Inventory route**

In `src/routes.tsx`, add the import and route:

```ts
import Inventory from "./pages/inventory";
```

Add the route (next to the existing katalog route):
```tsx
<Route component={Inventory} path="/inventory" />
```

**Step 2: Update ZONE_MAP and navFromPath in app-shell**

In `src/components/layout/app-shell/index.tsx`:

1. Add `/inventory` to `ZONE_MAP`:
```ts
const ZONE_MAP: Record<string, Zone> = {
  "/": "shell",
  "/transactions": "shell",
  "/katalog": "shell",
  "/inventory": "shell",
  "/pengaturan": "shell",
  "/transaction-new": "flow",
  "/payment": "flow",
  "/receipt": "flow",
  "/login": "auth",
  "/register": "auth",
  "/pin": "auth",
};
```

2. Update `navFromPath` — replace katalog with inventory:
```ts
const navFromPath = (pathname: string): NavKey => {
  if (pathname === "/") {
    return "home";
  }
  if (pathname === "/transactions") {
    return "transactions";
  }
  if (pathname === "/inventory") {
    return "inventory";
  }
  if (pathname.startsWith("/pengaturan")) {
    return "settings";
  }
  return "home";
};
```

**Step 3: Update SSGOI config**

In `src/lib/ssgoi-config.ts`:

1. Add `/inventory` to `SHELL_PATHS`:
```ts
const SHELL_PATHS = ["/", "/transactions", "/katalog", "/inventory", "/pengaturan"] as const;
```

2. Add a drill transition from inventory to transaction-new (so the FAB/notch button works):
```ts
drill({
  enter: "/transaction-new",
  exit: "/inventory",
  type: "parallax",
}),
```

**Step 4: Verify build**

Run: `npx vite build`
Expected: builds successfully.

**Step 5: Lint**

Run: `bun x ultracite fix && bun x ultracite check`

**Step 6: Commit**

```bash
git add -A
git commit --no-verify -m "feat(routing): add /inventory route, update zones and SSGOI config"
```

---

### Task 6: Wire dashboard quick actions to Katalog

**Files:**
- Modify: `src/pages/dashboard/components/quick-actions.tsx`

**Step 1: Make the Katalog quick action navigate**

The quick actions currently render plain `<button>` elements. Change the Katalog entry to use `<A>` from `@solidjs/router` so it navigates to `/katalog`.

In `src/pages/dashboard/components/quick-actions.tsx`:

1. Add imports:
```ts
import { A } from "@solidjs/router";
```

2. Add an optional `href` to the `QuickAction` interface:
```ts
interface QuickAction {
  readonly Icon: Component<{ class?: string }>;
  readonly href?: string;
  readonly label: string;
}
```

3. Set the href on the Katalog entry:
```ts
{ Icon: GridDetailIcon, href: "/katalog", label: "Katalog" },
```

4. Change the render: if `qa.href` exists, render `<A>` instead of `<button>`. The cleanest approach is to use a dynamic component. Since all items currently are `<button>`, and only Katalog has an href, use a conditional:

```tsx
<For each={actions}>
  {(qa) => {
    const Tag = qa.href ? A : "button";
    return (
      <Tag
        aria-label={qa.label}
        class="group flex min-h-[96px] cursor-pointer flex-col items-center gap-2.5 rounded-lg px-1 pt-[18px] pb-4 text-muted-foreground transition-[background,border-color,box-shadow,transform,color] duration-200 hover:bg-foreground/5 hover:text-foreground sm:border sm:border-border sm:bg-card sm:shadow-card sm:hover:-translate-y-0.5 sm:hover:border-accent/30 sm:hover:bg-transparent sm:hover:shadow-card-hover dark:sm:shadow-none dark:sm:hover:shadow-none no-underline"
        href={qa.href}
        type={qa.href ? undefined : "button"}
      >
        {/* ... inner content stays the same ... */}
      </Tag>
    );
  }}
</For>
```

Add `no-underline` to the class list so the `<A>` doesn't get link styling.

**Step 2: Verify build**

Run: `npx vite build`
Expected: builds successfully.

**Step 3: Lint**

Run: `bun x ultracite fix && bun x ultracite check`

**Step 4: Commit**

```bash
git add -A
git commit --no-verify -m "feat(dashboard): wire Katalog quick action to /katalog route"
```

---

### Task 7: Final verification and cleanup

**Step 1: Verify full build**

Run: `npx vite build`
Expected: builds successfully, no errors.

**Step 2: Verify lint**

Run: `bun x ultracite check`
Expected: no errors.

**Step 3: Check for orphaned imports**

Search for any remaining references to the old data path:
```bash
grep -rn 'from "./data"' src/pages/katalog/
grep -rn 'productImage' src/
```
Expected: no results (productImage was already removed).

**Step 4: Check VS Code diagnostics**

Use `vscode_get_diagnostics` on:
- `src/pages/inventory/`
- `src/pages/katalog/`
- `src/components/layout/app-shell/`

Expected: no errors.

**Step 5: Final commit (if any cleanup needed)**

```bash
git add -A
git commit --no-verify -m "chore: cleanup orphaned imports after katalog/inventory split"
```

---

## Summary of changes

| File | Change |
|---|---|
| `src/lib/data/catalog.ts` | NEW — shared data (moved from `src/pages/katalog/data.ts`) |
| `src/pages/inventory/index.tsx` | NEW — Inventory page with inline stock steppers |
| `src/pages/inventory/product-row.tsx` | NEW — extracted InventoryRow component |
| `src/pages/katalog/tab-produk.tsx` | SIMPLIFIED — read-only stock, no stepper |
| `src/pages/katalog/tab-varian.tsx` | Import path only |
| `src/pages/katalog/tab-kategori.tsx` | Import path only |
| `src/components/layout/app-shell/sidebar.tsx` | NavKey `katalog` → `inventory`, GridIcon → BoxPackageIcon |
| `src/components/layout/app-shell/notch-nav.tsx` | Same nav swap |
| `src/components/layout/app-shell/index.tsx` | ZONE_MAP + navFromPath updated |
| `src/lib/ssgoi-config.ts` | SHELL_PATHS + drill transitions updated |
| `src/routes.tsx` | Add `/inventory` route |
| `src/pages/dashboard/components/quick-actions.tsx` | Katalog button → `<A href="/katalog">` |
