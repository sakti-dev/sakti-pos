import { outlets } from "@repo/database";
import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { currentMerchantId } from "~/store/outlet";
import { db } from "./index";
import { recordLocalChange } from "./sync-outbox";

export async function getAllOutlets(): Promise<
  { id: string; name: string; timezone: string }[]
> {
  const merchantId = currentMerchantId();
  if (!merchantId) {
    return [];
  }
  const rows = await db
    .select({ id: outlets.id, name: outlets.name, timezone: outlets.timezone })
    .from(outlets)
    .where(eq(outlets.merchantId, merchantId));
  return rows;
}

export async function getOutletById(
  outletId: string
): Promise<{ id: string; name: string; timezone: string } | undefined> {
  const [row] = await db
    .select({ id: outlets.id, name: outlets.name, timezone: outlets.timezone })
    .from(outlets)
    .where(eq(outlets.id, outletId))
    .limit(1);
  return row;
}

export async function updateOutletTimezone(
  outletId: string,
  timezone: string
): Promise<{ id: string; name: string; timezone: string } | undefined> {
  const now = dayjs().toISOString();
  const [row] = await db
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

  await recordLocalChange({
    operation: "update",
    rowId: row.id,
    scopeId: row.merchantId,
    scopeType: "merchant",
    tableName: "outlets",
  });

  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
  };
}
