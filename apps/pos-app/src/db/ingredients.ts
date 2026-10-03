import dayjs from "dayjs";
import { and, asc, eq } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentMerchantId } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";
import { ensureTracked } from "./inventory";

const ingredientLogger = createLogger({
  domain: "INVENTORY",
  module: "ingredients",
});

export interface IngredientInput {
  readonly category: string | null;
  readonly name: string;
  readonly sku: string | null;
  readonly unit: string;
}

export async function getIngredients(): Promise<
  {
    id: string;
    name: string;
    sku: string | null;
    unit: string;
    category: string | null;
  }[]
> {
  const rows = await db
    .select({
      id: TABLE.ingredients.id,
      name: TABLE.ingredients.name,
      sku: TABLE.ingredients.sku,
      unit: TABLE.ingredients.unit,
      category: TABLE.ingredients.category,
    })
    .from(TABLE.ingredients)
    .where(
      and(
        eq(TABLE.ingredients.merchantId, currentMerchantId() ?? ""),
        eq(TABLE.ingredients.isActive, true)
      )
    )
    .orderBy(asc(TABLE.ingredients.name));
  return rows;
}

/**
 * Create an ingredient. Creation seeds a zero-balance stock row at the
 * active outlet in the same transaction — ingredients are tracked from
 * birth (row-exists convention).
 */
export async function createIngredient(
  input: IngredientInput
): Promise<string> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("createIngredient: name is required");
  }
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("createIngredient: no active merchant");
  }
  const now = dayjs().toISOString();

  ingredientLogger.info("create_start", { name, unit: input.unit });
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(TABLE.ingredients)
      .values({
        merchantId,
        name,
        sku: input.sku?.trim() || null,
        unit: input.unit.trim() || "Pcs",
        category: input.category?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: TABLE.ingredients.id });
    ingredientLogger.info("insert_ok", { id: row.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.ingredients,
    });
    await ensureTracked(tx, "ingredient", row.id);
    ingredientLogger.info("created", { id: row.id, name });
    return row.id;
  });
}

export async function updateIngredient(
  id: string,
  input: IngredientInput
): Promise<void> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new Error("updateIngredient: name is required");
  }
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("updateIngredient: no active merchant");
  }
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    await tx
      .update(TABLE.ingredients)
      .set({
        name,
        sku: input.sku?.trim() || null,
        unit: input.unit.trim() || "Pcs",
        category: input.category?.trim() || null,
        updatedAt: now,
        isSynced: false,
      })
      .where(
        and(
          eq(TABLE.ingredients.id, id),
          eq(TABLE.ingredients.merchantId, merchantId)
        )
      );
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: id,
      table: TABLE.ingredients,
    });
  });
  ingredientLogger.info("updated", { id, name });
}

/** Soft-delete keeps history (receipt lines etc.) resolvable. */
export async function softDeleteIngredient(id: string): Promise<void> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("softDeleteIngredient: no active merchant");
  }
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    await tx
      .update(TABLE.ingredients)
      .set({ isActive: false, deletedAt: now, updatedAt: now, isSynced: false })
      .where(
        and(
          eq(TABLE.ingredients.id, id),
          eq(TABLE.ingredients.merchantId, merchantId)
        )
      );
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: id,
      table: TABLE.ingredients,
    });
  });
  ingredientLogger.info("soft_deleted", { id });
}

/** Inline creation from the goods-receipt flow. */
export async function createIngredientFromReceipt(
  input: IngredientInput
): Promise<{ id: string; name: string; unit: string }> {
  const id = await createIngredient(input);
  return { id, name: input.name.trim(), unit: input.unit.trim() || "Pcs" };
}
