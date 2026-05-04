# Cloud Sync & API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cloud sync, multi-shop support, and cloud auth (Better Auth) to Sakti POS, enabling multi-device data sharing via a Turso-backed Elysia API with Protocol Buffers for efficient binary sync.

**Architecture:** Two-layer auth (cloud for device setup, PIN for daily unlock). Shared `.proto` schema defines the sync contract. API uses Elysia + `elysia-protobuf` (`@bufbuild/protobuf` + `ts-proto` for TS codegen) for binary sync endpoints. POS Rust side uses `prost` + `reqwest` to handle sync natively — encoding/decoding protobuf, HTTP to API, writing directly to local SQLite via `sqlx`. SolidJS frontend just calls `invoke()` to trigger Rust sync. Last-write-wins conflict resolution. Shared Turso DB with `shop_id` multi-tenancy.

**Tech Stack:**
- **API:** Elysia, `elysia-protobuf`, `@bufbuild/protobuf`, `ts-proto`, Better Auth, Drizzle ORM, `@libsql/client` (Turso)
- **POS Rust:** `prost`, `prost-build`, `reqwest` (rustls-tls), `sqlx`
- **Proto:** `protoc` + `ts-proto` (API side), `prost-build` (Rust side)
- **Deployment:** Cloudflare Workers

**Design doc:** `docs/plans/2026-05-05-cloud-sync-design.md`

---

## Phase 1: API Foundation

### Task 1: Re-init API with Elysia

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/tsconfig.json`

**Step 1: Replace Hono with Elysia in package.json**

Update `apps/api/package.json`:

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
    "check-types": "tsc --noEmit",
    "test": "bun test"
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
Expected: "API running at http://localhost:3001"

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

Create `apps/api/src/db/schema.ts` — SEPARATE from `@repo/database`. Turso schema with UUIDs and `shop_id`:

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

Update `apps/api/src/index.ts`:

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

**Step 4: Generate Better Auth tables**

Run: `cd apps/api && bunx @better-auth/cli generate`
Or manually add Better Auth's expected tables (user, session, account, verification) to the schema.

**Step 5: Verify auth endpoints**

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

### Task 5: Shared Proto Schema

**Files:**
- Create: `proto/sync.proto`
- Create: `proto/generate-api.sh`
- Create: `proto/generate-rust.sh`
- Modify: `.gitignore` (add generated proto output dirs)

This is the contract between the API (TypeScript) and the POS (Rust). Both sides generate code from this single `.proto` file.

**Step 1: Create proto/sync.proto**

```protobuf
syntax = "proto3";

package sakti;

option go_package = "sakti/v1";

// ─── Row messages ───

message CategoryRow {
  string id = 1;
  string shop_id = 2;
  string name = 3;
  int32 sort_order = 4;
  bool is_active = 5;
  string created_at = 6;
  string updated_at = 7;
}

message ProductRow {
  string id = 1;
  string shop_id = 2;
  string category_id = 3;
  string name = 4;
  int64 price = 5;
  string image_url = 6;
  bool is_active = 7;
  int32 sort_order = 8;
  string created_at = 9;
  string updated_at = 10;
}

message OrderRow {
  string id = 1;
  string shop_id = 2;
  string order_number = 3;
  string user_id = 4;
  int64 total = 5;
  string payment_method = 6;
  int64 amount_paid = 7;
  int64 change_amount = 8;
  string status = 9;
  string created_at = 10;
  string updated_at = 11;
}

message OrderItemRow {
  string id = 1;
  string shop_id = 2;
  string order_id = 3;
  string product_id = 4;
  string product_name = 5;
  int32 quantity = 6;
  int64 unit_price = 7;
  int64 subtotal = 8;
  string created_at = 9;
}

message UserRow {
  string id = 1;
  string shop_id = 2;
  string email = 3;
  string name = 4;
  string role = 5;
  bool is_active = 6;
  string created_at = 7;
  string updated_at = 8;
}

// ─── Sync request/response ───

message SyncPushRequest {
  string shop_id = 1;
  repeated CategoryRow categories = 2;
  repeated ProductRow products = 3;
  repeated OrderRow orders = 4;
  repeated OrderItemRow order_items = 5;
  repeated UserRow users = 6;
}

message ServerWins {
  string table = 1;
  repeated string ids = 2;
}

message SyncPushResponse {
  repeated ServerWins server_wins = 1;
  string server_time = 2;
}

