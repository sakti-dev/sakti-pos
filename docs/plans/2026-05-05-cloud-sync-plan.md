# Cloud Sync & API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cloud sync, multi-shop support, and cloud auth to Sakti POS, enabling multi-device data sharing via a Turso-backed Elysia API running on Bun.

**Architecture:** Two-layer auth (cloud for device setup, PIN for daily unlock). Narvik for session management, Arctic for Google OAuth, argon2 for password hashing. API uses Elysia on Bun with Drizzle ORM + `@libsql/client` (Turso). JSON sync over HTTP with last-write-wins conflict resolution. POS Rust side uses `reqwest` to handle sync natively — JSON encoding/decoding, HTTP to API, writing directly to local SQLite via `sqlx`. SolidJS frontend just calls `invoke()` to trigger Rust sync. Shared Turso DB with `shop_id` multi-tenancy.

**Tech Stack:**
- **API:** Elysia (Bun-native), Narvik (sessions), Arctic (OAuth), `@node-rs/argon2` (password hashing), Drizzle ORM, `@libsql/client` (Turso)
- **POS Rust:** `reqwest` (rustls-tls), `serde_json`, `sqlx`
- **Deployment:** Bun (Railway / Fly.io / Render)
- **Schemas:** Colocated in `packages/database/src/` (`local-schema.ts` for POS, `api-schema.ts` for Turso)

**Design doc:** `docs/plans/2026-05-05-cloud-sync-design.md`

---

## Phase 1: API Foundation

### Task 1: Re-init API with Elysia (Bun-native)

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/tsconfig.json`
- Remove: `apps/api/wrangler.jsonc`
- Remove: `apps/api/.wrangler/`
- Remove: `apps/api/worker-configuration.d.ts`

**Step 1: Rewrite package.json for Bun**

Update `apps/api/package.json`:

```json
{
  "name": "@repo/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "lint": "ultracite check",
    "check-types": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@libsql/client": "^0.17.3",
    "@repo/database": "*",
    "drizzle-orm": "^0.45.2",
    "elysia": "^1.3"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.10",
    "typescript": "5.9.2"
  }
}
```

**Step 2: Remove Cloudflare Workers files**

Remove `wrangler.jsonc`, `.wrangler/`, `worker-configuration.d.ts`.

**Step 3: Rewrite src/index.ts with Elysia (Bun-native)**

```typescript
import { Elysia } from "elysia";

const app = new Elysia()
  .get("/", () => "Sakti POS API v1")
  .listen(3001);

console.log(`API running at http://localhost:${app.server!.port}`);
```

**Step 4: Update tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es2024",
    "lib": ["es2024"],
    "module": "es2022",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "noEmit": true,
    "isolatedModules": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

**Step 5: Install dependencies**

Run: `cd apps/api && bun install`

**Step 6: Verify dev server starts**

Run: `cd apps/api && bun run dev`
Expected: "API running at http://localhost:3001"

**Step 7: Commit**

```bash
git add apps/api/
git commit -m "feat(api): re-init with Elysia on Bun, remove Cloudflare Workers"
```

---

### Task 2: Add Turso + Drizzle to API

**Files:**
- Create: `apps/api/src/db/index.ts`
- Create: `apps/api/drizzle.config.ts`

> Note: Schema lives in `packages/database/src/api-schema.ts` (colocated with POS schema).

**Step 1: Install Turso + Drizzle dependencies**

Run: `cd apps/api && bun add drizzle-orm @libsql/client && bun add -d drizzle-kit`

**Step 2: Create Drizzle client**

Create `apps/api/src/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@repo/database/api-schema";

const tursoUrl = process.env.TURSO_DATABASE_URL ?? "http://127.0.0.1:8080";
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({
  url: tursoUrl,
  ...(tursoAuthToken && { authToken: tursoAuthToken }),
});

export const db = drizzle(client, { schema });
```

**Step 3: Create drizzle.config.ts**

```typescript
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  dialect: "sqlite",
  schema: path.resolve(__dirname, "../../packages/database/src/api-schema.ts"),
  out: "./drizzle",
});
```

**Step 4: Generate initial migration**

Run: `cd apps/api && bunx drizzle-kit generate`

**Step 5: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add Turso Drizzle client and initial migration"
```

