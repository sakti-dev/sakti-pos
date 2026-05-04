# Sakti POS — Implementation Milestones

Reference: [PRD](./PRD.md)

---

## Milestone 1: Project Foundation

Get the project skeleton working with all tooling configured.

- [x] Install and configure TailwindCSS v4 (`@tailwindcss/vite` plugin)
- [x] Install `@solidjs/router`
- [x] Set up frontend folder structure (`src/db/`, `src/lib/`, `src/pages/`, `src/components/`)
- [x] Create `Layout` component with sidebar navigation shell
- [x] Set up `@solidjs/router` with placeholder routes: `/login`, `/pos`, `/menu`, `/orders`, `/users`, `/settings`
- [x] Create blank placeholder page components for each route
- [x] Configure Tauri window for Android-friendly defaults (fullscreen, no title bar)
- [x] Verify `bun tauri dev` builds and runs on Android emulator/device
- [x] Clean up scaffold boilerplate (remove greet command, logo assets, App.css)

---

## Milestone 2: Database Layer ✅

Set up SQLite backend with Drizzle ORM frontend proxy.

### Rust side

- [x] Add `tauri-plugin-sql` crate to `src-tauri/Cargo.toml` (sqlite feature)
- [x] Add `sqlx` crate (sqlite, runtime-tokio) for custom `run_sql` command
- [x] Register `tauri-plugin-sql` in `src-tauri/src/lib.rs` with migrations via `include_str!`
- [x] Add `sql:default` permission in `src-tauri/capabilities/default.json`
- [x] Create `src-tauri/src/drizzle_proxy.rs` — custom `run_sql` command using `sqlx::SqlitePool` directly (bypasses broken plugin-sql JS API)
- [x] `sqlx_value_to_json` with fallback chain (i64 → f64 → String) for aggregate columns like `COUNT(*)`

### Frontend side

- [x] Install `drizzle-orm` and `@tauri-apps/plugin-sql`
- [x] Install `drizzle-kit` as a dev dependency
- [x] Create `src/db/schema.ts` — Drizzle table definitions for all 5 tables (users, categories, products, orders, order_items)
- [x] Create `src/db/index.ts` — Drizzle client using `sqlite-proxy` driver, wired to `invoke("run_sql")`
- [x] Create `drizzle.config.ts` at the project root for Drizzle Kit
- [x] Generate initial migration SQL with `drizzle-kit generate`
- [x] Wire migration runner into app startup (Rust-side via `tauri_plugin_sql::Builder`)
- [x] Add unique constraint on `users.name` (migration `drizzle/0001_silky_genesis.sql`)
- [x] Seed deferred to Milestone 3
- [x] Test: verify app creates DB on Waydroid, runs migrations, Drizzle queries work

### Key decisions
- **`tauri-plugin-sql`** kept ONLY for running migrations via `Database.load()` — its JS `execute()`/`select()` API is broken with parameterized queries
- **Custom `run_sql` Rust command** using `sqlx` directly with `?` placeholders — works reliably
- **Two separate DB connections** — plugin-sql for migrations, sqlx for queries; same file, independent pools

---

## Milestone 3: Authentication ✅

PIN-based login with session management. Implemented in TypeScript (not Rust) — simpler for v1, can add server-side auth later.

### Frontend side

- [x] Install `bcryptjs` for PIN hashing
- [x] Create `src/lib/auth-provider.ts` — `LocalAuthProvider` class with `seedDefaultOwner()` using `INSERT OR IGNORE`
- [x] Create `src/lib/auth.ts` — auth session store (SolidJS reactive store)
  - [x] Store current user: `{ id, name, role }`
  - [x] `login(userId, pin)` → verifies PIN via bcryptjs → sets session
  - [x] `logout()` → clears session → navigates to `/login`
  - [x] `isAuthenticated()` signal
  - [x] `currentUser()` signal
  - [x] Persist last user ID to localStorage
  - [x] Require PIN re-entry after app restart
- [x] Create `src/components/PinPad.tsx` — reusable numeric PIN input (6 digits, dot indicators, 3x4 grid)
- [x] Create `src/pages/Login.tsx` — user grid + PIN pad
  - [x] Show list of active users (name + initial avatar)
  - [x] Remember last user and pre-select
  - [x] Tap user → show PIN pad
  - [x] Wrong PIN → error feedback, rate limit (5 attempts / 30s lockout)
  - [x] Success → navigate to `/pos` (cashier) or `/menu` (manager/owner)