message SyncPullRequest {
  string shop_id = 1;
  repeated string tables = 2;
  string since = 3;
}

message SyncPullResponse {
  repeated CategoryRow categories = 1;
  repeated ProductRow products = 2;
  repeated OrderRow orders = 3;
  repeated OrderItemRow order_items = 4;
  repeated UserRow users = 5;
  string server_time = 6;
}
```

**Step 2: Create generate-api.sh**

Generates TypeScript via `ts-proto` for the API side:

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$SCRIPT_DIR/../apps/api/src"

protoc \
  --plugin="$SCRIPT_DIR/../node_modules/.bin/protoc-gen-ts_proto" \
  --ts_proto_opt=esModuleInterop=true \
  --ts_proto_opt=importSuffix=.js \
  --ts_proto_out="$API_DIR/proto" \
  -I "$SCRIPT_DIR" \
  "$SCRIPT_DIR"/*.proto

echo "Proto → TypeScript generated in $API_DIR/proto/"
```

**Step 3: Create generate-rust.sh**

Generates Rust via `prost-build` (called from `build.rs`):

```bash
#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/../apps/pos-app/src-tauri"

echo "Proto → Rust: prost-build handles this in build.rs"
echo "Run: cd $RUST_DIR && cargo build"
```

**Step 4: Install ts-proto and generate**

Run: `cd apps/api && bun add -d ts-proto @bufbuild/protobuf`
Run: `cd apps/api && bun add elysia-protobuf`
Run: `bash proto/generate-api.sh`

**Step 5: Commit**

```bash
git add proto/ apps/api/src/proto/
git commit -m "feat: add shared protobuf schema and API codegen"
```

---

### Task 6: Protobuf Sync Endpoints on API

**Files:**
- Create: `apps/api/src/routes/sync.ts`
- Create: `apps/api/src/lib/sync.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create sync logic**

Create `apps/api/src/lib/sync.ts` — handles push/pull with last-write-wins, returns typed proto-compatible data:

```typescript
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

export async function handlePush(shopId: string, data: {
  categories?: unknown[];
  products?: unknown[];
  orders?: unknown[];
  order_items?: unknown[];
  users?: unknown[];
}) {
  const serverWins: { table: string; ids: string[] }[] = [];

  const tableMap: Record<string, typeof schema.categories> = {
    categories: schema.categories,
    products: schema.products,
    orders: schema.orders,
    order_items: schema.orderItems,
    users: schema.users,
  };

  for (const [tableName, rows] of Object.entries(data)) {
    if (!rows || rows.length === 0) continue;
    const table = tableMap[tableName];
    if (!table) continue;

    const wins: string[] = [];

    for (const row of rows as Record<string, unknown>[]) {
      const existing = await db
        .select()
        .from(table)
        .where(eq(table.id, row.id as string))
        .limit(1);

      if (existing.length > 0) {
        const serverUpdated = new Date(
          (existing[0] as Record<string, unknown>).updatedAt as string,
        ).getTime();
        const clientUpdated = new Date(row.updatedAt as string).getTime();

        if (clientUpdated >= serverUpdated) {
          await db
            .update(table)
            .set(row)
            .where(eq(table.id, row.id as string));
        } else {
          wins.push(row.id as string);
        }
      } else {
        await db.insert(table).values(row);
      }
    }

    if (wins.length > 0) {
      serverWins.push({ table: tableName, ids: wins });
    }
  }

  return { serverWins, serverTime: new Date().toISOString() };
}