---

### Task 3: Add Narvik Auth + Arctic OAuth + Argon2

**Files:**
- Modify: `apps/api/package.json`
- Modify: `packages/database/src/api-schema.ts` (add session table)
- Create: `apps/api/src/lib/auth.ts` (Narvik instance + helpers)
- Create: `apps/api/src/lib/oauth.ts` (Arctic Google OAuth)
- Create: `apps/api/src/routes/auth.ts` (register, login, logout, session, OAuth routes)
- Modify: `apps/api/src/index.ts` (mount auth routes)

**Step 1: Install dependencies**

Run: `cd apps/api && bun add narvik arctic @node-rs/argon2`

**Step 2: Add session table to API schema**

Add to `packages/database/src/api-schema.ts`:

```typescript
export const userSessions = sqliteTable("user_session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});
```

Regenerate migration: `cd apps/api && bunx drizzle-kit generate`

**Step 3: Create Narvik auth instance**

Create `apps/api/src/lib/auth.ts`:

```typescript
import { Narvik } from "narvik";
import { db } from "../db";
import { userSessions } from "@repo/database/api-schema";
import { eq } from "drizzle-orm";

export const narvik = new Narvik({
  data: {
    saveSession: async (session) => {
      await db.insert(userSessions).values({
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt,
      });
    },
    fetchSession: async (sessionId) => {
      const [row] = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, sessionId))
        .limit(1);
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        expiresAt: new Date(row.expiresAt.getTime()),
      };
    },
    updateSessionExpiry: async (sessionId, updatedExpiresAt) => {
      await db
        .update(userSessions)
        .set({ expiresAt: updatedExpiresAt })
        .where(eq(userSessions.id, sessionId));
    },
    deleteSession: async (sessionId) => {
      await db
        .delete(userSessions)
        .where(eq(userSessions.id, sessionId));
    },
    deleteSessionsForUser: async (userId) => {
      await db
        .delete(userSessions)
        .where(eq(userSessions.userId, userId));
    },
    deleteAllExpiredSessions: async () => {
      await db
        .delete(userSessions)
        .where(eq(userSessions.expiresAt, new Date(0)));
    },
  },
  cookie: {
    cookieExpiresInMs: 1000 * 60 * 60 * 24 * 30,
    attributes: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      path: "/",
    },
  },
});
```

**Step 4: Create Arctic OAuth helper**

Create `apps/api/src/lib/oauth.ts`:

```typescript
import { Google, generateCodeVerifier, generateState } from "arctic";

export const google = new Google(
  process.env.GOOGLE_CLIENT_ID ?? "",
  process.env.GOOGLE_CLIENT_SECRET ?? "",
  `${process.env.API_URL ?? "http://localhost:3001"}/api/auth/google/callback`,
);

export { generateState, generateCodeVerifier };
```

**Step 5: Create auth routes**

Create `apps/api/src/routes/auth.ts` — hand-written endpoints:

- `POST /api/auth/register` — email + password → hash with argon2 → insert user → create Narvik session → set cookie
- `POST /api/auth/login` — email + password → verify → create Narvik session → set cookie
- `POST /api/auth/logout` — validate session → invalidate → clear cookie
- `GET /api/auth/session` — validate session → return user
- `GET /api/auth/google` — generate state → redirect to Google
- `GET /api/auth/google/callback` — exchange code → upsert user → create Narvik session → set cookie

All routes use `narvik.validateSession(token)` to read the session cookie and `narvik.createSession(userId)` / `narvik.invalidateSession(sessionId)` to manage sessions. Use `narvik.createCookie(token)` / `narvik.createBlankCookie()` for Set-Cookie headers.

Password hashing:
```typescript
import { hash, verify } from "@node-rs/argon2";

const passwordHash = await hash(password, {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
});

const isValid = await verify(passwordHash, password);
```

**Step 6: Create auth middleware helper**

Create `apps/api/src/lib/session.ts` — reusable helper for protected routes:

```typescript
import { narvik } from "./auth";
import type { Session } from "narvik";

export async function getSessionFromRequest(request: Request): Promise<Session | null> {
  const token = getCookie(request, narvik.cookieName);
  if (!token) return null;
  return narvik.validateSession(token);
}

function getCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  const match = cookie?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match?.[1] ?? undefined;
}
```

**Step 7: Mount auth routes in index.ts**

```typescript
import { authRoutes } from "./routes/auth";

const app = new Elysia()
  .use(authRoutes)
  .get("/", () => "Sakti POS API v1")
  .listen(3001);
```

**Step 8: Verify auth endpoints**

Run: `cd apps/api && bun run dev`
Test: `curl http://localhost:3001/api/auth/session` — should return null/empty session

**Step 9: Commit**

```bash
git add apps/api/ packages/database/
git commit -m "feat(api): add Narvik auth, Arctic Google OAuth, and argon2 password hashing"
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
import { shops, users } from "@repo/database/api-schema";
import { getSessionFromRequest } from "../lib/session";

export const shopsRoutes = new Elysia({ prefix: "/api/shops" })
  .post(
    "/",
    async ({ body, set, request }) => {
      const session = await getSessionFromRequest(request);
      if (!session) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const [shop] = await db
        .insert(shops)
        .values({
          id,
          name: body.name,
          ownerId: session.userId,
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
  .get("/", async ({ set, request }) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    return db
      .select()
      .from(shops)
      .where(eq(shops.ownerId, session.userId));
  })
  .get("/:id", async ({ params: { id }, set, request }) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const [shop] = await db
      .select()
      .from(shops)
      .where(eq(shops.id, id));
    return shop ?? null;
  });
```

**Step 2: Mount route in index.ts**

Add `.use(shopsRoutes)` to the Elysia app chain.

**Step 3: Test with curl**

```bash
curl -X POST http://localhost:3001/api/shops \
  -H "Content-Type: application/json" \
  -H "Cookie: narvik_session=<token>" \
  -d '{"name": "Kopi Kenangan"}'
```

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add shop CRUD endpoints"
```

---

### Task 5: JSON Sync Endpoints

**Files:**
- Create: `apps/api/src/lib/sync.ts`
- Create: `apps/api/src/routes/sync.ts`
- Modify: `apps/api/src/index.ts`

**Step 1: Create sync logic**

Create `apps/api/src/lib/sync.ts` — handles push/pull with last-write-wins:

```typescript
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@repo/database/api-schema";

