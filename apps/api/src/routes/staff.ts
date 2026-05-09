import { staff, userMerchants } from "@repo/database/api-schema";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { getSessionFromRequest } from "../lib/session";
import { recordSyncEvent } from "../lib/sync-events";

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_LENGTH = 256;
const PBKDF2_ALGORITHM = "SHA-256";

async function hashPin(pin: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(pin),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const keyMaterial = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: PBKDF2_ALGORITHM,
		},
		key,
		PBKDF2_HASH_LENGTH,
	);
	const hashArray = Array.from(new Uint8Array(keyMaterial));
	const saltHex = Array.from(salt)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return `${saltHex}:${hashHex}`;
}

async function verifyMerchantAccess(
	userId: string,
	merchantId: string,
): Promise<boolean> {
	const [row] = await db
		.select({ id: userMerchants.id })
		.from(userMerchants)
		.where(
			and(
				eq(userMerchants.userId, userId),
				eq(userMerchants.merchantId, merchantId),
			),
		)
		.limit(1);
	return !!row;
}

async function getMerchantMembership(userId: string, merchantId: string) {
	const [row] = await db
		.select({ id: userMerchants.id, role: userMerchants.role })
		.from(userMerchants)
		.where(
			and(
				eq(userMerchants.userId, userId),
				eq(userMerchants.merchantId, merchantId),
			),
		)
		.limit(1);
	return row ?? null;
}

function serializeCurrentStaff(row: {
	id: string;
	isActive: boolean;
	merchantId: string;
	name: string;
	outletId: string | null;
	pin: string | null;
	role: "cashier" | "manager" | "owner";
}) {
	return {
		hasPin: !!row.pin,
		id: row.id,
		isActive: row.isActive,
		merchantId: row.merchantId,
		name: row.name,
		outletId: row.outletId,
		role: row.role,
	};
}

export const staffRoutes = new Elysia({ prefix: "/api" })
	.post(
		"/merchants/:merchantId/staff/me",
		async ({ params: { merchantId }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const membership = await getMerchantMembership(
				session.userId,
				merchantId,
			);
			if (!membership) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const [mappedStaff] = await db
				.select({
					id: staff.id,
					merchantId: staff.merchantId,
					outletId: staff.outletId,
					name: staff.name,
					role: staff.role,
					isActive: staff.isActive,
					pin: staff.pin,
				})
				.from(staff)
				.where(
					and(
						eq(staff.merchantId, merchantId),
						eq(staff.cloudUserId, session.userId),
						eq(staff.isActive, true),
					),
				)
				.limit(1);

			if (mappedStaff) {
				return {
					claimed: false,
					staff: serializeCurrentStaff(mappedStaff),
				};
			}

			if (membership.role !== "owner") {
				return { claimed: false, reason: "not-allowed", staff: null };
			}

			const ownerRows = await db
				.select({
					id: staff.id,
					merchantId: staff.merchantId,
					outletId: staff.outletId,
					name: staff.name,
					role: staff.role,
					isActive: staff.isActive,
					pin: staff.pin,
				})
				.from(staff)
				.where(
					and(
						eq(staff.merchantId, merchantId),
						eq(staff.role, "owner"),
						eq(staff.isActive, true),
						isNull(staff.cloudUserId),
					),
				)
				.limit(2);

			if (ownerRows.length === 0) {
				return { claimed: false, reason: "no-staff", staff: null };
			}

			if (ownerRows.length > 1) {
				return { claimed: false, reason: "ambiguous-owner", staff: null };
			}

			const owner = ownerRows[0];
			const now = new Date().toISOString();
			await db
				.update(staff)
				.set({
					cloudUserId: session.userId,
					updatedAt: now,
				})
				.where(eq(staff.id, owner.id));

			await recordSyncEvent({
				changedAt: now,
				operation: "update",
				rowId: owner.id,
				scopeId: merchantId,
				scopeType: "merchant",
				tableName: "staff",
			});

			return {
				claimed: true,
				staff: serializeCurrentStaff(owner),
			};
		},
	)
	.post(
		"/merchants/:merchantId/staff",
		async ({ body, params: { merchantId }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const hasAccess = await verifyMerchantAccess(session.userId, merchantId);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const pinHash = await hashPin(body.pin);
			const now = new Date().toISOString();

			const [created] = await db
				.insert(staff)
				.values({
					merchantId,
					outletId: body.outletId ?? null,
					name: body.name,
					pin: pinHash,
					role: body.role ?? "cashier",
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			await recordSyncEvent({
				changedAt: now,
				operation: "insert",
				rowId: created.id,
				scopeId: merchantId,
				scopeType: "merchant",
				tableName: "staff",
			});

			return created;
		},
		{
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 100 }),
				pin: t.String({ minLength: 4, maxLength: 6 }),
				role: t.Optional(
					t.Union([
						t.Literal("cashier"),
						t.Literal("manager"),
						t.Literal("owner"),
					]),
				),
				outletId: t.Optional(t.String()),
			}),
		},
	)
	.get(
		"/merchants/:merchantId/staff",
		async ({ params: { merchantId }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const hasAccess = await verifyMerchantAccess(session.userId, merchantId);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			return db
				.select({
					id: staff.id,
					merchantId: staff.merchantId,
					outletId: staff.outletId,
					name: staff.name,
					role: staff.role,
					isActive: staff.isActive,
					createdAt: staff.createdAt,
					updatedAt: staff.updatedAt,
				})
				.from(staff)
				.where(eq(staff.merchantId, merchantId));
		},
	)
	.patch(
		"/staff/:id/pin",
		async ({ body, params: { id }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const [existing] = await db
				.select({ merchantId: staff.merchantId })
				.from(staff)
				.where(eq(staff.id, id))
				.limit(1);

			if (!existing) {
				set.status = 404;
				return { error: "Staff not found" };
			}

			const hasAccess = await verifyMerchantAccess(
				session.userId,
				existing.merchantId,
			);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const pinHash = await hashPin(body.pin);
			const now = new Date().toISOString();
			const [updated] = await db
				.update(staff)
				.set({ pin: pinHash, updatedAt: now })
				.where(eq(staff.id, id))
				.returning();

			await recordSyncEvent({
				changedAt: now,
				operation: "update",
				rowId: id,
				scopeId: existing.merchantId,
				scopeType: "merchant",
				tableName: "staff",
			});

			return updated;
		},
		{
			body: t.Object({
				pin: t.String({ minLength: 4, maxLength: 6 }),
			}),
		},
	)
	.delete("/staff/:id", async ({ params: { id }, set, request }) => {
		const session = await getSessionFromRequest(request);
		if (!session) {
			set.status = 401;
			return { error: "Unauthorized" };
		}

		const [existing] = await db
			.select({ merchantId: staff.merchantId })
			.from(staff)
			.where(eq(staff.id, id))
			.limit(1);

		if (!existing) {
			set.status = 404;
			return { error: "Staff not found" };
		}

		const hasAccess = await verifyMerchantAccess(
			session.userId,
			existing.merchantId,
		);
		if (!hasAccess) {
			set.status = 403;
			return { error: "Forbidden" };
		}

		const now = new Date().toISOString();
		await db
			.update(staff)
			.set({
				isActive: false,
				deletedAt: now,
				updatedAt: now,
			})
			.where(eq(staff.id, id));

		await recordSyncEvent({
			changedAt: now,
			operation: "delete",
			rowId: id,
			scopeId: existing.merchantId,
			scopeType: "merchant",
			tableName: "staff",
		});

		return { success: true };
	});