export async function handlePull(
  shopId: string,
  tables: string[],
  since: string,
) {
  const tableMap: Record<string, typeof schema.categories> = {
    categories: schema.categories,
    products: schema.products,
    orders: schema.orders,
    order_items: schema.orderItems,
    users: schema.users,
  };

  const result: Record<string, unknown[]> = {};

  for (const tableName of tables) {
    const table = tableMap[tableName];
    if (!table) continue;

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

  return { ...result, serverTime: new Date().toISOString() };
}
```

**Step 2: Create sync routes with elysia-protobuf**

Create `apps/api/src/routes/sync.ts`:

```typescript
import { Elysia } from "elysia";
import { protobuf } from "elysia-protobuf";
import {
  SyncPushRequest,
  SyncPushResponse,
  SyncPullResponse,
} from "../proto/sync";
import { handlePush, handlePull } from "../lib/sync";
import { auth } from "../lib/auth";

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .use(
    protobuf({
      schemas: {
        "sync.push.request": SyncPushRequest,
        "sync.push.response": SyncPushResponse,
        "sync.pull.response": SyncPullResponse,
      },
    }),
  )
  .post(
    "/push",
    async ({ body, decode, headers }) => {
      const session = await auth.api.getSession({ headers });
      if (!session?.user) throw new Error("Unauthorized");

      const data = await decode("sync.push.request", body, headers);

      const result = await handlePush(data.shopId, {
        categories: data.categories,
        products: data.products,
        orders: data.orders,
        order_items: data.orderItems,
        users: data.users,
      });

      return {
        serverWins: result.serverWins.map((w) => ({
          table: w.table,
          ids: w.ids,
        })),
        serverTime: result.serverTime,
      };
    },
    {
      parse: "protobuf",
      responseSchema: "sync.push.response",
    },
  )
  .get(
    "/pull",
    async ({ query, headers }) => {
      const session = await auth.api.getSession({ headers });
      if (!session?.user) throw new Error("Unauthorized");

      const tables = query.tables.split(",");
      const result = await handlePull(query.shopId, tables, query.since);

      return {
        categories: (result.categories ?? []) as unknown[],
        products: (result.products ?? []) as unknown[],
        orders: (result.orders ?? []) as unknown[],
        orderItems: (result.order_items ?? []) as unknown[],
        users: (result.users ?? []) as unknown[],
        serverTime: result.serverTime,
      };
    },
    {
      responseSchema: "sync.pull.response",
    },
  );
```

> **Note:** The pull endpoint uses JSON response (not protobuf) for simplicity since it's a GET with query params. Only push uses binary protobuf. If you want pull to also be protobuf, change to POST with binary body.

**Step 3: Mount route in index.ts**

Add `.use(syncRoutes)` to the Elysia app chain.

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add protobuf sync push/pull endpoints"
```

---

### Task 7: Local Turso Dev Setup

**Files:**
- Create: `apps/api/.env.example`

**Step 1: Create .env.example**

```
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
BETTER_AUTH_SECRET=your-secret-here
BETTER_AUTH_URL=http://localhost:3001
```

**Step 2: Install Turso CLI and create local DB**

Run: `curl -sSfL https://get.tur.so/install.sh | bash`
Run: `turso dev --db-file local.db --port 8080` (separate terminal)

**Step 3: Apply migrations**

Run: `cd apps/api && bunx drizzle-kit push`

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "chore(api): add local Turso dev setup and env example"
```

---

## Phase 2: POS Schema Migration

### Task 8: Add shop_id to POS Schema

**Files:**
- Modify: `packages/database/src/schema.ts`
- Create: `apps/pos-app/drizzle/000X_add_shop_id.sql`

**Step 1: Update shared schema**

Add `shop_id` and `cloud_id` columns to all tables. Add new `shops` and `sync_meta` tables.

```typescript
// New tables:
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

// Add to each existing table:
// users:      shopId: text("shop_id"), cloudId: text("cloud_id"),
// categories: shopId: text("shop_id"), cloudId: text("cloud_id"),
// products:   shopId: text("shop_id"), cloudId: text("cloud_id"),
// orders:     shopId: text("shop_id"), cloudId: text("cloud_id"),
// orderItems: shopId: text("shop_id"), cloudId: text("cloud_id"),
```

**Step 2: Generate migration**

Run: `cd apps/pos-app && bunx drizzle-kit generate`

**Step 3: Register migration in Rust**

Add new migration to `apps/pos-app/src-tauri/src/lib.rs` migrations vec.

**Step 4: Commit**

```bash
git add packages/database/ apps/pos-app/drizzle/ apps/pos-app/src-tauri/
git commit -m "feat(schema): add shop_id, cloud_id, shops table, and sync_meta"
```

---

### Task 9: Update POS Queries with shop_id Filter

**Files:**
- Create: `apps/pos-app/src/lib/shop.ts`
- Modify: `apps/pos-app/src/db/menu.ts`
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/users.ts`
- Modify: `apps/pos-app/src/db/dashboard.ts`

**Step 1: Create shop context store**

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
- When `currentShopId()` is null, skip the filter (backward compatible for local-only mode)

**Step 3: Run existing tests**

Run: `cd apps/pos-app && bun run test`
Expected: All 61 existing tests still pass

**Step 4: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add shop_id filter to all DB queries"
```

---

## Phase 3: Cloud Auth on POS

### Task 10: Cloud Login/Register Pages

**Files:**
- Modify: `apps/pos-app/package.json`
- Create: `apps/pos-app/src/lib/cloud-auth.ts`
- Create: `apps/pos-app/src/pages/cloud-login.tsx`
- Create: `apps/pos-app/src/pages/onboarding.tsx`
- Modify: `apps/pos-app/src/pages/login.tsx`
- Modify: `apps/pos-app/src/App.tsx`

**Step 1: Install Better Auth client**

Run: `cd apps/pos-app && bun add better-auth`

**Step 2: Create cloud auth client**

Create `apps/pos-app/src/lib/cloud-auth.ts`:

```typescript
import { createAuthClient } from "better-auth/client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL: API_URL,
});

