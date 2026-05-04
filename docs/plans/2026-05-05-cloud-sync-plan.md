# Cloud Sync & API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cloud sync, multi-shop support, and cloud auth (Better Auth) to Sakti POS, enabling multi-device data sharing via a Turso-backed Elysia API.

**Architecture:** Two-layer auth (cloud for device setup, PIN for daily unlock). Event-based push/pull sync with last-write-wins conflict resolution over JSON. Shared Turso DB with `shop_id` multi-tenancy. POS uses dual IDs (local integer + `cloud_id` UUID).

**Tech Stack:** Elysia, Better Auth, Drizzle ORM, `@libsql/client` (Turso), Cloudflare Workers

**Design doc:** `docs/plans/2026-05-05-cloud-sync-design.md`

---

## Phase 1: API Foundation

### Task 1: Re-init API with Elysia

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/tsconfig.json`
- Delete: `apps/api/wrangler.jsonc` (keep for reference but reconfigure)

**Step 1: Replace Hono with Elysia in package.json**

Update `apps/api/package.json` dependencies — remove `hono`, add:

```json
{
  "name": "@repo/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun run dist/index.js",
    "lint": "ultracite check",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@repo/database": "*",
    "elysia": "^1.3"
  },
  "devDependencies": {
    "@repo/typescript-config": "*",
    "typescript": "5.9.2"
  }
}
```

**Step 2: Install dependencies**

Run: `cd apps/api && bun install`
Expected: installs elysia, removes hono

**Step 3: Rewrite src/index.ts with Elysia**

```typescript
import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () => "Sakti POS API v1")
  .listen(3001);

console.log(`API running at http://localhost:${app.server!.port}`);
```

**Step 4: Update tsconfig.json**

Remove `jsxImportSource: "hono/jsx"`:

```json
{
  "extends": "@repo/typescript-config/base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

**Step 5: Verify dev server starts**

Run: `cd apps/api && bun run dev`
Expected: "API running at http://localhost:3001", visiting shows "Sakti POS API v1"

**Step 6: Commit**

```bash
git add apps/api/
git commit -m "feat(api): re-init with Elysia, remove Hono"
```

---

### Task 2: Add Turso + Drizzle to API

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/src/db/index.ts`
- Create: `apps/api/drizzle.config.ts`

**Step 1: Install Turso + Drizzle dependencies**

Run: `cd apps/api && bun add drizzle-orm @libsql/client && bun add -d drizzle-kit`

**Step 2: Create API schema**

Create `apps/api/src/db/schema.ts` — Turso schema with UUIDs and `shop_id`. Note: this is SEPARATE from `@repo/database` schema.

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["owner", "manager", "cashier"] }).notNull(),
  isActive: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
  categoryId: text("category_id").references(() => categories.id),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  imageUrl: text("image_url"),
  isActive: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
  orderNumber: text("order_number").notNull().unique(),
  userId: text("user_id").references(() => users.id),
  total: integer("total").notNull(),
  paymentMethod: text("payment_method", { enum: ["cash", "qris"] }).notNull(),
  amountPaid: integer("amount_paid"),
  changeAmount: integer("change_amount"),
  status: text("status", { enum: ["completed", "cancelled"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  shopId: text("shop_id")
    .notNull()
    .references(() => shops.id),
  orderId: text("order_id")
    .references(() => orders.id)
    .notNull(),
  productId: text("product_id").references(() => products.id),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  subtotal: integer("subtotal").notNull(),
  createdAt: text("created_at").notNull(),
});
```

**Step 3: Create Drizzle client**

Create `apps/api/src/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const tursoUrl = process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080";
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url: tursoUrl,
  ...(tursoAuthToken && { authToken: tursoAuthToken }),
});

export const db = drizzle(client, { schema });
```

**Step 4: Create drizzle.config.ts**

Create `apps/api/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
```

**Step 5: Generate initial migration**

Run: `cd apps/api && bunx drizzle-kit generate`
Expected: creates `apps/api/drizzle/0000_*.sql` with all tables

**Step 6: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add Turso schema, Drizzle client, and initial migration"
```

---

### Task 3: Add Better Auth to API

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/lib/auth.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Install Better Auth**

Run: `cd apps/api && bun add better-auth`

**Step 2: Create Better Auth config**

Create `apps/api/src/lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
});
```

**Step 3: Mount Better Auth on Elysia**

Better Auth exposes a generic handler. Update `apps/api/src/index.ts`:

```typescript
import { Elysia } from "elysia";
import { auth } from "./lib/auth";