export async function handlePush(shopId: string, data: Record<string, unknown[]>) {
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

**Step 2: Create sync routes**

Create `apps/api/src/routes/sync.ts`:

```typescript
import { Elysia, t } from "elysia";
import { handlePush, handlePull } from "../lib/sync";
import { getSessionFromRequest } from "../lib/session";

export const syncRoutes = new Elysia({ prefix: "/api/sync" })
  .post(
    "/push",
    async ({ body, set, request }) => {
      const session = await getSessionFromRequest(request);
      if (!session) {
        set.status = 401;
        return { error: "Unauthorized" };
      }

      return handlePush(body.shopId, body.tables);
    },
    {
      body: t.Object({
        shopId: t.String(),
        tables: t.Record(t.String(), t.Array(t.Any())),
      }),
    },
  )
  .get(
    "/pull",
    async ({ query, set, request }) => {
      const session = await getSessionFromRequest(request);
      if (!session) {
        set.status = 401;
        return { error: "Unauthorized" };
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

Add `.use(syncRoutes)` to the Elysia app chain.

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add JSON sync push/pull endpoints"
```

---

### Task 6: Local Turso Dev Setup

**Files:**
- Create: `apps/api/.env.example`

**Step 1: Create .env.example**

```
TURSO_DATABASE_URL=http://127.0.0.1:8080
TURSO_AUTH_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
API_URL=http://localhost:3001
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

### Task 7: Add shop_id, Tombstone & Sync Columns to POS Schema

**Files:**
- Modify: `packages/database/src/local-schema.ts`
- Create: `apps/pos-app/drizzle/000X_add_shop_id.sql`

**Context:** In an offline-first architecture, hard deletes (`db.delete()`) are dangerous — if a record is deleted offline, there's no payload to send to the server when reconnecting, causing "zombie records" to reappear on pull. The solution is the **Tombstone Pattern**: soft-delete by setting `deletedAt`, then garbage-collect locally after confirming the server received it.

**Step 1: Update local POS schema**

Add `shop_id`, `cloud_id`, `deleted_at`, and `is_synced` columns to all sync tables. Add new `shops` and `sync_meta` tables.

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

// Add to each sync table (categories, products, orders, orderItems):
//   shopId: text("shop_id"),
//   cloudId: text("cloud_id"),
//   deletedAt: text("deleted_at"),                                    // TOMBSTONE
//   isSynced: integer("is_synced", { mode: "boolean" })              // SYNC TRACKING
//     .default(false).notNull(),
//
// Note: `isSynced` is client-only — never sent to server.
// Note: `deletedAt` is null = active, ISO string = tombstoned.
```

**Step 2: Generate migration**

Run: `cd apps/pos-app && bunx drizzle-kit generate`

**Step 3: Register migration in Rust**

Add new migration to `apps/pos-app/src-tauri/src/lib.rs` migrations vec.

**Step 4: Commit**

```bash
git add packages/database/ apps/pos-app/drizzle/ apps/pos-app/src-tauri/
git commit -m "feat(schema): add shop_id, cloud_id, deletedAt, isSynced, shops, sync_meta"
```

---

### Task 8: Update POS Queries — shop_id Filter + Soft Deletes

**Files:**
- Create: `apps/pos-app/src/lib/shop.ts`
- Modify: `apps/pos-app/src/db/menu.ts`
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/users.ts`
- Modify: `apps/pos-app/src/db/dashboard.ts`

**Context:** Every SELECT query must hide tombstoned records (`deletedAt IS NULL`). Every "delete" operation must use soft delete (set `deletedAt` + `updatedAt`, set `isSynced: false`). Hard delete is only safe for **unsynced draft records** (created offline, never pushed to server).

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
- Import `isNull` from `drizzle-orm`
- Add `where` clause: `and(eq(table.shopId, currentShopId()), isNull(table.deletedAt))` to all SELECT queries
- Add `shopId: currentShopId()` to all INSERT values
- When `currentShopId()` is null, skip the shop filter (backward compatible for local-only mode)
- **Always** include `isNull(table.deletedAt)` — tombstoned records must never appear in the UI

**Step 3: Replace all hard deletes with soft deletes**

Find all `db.delete()` calls in query files and replace with:

```typescript
import { and, eq, isNull } from "drizzle-orm";

// BEFORE (dangerous in offline-first):
// await db.delete(products).where(eq(products.id, productId));

// AFTER (tombstone pattern):
async function softDeleteProduct(productId: string) {
  const now = new Date().toISOString();
  await db.update(products)
    .set({
      deletedAt: now,    // Marks as tombstone
      updatedAt: now,    // Forces sync engine to push
      isSynced: false,   // Mark as pending sync
    })
    .where(eq(products.id, productId));
}

// EXCEPTION: Hard delete is safe for unsynced draft records only:
async function deleteUnsyncedDraft(productId: string) {
  const [record] = await db.select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (record && !record.isSynced && !record.deletedAt) {
    await db.delete(products).where(eq(products.id, productId));
  } else {
    await softDeleteProduct(productId);
  }
}
```

**Step 4: Run existing tests**

Run: `cd apps/pos-app && bun run test`
Expected: All 61 existing tests still pass

**Step 5: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add shop_id filter, soft deletes, and tombstone queries"
```

---

## Phase 3: Cloud Auth on POS

### Task 9: Cloud Login/Register Pages

**Files:**
- Create: `apps/pos-app/src/lib/cloud-auth.ts`
- Create: `apps/pos-app/src/pages/cloud-login.tsx`
- Create: `apps/pos-app/src/pages/onboarding.tsx`
- Modify: `apps/pos-app/src/pages/login.tsx`
- Modify: `apps/pos-app/src/App.tsx`

**Step 1: Create cloud auth client**

Create `apps/pos-app/src/lib/cloud-auth.ts` — fetch-based wrapper for the API auth endpoints:

```typescript
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function register(email: string, password: string, name: string) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
    credentials: "include",
  });
  return res.json();
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  return res.json();
}

export async function getSession() {
  const res = await fetch(`${API_URL}/api/auth/session`, {
    credentials: "include",
  });
  return res.json();
}

export async function logout() {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export function getGoogleOAuthUrl() {
  return `${API_URL}/api/auth/google`;
}
```

**Step 2: Create cloud login page**

Create `apps/pos-app/src/pages/cloud-login.tsx` — email/password form + Google OAuth link. On success:
- If user has shops → show shop picker → store `shopId` → navigate to `/login`
- If user has no shops → navigate to `/onboarding`

**Step 3: Create onboarding page**

Create `apps/pos-app/src/pages/onboarding.tsx` — shop name input → POST `/api/shops` → store `shopId` → navigate to `/login`.

**Step 4: Update login page**

Add "Masuk Cloud" and "Daftar" buttons below the existing PIN login. These navigate to `/cloud-login`.

**Step 5: Add routes to App.tsx**

```tsx
<Route component={CloudLogin} path="/cloud-login" />
<Route component={Onboarding} path="/onboarding" />
```

**Step 6: Commit**

```bash
git add apps/pos-app/
git commit -m "feat(pos): add cloud login, register, and onboarding pages"
```

---

### Task 10: Settings — Cloud Account & Sync Controls

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

### Task 11: Add Rust Dependencies for HTTP + JSON

**Files:**
- Modify: `apps/pos-app/src-tauri/Cargo.toml`

**Step 1: Add dependencies to Cargo.toml**

```toml
[dependencies]
# ... existing deps ...
reqwest = { version = "0.12", features = ["rustls-tls"], default-features = false }
serde_json = "1"
```

> **Note:** Using `rustls-tls` instead of `native-tls` to avoid C compiler dependency on Android. No protobuf needed — sync uses JSON.

**Step 2: Verify it compiles**

Run: `cd apps/pos-app/src-tauri && cargo check`
Expected: compiles successfully

**Step 3: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): add reqwest + serde_json for JSON sync"
```

---

### Task 12: Rust Sync Module — Push (with isSynced tracking)

**Files:**
- Create: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Context:** After a successful push, the server has received our tombstones. We must mark local records as `isSynced = true` so garbage collection can safely purge them later.

**Step 1: Create sync module**

Create `apps/pos-app/src-tauri/src/sync.rs`:

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::{command, AppHandle, Manager};

#[derive(Debug, Serialize)]
struct SyncResult {
    tables_synced: Vec<String>,
    server_wins_count: usize,
    server_time: String,
}

#[command]
pub async fn sync_push(app: AppHandle, shop_id: String, api_url: String) -> Result<SyncResult, String> {
    let pool = get_pool(&app)?;
    let client = Client::new();

    // Read unsynced rows from local DB (WHERE is_synced = false)
    let categories = read_unsynced_table(&pool, "categories", &shop_id).await?;
    let products = read_unsynced_table(&pool, "products", &shop_id).await?;
    let orders = read_unsynced_table(&pool, "orders", &shop_id).await?;
    let order_items = read_unsynced_table(&pool, "order_items", &shop_id).await?;

    let body = serde_json::json!({
        "shopId": shop_id,
        "tables": {
            "categories": categories,
            "products": products,
            "orders": orders,
            "order_items": order_items,
        }
    });

    let response = client
        .post(format!("{}/api/sync/push", api_url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Sync push failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Sync push failed: {}", response.status()));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;

    // POST-SYNC: Mark all pushed records as synced
    mark_table_synced(&pool, "categories", &shop_id).await?;
    mark_table_synced(&pool, "products", &shop_id).await?;
    mark_table_synced(&pool, "orders", &shop_id).await?;
    mark_table_synced(&pool, "order_items", &shop_id).await?;

    Ok(SyncResult {
        tables_synced: vec!["categories".into(), "products".into(), "orders".into(), "order_items".into()],
        server_wins_count: result["serverWins"].as_array().map(|a| a.len()).unwrap_or(0),
        server_time: result["serverTime"].as_str().unwrap_or("").to_string(),
    })
}
```

