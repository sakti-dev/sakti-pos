import { categories, outletProducts, products } from "@repo/database";
import dayjs from "dayjs";
import { and, eq, isNull } from "drizzle-orm";
import { currentMerchantId, currentOutletId } from "~/store/outlet";
import { getSyncClient } from "~/store/sync";
import { db } from "./index";

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Product = Omit<typeof products.$inferSelect, "imageAssetId"> & {
  imageAssetId?: string | null;
};
export type NewProduct = typeof products.$inferInsert;
export type OutletProduct = typeof outletProducts.$inferSelect;

export async function getCategories(): Promise<Category[]> {
  const merchantId = currentMerchantId();
  const conditions = [isNull(categories.deletedAt)];
  if (merchantId) {
    conditions.push(eq(categories.merchantId, merchantId));
  }

  return await db
    .select()
    .from(categories)
    .where(and(...conditions))
    .orderBy(categories.name, categories.id);
}

export async function getCategory(id: string): Promise<Category | undefined> {
  const merchantId = currentMerchantId();
  const conditions = [eq(categories.id, id), isNull(categories.deletedAt)];
  if (merchantId) {
    conditions.push(eq(categories.merchantId, merchantId));
  }

  const [row] = await db
    .select()
    .from(categories)
    .where(and(...conditions));
  return row;
}

export async function createCategory(data: NewCategory): Promise<Category> {
  const merchantId = currentMerchantId() ?? "";
  const client = getSyncClient();
  const now = dayjs().toISOString();
  return await client.writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(categories)
      .values({
        ...data,
        isSynced: false,
        merchantId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await client.enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: categories,
    });
    return row;
  });
}

export async function updateCategory(
  id: string,
  data: Partial<Omit<NewCategory, "id">>
): Promise<Category> {
  const client = getSyncClient();
  return await client.writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(categories)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(categories.id, id))
      .returning();
    await client.enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: categories,
    });
    return row;
  });
}

export async function deleteCategory(id: string): Promise<void> {
  const now = dayjs().toISOString();
  const client = getSyncClient();
  await client.writeTransaction(db, async (tx) => {
    await client.writeLocalChange(tx, {
      operation: "update",
      rowId: id,
      table: categories,
      write: (writeTx) =>
        writeTx
          .update(categories)
          .set({ deletedAt: now, updatedAt: now, isSynced: false })
          .where(eq(categories.id, id)),
    });
  });
}

export async function getProductCountByCategory(
  categoryId: string
): Promise<number> {
  const merchantId = currentMerchantId();
  const conditions = [
    eq(products.categoryId, categoryId),
    isNull(products.deletedAt),
  ];
  if (merchantId) {
    conditions.push(eq(products.merchantId, merchantId));
  }

  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(and(...conditions))
    .limit(1);
  return rows.length;
}

export async function getProducts(
  filterCategoryId?: string
): Promise<Product[]> {
  const merchantId = currentMerchantId();
  const conditions = [isNull(products.deletedAt)];
  if (merchantId) {
    conditions.push(eq(products.merchantId, merchantId));
  }

  if (filterCategoryId !== undefined) {
    conditions.push(eq(products.categoryId, filterCategoryId));
  }
  return await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(products.name, products.id);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const merchantId = currentMerchantId();
  const conditions = [eq(products.id, id), isNull(products.deletedAt)];
  if (merchantId) {
    conditions.push(eq(products.merchantId, merchantId));
  }

  const [row] = await db
    .select()
    .from(products)
    .where(and(...conditions));
  return row;
}

export async function createProduct(data: NewProduct): Promise<Product> {
  const merchantId = currentMerchantId() ?? "";
  const client = getSyncClient();
  const now = dayjs().toISOString();
  return await client.writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        ...data,
        isSynced: false,
        merchantId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await client.enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: products,
    });
    return row;
  });
}

export async function updateProduct(
  id: string,
  data: Partial<Omit<NewProduct, "id">>
): Promise<Product> {
  const client = getSyncClient();
  return await client.writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(products)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(products.id, id))
      .returning();
    await client.enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: products,
    });
    return row;
  });
}

export async function deleteProduct(id: string): Promise<void> {
  const now = dayjs().toISOString();
  const client = getSyncClient();
  await client.writeTransaction(db, async (tx) => {
    await client.writeLocalChange(tx, {
      operation: "update",
      rowId: id,
      table: products,
      write: (writeTx) =>
        writeTx
          .update(products)
          .set({ deletedAt: now, updatedAt: now, isSynced: false })
          .where(eq(products.id, id)),
    });
  });
}

export async function getOutletProducts(): Promise<OutletProduct[]> {
  const outletId = currentOutletId();
  if (!outletId) {
    return [];
  }

  return await db
    .select()
    .from(outletProducts)
    .where(eq(outletProducts.outletId, outletId));
}
