# Database Transactions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wrap all multi-write database operations in transactions to ensure atomicity and prevent data inconsistency.

**Architecture:** The API uses Drizzle ORM + libSQL (Turso), supporting `db.transaction(async (tx) => { ... })`. The POS app uses Drizzle ORM + sqlite-proxy which delegates to Rust `run_sql_batch` for transactional batches. The fix pattern is: replace sequential `db.*` calls with `db.transaction(async (tx) => { ... })` using `tx` for all writes inside.

**Tech Stack:** Drizzle ORM, libSQL (API), sqlite-proxy (POS), Elysia, TypeScript

---

### Task 1: Add `recordSyncEvent` overload that accepts a transaction

Currently `recordSyncEvent` in `apps/api/src/lib/sync-events.ts` always uses the global `db`. We need an overload that accepts a Drizzle transaction so callers can pass `tx` from within an existing `db.transaction()`.

**Files:**
- Modify: `apps/api/src/lib/sync-events.ts`

**Step 1: Update `recordSyncEvent` to accept optional transaction**

Use the same `TransactionTx` pattern already established in `apps/api/src/sync/service.ts:73`:

```typescript
import { syncEvents } from "@repo/database/api-schema";
import { db } from "../db";

export type SyncEventOperation = "insert" | "update" | "delete";
export type SyncEventScopeType = "merchant" | "outlet";

export interface SyncEventInput {
  changedAt: string;
  operation: SyncEventOperation;
  rowId: string;
  scopeId: string;
  scopeType: SyncEventScopeType;
  tableName: string;
}

type TransactionTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recordSyncEvent(
  input: SyncEventInput,
  tx?: TransactionTx
): Promise<void> {
  const executor = tx ?? db;
  await executor.insert(syncEvents).values(input);
}
```

**Step 2: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/api/src/lib/sync-events.ts
git commit -m "refactor: allow recordSyncEvent to accept a transaction"
```

---

### Task 2: Wrap merchant creation in a transaction

**Files:**
- Modify: `apps/api/src/merchants/routes.ts`

**Step 1: Wrap the `/create` handler body in `db.transaction()`**

Replace lines 38-62 with:

```typescript
      let merchant: { id: string; name: string; createdAt: string; updatedAt: string };
      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(merchants)
          .values({
            name,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await tx.insert(userMerchants).values({
          joinedAt: now,
          merchantId: created.id,
          role: "owner",
          userId: session.userId,
        });

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: created.id,
            scopeId: created.id,
            scopeType: "merchant",
            tableName: "merchants",
          },
          tx
        );

        merchant = created;
      });
```

**Step 2: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/api/src/merchants/routes.ts
git commit -m "fix: wrap merchant creation in a transaction"
```

---

### Task 3: Wrap outlet creation and update in transactions

**Files:**
- Modify: `apps/api/src/outlets/routes.ts`

**Step 1: Wrap the `/create` handler writes in `db.transaction()`**

Replace lines 69-108 with:

```typescript
      const now = new Date().toISOString();
      let outlet: typeof outlets.$inferSelect;
      let register: typeof registers.$inferSelect;

      await db.transaction(async (tx) => {
        const [createdOutlet] = await tx
          .insert(outlets)
          .values({
            merchantId,
            name,
            address: request.hasAddress ? request.address : null,
            timezone: request.timezone || "Asia/Jakarta",
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        const [createdRegister] = await tx
          .insert(registers)
          .values({
            outletId: createdOutlet.id,
            name: "Register 1",
            shortId: generateShortId(),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: createdOutlet.id,
            scopeId: merchantId,
            scopeType: "merchant",
            tableName: "outlets",
          },
          tx
        );
        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: createdRegister.id,
            scopeId: createdOutlet.id,
            scopeType: "outlet",
            tableName: "registers",
          },
          tx
        );

        outlet = createdOutlet;
        register = createdRegister;
      });
```

**Step 2: Wrap the `/update` handler writes in `db.transaction()`**

Replace lines 168-188 with:

```typescript
      const now = new Date().toISOString();
      let updated: typeof outlets.$inferSelect;

      await db.transaction(async (tx) => {
        const [result] = await tx
          .update(outlets)
          .set({
            address: request.hasAddress ? request.address : outlet.address,
            isActive: request.hasIsActive ? request.isActive : outlet.isActive,
            name: request.hasName ? request.name : outlet.name,
            timezone: request.hasTimezone ? request.timezone : outlet.timezone,
            updatedAt: now,
          })
          .where(eq(outlets.id, request.id))
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: result.id,
            scopeId: result.merchantId,
            scopeType: "merchant",
            tableName: "outlets",
          },
          tx
        );

        updated = result;
      });
```