**Step 2: Add helper functions**

Add `get_pool()` (reuses existing DB path logic from `drizzle_proxy.rs`), `read_unsynced_table()` (reads rows WHERE `is_synced = 0` from SQLite as JSON), `mark_table_synced()` (UPDATE table SET `is_synced = 1` WHERE `is_synced = 0`).

```rust
/// Read rows that haven't been synced yet (is_synced = false)
async fn read_unsynced_table(pool: &SqlitePool, table: &str, shop_id: &str) -> Result<Vec<serde_json::Value>, String> {
    let query = format!(
        "SELECT * FROM {} WHERE shop_id = ? AND is_synced = 0",
        table
    );
    let rows: Vec<(String,)> = sqlx::query_as(&query)
        .bind(shop_id)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Convert rows to JSON (implementation depends on column structure)
    // Use sqlx::Row to extract columns dynamically
    todo!("Implement row-to-JSON conversion for each table")
}

/// Mark all records in a table as synced after successful push
async fn mark_table_synced(pool: &SqlitePool, table: &str, shop_id: &str) -> Result<(), String> {
    let query = format!(
        "UPDATE {} SET is_synced = 1 WHERE shop_id = ? AND is_synced = 0",
        table
    );
    sqlx::query(&query)
        .bind(shop_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

**Step 3: Register in lib.rs**

Add `mod sync;` and register `sync::sync_push` in `tauri::generate_handler![]`.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): implement sync push with isSynced tracking"
```

