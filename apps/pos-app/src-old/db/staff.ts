import dayjs from "dayjs";
import { and, count, eq, inArray } from "drizzle-orm";
import { getSyncClient } from "~/lib/sync";
import { currentMerchantId } from "~/store/outlet";
import { db, TABLE } from "./index";

type StaffMember = typeof TABLE.staff.$inferSelect;
type NewStaffMember = typeof TABLE.staff.$inferInsert;

export async function getStaff(): Promise<StaffMember[]> {
  const merchantId = currentMerchantId();
  const conditions: ReturnType<typeof eq>[] = [];
  if (merchantId) {
    conditions.push(eq(TABLE.staff.merchantId, merchantId));
  }

  const query = db
    .select()
    .from(TABLE.staff)
    .orderBy(TABLE.staff.name, TABLE.staff.id);
  if (conditions.length > 0) {
    query.where(and(...conditions));
  }
  return await query;
}

export async function getStaffMember(
  id: string
): Promise<StaffMember | undefined> {
  const [row] = await db
    .select()
    .from(TABLE.staff)
    .where(eq(TABLE.staff.id, id));
  return row;
}

export async function getStaffByCloudUserId(
  merchantId: string,
  cloudUserId: string
): Promise<StaffMember | undefined> {
  const [row] = await db
    .select()
    .from(TABLE.staff)
    .where(
      and(
        eq(TABLE.staff.merchantId, merchantId),
        eq(TABLE.staff.cloudUserId, cloudUserId),
        eq(TABLE.staff.isActive, true)
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
      .insert(TABLE.staff)
      .values({ ...data, createdAt: now, updatedAt: now })
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "insert",
      rowId: row.id,
      table: TABLE.staff,
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
      .update(TABLE.staff)
      .set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
      .where(eq(TABLE.staff.id, id))
      .returning();
    await getSyncClient().enqueueChange(tx, {
      operation: "update",
      rowId: row.id,
      table: TABLE.staff,
    });
    return row;
  });
}

export async function countActiveManagers(): Promise<number> {
  const merchantId = currentMerchantId();
  const conditions = [
    inArray(TABLE.staff.role, ["manager", "owner"]),
    eq(TABLE.staff.isActive, true),
  ];
  if (merchantId) {
    conditions.push(eq(TABLE.staff.merchantId, merchantId));
  }

  const [row] = await db
    .select({ count: count() })
    .from(TABLE.staff)
    .where(and(...conditions));
  return row?.count ?? 0;
}

export async function getOwnerStaff(
  merchantId: string
): Promise<StaffMember | undefined> {
  const [row] = await db
    .select()
    .from(TABLE.staff)
    .where(
      and(eq(TABLE.staff.merchantId, merchantId), eq(TABLE.staff.role, "owner"))
    )
    .limit(1);
  return row;
}
