import dayjs from "dayjs";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getSyncClient } from "~/lib/api/sync";
import { currentMerchantId } from "~/lib/auth/session";
import { createLogger } from "~/lib/utils";
import { db, TABLE } from "./index";

/** The drizzle transaction handle writeTransaction hands to callbacks. */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const modifierLogger = createLogger({
  domain: "POS",
  module: "modifier-groups",
});

export type SelectionType = "single" | "multi";

export interface ModifierOptionRow {
  readonly id: string;
  readonly label: string;
  readonly priceDeltaMinorUnits: number;
  readonly sortOrder: number;
}

export interface ModifierGroupRow {
  readonly id: string;
  readonly isRequired: boolean;
  readonly name: string;
  readonly options: readonly ModifierOptionRow[];
  /** Linked, non-deleted products (id + name for display/search). */
  readonly products: readonly { id: string; name: string }[];
  readonly selectionType: SelectionType;
  readonly sortOrder: number;
}

function requireMerchantId(): string {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    throw new Error("modifier-groups: no active merchant");
  }
  return merchantId;
}

/* ── Reads ─────────────────────────────────────────────────────── */

async function optionsByGroup(
  groupIds: readonly string[]
): Promise<Map<string, ModifierOptionRow[]>> {
  const map = new Map<string, ModifierOptionRow[]>();
  if (groupIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      groupId: TABLE.modifierOptions.groupId,
      id: TABLE.modifierOptions.id,
      label: TABLE.modifierOptions.label,
      priceDeltaMinorUnits: TABLE.modifierOptions.priceDeltaMinorUnits,
      sortOrder: TABLE.modifierOptions.sortOrder,
    })
    .from(TABLE.modifierOptions)
    .where(
      and(
        isNull(TABLE.modifierOptions.deletedAt),
        inArray(TABLE.modifierOptions.groupId, [...groupIds])
      )
    )
    .orderBy(
      asc(TABLE.modifierOptions.sortOrder),
      asc(TABLE.modifierOptions.id)
    );
  for (const row of rows) {
    const list = map.get(row.groupId) ?? [];
    list.push({
      id: row.id,
      label: row.label,
      priceDeltaMinorUnits: row.priceDeltaMinorUnits,
      sortOrder: row.sortOrder,
    });
    map.set(row.groupId, list);
  }
  return map;
}

async function productsByGroup(
  groupIds: readonly string[]
): Promise<Map<string, { id: string; name: string }[]>> {
  const map = new Map<string, { id: string; name: string }[]>();
  if (groupIds.length === 0) {
    return map;
  }
  const rows = await db
    .select({
      groupId: TABLE.productModifierGroups.groupId,
      productId: TABLE.products.id,
      productName: TABLE.products.name,
    })
    .from(TABLE.productModifierGroups)
    .innerJoin(
      TABLE.products,
      eq(TABLE.products.id, TABLE.productModifierGroups.productId)
    )
    .where(
      and(
        isNull(TABLE.productModifierGroups.deletedAt),
        isNull(TABLE.products.deletedAt),
        inArray(TABLE.productModifierGroups.groupId, [...groupIds])
      )
    )
    .orderBy(
      asc(TABLE.productModifierGroups.sortOrder),
      asc(TABLE.products.name)
    );
  for (const row of rows) {
    const list = map.get(row.groupId) ?? [];
    list.push({ id: row.productId, name: row.productName });
    map.set(row.groupId, list);
  }
  return map;
}

/** All non-deleted groups for the active merchant, options + products
 *  included — the Variant tab + forms source. */
export async function getModifierGroups(): Promise<ModifierGroupRow[]> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    return [];
  }
  const groups = await db
    .select({
      id: TABLE.modifierGroups.id,
      isRequired: TABLE.modifierGroups.isRequired,
      name: TABLE.modifierGroups.name,
      selectionType: TABLE.modifierGroups.selectionType,
      sortOrder: TABLE.modifierGroups.sortOrder,
    })
    .from(TABLE.modifierGroups)
    .where(
      and(
        eq(TABLE.modifierGroups.merchantId, merchantId),
        isNull(TABLE.modifierGroups.deletedAt)
      )
    )
    .orderBy(
      asc(TABLE.modifierGroups.sortOrder),
      asc(TABLE.modifierGroups.name)
    );
  if (groups.length === 0) {
    return [];
  }
  const ids = groups.map((g) => g.id);
  const [options, products] = await Promise.all([
    optionsByGroup(ids),
    productsByGroup(ids),
  ]);
  return groups.map((g) => ({
    ...g,
    options: options.get(g.id) ?? [],
    products: products.get(g.id) ?? [],
  }));
}