---

### Task 13: Rust Sync Module — Pull

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
pub async fn sync_pull(app: AppHandle, shop_id: String, api_url: String) -> Result<PullResult, String> {
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
        .send()
        .await
        .map_err(|e| format!("Sync pull failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Sync pull failed: {}", response.status()));
    }

    let result: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut total_rows = 0;

    // Upsert each table's rows into local SQLite
    for table in ["categories", "products", "orders", "order_items"] {
        if let Some(rows) = result[table].as_array() {
            for row in rows {
                upsert_row(&pool, table, row).await?;
                total_rows += 1;
            }
        }
    }

    // Update sync_meta
    let server_time = result["serverTime"].as_str().unwrap_or("");
    for table in ["categories", "products", "orders", "order_items"] {
        set_last_sync_at(&pool, table, &shop_id, server_time).await?;
    }

    Ok(PullResult {
        rows_received: total_rows,
        server_time: server_time.to_string(),
    })
}
```

**Step 2: Add helpers: upsert_row, get_last_sync_at, set_last_sync_at**

`upsert_row`: INSERT OR REPLACE into local SQLite using `cloud_id` as the unique key.
`get_last_sync_at` / `set_last_sync_at`: read/write `sync_meta` table.

**Step 3: Register in lib.rs**

Add `sync::sync_pull` to `tauri::generate_handler![]`.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): implement sync pull command (JSON)"
```

---

### Task 14: Rust Sync — Combined Sync + Garbage Collection

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`
- Modify: `apps/pos-app/src-tauri/src/lib.rs`

**Context:** After sync completes, we can safely purge tombstoned records that the server has confirmed. The rule: only hard-delete where `deletedAt IS NOT NULL AND isSynced = true`. This is crash-proof — if the app dies before GC runs, the next startup will find the same records and purge them then.

**Step 1: Add garbage collection command**

```rust
#[command]
pub async fn run_garbage_collection(app: AppHandle, shop_id: String) -> Result<usize, String> {
    let pool = get_pool(&app)?;
    let mut total_purged = 0;

    // Hard-delete tombstones that have been synced to server
    for table in ["categories", "products", "orders", "order_items"] {
        let query = format!(
            "DELETE FROM {} WHERE shop_id = ? AND deleted_at IS NOT NULL AND is_synced = 1",
            table
        );
        let result = sqlx::query(&query)
            .bind(&shop_id)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;
        total_purged += result.rows_affected();
    }

    Ok(total_purged)
}
```

**Step 2: Add startup sync command**

Combines pull → push → garbage collection (used by splash screen):

```rust
#[derive(Debug, Serialize)]
struct SyncNowResult {
    pull: PullResult,
    push: SyncResult,
    purged: usize,
}