export const { signIn, signUp, useSession, signOut } = authClient;
```

**Step 3: Create cloud login page**

Create `apps/pos-app/src/pages/cloud-login.tsx` — email/password form + Google OAuth button. On success:
- If user has shops → show shop picker → store `shopId` → navigate to `/login`
- If user has no shops → navigate to `/onboarding`

**Step 4: Create onboarding page**

Create `apps/pos-app/src/pages/onboarding.tsx` — shop name input → POST `/api/shops` → store `shopId` → navigate to `/login`.

**Step 5: Update login page**

Add "Masuk Cloud" and "Daftar" buttons below the existing PIN login. These navigate to `/cloud-login`.

**Step 6: Add routes to App.tsx**

```tsx
<Route component={CloudLogin} path="/cloud-login" />
<Route component={Onboarding} path="/onboarding" />
```

**Step 7: Commit**

```bash
git add apps/pos-app/
git commit -m "feat(pos): add cloud login, register, and onboarding pages"
```

---

### Task 11: Settings — Cloud Account & Sync Controls

**Files:**
- Modify: `apps/pos-app/src/pages/settings.tsx`

**Step 1: Add cloud account section to settings**

Show:
- Connected account email (if any)
- Current shop name
- Last sync time (from `sync_meta` table)
- "Sync Now" button
- "Disconnect" button (clears cloud session, keeps local data)

**Step 2: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add cloud account and sync controls to settings"
```

---

## Phase 4: POS Rust Sync Layer

### Task 12: Add Rust Dependencies for Protobuf + HTTP

**Files:**
- Modify: `apps/pos-app/src-tauri/Cargo.toml`
- Create: `apps/pos-app/src-tauri/build.rs`

**Step 1: Add dependencies to Cargo.toml**

```toml
[dependencies]
# ... existing deps ...
prost = "0.13"
reqwest = { version = "0.12", features = ["rustls-tls"], default-features = false }

[build-dependencies]
# ... existing deps ...
prost-build = "0.13"
```

> **Note:** Using `rustls-tls` instead of `native-tls` to avoid C compiler dependency on Android.

**Step 2: Create build.rs**

Create `apps/pos-app/src-tauri/build.rs`:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    prost_build::compile_protos(
        &["../../../proto/sync.proto"],
        &["../../../proto/"],
    )?;
    Ok(())
}
```

This compiles the shared `.proto` schema into Rust structs at build time.

**Step 3: Verify it compiles**

Run: `cd apps/pos-app/src-tauri && cargo check --target aarch64-linux-android`
Expected: compiles successfully (may need Android NDK in PATH)

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): add prost + reqwest for protobuf sync"
```

---

### Task 13: Rust Sync Module — Push

**Files:**
- Create: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Create sync module**

Create `apps/pos-app/src-tauri/src/sync.rs`:

```rust
use prost::Message;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Column, Row, SqlitePool};
use tauri::{command, AppHandle, Manager};
use std::path::PathBuf;

include!(concat!(env!("OUT_DIR"), "/sakti.rs"));

// Include the proto-generated modules
pub mod pb {
    include!(concat!(env!("OUT_DIR"), "/sakti.pos.rs"));
}

#[derive(Debug, Serialize)]
struct SyncResult {
    tables_synced: Vec<String>,
    server_wins_count: usize,
    server_time: String,
}

#[command]
pub async fn sync_push(app: AppHandle, shop_id: String, api_url: String, auth_token: String) -> Result<SyncResult, String> {
    let pool = get_pool(&app)?;
    let client = Client::new();

    // Read changed rows from local DB
    let categories = read_table(&pool, "categories", &shop_id).await?;
    let products = read_table(&pool, "products", &shop_id).await?;
    let orders = read_table(&pool, "orders", &shop_id).await?;
    let order_items = read_table(&pool, "order_items", &shop_id).await?;

    // Build protobuf request
    let request = pb::SyncPushRequest {
        shop_id,
        categories,
        products,
        orders,
        order_items,
        users: vec![],
    };

    let mut buf = Vec::new();
    request.encode(&mut buf).map_err(|e| e.to_string())?;

    // Send to API
    let response = client
        .post(format!("{}/api/sync/push", api_url))
        .header("Content-Type", "application/x-protobuf")
        .header("Authorization", format!("Bearer {}", auth_token))
        .body(buf)
        .send()
        .await
        .map_err(|e| format!("Sync push request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Sync push failed: {}", response.status()));
    }

    let response_bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let push_response = pb::SyncPushResponse::decode(response_bytes.as_ref())
        .map_err(|e| format!("Failed to decode push response: {}", e))?;

    // Handle server wins — update local rows with server's updatedAt
    for win in &push_response.server_wins {
        for id in &win.ids {
            // Re-pull server's version for this row
            // (handled on next pull cycle)
        }
    }

    let tables_synced = vec![
        "categories".to_string(),
        "products".to_string(),
        "orders".to_string(),
        "order_items".to_string(),
    ];

    Ok(SyncResult {
        tables_synced,
        server_wins_count: push_response.server_wins.len(),
        server_time: push_response.server_time,
    })
}
```

**Step 2: Add helper functions**

Add `get_pool()` (reuses existing DB path logic from `drizzle_proxy.rs`), `read_table()` (reads rows from SQLite as proto-compatible structs).

**Step 3: Register in lib.rs**

Add `mod sync;` and register `sync::sync_push` in `tauri::generate_handler![]`.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): implement sync push command"
```

---

### Task 14: Rust Sync Module — Pull

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Step 1: Add sync_pull command**

```rust
#[derive(Debug, Serialize)]
struct PullResult {
    rows_received: usize,
    server_time: String,
}

#[command]
pub async fn sync_pull(app: AppHandle, shop_id: String, api_url: String, auth_token: String) -> Result<PullResult, String> {
    let pool = get_pool(&app)?;
    let client = Client::new();

    let tables = "categories,products,orders,order_items";
    let since = get_last_sync_at(&pool, &shop_id, "orders")
        .await
        .unwrap_or_else(|| "1970-01-01T00:00:00.000Z".to_string());

    let url = format!(
        "{}/api/sync/pull?shopId={}&tables={}&since={}",
        api_url, shop_id, tables, since
    );

    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", auth_token))
        .send()
        .await
        .map_err(|e| format!("Sync pull request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Sync pull failed: {}", response.status()));
    }

    let response_bytes = response.bytes().await.map_err(|e| e.to_string())?;
    let pull_response = pb::SyncPullResponse::decode(response_bytes.as_ref())
        .map_err(|e| format!("Failed to decode pull response: {}", e))?;

    let mut total_rows = 0;

    // Upsert categories
    for row in &pull_response.categories {
        upsert_row(&pool, "categories", &row.id, &row.shop_id, &shop_id).await?;
        total_rows += 1;
    }

    // Upsert products, orders, order_items similarly...
    for row in &pull_response.products { /* ... */ total_rows += 1; }
    for row in &pull_response.orders { /* ... */ total_rows += 1; }
    for row in &pull_response.order_items { /* ... */ total_rows += 1; }

    // Update sync_meta
    for table in ["categories", "products", "orders", "order_items"] {
        set_last_sync_at(&pool, table, &shop_id, &pull_response.server_time).await?;
    }

    Ok(PullResult {
        rows_received: total_rows,
        server_time: pull_response.server_time,
    })
}
```

**Step 2: Add helper: upsert_row, get_last_sync_at, set_last_sync_at**

`upsert_row`: INSERT OR REPLACE into local SQLite using `cloud_id` as the unique key.
`get_last_sync_at` / `set_last_sync_at`: read/write `sync_meta` table.

**Step 3: Register in lib.rs**

Add `sync::sync_pull` to `tauri::generate_handler![]`.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): implement sync pull command"
```

---

### Task 15: Rust Sync — Combined Sync Command + Scheduler

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Step 1: Add sync_now command**

Combines pull then push:

```rust
#[derive(Debug, Serialize)]
struct SyncNowResult {
    pull: PullResult,
    push: SyncResult,
}

#[command]
pub async fn sync_now(
    app: AppHandle,
    shop_id: String,
    api_url: String,
    auth_token: String,
) -> Result<SyncNowResult, String> {
    let pull = sync_pull(app.clone(), shop_id.clone(), api_url.clone(), auth_token.clone()).await?;
    let push = sync_push(app, shop_id, api_url, auth_token).await?;
    Ok(SyncNowResult { pull, push })
}
```