**Step 3: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/api/src/outlets/routes.ts
git commit -m "fix: wrap outlet create and update in transactions"
```

---

### Task 4: Wrap staff routes in transactions (4 handlers)

**Files:**
- Modify: `apps/api/src/staff/routes.ts`

**Step 1: Move the owner lookup + claim inside a single transaction to prevent race conditions**

The current code queries unclaimed owners *before* the transaction, allowing two concurrent requests to both pass the pre-check and claim the same row. Fix: move the lookup and claim into one transaction, and use `isNull(staff.cloudUserId)` as an additional WHERE guard on the UPDATE so that only one claim succeeds.

Replace lines 198-231 with:

```typescript
      let response: ReturnType<typeof encodeCurrentStaffResponse> | undefined;

      await db.transaction(async (tx) => {
        const ownerRows = await tx
          .select({
            createdAt: staff.createdAt,
            id: staff.id,
            merchantId: staff.merchantId,
            outletId: staff.outletId,
            name: staff.name,
            role: staff.role,
            isActive: staff.isActive,
            updatedAt: staff.updatedAt,
            pin: staff.pin,
          })
          .from(staff)
          .where(
            and(
              eq(staff.merchantId, request.merchantId),
              eq(staff.role, "owner"),
              eq(staff.isActive, true),
              isNull(staff.cloudUserId)
            )
          )
          .limit(2);

        if (ownerRows.length === 0) {
          response = encodeCurrentStaffResponse({
            claimed: false,
            reason: "no-staff",
            staff: null,
          });
          return;
        }

        if (ownerRows.length > 1) {
          response = encodeCurrentStaffResponse({
            claimed: false,
            reason: "ambiguous-owner",
            staff: null,
          });
          return;
        }

        const now = new Date().toISOString();
        const [claimedOwner] = await tx
          .update(staff)
          .set({
            cloudUserId: session.userId,
            updatedAt: now,
          })
          .where(
            and(eq(staff.id, ownerRows[0].id), isNull(staff.cloudUserId))
          )
          .returning({
            createdAt: staff.createdAt,
            id: staff.id,
            merchantId: staff.merchantId,
            outletId: staff.outletId,
            name: staff.name,
            role: staff.role,
            isActive: staff.isActive,
            updatedAt: staff.updatedAt,
            pin: staff.pin,
          });

        if (!claimedOwner) {
          response = encodeCurrentStaffResponse({
            claimed: false,
            reason: "no-staff",
            staff: null,
          });
          return;
        }

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: claimedOwner.id,
            scopeId: request.merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );

        response = encodeCurrentStaffResponse({
          claimed: true,
          staff: claimedOwner,
        });
      });

      return (
        response ??
        encodeCurrentStaffResponse({
          claimed: false,
          reason: "no-staff",
          staff: null,
        })
      );
```

Also remove the now-redundant pre-transaction owner lookup (lines 175-212) and the `ownerRows` variable declared before it, since the lookup now happens inside the transaction. The earlier membership and staff checks (lines 130-173) remain outside the transaction since they are read-only guards.

**Step 2: Wrap `/create` writes (lines 275-295) in `db.transaction()`**

Replace lines 272-295 with:

```typescript
      const pinHash = await hashPin(pin);
      const now = new Date().toISOString();

      let created: typeof staff.$inferSelect;
      await db.transaction(async (tx) => {
        const [result] = await tx
          .insert(staff)
          .values({
            merchantId,
            outletId: request.hasOutletId ? request.outletId : null,
            name,
            pin: pinHash,
            role: requireRole(request.role),
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: result.id,
            scopeId: merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );

        created = result;
      });
```

**Step 3: Wrap `/update-pin` writes (lines 384-397) in `db.transaction()`**

Replace lines 382-397 with:

```typescript
      const pinHash = await hashPin(pin);
      const now = new Date().toISOString();
      let updated: typeof staff.$inferSelect;

      await db.transaction(async (tx) => {
        const [result] = await tx
          .update(staff)
          .set({ pin: pinHash, updatedAt: now })
          .where(eq(staff.id, request.id))
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: request.id,
            scopeId: existing.merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );

        updated = result;
      });
