# Milestone 8: Settings & Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the final milestone — build the Settings page, add toast notifications, polish loading/empty/error states across all pages, and harden the codebase for v1 release.

**Architecture:** Settings page is a simple AppShell page (not a nested route — no sub-pages). Toast notifications use a global SolidJS reactive store + a `<Toaster>` component rendered in `Layout`. All polish tasks are incremental improvements to existing components.

**Tech Stack:** SolidJS, TailwindCSS, Tauri 2.0 API (`@tauri-apps/api`), existing UI primitives (Drawer, Button, etc.)

---

## Task 1: Toast Notification System

Create a lightweight toast system for user feedback (success, error, info messages). No external dependency — pure SolidJS reactive store.

**Files:**
- Create: `src/lib/toast.ts`
- Create: `src/components/ui/toaster.tsx`
- Modify: `src/components/layout.tsx` — add `<Toaster />` to Layout

**Step 1: Create toast store (`src/lib/toast.ts`)**

```ts
import { createSignal } from "solid-js"

export interface Toast {
  id: number
  message: string
  variant: "error" | "info" | "success"
}

let nextId = 0

const [toasts, setToasts] = createSignal<Toast[]>([])

export { toasts }

export function toast(message: string, variant: Toast["variant"] = "info") {
  const id = nextId++
  setToasts((prev) => [...prev, { id, message, variant }])
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, 3000)
}

export function dismissToast(id: number) {
  setToasts((prev) => prev.filter((t) => t.id !== id))
}
```

**Step 2: Create Toaster component (`src/components/ui/toaster.tsx`)**

```tsx
import { For, Show } from "solid-js"
import { dismissToast, toasts, type Toast } from "~/lib/toast"
import { cn } from "~/lib/utils"

const VARIANT_STYLES: Record<Toast["variant"], string> = {
  error: "bg-destructive text-destructive-foreground",
  info: "bg-card text-foreground border",
  success: "bg-success text-success-foreground",
}

export function Toaster() {
  return (
    <div
      aria-live="polite"
      class="fixed inset-x-0 z-[100] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
    >
      <For each={toasts()}>
        {(t) => (
          <div
            class={cn(
              "flex w-full max-w-sm items-center justify-between rounded-xl px-4 py-3 shadow-lg text-sm font-medium",
              VARIANT_STYLES[t.variant]
            )}
          >
            <span>{t.message}</span>
            <button
              class="ml-2 opacity-70 hover:opacity-100"
              onClick={() => dismissToast(t.id)}
              type="button"
            >
              ✕
            </button>
          </div>
        )}
      </For>
    </div>
  )
}
```

**Step 3: Wire Toaster into Layout (`src/components/layout.tsx`)**

Add import and render `<Toaster />` as the last child of the outer `<div>` in the `Layout` component (not AppShell — it should appear on all pages including login):

Add import:
```ts
import { Toaster } from "~/components/ui/toaster";
```

In the `Layout` component's return, add `<Toaster />` just before the closing `</div>` of the outer wrapper:

```tsx
      <main class="flex-1 overflow-hidden">{props.children}</main>
      <Toaster />
    </div>
```

**Step 4: Verify build**

Run: `bun x ultracite check`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/toast.ts src/components/ui/toaster.tsx src/components/layout.tsx
git commit -m "feat: add toast notification system"
```

---

## Task 2: Settings Page — UI Shell

Build the Settings page with profile info, app info, and action buttons.

**Files:**
- Modify: `src/pages/settings.tsx` — replace placeholder with full settings UI

**Step 1: Implement Settings page**

Replace entire content of `src/pages/settings.tsx`:

```tsx
import { useNavigate } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { ConfirmDrawer } from "~/components/confirm-drawer";
import { AppShell } from "~/components/layout";
import { Button } from "~/components/ui/button";
import { currentUser, logout } from "~/lib/auth";

