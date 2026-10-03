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

/** Seeded once per merchant when the table is empty. */
export const SEED_INGREDIENT_CATEGORIES: readonly string[] = [
  "Bumbu & Bahan Dapur",
  "Sachet & Minuman",
  "Bumbu Kering",
  "Lainnya",
];

/**
 * Active categories for the merchant, seeded with defaults on first
 * read. Creating one inline persists immediately and syncs
 * merchant-wide (palette table — ingredients.category stores the NAME).
 */
export async function getIngredientCategories(): Promise<string[]> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    return [...SEED_INGREDIENT_CATEGORIES];
  }
  let rows = await readActive(merchantId);
  if (rows.length === 0) {
    await seedDefaults(merchantId);
    rows = await readActive(merchantId);
  }
  return rows;
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

async function seedDefaults(merchantId: string): Promise<void> {
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    let sort = 0;
    for (const name of SEED_INGREDIENT_CATEGORIES) {
      const [row] = await tx
        .insert(TABLE.ingredientCategories)
        .values({
          merchantId,
          name,
          sortOrder: sort++,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: TABLE.ingredientCategories.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: row.id,
        table: TABLE.ingredientCategories,
      });
    }
  });
  categoryLogger.info("seeded", {
    count: SEED_INGREDIENT_CATEGORIES.length,
  });
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
