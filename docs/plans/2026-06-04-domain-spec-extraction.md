# Domain Spec Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract OpenSpec capability specs from the codebase, using PRD.md for business intent and docs/plans + docs/adr for architectural context. Specs reflect what's actually built, not what was planned.

**Architecture:** Read codebase first (source of truth), then grep PRD for business flow, then grep docs for context. Write specs in `openspec/specs/<domain>/spec.md` using SHALL language with WHEN/THEN scenarios.

**Tech Stack:** OpenSpec specs, Drizzle schema, baresync, SolidJS, Elysia API

---

## Process Per Batch

For each batch, follow these steps in order:

### Step 1: Identify domain files
```bash
# Grep codebase for files related to this domain
grep -rn "<domain-keywords>" apps/pos-app/src/ apps/api/src/ packages/sync-contract/src/ --include="*.ts" --include="*.tsx" -l
```

### Step 2: Read key source files
Read the most important files to understand actual behavior:
- `db/*.ts` — data access layer
- `store/*.ts` — reactive state
- `pages/**/*.tsx` — UI flows
- `lib/**/*.ts` — business logic
- `apps/api/src/<domain>/` — API routes

### Step 3: Grep PRD for business intent
```bash
grep -n -i "<domain>" docs/PRD.md
```
Extract: user flows, data model, business rules.

### Step 4: Grep docs/plans + docs/adr for context
```bash
grep -rn -l "<domain>" docs/plans/ docs/adr/
```
Read relevant files for: architectural decisions, why things exist, trade-offs.

### Step 5: Write or merge spec
Create `openspec/specs/<domain>/spec.md` with:
- Purpose section (from PRD + codebase understanding)
- Requirements section (SHALL language, WHEN/THEN scenarios)
- Only include what's actually implemented

---

## Batches

### Batch 1: auth

**Domain keywords:** auth, login, session, PIN, OAuth, cloud-auth, local-auth, staff, authentication

**Key files to read:**
- `apps/pos-app/src/store/auth.ts`
- `apps/pos-app/src/lib/auth/provider.ts`
- `apps/pos-app/src/lib/auth/cloud.ts`
- `apps/pos-app/src/lib/auth/storage.ts`
- `apps/pos-app/src/pages/login/cloud-login.tsx`
- `apps/pos-app/src/pages/login/local-auth.tsx`
- `apps/pos-app/src/pages/login/cloud-register.tsx`
- `apps/pos-app/src/pages/login/device-pair.tsx`
- `apps/pos-app/src/pages/onboarding.tsx`
- `apps/api/src/auth/` (all files)
- `apps/api/src/staff/` (all files)
- `packages/sync-contract/src/api-schema.ts` (users, userSessions, userMerchants, staff tables)

**PRD section:** "Authentication" user flow (lines 154-160), "users" data model (lines 79-89)

**Expected spec:** `openspec/specs/auth/spec.md`

**Capabilities to capture:**
- Cloud OAuth authentication (Google)
- Email/password registration
- PIN-based local authentication
- Session management (JWT storage)
- Staff role-based access (owner/manager/cashier)
- Onboarding flow (merchant creation)
- Device pairing
- Scope assignment (merchant/outlet)

---

### Batch 2: merchants + outlets

**Domain keywords:** merchant, outlet, register, timezone, receipt-header, business-entity

**Key files to read:**
- `apps/pos-app/src/db/merchants.ts`
- `apps/pos-app/src/db/outlets.ts`
- `apps/pos-app/src/store/outlet.ts`
- `apps/pos-app/src/pages/settings/outlet.tsx`
- `apps/api/src/merchants/` (all files)
- `apps/api/src/outlets/` (all files)
- `apps/api/src/registers/` (all files)
- `packages/sync-contract/src/api-schema.ts` (merchants, outlets, registers tables)

