import dayjs from "dayjs";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentMerchantId } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";

const categoryLogger = createLogger({
  domain: "INVENTORY",
  module: "ingredient-categories",
});

/**
 * Active categories for the merchant. Starts empty — the list grows
 * only from categories the merchant creates (persisted + synced
 * merchant-wide; ingredients.category stores the NAME).
 */
export async function getIngredientCategories(): Promise<string[]> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    return [];
  }
  return await readActive(merchantId);
}

async function readActive(merchantId: string): Promise<string[]> {
  const rows = await db
    .select({ name: TABLE.ingredientCategories.name })
    .from(TABLE.ingredientCategories)
    .where(
      and(
        eq(TABLE.ingredientCategories.merchantId, merchantId),
        isNull(TABLE.ingredientCategories.deletedAt)
      )
    )
    .orderBy(
      asc(TABLE.ingredientCategories.sortOrder),
      asc(TABLE.ingredientCategories.name)
    );
  return rows.map((r) => r.name);
}

/** Create (or return the existing) category name, case-insensitive. */
export async function createIngredientCategory(name: string): Promise<string> {
  const trimmed = name.trim();
  const merchantId = currentMerchantId();
  if (!trimmed) {
    throw new Error("createIngredientCategory: name is required");
  }
  if (!merchantId) {
    throw new Error("createIngredientCategory: no active merchant");
  }

  const existing = await db
    .select({
      id: TABLE.ingredientCategories.id,
      name: TABLE.ingredientCategories.name,
    })
    .from(TABLE.ingredientCategories)
    .where(
      and(
        eq(TABLE.ingredientCategories.merchantId, merchantId),
        isNull(TABLE.ingredientCategories.deletedAt)
      )
    );
  const match = existing.find(
    (row) => row.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) {
    return match.name;
  }

  const now = dayjs().toISOString();
  const maxSort = await db
    .select({ sortOrder: TABLE.ingredientCategories.sortOrder })
    .from(TABLE.ingredientCategories)
    .where(eq(TABLE.ingredientCategories.merchantId, merchantId));
  const nextSort = maxSort.reduce((m, r) => Math.max(m, r.sortOrder), -1) + 1;

  await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(TABLE.ingredientCategories)
      .values({
        merchantId,
        name: trimmed,
        sortOrder: nextSort,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: TABLE.ingredientCategories.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.ingredientCategories,
    });
  });
  categoryLogger.info("created", { name: trimmed });
  return trimmed;
}
