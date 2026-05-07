# Cloud Sync Bugfixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 9 bugs preventing cloud sync from working end-to-end: missing auth in Rust sync, missing pull for order_items, missing shopId filtering, broken FK constraints, and sync tracking gaps.

**Architecture:** The sync flow is: POS SolidJS → `invoke()` → Rust `sync_now` → `reqwest` → Elysia API → Turso. Auth uses Narvik session cookies. The Rust layer needs to receive and forward the session cookie that the browser holds.

**Tech Stack:** Rust (reqwest, sqlx, tauri), TypeScript (Elysia, Drizzle ORM), SolidJS

**Target:** Cloudflare Workers (not Bun-native). PBKDF2 (not argon2). Keep both as-is.

---

## Task 1: Add `updatedAt` to `orderItems` API Schema

**Files:**
- Modify: `packages/database/src/api-schema.ts` (add `updatedAt` to orderItems)
- Modify: `apps/api/drizzle/` (regenerate migration)

**Step 1: Add `updatedAt` column to `orderItems` in api-schema.ts**

In `packages/database/src/api-schema.ts`, add `updatedAt` to the `orderItems` table:

```typescript
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
  updatedAt: text("updated_at").notNull(),   // ADD THIS
  deletedAt: text("deleted_at"),
});
```

**Step 2: Generate migration**

Run: `cd apps/api && bunx drizzle-kit generate`

**Step 3: Commit**

```bash
git add packages/database/ apps/api/drizzle/
git commit -m "fix(schema): add updatedAt to orderItems API table for sync pull"
```

---

## Task 2: Add `order_items` to `handlePull`

**Files:**
- Modify: `apps/api/src/lib/sync.ts`
- Modify: `apps/api/src/__test__/sync.test.ts`

**Step 1: Add `order_items` case to `handlePull` switch**

In `apps/api/src/lib/sync.ts`, add a case for `order_items` in the `handlePull` switch:

```typescript
case "order_items": {
  result.order_items = await db
    .select()
    .from(orderItems)
    .where(
      and(eq(orderItems.shopId, shopId), gt(orderItems.updatedAt, since)),
    );
  break;
}
```

**Step 2: Update existing test**

In `apps/api/src/__test__/sync.test.ts`, update the test "does not pull order_items (not supported)" to expect order_items to be returned:

```typescript
test("pulls order_items", async () => {
  mockSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });

  const result = await handlePull(
    "shop-1",
    ["categories", "order_items"],
    "2025-01-01T00:00:00.000Z",
  );

  expect(result.categories).toEqual([]);
  expect(result.order_items).toEqual([]);
});
```

Also update the "pulls multiple tables" test to include `order_items`.

**Step 3: Run tests**

Run: `cd apps/api && bun test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add apps/api/src/
git commit -m "fix(sync): add order_items to handlePull for complete sync"
```

---

## Task 3: Pass Session Cookie from Tauri Frontend to Rust Sync

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs` (accept `session_cookie` param, use in reqwest)
- Modify: `apps/pos-app/src/lib/sync.ts` (read cookie from document.cookie, pass to invoke)

**Context:** This is the **critical blocker**. The API auth endpoints set a `narvik_session` cookie via `Set-Cookie` header. When the POS frontend makes `fetch()` calls (via `cloud-auth.ts` with `credentials: "include"`), the browser/Tauri webview stores this cookie. But the Rust `reqwest` client has no cookie jar and no access to the webview's cookie store. The fix: read the cookie from `document.cookie` in the JS layer and pass it as a parameter to the Rust commands, which forward it as a `Cookie` header in the HTTP request.

**Step 1: Update Rust sync commands to accept and use `session_cookie`**

In `apps/pos-app/src-tauri/src/sync.rs`, modify `sync_push`, `sync_pull`, and `sync_now` to accept `session_cookie: String` and attach it as a header:

```rust
fn build_client(session_cookie: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .default_headers({
            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert(
                reqwest::header::COOKIE,
                reqwest::header::HeaderValue::from_str(session_cookie)
                    .map_err(|e| format!("Invalid cookie: {}", e))?,
            );
            headers
        })
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}
```

Then in `sync_push` and `sync_pull`, replace `let client = reqwest::Client::new();` with `let client = build_client(&session_cookie)?;`.

Update `sync_now` to accept and pass through `session_cookie`:

```rust
#[command]
pub async fn sync_now(
    app: AppHandle,
    shop_id: String,
    api_url: String,
    session_cookie: String,
) -> Result<SyncNowResult, String> {
    let pull = sync_pull_inner(&app, &shop_id, &api_url, &session_cookie).await?;
    let push = sync_push_inner(&app, &shop_id, &api_url, &session_cookie).await?;
    let purged = run_garbage_collection(app, shop_id).await?;
    Ok(SyncNowResult { pull, push, purged })
}
```

Refactor `sync_push` and `sync_pull` to call inner functions that take `(&AppHandle, &str, &str, &str)` instead of consuming `AppHandle`. The public `#[command]` functions remain as thin wrappers.

