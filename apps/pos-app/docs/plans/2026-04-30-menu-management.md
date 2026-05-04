# Menu Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full CRUD for categories and products in the MenuManagement page.

**Architecture:** Single-page tabbed layout (Categories | Products) in `src/pages/MenuManagement.tsx`. Categories and products are managed via Drizzle ORM queries through the existing `run_sql` Tauri IPC bridge. Dialogs use a simple modal overlay pattern (no external dialog library). Reorder uses up/down buttons (not drag-and-drop — YAGNI for v1).

**Tech Stack:** SolidJS, Drizzle ORM (sqlite-proxy), TailwindCSS, @kobalte/core (Button), class-variance-authority

**Codebase conventions:**
- SolidJS: function components, `<For>` over `.map()`, `createSignal`/`createResource` for reactivity
- Styling: Tailwind utility classes, `cn()` from `~/lib/utils`, CSS variables for theme colors
- UI: `Button` component from `~/components/ui/button` (variants: default/destructive/outline/secondary/ghost, sizes: default/sm/lg/icon)
- DB: `db` from `~/db/index`, Drizzle schema from `~/db/schema`
- DB queries: colocated in `src/db/` by domain — `src/db/menu.ts` (categories + products), future: `src/db/orders.ts`, `src/db/users.ts`
- No `console.log`/`console.error`/`alert()` in production code
- Run `bun x ultracite fix` before each commit

---

### Task 1: Utility — `formatIDR` price formatter

**Files:**
- Modify: `src/lib/utils.ts`

**Step 1: Add `formatIDR` function**

```ts
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
```

**Step 2: Run lint**

Run: `bun x ultracite check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "feat: add formatIDR price formatter utility"
```

---

### Task 2: Dialog primitive component

**Files:**
- Create: `src/components/ui/dialog.tsx`

A simple modal dialog overlay. No external library — just a backdrop + centered panel. Uses Kobalte's `DismissableLayer` if available, otherwise a plain `<div>` with click-outside handling.

**Step 1: Create dialog component**

```tsx
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cn } from "~/lib/utils";
import { Button } from "./button";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: JSX.Element;
  class?: string;
}

export function Dialog(props: DialogProps) {
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      props.onClose();
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleBackdropClick}
      >
        <div
          class={cn(
            "w-full max-w-md rounded-lg border  bg-card p-6 shadow-lg",
            props.class
          )}
        >
          <h2 class="mb-4 text-lg font-semibold">{props.title}</h2>
          {props.children}
        </div>
      </div>
    </Show>
  );
}

interface DialogFooterProps {
  children: JSX.Element;
}

export function DialogFooter(props: DialogFooterProps) {
  return <div class="mt-6 flex justify-end gap-2">{props.children}</div>;
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "destructive" | "default";
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.title}>
      <p class="text-muted-foreground text-sm">{props.message}</p>
      <DialogFooter>
        <Button onClick={props.onClose} variant="outline">
          Batal
        </Button>
        <Button
          onClick={() => {
            props.onConfirm();
            props.onClose();
          }}
          variant={props.variant ?? "destructive"}
        >
          {props.confirmLabel ?? "Hapus"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
```

**Step 2: Run lint**

Run: `bun x ultracite check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat: add Dialog and ConfirmDialog UI components"
```

---

### Task 3: Menu data layer (categories + products)

**Files:**
- Create: `src/db/menu.ts`

**Step 1: Create menu data access functions**

```ts
import { eq } from "drizzle-orm";
import { db } from "./index";
import { categories, products } from "./schema";

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export async function getCategories(): Promise<Category[]> {
  return db
    .select()
    .from(categories)
    .orderBy(categories.sortOrder, categories.id);
}

export async function getCategory(id: number): Promise<Category | undefined> {
  const [row] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, id));
  return row;
}

export async function createCategory(
  data: NewCategory
): Promise<Category> {
  const [row] = await db.insert(categories).values(data).returning();
  return row;
}

export async function updateCategory(
  id: number,
  data: Partial<Omit<NewCategory, "id">>
): Promise<Category> {
  const [row] = await db
    .update(categories)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(categories.id, id))
    .returning();
  return row;
}

export async function deleteCategory(id: number): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

export async function getProductCountByCategory(
  categoryId: number
): Promise<number> {
  const [row] = await db
    .select({ count: products.id })
    .from(products)
    .where(eq(products.categoryId, categoryId))
    .limit(1);
  // Drizzle select with aggregate returns the value directly
  // We use a simpler approach: check if any product exists
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.categoryId, categoryId))
    .limit(1);
  return rows.length;
}

export async function getProducts(
  filterCategoryId?: number
): Promise<Product[]> {
  let query = db.select().from(products);

  if (filterCategoryId !== undefined) {
    query = query.where(eq(products.categoryId, filterCategoryId)) as typeof query;
  }

  return query.orderBy(products.sortOrder, products.id);
}

export async function getProduct(id: number): Promise<Product | undefined> {
  const [row] = await db
    .select()
    .from(products)
    .where(eq(products.id, id));
  return row;
}

export async function createProduct(
  data: NewProduct
): Promise<Product> {
  const [row] = await db.insert(products).values(data).returning();
  return row;
}

export async function updateProduct(
  id: number,
  data: Partial<Omit<NewProduct, "id">>
): Promise<Product> {
  const [row] = await db
    .update(products)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(products.id, id))
    .returning();
  return row;
}

export async function deleteProduct(id: number): Promise<void> {
  await db.delete(products).where(eq(products.id, id));
}
```