- [x] `RequireAuth` route guard in `src/App.tsx` with optional `roles` prop
- [x] `src/components/Layout.tsx` — nav hidden on `/login`, auth redirect
- [x] Create `src/components/ChangePinDialog.tsx` — new PIN → confirm → save
- [x] Seed: default owner (name "Owner", PIN "123456", role "owner") via `INSERT OR IGNORE`
- [x] Test: login flow verified on Waydroid, no duplicate users on restart, session clears on logout

### Key decisions
- **Auth in TypeScript, not Rust** — simpler, no need for Rust auth commands
- **`bcryptjs`** instead of argon2 — pure JS, no native deps, fine for local-only v1
- **`INSERT OR IGNORE`** for seed — combined with unique name constraint, prevents duplicates without count checks
- **Rust `AuthProvider` trait deferred** — not needed until server-side auth in v2

---

## Milestone 4: Menu Management ✅

CRUD for categories and products.

### Categories

- [x] Create `src/pages/MenuManagement.tsx` as nested route wrapper (renders `props.children` via `RouteSectionProps`)
- [x] Create `src/pages/menu/index.tsx` — tab switcher with Kategori/Produk link cards
- [x] Create `src/pages/menu/category-list.tsx` — list view with name, active status, edit/delete actions
- [x] Create `src/pages/menu/category-form.tsx` — full-screen add/edit (name only)
- [x] Delete category: `ConfirmBottomSheet` confirmation, check if products exist in category
- [x] Toggle active/inactive
- [x] Alphabetical ordering (no manual sort — drag-and-drop deferred)

### Products

- [x] Create `src/pages/menu/product-list.tsx` — grouped view by category with sticky section headers, flat list when filtered
- [x] Category filter using drawer-based `Select` component
- [x] List shows: name, price (formatted IDR), active status
- [x] Create `src/pages/menu/product-form.tsx` — full-screen add/edit: name, category (drawer select), price, image URL
- [x] Toggle product active/inactive
- [x] Price formatting helper (`formatIDR(25000)` → "Rp 25.000") in `src/lib/utils.ts` with tests
- [x] Data layer in `src/db/menu.ts` — 12 functions, types: `Category`, `NewCategory`, `Product`, `NewProduct`
- [x] Test: `formatIDR` tests (zero, positive, large amount)

### UI Components

- [x] `src/components/ui/drawer.tsx` — Drawer component using `@corvu/drawer` with safe-area bottom padding and manual overlay dismiss
- [x] `src/components/ui/select.tsx` — Drawer-based mobile Select (replaces native `<select>` and Kobalte portal select)
- [x] `src/components/ui/bottom-sheet.tsx` — `BottomSheet` + `ConfirmBottomSheet`
- [x] `src/components/ui/page-header.tsx` — Sticky header with back button

### Key decisions

- **Drawer-based Select** over Kobalte portal select — mobile-native feel, avoids portal positioning issues on Android
- **Corvu auto-dismiss disabled** (`modal={false}`, `trapFocus={false}`, etc.) — `transitionEnd` is unreliable on Waydroid/WebView, causing stale Dismissible to immediately close reopened drawers
- **Full-screen routes over modal dialogs** — Android convention, better UX on mobile
- **Bottom sheet for delete confirmation** — lighter than full screen for yes/no actions
- **Alphabetical ordering, no manual sort** — `orderBy(name, id)` for both categories and products; drag-and-drop deferred
- **`RouteSectionProps` instead of `Outlet`** — `@solidjs/router` v0.16 has no `Outlet` export

---

## Milestone 5: POS Ordering ✅

The core ordering flow — browse menu, cart, checkout, payment.

### Product browsing

- [x] Create `src/pages/pos.tsx` — full-screen mobile layout (category tabs, product grid, cart panel)
- [x] Create `src/components/pos/category-tabs.tsx` — horizontal scrollable category tabs, "Semua" tab
- [x] Create `src/components/pos/product-grid.tsx` — grid of large tap-friendly buttons showing product name + price
- [x] Only show active products from active categories
- [x] Empty state when no products in selected category

### Cart

- [x] Create `src/lib/cart.ts` — cart state management (SolidJS reactive store)
  - [x] `cartItems()` — reactive list of `{ product, quantity }`
  - [x] `addToCart(product)` — add or increment quantity
  - [x] `removeFromCart(productId)` — remove item
  - [x] `updateQuantity(productId, qty)` — set specific quantity
  - [x] `cartTotal()` — computed total
  - [x] `clearCart()` — empty cart