**Step 2: Register in lib.rs**

Add `sync::sync_now` to `tauri::generate_handler![]`.

**Step 3: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): add combined sync_now command"
```

---

### Task 16: POS Frontend — Sync Integration

**Files:**
- Create: `apps/pos-app/src/lib/sync.ts`
- Create: `apps/pos-app/src/components/sync-status.tsx`
- Modify: `apps/pos-app/src/components/layout.tsx`

**Step 1: Create sync bridge**

Create `apps/pos-app/src/lib/sync.ts` — thin wrapper that calls Rust Tauri commands:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { currentShopId } from "./shop";

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

const [syncStatus, setSyncStatus] = createSignal<SyncStatus>("idle");
const [lastSyncTime, setLastSyncTime] = createSignal<string | null>(null);
export { syncStatus, lastSyncTime };

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(authToken: string) {
  if (syncInterval) return;

  syncNow(authToken);
  syncInterval = setInterval(() => syncNow(authToken), 5 * 60 * 1000);
}

export function stopSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function syncNow(authToken: string) {
  const shopId = currentShopId();
  if (!shopId) return;

  setSyncStatus("syncing");
  try {
    const result = await invoke<{
      pull: { rows_received: number; server_time: string };
      push: { tables_synced: string[]; server_wins_count: number; server_time: string };
    }>("sync_now", {
      shopId,
      apiUrl: API_URL,
      authToken,
    });

    setLastSyncTime(result.pull.server_time);
    setSyncStatus("idle");
  } catch {
    setSyncStatus("error");
  }
}
```

**Step 2: Create sync status indicator**

Create `apps/pos-app/src/components/sync-status.tsx` — small icon in the topbar:
- Spinning icon when syncing
- Checkmark when idle
- Warning icon on error
- Hidden when no cloud account

**Step 3: Add to Layout**

Import and render `<SyncStatus />` in the topbar. Start scheduler on mount if cloud session exists and `currentShopId()` is set.

**Step 4: Wire settings "Sync Now" button**

Call `syncNow(authToken)` from the settings page button.

**Step 5: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add sync bridge, scheduler, and status indicator"
```

---

## Phase 5: Testing

### Task 17: API Tests

**Files:**
- Create: `apps/api/src/__test__/shops.test.ts`
- Create: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write shop endpoint tests**

Test: create shop, list shops, get shop by ID, unauthorized access rejected.

**Step 2: Write sync endpoint tests**

Test: push new rows, push update (last-write-wins), pull changes since timestamp, empty sync.

**Step 3: Commit**

```bash
git add apps/api/src/__test__/
git commit -m "test(api): add shop and sync endpoint tests"
```

---

### Task 18: POS Sync Tests

**Files:**
- Create: `apps/pos-app/src/lib/__test__/sync.test.ts`

**Step 1: Write sync bridge tests**

Test: `startSyncScheduler` sets up interval, `stopSyncScheduler` clears it, `syncNow` calls invoke with correct params, status signals update correctly.

**Step 2: Commit**

```bash
git add apps/pos-app/src/
git commit -m "test(pos): add sync bridge tests"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-7 | API foundation (Elysia, Turso, Better Auth, Shops, Proto schema, Protobuf sync, dev setup) |
| 2 | 8-9 | POS schema migration (shop_id, cloud_id, query filters) |
| 3 | 10-11 | Cloud auth on POS (login/register, onboarding, settings) |
| 4 | 12-16 | POS Rust sync layer (prost, reqwest, push, pull, scheduler, frontend bridge) |
| 5 | 17-18 | Testing (API + POS sync) |

**Total: 18 tasks, 5 phases**

**Key architectural decisions:**
- Protobuf contract defined in `proto/sync.proto` — single source of truth
- API generates TS from proto via `ts-proto` + `elysia-protobuf`
- Rust generates structs from proto via `prost-build` in `build.rs`
- Sync runs entirely in Rust — SolidJS never touches binary data
- `reqwest` with `rustls-tls` — no C compiler needed for Android
- Last-write-wins on `updated_at` — silent conflict resolution
- `shop_id` on every table — multi-tenant isolation
- `cloud_id` on POS rows — maps local integers to server UUIDs
