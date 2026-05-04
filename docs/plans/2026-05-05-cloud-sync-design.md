# Sakti POS — Cloud Sync & API Design

Date: 2026-05-05

## Overview

Add cloud sync capabilities to Sakti POS, enabling multi-device data sharing, cloud authentication, and multi-shop support. The system uses a two-layer auth model (cloud for device setup, PIN for daily unlock), event-based push/pull sync with last-write-wins conflict resolution, and JSON payloads over a Turso-backed API.

## Architecture

```
POS App (SolidJS + Tauri)
    │
    │  Cloud Auth: Better Auth (email/password + Google OAuth)
    │  Daily Unlock: 6-digit PIN (local only)
    │
    ├── Cloud Auth Layer ──── Elysia API (Bun-native)
    │                              │
    │                              │  Drizzle ORM (turso-http driver)
    │                              ▼
    │                         Turso (distributed SQLite)
    │                              │
    │                              │  shop_id column on all tables
    │                              ▼
    │                         Shared DB with multi-tenancy
    │
    └── Sync Layer ──── JSON over HTTP
         │
         ├── Push: local changes since last_sync_at → API upsert
         └── Pull: API changes since last_sync_at → local upsert
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API framework | Elysia (Bun-native, portable across runtimes) |
| Auth | Better Auth (email/password + Google OAuth) |
| Database | Turso (distributed SQLite, HTTP API) |
| ORM | Drizzle ORM with `@libsql/client` (turso-http driver) |
| Sync format | JSON |
| Deployment | Cloudflare Workers (portable via Elysia) |

## Two-Layer Auth Model

### Layer 1: Cloud Auth (device setup)

- **Purpose**: Connect a POS device to a shop, enable sync
- **Methods**: Email/password registration + Google OAuth via Better Auth
- **When used**: First device setup, switching shops, reconnecting after logout
- **Storage**: JWT session stored in POS app memory/localStorage

### Layer 2: PIN Unlock (daily use)

- **Purpose**: Quick daily unlock, works fully offline
- **Method**: 6-digit PIN per user (existing system, unchanged)
- **When used**: Every app open, no cloud connection needed
- **Storage**: Local SQLite only, NOT synced to cloud

### Auth Flows

**First time on device (no cloud account):**
1. App shows welcome screen: "Daftar" (Register) or "Masuk" (Login)
2. Register: email + password form → Better Auth creates account
3. Google OAuth: redirect to Google → Better Auth creates account
4. Onboarding: create shop form (name) → API creates shop with owner_id
5. Shop data synced down to local DB
6. Owner sets up PIN for daily unlock (existing flow)
7. Owner creates local users (cashiers) via existing user management

**Subsequent app opens:**
1. PIN pad shown (existing behavior)
2. Background sync runs if online

**Switch shop / reconnect:**
1. Logout from cloud → cloud auth screen
2. Login → API returns user's shops
3. If one shop → auto-select, sync starts
4. If multiple shops → shop picker, then sync

## Database Schema

### API (Turso) — Separate from POS schema

All IDs are UUIDs. `shop_id` on every data table.

```typescript
// shops
{
  id: text("id").primaryKey(),           // UUID
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),   // → users.id
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}

// users (cloud)
{
  id: text("id").primaryKey(),           // UUID (Better Auth)
  shopId: text("shop_id").notNull(),     // → shops.id
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["owner", "manager", "cashier"] }).notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}
// Note: NO pin column — PIN is local-only

// categories, products, orders, order_items
// Same structure as POS schema but:
//   - All IDs are UUIDs (text)
//   - shop_id column added
//   - Foreign keys use UUID references

