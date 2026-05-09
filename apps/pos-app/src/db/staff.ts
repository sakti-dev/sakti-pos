import { staff } from "@repo/database";
import dayjs from "dayjs";
import { and, count, eq, inArray } from "drizzle-orm";
import { currentMerchantId } from "~/store/outlet";
import { db } from "./index";
import { recordLocalChange } from "./sync-outbox";

export type StaffMember = typeof staff.$inferSelect;
export type NewStaffMember = typeof staff.$inferInsert;

export async function getStaff(): Promise<StaffMember[]> {
	const merchantId = currentMerchantId();
	const conditions = [];
	if (merchantId) conditions.push(eq(staff.merchantId, merchantId));

	const query = db.select().from(staff).orderBy(staff.name, staff.id);
	if (conditions.length > 0) {
		query.where(and(...conditions));
	}
	return query;
}

export async function getStaffMember(
	id: string,
): Promise<StaffMember | undefined> {
	const [row] = await db.select().from(staff).where(eq(staff.id, id));
	return row;
}

export async function getStaffByCloudUserId(
	merchantId: string,
	cloudUserId: string,
): Promise<StaffMember | undefined> {
	const [row] = await db
		.select()
		.from(staff)
		.where(
			and(
				eq(staff.merchantId, merchantId),
				eq(staff.cloudUserId, cloudUserId),
				eq(staff.isActive, true),
			),
		)
		.limit(1);
	return row;
}

export async function createStaffMember(
	data: NewStaffMember,
): Promise<StaffMember> {
	const [row] = await db.insert(staff).values(data).returning();
	await recordLocalChange({
		operation: "insert",
		rowId: row.id,
		scopeId: row.merchantId,
		scopeType: "merchant",
		tableName: "staff",
	});
	return row;
}

export async function updateStaffMember(
	id: string,
	data: Partial<Omit<NewStaffMember, "id">>,
): Promise<StaffMember> {
	const [row] = await db
		.update(staff)
		.set({ ...data, updatedAt: dayjs().toISOString(), isSynced: false })
		.where(eq(staff.id, id))
		.returning();
	await recordLocalChange({
		operation: "update",
		rowId: row.id,
		scopeId: row.merchantId,
		scopeType: "merchant",
		tableName: "staff",
	});
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

export async function getOwnerStaff(
	merchantId: string,
): Promise<StaffMember | undefined> {
	const [row] = await db
		.select()
		.from(staff)
		.where(and(eq(staff.merchantId, merchantId), eq(staff.role, "owner")))
		.limit(1);
	return row;
}