> **Note:** The `getProducts` function uses a conditional `.where()` which requires a type cast. If Drizzle's type inference complains, we can split into two separate query paths (one with filter, one without).

**Step 2: Run lint**

Run: `bun x ultracite check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/db/menu.ts
git commit -m "feat: add menu data access layer (categories + products CRUD)"
```

---

### Task 4: Categories tab UI — list + add dialog

**Files:**
- Modify: `src/pages/MenuManagement.tsx`

**Step 1: Build the full MenuManagement page with Categories tab**

This is a large file. The page has:
- Two tab buttons at the top ("Kategori" | "Produk")
- Categories tab: list of categories with name, sort order, active toggle, edit/delete actions
- "Tambah Kategori" (Add Category) button
- Add/Edit dialog with name field
- Delete confirmation dialog
- Up/down reorder buttons

```tsx
import { createResource, createSignal, For, Show } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  ConfirmDialog,
  Dialog,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  createCategory,
  deleteCategory,
  getProductCountByCategory,
  getCategories,
  type Category,
  updateCategory,
} from "~/db/menu";

type Tab = "categories" | "products";

export default function MenuManagement() {
  const [tab, setTab] = createSignal<Tab>("categories");
  return (
    <div class="flex min-h-screen flex-col p-4">
      <h1 class="mb-4 font-bold text-2xl">Kelola Menu</h1>
      <div class="mb-4 flex gap-1 rounded-lg bg-muted p-1">
        <button
          class={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab() === "categories"
              ? "bg-card text-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("categories")}
        >
          Kategori
        </button>
        <button
          class={cn(
            "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors",
            tab() === "products"
              ? "bg-card text-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("products")}
        >
          Produk
        </button>
      </div>
      <Show when={tab() === "categories"} fallback={<p>Produk tab — coming soon</p>}>
        <CategoriesTab />
      </Show>
    </div>
  );
}
```

> **Note:** We need `import { cn } from "~/lib/utils"` at the top.

**CategoriesTab component** (in same file or extracted):

