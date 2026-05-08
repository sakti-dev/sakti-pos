import { staff } from "@repo/database";
import dayjs from "dayjs";
import { and, count, eq, inArray } from "drizzle-orm";
import { currentMerchantId } from "~/store/outlet";
import { db } from "./index";

export type StaffMember = typeof staff.$inferSelect;
export type NewStaffMember = typeof staff.$inferInsert;

export async function getStaff(): Promise<StaffMember[]> {
	const merchantId = currentMerchantId();
	const conditions = [];
	if (merchantId) conditions.push(eq(staff.merchantId, merchantId));

	return await db.select().from(staff).orderBy(staff.name, staff.id);
}

export async function getStaffMember(
	id: string,
): Promise<StaffMember | undefined> {
	const [row] = await db.select().from(staff).where(eq(staff.id, id));
	return row;
}

export async function createStaffMember(
	data: NewStaffMember,
): Promise<StaffMember> {
	const [row] = await db.insert(staff).values(data).returning();
	return row;
}

export async function updateStaffMember(
	id: string,
	data: Partial<Omit<NewStaffMember, "id">>,
): Promise<StaffMember> {
	const [row] = await db
		.update(staff)
		.set({ ...data, updatedAt: dayjs().toISOString() })
		.where(eq(staff.id, id))
		.returning();
	return row;
}

export async function countActiveManagers(): Promise<number> {
	const merchantId = currentMerchantId();
	const conditions = [
		inArray(staff.role, ["manager", "owner"]),
		eq(staff.isActive, true),
	];
	if (merchantId) conditions.push(eq(staff.merchantId, merchantId));

	const [row] = await db
		.select({ count: count() })
		.from(staff)
		.where(and(...conditions));
	return row?.count ?? 0;
}