**Step 2: Update frontend sync bridge to read and pass cookie**

In `apps/pos-app/src/lib/sync.ts`, add a helper to read the session cookie:

```typescript
function getSessionCookie(): string {
  const match = document.cookie.match(/(?:^|;\s*)narvik_session=([^;]*)/);
  return match?.[1] ? `narvik_session=${match[1]}` : "";
}
```

Update `syncNow()` and `runStartupSync()` to pass the cookie:

```typescript
export async function syncNow(): Promise<SyncNowResult> {
  const shopId = currentShopId();
  if (!shopId) {
    return {
      pull: { rows_received: 0, server_time: "" },
      push: { tables_synced: [], server_wins_count: 0, server_time: "" },
      purged: 0,
    };
  }

  const sessionCookie = getSessionCookie();
  if (!sessionCookie) {
    setSyncStatus("offline");
    throw new Error("Gagal menyinkronkan");
  }

  setSyncStatus("syncing");
  try {
    const result = await invoke<SyncNowResult>("sync_now", {
      shopId,
      apiUrl: API_URL,
      sessionCookie,
    });
    setLastSyncTime(result.pull.server_time);
    setSyncStatus("idle");
    return result;
  } catch {
    setSyncStatus("offline");
    throw new Error("Gagal menyinkronkan");
  }
}
```

Same pattern for `runStartupSync()`.

**Step 3: URL-encode `since` timestamp in sync_pull**

In `sync.rs`, the `since` parameter in the pull URL contains colons that should be encoded:

```rust
let url = format!(
    "{}/api/sync/pull?shopId={}&tables={}&since={}",
    api_url, shop_id, tables,
    urlencoding::encode(since)
);
```

Add `urlencoding = "2"` to `Cargo.toml` dependencies.

**Step 4: Verify it compiles**

Run: `cd apps/pos-app/src-tauri && cargo check`
Expected: compiles successfully

**Step 5: Commit**

```bash
git add apps/pos-app/src-tauri/ apps/pos-app/src/lib/sync.ts
git commit -m "fix(sync): pass session cookie from Tauri to Rust for authenticated sync"
```

---

## Task 4: Fix `cancelOrder` — Set `isSynced: false`

**Files:**
- Modify: `apps/pos-app/src/db/orders.ts`

**Step 1: Add `isSynced: false` to `cancelOrder`**

In `apps/pos-app/src/db/orders.ts`, update `cancelOrder`:

```typescript
export async function cancelOrder(orderId: number): Promise<void> {
  await db
    .update(orders)
    .set({
      status: "cancelled",
      updatedAt: dayjs().toISOString(),
      isSynced: false,
    })
    .where(eq(orders.id, orderId));
}
```

**Step 2: Commit**

```bash
git add apps/pos-app/src/db/orders.ts
git commit -m "fix(orders): mark cancelled orders as unsynced for cloud sync"
```

---