const app = new Elysia()
  .all("/api/auth/*", (context) => {
    return auth.handler(context.request);
  })
  .get("/", () => "Sakti POS API v1")
  .listen(3001);

console.log(`API running at http://localhost:${app.server!.port}`);
```

**Step 4: Generate Better Auth tables migration**

Better Auth needs its own tables (user, session, account, verification). Generate by running:

Run: `cd apps/api && bunx @better-auth/cli generate`
Or manually add Better Auth's expected tables to the schema — check Better Auth docs for the exact schema.

**Step 5: Verify auth endpoints work**

Run: `cd apps/api && bun run dev`
Test: `curl http://localhost:3001/api/auth/session` — should return empty session

**Step 6: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add Better Auth with email/password + Google OAuth"
```

---

### Task 4: Shop CRUD Endpoints

**Files:**
- Create: `apps/api/src/routes/shops.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create shops route**

Create `apps/api/src/routes/shops.ts`:

```typescript
import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { shops } from "../db/schema";
import { auth } from "../lib/auth";

export const shopsRoutes = new Elysia({ prefix: "/api/shops" })
  .post(
    "/",
    async ({ body, request }) => {
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      if (!session?.user) {
        throw new Error("Unauthorized");
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const [shop] = await db
        .insert(shops)
        .values({
          id,
          name: body.name,
          ownerId: session.user.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return shop;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
      }),
    },
  )
  .get("/", async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    return db
      .select()
      .from(shops)
      .where(eq(shops.ownerId, session.user.id));
  })
  .get("/:id", async ({ params: { id }, request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    if (!session?.user) {
      throw new Error("Unauthorized");
    }

    const [shop] = await db
      .select()
      .from(shops)
      .where(eq(shops.id, id));
    return shop ?? null;
  });
```

**Step 2: Mount route in index.ts**

Update `apps/api/src/index.ts` — add import and `.use(shopsRoutes)`.

**Step 3: Test with curl**

```bash
# Register a user first via Better Auth, then:
curl -X POST http://localhost:3001/api/shops \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"name": "Kopi Kenangan"}'
```

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add shop CRUD endpoints"
```

---

### Task 5: Sync Endpoints

**Files:**
- Create: `apps/api/src/routes/sync.ts`
- Create: `apps/api/src/lib/sync.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create sync logic**

Create `apps/api/src/lib/sync.ts` — handles push/pull logic with last-write-wins:

