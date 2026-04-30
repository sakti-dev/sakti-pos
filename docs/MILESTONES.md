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
- [ ] Verify `bun tauri dev` builds and runs on Android emulator/device
- [x] Clean up scaffold boilerplate (remove greet command, logo assets, App.css)

---

## Milestone 2: Database Layer

Set up the official `@tauri-apps/plugin-sql` (SQLite) backend and wire it to the Drizzle ORM frontend proxy.

### Rust side

- [x] Add `tauri-plugin-sql` crate to `src-tauri/Cargo.toml` (sqlite feature)
- [x] Register the plugin in `src-tauri/src/lib.rs` with migrations via `include_str!`
- [x] Add `sql:default` permission in `src-tauri/capabilities/default.json`

### Frontend side

- [x] Install `drizzle-orm` and `@tauri-apps/plugin-sql`
- [x] Install `drizzle-kit` as a dev dependency
- [x] Create `src/db/schema.ts` — Drizzle table definitions for all 5 tables (users, categories, products, orders, order_items)
- [x] Create `src/db/index.ts` — Drizzle client using `sqlite-proxy` driver, wired to `@tauri-apps/plugin-sql`
- [x] Create `drizzle.config.ts` at the project root for Drizzle Kit
- [x] Generate initial migration SQL with `drizzle-kit generate`
- [x] Wire migration runner into app startup (Rust-side via `tauri_plugin_sql::Builder`)
- [ ] Write a seed migration (default owner user: name "Owner", PIN hash for "1234", role "owner") — deferred to Milestone 3
- [x] Test: verify app creates DB on the Waydroid device, runs migrations, and Drizzle can query tables

---

## Milestone 3: Authentication

PIN-based login with session management. Designed for progressive enhancement — auth is abstracted behind a Rust `AuthProvider` trait so adding server-side auth later requires zero frontend changes.

### Architecture

```
Frontend (SolidJS)
    │  invoke("verify_pin", { userId, pin })
    ▼
Rust Tauri Command (verify_pin)
    │  calls auth_provider.verify(user_id, pin)
    ▼
AuthProvider trait
    ├── LocalAuthProvider (v1)  — verifies against local SQLite DB with argon2 hashes
    └── ServerAuthProvider (v2) — verifies against remote server, caches locally for offline
```

### Rust side

- [ ] Add `argon2` crate to `src-tauri/Cargo.toml` (PIN hashing)
- [ ] Create `src-tauri/src/auth.rs` — `AuthProvider` trait with `verify(user_id, pin) -> Result<User>` and `hash_pin(pin) -> String`
- [ ] Implement `LocalAuthProvider` — queries `users` table, verifies PIN against argon2 hash
- [ ] Register `verify_pin` Tauri command — delegates to `LocalAuthProvider`
- [ ] Register `change_pin` Tauri command — hashes new PIN and updates DB
- [ ] Add seed migration: default owner user (name "Owner", argon2 hash of "1234", role "owner")
- [ ] Add seed migration: trigger `change_pin` prompt for default PIN on first login

### Frontend side

- [ ] Create `src/lib/auth.ts` — auth session store (SolidJS reactive store)
  - [ ] Store current user: `{ id, name, role }`
  - [ ] `login(userId, pin)` → `invoke("verify_pin", ...)` → sets session
  - [ ] `logout()` → clears session → navigates to `/login`
  - [ ] `isAuthenticated()` signal
  - [ ] `currentUser()` signal
  - [ ] Persist last user ID to localStorage (for "remember who was logged in")
  - [ ] Require PIN re-entry after app restart (even if user ID is remembered)
- [ ] Create `src/components/PinPad.tsx` — reusable numeric PIN input component (4-6 digits)
- [ ] Create `src/pages/Login.tsx` — user list + PIN pad
  - [ ] Show list of active users (name only, avatar/initial)
  - [ ] Remember last user and pre-select them
  - [ ] Tap user → show PIN pad
  - [ ] Wrong PIN → error feedback, retry (max 5 attempts, then lock for 30s)
  - [ ] Success → navigate to `/pos` (cashier) or `/menu` (manager/owner)
- [ ] Add route guard: redirect to `/login` if not authenticated
- [ ] Add role-based route protection (owner-only routes, manager+ routes)
- [ ] Change PIN dialog: required on first login if using default PIN "1234"
- [ ] Test: login flow works, session persists across navigation, logout clears session, PIN re-entry after restart

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