## Task 5: Add `shopId` Filtering to POS Queries

**Files:**
- Modify: `apps/pos-app/src/db/menu.ts`
- Modify: `apps/pos-app/src/db/orders.ts`
- Modify: `apps/pos-app/src/db/dashboard.ts`

**Context:** When `currentShopId()` is null (local-only mode, no cloud connected), queries should still work — they just skip the shopId filter. When a shopId is set, all queries must filter by it. The `isNull(deletedAt)` tombstone filter is already present.

**Step 1: Update `menu.ts` queries**

Add `import { currentShopId } from "~/lib/shop";` and apply shopId filter conditionally:

For `getCategories()`:
```typescript
export async function getCategories(): Promise<Category[]> {
  const conditions = [isNull(categories.deletedAt)];
  const shopId = currentShopId();
  if (shopId) conditions.push(eq(categories.shopId, shopId));

  return await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(categories.name, categories.id);
}
```

Apply the same pattern to: `getCategory`, `getProducts`, `getProduct`, `getProductCountByCategory`.

For `createCategory` and `createProduct`, add `shopId: currentShopId()` to the values when it's set.

**Step 2: Update `orders.ts` queries**

Same pattern for: `getOrders`, `getOrderItems`, `getDailySummary`, `getActiveProductsByCategory`.

For `createOrder`, add `shopId: currentShopId() ?? undefined` to the SQL insert if shopId is set.

**Step 3: Update `dashboard.ts` queries**

Same pattern for all dashboard queries that filter orders: `getDashboardSummary`, `getPaymentBreakdown`, `getHourlyBreakdown`, `getDailyBreakdown`, `getWeeklyBreakdown`, `getMonthlyBreakdown`, `getTopProducts`, `getSalesByCategory`.

**Step 4: Run existing tests**

Run: `cd apps/pos-app && bun run test`
Expected: All existing tests still pass (tests mock `currentShopId` as null)

**Step 5: Commit**

```bash
git add apps/pos-app/src/db/
git commit -m "feat(pos): add shopId filtering to all POS queries"
```

---

## Task 6: Fix `shopId: "placeholder"` — Make `shopId` Nullable on API Users Table

**Files:**
- Modify: `packages/database/src/api-schema.ts` (make `users.shopId` nullable)
- Modify: `apps/api/src/routes/auth.ts` (remove placeholder)
- Modify: `apps/api/drizzle/` (regenerate migration)

**Context:** Users register before they have a shop. The current `shopId: "placeholder"` violates the FK constraint. Making it nullable is the correct fix — the user creates a shop after registration, and the shopId is set then.

**Step 1: Make `users.shopId` nullable in api-schema.ts**

In `packages/database/src/api-schema.ts`:

```typescript
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  shopId: text("shop_id")
    .references((): SQLiteColumn => shops.id),  // Remove .notNull()
  email: text("email").notNull().unique(),
  // ... rest unchanged
});
```

**Step 2: Remove `shopId: "placeholder"` from register and OAuth**

In `apps/api/src/routes/auth.ts`, remove `shopId: "placeholder"` from both the register handler and the Google OAuth callback handler.

**Step 3: Update `shops.routes.ts` to set `user.shopId` after shop creation**

In `apps/api/src/routes/shops.ts`, after creating a shop, update the user's `shopId`:

```typescript
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

await db
  .update(users)
  .set({ shopId: id })
  .where(eq(users.id, session.userId));

return shop;
```

**Step 4: Generate migration**

Run: `cd apps/api && bunx drizzle-kit generate`

**Step 5: Commit**

```bash
git add packages/database/ apps/api/
git commit -m "fix(auth): make users.shopId nullable, remove placeholder, set on shop creation"
```

---

## Task 7: Fix Rust `upsert_row` — Use `cloud_id` for Conflict Resolution

**Files:**
- Modify: `apps/pos-app/src-tauri/src/sync.rs`

