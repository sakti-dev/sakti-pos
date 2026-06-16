import dayjs from "dayjs";
import { and, eq, isNull } from "drizzle-orm";
import { getSyncClient } from "~/lib/sync";
import { currentMerchantId, currentOutletId } from "~/store/outlet";
import { db, TABLE } from "./index";

export type Category = typeof TABLE.categories.$inferSelect;
type NewCategory = typeof TABLE.categories.$inferInsert;
export type Product = Omit<
  typeof TABLE.products.$inferSelect,
  "imageAssetId"
> & {
  imageAssetId?: string | null;
};
type NewProduct = typeof TABLE.products.$inferInsert;
export type OutletProduct = typeof TABLE.outletProducts.$inferSelect;

export async function getCategories(): Promise<Category[]> {
  const merchantId = currentMerchantId();
  const conditions = [isNull(TABLE.categories.deletedAt)];
  if (merchantId) {
    conditions.push(eq(TABLE.categories.merchantId, merchantId));
  }

  return await db
    .select()
    .from(TABLE.categories)
    .where(and(...conditions))
    .orderBy(TABLE.categories.name, TABLE.categories.id);
}

export async function getCategory(id: string): Promise<Category | undefined> {
  const merchantId = currentMerchantId();
  const conditions = [
    eq(TABLE.categories.id, id),
    isNull(TABLE.categories.deletedAt),
  ];
  if (merchantId) {
    conditions.push(eq(TABLE.categories.merchantId, merchantId));
  }

  const [row] = await db
    .select()
    .from(TABLE.categories)
    .where(and(...conditions));
  return row;
}

export async function createCategory(data: NewCategory): Promise<Category> {
  const merchantId = currentMerchantId() ?? "";

  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(TABLE.categories)
      .values({
        ...data,
        isSynced: false,
        merchantId,
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
  data: Partial<Omit<NewCategory, "id">>
): Promise<Category> {
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(TABLE.categories)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
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

export async function deleteCategory(id: string): Promise<void> {
  const now = dayjs().toISOString();

  await getSyncClient().writeTransaction(db, async (tx) => {
    await getSyncClient().writeLocalChange(tx, {
      operation: "update",
      rowId: id,
      table: TABLE.categories,
      write: (writeTx) =>
        writeTx
          .update(TABLE.categories)
          .set({ deletedAt: now, updatedAt: now, isSynced: false })
          .where(eq(TABLE.categories.id, id)),
    });
  });
}

export async function getProductCountByCategory(
  categoryId: string
): Promise<number> {
  const merchantId = currentMerchantId();
  const conditions = [
    eq(TABLE.products.categoryId, categoryId),
    isNull(TABLE.products.deletedAt),
  ];
  if (merchantId) {
    conditions.push(eq(TABLE.products.merchantId, merchantId));
  }

  const rows = await db
    .select({ id: TABLE.products.id })
    .from(TABLE.products)
    .where(and(...conditions))
    .limit(1);
  return rows.length;
}

export async function getProducts(
  filterCategoryId?: string
): Promise<Product[]> {
  const merchantId = currentMerchantId();
  const conditions = [isNull(TABLE.products.deletedAt)];
  if (merchantId) {
    conditions.push(eq(TABLE.products.merchantId, merchantId));
  }

  if (filterCategoryId !== undefined) {
    conditions.push(eq(TABLE.products.categoryId, filterCategoryId));
  }
  return await db
    .select()
    .from(TABLE.products)
    .where(and(...conditions))
    .orderBy(TABLE.products.name, TABLE.products.id);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  const merchantId = currentMerchantId();
  const conditions = [
    eq(TABLE.products.id, id),
    isNull(TABLE.products.deletedAt),
  ];
  if (merchantId) {
    conditions.push(eq(TABLE.products.merchantId, merchantId));
  }

  const [row] = await db
    .select()
    .from(TABLE.products)
    .where(and(...conditions));
  return row;
}

export interface AssetCreationParams {
  jobId: string;
  merchantId: string;
}

export async function createProduct(
  data: NewProduct,
  assetParams?: AssetCreationParams
): Promise<Product & { newImageAssetId?: string }> {
  const merchantId = currentMerchantId() ?? "";

  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    let imageAssetId = data.imageAssetId ?? null;

    // If a new image was staged, create the assets row with status = "pending"
    if (assetParams) {
      const assetId = crypto.randomUUID();
      const objectKey = `${assetParams.merchantId}/assets/${assetId}`;
      await tx
        .insert(TABLE.assets)
        .values({
          id: assetId,
          merchantId: assetParams.merchantId,
          jobId: assetParams.jobId,
          objectKey,
          contentType: "image/webp",
          kind: "product_photo",
          status: "pending",
          isSynced: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: assetId,
        table: TABLE.assets,
      });
      imageAssetId = assetId;
    }

    const [row] = await tx
      .insert(TABLE.products)
      .values({
        ...data,
        imageAssetId,
        isSynced: false,
        merchantId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.products,
    });
    return { ...row, newImageAssetId: imageAssetId ?? undefined };
  });
}

export async function updateProduct(
  id: string,
  data: Partial<Omit<NewProduct, "id">>,
  assetParams?: AssetCreationParams
): Promise<Product & { newImageAssetId?: string }> {
  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    let imageAssetId = data.imageAssetId ?? null;

    // If a new image was staged, create the assets row with status = "pending"
    if (assetParams) {
      const assetId = crypto.randomUUID();
      const objectKey = `${assetParams.merchantId}/assets/${assetId}`;
      await tx
        .insert(TABLE.assets)
        .values({
          id: assetId,
          merchantId: assetParams.merchantId,
          jobId: assetParams.jobId,
          objectKey,
          contentType: "image/webp",
          kind: "product_photo",
          status: "pending",
          isSynced: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: assetId,
        table: TABLE.assets,
      });
      imageAssetId = assetId;
    }

    const [row] = await tx
      .update(TABLE.products)
      .set({
        ...data,
        imageAssetId,
        updatedAt: dayjs().toISOString(),
        isSynced: false,
      })
      .where(eq(TABLE.products.id, id))
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: TABLE.products,
    });
    return { ...row, newImageAssetId: imageAssetId ?? undefined };
  });
}

export async function deleteProduct(id: string): Promise<void> {
  const now = dayjs().toISOString();

  await getSyncClient().writeTransaction(db, async (tx) => {
    await getSyncClient().writeLocalChange(tx, {
      operation: "update",
      rowId: id,
      table: TABLE.products,
      write: (writeTx) =>
        writeTx
          .update(TABLE.products)
          .set({ deletedAt: now, updatedAt: now, isSynced: false })
          .where(eq(TABLE.products.id, id)),
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
    .from(TABLE.outletProducts)
    .where(eq(TABLE.outletProducts.outletId, outletId));
}