```typescript
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

const SYNC_TABLES = [
  "categories",
  "products",
  "orders",
  "order_items",
  "users",
] as const;

type SyncTable = (typeof SYNC_TABLES)[number];

function getTable(name: SyncTable) {
  return schema[name as keyof typeof schema];
}

export async function handlePush(
  shopId: string,
  tableData: Record<string, Record<string, unknown>[]>,
) {
  const results: Record<string, { serverWins: string[] }> = {};

  for (const [tableName, rows] of Object.entries(tableData)) {
    if (!SYNC_TABLES.includes(tableName as SyncTable)) continue;

    const table = getTable(tableName as SyncTable);
    const serverWins: string[] = [];

    for (const row of rows) {
      const existing = await db
        .select()
        .from(table)
        .where(eq(table.id, row.id as string))
        .limit(1);

      if (existing.length > 0) {
        const serverRow = existing[0];
        const serverUpdated = new Date(
          serverRow.updatedAt as string,
        ).getTime();
        const clientUpdated = new Date(
          row.updatedAt as string,
        ).getTime();

        if (clientUpdated >= serverUpdated) {
          await db
            .update(table)
            .set(row)
            .where(eq(table.id, row.id as string));
        } else {
          serverWins.push(row.id as string);
        }
      } else {
        await db.insert(table).values(row);
      }
    }

    results[tableName] = { serverWins };
  }

  return results;
}

export async function handlePull(
  shopId: string,
  tables: string[],
  since: string,
) {
  const result: Record<string, Record<string, unknown>[]> = {};

  for (const tableName of tables) {
    if (!SYNC_TABLES.includes(tableName as SyncTable)) continue;

    const table = getTable(tableName as SyncTable);
    const rows = await db
      .select()
      .from(table)
      .where(
        and(
          eq(table.shopId, shopId),
          gt(table.updatedAt, since),
        ),
      );

    result[tableName] = rows;
  }

  return {
    ...result,
    serverTime: new Date().toISOString(),
  };
}
```

**Step 2: Create sync routes**

Create `apps/api/src/routes/sync.ts`:

```typescript
import { Elysia, t } from "elysia";
import { handlePush, handlePull } from "../lib/sync";
import { auth } from "../lib/auth";

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .post(
    "/push",
    async ({ body, request }) => {
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      if (!session?.user) {
        throw new Error("Unauthorized");
      }

      return handlePush(body.shopId, body.tables);
    },
    {
      body: t.Object({
        shopId: t.String(),
        tables: t.Record(t.String(), t.Array(t.Record(t.String(), t.Unknown()))),
      }),
    },
  )
  .get(
    "/pull",
    async ({ query, request }) => {
      const session = await auth.api.getSession({
        headers: request.headers,
      });
      if (!session?.user) {
        throw new Error("Unauthorized");
      }

      const tables = query.tables.split(",");
      return handlePull(query.shopId, tables, query.since);
    },
    {
      query: t.Object({
        shopId: t.String(),
        tables: t.String(),
        since: t.String(),
      }),
    },
  );
```

**Step 3: Mount route in index.ts**

Add `.use(syncRoutes)` to the Elysia app.

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add sync push/pull endpoints with last-write-wins"
```

---

### Task 6: Local Turso Dev Setup

**Files:**
- Create: `apps/api/.env.example`

**Step 1: Install Turso CLI and create local DB**

Run: `curl -sSfL https://get.tur.so/install.sh | bash`
Run: `turso dev --db-file local.db --port 8080` (in separate terminal)

This runs a local Turso-compatible SQLite server for development.

**Step 2: Create .env.example**

```
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:3001
```

**Step 3: Apply migrations to local DB**

Run: `cd apps/api && bunx drizzle-kit push`

**Step 4: Test full flow**

Start turso dev + API server. Test registration, shop creation, sync endpoints.

**Step 5: Commit**

```bash
git add apps/api/
git commit -m "chore(api): add local Turso dev setup and env example"
```

---

## Phase 2: POS Schema Migration

### Task 7: Add shop_id to POS Schema

**Files:**
- Modify: `packages/database/src/schema.ts`
- Create: `apps/pos-app/drizzle/000X_add_shop_id.sql`

**Step 1: Update shared schema**

Add `shop_id` column to all tables in `packages/database/src/schema.ts`. Add new `shops` and `sync_meta` tables.