/** Groups attached to one product (link + group + product all alive),
 *  options included — the POS selection-sheet source. Link order rules. */
export async function getProductModifierGroups(
  productId: string
): Promise<ModifierGroupRow[]> {
  const links = await db
    .select({
      groupId: TABLE.productModifierGroups.groupId,
      sortOrder: TABLE.productModifierGroups.sortOrder,
    })
    .from(TABLE.productModifierGroups)
    .where(
      and(
        eq(TABLE.productModifierGroups.productId, productId),
        isNull(TABLE.productModifierGroups.deletedAt)
      )
    )
    .orderBy(
      asc(TABLE.productModifierGroups.sortOrder),
      asc(TABLE.productModifierGroups.groupId)
    );
  if (links.length === 0) {
    return [];
  }
  const groupIds = links.map((l) => l.groupId);
  const groups = await db
    .select({
      id: TABLE.modifierGroups.id,
      isRequired: TABLE.modifierGroups.isRequired,
      name: TABLE.modifierGroups.name,
      selectionType: TABLE.modifierGroups.selectionType,
      sortOrder: TABLE.modifierGroups.sortOrder,
    })
    .from(TABLE.modifierGroups)
    .where(
      and(
        inArray(TABLE.modifierGroups.id, groupIds),
        isNull(TABLE.modifierGroups.deletedAt)
      )
    );
  const options = await optionsByGroup(
    groups.map((g) => g.id).filter((id) => groupIds.includes(id))
  );
  const order = new Map(links.map((l, i) => [l.groupId, i]));
  return groups
    .map((g) => ({ ...g, products: [], options: options.get(g.id) ?? [] }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/* ── Writes ────────────────────────────────────────────────────── */

export interface ModifierOptionInput {
  /** Present when editing an existing option; absent = new option. */
  readonly id?: string;
  readonly label: string;
  readonly priceDeltaMinorUnits: number;
}

export interface ModifierGroupInput {
  readonly isRequired: boolean;
  readonly name: string;
  readonly options: readonly ModifierOptionInput[];
  readonly productIds: readonly string[];
  readonly selectionType: SelectionType;
  readonly sortOrder?: number;
}

async function syncProductLinks(
  tx: DbTx,
  groupId: string,
  merchantId: string,
  wantedProductIds: readonly string[]
): Promise<void> {
  const now = dayjs().toISOString();
  const existing = await tx
    .select({
      id: TABLE.productModifierGroups.id,
      productId: TABLE.productModifierGroups.productId,
      deletedAt: TABLE.productModifierGroups.deletedAt,
    })
    .from(TABLE.productModifierGroups)
    .where(eq(TABLE.productModifierGroups.groupId, groupId));

  const wanted = new Set(wantedProductIds);
  for (const link of existing) {
    if (wanted.has(link.productId)) {
      wanted.delete(link.productId);
      if (link.deletedAt == null) {
        continue;
      }
      const [row] = await tx
        .update(TABLE.productModifierGroups)
        .set({ deletedAt: null, updatedAt: now, isSynced: false })
        .where(eq(TABLE.productModifierGroups.id, link.id))
        .returning({ id: TABLE.productModifierGroups.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: row.id,
        table: TABLE.productModifierGroups,
      });
      continue;
    }
    if (link.deletedAt != null) {
      continue;
    }
    const [row] = await tx
      .update(TABLE.productModifierGroups)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(eq(TABLE.productModifierGroups.id, link.id))
      .returning({ id: TABLE.productModifierGroups.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: TABLE.productModifierGroups,
    });
  }

  let sortOrder = 0;
  for (const productId of wantedProductIds) {
    if (!wanted.has(productId)) {
      continue;
    }
    const [row] = await tx
      .insert(TABLE.productModifierGroups)
      .values({
        merchantId,
        productId,
        groupId,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: TABLE.productModifierGroups.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.productModifierGroups,
    });
    sortOrder += 1;
  }
}

export async function createModifierGroup(
  input: ModifierGroupInput
): Promise<string> {
  if (input.name.trim().length === 0) {
    throw new Error("createModifierGroup: name is required");
  }
  if (input.options.length === 0) {
    throw new Error("createModifierGroup: at least one option is required");
  }
  const merchantId = requireMerchantId();
  const now = dayjs().toISOString();

  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [group] = await tx
      .insert(TABLE.modifierGroups)
      .values({
        merchantId,
        name: input.name.trim(),
        selectionType: input.selectionType,
        isRequired: input.isRequired,
        sortOrder: input.sortOrder ?? 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: TABLE.modifierGroups.id });
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: group.id,
      table: TABLE.modifierGroups,
    });

    let optionSort = 0;
    for (const option of input.options) {
      const [row] = await tx
        .insert(TABLE.modifierOptions)
        .values({
          merchantId,
          groupId: group.id,
          label: option.label.trim(),
          priceDeltaMinorUnits: option.priceDeltaMinorUnits,
          sortOrder: optionSort,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: TABLE.modifierOptions.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: row.id,
        table: TABLE.modifierOptions,
      });
      optionSort += 1;
    }

    await syncProductLinks(tx, group.id, merchantId, input.productIds);
    modifierLogger.info("group_created", {
      group_id: group.id,
      name: input.name,
      options: input.options.length,
      products: input.productIds.length,
    });
    return group.id;
  });
}