```

**Step 4: Wrap `/delete` writes (lines 433-450) in `db.transaction()`**

Replace lines 432-450 with:

```typescript
      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx
          .update(staff)
          .set({
            isActive: false,
            deletedAt: now,
            updatedAt: now,
          })
          .where(eq(staff.id, request.id));

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "delete",
            rowId: request.id,
            scopeId: existing.merchantId,
            scopeType: "merchant",
            tableName: "staff",
          },
          tx
        );
      });
```

**Step 5: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/api/src/staff/routes.ts
git commit -m "fix: wrap staff CRUD handlers in transactions"
```

---

### Task 5: Wrap register routes in transactions (3 handlers)

**Files:**
- Modify: `apps/api/src/registers/public-routes.ts`
- Modify: `apps/api/src/registers/protected-routes.ts`

**Step 1: Move the pairing claim and sync event into `db.transaction()` in public-routes.ts**

Replace lines 38-56 with:

```typescript
      const now = new Date().toISOString();
      return await db.transaction(async (tx) => {
        const [updatedRegister] = await tx
          .update(registers)
          .set({
            pairingCode: null,
            pairingExpiresAt: null,
            lastSeenAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(registers.id, register.id),
              eq(registers.pairingCode, request.pairingCode)
            )
          )
          .returning();

        if (!updatedRegister) {
          set.status = 400;
          return { error: "Pairing code expired" };
        }

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: updatedRegister.id,
            scopeId: updatedRegister.outletId,
            scopeType: "outlet",
            tableName: "registers",
          },
          tx
        );

        const [outlet] = await tx
          .select()
          .from(outlets)
          .where(eq(outlets.id, updatedRegister.outletId))
          .limit(1);

        return {
          hasOutlet: !!outlet,
          outlet: outlet ? encodeOutlet(outlet) : undefined,
          register: encodeRegister(updatedRegister),
        };
      });
```

Also remove the now-redundant outlet lookup and return block that currently follows the update in `public-routes.ts`, since the transaction now returns the final response directly.

**Step 2: Wrap `/create` writes (lines 95-115) in `db.transaction()` in protected-routes.ts**

Replace lines 95-115 with:

```typescript
      let register: typeof registers.$inferSelect;
      await db.transaction(async (tx) => {
        const [result] = await tx
          .insert(registers)
          .values({
            outletId,
            name,
            shortId: generateShortId(),
            pairingCode,
            pairingExpiresAt,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "insert",
            rowId: result.id,
            scopeId: outletId,
            scopeType: "outlet",
            tableName: "registers",
          },
          tx
        );

        register = result;
      });
```

**Step 3: Wrap `/delete` writes (lines 174-186) in `db.transaction()` in protected-routes.ts**

Replace lines 173-186 with:

```typescript
      const now = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx
          .update(registers)
          .set({ isActive: false, updatedAt: now })
          .where(eq(registers.id, request.id));

        await recordSyncEvent(
          {
            changedAt: now,
            operation: "update",
            rowId: request.id,
            scopeId: register.outletId,
            scopeType: "outlet",
            tableName: "registers",
          },
          tx
        );
      });
```

**Step 4: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/api/src/registers/public-routes.ts apps/api/src/registers/protected-routes.ts
git commit -m "fix: wrap register pair/create/delete in transactions"
```

---

### Task 6: Wrap sync cleanup in a transaction

**Files:**
- Modify: `apps/api/src/lib/sync-cleanup.ts`

**Step 1: Wrap the cleanup loop in `db.transaction()`**

Replace lines 48-70 with:

```typescript
export async function cleanupSyncHistory(
  input: SyncCleanupInput
): Promise<SyncCleanupResult> {
  const cutoff = new Date(
    input.now.getTime() - input.retentionDays * MS_PER_DAY
  ).toISOString();

  return await db.transaction(async (tx) => {
    const deletedEventsResult = await tx
      .delete(syncEvents)
      .where(lt(syncEvents.changedAt, cutoff));
    const deletedSoftRows: Record<string, number> = {};

    for (const item of SOFT_DELETED_CLEANUP_TABLES) {
      const result = await tx
        .delete(item.table)
        .where(and(isNotNull(item.deletedAt), lt(item.deletedAt, cutoff)));
      deletedSoftRows[item.name] = getRowsAffected(result);
    }

    return {
      deletedEvents: getRowsAffected(deletedEventsResult),
      deletedSoftRows,
    };
  });
}
```

**Step 2: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/api/src/lib/sync-cleanup.ts
git commit -m "fix: wrap sync cleanup in a transaction"
```