```typescript
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shops = sqliteTable("shops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isActive: integer("is_active", { mode: "boolean" })
    .notNull()
    .default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const syncMeta = sqliteTable("sync_meta", {
  tableName: text("table_name").notNull(),
  shopId: text("shop_id").notNull(),
  lastSyncAt: text("last_sync_at").notNull(),
});

// In users table, add:
//   shopId: text("shop_id"),
//   cloudId: text("cloud_id"),

// In categories table, add:
//   shopId: text("shop_id"),
//   cloudId: text("cloud_id"),

// In products table, add:
//   shopId: text("shop_id"),
//   cloudId: text("cloud_id"),

// In orders table, add:
//   shopId: text("shop_id"),
//   cloudId: text("cloud_id"),

// In orderItems table, add:
//   shopId: text("shop_id"),
//   cloudId: text("cloud_id"),
```

**Step 2: Generate migration**

Run: `cd apps/pos-app && bunx drizzle-kit generate`
Expected: new migration file in `apps/pos-app/drizzle/`

**Step 3: Commit**

```bash
git add packages/database/ apps/pos-app/drizzle/
git commit -m "feat(schema): add shop_id, cloud_id, shops table, and sync_meta"
```

---

### Task 8: Update POS Queries with shop_id Filter

**Files:**
- Modify: `apps/pos-app/src/db/menu.ts`
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/users.ts`
- Modify: `apps/pos-app/src/db/dashboard.ts`

**Step 1: Create a shop context store**

Create `apps/pos-app/src/lib/shop.ts`:

```typescript
import { createSignal } from "solid-js";

const [currentShopId, setCurrentShopId] = createSignal<string | null>(null);

export { currentShopId, setCurrentShopId };

export const SHOP_STORAGE_KEY = "sakti-pos:current-shop-id";

export function loadShopId() {
  const stored = localStorage.getItem(SHOP_STORAGE_KEY);
  if (stored) setCurrentShopId(stored);
}

export function setShopId(id: string) {
  setCurrentShopId(id);
  localStorage.setItem(SHOP_STORAGE_KEY, id);
}
```

**Step 2: Update all query files**

For each file (`menu.ts`, `orders.ts`, `users.ts`, `dashboard.ts`):
- Import `currentShopId` from `~/lib/shop`
- Add `where` clause: `eq(table.shopId, currentShopId())` to all SELECT queries
- Add `shopId: currentShopId()` to all INSERT values
- When `currentShopId()` is null, don't add the filter (local-only mode, backward compatible)

**Step 3: Run existing tests**

Run: `cd apps/pos-app && bun run test`
Expected: All 61 existing tests still pass (shop_id is nullable, backward compatible)

**Step 4: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add shop_id filter to all DB queries"
```

---

## Phase 3: Cloud Auth on POS

### Task 9: Cloud Login/Register Pages

**Files:**
- Create: `apps/pos-app/src/pages/cloud-login.tsx`
- Create: `apps/pos-app/src/pages/onboarding.tsx`
- Modify: `apps/pos-app/src/App.tsx`
- Modify: `apps/pos-app/src/pages/login.tsx`

**Step 1: Create cloud auth client**

Create `apps/pos-app/src/lib/cloud-auth.ts` — wraps Better Auth client:

```typescript
import { createAuthClient } from "better-auth/client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL: API_URL,
});

export const { signIn, signUp, useSession, signOut } = authClient;
```

Install: `cd apps/pos-app && bun add better-auth`

**Step 2: Create cloud login page**

Create `apps/pos-app/src/pages/cloud-login.tsx` — email/password form + Google OAuth button. On success, navigates to `/onboarding` (no shop) or stores shop + navigates to `/login` (has shop).

**Step 3: Create onboarding page**

Create `apps/pos-app/src/pages/onboarding.tsx` — shop name input → POST `/api/shops` → store `shopId` → navigate to `/login`.

**Step 4: Update login page**

Add "Masuk Cloud" and "Daftar" buttons to existing login page. These navigate to `/cloud-login`.

**Step 5: Add routes to App.tsx**

```tsx
<Route component={CloudLogin} path="/cloud-login" />
<Route component={Onboarding} path="/onboarding" />
```