export async function updateModifierGroup(
  id: string,
  input: ModifierGroupInput
): Promise<void> {
  if (input.name.trim().length === 0) {
    throw new Error("updateModifierGroup: name is required");
  }
  if (input.options.length === 0) {
    throw new Error("updateModifierGroup: at least one option is required");
  }
  const merchantId = requireMerchantId();
  const now = dayjs().toISOString();

  await getSyncClient().writeTransaction(db, async (tx) => {
    const [group] = await tx
      .update(TABLE.modifierGroups)
      .set({
        name: input.name.trim(),
        selectionType: input.selectionType,
        isRequired: input.isRequired,
        sortOrder: input.sortOrder ?? 0,
        updatedAt: now,
        isSynced: false,
      })
      .where(eq(TABLE.modifierGroups.id, id))
      .returning({ id: TABLE.modifierGroups.id });
    if (!group) {
      throw new Error(`updateModifierGroup: group ${id} not found`);
    }
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: id,
      table: TABLE.modifierGroups,
    });

    const existing = await tx
      .select({
        id: TABLE.modifierOptions.id,
        deletedAt: TABLE.modifierOptions.deletedAt,
      })
      .from(TABLE.modifierOptions)
      .where(eq(TABLE.modifierOptions.groupId, id));
    const keptIds = new Set(
      input.options
        .filter((o) => o.id != null && existing.some((e) => e.id === o.id))
        .map((o) => o.id as string)
    );

    let optionSort = 0;
    for (const option of input.options) {
      if (option.id != null && keptIds.has(option.id)) {
        const [row] = await tx
          .update(TABLE.modifierOptions)
          .set({
            label: option.label.trim(),
            priceDeltaMinorUnits: option.priceDeltaMinorUnits,
            sortOrder: optionSort,
            deletedAt: null,
            updatedAt: now,
            isSynced: false,
          })
          .where(eq(TABLE.modifierOptions.id, option.id))
          .returning({ id: TABLE.modifierOptions.id });
        await getSyncClient().enqueueChange(tx, {
          operation: "update",
          rowId: row.id,
          table: TABLE.modifierOptions,
        });
      } else {
        const [row] = await tx
          .insert(TABLE.modifierOptions)
          .values({
            merchantId,
            groupId: id,
            label: option.label.trim(),
            priceDeltaMinorUnits: option.priceDeltaMinorUnits,
            sortOrder: optionSort,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: TABLE.modifierOptions.id });
        await getSyncClient().enqueueChange(tx, {
          operation: "insert",
          rowId: row.id,
          table: TABLE.modifierOptions,
        });
      }
      optionSort += 1;
    }

    for (const option of existing) {
      if (keptIds.has(option.id) || option.deletedAt != null) {
        continue;
      }
      const [row] = await tx
        .update(TABLE.modifierOptions)
        .set({ deletedAt: now, updatedAt: now, isSynced: false })
        .where(eq(TABLE.modifierOptions.id, option.id))
        .returning({ id: TABLE.modifierOptions.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: row.id,
        table: TABLE.modifierOptions,
      });
    }

    await syncProductLinks(tx, id, merchantId, input.productIds);
    modifierLogger.info("group_updated", { group_id: id });
  });
}