---

### Task 7: Add `recordLocalChange` overload that accepts a transaction

For the POS app side, `recordLocalChange` in `apps/pos-app/src/db/sync-outbox.ts` uses the global `db`. We need an overload that accepts a Drizzle transaction.

**Files:**
- Modify: `apps/pos-app/src/db/sync-outbox.ts`

**Step 1: Update `recordLocalChange` to accept optional transaction**

```typescript
import { syncOutbox } from "@repo/database";
import dayjs from "dayjs";
import { and, eq, isNull } from "drizzle-orm";
import { db, type DatabaseType } from "./index";

export type SyncOperation = "insert" | "update" | "delete";
export type SyncScopeType = "merchant" | "outlet";
export type SyncOutboxRow = typeof syncOutbox.$inferSelect;

export interface LocalChangeInput {
  operation: SyncOperation;
  rowId: string;
  scopeId: string;
  scopeType: SyncScopeType;
  tableName: string;
}

export async function recordLocalChange(
  input: LocalChangeInput,
  tx?: DatabaseType
): Promise<void> {
  const executor = tx ?? db;
  const [existing] = await executor
    .select()
    .from(syncOutbox)
    .where(
      and(
        eq(syncOutbox.tableName, input.tableName),
        eq(syncOutbox.rowId, input.rowId),
        isNull(syncOutbox.syncedAt)
      )
    )
    .limit(1);

  const nextOperation = resolveOutboxOperation(
    existing?.operation as SyncOperation | undefined,
    input.operation
  );
  const changedAt = dayjs().toISOString();

  if (!nextOperation) {
    await executor
      .delete(syncOutbox)
      .where(
        and(
          eq(syncOutbox.tableName, input.tableName),
          eq(syncOutbox.rowId, input.rowId),
          isNull(syncOutbox.syncedAt)
        )
      );
    return;
  }

  if (existing) {
    await executor
      .update(syncOutbox)
      .set({
        changedAt,
        operation: nextOperation,
        scopeId: input.scopeId,
        scopeType: input.scopeType,
      })
      .where(
        and(
          eq(syncOutbox.tableName, input.tableName),
          eq(syncOutbox.rowId, input.rowId),
          isNull(syncOutbox.syncedAt)
        )
      );
    return;
  }

  await executor.insert(syncOutbox).values({
    changedAt,
    id: crypto.randomUUID(),
    operation: nextOperation,
    rowId: input.rowId,
    scopeId: input.scopeId,
    scopeType: input.scopeType,
    tableName: input.tableName,
  });
}
```

