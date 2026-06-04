import { staff } from "@sync-contract/local-synced-schema";
import dayjs from "dayjs";
import { and, count, eq, inArray } from "drizzle-orm";
import { getSyncClient } from "~/lib/sync";
import { currentMerchantId } from "~/store/outlet";
import { db } from "./index";

type StaffMember = typeof staff.$inferSelect;
type NewStaffMember = typeof staff.$inferInsert;

export async function getStaff(): Promise<StaffMember[]> {
  const merchantId = currentMerchantId();
  const conditions: ReturnType<typeof eq>[] = [];
  if (merchantId) {
    conditions.push(eq(staff.merchantId, merchantId));
  }

  const query = db.select().from(staff).orderBy(staff.name, staff.id);
  if (conditions.length > 0) {
    query.where(and(...conditions));
  }
  return await query;
}

export async function getStaffMember(
  id: string
): Promise<StaffMember | undefined> {
  const [row] = await db.select().from(staff).where(eq(staff.id, id));
  return row;
}

export async function getStaffByCloudUserId(
  merchantId: string,
  cloudUserId: string
): Promise<StaffMember | undefined> {
  const [row] = await db
    .select()
    .from(staff)
    .where(
      and(
        eq(staff.merchantId, merchantId),
        eq(staff.cloudUserId, cloudUserId),
        eq(staff.isActive, true)
      )
    )
    .limit(1);
  return row;
}

export async function createStaffMember(
  data: NewStaffMember
): Promise<StaffMember> {
  const now = dayjs().toISOString();
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .insert(staff)
      .values({ ...data, createdAt: now, updatedAt: now })
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: staff,
    });
    return row;
  });
}

export async function updateStaffMember(
  id: string,
  data: Partial<Omit<NewStaffMember, "id">>
): Promise<StaffMember> {
  return await getSyncClient().writeTransaction(db, async (tx) => {
    const [row] = await tx
      .update(staff)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(staff.id, id))
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: staff,
    });
    return row;
  });
}

export async function countActiveManagers(): Promise<number> {
  const merchantId = currentMerchantId();
  const conditions = [
    inArray(staff.role, ["manager", "owner"]),
    eq(staff.isActive, true),
  ];
  if (merchantId) {
    conditions.push(eq(staff.merchantId, merchantId));
  }

  const [row] = await db
    .select({ count: count() })
    .from(staff)
    .where(and(...conditions));
  return row?.count ?? 0;
}

export async function getOwnerStaff(
  merchantId: string
): Promise<StaffMember | undefined> {
  const [row] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.merchantId, merchantId), eq(staff.role, "owner")))
    .limit(1);
  return row;
}