**Step 6: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add cloud login, register, and onboarding pages"
```

---

### Task 10: Settings - Cloud Account & Sync Controls

**Files:**
- Modify: `apps/pos-app/src/pages/settings.tsx`

**Step 1: Add cloud account section to settings**

Show:
- Connected account email (if any)
- Current shop name
- Last sync time
- "Pull" / "Push" buttons
- "Disconnect" button (clears cloud session, keeps local data)

**Step 2: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add cloud account and sync controls to settings"
```

---

## Phase 4: Sync Engine

### Task 11: Sync Meta Data Layer

**Files:**
- Create: `apps/pos-app/src/db/sync-meta.ts`

**Step 1: Create sync_meta CRUD**

```typescript
import { eq, and } from "drizzle-orm";
import { db } from "./index";
import { syncMeta } from "@repo/database";

export async function getLastSyncAt(
  tableName: string,
  shopId: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(syncMeta)
    .where(
      and(eq(syncMeta.tableName, tableName), eq(syncMeta.shopId, shopId)),
    );
  return rows[0]?.lastSyncAt ?? null;
}

export async function setLastSyncAt(
  tableName: string,
  shopId: string,
  timestamp: string,
): Promise<void> {
  await db
    .insert(syncMeta)
    .values({ tableName, shopId, lastSyncAt: timestamp })
    .onConflictDoUpdate({
      target: [syncMeta.tableName, syncMeta.shopId],
      set: { lastSyncAt: timestamp },
    });
}
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/db/sync-meta.ts
git commit -m "feat(pos): add sync_meta data layer"
```

---

### Task 12: Push Sync Logic

**Files:**
- Create: `apps/pos-app/src/lib/sync.ts`

**Step 1: Implement push function**

Create `apps/pos-app/src/lib/sync.ts`:

```typescript
import dayjs from "dayjs";
import { eq, gt, and, isNotNull } from "drizzle-orm";
import { db } from "~/db";
import * as schema from "@repo/database";
import { getLastSyncAt, setLastSyncAt } from "~/db/sync-meta";
import { currentShopId } from "~/lib/shop";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

const SYNC_TABLES = [
  { name: "categories", table: schema.categories },
  { name: "products", table: schema.products },
  { name: "orders", table: schema.orders },
  { name: "order_items", table: schema.orderItems },
] as const;

export async function pushChanges(shopId: string): Promise<void> {
  const tableData: Record<string, Record<string, unknown>[]> = {};

  for (const { name, table } of SYNC_TABLES) {
    const since = await getLastSyncAt(name, shopId);
    const rows = await db
      .select()
      .from(table)
      .where(
        and(
          eq(table.shopId, shopId),
          isNotNull(table.cloudId),
          since ? gt(table.updatedAt, since) : undefined,
        ),
      );

    if (rows.length > 0) {
      tableData[name] = rows.map((row) => ({ ...row }));
    }
  }

  if (Object.keys(tableData).length === 0) return;

  const response = await fetch(`${API_URL}/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ shopId, tables: tableData }),
  });

  if (!response.ok) {
    throw new Error(`Push failed: ${response.statusText}`);
  }

  const now = dayjs().toISOString();
  for (const { name } of SYNC_TABLES) {
    await setLastSyncAt(name, shopId, now);
  }
}
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/lib/sync.ts
git commit -m "feat(pos): implement push sync logic"
```

---

### Task 13: Pull Sync Logic

**Files:**
- Modify: `apps/pos-app/src/lib/sync.ts`

**Step 1: Add pull function to sync.ts**

```typescript
export async function pullChanges(shopId: string): Promise<void> {
  const tableNames = SYNC_TABLES.map((t) => t.name);

  for (const { name, table } of SYNC_TABLES) {
    const since = (await getLastSyncAt(name, shopId)) ?? "1970-01-01T00:00:00.000Z";

    const response = await fetch(
      `${API_URL}/api/sync/pull?shopId=${shopId}&tables=${tableNames.join(",")}&since=${since}`,
      { credentials: "include" },
    );

    if (!response.ok) {
      throw new Error(`Pull failed: ${response.statusText}`);
    }

    const data = await response.json();
    const rows: Record<string, unknown>[] = data[name] ?? [];

    for (const row of rows) {
      // INSERT OR REPLACE using cloud_id as the unique key
      await db
        .insert(table)
        .values({
          ...row,
          shopId,
          cloudId: row.id as string,
        })
        .onConflictDoUpdate({
          target: [table.cloudId],
          set: { ...row, shopId },
        });
    }
  }

  // Update sync_meta with server time
  if (data.serverTime) {
    for (const { name } of SYNC_TABLES) {
      await setLastSyncAt(name, shopId, data.serverTime);
    }
  }
}
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/lib/sync.ts
git commit -m "feat(pos): implement pull sync logic"
```

---

### Task 14: Sync Scheduler + Status UI

**Files:**
- Modify: `apps/pos-app/src/lib/sync.ts`
- Create: `apps/pos-app/src/components/sync-status.tsx`
- Modify: `apps/pos-app/src/components/layout.tsx`

**Step 1: Add sync scheduler to sync.ts**

```typescript
import { createSignal } from "solid-js";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
export { syncStatus };

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(shopId: string) {
  if (syncInterval) return;

  syncNow(shopId);
  syncInterval = setInterval(() => syncNow(shopId), 5 * 60 * 1000);
}