#[command]
pub async fn sync_now(app: AppHandle, shop_id: String, api_url: String) -> Result<SyncNowResult, String> {
    let pull = sync_pull(app.clone(), shop_id.clone(), api_url.clone()).await?;
    let push = sync_push(app.clone(), shop_id.clone(), api_url).await?;
    let purged = run_garbage_collection(app, shop_id).await?;
    Ok(SyncNowResult { pull, push, purged })
}
```

**Step 3: Register in lib.rs**

Add `sync::sync_now` and `sync::run_garbage_collection` to `tauri::generate_handler![]`.

**Step 4: Commit**

```bash
git add apps/pos-app/src-tauri/
git commit -m "feat(rust): add combined sync with post-sync garbage collection"
```

---

### Task 15: POS Frontend — Sync Integration + Splash Screen

**Files:**
- Create: `apps/pos-app/src/lib/sync.ts`
- Create: `apps/pos-app/src/components/sync-status.tsx`
- Modify: `apps/pos-app/src/components/layout.tsx`

**Context:** The splash screen runs on every app launch. It executes the 4-step boot sequence: gather pending changes → push to server → mark as synced → garbage collect. If the device is offline, the app proceeds with local data (no blocking).

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

export function startSyncScheduler() {
  if (syncInterval) return;

  syncNow();
  syncInterval = setInterval(() => syncNow(), 5 * 60 * 1000);
}

export function stopSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function syncNow() {
  const shopId = currentShopId();
  if (!shopId) return;

  setSyncStatus("syncing");
  try {
    const result = await invoke<{
      pull: { rows_received: number; server_time: string };
      push: { tables_synced: string[]; server_wins_count: number; server_time: string };
      purged: number;
    }>("sync_now", {
      shopId,
      apiUrl: API_URL,
    });

    setLastSyncTime(result.pull.server_time);
    setSyncStatus("idle");
  } catch {
    setSyncStatus("offline");
  }
}

/**
 * Startup sync — called from splash screen on app launch.
 * Runs pull → push → garbage collection.
 * Does NOT block the app if offline.
 */
export async function runStartupSync(): Promise<void> {
  const shopId = currentShopId();
  if (!shopId) return;

  try {
    await invoke("sync_now", { shopId, apiUrl: API_URL });
  } catch {
    // Offline — proceed with local data, don't block
  }
}
```

> Note: No auth token needed for sync — Rust sends the session cookie automatically via `reqwest`'s cookie jar. Alternatively, pass the cookie string from the frontend.

**Step 2: Create splash screen component**

Create `apps/pos-app/src/pages/splash.tsx` — shown on every app launch:

```tsx
import { onMount, createSignal } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { runStartupSync } from "~/lib/sync";

export function SplashScreen() {
  const navigate = useNavigate();
  const [status, setStatus] = createSignal("Memulai aplikasi...");

  onMount(async () => {
    try {
      setStatus("Menyinkronkan data...");
      await runStartupSync();
      setStatus("Selesai!");
    } catch {
      // Offline — proceed with local data
    } finally {
      setTimeout(() => navigate("/pos"), 500);
    }
  });

  return (
    <div class="flex flex-col items-center justify-center h-screen bg-blue-600 text-white">
      <h1 class="text-4xl font-bold mb-4">Sakti POS</h1>
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-4" />
      <p class="text-sm opacity-80">{status()}</p>
    </div>
  );
}
```

**Step 3: Create sync status indicator**

Create `apps/pos-app/src/components/sync-status.tsx` — small icon in the topbar:
- Spinning icon when syncing
- Checkmark when idle
- Warning icon on error/offline
- Hidden when no cloud account

**Step 4: Add to Layout**

Import and render `<SyncStatus />` in the topbar. Start scheduler on mount if cloud session exists and `currentShopId()` is set.

**Step 5: Wire settings "Sync Now" button**

Call `syncNow()` from the settings page button.

**Step 6: Add splash route to App.tsx**

```tsx
<Route component={SplashScreen} path="/" />
```

Set splash as the root route — it auto-redirects to `/pos` after sync completes.

**Step 7: Commit**

```bash
git add apps/pos-app/src/
git commit -m "feat(pos): add sync bridge, splash screen, scheduler, and GC"
```

---

## Phase 5: Testing

### Task 16: API Tests