```tsx
function CategoriesTab() {
  const [categories, { mutate, refetch }] = createResource(getCategories);
  const [showDialog, setShowDialog] = createSignal(false);
  const [editingCategory, setEditingCategory] = createSignal<
    Category | undefined
  >();
  const [dialogName, setDialogName] = createSignal("");
  const [deleteTarget, setDeleteTarget] = createSignal<Category | undefined>(
    undefined
  );
  const [deleteMessage, setDeleteMessage] = createSignal("");

  const openAddDialog = () => {
    setEditingCategory(undefined);
    setDialogName("");
    setShowDialog(true);
  };

  const openEditDialog = (cat: Category) => {
    setEditingCategory(cat);
    setDialogName(cat.name);
    setShowDialog(true);
  };

  const openDeleteDialog = async (cat: Category) => {
    const count = await getProductCountByCategory(cat.id);
    setDeleteMessage(
      count > 0
        ? `Kategori "${cat.name}" memiliki ${count} produk. Produk-produk tersebut tidak akan memiliki kategori. Lanjutkan hapus?`
        : `Hapus kategori "${cat.name}"?`
    );
    setDeleteTarget(cat);
  };

  const handleSave = async () => {
    const name = dialogName().trim();
    if (!name) return;

    const existing = editingCategory();
    if (existing) {
      await updateCategory(existing.id, { name });
    } else {
      await createCategory({ name });
    }
    setShowDialog(false);
    await refetch();
  };

  const handleDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    await deleteCategory(target.id);
    await refetch();
  };

  const moveUp = async (index: number) => {
    const cats = categories();
    if (!cats || index <= 0) return;
    const current = cats[index];
    const prev = cats[index - 1];
    await updateCategory(current.id, { sortOrder: prev.sortOrder });
    await updateCategory(prev.id, { sortOrder: current.sortOrder });
    await refetch();
  };

  const moveDown = async (index: number) => {
    const cats = categories();
    if (!cats || index >= cats.length - 1) return;
    const current = cats[index];
    const next = cats[index + 1];
    await updateCategory(current.id, { sortOrder: next.sortOrder });
    await updateCategory(next.id, { sortOrder: current.sortOrder });
    await refetch();
  };

  const toggleActive = async (cat: Category) => {
    await updateCategory(cat.id, { isActive: !cat.isActive });
    await refetch();
  };

  return (
    <>
      <div class="mb-4 flex items-center justify-between">
        <p class="text-muted-foreground text-sm">
          {categories()?.length ?? 0} kategori
        </p>
        <Button onClick={openAddDialog} size="sm">
          + Tambah
        </Button>
      </div>

      <Show
        when={categories() && categories()!.length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p>Belum ada kategori</p>
            <p class="text-sm">Tap "Tambah" untuk membuat kategori baru</p>
          </div>
        }
      >
        <div class="space-y-2">
          <For each={categories()}>
            {(cat, index) => (
              <div class="flex items-center gap-2 rounded-lg border  bg-card p-3">
                <div class="flex flex-col gap-0.5">
                  <button
                    class="text-muted-foreground disabled:opacity-30"
                    disabled={index() === 0}
                    onClick={() => moveUp(index())}
                  >
                    ▲
                  </button>
                  <button
                    class="text-muted-foreground disabled:opacity-30"
                    disabled={index() === categories()!.length - 1}
                    onClick={() => moveDown(index())}
                  >
                    ▼
                  </button>
                </div>
                <div class="flex-1">
                  <p class="font-medium">{cat.name}</p>
                  <Show
                    when={cat.isActive}
                    fallback={
                      <span class="text-destructive text-xs">Nonaktif</span>
                    }
                  >
                    <span class="text-muted-foreground text-xs">Aktif</span>
                  </Show>
                </div>
                <button
                  class={cn(
                    "rounded-full px-2 py-1 text-xs font-medium",
                    cat.isActive
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => toggleActive(cat)}
                >
                  {cat.isActive ? "Aktif" : "Nonaktif"}
                </button>
                <Button onClick={() => openEditDialog(cat)} size="icon" variant="ghost">
                  ✏️
                </Button>
                <Button
                  onClick={() => openDeleteDialog(cat)}
                  size="icon"
                  variant="ghost"
                >
                  🗑️
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Dialog
        onClose={() => setShowDialog(false)}
        open={showDialog()}
        title={editingCategory() ? "Edit Kategori" : "Tambah Kategori"}
      >
        <label class="mb-1 block text-sm font-medium">Nama</label>
        <input
          class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          onInput={(e) => setDialogName(e.currentTarget.value)}
          placeholder="Nama kategori"
          type="text"
          value={dialogName()}
        />
        <DialogFooter>
          <Button onClick={() => setShowDialog(false)} variant="outline">
            Batal
          </Button>
          <Button disabled={!dialogName().trim()} onClick={handleSave}>
            Simpan
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        message={deleteMessage()}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={handleDelete}
        open={!!deleteTarget()}
        title="Hapus Kategori"
      />
    </>
  );
}
```

**Step 2: Run lint**

Run: `bun x ultracite fix && bun x ultracite check`
Expected: PASS (fix any formatting issues)

**Step 3: Commit**

```bash
git add src/pages/MenuManagement.tsx
git commit -m "feat: implement categories tab with CRUD, reorder, and toggle active"
```

---

### Task 5: Products tab UI — list + add/edit dialog + filter

**Files:**
- Modify: `src/pages/MenuManagement.tsx` (add ProductsTab)

**Step 1: Build ProductsTab component**

Add the ProductsTab to the same file. It shows:
- Category filter dropdown (Semua Kategori | specific categories)
- Product list with name, category name, formatted price, active toggle
- Add/Edit dialog with: name, category dropdown, price input, image URL (optional), sort order
- Delete confirmation

