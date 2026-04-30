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

## Milestone 4: Menu Management

CRUD for categories and products.

### Categories

- [ ] Create `src/pages/MenuManagement.tsx` with tab layout (Categories | Products)
- [ ] Categories tab: list view with name, sort order, active status
- [ ] Add category dialog: name field
- [ ] Edit category dialog: name, sort order, toggle active
- [ ] Delete category: confirm dialog, check if products exist in category
- [ ] Reorder categories (drag or up/down buttons)

### Products

- [ ] Products tab: list view filterable by category dropdown
- [ ] List shows: name, category, price (formatted IDR), active status
- [ ] Add product dialog: name, category (dropdown), price (numeric), image URL (optional), sort order
- [ ] Edit product dialog: same fields as add
- [ ] Toggle product active/inactive
- [ ] Price formatting helper (e.g., `formatIDR(25000)` → "Rp 25.000")
- [ ] Test: full CRUD cycle for categories and products, verify data persists in DB

---

## Milestone 5: POS Ordering

The core ordering flow — browse menu, cart, checkout, payment.

### Product browsing

- [ ] Create `src/pages/POS.tsx` — split layout (products left, cart right)
- [ ] Create `src/components/CategoryTabs.tsx` — horizontal scrollable category tabs, "All" tab
- [ ] Create `src/components/ProductGrid.tsx` — grid of large tap-friendly buttons showing product name + price
- [ ] Only show active products from active categories
- [ ] Empty state when no products in selected category

### Cart

- [ ] Create `src/lib/orders.ts` — cart state management (SolidJS reactive store)
  - [ ] `cartItems()` — reactive list of `{ product, quantity }`
  - [ ] `addToCart(product)` — add or increment quantity
  - [ ] `removeFromCart(productId)` — remove item
  - [ ] `updateQuantity(productId, qty)` — set specific quantity
  - [ ] `cartTotal()` — computed total
  - [ ] `clearCart()` — empty cart
- [ ] Create `src/components/Cart.tsx` — cart panel
  - [ ] Item list with product name, quantity (+/- buttons), line total
  - [ ] Running total at bottom
  - [ ] "Bayar" (Pay) button
  - [ ] "Kosongkan" (Clear) button
  - [ ] Empty cart state

### Checkout & Payment

- [ ] Create `src/components/PaymentDialog.tsx` — modal dialog
  - [ ] Order summary (items + total)
  - [ ] Payment method selector: "Tunai" (Cash) / "QRIS" toggle buttons
  - [ ] Cash flow: enter amount received → calculate and show change (kembalian)
  - [ ] QRIS flow: show confirmation prompt, mark as paid
  - [ ] "Konfirmasi" (Confirm) button — disabled until valid payment
  - [ ] "Batal" (Cancel) button
- [ ] Create order submission logic
  - [ ] Generate daily order number (query max number for today, increment)
  - [ ] Insert into `orders` table with all fields
  - [ ] Insert into `order_items` table with name/price snapshots
  - [ ] Wrap in `db_execute_batch` (transaction)
- [ ] Success state: show order number + "Selesai!" (Done!) for 2 seconds, then clear cart
- [ ] Test: full flow — add items to cart, pay with cash, verify order in DB, verify cart clears

---

## Milestone 6: Order History

View and browse past orders.

- [ ] Create `src/pages/OrderHistory.tsx`
- [ ] Order list: date, order number, total, payment method, cashier name, status badge
- [ ] Default view: today's orders
- [ ] Date range filter (simple date inputs)
- [ ] Status filter (all / completed / cancelled)
- [ ] Create `src/components/OrderCard.tsx` — expandable order card
  - [ ] Header: order number, time, total, status
  - [ ] Expanded: line items (product name, qty, unit price, subtotal)
  - [ ] Payment details: method, amount paid, change
  - [ ] Cashier name
- [ ] Daily summary bar at top: total orders count, total revenue, cash vs QRIS breakdown
- [ ] Cancel order action (owner/manager only) — sets status to `cancelled`
- [ ] Test: create orders via POS, verify they appear in history, filter works, cancel works

---

## Milestone 7: User Management

Manage users and roles (owner access only).

- [ ] Create `src/pages/Users.tsx` (owner-only route)
- [ ] User list: name, role badge, active status, created date
- [ ] Add user dialog: name, PIN (enter + confirm), role dropdown (owner/manager/cashier)
- [ ] Edit user dialog: name, role, toggle active
- [ ] Reset PIN dialog: enter new PIN + confirm
- [ ] Business rules:
  - [ ] Cannot deactivate the last active owner
  - [ ] Cannot change own role to non-owner if you're the last owner
  - [ ] Cannot deactivate yourself
- [ ] Pin hashing: send PIN to Rust command for hashing, store hash only
- [ ] Test: full user CRUD, role enforcement, edge case protections

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