- [x] Create `src/components/pos/cart-panel.tsx` — cart panel
  - [x] Item list with product name, quantity (+/- buttons), line total
  - [x] Running total at bottom
  - [x] "Bayar" (Pay) button
  - [x] "Kosongkan" (Clear) button
  - [x] Empty cart state

### Checkout & Payment

- [x] Create `src/components/pos/payment-dialog.tsx` — full-screen drawer
  - [x] Order summary (items + total)
  - [x] Payment method selector: "Tunai" (Cash) / "QRIS" toggle buttons
  - [x] Cash flow: enter amount received → calculate and show change (kembalian)
  - [x] QRIS flow: show confirmation prompt, mark as paid
  - [x] "Konfirmasi" (Confirm) button — disabled until valid payment
  - [x] "Batal" (Cancel) button
- [x] Create order submission logic (`src/db/orders.ts`)
  - [x] Generate daily order number (query max number for today, increment)
  - [x] Insert into `orders` table with all fields
  - [x] Insert into `order_items` table with name/price snapshots
  - [x] Wrap in `run_sql_batch` (transaction via Rust command)
- [x] Success state: show order number + "Selesai!" (Done!) for 2 seconds, then clear cart

---

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
- [x] Test: create orders via POS, verify they appear in history, filter works, cancel works

---

## Milestone 7: User Management ✅

Manage users and roles (owner access only).

- [x] Create `src/db/users.ts` — data layer with getUsers, getUser, createUser, updateUser, countActiveOwners
- [x] Create `src/pages/users/user-management.tsx` — nested route wrapper (like MenuManagement)
- [x] Create `src/pages/users/user-list.tsx` — user list with role badges (owner=green, manager=blue, cashier=gray), avatar initials, active status
- [x] Create `src/pages/users/user-form.tsx` — full-screen add/edit form with name, role (drawer Select), PIN + confirm (add mode), active toggle (edit mode)
- [x] Create `src/pages/users/reset-pin.tsx` — new PIN + confirm PIN form
- [x] Nested routes under `/users` in App.tsx (owner-only via RequireAuth)
- [x] Business rules enforced:
  - [x] Cannot deactivate the last active owner
  - [x] Cannot change own role to non-owner if you're the last owner
  - [x] Cannot deactivate yourself
- [x] PIN hashing via existing `hashPin()` from `src/lib/auth-provider.ts`
- [x] Sidebar menu items hidden based on user role (cashier: POS, Orders, Settings; manager: + Menu; owner: + Users)
- [x] Animated sidebar open/close with `@solid-primitives/presence`
- [x] PageHeader back button uses `replace: true` navigation (prevents back-loop)
- [x] Test: full user CRUD, role enforcement, edge case protections

### Key decisions
- **Nested routes** (like `/menu`) — full-screen form pages with back navigation
- **PIN input via `type="password"`** — not PinPad, since admin sets PINs for others
- **Business rules in TypeScript** — checked before DB writes with descriptive Indonesian error messages
- **`@solid-primitives/presence`** for sidebar animation — manages mount/unmount timing for enter/exit transitions

---

## Milestone 8: Settings & Polish

Final milestone before v1 release.

### Settings page

- [ ] Create `src/pages/Settings.tsx`
- [ ] App info (version, database path, storage usage)
- [ ] Change own PIN
- [ ] Logout button

### UI Polish

- [ ] Consistent Indonesian language across all UI text
- [ ] Loading states for all async operations (spinners/skeletons)
- [ ] Error handling: toast notifications for DB errors, network errors
- [ ] Empty states for all lists (no products, no orders, no users)
- [ ] Responsive layout adjustments for phone vs tablet
- [ ] Offline indicator banner (informational, app works fully offline)
- [ ] App icon and splash screen configuration

### Hardening

- [ ] Add `noUnusedLocals` / `noUnusedParameters` compliance (already in tsconfig)
- [ ] Rust clippy pass with no warnings
- [ ] Test full user journey: login → manage menu → take orders → view history → manage users
- [ ] Test with 1000+ products and 10,000+ orders for performance
- [ ] Test app cold start (kill process, relaunch, verify data intact)
- [ ] Test concurrent usage edge cases (rapid tapping, double-submit prevention on payment)