```tsx
function ProductsTab() {
  const [categories] = createResource(getCategories);
  const [filterCategoryId, setFilterCategoryId] = createSignal<
    number | undefined
  >(undefined);
  const [products, { mutate, refetch }] = createResource(
    () => filterCategoryId(),
    (id) => getProducts(id)
  );

  const [showDialog, setShowDialog] = createSignal(false);
  const [editingProduct, setEditingProduct] = createSignal<
    Product | undefined
  >();
  const [deleteTarget, setDeleteTarget] = createSignal<Product | undefined>(
    undefined
  );

  // Form fields
  const [formName, setFormName] = createSignal("");
  const [formCategoryId, setFormCategoryId] = createSignal<number | null>(null);
  const [formPrice, setFormPrice] = createSignal("");
  const [formImageUrl, setFormImageUrl] = createSignal("");
  const [formSortOrder, setFormSortOrder] = createSignal("0");

  const openAddDialog = () => {
    setEditingProduct(undefined);
    setFormName("");
    setFormCategoryId(categories()?.[0]?.id ?? null);
    setFormPrice("");
    setFormImageUrl("");
    setFormSortOrder("0");
    setShowDialog(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormName(product.name);
    setFormCategoryId(product.categoryId ?? null);
    setFormPrice(String(product.price));
    setFormImageUrl(product.imageUrl ?? "");
    setFormSortOrder(String(product.sortOrder));
    setShowDialog(true);
  };

  const handleSave = async () => {
    const name = formName().trim();
    const price = Number.parseInt(formPrice(), 10);
    const categoryId = formCategoryId();
    if (!name || Number.isNaN(price) || price < 0 || categoryId === null) return;

    const data = {
      name,
      categoryId,
      price,
      imageUrl: formImageUrl().trim() || null,
      sortOrder: Number.parseInt(formSortOrder(), 10) || 0,
    };

    const existing = editingProduct();
    if (existing) {
      await updateProduct(existing.id, data);
    } else {
      await createProduct(data);
    }
    setShowDialog(false);
    await refetch();
  };

  const handleDelete = async () => {
    const target = deleteTarget();
    if (!target) return;
    await deleteProduct(target.id);
    await refetch();
  };

  const toggleActive = async (product: Product) => {
    await updateProduct(product.id, { isActive: !product.isActive });
    await refetch();
  };

  const categoryName = (catId: number | null) => {
    if (catId === null) return "-";
    return categories()?.find((c) => c.id === catId)?.name ?? "-";
  };

  return (
    <>
      <div class="mb-4 flex items-center justify-between gap-2">
        <select
          class="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          onChange={(e) => {
            const val = e.currentTarget.value;
            setFilterCategoryId(val ? Number(val) : undefined);
          }}
        >
          <option value="">Semua Kategori</option>
          <For each={categories()}>
            {(cat) => (
              <option value={cat.id}>{cat.name}</option>
            )}
          </For>
        </select>
        <Button onClick={openAddDialog} size="sm">
          + Tambah
        </Button>
      </div>

      <Show
        when={products() && products()!.length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p>Belum ada produk</p>
            <p class="text-sm">Tap "Tambah" untuk membuat produk baru</p>
          </div>
        }
      >
        <div class="space-y-2">
          <For each={products()}>
            {(product) => (
              <div class="flex items-center gap-2 rounded-lg border  bg-card p-3">
                <div class="flex-1">
                  <p class="font-medium">{product.name}</p>
                  <p class="text-muted-foreground text-xs">
                    {categoryName(product.categoryId)} · {formatIDR(product.price)}
                  </p>
                </div>
                <button
                  class={cn(
                    "rounded-full px-2 py-1 text-xs font-medium",
                    product.isActive
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                  onClick={() => toggleActive(product)}
                >
                  {product.isActive ? "Aktif" : "Nonaktif"}
                </button>
                <Button onClick={() => openEditDialog(product)} size="icon" variant="ghost">
                  ✏️
                </Button>
                <Button
                  onClick={() => setDeleteTarget(product)}
                  size="icon"
                  variant="ghost"
                >
                  🗑️
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Dialog
        onClose={() => setShowDialog(false)}
        open={showDialog()}
        title={editingProduct() ? "Edit Produk" : "Tambah Produk"}
      >
        <div class="space-y-3">
          <div>
            <label class="mb-1 block text-sm font-medium">Nama</label>
            <input
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              onInput={(e) => setFormName(e.currentTarget.value)}
              placeholder="Nama produk"
              type="text"
              value={formName()}
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">Kategori</label>
            <select
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              onChange={(e) => {
                const val = e.currentTarget.value;
                setFormCategoryId(val ? Number(val) : null);
              }}
            >
              <option value="">Pilih kategori</option>
              <For each={categories()}>
                {(cat) => (
                  <option
                    selected={formCategoryId() === cat.id}
                    value={cat.id}
                  >
                    {cat.name}
                  </option>
                )}
              </For>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">Harga (Rp)</label>
            <input
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              inputMode="numeric"
              onInput={(e) => setFormPrice(e.currentTarget.value)}
              placeholder="0"
              type="number"
              value={formPrice()}
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">
              URL Gambar <span class="text-muted-foreground">(opsional)</span>
            </label>
            <input
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              onInput={(e) => setFormImageUrl(e.currentTarget.value)}
              placeholder="https://..."
              type="url"
              value={formImageUrl()}
            />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">Urutan</label>
            <input
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              inputMode="numeric"
              onInput={(e) => setFormSortOrder(e.currentTarget.value)}
              placeholder="0"
              type="number"
              value={formSortOrder()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => setShowDialog(false)} variant="outline">
            Batal
          </Button>
          <Button
            disabled={
              !formName().trim() ||
              Number.isNaN(Number.parseInt(formPrice(), 10)) ||
              formCategoryId() === null
            }
            onClick={handleSave}
          >
            Simpan
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        message={`Hapus produk "${deleteTarget()?.name}"?`}
        onClose={() => setDeleteTarget(undefined)}
        onConfirm={handleDelete}
        open={!!deleteTarget()}
        title="Hapus Produk"
      />
    </>
  );
}
```

