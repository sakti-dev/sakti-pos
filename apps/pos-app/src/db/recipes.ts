import dayjs from "dayjs";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentMerchantId } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";

const recipeLogger = createLogger({
  domain: "POS",
  module: "recipes",
});

export interface RecipeRow {
  readonly id: string;
  readonly ingredientId: string;
  readonly ingredientName: string;
  readonly isActive: boolean;
  readonly qtyPerUnit: number;
  readonly unit: string;
}

export interface RecipeInput {
  readonly ingredientId: string;
  readonly qtyPerUnit: number;
}

function requireMerchantId(): string {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("recipes: no active merchant");
  }
  return merchantId;
}

/* ── Reads ─────────────────────────────────────────────────────── */

/** Recipe of one product, joined with bahan name/unit for the form. */
export async function getProductIngredients(
  productId: string
): Promise<RecipeRow[]> {
  const rows = await db
    .select({
      id: TABLE.productIngredients.id,
      ingredientId: TABLE.productIngredients.ingredientId,
      qtyPerUnit: TABLE.productIngredients.qtyPerUnit,
      name: TABLE.ingredients.name,
      unit: TABLE.ingredients.unit,
      isActive: TABLE.ingredients.isActive,
    })
    .from(TABLE.productIngredients)
    .innerJoin(
      TABLE.ingredients,
      eq(TABLE.productIngredients.ingredientId, TABLE.ingredients.id)
    )
    .where(
      and(
        eq(TABLE.productIngredients.productId, productId),
        isNull(TABLE.productIngredients.deletedAt)
      )
    )
    .orderBy(asc(TABLE.ingredients.name));
  return rows.map((r) => ({
    id: r.id,
    ingredientId: r.ingredientId,
    ingredientName: r.name,
    isActive: r.isActive,
    qtyPerUnit: r.qtyPerUnit,
    unit: r.unit,
  }));
}

/** Batched recipe lookup for checkout (live links only). */
export async function getRecipesForProducts(
  productIds: readonly string[]
): Promise<{ ingredientId: string; productId: string; qtyPerUnit: number }[]> {
  if (productIds.length === 0) {
    return [];
  }
  return await db
    .select({
      productId: TABLE.productIngredients.productId,
      ingredientId: TABLE.productIngredients.ingredientId,
      qtyPerUnit: TABLE.productIngredients.qtyPerUnit,
    })
    .from(TABLE.productIngredients)
    .where(
      and(
        inArray(TABLE.productIngredients.productId, [...productIds]),
        isNull(TABLE.productIngredients.deletedAt)
      )
    );
}

/* ── Write: full diff of a product's recipe ────────────────────── */

/**
 * Replace a product's recipe with the given rows: inserts new links,
 * updates changed quantities, soft-deletes removed links, resurrects
 * re-added ones (setProductModifierGroups pattern).
 */
export async function setProductIngredients(
  productId: string,
  rows: readonly RecipeInput[]
): Promise<void> {
  const merchantId = requireMerchantId();
  for (const row of rows) {
    if (!Number.isFinite(row.qtyPerUnit) || row.qtyPerUnit <= 0) {
      throw new Error("setProductIngredients: qtyPerUnit must be positive");
    }
  }

  await getSyncClient().writeTransaction(db, async (tx) => {
    const existing = await tx
      .select({
        id: TABLE.productIngredients.id,
        ingredientId: TABLE.productIngredients.ingredientId,
        qtyPerUnit: TABLE.productIngredients.qtyPerUnit,
        deletedAt: TABLE.productIngredients.deletedAt,
      })
      .from(TABLE.productIngredients)
      .where(eq(TABLE.productIngredients.productId, productId));

    const wanted = new Map(rows.map((r) => [r.ingredientId, r.qtyPerUnit]));

    for (const link of existing) {
      const qty = wanted.get(link.ingredientId);
      if (qty !== undefined) {
        wanted.delete(link.ingredientId);
        if (link.deletedAt != null) {
          await resurrect(tx, link.id, qty, merchantId);
        } else if (link.qtyPerUnit !== qty) {
          await updateQty(tx, link.id, qty);
        }
        continue;
      }
      if (link.deletedAt != null) {
        continue;
      }
      await softDelete(tx, link.id);
    }

    for (const [ingredientId, qty] of wanted) {
      await insertLink(tx, productId, ingredientId, qty, merchantId);
    }
  });
  recipeLogger.info("recipe_saved", {
    lines: rows.length,
    productId,
  });
}

async function insertLink(
  tx: DbTx,
  productId: string,
  ingredientId: string,
  qtyPerUnit: number,
  merchantId: string
): Promise<void> {
  const now = dayjs().toISOString();
  const [row] = await tx
    .insert(TABLE.productIngredients)
    .values({
      merchantId,
      productId,
      ingredientId,
      qtyPerUnit,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: TABLE.productIngredients.id });
  await getSyncClient().enqueueChange(tx, {
    operation: "insert",
    rowId: row.id,
    table: TABLE.productIngredients,
  });
}

async function updateQty(tx: DbTx, id: string, qty: number): Promise<void> {
  await tx
    .update(TABLE.productIngredients)
    .set({ qtyPerUnit: qty, updatedAt: dayjs().toISOString(), isSynced: false })
    .where(eq(TABLE.productIngredients.id, id));
  await getSyncClient().enqueueChange(tx, {
    operation: "update",
    rowId: id,
    table: TABLE.productIngredients,
  });
}

async function resurrect(
  tx: DbTx,
  id: string,
  qty: number,
  merchantId: string
): Promise<void> {
  await tx
    .update(TABLE.productIngredients)
    .set({
      qtyPerUnit: qty,
      deletedAt: null,
      merchantId,
      updatedAt: dayjs().toISOString(),
      isSynced: false,
    })
    .where(eq(TABLE.productIngredients.id, id));
  await getSyncClient().enqueueChange(tx, {
    operation: "update",
    rowId: id,
    table: TABLE.productIngredients,
  });
}

async function softDelete(tx: DbTx, id: string): Promise<void> {
  await tx
    .update(TABLE.productIngredients)
    .set({
      deletedAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
      isSynced: false,
    })
    .where(eq(TABLE.productIngredients.id, id));
  await getSyncClient().enqueueChange(tx, {
    operation: "update",
    rowId: id,
    table: TABLE.productIngredients,
  });
}

/** The drizzle transaction handle writeTransaction hands to callbacks. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
