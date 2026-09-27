import dayjs from "dayjs";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentMerchantId } from "~/lib/auth/session";
import { db, TABLE } from "./index";

export type CategoryRow = typeof TABLE.categories.$inferSelect;
export type ProductRow = typeof TABLE.products.$inferSelect;

export interface ProductInput {
  readonly categoryId: string | null;
  readonly imageAssetId?: string | null;
  readonly isActive?: boolean;
  readonly name: string;
  /** Whole Rupiah; converted to minor units at this seam. */
  readonly price: number;
  readonly sortOrder?: number;
}

function requireMerchantId(): string {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("catalog: no active merchant");
  }
  return merchantId;
}

/* ── categories ────────────────────────────────────────────────── */

export async function getCategories(): Promise<CategoryRow[]> {
  const merchantId = currentMerchantId();
  const conditions = [isNull(TABLE.categories.deletedAt)];
  if (merchantId) {
    conditions.push(eq(TABLE.categories.merchantId, merchantId));
  }
  return await db
    .select()
    .from(TABLE.categories)
    .where(and(...conditions))
    .orderBy(asc(TABLE.categories.sortOrder), asc(TABLE.categories.name));
}

export async function createCategory(input: {
  readonly name: string;
  readonly sortOrder?: number;
}): Promise<CategoryRow> {
  const merchantId = requireMerchantId();
  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(TABLE.categories)
      .values({
        merchantId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.categories,
    });
    return row;
  });
}

export async function updateCategory(
  id: string,
  input: {
    readonly isActive?: boolean;
    readonly name?: string;
    readonly sortOrder?: number;
  }
): Promise<CategoryRow> {
  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(TABLE.categories)
      .set({ ...input, updatedAt: now, isSynced: false })
      .where(eq(TABLE.categories.id, id))
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: TABLE.categories,
    });
    return row;
  });
}

export async function softDeleteCategory(id: string): Promise<void> {
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(TABLE.categories)
      .set({ deletedAt: now, isActive: false, updatedAt: now, isSynced: false })
      .where(eq(TABLE.categories.id, id))
      .returning();
    if (row) {
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: row.id,
        table: TABLE.categories,
      });
    }
  });
}

/* ── products ──────────────────────────────────────────────────── */

export async function getProducts(
  filterCategoryId?: string
): Promise<ProductRow[]> {
  const merchantId = currentMerchantId();
  const conditions = [isNull(TABLE.products.deletedAt)];
  if (merchantId) {
    conditions.push(eq(TABLE.products.merchantId, merchantId));
  }
  if (filterCategoryId) {
    conditions.push(eq(TABLE.products.categoryId, filterCategoryId));
  }
  return await db
    .select()
    .from(TABLE.products)
    .where(and(...conditions))
    .orderBy(asc(TABLE.products.name), asc(TABLE.products.id));
}

export async function getProduct(id: string): Promise<ProductRow | undefined> {
  const [row] = await db
    .select()
    .from(TABLE.products)
    .where(eq(TABLE.products.id, id));
  return row;
}

export async function createProduct(input: ProductInput): Promise<ProductRow> {
  if (!Number.isInteger(input.price) || input.price <= 0) {
    throw new Error("createProduct: price must be a positive integer");
  }
  const merchantId = requireMerchantId();
  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(TABLE.products)
      .values({
        merchantId,
        categoryId: input.categoryId,
        name: input.name,
        priceMinorUnits: input.price * 100,
        imageAssetId: input.imageAssetId ?? null,
        isActive: input.isActive ?? true,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.products,
    });
    return row;
  });
}

export async function updateProduct(
  id: string,
  input: Partial<Omit<ProductInput, "name">> & { readonly name?: string }
): Promise<ProductRow> {
  if (
    input.price !== undefined &&
    (!Number.isInteger(input.price) || input.price <= 0)
  ) {
    throw new Error("updateProduct: price must be a positive integer");
  }
  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(TABLE.products)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.categoryId === undefined
          ? {}
          : { categoryId: input.categoryId }),
        ...(input.price === undefined
          ? {}
          : { priceMinorUnits: input.price * 100 }),
        ...(input.imageAssetId === undefined
          ? {}
          : { imageAssetId: input.imageAssetId }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
        updatedAt: now,
        isSynced: false,
      })
      .where(eq(TABLE.products.id, id))
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: TABLE.products,
    });
    return row;
  });
}

export async function softDeleteProduct(id: string): Promise<void> {
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(TABLE.products)
      .set({ deletedAt: now, isActive: false, updatedAt: now, isSynced: false })
      .where(eq(TABLE.products.id, id))
      .returning();
    if (row) {
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: row.id,
        table: TABLE.products,
      });
    }
  });
}