**PRD section:** Not in PRD (V1 didn't have multi-store)

**Expected spec:** `openspec/specs/merchants-outlets/spec.md`

**Capabilities to capture:**
- Merchant CRUD
- Outlet CRUD (scoped to merchant)
- Register management (create, pair, soft-delete)
- Outlet timezone configuration
- Receipt header customization
- Merchant-outlet-register hierarchy
- Outlet scope for sync

---

### Batch 3: menu

**Domain keywords:** product, category, outlet-product, menu, inventory, price

**Key files to read:**
- `apps/pos-app/src/db/menu.ts`
- `apps/pos-app/src/pages/settings/product-categories/`
- `apps/pos-app/src/lib/schema/product-form.ts`
- `apps/pos-app/src/lib/schema/category-form.ts`
- `apps/api/src/sync/service.ts` (categories, products, outletProducts tables)
- `packages/sync-contract/src/local-schema.ts` (categories, products, outletProducts tables)

**PRD section:** "Menu Management (Manager/Owner)" (lines 175-181), "categories" data model (lines 91-100), "products" data model (lines 102-114)

**Expected spec:** `openspec/specs/menu/spec.md`

**Capabilities to capture:**
- Category CRUD (name, sort_order, is_active)
- Product CRUD (name, price, category, image, sort_order, is_active)
- Outlet-product relationships (per-outlet pricing/availability)
- Soft-delete pattern (is_active flag)
- Sort order management
- Menu sync across devices

---

### Batch 4: orders

**Domain keywords:** order, order-item, cart, checkout, payment, cash, qris, daily-summary

**Key files to read:**
- `apps/pos-app/src/db/orders.ts`
- `apps/pos-app/src/store/cart.ts`
- `apps/pos-app/src/pages/pos/pos-shell.tsx`
- `apps/pos-app/src/pages/pos/use-pos.ts`
- `apps/pos-app/src/pages/pos/pos-utils.ts`
- `apps/pos-app/src/pages/order-history.tsx`
- `apps/pos-app/src/components/pos/cart-panel.tsx`
- `apps/pos-app/src/components/pos/payment-dialog.tsx`
- `apps/pos-app/src/components/order-card.tsx`
- `apps/api/src/sync/service.ts` (orders, orderItems tables)

**PRD section:** "Ordering (Cashier)" (lines 162-178), "Order History" (lines 182-188), "orders" data model (lines 116-130), "order_items" data model (lines 132-142)

**Expected spec:** `openspec/specs/orders/spec.md`

**Capabilities to capture:**
- Cart management (add, update quantity, remove, clear)
- Order creation (order + order items)
- Order number generation (YYYY-MM-DD-NNN)
- Payment methods (cash with change calculation, QRIS)
- Order status (completed, cancelled)
- Order history with filtering (date, status, outlet)
- Daily summary aggregation
- Product/price snapshots on order items

---

### Batch 5: staff

**Domain keywords:** staff, user, role, pin, manager, cashier, owner

**Key files to read:**
- `apps/pos-app/src/db/staff.ts`
- `apps/pos-app/src/pages/users/user-management.tsx`
- `apps/pos-app/src/pages/users/user-list.tsx`
- `apps/pos-app/src/pages/users/user-form.tsx`
- `apps/pos-app/src/pages/users/reset-pin.tsx`
- `apps/pos-app/src/lib/schema/user-form.ts`
- `apps/api/src/staff/` (all files)

**PRD section:** "User Management (Owner)" (lines 189-195), "users" data model (lines 79-89)

**Expected spec:** `openspec/specs/staff/spec.md`

**Capabilities to capture:**
- Staff CRUD (create, update, list)
- Role management (owner, manager, cashier)
- PIN management (set, reset)
- Active/inactive status
- Last-owner protection
- Staff claim flow (cloud user → staff linking)
- Role-based access control

---

### Batch 6: sync

**Domain keywords:** sync, baresync, push, pull, outbox, cursor, scope, data-changed, sync-client

**Key files to read:**
- `apps/pos-app/src/store/sync.ts`
- `apps/pos-app/src/lib/sync.ts`
- `apps/pos-app/src/providers/sync-client-provider.tsx`
- `apps/pos-app/src/store/auth.ts` (scopeId, setScope, clearScope)
- `apps/api/src/sync/` (all files)
- `packages/sync-contract/sync.config.ts`
- `packages/sync-contract/src/local-schema.ts` (syncOutbox, syncCursors)
- `packages/sync-contract/src/api-schema.ts` (syncBatchRequests)

**PRD section:** "Cloud sync / multi-device" (deferred to V2, line 39)

**Docs context:**
- `docs/adr/0004-use-smart-sync-with-local-outbox-and-server-events.md` (superseded)
- `docs/adr/0006-use-schema-compatibility-and-version-gating.md`
- `docs/adr/0008-use-idempotent-sync-batches-and-paged-pulls.md`
- `docs/adr/0009-use-row-state-sync-watermarks.md`
- `docs/plans/2026-06-03-baresync-alignment.md`
- `docs/plans/2026-06-03-convert-to-baresync-plugin.md`

**Expected spec:** `openspec/specs/sync/spec.md`

**Capabilities to capture:**
- Baresync bidirectional sync
- Push flow (local changes → API)
- Pull flow (API changes → local)
- Scope resolution (merchant ID vs outlet ID)
- Sync scope lifecycle (boot, login, logout)
- Provider-owned sync client
- Sync status signals (idle/syncing/error/offline)
- Row-state watermarks (sync_updated_at)
- Idempotent push batches
- Schema compatibility and version gating
- Sync restart on scope change
- Cache invalidation (baresync://data-changed)

---

### Batch 7: assets

**Domain keywords:** asset, image, photo, upload, download, cache, processing, WebP, S3, presign

**Key files to read:**
- `apps/pos-app/src/lib/assets/` (all files: types.ts, targets.ts, cache.ts, processing.ts, sync.ts, picking.ts, image-upload.ts, create-adapter.ts, adapters/product-images.ts)
- `apps/api/src/assets/` (all files)
- `packages/sync-contract/src/local-schema.ts` (assets, localAssetCache, pendingAssetProcessingJobs)
- `packages/sync-contract/src/api-schema.ts` (assets)

**PRD section:** "Image upload for products" (deferred to V2, line 42)

**Docs context:**
- `docs/adr/0002-use-hybrid-native-product-photo-picker.md`
- `docs/adr/0003-use-generic-asset-processing-for-product-photos.md`
- `docs/plans/2026-05-11-product-photo-assets.md`

**Expected spec:** `openspec/specs/assets/spec.md`

**Capabilities to capture:**
- Asset metadata (synced row: content_type, hash, size, dimensions, status)
- Camera/gallery picking (Tauri native)
- Image processing (resize to 800px, WebP encoding)
- Upload flow (presign → upload → complete)
- Download flow (presign → download → cache)
- Local asset cache
- Pending asset processing jobs
- Asset sync (metadata only, not binary)
- Adapter pattern (product images)
- Deduplication (objectKey + contentHash)

---

### Batch 8: dashboard

**Domain keywords:** dashboard, revenue, chart, analytics, report, category-chart, payment-breakdown, top-products, period

**Key files to read:**
- `apps/pos-app/src/db/dashboard.ts`
- `apps/pos-app/src/pages/dashboard/dashboard.tsx`
- `apps/pos-app/src/pages/dashboard/use-dashboard-data.ts`
- `apps/pos-app/src/lib/dashboard/period.ts`
- `apps/pos-app/src/lib/dashboard/chart-setup.ts`
- `apps/pos-app/src/components/dashboard/` (all files)

**PRD section:** "Advanced reporting and analytics" (deferred to V2, line 38)

**Expected spec:** `openspec/specs/dashboard/spec.md`

**Capabilities to capture:**
- Revenue analytics (hourly/daily/weekly/monthly)
- Payment method breakdown (cash vs QRIS)
- Top products ranking
- Sales by category
- Period presets (today, yesterday, week, month, year, custom)
- Chart granularity selection
- Rupiah-formatted axes
- Owner-only access

---

### Batch 9: printer + receipt

**Domain keywords:** printer, receipt, thermal, bluetooth, ESC/POS, print

**Key files to read:**
- `apps/pos-app/src/lib/printer/client.ts`
- `apps/pos-app/src/lib/receipt/types.ts`
- `apps/pos-app/src/lib/receipt/format-receipt.ts`
- `apps/pos-app/src/components/settings/printer-settings.tsx`
- `apps/pos-app/src/pages/settings/printer.tsx`

**PRD section:** "ESC/POS thermal printer integration" (deferred to V2, line 37)

**Docs context:**
- `docs/adr/0007-use-android-native-thermal-receipt-printing.md`
- `docs/plans/2026-05-09-thermal-receipt-printing.md`
- `docs/plans/2026-05-11-outlet-receipt-fields.md`

**Expected spec:** `openspec/specs/printer-receipt/spec.md`

**Capabilities to capture:**
- Bluetooth printer discovery
- Receipt formatting (32-char width, ESC/POS tags)
- Receipt content (header, items, totals, payment)
- Test printing
- Default printer persistence
- Printer settings page
- Indonesian locale formatting (Rupiah)

---

### Batch 10: settings + date-time + logger

**Domain keywords:** settings, date-time, timezone, logger, log, theme, responsive

**Key files to read:**
- `apps/pos-app/src/pages/settings/settings-home.tsx`
- `apps/pos-app/src/pages/settings/account.tsx`
- `apps/pos-app/src/lib/date-time.ts`
- `apps/pos-app/src/lib/logger.ts`
- `apps/pos-app/src/store/theme.ts`
- `apps/pos-app/src/store/responsive.ts`

**PRD section:** "Settings" (line 231 in frontend structure)

**Expected specs:**
- `openspec/specs/settings/spec.md`
- `openspec/specs/date-time/spec.md`
- `openspec/specs/logger/spec.md`

**Capabilities to capture:**
- Settings hub navigation
- Account settings
- Outlet configuration
- Business-date-aware timezone utils
- UTC ↔ business timezone conversion
- Structured logging (domain tags, log levels)
- Theme management (light/dark/system)
- Device detection (phone/tablet)

---

## Verification

After all batches complete:

1. **Check spec coverage:**
```bash
ls -la openspec/specs/
```
Should have ~10-12 capability directories.

2. **Verify spec format:**
Each spec should have:
- `# <Domain>` title
- `## Purpose` section
- `## Requirements` section with SHALL language and WHEN/THEN scenarios

3. **Cross-reference with PRD:**
Ensure all V1 scope items from PRD are covered:
- [x] PIN-based authentication with role-based access control
- [x] Menu management (categories + products CRUD)
- [x] Ordering flow (browse menu → cart → checkout)
- [x] Payment recording (cash + QRIS)
- [x] Order history with line-item details
- [x] User management (owner/manager only)

4. **Cross-reference with ADRs:**
Ensure accepted ADRs are reflected in relevant specs:
- [x] ADR 0001: Tauri plugin log → logger spec
- [x] ADR 0002: Hybrid native photo picker → assets spec
- [x] ADR 0003: Generic asset processing → assets spec
- [x] ADR 0006: Schema compatibility → sync spec
- [x] ADR 0007: Thermal receipt printing → printer spec
- [x] ADR 0008: Idempotent sync batches → sync spec
- [x] ADR 0009: Row-state watermarks → sync spec

---

## Execution

**Approach:** Subagent-Driven (this session)

Dispatch fresh subagent per batch, review between batches.

**Batch order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