**Step 2: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/db/sync-outbox.ts
git commit -m "refactor: allow recordLocalChange to accept a transaction"
```

---

### Task 8: Wrap POS app menu CRUD in transactions

**Files:**
- Modify: `apps/pos-app/src/db/menu.ts`

**Step 1: Wrap `createCategory` in a transaction**

```typescript
export async function createCategory(data: NewCategory): Promise<Category> {
  const merchantId = currentMerchantId() ?? "";
  let row: Category;
  await db.transaction(async (tx) => {
    const [result] = await tx
      .insert(categories)
      .values({ ...data, isSynced: false, merchantId })
      .returning();
    await recordLocalChange(
      {
        operation: "insert",
        rowId: result.id,
        scopeId: result.merchantId,
        scopeType: "merchant",
        tableName: "categories",
      },
      tx
    );
    row = result;
  });
  return row!;
}
```

**Step 2: Wrap `updateCategory` in a transaction**

```typescript
export async function updateCategory(
  id: string,
  data: Partial<Omit<NewCategory, "id">>
): Promise<Category> {
  let row: Category;
  await db.transaction(async (tx) => {
    const [result] = await tx
      .update(categories)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(categories.id, id))
      .returning();
    await recordLocalChange(
      {
        operation: "update",
        rowId: result.id,
        scopeId: result.merchantId,
        scopeType: "merchant",
        tableName: "categories",
      },
      tx
    );
    row = result;
  });
  return row!;
}
```

**Step 3: Wrap `deleteCategory` in a transaction**

```typescript
export async function deleteCategory(id: string): Promise<void> {
  const now = dayjs().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(categories)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(eq(categories.id, id));
    await recordLocalChange(
      {
        operation: "delete",
        rowId: id,
        scopeId: currentMerchantId() ?? "",
        scopeType: "merchant",
        tableName: "categories",
      },
      tx
    );
  });
}
```

**Step 4: Wrap `createProduct` in a transaction**

```typescript
export async function createProduct(data: NewProduct): Promise<Product> {
  const merchantId = currentMerchantId() ?? "";
  let row: Product;
  await db.transaction(async (tx) => {
    const [result] = await tx
      .insert(products)
      .values({ ...data, isSynced: false, merchantId })
      .returning();
    await recordLocalChange(
      {
        operation: "insert",
        rowId: result.id,
        scopeId: result.merchantId,
        scopeType: "merchant",
        tableName: "products",
      },
      tx
    );
    row = result;
  });
  return row!;
}
```

**Step 5: Wrap `updateProduct` in a transaction**

```typescript
export async function updateProduct(
  id: string,
  data: Partial<Omit<NewProduct, "id">>
): Promise<Product> {
  let row: Product;
  await db.transaction(async (tx) => {
    const [result] = await tx
      .update(products)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(products.id, id))
      .returning();
    await recordLocalChange(
      {
        operation: "update",
        rowId: result.id,
        scopeId: result.merchantId,
        scopeType: "merchant",
        tableName: "products",
      },
      tx
    );
    row = result;
  });
  return row!;
}
```

**Step 6: Wrap `deleteProduct` in a transaction**

```typescript
export async function deleteProduct(id: string): Promise<void> {
  const now = dayjs().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(eq(products.id, id));
    await recordLocalChange(
      {
        operation: "delete",
        rowId: id,
        scopeId: currentMerchantId() ?? "",
        scopeType: "merchant",
        tableName: "products",
      },
      tx
    );
  });
}
```

**Step 7: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 8: Commit**

```bash
git add apps/pos-app/src/db/menu.ts
git commit -m "fix: wrap menu CRUD operations in transactions"
```

---

### Task 9: Wrap POS app staff CRUD in transactions

**Files:**
- Modify: `apps/pos-app/src/db/staff.ts`

**Step 1: Wrap `createStaffMember` in a transaction**

```typescript
export async function createStaffMember(
  data: NewStaffMember
): Promise<StaffMember> {
  let row: StaffMember;
  await db.transaction(async (tx) => {
    const [result] = await tx.insert(staff).values(data).returning();
    await recordLocalChange(
      {
        operation: "insert",
        rowId: result.id,
        scopeId: result.merchantId,
        scopeType: "merchant",
        tableName: "staff",
      },
      tx
    );
    row = result;
  });
  return row!;
}
```

**Step 2: Wrap `updateStaffMember` in a transaction**

```typescript
export async function updateStaffMember(
  id: string,
  data: Partial<Omit<NewStaffMember, "id">>
): Promise<StaffMember> {
  let row: StaffMember;
  await db.transaction(async (tx) => {
    const [result] = await tx
      .update(staff)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(staff.id, id))
      .returning();
    await recordLocalChange(
      {
        operation: "update",
        rowId: result.id,
        scopeId: result.merchantId,
        scopeType: "merchant",
        tableName: "staff",
      },
      tx
    );
    row = result;
  });
  return row!;
}
```

**Step 3: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/pos-app/src/db/staff.ts
git commit -m "fix: wrap staff CRUD in transactions"
```

---

### Task 10: Wrap POS app outlet update in a transaction

**Files:**
- Modify: `apps/pos-app/src/db/outlets.ts`

**Step 1: Wrap `updateOutletTimezone` in a transaction**

```typescript
export async function updateOutletTimezone(
  outletId: string,
  timezone: string
): Promise<{ id: string; name: string; timezone: string } | undefined> {
  const now = dayjs().toISOString();
  let result: { id: string; name: string; timezone: string; merchantId: string } | undefined;

  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(outlets)
      .set({ timezone, updatedAt: now, isSynced: false })
      .where(eq(outlets.id, outletId))
      .returning({
        id: outlets.id,
        merchantId: outlets.merchantId,
        name: outlets.name,
        timezone: outlets.timezone,
      });

    if (!row) {
      return;
    }

    await recordLocalChange(
      {
        operation: "update",
        rowId: row.id,
        scopeId: row.merchantId,
        scopeType: "merchant",
        tableName: "outlets",
      },
      tx
    );

    result = row;
  });

  if (!result) {
    return;
  }

  return {
    id: result.id,
    name: result.name,
    timezone: result.timezone,
  };
}
```