export function stopSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function syncNow(shopId: string) {
  setSyncStatus("syncing");
  try {
    await pullChanges(shopId);
    await pushChanges(shopId);
    setSyncStatus("idle");
  } catch {
    setSyncStatus("error");
  }
}
```

**Step 2: Create sync status indicator**

Small component showing sync state in the topbar: spinning icon when syncing, checkmark when idle, warning on error.

**Step 3: Add to Layout**

Import and render `<SyncStatus />` in the topbar, next to the hamburger menu. Start scheduler on mount if `currentShopId()` is set.

**Step 4: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add sync scheduler and status indicator"
```

---

## Phase 5: End-to-End Testing

### Task 15: API Tests

**Files:**
- Create: `apps/api/src/__test__/shops.test.ts`
- Create: `apps/api/src/__test__/sync.test.ts`

**Step 1: Set up API test runner**

Use Bun's built-in test runner for API tests. Add `"test": "bun test"` to `apps/api/package.json`.

**Step 2: Write shop endpoint tests**

Test: create shop, list shops, get shop by ID, unauthorized access rejected.

**Step 3: Write sync endpoint tests**

Test: push new rows, push update (last-write-wins), pull changes since timestamp, empty sync.

**Step 4: Commit**

```bash
git add apps/api/src/__test__/
git commit -m "test(api): add shop and sync endpoint tests"
```

---

### Task 16: POS Sync Tests

**Files:**
- Create: `apps/pos-app/src/lib/__test__/sync.test.ts`
- Create: `apps/pos-app/src/db/__test__/sync-meta.test.ts`

**Step 1: Write sync-meta tests**

Test: `getLastSyncAt` returns null initially, `setLastSyncAt` persists, updates existing.

**Step 2: Write sync logic tests**

Test: `pushChanges` sends correct payload, `pullChanges` upserts correctly, conflict resolution picks newer `updated_at`.

**Step 3: Commit**

```bash
git add apps/pos-app/src/
git commit -m "test(pos): add sync engine and sync-meta tests"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-6 | API foundation (Elysia, Turso, Better Auth, shops, sync, dev setup) |
| 2 | 7-8 | POS schema migration (shop_id, query filters) |
| 3 | 9-10 | Cloud auth on POS (login/register, onboarding, settings) |
| 4 | 11-14 | Sync engine (meta, push, pull, scheduler) |
| 5 | 15-16 | End-to-end testing |

**Total: 16 tasks, ~5 phases**