**Files:**
- Create: `apps/api/src/__test__/auth.test.ts`
- Create: `apps/api/src/__test__/shops.test.ts`
- Create: `apps/api/src/__test__/sync.test.ts`

**Step 1: Write auth endpoint tests**

Test: register, login, session validation, logout, invalid credentials rejected.

**Step 2: Write shop endpoint tests**

Test: create shop, list shops, get shop by ID, unauthorized access rejected.

**Step 3: Write sync endpoint tests**

Test: push new rows, push update (last-write-wins), pull changes since timestamp, empty sync, push tombstoned records (with `deletedAt` set), pull tombstones and verify they propagate to client.

**Step 4: Commit**

```bash
git add apps/api/src/__test__/
git commit -m "test(api): add auth, shop, and sync endpoint tests"
```

---

### Task 17: POS Sync Tests

**Files:**
- Create: `apps/pos-app/src/lib/__test__/sync.test.ts`

**Step 1: Write sync bridge tests**

Test: `startSyncScheduler` sets up interval, `stopSyncScheduler` clears it, `syncNow` calls invoke with correct params, status signals update correctly.

**Step 2: Write tombstone + GC tests**

Test:
- Soft-deleted record sets `deletedAt` and `updatedAt` and `isSynced: false`
- `isSynced` becomes `true` after successful push
- Garbage collection hard-deletes records where `deletedAt IS NOT NULL AND isSynced = true`
- Garbage collection does NOT delete records where `isSynced = false` (not yet pushed)
- Garbage collection does NOT delete records where `deletedAt IS NULL` (active records)
- Hard delete is safe for unsynced draft records

**Step 3: Commit**

```bash
git add apps/pos-app/src/
git commit -m "test(pos): add sync bridge and tombstone/GC tests"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-6 | API foundation (Elysia on Bun, Turso/Drizzle, Narvik auth, Shops, JSON sync, dev setup) |
| 2 | 7-8 | POS schema migration (shop_id, cloud_id, query filters) |
| 3 | 9-10 | Cloud auth on POS (login/register, onboarding, settings) |
| 4 | 11-15 | POS Rust sync layer (reqwest, JSON push/pull, scheduler, frontend bridge) |
| 5 | 16-17 | Testing (API + POS sync) |

**Total: 17 tasks, 5 phases**

**Key architectural decisions:**
- **Narvik** for session management — token in cookie, SHA-256 hash in DB, sliding-window expiry
- **Arctic** for Google OAuth — lightweight, edge-compatible
- **PBKDF2** for password hashing via Web Crypto API — CF Workers compatible (no CPU time issue)
- **JSON sync** over HTTP — simple, no codegen, debuggable
- **Cloudflare Workers** deployment — Elysia + CloudflareAdapter, `env` from `cloudflare:workers`
- **Colocated schemas** in `packages/database/src/` — `local-schema.ts` (POS) and `api-schema.ts` (Turso)
- **Rust sync layer** — `reqwest` + `serde_json`, no binary protocol
- **`reqwest` with `rustls-tls`** — no C compiler needed for Android
- **Last-write-wins** on `updated_at` — silent conflict resolution
- **`shop_id`** on every table — multi-tenant isolation
- **`cloud_id`** on POS rows — maps local integers to server UUIDs
- **Tombstone pattern** (soft deletes) — `deletedAt` column on all sync tables. Never hard-delete synced records on the client. Set `deletedAt` + `updatedAt` on delete, which triggers sync push naturally. Server `handlePush`/`handlePull` need no changes — tombstones flow through existing LWW logic.
- **`isSynced` flag** — client-only column tracking whether a record has been pushed to server. After successful push, Rust marks records as `isSynced = true`. Only tombstoned + synced records can be garbage-collected.
- **Post-sync garbage collection** — Hard-delete local records where `deletedAt IS NOT NULL AND isSynced = true`. Runs on splash screen startup and after manual sync. Crash-proof: if GC is interrupted, next startup re-runs it.
- **Hard delete exception** — Only safe for unsynced draft records (created offline, never pushed to server). Check `isSynced == false && deletedAt == null` before hard-deleting.
- **Splash screen boot sequence** — pull → push → mark synced → garbage collect. Non-blocking if offline.