**Step 2: Update the Products tab fallback in MenuManagement**

Replace `<p>Produk tab — coming soon</p>` with `<ProductsTab />` in the main `MenuManagement` component.

**Step 3: Run lint**

Run: `bun x ultracite fix && bun x ultracite check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/pages/MenuManagement.tsx
git commit -m "feat: implement products tab with CRUD, category filter, and price formatting"
```

---

### Task 6: Edge cases and error handling

**Files:**
- Modify: `src/pages/MenuManagement.tsx`
- Modify: `src/db/menu.ts`

**Step 1: Add try-catch error handling to all async operations**

Wrap `handleSave`, `handleDelete`, `toggleActive`, `moveUp`, `moveDown` in try-catch blocks. On error, show a simple error banner or state.

Add an `errorMessage` signal and display it as a dismissible banner at the top of each tab.

**Step 2: Add unique name validation**

Before saving a category or product, check if the name already exists (case-insensitive) to give a user-friendly error instead of relying on the DB constraint.

**Step 3: Prevent deleting category with products (optional safety)**

The current implementation warns but allows deletion. Consider whether to block deletion or allow it (products would have null categoryId). The PRD says "confirm dialog, check if products exist" — the warning is sufficient.

**Step 4: Run lint**

Run: `bun x ultracite fix && bun x ultracite check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pages/MenuManagement.tsx src/db/menu.ts
git commit -m "feat: add error handling and name uniqueness validation to menu management"
```

---

### Task 7: Test on device

**Files:** None (manual testing)

**Step 1: Build and deploy**

Run: `bun tauri android dev` (or use `./dev` script)

**Step 2: Test categories CRUD**
1. Navigate to Menu (must be logged in as owner/manager)
2. Tap "Kategori" tab
3. Tap "+ Tambah" → enter name → "Simpan" → verify appears in list
4. Tap edit icon → change name → "Simpan" → verify updated
5. Tap active toggle → verify badge changes
6. Tap up/down arrows → verify order changes
7. Tap delete → verify confirmation dialog → confirm → verify removed
8. Try adding duplicate name → verify error

**Step 3: Test products CRUD**
1. Tap "Produk" tab
2. Tap category filter → select a category → verify filtered list
3. Tap "+ Tambah" → fill all fields → "Simpan" → verify appears
4. Verify price shows as formatted IDR (e.g., "Rp 25.000")
5. Tap edit → modify fields → save → verify updated
6. Tap delete → confirm → verify removed
7. Toggle active → verify badge changes

**Step 4: Test data persistence**
1. Add categories and products
2. Kill the app (force stop)
3. Relaunch and login
4. Navigate to Menu → verify all data is still there

**Step 5: Commit any fixes if needed**

```bash
git add -A
git commit -m "fix: menu management bug fixes from device testing"
```

---

### Task 8: Final lint pass and cleanup

**Files:** All modified files

**Step 1: Run full lint**

Run: `bun x ultracite check`
Expected: PASS (zero errors)

**Step 2: Run format**

Run: `bun x ultracite fix`

**Step 3: Commit any remaining formatting changes**

```bash
git add -A
git commit -m "chore: ultracite formatting pass for menu management"
```
