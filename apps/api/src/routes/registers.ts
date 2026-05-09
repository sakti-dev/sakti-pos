import { outlets, registers, userMerchants } from "@repo/database/api-schema";
import { and, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { db } from "../db";
import { getSessionFromRequest } from "../lib/session";
import { recordSyncEvent } from "../lib/sync-events";

function generatePairingCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 8; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}

function generateShortId(): string {
	return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function verifyOutletOwnership(
	userId: string,
	outletId: string,
): Promise<boolean> {
	const [outlet] = await db
		.select({ merchantId: outlets.merchantId })
		.from(outlets)
		.where(eq(outlets.id, outletId))
		.limit(1);

	if (!outlet) return false;

	const [membership] = await db
		.select({ id: userMerchants.id })
		.from(userMerchants)
		.where(
			and(
				eq(userMerchants.userId, userId),
				eq(userMerchants.merchantId, outlet.merchantId),
			),
		)
		.limit(1);

	return !!membership;
}

export const registersRoutes = new Elysia({ prefix: "/api" })
	.post(
		"/outlets/:outletId/registers",
		async ({ body, params: { outletId }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const hasAccess = await verifyOutletOwnership(session.userId, outletId);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			const now = new Date().toISOString();
			const pairingCode = generatePairingCode();
			const pairingExpiresAt = new Date(
				Date.now() + 24 * 60 * 60 * 1000,
			).toISOString();

			const [register] = await db
				.insert(registers)
				.values({
					outletId,
					name: body.name,
					shortId: generateShortId(),
					pairingCode,
					pairingExpiresAt,
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			await recordSyncEvent({
				changedAt: now,
				operation: "insert",
				rowId: register.id,
				scopeId: outletId,
				scopeType: "outlet",
				tableName: "registers",
			});

			return register;
		},
		{
			body: t.Object({
				name: t.String({ minLength: 1, maxLength: 100 }),
			}),
		},
	)
	.post(
		"/registers/pair",
		async ({ body, set }) => {
			const [register] = await db
				.select()
				.from(registers)
				.where(eq(registers.pairingCode, body.pairingCode))
				.limit(1);

			if (!register) {
				set.status = 400;
				return { error: "Invalid pairing code" };
			}

			if (
				!register.pairingExpiresAt ||
				new Date(register.pairingExpiresAt) < new Date()
			) {
				set.status = 400;
				return { error: "Pairing code expired" };
			}

			const now = new Date().toISOString();
			await db
				.update(registers)
				.set({
					pairingCode: null,
					pairingExpiresAt: null,
					lastSeenAt: now,
					updatedAt: now,
				})
				.where(eq(registers.id, register.id));

			await recordSyncEvent({
				changedAt: now,
				operation: "update",
				rowId: register.id,
				scopeId: register.outletId,
				scopeType: "outlet",
				tableName: "registers",
			});

			const [outlet] = await db
				.select()
				.from(outlets)
				.where(eq(outlets.id, register.outletId))
				.limit(1);

			return {
				register: {
					id: register.id,
					name: register.name,
					shortId: register.shortId,
				},
				outlet: outlet ?? null,
			};
		},
		{
			body: t.Object({
				pairingCode: t.String({
					minLength: 8,
					maxLength: 8,
					pattern: "^[A-Z0-9]{8}$",
				}),
			}),
		},
	)
	.get(
		"/outlets/:outletId/registers",
		async ({ params: { outletId }, set, request }) => {
			const session = await getSessionFromRequest(request);
			if (!session) {
				set.status = 401;
				return { error: "Unauthorized" };
			}

			const hasAccess = await verifyOutletOwnership(session.userId, outletId);
			if (!hasAccess) {
				set.status = 403;
				return { error: "Forbidden" };
			}

			return db
				.select()
				.from(registers)
				.where(eq(registers.outletId, outletId));
		},
	)
	.delete("/registers/:id", async ({ params: { id }, set, request }) => {
		const session = await getSessionFromRequest(request);
		if (!session) {
			set.status = 401;
			return { error: "Unauthorized" };
		}

		const [register] = await db
			.select()
			.from(registers)
			.where(eq(registers.id, id))
			.limit(1);

		if (!register) {
			set.status = 404;
			return { error: "Register not found" };
		}

		const hasAccess = await verifyOutletOwnership(
			session.userId,
			register.outletId,
		);
		if (!hasAccess) {
			set.status = 403;
			return { error: "Forbidden" };
		}

		const now = new Date().toISOString();
		await db
			.update(registers)
			.set({ isActive: false, updatedAt: now })
			.where(eq(registers.id, id));

		await recordSyncEvent({
			changedAt: now,
			operation: "update",
			rowId: id,
			scopeId: register.outletId,
			scopeType: "outlet",
			tableName: "registers",
		});

		return { success: true };
	});