**Context:** Server records have UUID `id` values. Local POS uses integer auto-increment `id`. When pulling from server, we need to match by `cloud_id` (which stores the server UUID) not by local `id`. The upsert should: INSERT if no local row has matching `cloud_id`, UPDATE if one exists.

**Step 1: Update `upsert_row` to conflict on `cloud_id`**

```rust
async fn upsert_row(
    pool: &SqlitePool,
    table: &str,
    row: &Value,
) -> Result<(), String> {
    let obj = row
        .as_object()
        .ok_or_else(|| format!("Row for {} is not a JSON object", table))?;

    // Map server 'id' to 'cloud_id' for local storage
    let mut local_obj = obj.clone();
    if let Some(server_id) = local_obj.remove("id") {
        local_obj.insert("cloud_id".to_string(), server_id);
    }
    // Remove server-side fields that don't exist locally
    local_obj.remove("shop_id"); // We use local shopId, not server's

    let columns: Vec<String> = local_obj.keys().cloned().collect();
    if columns.is_empty() {
        return Ok(());
    }

    let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();

    let set_clause: Vec<String> = columns
        .iter()
        .filter(|c| *c != "cloud_id")
        .map(|c| format!("{} = excluded.{}", c, c))
        .collect();

    let query = if set_clause.is_empty() {
        format!(
            "INSERT OR IGNORE INTO {} ({}) VALUES ({})",
            table,
            columns.join(", "),
            placeholders.join(", ")
        )
    } else {
        format!(
            "INSERT INTO {} ({}) VALUES ({}) ON CONFLICT(cloud_id) DO UPDATE SET {}",
            table,
            columns.join(", "),
            placeholders.join(", "),
            set_clause.join(", ")
        )
    };

    let mut q = sqlx::query(&query);
    for col in &columns {
        let val = &local_obj[col];
        match val {
            Value::Null => q = q.bind(None::<String>),
            Value::Bool(b) => q = q.bind(*b),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q = q.bind(i);
                } else if let Some(f) = n.as_f64() {
                    q = q.bind(f);
                } else {
                    q = q.bind::<Option<i64>>(None);
                }
            }
            Value::String(s) => q = q.bind(s.clone()),
            Value::Array(_) | Value::Object(_) => {
                q = q.bind(serde_json::to_string(val).unwrap_or_default())
            }
        }
    }

    q.execute(pool)
        .await
        .map_err(|e| format!("Failed to upsert into {}: {}", table, e))?;
    Ok(())
}
```

**Step 2: Verify it compiles**

Run: `cd apps/pos-app/src-tauri && cargo check`
Expected: compiles successfully

**Step 3: Commit**

```bash
git add apps/pos-app/src-tauri/src/sync.rs
git commit -m "fix(sync): use cloud_id for upsert conflict resolution on pull"
```

---

## Task 8: Update API Auth Test for Nullable `shopId`

**Files:**
- Modify: `apps/api/src/__test__/auth.test.ts`

**Step 1: Update register test to not expect `shopId`**

The register test should match the new schema where `shopId` is nullable (not "placeholder").

**Step 2: Run tests**

Run: `cd apps/api && bun test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add apps/api/src/__test__/
git commit -m "test(api): update auth tests for nullable shopId"
```

---

## Summary

| Task | Severity | Fix |
|------|----------|-----|
| 1 | Important | Add `updatedAt` to `orderItems` API schema |
| 2 | Important | Add `order_items` case to `handlePull` |
| 3 | **Critical** | Pass session cookie from Tauri JS → Rust `reqwest` |
| 4 | Important | Set `isSynced: false` in `cancelOrder` |
| 5 | Important | Add `shopId` filtering to all POS queries |
| 6 | Important | Make `users.shopId` nullable, remove placeholder |
| 7 | Minor | Use `cloud_id` for upsert conflict resolution |
| 8 | Minor | Update auth tests for nullable shopId |

**Total: 8 tasks**

**Execution order:** Tasks 1-2 can be parallel. Task 3 is the critical path. Tasks 4-5 are independent. Tasks 6-8 are related (schema change cascade).