**Step 2: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/db/outlets.ts
git commit -m "fix: wrap outlet update in a transaction"
```

---

### Task 11: Wrap POS app cancel order in a transaction

**Files:**
- Modify: `apps/pos-app/src/db/orders.ts`

**Step 1: Wrap `cancelOrder` in a transaction**

```typescript
export async function cancelOrder(orderId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        status: "cancelled",
        updatedAt: dayjs().toISOString(),
        isSynced: false,
      })
      .where(eq(orders.id, orderId));
    await recordLocalChange(
      {
        operation: "update",
        rowId: orderId,
        scopeId: currentOutletId() ?? "",
        scopeType: "outlet",
        tableName: "orders",
      },
      tx
    );
  });
}
```

**Step 2: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/db/orders.ts
git commit -m "fix: wrap cancel order in a transaction"
```

---

### Task 12: Include sync outbox writes in order creation transaction

This is the trickiest one. Currently `createOrder` uses `run_sql_batch` (Rust-side transaction) for the order + items, but the outbox writes happen separately in TypeScript. The fix: include the outbox INSERT SQL statements in the same `run_sql_batch` call.

**Files:**
- Modify: `apps/pos-app/src/db/orders.ts`

**Step 1: Build outbox INSERT statements and include them in the batch**

Replace lines 111-131 with:

```typescript
  const scopeId = outletId ?? "";
  const outboxChangedAt = createdAt;
  const outboxStatements: SqlStatement[] = [
    {
      sql: `INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_id, scope_type, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        "orders",
        orderId,
        "insert",
        scopeId,
        "outlet",
        outboxChangedAt,
      ],
    },
    ...orderItemsWithIds.map(({ id }) => ({
      sql: `INSERT INTO sync_outbox (id, table_name, row_id, operation, scope_id, scope_type, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      params: [
        crypto.randomUUID(),
        "order_items",
        id,
        "insert",
        scopeId,
        "outlet",
        outboxChangedAt,
      ],
    })),
  ];

  await invoke<BatchResult>("run_sql_batch", {
    statements: [insertOrder, ...itemStatements, ...outboxStatements],
  });
```

Also remove the now-unused `recordLocalChange` import from `apps/pos-app/src/db/orders.ts` after the direct outbox insert SQL replaces the helper calls.

**Step 2: Update the order creation test**

The test in `apps/pos-app/src/db/__test__/orders.test.ts` currently asserts that `mockRecordLocalChange` is called. Since we no longer call `recordLocalChange` (we write outbox rows directly via SQL), update the test:

- Remove the `mockRecordLocalChange` assertions (lines 141-154)
- Instead, assert that the `run_sql_batch` statements array contains the outbox INSERT statements in addition to the order/item statements:

```typescript
    expect(mockedInvoke).toHaveBeenCalledWith("run_sql_batch", {
      statements: expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining("INSERT INTO orders"),
        }),
        expect.objectContaining({
          sql: expect.stringContaining("INSERT INTO order_items"),
        }),
        expect.objectContaining({
          sql: expect.stringContaining("INSERT INTO sync_outbox"),
          params: expect.arrayContaining(["orders"]),
        }),
      ]),
    });
```

Run: `cd apps/pos-app && npx vitest run src/db/__test__/orders.test.ts`
Expected: PASS

**Step 2: Run format check**

Run: `bun x ultracite check`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/pos-app/src/db/orders.ts
git commit -m "fix: include sync outbox writes in order creation batch"
```

---

### Task 13: Verify the build compiles

**Step 1: Run the final lint check**

Run: `bun x ultracite check`
Expected: No errors

**Step 2: Verify no regressions with typecheck**

Run: `cd apps/api && bun x tsc --noEmit --pretty false`
Run: `cd apps/pos-app && bun x tsc --noEmit --pretty false`
Expected: No type errors

**Note:** Do not add separate TypeScript transaction wrappers for `markOutboxSynced` or `purgeSyncedOutboxBefore`. The production sync path already handles those operations in `apps/pos-app/src-tauri/src/sync.rs`, and the current TS helpers are not part of the live sync flow.