/** Reconcile one product's group links to the wanted set (product-form
 *  side). Link order follows the given array order. */
export async function setProductModifierGroups(
  productId: string,
  groupIds: readonly string[]
): Promise<void> {
  const merchantId = requireMerchantId();
  await getSyncClient().writeTransaction(db, async (tx) => {
    const existing = await tx
      .select({
        id: TABLE.productModifierGroups.id,
        groupId: TABLE.productModifierGroups.groupId,
        deletedAt: TABLE.productModifierGroups.deletedAt,
      })
      .from(TABLE.productModifierGroups)
      .where(eq(TABLE.productModifierGroups.productId, productId));

    const wanted = new Set(groupIds);
    for (const link of existing) {
      if (wanted.has(link.groupId)) {
        wanted.delete(link.groupId);
        if (link.deletedAt == null) {
          continue;
        }
        const [row] = await tx
          .update(TABLE.productModifierGroups)
          .set({
            deletedAt: null,
            updatedAt: dayjs().toISOString(),
            isSynced: false,
          })
          .where(eq(TABLE.productModifierGroups.id, link.id))
          .returning({ id: TABLE.productModifierGroups.id });
        await getSyncClient().enqueueChange(tx, {
          operation: "update",
          rowId: row.id,
          table: TABLE.productModifierGroups,
        });
        continue;
      }
      if (link.deletedAt != null) {
        continue;
      }
      const [row] = await tx
        .update(TABLE.productModifierGroups)
        .set({
          deletedAt: dayjs().toISOString(),
          updatedAt: dayjs().toISOString(),
          isSynced: false,
        })
        .where(eq(TABLE.productModifierGroups.id, link.id))
        .returning({ id: TABLE.productModifierGroups.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: row.id,
        table: TABLE.productModifierGroups,
      });
    }

    let sortOrder = 0;
    for (const groupId of groupIds) {
      if (!wanted.has(groupId)) {
        continue;
      }
      const [row] = await tx
        .insert(TABLE.productModifierGroups)
        .values({
          merchantId,
          productId,
          groupId,
          sortOrder,
          createdAt: dayjs().toISOString(),
          updatedAt: dayjs().toISOString(),
        })
        .returning({ id: TABLE.productModifierGroups.id });
      await getSyncClient().enqueueChange(tx, {
        operation: "insert",
        rowId: row.id,
        table: TABLE.productModifierGroups,
      });
      sortOrder += 1;
    }
  });
}

/** Soft-delete the group, its options, and its links in one transaction —
 *  past order_item_modifiers snapshots are untouched. */
export async function softDeleteModifierGroup(id: string): Promise<void> {
  const now = dayjs().toISOString();
  await getSyncClient().writeTransaction(db, async (tx) => {
    const rows = await tx
      .update(TABLE.modifierGroups)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(
        and(
          eq(TABLE.modifierGroups.id, id),
          isNull(TABLE.modifierGroups.deletedAt)
        )
      )
      .returning({ id: TABLE.modifierGroups.id });
    if (rows.length === 0) {
      return;
    }
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: id,
      table: TABLE.modifierGroups,
    });

    const options = await tx
      .update(TABLE.modifierOptions)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(
        and(
          eq(TABLE.modifierOptions.groupId, id),
          isNull(TABLE.modifierOptions.deletedAt)
        )
      )
      .returning({ id: TABLE.modifierOptions.id });
    for (const option of options) {
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: option.id,
        table: TABLE.modifierOptions,
      });
    }

    const links = await tx
      .update(TABLE.productModifierGroups)
      .set({ deletedAt: now, updatedAt: now, isSynced: false })
      .where(
        and(
          eq(TABLE.productModifierGroups.groupId, id),
          isNull(TABLE.productModifierGroups.deletedAt)
        )
      )
      .returning({ id: TABLE.productModifierGroups.id });
    for (const link of links) {
      await getSyncClient().enqueueChange(tx, {
        operation: "update",
        rowId: link.id,
        table: TABLE.productModifierGroups,
      });
    }
    modifierLogger.info("group_deleted", { group_id: id });
  });
}