// Better Auth tables (managed by the library)
// sessions, accounts, verification — standard Better Auth schema
```

### POS Client Schema Changes

Existing schema modified with `shop_id`:

```sql
-- New table
CREATE TABLE shops (
  id TEXT PRIMARY KEY,           -- UUID from API
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Migration: add shop_id to existing tables
ALTER TABLE users ADD COLUMN shop_id TEXT;
ALTER TABLE categories ADD COLUMN shop_id TEXT;
ALTER TABLE products ADD COLUMN shop_id TEXT;
ALTER TABLE orders ADD COLUMN shop_id TEXT;
ALTER TABLE order_items ADD COLUMN shop_id TEXT;

-- New sync metadata table
CREATE TABLE sync_meta (
  table_name TEXT PRIMARY KEY,
  last_sync_at TEXT NOT NULL,
  shop_id TEXT NOT NULL
);
```

- Pre-sync existing rows: `shop_id` defaults to `NULL` (local-only data)
- After cloud connection: all rows tagged with the active `shop_id`
- All local queries add `WHERE shop_id = ?` filter

## Sync Mechanism

### State Tracking

- `sync_meta` table stores `last_sync_at` timestamp per table per shop
- First sync: no `last_sync_at` → full pull + push

### Push Flow

1. Client reads `last_sync_at` for each table
2. For each table: `SELECT * FROM {table} WHERE shop_id = ? AND updated_at > last_sync_at`
3. POST to `/sync/push` with JSON body:
   ```json
   {
     "shopId": "uuid",
     "tables": {
       "orders": [{ "id": 1, "orderNumber": "...", ... }],
       "order_items": [{ "id": 1, ... }]
     }
   }
   ```
4. Server upserts each row with last-write-wins on `updated_at`
5. Server returns response with server-side `updated_at` for any rows where server won
6. Client updates local `updated_at` for those rows

### Pull Flow

1. Client reads `last_sync_at` for each table
2. For each table: GET `/sync/pull?tables=orders,order_items,...&shopId=uuid&since={timestamp}`
3. Server returns JSON:
   ```json
   {
     "orders": [{ ... }],
     "order_items": [{ ... }],
     "serverTime": "2026-05-05T10:30:00.000Z"
   }
   ```
4. Client INSERT OR REPLACE, keeping the row with the newer `updated_at`
5. Update `sync_meta.last_sync_at` to `serverTime`

### Conflict Resolution: Last-Write-Wins

- Compare `updated_at` timestamps on both sides
- The newer timestamp wins — no user prompting
- After upsert, both sides converge to the same state

### Soft Deletes

- Use existing `is_active` flag (already on `categories`, `products`, `users`)
- Add `is_active` to `orders` if not present (currently uses `status: cancelled`)
- Deactivated rows sync as `is_active = false` — not hard-deleted

### Sync Triggers

- **On app open**: pull then push
- **Periodic**: every 5 minutes when online
- **Manual**: "Pull" / "Push" buttons in settings
- **After order**: push immediately after checkout (if online)

### ID Mapping

- POS uses auto-increment integer IDs locally
- Turso uses UUID IDs
- Mapping strategy: POS stores both `id` (local int) and `cloud_id` (UUID text)
- During push: client generates a UUID for new rows, sends `cloud_id` to server
- During pull: client maps `cloud_id` to local `id` via lookup or INSERT with mapped ID
- Alternative: switch POS to UUID IDs too (cleaner but larger migration)

## API Endpoints

### Auth (Better Auth handles most of these)

```
POST /auth/register         — Email + password registration
POST /auth/login            — Email + password login
GET  /auth/google           — Google OAuth redirect
GET  /auth/google/callback  — Google OAuth callback
GET  /auth/session          — Get current session
POST /auth/logout           — Logout
```

### Shops

```
POST /shops                 — Create a new shop
GET  /shops                 — List current user's shops
GET  /shops/:id             — Get shop details
PATCH /shops/:id            — Update shop name
```

### Sync

```
POST /sync/push             — Push changed rows
GET  /sync/pull             — Pull changed rows since timestamp
```

## POS Client Changes

### New Files

```
src/lib/cloud-auth.ts       — Better Auth client wrapper
src/lib/sync.ts             — Push/pull logic, sync scheduler
src/db/sync-meta.ts         — sync_meta CRUD
src/pages/onboarding.tsx    — Shop creation after registration
src/pages/cloud-login.tsx   — Email/password + Google OAuth form
src/components/sync-status.tsx — Sync indicator (syncing ✓ / offline / error)
```

### Modified Files

```
packages/database/src/schema.ts  — Add shop_id to all tables, add shops table, add sync_meta
src/db/index.ts                  — Add shop_id filter to all queries
src/db/menu.ts                   — Shop_id filter on all queries
src/db/orders.ts                 — Shop_id filter on all queries
src/db/users.ts                  — Shop_id filter on all queries
src/db/dashboard.ts              — Shop_id filter on all queries
src/pages/login.tsx              — Add "Masuk Cloud" / "Daftar" buttons
src/components/Layout.tsx        — Sync status indicator
src/pages/settings.tsx           — Sync controls, shop info, cloud account
src/lib/auth.ts                  — Support cloud session alongside local PIN
src/App.tsx                      — Add cloud login + onboarding routes
```

### New Migration (POS)

```sql
-- 000X_add_shop_id.sql
CREATE TABLE shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sync_meta (
  table_name TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  last_sync_at TEXT NOT NULL,
  PRIMARY KEY (table_name, shop_id)
);

ALTER TABLE users ADD COLUMN shop_id TEXT;
ALTER TABLE categories ADD COLUMN shop_id TEXT;
ALTER TABLE products ADD COLUMN shop_id TEXT;
ALTER TABLE orders ADD COLUMN shop_id TEXT;
ALTER TABLE order_items ADD COLUMN shop_id TEXT;
```

## ID Strategy Decision

Two options for reconciling POS integer IDs with Turso UUIDs:

### Option A: Dual ID columns on POS (Recommended)

- POS tables keep `id INTEGER AUTOINCREMENT` as primary key
- Add `cloud_id TEXT` column to each table
- Local queries use `id`, sync uses `cloud_id`
- New rows: generate UUID client-side, store in `cloud_id`
- During pull: match on `cloud_id` for upsert

Pros: Minimal migration, local performance unchanged
Cons: Two ID systems to manage

### Option B: Switch POS to UUIDs

- Change all POS primary keys to TEXT UUIDs
- Remove autoincrement, generate UUIDs client-side
- Single ID system everywhere

Pros: Clean, no mapping
Cons: Large migration, all queries and join patterns change

**Recommendation**: Option A (dual IDs) for v1 — smaller migration, local performance stays fast.

## API Project Structure

```
apps/api/
  src/
    index.ts                  — Elysia app, mounts route groups
    db/
      index.ts                — Drizzle client (turso-http)
      schema.ts               — Turso schema (UUIDs + shop_id)
      migrations/             — Drizzle Kit generated migrations
    routes/
      auth.ts                 — Better Auth endpoints
      shops.ts                — Shop CRUD
      sync.ts                 — Push/pull endpoints
    lib/
      auth.ts                 — Better Auth config, Turso adapter
      sync.ts                 — Push/pull logic, conflict resolution
  wrangler.jsonc              — Turso bindings (or env vars)
  drizzle.config.ts           — Drizzle Kit config for Turso
  package.json                — elysia, better-auth, drizzle-orm, @libsql/client
```

## Security Considerations

- Better Auth handles JWT session management
- All sync endpoints validate JWT + verify user belongs to `shop_id`
- `shop_id` scoping enforced at query level — no cross-shop data leaks
- TLS enforced (Cloudflare Workers default)
- PIN data never leaves the device
- Rate limiting on auth endpoints (Cloudflare built-in)

## Implementation Phases

### Phase 1: API Foundation
- Re-init API with Elysia + Turso + Drizzle
- Set up Better Auth (email/password + Google OAuth)
- Shops CRUD endpoints
- Deploy to Cloudflare Workers

### Phase 2: POS Schema Migration
- Add `shop_id` to all POS tables
- Add `shops` and `sync_meta` tables
- Update all local queries to filter by `shop_id`
- Backward-compatible (NULL shop_id = local-only mode)

### Phase 3: Cloud Auth on POS
- Cloud login/register screens in POS app
- Onboarding flow (shop creation)
- Shop picker (multi-shop)
- Cloud session management

### Phase 4: Sync Engine
- Push logic (detect changes, batch send)
- Pull logic (receive changes, upsert locally)
- Conflict resolution (last-write-wins)
- Sync scheduler (on open, periodic, manual)
- Sync status UI

### Phase 5: End-to-End Testing
- Multi-device sync testing
- Offline → online reconnection
- Conflict scenarios
- Performance under load