export default function Settings() {
  const navigate = useNavigate();
  const user = currentUser();
  const [showLogoutConfirm, setShowLogoutConfirm] = createSignal(false);
  const [showPinDrawer, setShowPinDrawer] = createSignal(false);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <AppShell title="Pengaturan">
      <div class="space-y-4 p-4">
        <div class="flex items-center gap-3 rounded-xl border bg-card p-4">
          <div class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-lg text-primary-foreground">
            {user?.name.charAt(0).toUpperCase() ?? "?"}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold text-lg">{user?.name}</p>
            <p class="text-muted-foreground text-sm capitalize">{user?.role}</p>
          </div>
        </div>

        <section class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">Akun</h2>
          <div class="rounded-xl border bg-card">
            <button
              class="flex w-full items-center justify-between p-4 active:bg-accent"
              onClick={() => setShowPinDrawer(true)}
              type="button"
            >
              <span>Ubah PIN</span>
              <svg
                aria-hidden="true"
                class="size-5 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </section>

        <section class="space-y-2">
          <h2 class="font-medium text-muted-foreground text-sm">Aplikasi</h2>
          <div class="rounded-xl border bg-card">
            <div class="flex items-center justify-between border-b p-4">
              <span>Versi</span>
              <span class="text-muted-foreground text-sm">0.1.0</span>
            </div>
            <Show when={user?.role === "owner"}>
              <div class="flex items-center justify-between p-4">
                <span>Akses</span>
                <span class="text-muted-foreground text-sm">Owner</span>
              </div>
            </Show>
          </div>
        </section>

        <Button
          class="w-full"
          onClick={() => setShowLogoutConfirm(true)}
          variant="outline"
        >
          Keluar
        </Button>
      </div>

      <ConfirmDrawer
        confirmLabel="Keluar"
        message="Anda akan keluar dari aplikasi."
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        open={showLogoutConfirm()}
        title="Keluar"
        variant="destructive"
      />

      <Show when={showPinDrawer()}>
        <ChangePinDrawer onClose={() => setShowPinDrawer(false)} />
      </Show>
    </AppShell>
  );
}
```

Note: This file references a `ChangePinDrawer` component that will be added in Task 3. For now, the file won't compile. That's fine — we'll add it next.

**Step 2: Commit**

```bash
git add src/pages/settings.tsx
git commit -m "feat: settings page shell with profile, app info, logout"
```

---

## Task 3: Settings Page — Change PIN Drawer

Add the in-page drawer for changing the current user's PIN.

**Files:**
- Modify: `src/pages/settings.tsx` — add `ChangePinDrawer` component

**Step 1: Add ChangePinDrawer to settings.tsx**

Add the following imports to the top of `src/pages/settings.tsx`:

```ts
import { changeCurrentUserPin } from "~/lib/auth";
import { toast } from "~/lib/toast";
```

Add this component at the bottom of the file (before the export, or after it as a separate function component):

```tsx
function ChangePinDrawer(props: { onClose: () => void }) {
  const [currentPin, setCurrentPin] = createSignal("");
  const [newPin, setNewPin] = createSignal("");
  const [confirmPin, setConfirmPin] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const isValid = () => {
    const np = newPin();
    const cp = confirmPin();
    return np.length >= 4 && np === cp;
  };

  const handleSubmit = async () => {
    if (!isValid()) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await changeCurrentUserPin(newPin());
      toast("PIN berhasil diubah", "success");
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmDrawer
      confirmLabel="Simpan"
      message=""
      onClose={props.onClose}
      onConfirm={handleSubmit}
      open={true}
      title="Ubah PIN"
    >
      <div class="space-y-3">
        <Show when={error()}>
          {(msg) => (
            <div class="rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
              {msg()}
            </div>
          )}
        </Show>
        <div>
          <label class="mb-1 block text-muted-foreground text-sm">PIN Baru</label>
          <input
            autocomplete="new-password"
            class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            maxlength={6}
            onInput={(e) => setNewPin(e.currentTarget.value)}
            placeholder="Min. 4 digit"
            type="password"
          />
        </div>
        <div>
          <label class="mb-1 block text-muted-foreground text-sm">Konfirmasi PIN</label>
          <input
            autocomplete="new-password"
            class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            maxlength={6}
            onInput={(e) => setConfirmPin(e.currentTarget.value)}
            placeholder="Ulangi PIN baru"
            type="password"
          />
        </div>
        <Show when={newPin() && confirmPin() && newPin() !== confirmPin()}>
          <p class="text-destructive text-sm">PIN tidak cocok</p>
        </Show>
      </div>
    </ConfirmDrawer>
  );
}
```

Wait — `ConfirmDrawer` doesn't accept `children`. We need to use a regular Drawer instead. Let me update the approach.

Replace the `ChangePinDrawer` with this version that uses Drawer directly:

```tsx
import {
  Drawer,
  DrawerContent,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "~/components/ui/drawer";
```

```tsx
function ChangePinDrawer(props: { onClose: () => void }) {
  const [newPin, setNewPin] = createSignal("");
  const [confirmPin, setConfirmPin] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const isValid = () => {
    const np = newPin();
    const cp = confirmPin();
    return np.length >= 4 && np === cp;
  };

  const handleSubmit = async () => {
    if (!isValid()) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      await changeCurrentUserPin(newPin());
      toast("PIN berhasil diubah", "success");
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengubah PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      closeOnEscapeKeyDown={false}
      closeOnOutsideFocus={false}
      modal={false}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      open={true}
      trapFocus={false}
    >
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerContent class="px-4 pb-6">
          <DrawerTitle>Ubah PIN</DrawerTitle>
          <div class="space-y-3 pt-2">
            <Show when={error()}>
              {(msg) => (
                <div class="rounded-lg bg-error px-3 py-2 text-error-foreground text-sm">
                  {msg()}
                </div>
              )}
            </Show>
            <div>
              <label class="mb-1 block text-muted-foreground text-sm">PIN Baru</label>
              <input
                autocomplete="new-password"
                class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                maxlength={6}
                onInput={(e) => setNewPin(e.currentTarget.value)}
                placeholder="Min. 4 digit"
                type="password"
              />
            </div>
            <div>
              <label class="mb-1 block text-muted-foreground text-sm">Konfirmasi PIN</label>
              <input
                autocomplete="new-password"
                class="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                maxlength={6}
                onInput={(e) => setConfirmPin(e.currentTarget.value)}
                placeholder="Ulangi PIN baru"
                type="password"
              />
            </div>
            <Show when={newPin() && confirmPin() && newPin() !== confirmPin()}>
              <p class="text-destructive text-sm">PIN tidak cocok</p>
            </Show>
          </div>
          <div class="mt-4 flex gap-2">
            <Button class="flex-1" onClick={props.onClose} variant="outline">
              Batal
            </Button>
            <Button class="flex-1" disabled={!isValid() || saving()} onClick={handleSubmit}>
              {saving() ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}
```

**Step 2: Verify build**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add src/pages/settings.tsx
git commit -m "feat: add change PIN drawer to settings page"
```

---

## Task 4: Add Toast Feedback to Existing Pages

Wire toast notifications into existing error/success flows. Replace inline error banners with toasts where appropriate.

**Files:**
- Modify: `src/pages/menu/category-list.tsx` — toast on delete/toggle errors
- Modify: `src/pages/menu/product-list.tsx` — toast on delete/toggle errors
- Modify: `src/pages/order-history.tsx` — toast on cancel success/error
- Modify: `src/pages/pos.tsx` — toast on order creation error
- Modify: `src/components/pos/payment-dialog.tsx` — prevent double-submit
- Modify: `src/pages/users/user-form.tsx` — toast on save success/error
- Modify: `src/pages/users/reset-pin.tsx` — toast on success

**Step 1: Add toast to category-list.tsx**

Add import:
```ts
import { toast } from "~/lib/toast";
```

In `handleDelete`, after `await refetch()`, add:
```ts
toast("Kategori dihapus", "success");
```

In `toggleActive`, after `await refetch()`, add:
```ts
toast(cat.isActive ? "Kategori dinonaktifkan" : "Kategori diaktifkan", "success");
```

Keep existing inline error banner — toasts supplement, not replace, the error display for these pages.

**Step 2: Add toast to product-list.tsx**

Same pattern as category-list.

**Step 3: Add toast to order-history.tsx**

In `handleCancel`, after `await refetch()`, add:
```ts
toast("Pesanan dibatalkan", "success");
```

**Step 4: Add toast to pos.tsx**

Wrap the `handlePayment` try/catch — if `createOrder` throws, show toast:
```ts
try {
  const orderNumber = await createOrder({ ... });
  // ... existing success logic
} catch (e) {
  toast("Gagal membuat pesanan", "error");
}
```

**Step 5: Prevent double-submit in payment-dialog.tsx**

Add a `submitting` signal:
```ts
const [submitting, setSubmitting] = createSignal(false);
```

In `handleConfirm`, wrap:
```ts
const handleConfirm = () => {
  if (submitting()) return;
  setSubmitting(true);
  props.onConfirm({ ... });
};
```

And in the parent `pos.tsx`, close the payment dialog only after successful order creation (already done — `setPaymentOpen(false)` is after `createOrder`).

Actually, since `onConfirm` is synchronous (it calls `props.onConfirm` which triggers `handlePayment` in pos.tsx which is async), we should handle this differently. The simplest approach: disable the confirm button while the order is being processed.

Add to `PaymentDialog`:
```ts
interface PaymentDialogProps {
  // ... existing
  loading?: boolean;
}
```

And in `pos.tsx`, add a `paymentLoading` signal, set it true before `createOrder`, false after. Pass to `PaymentDialog`:
```tsx
<PaymentDialog loading={paymentLoading()} ... />
```

In `PaymentDialog`, disable confirm button when `props.loading`:
```tsx
<Button disabled={!isValid() || props.loading} onClick={handleConfirm}>
  {props.loading ? "Memproses..." : "Konfirmasi"}
</Button>
```

**Step 6: Add toast to user-form.tsx**

Add import: `import { toast } from "~/lib/toast";`

On successful save, add:
```ts
toast(isEdit ? "Pengguna diperbarui" : "Pengguna ditambahkan", "success");
```

**Step 7: Add toast to reset-pin.tsx**

On successful PIN reset:
```ts
toast("PIN berhasil direset", "success");
```

**Step 8: Verify build**

Run: `bun x ultracite check`
Expected: No errors

**Step 9: Commit**

```bash
git add src/pages/menu/category-list.tsx src/pages/menu/product-list.tsx src/pages/order-history.tsx src/pages/pos.tsx src/components/pos/payment-dialog.tsx src/pages/users/user-form.tsx src/pages/users/reset-pin.tsx
git commit -m "feat: add toast feedback and double-submit prevention"
```

---

## Task 5: Loading States

Add loading indicators to pages that use `createResource` but don't show loading state.

**Files:**
- Modify: `src/pages/users/user-list.tsx` — show skeleton while loading
- Modify: `src/pages/menu/category-list.tsx` — show skeleton while loading
- Modify: `src/pages/menu/product-list.tsx` — show skeleton while loading
- Modify: `src/pages/order-history.tsx` — show skeleton while loading

**Step 1: Create a simple skeleton helper in `src/lib/utils.ts`**

No need for a separate component. Each page can use a simple `<div>` skeleton pattern. But a reusable component would be cleaner.

Create `src/components/ui/skeleton.tsx`:

```tsx
import { cn } from "~/lib/utils"

export function Skeleton(props: { class?: string }) {
  return (
    <div
      class={cn("animate-pulse rounded-md bg-muted", props.class)}
    />
  )
}
```

**Step 2: Add loading state to user-list.tsx**

The `users` resource from `createResource(getUsers)` is initially `undefined` while loading. Add a `Show` for the loading state:

```tsx
<Show
  fallback={
    <div class="space-y-2">
      <For each={[1, 2, 3]}>
        {() => (
          <div class="flex items-center gap-3 rounded-xl border bg-card p-3">
            <Skeleton class="size-10 shrink-0 rounded-full" />
            <div class="flex-1 space-y-2">
              <Skeleton class="h-4 w-24" />
              <Skeleton class="h-3 w-16" />
            </div>
          </div>
        )}
      </For>
    </div>
  }
  when={users() !== undefined}
>
  {/* ... existing content */}
</Show>
```

Note: The existing `<Show when={users() && users()!.length > 0}>` already handles the empty state. We need to restructure to: loading → empty → data.

```tsx
<Show
  fallback={
    <div class="space-y-2">
      <For each={[1, 2, 3]}>
        {() => (
          <div class="flex items-center gap-3 rounded-xl border bg-card p-3">
            <Skeleton class="size-10 shrink-0 rounded-full" />
            <div class="flex-1 space-y-2">
              <Skeleton class="h-4 w-24" />
              <Skeleton class="h-3 w-16" />
            </div>
          </div>
        )}
      </For>
    </div>
  }
  when={users() !== undefined}
>
  <Show
    fallback={/* empty state */}
    when={users()!.length > 0}
  >
    {/* list */}
  </Show>
</Show>
```

**Step 3: Apply same pattern to category-list.tsx and product-list.tsx**

Same skeleton pattern, adjusted for list items.

**Step 4: Apply to order-history.tsx**

The orders resource already uses `createResource`. Add skeleton for the order cards.

**Step 5: Verify build**

Run: `bun x ultracite check`
Expected: No errors

**Step 6: Commit**

```bash
git add src/components/ui/skeleton.tsx src/pages/users/user-list.tsx src/pages/menu/category-list.tsx src/pages/menu/product-list.tsx src/pages/order-history.tsx
git commit -m "feat: add loading skeleton states to list pages"
```

---

## Task 6: Empty State Improvements

Audit and improve empty states across the app. Ensure all lists have descriptive empty messages with actionable hints.

**Files:**
- Modify: `src/components/pos/product-grid.tsx` — check empty state
- Modify: `src/components/pos/cart-panel.tsx` — check empty state (already has "Keranjang kosong")
- Modify: `src/pages/order-history.tsx` — enhance empty state

**Step 1: Read and update product-grid.tsx empty state**

The product grid should show a meaningful empty state when no products are found (either no products at all, or search filter returns nothing).

**Step 2: Update order-history empty state**

The current empty state "Belum ada pesanan" is fine but could be more specific based on the active filter.

**Step 3: Verify build**

Run: `bun x ultracite check`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/pos/product-grid.tsx src/components/pos/cart-panel.tsx src/pages/order-history.tsx
git commit -m "polish: improve empty states across app"
```

---

## Task 7: Offline Indicator Banner

Add a small informational banner that appears when the device is offline. The app works fully offline (local SQLite), so this is informational only.

**Files:**
- Create: `src/components/ui/offline-banner.tsx`
- Modify: `src/components/layout.tsx` — render banner in Layout

**Step 1: Create offline banner component**

```tsx
import { createSignal, onCleanup, onMount, Show } from "solid-js"

export function OfflineBanner() {
  const [offline, setOffline] = createSignal(!navigator.onLine)

  onMount(() => {
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    onCleanup(() => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    })
  })

  return (
    <Show when={offline()}>
      <div class="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-warning-foreground text-sm">
        <svg aria-hidden="true" class="size-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <line x1="1" x2="23" y1="1" y2="23" />
          <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
          <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
          <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
          <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" x2="12.01" y1="20" y2="20" />
        </svg>
        <span>Offline — data tersimpan lokal</span>
      </div>
    </Show>
  )
}
```

**Step 2: Add to Layout**

In `src/components/layout.tsx`, import and render `<OfflineBanner />` between the top safe area padding and `<main>`:

```tsx
import { OfflineBanner } from "~/components/ui/offline-banner";
```

```tsx
    <div
      class="flex h-screen flex-col bg-background text-foreground"
      style={{
        padding: "env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0",
      }}
    >
      <OfflineBanner />
      <main class="flex-1 overflow-hidden">{props.children}</main>
      <Toaster />
    </div>
```

**Step 3: Verify build**

Run: `bun x ultracite check`
Expected: No errors

**Step 4: Commit**

```bash
git add src/components/ui/offline-banner.tsx src/components/layout.tsx
git commit -m "feat: add offline indicator banner"
```

---

## Task 8: App Info in Settings — DB Stats

Add real database storage stats to the Settings page using a Tauri command to get the DB file size.

**Files:**
- Modify: `src-tauri/src/drizzle_proxy.rs` — add `get_db_info` command
- Modify: `src-tauri/src/lib.rs` — register new command
- Modify: `src-tauri/capabilities/default.json` — add permission
- Modify: `src/pages/settings.tsx` — display DB info

**Step 1: Add `get_db_info` Rust command**

In `src-tauri/src/drizzle_proxy.rs`, add:

```rust
#[derive(Debug, Serialize)]
pub struct DbInfo {
    pub db_path: String,
    pub size_bytes: u64,
    pub size_formatted: String,
}

#[command]
pub async fn get_db_info(app: AppHandle) -> Result<DbInfo, String> {
    let db_path = get_app_db_path(&app)?;
    let metadata = std::fs::metadata(&db_path)
        .map_err(|e| format!("Failed to get DB file info: {}", e))?;
    let size = metadata.len();
    let size_formatted = format_file_size(size);
    Ok(DbInfo {
        db_path: db_path.display().to_string(),
        size_bytes: size,
        size_formatted,
    })
}

fn format_file_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}
```

**Step 2: Register command in lib.rs**

Read `src-tauri/src/lib.rs` and add `get_db_info` to the `invoke_handler` list alongside `run_sql` and `run_sql_batch`.

**Step 3: Add permission**

In `src-tauri/capabilities/default.json`, add `"allow-get-db-info"` to the sql permissions (or create a new permission entry).

**Step 4: Update settings page to show DB info**

```tsx
import { createResource } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

interface DbInfo {
  db_path: string;
  size_formatted: string;
}

const [dbInfo] = createResource(() => invoke<DbInfo>("get_db_info"));
```

Add to the "Aplikasi" section:
```tsx
<div class="flex items-center justify-between border-b p-4">
  <span>Ukuran Data</span>
  <span class="text-muted-foreground text-sm">
    {dbInfo()?.size_formatted ?? "Memuat..."}
  </span>
</div>
```

**Step 5: Verify build**

Run: `bun x ultracite check`

Note: Rust compilation requires Android target — cannot `cargo check` on host. Verify TS only for now.

**Step 6: Commit**

```bash
git add src-tauri/src/drizzle_proxy.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json src/pages/settings.tsx
git commit -m "feat: show database storage info in settings"
```

---

## Task 9: noUnusedLocals / noUnusedParameters Cleanup

Run TypeScript compiler in strict mode and fix any unused variable warnings.

**Files:**
- Potentially modify multiple files

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: List any unused variables/parameters

**Step 2: Fix each warning**

Common patterns to fix:
- Prefix unused parameters with `_` (e.g., `_props`, `_index`)
- Remove truly unused imports

**Step 3: Verify clean**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add -u
git commit -m "chore: fix unused locals/parameters for strict TS compliance"
```

---

## Task 10: Final Lint Pass

Run Ultracite/Biome fix and verify no issues remain.

**Files:**
- Potentially modify multiple files

**Step 1: Run fix**

Run: `bun x ultracite fix`
Expected: Auto-fixes applied

**Step 2: Run check**

Run: `bun x ultracite check`
Expected: No issues

**Step 3: Commit**

```bash
git add -u
git commit -m "chore: ultracite lint pass"
```

---

## Task 11: Update Milestones

Mark Milestone 8 as complete in the milestones doc.

**Files:**
- Modify: `docs/MILESTONES.md`

**Step 1: Update milestone checkboxes**

Mark all Task 1-10 items as `[x]` and add `✅` to the header.

**Step 2: Commit**

```bash
git add docs/MILESTONES.md
git commit -m "docs: mark Milestone 8 (Settings & Polish) as complete"
```

---

## Summary of Tasks

| Task | Description | Files | Est. Time |
|------|-------------|-------|-----------|
| 1 | Toast notification system | 3 files | 10 min |
| 2 | Settings page shell | 1 file | 10 min |
| 3 | Change PIN drawer | 1 file | 10 min |
| 4 | Toast feedback + double-submit | 7 files | 15 min |
| 5 | Loading skeleton states | 5 files | 15 min |
| 6 | Empty state improvements | 3 files | 10 min |
| 7 | Offline indicator banner | 2 files | 10 min |
| 8 | DB info in settings (Rust cmd) | 4 files | 15 min |
| 9 | Unused locals/params cleanup | multiple | 10 min |
| 10 | Final lint pass | multiple | 5 min |
| 11 | Update milestones | 1 file | 2 min |

**Total estimated time: ~2 hours**

---

## Key Decisions

- **Toast over inline error for actions** — toast for success confirmations, keep inline errors for form validation
- **Skeleton loading over spinner** — matches the list layout, better perceived performance
- **No dark mode toggle in v1** — CSS variables are defined but no UI toggle; deferred
- **Offline banner is informational** — app works fully offline; banner just informs the user
- **Change PIN in-page drawer** — not a separate route; it's a simple 2-field form
- **DB info via Rust command** — file system access not available from JS; Tauri command needed
- **No external toast library** — pure SolidJS reactive store, lightweight and dependency-free
