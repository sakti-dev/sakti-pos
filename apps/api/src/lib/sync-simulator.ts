import {
  categories,
  merchants,
  outletProducts,
  outlets,
  products,
  syncEvents,
} from "@repo/database/api-schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { scriptDb as db } from "../db/script";

const DEFAULT_PRICE = 12_345;
const TEST_PREFIX = "SYNC TEST";

interface SingleScope {
  merchantId: string;
  outletId: string;
}

interface SimulateProductChangeInput {
  now?: Date;
}

export interface SimulateProductChangeResult {
  categoryId: string;
  categoryName: string;
  merchantId: string;
  outletId: string;
  outletProductId: string;
  productId: string;
  productName: string;
}

async function getSingleScope(): Promise<SingleScope> {
  const merchantRows = await db.select({ id: merchants.id }).from(merchants);
  if (merchantRows.length !== 1) {
    throw new Error(
      `Expected exactly one merchant, found ${merchantRows.length}. Refusing to simulate sync data.`
    );
  }

  const outletRows = await db
    .select({ id: outlets.id })
    .from(outlets)
    .where(eq(outlets.merchantId, merchantRows[0].id));
  if (outletRows.length !== 1) {
    throw new Error(
      `Expected exactly one outlet for merchant ${merchantRows[0].id}, found ${outletRows.length}. Refusing to simulate sync data.`
    );
  }

  return {
    merchantId: merchantRows[0].id,
    outletId: outletRows[0].id,
  };
}

export async function simulateProductChange({
  now = new Date(),
}: SimulateProductChangeInput = {}): Promise<SimulateProductChangeResult> {
  const { merchantId, outletId } = await getSingleScope();
  const timestamp = now.toISOString();
  const suffix = `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
  const categoryId = uuidv7();
  const productId = uuidv7();
  const outletProductId = uuidv7();
  const categoryName = `${TEST_PREFIX} Category ${suffix}`;
  const productName = `${TEST_PREFIX} Product ${suffix}`;

  await db.transaction(async (tx) => {
    await tx.insert(categories).values({
      createdAt: timestamp,
      id: categoryId,
      isActive: true,
      merchantId,
      name: categoryName,
      sortOrder: 999,
      updatedAt: timestamp,
    });

    await tx.insert(products).values({
      categoryId,
      createdAt: timestamp,
      id: productId,
      isActive: true,
      merchantId,
      name: productName,
      priceMinorUnits: DEFAULT_PRICE,
      sortOrder: 999,
      updatedAt: timestamp,
    });

    await tx.insert(outletProducts).values({
      createdAt: timestamp,
      id: outletProductId,
      isAvailable: true,
      outletId,
      priceMinorUnits: DEFAULT_PRICE,
      productId,
      sortOrder: 999,
      updatedAt: timestamp,
    });

    await tx.insert(syncEvents).values([
      {
        changedAt: timestamp,
        operation: "insert",
        rowId: categoryId,
        scopeId: merchantId,
        scopeType: "merchant",
        tableName: "categories",
      },
      {
        changedAt: timestamp,
        operation: "insert",
        rowId: productId,
        scopeId: merchantId,
        scopeType: "merchant",
        tableName: "products",
      },
      {
        changedAt: timestamp,
        operation: "insert",
        rowId: outletProductId,
        scopeId: outletId,
        scopeType: "outlet",
        tableName: "outlet_products",
      },
    ]);
  });

  return {
    categoryId,
    categoryName,
    merchantId,
    outletId,
    outletProductId,
    productId,
    productName,
  };
}
